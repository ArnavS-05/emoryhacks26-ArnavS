"""Google Gemini integration (official google-genai SDK).

Every call returns `(result, engine)` where engine is the model name on success or a
`fallback:*` label. Callers must surface the engine label so fallbacks are never presented as AI.
"""
from __future__ import annotations

import asyncio
import json
import logging
import time
from dataclasses import dataclass, field
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from ..config import get_settings
from ..schemas import (
    CopilotInsights, DocumentExtraction, EncounterDraft, QuestionInterpretation, TranslationBatch,
)

log = logging.getLogger("synaphi.gemini")
T = TypeVar("T", bound=BaseModel)

LANG_NAMES = {
    "en": "English", "es": "Spanish", "fr": "French", "hi": "Hindi", "zh": "Chinese (Simplified)",
    "ar": "Arabic", "vi": "Vietnamese", "ko": "Korean", "pt": "Portuguese", "de": "German",
}


class GeminiUnavailable(Exception):
    pass


@dataclass
class CallStat:
    ok: int = 0
    failed: int = 0
    last_ok_at: float | None = None
    last_error: str = ""
    last_latency_ms: int | None = None
    model: str = ""


@dataclass
class GeminiStatus:
    calls: dict[str, CallStat] = field(default_factory=dict)
    verified_models: dict[str, str] = field(default_factory=dict)  # model -> "ok" | error

    def record(self, op: str, model: str, ok: bool, latency_ms: int, err: str = "") -> None:
        s = self.calls.setdefault(op, CallStat())
        s.model = model
        s.last_latency_ms = latency_ms
        if ok:
            s.ok += 1
            s.last_ok_at = time.time()
        else:
            s.failed += 1
            s.last_error = err[:300]


STATUS = GeminiStatus()
_client = None


def _sanitize(err: Exception) -> str:
    """Strip anything that could resemble a credential from error text."""
    msg = f"{type(err).__name__}: {err}"
    key = get_settings().gemini_api_key
    if key:
        msg = msg.replace(key, "***")
    low = msg.lower()
    if "api key not valid" in low or "api_key_invalid" in low:
        return "Authentication failed: the configured GEMINI_API_KEY was rejected (invalid or revoked)."
    if "permission" in low and "denied" in low:
        return "Permission denied for this key/model (check API enablement and model access)."
    if "not found" in low and "model" in low:
        return "Model not found or not available to this key."
    if "429" in low or "resource_exhausted" in low or "quota" in low:
        return "Rate limited / quota exhausted."
    return msg[:300]


def configured() -> bool:
    return bool(get_settings().gemini_api_key)


def client():
    global _client
    if not configured():
        raise GeminiUnavailable("GEMINI_API_KEY not configured")
    if _client is None:
        from google import genai
        _client = genai.Client(api_key=get_settings().gemini_api_key)
    return _client


async def _structured(op: str, schema: type[T], contents, system: str, timeout: float = 20.0,
                      model: str | None = None, temperature: float = 0.2) -> tuple[T, str]:
    from google.genai import types

    m = model or get_settings().gemini_text_model
    cfg = types.GenerateContentConfig(
        system_instruction=system,
        temperature=temperature,
        response_mime_type="application/json",
        response_schema=schema,
    )
    t0 = time.perf_counter()
    last_err: Exception | None = None
    for attempt in range(2):
        try:
            resp = await asyncio.wait_for(
                client().aio.models.generate_content(model=m, contents=contents, config=cfg), timeout=timeout)
            parsed = getattr(resp, "parsed", None)
            if isinstance(parsed, schema):
                result = parsed
            else:
                raw = (resp.text or "").strip()
                if raw.startswith("```"):
                    raw = raw.strip("`").removeprefix("json").strip()
                result = schema.model_validate(json.loads(raw))
            STATUS.record(op, m, True, int((time.perf_counter() - t0) * 1000))
            return result, m
        except (json.JSONDecodeError, ValidationError) as e:
            last_err = e  # malformed output: retry once
            continue
        except asyncio.TimeoutError as e:
            last_err = TimeoutError(f"Gemini timed out after {timeout}s")
            break
        except GeminiUnavailable:
            raise
        except Exception as e:  # network, auth, quota
            last_err = e
            if "429" in str(e) and attempt == 0:
                await asyncio.sleep(1.5)
                continue
            break
    err = _sanitize(last_err) if last_err else "unknown error"
    STATUS.record(op, m, False, int((time.perf_counter() - t0) * 1000), err)
    raise GeminiUnavailable(err)


# ---------------- Operations ----------------
CLASSIFY_SYSTEM = """You support an accessible patient-communication board in a hospital.
A clinician has spoken a question to a patient who cannot speak. Interpret the clinician's
question ONLY to decide which response options to show the patient. You never answer for the patient.

intent: choose the single best label.
response_type: body_location for "where" questions about pain/symptoms; scale for "how bad / rate"
questions; yes_no for closed questions; choice when the patient should pick from phrases; free otherwise.
search_query: 3-8 English keywords to retrieve candidate patient replies from a phrase library.
categories: subset of [pain, symptoms, breathing, comfort, movement, eating_drinking, hygiene,
questions, feelings, medication, urgent, general].
simplified_question: plain language, at most 12 words, same language as the clinician.
translated_question / translated_simplified: the question and simplified version in the patient's
language (copy the originals if the languages are the same).
confidence: your certainty in the intent. needs_clarification: true if the question is ambiguous
or contains multiple questions."""


async def classify_question(text: str, clinician_lang: str, patient_lang: str) -> tuple[QuestionInterpretation, str]:
    prompt = (f"Clinician language: {LANG_NAMES.get(clinician_lang, clinician_lang)}\n"
              f"Patient language: {LANG_NAMES.get(patient_lang, patient_lang)}\n"
              f"Clinician said: \"{text}\"")
    return await _structured("classify_question", QuestionInterpretation, prompt, CLASSIFY_SYSTEM, timeout=12)


async def translate_batch(texts: list[str], src: str, tgt: str) -> tuple[list[str], str]:
    if src == tgt or not texts:
        return texts, "none"
    system = ("Translate short patient-communication phrases faithfully. Preserve meaning exactly; do not add, "
              "soften, or embellish. Return translations in the same order and count.")
    prompt = (f"From {LANG_NAMES.get(src, src)} to {LANG_NAMES.get(tgt, tgt)}:\n" +
              json.dumps(texts, ensure_ascii=False))
    out, model = await _structured("translate", TranslationBatch, prompt, system, timeout=12, temperature=0)
    if len(out.translations) != len(texts):
        raise GeminiUnavailable("Translation count mismatch")
    return out.translations, model


EXTRACT_SYSTEM = """Extract structured medical information from a (synthetic) medical document image or PDF.
Only extract what is explicitly written. Never infer diagnoses or add medications not present.
For every field include source_excerpt: the verbatim supporting text. Use confidence < 0.6 for
hard-to-read or ambiguous items and add a warning. kinds: medication (name + dose/frequency in detail),
allergy (allergen + reaction in detail), condition (diagnosed condition listed), history (procedures,
past events)."""


async def extract_document(data: bytes, mime: str) -> tuple[DocumentExtraction, str]:
    from google.genai import types
    contents = [types.Part.from_bytes(data=data, mime_type=mime),
                "Extract the medical fields from this document."]
    return await _structured("extract_document", DocumentExtraction, contents, EXTRACT_SYSTEM, timeout=45)


COPILOT_SYSTEM = """You are a clinical documentation assistant supporting a licensed clinician.
Inputs: patient-confirmed statements (the patient explicitly selected and confirmed these through an
AAC interface) and clinician-verified medical records.
Rules:
- Use ONLY the provided information. Never invent symptoms, history, or statements.
- Do not diagnose, do not prescribe, do not produce a treatment plan.
- general_considerations: general, clearly-attributed considerations for professional review
  (e.g. "Consider asking about...", "Verified record lists X; confirm current use"). Each must cite its basis.
- possible_inconsistencies: conflicts between confirmed statements and verified records.
- suggested_follow_up_questions: short, answerable by yes/no or choices where possible (the patient uses AAC).
- missing_information: important context not yet recorded (e.g. pain onset, allergies unknown)."""


async def copilot(context: dict) -> tuple[CopilotInsights, str]:
    prompt = json.dumps(context, ensure_ascii=False, default=str)
    return await _structured("copilot", CopilotInsights, prompt, COPILOT_SYSTEM, timeout=30)


SUMMARY_SYSTEM = """Draft an AI-assisted clinical encounter note for clinician review and editing.
Use ONLY the provided patient-confirmed statements, clinician questions, and verified records.
Quote patient-confirmed statements faithfully. Do not diagnose, prescribe, or state a treatment plan.
clinician_observations: leave empty unless clinician observations are provided.
accessibility_methods_used: list the input methods actually used (provided)."""


async def encounter_draft(context: dict) -> tuple[EncounterDraft, str]:
    prompt = json.dumps(context, ensure_ascii=False, default=str)
    return await _structured("encounter_draft", EncounterDraft, prompt, SUMMARY_SYSTEM, timeout=30)


async def embed(texts: list[str]) -> list[list[float]]:
    from google.genai import types
    s = get_settings()
    t0 = time.perf_counter()
    try:
        resp = await asyncio.wait_for(client().aio.models.embed_content(
            model=s.gemini_embedding_model, contents=texts,
            config=types.EmbedContentConfig(output_dimensionality=768)), timeout=30)
        STATUS.record("embed", s.gemini_embedding_model, True, int((time.perf_counter() - t0) * 1000))
        return [e.values for e in resp.embeddings]
    except Exception as e:
        err = _sanitize(e)
        STATUS.record("embed", s.gemini_embedding_model, False, int((time.perf_counter() - t0) * 1000), err)
        raise GeminiUnavailable(err) from e


async def verify_models() -> dict[str, str]:
    """Make one real minimal call per configured model and record the outcome."""
    s = get_settings()
    out: dict[str, str] = {}
    if not configured():
        return {"_": "GEMINI_API_KEY not configured"}
    try:
        t0 = time.perf_counter()
        r = await asyncio.wait_for(client().aio.models.generate_content(
            model=s.gemini_text_model, contents="Reply with the single word: ready"), timeout=20)
        out[s.gemini_text_model] = f"ok ({int((time.perf_counter() - t0) * 1000)} ms): {(r.text or '').strip()[:20]}"
    except Exception as e:
        out[s.gemini_text_model] = _sanitize(e)
    try:
        await embed(["verification"])
        out[s.gemini_embedding_model] = "ok"
    except Exception as e:
        out[s.gemini_embedding_model] = str(e)
    out[s.gemini_live_model] = await verify_live()
    STATUS.verified_models = out
    return out


async def verify_live() -> str:
    """Open a real Live API session and exchange one text turn."""
    from google.genai import types
    s = get_settings()
    try:
        cfg = types.LiveConnectConfig(response_modalities=["TEXT"])
        async def _run() -> str:
            async with client().aio.live.connect(model=s.gemini_live_model, config=cfg) as session:
                await session.send_client_content(
                    turns=types.Content(role="user", parts=[types.Part(text="Reply with the word: ready")]),
                    turn_complete=True)
                chunks: list[str] = []
                async for msg in session.receive():
                    if msg.text:
                        chunks.append(msg.text)
                    if msg.server_content and msg.server_content.turn_complete:
                        break
                return "".join(chunks)
        text = await asyncio.wait_for(_run(), timeout=20)
        return f"ok (live session): {text.strip()[:20]}"
    except Exception as e:
        return _sanitize(e)
