from __future__ import annotations

from .models import (
    AccessibilityProfile, CareSession, ConfirmedMessage, ConversationTurn, MedicalDocument, Patient,
    VerifiedMedicalContext,
)


def accessibility(a: AccessibilityProfile | None) -> dict:
    if not a:
        return {}
    return {k: getattr(a, k) for k in (
        "input_mode", "scan_interval_ms", "blink_threshold", "blink_hold_ms", "head_sensitivity", "font_scale",
        "contrast_mode", "simplified", "max_choices", "reduced_motion", "audio_prompts", "language",
        "preferred_categories", "select_keys", "calibration_version", "updated_at")}


def patient_brief(p: Patient) -> dict:
    return {"id": p.id, "name": p.name, "age": p.age, "preferred_language": p.preferred_language,
            "is_synthetic": p.is_synthetic, "created_at": p.created_at, "last_accessed_at": p.last_accessed_at,
            "input_mode": p.accessibility.input_mode if p.accessibility else None,
            "communication_abilities": p.profile.communication_abilities if p.profile else []}


def patient_for_patient_view(p: Patient) -> dict:
    """Minimal data the patient device needs — no medical record."""
    return {"id": p.id, "name": p.name, "preferred_language": p.preferred_language,
            "accessibility": accessibility(p.accessibility)}


def context_item(c: VerifiedMedicalContext) -> dict:
    return {"id": c.id, "kind": c.kind, "label": c.label, "detail": c.detail, "status": c.status,
            "source_type": c.source_type, "source_document_id": c.source_document_id,
            "source_excerpt": c.source_excerpt, "confidence": c.confidence, "verified_by": c.verified_by,
            "verified_at": c.verified_at, "created_at": c.created_at}


def document(d: MedicalDocument) -> dict:
    return {"id": d.id, "filename": d.filename, "mime_type": d.mime_type, "size_bytes": d.size_bytes,
            "extraction_status": d.extraction_status, "extraction_engine": d.extraction_engine,
            "extraction_error": d.extraction_error, "uploaded_at": d.uploaded_at}


def session(s: CareSession, patient: Patient | None = None) -> dict:
    out = {"id": s.id, "patient_id": s.patient_id, "clinician_name": s.clinician_name,
           "clinician_language": s.clinician_language, "join_code": s.join_code, "status": s.status,
           "is_demo": s.is_demo, "started_at": s.started_at, "ended_at": s.ended_at}
    if patient:
        out["patient_name"] = patient.name
    return out


def turn(t: ConversationTurn) -> dict:
    return {"id": t.id, "speaker": t.speaker, "original_text": t.original_text,
            "original_language": t.original_language, "translated_text": t.translated_text,
            "translated_language": t.translated_language, "simplified_text": t.simplified_text,
            "intent": t.intent, "options": t.options, "ai_engine": t.ai_engine, "created_at": t.created_at}


def message(m: ConfirmedMessage) -> dict:
    return {"id": m.id, "turn_id": m.turn_id, "patient_text": m.patient_text, "patient_language": m.patient_language,
            "clinician_text": m.clinician_text, "clinician_language": m.clinician_language,
            "translation_engine": m.translation_engine, "selections": m.selections, "input_mode": m.input_mode,
            "is_urgent": m.is_urgent, "composition_ms": m.composition_ms, "confirmed_at": m.confirmed_at}
