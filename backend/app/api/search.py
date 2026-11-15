from __future__ import annotations

from fastapi import APIRouter, Depends

from ..schemas import SearchIn
from ..security import Principal, rate_limit, require_clinician
from ..services import typesense_service as ts

router = APIRouter(prefix="/api/search", tags=["search"])


@router.post("/phrases", dependencies=[Depends(rate_limit("search", 120))])
async def search_phrases(body: SearchIn, p: Principal = Depends(require_clinician)):
    return await ts.search_phrases(body.q, intent=body.intent, categories=body.categories,
                                   response_types=body.response_types, mode=body.mode, limit=body.limit)


@router.post("/compare", dependencies=[Depends(rate_limit("search", 120))])
async def compare(body: SearchIn, p: Principal = Depends(require_clinician)):
    """Run the same query as keyword-only and hybrid (keyword + vector) for side-by-side inspection."""
    kw = await ts.search_phrases(body.q, intent=body.intent, categories=body.categories,
                                 response_types=body.response_types, mode="keyword", limit=body.limit)
    hy = await ts.search_phrases(body.q, intent=body.intent, categories=body.categories,
                                 response_types=body.response_types, mode="hybrid", limit=body.limit)
    return {"keyword": kw, "hybrid": hy, "state": {k: ts.STATE[k] for k in ("connected", "embedding_mode", "indexed_phrases")}}


@router.get("/phrases/all")
def all_phrases(p: Principal = Depends(require_clinician)):
    """Full phrase library — used by the static-board benchmark baseline."""
    from ..services.phrases import PHRASES
    return PHRASES


@router.post("/benchmark-options", dependencies=[Depends(rate_limit("search", 120))])
async def benchmark_options(body: dict, p: Principal = Depends(require_clinician)):
    """Real interpretation + retrieval for a benchmark question (same pipeline as live sessions)."""
    import time
    from ..services import fallback, gemini_service
    question = str(body.get("question", ""))[:300]
    t0 = time.perf_counter()
    try:
        interp, engine = await gemini_service.classify_question(question, "en", "en")
    except gemini_service.GeminiUnavailable:
        interp, engine = fallback.classify(question)
    classify_ms = round((time.perf_counter() - t0) * 1000)
    rtype = interp.response_type.value
    t1 = time.perf_counter()
    res = await ts.search_phrases(interp.search_query, intent="pain_location" if rtype == "body_location" else interp.intent.value,
                                  categories=interp.categories, response_types=["location"] if rtype == "body_location" else [],
                                  mode="hybrid", limit=8)
    return {"engine": engine, "search_engine": res["engine"], "classify_ms": classify_ms,
            "retrieval_ms": round((time.perf_counter() - t1) * 1000, 1), "search_time_ms": res.get("search_time_ms"),
            "intent": interp.intent.value, "options": [{"id": d["id"], "text": d["text"], "pictogram_id": d.get("pictogram_id")} for d in res["results"]]}
