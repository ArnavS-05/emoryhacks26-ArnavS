from __future__ import annotations

import json
import secrets
import time
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import SessionLocal, get_db
from ..models import (
    CareSession, ClinicalNoteDraft, ConfirmedMessage, ConversationTurn, InteractionEvent, Patient,
    VerifiedMedicalContext,
)
from ..schemas import ComposeTranslateIn, ConfirmIn, HelpIn, NoteUpdate, QuestionIn, SessionCreate
from ..security import (
    Principal, audit, current_principal, decode_token, rate_limit, require_clinician, require_session_access,
)
from ..serializers import accessibility, message, patient_brief, patient_for_patient_view, session as ser_session, turn
from ..services import fallback, gemini_service, typesense_service as ts
from ..services.phrases import PHRASES_BY_ID
from ..websocket.hub import hub

router = APIRouter(prefix="/api/sessions", tags=["sessions"])
ws_router = APIRouter()

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"


def _code(db: Session) -> str:
    while True:
        c = "".join(secrets.choice(CODE_ALPHABET) for _ in range(6))
        if not db.scalar(select(CareSession).where(CareSession.join_code == c)):
            return c


def _session(db: Session, sid: str, p: Principal) -> CareSession:
    require_session_access(sid, p)
    s = db.get(CareSession, sid)
    if not s:
        raise HTTPException(404, "Session not found")
    return s


def create_session(db: Session, patient: Patient, clinician: str, lang: str = "en", demo: bool = False) -> CareSession:
    s = CareSession(patient_id=patient.id, clinician_name=clinician, clinician_language=lang,
                    join_code=_code(db), is_demo=demo)
    db.add(s)
    return s


@router.get("")
def list_sessions(db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    rows = db.execute(select(CareSession, Patient).join(Patient, Patient.id == CareSession.patient_id)
                      .order_by(CareSession.started_at.desc()).limit(50)).all()
    return [ser_session(s, pt) for s, pt in rows]


@router.post("", status_code=201)
def start_session(body: SessionCreate, db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    patient = db.get(Patient, body.patient_id)
    if not patient:
        raise HTTPException(404, "Patient not found")
    s = create_session(db, patient, p.name, body.clinician_language)
    db.flush()
    audit(db, p, "session_started", resource=f"session:{s.id}", patient=patient.id)
    db.commit()
    return ser_session(s, patient)


@router.get("/{sid}")
def session_state(sid: str, db: Session = Depends(get_db), p: Principal = Depends(current_principal)):
    s = _session(db, sid, p)
    patient = db.get(Patient, s.patient_id)
    turns = db.scalars(select(ConversationTurn).where(ConversationTurn.session_id == sid)
                       .order_by(ConversationTurn.created_at)).all()
    msgs = db.scalars(select(ConfirmedMessage).where(ConfirmedMessage.session_id == sid)
                      .order_by(ConfirmedMessage.confirmed_at)).all()
    out = {"session": ser_session(s, patient), "turns": [turn(t) for t in turns],
           "messages": [message(m) for m in msgs], "presence": hub.presence(sid)}
    if p.role == "clinician":
        note = db.scalar(select(ClinicalNoteDraft).where(ClinicalNoteDraft.session_id == sid)
                         .order_by(ClinicalNoteDraft.updated_at.desc()))
        out["patient"] = {**patient_brief(patient), "accessibility": accessibility(patient.accessibility)}
        out["note"] = _note(note) if note else None
    else:
        out["patient"] = patient_for_patient_view(patient)
    return out


async def _options(interp, acc, patient_lang: str, clinician_lang: str) -> tuple[list[dict], dict, str]:
    rtype = interp.response_type.value
    search_meta: dict = {}
    if rtype == "yes_no":
        docs = [dict(PHRASES_BY_ID[i], score=None) for i in ("gc-yes", "gc-no", "gc-unsure")]
        search_meta = {"engine": "fixed:yes_no", "results": len(docs)}
    elif rtype == "scale":
        docs = []
        search_meta = {"engine": "fixed:scale"}
    else:
        rts = ["location"] if rtype == "body_location" else []
        intent = "pain_location" if rtype == "body_location" else interp.intent.value
        limit = 12 if rtype == "body_location" else max(4, acc.max_choices)
        res = await ts.search_phrases(interp.search_query, intent=intent, categories=interp.categories,
                                      response_types=rts, preferred=acc.preferred_categories or [],
                                      mode="hybrid", limit=limit)
        docs = res["results"]
        search_meta = {k: res.get(k) for k in ("engine", "mode", "filter_by", "found", "search_time_ms",
                                                 "round_trip_ms", "query", "embedding_mode")}
    opts = [{"id": d["id"], "text": d["text"], "label": d["text"], "clinician_label": d["text"],
             "pictogram_id": d.get("pictogram_id"), "category": d.get("category"),
             "anatomical_region": d.get("anatomical_region"), "response_type": d.get("response_type"),
             "score": d.get("score")} for d in docs]
    t_engine = "none"
    if opts and patient_lang != "en":
        try:
            labels, t_engine = await gemini_service.translate_batch([o["text"] for o in opts], "en", patient_lang)
            for o, l in zip(opts, labels):
                o["label"] = l
        except gemini_service.GeminiUnavailable:
            t_engine = "unavailable"
    if opts and clinician_lang != "en":
        try:
            labels, _ = await gemini_service.translate_batch([o["text"] for o in opts], "en", clinician_lang)
            for o, l in zip(opts, labels):
                o["clinician_label"] = l
        except gemini_service.GeminiUnavailable:
            pass
    return opts, search_meta, t_engine


@router.post("/{sid}/questions", dependencies=[Depends(rate_limit("question", 40))])
async def ask_question(sid: str, body: QuestionIn, db: Session = Depends(get_db),
                       p: Principal = Depends(require_clinician)):
    s = _session(db, sid, p)
    if s.status != "active":
        raise HTTPException(409, "Session has ended")
    patient = db.get(Patient, s.patient_id)
    acc = patient.accessibility
    t0 = time.perf_counter()
    ai_error = ""
    try:
        interp, engine = await gemini_service.classify_question(body.text, s.clinician_language, acc.language)
    except gemini_service.GeminiUnavailable as e:
        interp, engine = fallback.classify(body.text)
        ai_error = str(e)
    classify_ms = round((time.perf_counter() - t0) * 1000)
    opts, search_meta, t_engine = await _options(interp, acc, acc.language, s.clinician_language)

    same_lang = acc.language == s.clinician_language
    translated = interp.translated_question if not same_lang and not engine.startswith("fallback") else ""
    t = ConversationTurn(
        session_id=sid, speaker="clinician", original_text=body.text, original_language=s.clinician_language,
        translated_text=translated or "", translated_language=acc.language if translated else "",
        simplified_text=(interp.translated_simplified if translated else interp.simplified_question) or "",
        intent={**interp.model_dump(mode="json"), "classify_ms": classify_ms, "source": body.source,
                "ai_error": ai_error, "search": search_meta, "option_translation": t_engine,
                "translation_unavailable": (not same_lang and not translated)},
        options=opts, ai_engine=engine,
    )
    db.add(t)
    audit(db, p, "question_asked", resource=f"session:{sid}", engine=engine)
    db.commit()
    payload = turn(t)
    await hub.broadcast(sid, "question", payload)
    return payload


@router.post("/{sid}/translate", dependencies=[Depends(rate_limit("translate", 60))])
async def translate(sid: str, body: ComposeTranslateIn, db: Session = Depends(get_db),
                    p: Principal = Depends(current_principal)):
    _session(db, sid, p)
    try:
        out, engine = await gemini_service.translate_batch(body.texts, body.source_language, body.target_language)
        return {"translations": out, "engine": engine}
    except gemini_service.GeminiUnavailable as e:
        return {"translations": None, "engine": "unavailable", "error": str(e)}


@router.post("/{sid}/messages", status_code=201)
async def confirm_message(sid: str, body: ConfirmIn, db: Session = Depends(get_db),
                          p: Principal = Depends(current_principal)):
    """Only the patient (or clinician acting as patient proxy in demo) can confirm a message."""
    s = _session(db, sid, p)
    if p.role != "patient" and not s.is_demo:
        raise HTTPException(403, "Only the patient can confirm their own message")
    patient = db.get(Patient, s.patient_id)
    m = ConfirmedMessage(session_id=sid, turn_id=body.turn_id, patient_text=body.patient_text,
                         patient_language=body.patient_language, clinician_text=body.clinician_text,
                         clinician_language=s.clinician_language,
                         translation_engine="template" if body.patient_language != s.clinician_language else "none",
                         selections=[x.model_dump() for x in body.selections], input_mode=body.input_mode,
                         composition_ms=body.composition_ms)
    db.add(m)
    db.add(ConversationTurn(session_id=sid, speaker="patient", original_text=body.patient_text,
                            original_language=body.patient_language, translated_text=body.clinician_text,
                            translated_language=s.clinician_language, ai_engine="patient-confirmed"))
    db.add(InteractionEvent(patient_id=patient.id, session_id=sid, input_mode=body.input_mode,
                            event_type="message_confirmed", response_latency_ms=body.composition_ms,
                            selection_success=True, calibration_version=patient.accessibility.calibration_version,
                            context={"selections": len(body.selections)}))
    audit(db, p, "message_confirmed", resource=f"session:{sid}")
    db.commit()
    payload = message(m)
    await hub.broadcast(sid, "message_confirmed", payload)
    return payload


@router.post("/{sid}/help", status_code=201)
async def request_help(sid: str, body: HelpIn, db: Session = Depends(get_db), p: Principal = Depends(current_principal)):
    """Urgent help. Deliberately independent of Gemini/Typesense."""
    s = _session(db, sid, p)
    patient = db.get(Patient, s.patient_id)
    m = ConfirmedMessage(session_id=sid, patient_text="I need help now", patient_language="en",
                         clinician_text="I need help now", clinician_language=s.clinician_language,
                         input_mode=body.input_mode, is_urgent=True, selections=[{"step": "help", "label": "Help"}])
    db.add(m)
    db.add(InteractionEvent(patient_id=patient.id, session_id=sid, input_mode=body.input_mode,
                            event_type="help_requested", selection_success=True,
                            calibration_version=patient.accessibility.calibration_version))
    audit(db, p, "help_requested", resource=f"session:{sid}")
    db.commit()
    payload = message(m)
    await hub.broadcast(sid, "help", payload)
    return payload


@router.post("/{sid}/pair", dependencies=[Depends(rate_limit("pair", 20))])
def pair_link(sid: str, db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    """Issue a single-use pairing link (valid 10 minutes) for a separate patient device."""
    import hashlib
    from datetime import timedelta
    from ..models import PairingToken
    s = _session(db, sid, p)
    if s.status != "active":
        raise HTTPException(409, "Session has ended")
    raw = secrets.token_urlsafe(24)
    expires = datetime.now(timezone.utc) + timedelta(minutes=10)
    db.add(PairingToken(token_hash=hashlib.sha256(raw.encode()).hexdigest(), session_id=sid, expires_at=expires))
    audit(db, p, "pairing_link_issued", resource=f"session:{sid}")
    db.commit()
    return {"path": f"/pair#{raw}", "expires_at": expires, "join_code": s.join_code}


@router.post("/{sid}/end")
async def end_session(sid: str, db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    s = _session(db, sid, p)
    s.status = "completed"
    s.ended_at = datetime.now(timezone.utc)
    audit(db, p, "session_ended", resource=f"session:{sid}")
    db.commit()
    await hub.broadcast(sid, "session_ended", {"id": sid})
    return ser_session(s)


# ---------------- Clinician copilot & encounter draft ----------------
def _clinical_context(db: Session, s: CareSession) -> dict:
    patient = db.get(Patient, s.patient_id)
    verified = db.scalars(select(VerifiedMedicalContext).where(VerifiedMedicalContext.patient_id == s.patient_id,
                                                               VerifiedMedicalContext.status == "verified")).all()
    turns = db.scalars(select(ConversationTurn).where(ConversationTurn.session_id == s.id)
                       .order_by(ConversationTurn.created_at)).all()
    msgs = db.scalars(select(ConfirmedMessage).where(ConfirmedMessage.session_id == s.id)
                      .order_by(ConfirmedMessage.confirmed_at)).all()
    return {
        "patient": {"age": patient.age, "communication_abilities": patient.profile.communication_abilities if patient.profile else []},
        "verified_records": [{"kind": v.kind, "label": v.label, "detail": v.detail, "source": v.source_type} for v in verified],
        "conversation": [{"speaker": t.speaker, "text": t.translated_text if t.speaker == "patient" else t.original_text}
                         for t in turns],
        "patient_confirmed_statements": [{"text": m.clinician_text, "urgent": m.is_urgent, "input_mode": m.input_mode}
                                         for m in msgs],
        "accessibility_methods_used": sorted({m.input_mode for m in msgs}),
    }


def _fallback_copilot(ctx: dict) -> dict:
    stmts = [m["text"] for m in ctx["patient_confirmed_statements"]]
    kinds = {r["kind"] for r in ctx["verified_records"]}
    missing = []
    if "allergy" not in kinds:
        missing.append("No verified allergy information on record.")
    if "medication" not in kinds:
        missing.append("No verified medication list on record.")
    joined = " ".join(stmts).lower()
    follow = []
    if "pain" in joined and "out of 10" not in joined:
        missing.append("Pain intensity not yet reported.")
        follow.append("How bad is the pain from 0 to 10?")
    if "pain" in joined:
        follow += ["When did the pain start?", "Is the pain getting worse?"]
    return {
        "patient_confirmed_concerns": stmts,
        "relevant_verified_history": [f"{r['kind']}: {r['label']}" + (f" ({r['detail']})" if r["detail"] else "")
                                      for r in ctx["verified_records"]],
        "possible_inconsistencies": [],
        "suggested_follow_up_questions": follow or ["Is there anything else bothering you?"],
        "missing_information": missing,
        "general_considerations": [],
    }


@router.post("/{sid}/copilot", dependencies=[Depends(rate_limit("copilot", 20))])
async def copilot(sid: str, db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    s = _session(db, sid, p)
    ctx = _clinical_context(db, s)
    try:
        res, engine = await gemini_service.copilot(ctx)
        data = res.model_dump()
        error = ""
    except gemini_service.GeminiUnavailable as e:
        data, engine, error = _fallback_copilot(ctx), "fallback:rules", str(e)
    audit(db, p, "copilot_generated", resource=f"session:{sid}", engine=engine)
    db.commit()
    return {"insights": data, "engine": engine, "error": error,
            "disclaimer": "AI-assisted suggestions for clinician review. Not a diagnosis or treatment plan."}


def _note(n: ClinicalNoteDraft) -> dict:
    return {"id": n.id, "session_id": n.session_id, "content": n.content, "engine": n.engine, "status": n.status,
            "approved_by": n.approved_by, "updated_at": n.updated_at}


@router.post("/{sid}/summary", dependencies=[Depends(rate_limit("summary", 20))])
async def draft_summary(sid: str, db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    s = _session(db, sid, p)
    ctx = _clinical_context(db, s)
    try:
        res, engine = await gemini_service.encounter_draft(ctx)
        content = res.model_dump()
    except gemini_service.GeminiUnavailable:
        engine = "fallback:template"
        stmts = [m["text"] for m in ctx["patient_confirmed_statements"]]
        content = {
            "reason_for_visit": "", "patient_confirmed_statements": stmts, "clinician_observations": "",
            "reviewed_medication_context": [r["label"] + (f" — {r['detail']}" if r["detail"] else "")
                                            for r in ctx["verified_records"] if r["kind"] == "medication"],
            "relevant_history_references": [r["label"] for r in ctx["verified_records"]
                                            if r["kind"] in ("condition", "history", "allergy")],
            "unresolved_questions": [], "follow_up_documentation": "",
            "accessibility_methods_used": ctx["accessibility_methods_used"],
        }
    n = ClinicalNoteDraft(session_id=sid, content=content, engine=engine)
    db.add(n)
    audit(db, p, "summary_drafted", resource=f"session:{sid}", engine=engine)
    db.commit()
    return _note(n)


@router.put("/{sid}/summary/{nid}")
def update_summary(sid: str, nid: str, body: NoteUpdate, db: Session = Depends(get_db),
                   p: Principal = Depends(require_clinician)):
    _session(db, sid, p)
    n = db.get(ClinicalNoteDraft, nid)
    if not n or n.session_id != sid:
        raise HTTPException(404, "Note not found")
    n.content = body.content
    if body.approve:
        n.status = "approved"
        n.approved_by = p.name
    audit(db, p, "summary_approved" if body.approve else "summary_edited", resource=f"note:{nid}")
    db.commit()
    if body.approve:
        s = db.get(CareSession, sid)
        c = body.content
        ts.index_context({"id": f"note-{n.id}", "patient_id": s.patient_id, "kind": "note",
                          "label": c.get("reason_for_visit") or "Approved encounter note",
                          "detail": " | ".join(c.get("patient_confirmed_statements", []))[:2000],
                          "source": "session", "created_ts": int(time.time())})
    return _note(n)


# ---------------- WebSocket ----------------
@ws_router.websocket("/ws/sessions/{sid}")
async def session_ws(ws: WebSocket, sid: str, token: str = ""):
    try:
        p = decode_token(token)
        require_session_access(sid, p)
    except HTTPException:
        await ws.close(code=4401)
        return
    with SessionLocal() as db:
        if not db.get(CareSession, sid):
            await ws.close(code=4404)
            return
    await ws.accept()
    await hub.join(sid, ws, p.role)
    try:
        while True:
            raw = await ws.receive_text()
            try:
                msg = json.loads(raw)
            except json.JSONDecodeError:
                continue
            kind = msg.get("type")
            if kind == "ping":
                await ws.send_text(json.dumps({"type": "pong"}))
            elif kind == "patient_status" and p.role == "patient":
                payload = {k: str(v)[:200] for k, v in (msg.get("payload") or {}).items()}
                await hub.broadcast(sid, "patient_status", payload, exclude=ws)
            elif kind == "repeat_request" and p.role == "patient":
                await hub.broadcast(sid, "repeat_request", {}, exclude=ws)
    except WebSocketDisconnect:
        pass
    finally:
        await hub.leave(sid, ws)
