"""Typesense Cloud: Context-Aware Accessible Search.

Admin operations (collection creation, indexing) happen only here on the backend.
Search results are re-ranked with an explicit, inspectable scoring breakdown.
"""
from __future__ import annotations

import difflib
import logging
import re
import time
from typing import Any

from ..config import get_settings
from . import gemini_service
from .phrases import PHRASES, PHRASES_BY_ID

log = logging.getLogger("synaphi.typesense")

PHRASE_COLLECTION = "communication_phrases"
CONTEXT_COLLECTION = "patient_context"
AUTO_EMBED_MODEL = "ts/all-MiniLM-L12-v2"

STATE: dict[str, Any] = {
    "connected": False,
    "embedding_mode": "none",  # auto:<model> | gemini:<model> | none
    "indexed_phrases": 0,
    "last_error": "",
    "synonym_sets": False,
    "server_version": "",
}

SYNONYM_GROUPS = [
    ["stomach", "belly", "abdomen", "tummy", "gut"],
    ["breathe", "breathing", "breath", "respiration"],
    ["toilet", "bathroom", "restroom", "loo", "bedpan"],
    ["medicine", "medication", "pill", "tablet", "drug"],
    ["pain", "hurt", "ache", "sore", "discomfort"],
    ["nurse", "staff", "carer", "caregiver"],
    ["dizzy", "lightheaded", "faint", "vertigo"],
    ["scared", "afraid", "frightened", "anxious", "worried"],
]

_client = None


def configured() -> bool:
    s = get_settings()
    return bool(s.typesense_host and s.typesense_admin_api_key)


def client():
    global _client
    if _client is None:
        import typesense
        s = get_settings()
        _client = typesense.Client({
            "nodes": [{"host": s.typesense_host, "port": s.typesense_port, "protocol": s.typesense_protocol}],
            "api_key": s.typesense_admin_api_key,
            "connection_timeout_seconds": 8,
            "num_retries": 2,
        })
    return _client


def _phrase_fields(embed: dict | None) -> list[dict]:
    fields = [
        {"name": "text", "type": "string"},
        {"name": "language", "type": "string", "facet": True},
        {"name": "category", "type": "string", "facet": True},
        {"name": "synonyms", "type": "string[]"},
        {"name": "intent_tags", "type": "string[]", "facet": True},
        {"name": "anatomical_region", "type": "string", "facet": True},
        {"name": "response_type", "type": "string", "facet": True},
        {"name": "pictogram_id", "type": "string", "index": False, "optional": True},
        {"name": "safety_priority", "type": "int32"},
    ]
    if embed:
        fields.append(embed)
    return fields


def _ensure_phrase_collection(c, force: bool) -> None:
    existing = {col["name"]: col for col in c.collections.retrieve()}
    if PHRASE_COLLECTION in existing and not force:
        col = existing[PHRASE_COLLECTION]
        emb = next((f for f in col["fields"] if f["name"] == "embedding"), None)
        if emb and emb.get("embed"):
            STATE["embedding_mode"] = f"auto:{emb['embed']['model_config']['model_name']}"
        elif emb:
            STATE["embedding_mode"] = f"gemini:{get_settings().gemini_embedding_model}"
        STATE["indexed_phrases"] = col.get("num_documents", 0)
        return
    if PHRASE_COLLECTION in existing:
        c.collections[PHRASE_COLLECTION].delete()

    attempts: list[tuple[str, dict | None]] = [
        (f"auto:{AUTO_EMBED_MODEL}", {"name": "embedding", "type": "float[]",
                                      "embed": {"from": ["text", "synonyms"],
                                                "model_config": {"model_name": AUTO_EMBED_MODEL}}}),
    ]
    if gemini_service.configured():
        attempts.append((f"gemini:{get_settings().gemini_embedding_model}",
                         {"name": "embedding", "type": "float[]", "num_dim": 768, "optional": True}))
    attempts.append(("none", None))

    for mode, emb in attempts:
        try:
            c.collections.create({"name": PHRASE_COLLECTION, "fields": _phrase_fields(emb),
                                  "default_sorting_field": "safety_priority"})
            STATE["embedding_mode"] = mode
            log.info("created %s with embedding mode %s", PHRASE_COLLECTION, mode)
            return
        except Exception as e:  # e.g. built-in models unavailable on this cluster
            STATE["last_error"] = f"{mode}: {str(e)[:200]}"
            log.warning("collection create (%s) failed: %s", mode, e)
    raise RuntimeError("Could not create phrase collection")


async def _index_phrases(c) -> int:
    docs = [dict(p) for p in PHRASES]
    if STATE["embedding_mode"].startswith("gemini:"):
        try:
            vecs = await gemini_service.embed([f"{d['text']}. {', '.join(d['synonyms'])}" for d in docs])
            for d, v in zip(docs, vecs):
                d["embedding"] = v
        except Exception as e:
            STATE["last_error"] = f"gemini embeddings: {e}"
    res = c.collections[PHRASE_COLLECTION].documents.import_(docs, {"action": "upsert"})
    ok = sum(1 for r in res if r.get("success"))
    failures = [r for r in res if not r.get("success")]
    if failures:
        STATE["last_error"] = f"import failures: {str(failures[0])[:200]}"
    STATE["indexed_phrases"] = ok
    return ok


def _ensure_synonyms(c) -> None:
    # Typesense v30+ synonym sets; fall back to per-collection synonyms on older servers.
    items = [{"id": f"syn-{g[0]}", "synonyms": g} for g in SYNONYM_GROUPS]
    try:
        c.synonym_sets["synaphi-medical"].upsert({"items": items})
        c.collections[PHRASE_COLLECTION].update({"synonym_sets": ["synaphi-medical"]})
        STATE["synonym_sets"] = "synonym_set:synaphi-medical"
        return
    except Exception as e:
        log.info("synonym_sets unavailable (%s); trying legacy synonyms", e)
    try:
        for it in items:
            c.collections[PHRASE_COLLECTION].synonyms.upsert(it["id"], {"synonyms": it["synonyms"]})
        STATE["synonym_sets"] = "collection_synonyms"
    except Exception as e:
        STATE["last_error"] = f"synonyms: {str(e)[:200]}"


def _ensure_context_collection(c) -> None:
    names = {col["name"] for col in c.collections.retrieve()}
    if CONTEXT_COLLECTION in names:
        return
    c.collections.create({"name": CONTEXT_COLLECTION, "fields": [
        {"name": "patient_id", "type": "string", "facet": True},
        {"name": "kind", "type": "string", "facet": True},
        {"name": "label", "type": "string"},
        {"name": "detail", "type": "string", "optional": True},
        {"name": "source", "type": "string", "facet": True},
        {"name": "created_ts", "type": "int64"},
    ], "default_sorting_field": "created_ts"})


async def bootstrap(force: bool = False) -> dict:
    if not configured():
        STATE.update(connected=False, last_error="Typesense not configured — using local fallback search")
        return STATE
    try:
        c = client()
        try:
            STATE["server_version"] = str(c.debug.retrieve().get("version", ""))
        except Exception:
            pass
        _ensure_phrase_collection(c, force)
        if force or STATE["indexed_phrases"] < len(PHRASES):
            await _index_phrases(c)
        _ensure_synonyms(c)
        _ensure_context_collection(c)
        STATE["connected"] = True
    except Exception as e:
        STATE.update(connected=False, last_error=str(e)[:300])
        log.error("Typesense bootstrap failed: %s", e)
    return STATE


# ---------------- Search ----------------
def _filter(categories: list[str], response_types: list[str], intent: str | None, language: str = "en") -> str:
    parts = [f"language:={language}"]
    ors = []
    if categories:
        ors.append(f"category:=[{','.join(categories)}]")
    if intent and intent not in {"unclear", "general"}:
        ors.append(f"intent_tags:=[{intent}]")
    if ors:
        parts.append("(" + " || ".join(ors) + ")")
    if response_types:
        parts.append(f"response_type:=[{','.join(response_types)}]")
    return " && ".join(parts)


def _rerank(hits: list[dict], intent: str | None, preferred: list[str], categories: list[str]) -> list[dict]:
    n = max(len(hits), 1)
    out = []
    for rank, h in enumerate(hits):
        doc = h["document"]
        base = 1.0 - rank / n  # position from Typesense (text match / hybrid fusion)
        b_intent = 0.35 if intent and intent in doc.get("intent_tags", []) else 0.0
        b_cat = 0.15 if doc.get("category") in categories else 0.0
        b_pref = 0.15 if doc.get("category") in preferred else 0.0
        b_safety = 0.02 * doc.get("safety_priority", 0)
        score = base + b_intent + b_cat + b_pref + b_safety
        out.append({
            **{k: v for k, v in doc.items() if k != "embedding"},
            "score": round(score, 4),
            "ranking": {
                "typesense_rank": rank + 1,
                "text_match": h.get("text_match"),
                "vector_distance": h.get("vector_distance"),
                "hybrid_score": (h.get("hybrid_search_info") or {}).get("rank_fusion_score"),
                "base": round(base, 3), "intent_boost": b_intent, "category_boost": b_cat,
                "preference_boost": b_pref, "safety_boost": round(b_safety, 3),
            },
        })
    out.sort(key=lambda d: d["score"], reverse=True)
    return out


async def search_phrases(q: str, *, intent: str | None = None, categories: list[str] | None = None,
                         response_types: list[str] | None = None, preferred: list[str] | None = None,
                         mode: str = "hybrid", limit: int = 8) -> dict:
    categories = categories or []
    response_types = response_types or []
    preferred = preferred or []
    t0 = time.perf_counter()
    filter_by = _filter(categories, response_types, intent)
    if not (configured() and STATE["connected"]):
        hits = _local_search(q, intent, categories, response_types)
        results = _rerank(hits, intent, preferred, categories)[:limit]
        return {"engine": "fallback:local", "query": q, "filter_by": filter_by, "mode": "keyword",
                "results": results, "found": len(hits), "search_time_ms": None,
                "round_trip_ms": round((time.perf_counter() - t0) * 1000, 1), "facets": []}

    params: dict[str, Any] = {
        "collection": PHRASE_COLLECTION,
        "q": q or "*",
        "query_by": "text,synonyms,intent_tags,category",
        "query_by_weights": "4,3,2,1",
        "filter_by": filter_by,
        "num_typos": 2,
        "prefix": "true",
        "facet_by": "category,response_type",
        "per_page": 30,
        "exclude_fields": "embedding",
        "drop_tokens_threshold": 3,
    }
    use_vector = mode == "hybrid" and STATE["embedding_mode"] != "none" and q.strip()
    if use_vector:
        if STATE["embedding_mode"].startswith("auto:"):
            params["query_by"] += ",embedding"
            params["query_by_weights"] += ",1"
            params["vector_query"] = "embedding:([], alpha: 0.35, k: 60)"
        else:
            try:
                vec = (await gemini_service.embed([q]))[0]
                params["vector_query"] = f"embedding:([{','.join(f'{x:.6f}' for x in vec)}], k: 60, alpha: 0.35)"
            except Exception:
                use_vector = False
    if not use_vector:
        params["sort_by"] = "_text_match:desc,safety_priority:desc"
    try:
        res = client().multi_search.perform({"searches": [params]}, {})["results"][0]
        if "error" in res:
            raise RuntimeError(res["error"])
    except Exception as e:
        STATE["last_error"] = str(e)[:300]
        hits = _local_search(q, intent, categories, response_types)
        return {"engine": "fallback:local", "error": "Typesense query failed; using local fallback",
                "query": q, "filter_by": filter_by, "mode": "keyword",
                "results": _rerank(hits, intent, preferred, categories)[:limit], "found": len(hits),
                "search_time_ms": None, "round_trip_ms": round((time.perf_counter() - t0) * 1000, 1), "facets": []}
    hits = res.get("hits", [])
    return {
        "engine": "typesense", "query": q, "filter_by": filter_by,
        "mode": "hybrid" if use_vector else "keyword",
        "embedding_mode": STATE["embedding_mode"] if use_vector else None,
        "results": _rerank(hits, intent, preferred, categories)[:limit],
        "found": res.get("found", 0), "search_time_ms": res.get("search_time_ms"),
        "round_trip_ms": round((time.perf_counter() - t0) * 1000, 1),
        "facets": [{"field": f["field_name"], "counts": [{"value": c["value"], "count": c["count"]} for c in f["counts"]]}
                   for f in res.get("facet_counts", [])],
    }


def _local_search(q: str, intent: str | None, categories: list[str], response_types: list[str]) -> list[dict]:
    words = [w for w in re.findall(r"[a-z]+", q.lower()) if len(w) > 2]
    scored = []
    for p in PHRASES:
        if response_types and p["response_type"] not in response_types:
            continue
        in_scope = (not categories and not intent) or p["category"] in categories or (intent and intent in p["intent_tags"])
        if not in_scope:
            continue
        hay = " ".join([p["text"], *p["synonyms"], *p["intent_tags"], p["category"]]).lower().split()
        s = 0.0
        for w in words:
            best = max((difflib.SequenceMatcher(None, w, h).ratio() for h in hay), default=0)
            s += best if best > 0.75 else 0
        scored.append((s, p["safety_priority"], p))
    scored.sort(key=lambda t: (t[0], t[1]), reverse=True)
    return [{"document": p, "text_match": round(s, 3)} for s, _, p in scored]


# ---------------- Patient context (verified records only) ----------------
def index_context(doc: dict) -> bool:
    if not (configured() and STATE["connected"]):
        return False
    try:
        client().collections[CONTEXT_COLLECTION].documents.upsert(doc)
        return True
    except Exception as e:
        STATE["last_error"] = f"context index: {str(e)[:200]}"
        return False


def remove_context(doc_id: str) -> None:
    if configured() and STATE["connected"]:
        try:
            client().collections[CONTEXT_COLLECTION].documents[doc_id].delete()
        except Exception:
            pass


def search_context(patient_id: str, q: str, limit: int = 10) -> dict | None:
    if not (configured() and STATE["connected"]):
        return None
    t0 = time.perf_counter()
    safe_pid = re.sub(r"[^a-f0-9]", "", patient_id)
    res = client().collections[CONTEXT_COLLECTION].documents.search({
        "q": q or "*", "query_by": "label,detail,kind", "filter_by": f"patient_id:={safe_pid}",
        "num_typos": 2, "prefix": "true", "per_page": limit, "facet_by": "kind",
        "sort_by": "_text_match:desc,created_ts:desc",
    })
    return {"engine": "typesense", "results": [h["document"] for h in res.get("hits", [])],
            "search_time_ms": res.get("search_time_ms"), "round_trip_ms": round((time.perf_counter() - t0) * 1000, 1)}


def phrase(pid: str) -> dict | None:
    return PHRASES_BY_ID.get(pid)
