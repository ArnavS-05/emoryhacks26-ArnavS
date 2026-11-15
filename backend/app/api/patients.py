from __future__ import annotations

from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..models import (
    AccessibilityProfile, CareSession, ClinicalNoteDraft, MedicalDocument, Patient, PatientProfile,
    VerifiedMedicalContext,
)
from ..schemas import AccessibilityUpdate, FieldReview, PatientCreate
from ..security import Principal, audit, current_principal, require_clinician
from ..serializers import accessibility, context_item, document, patient_brief, session as ser_session
from ..services import typesense_service as ts
from ..websocket.hub import hub

router = APIRouter(prefix="/api/patients", tags=["patients"])


def _get_patient(db: Session, pid: str) -> Patient:
    p = db.get(Patient, pid)
    if not p:
        raise HTTPException(404, "Patient not found")
    return p


def context_doc(c: VerifiedMedicalContext) -> dict:
    return {"id": f"ctx-{c.id}", "patient_id": c.patient_id, "kind": c.kind, "label": c.label,
            "detail": c.detail or "", "source": c.source_type,
            "created_ts": int((c.verified_at or c.created_at).timestamp())}


def add_verified(db: Session, patient_id: str, kind: str, label: str, by: str, detail: str = "",
                 source_type: str = "clinician") -> VerifiedMedicalContext:
    c = VerifiedMedicalContext(patient_id=patient_id, kind=kind, label=label, detail=detail, status="verified",
                               source_type=source_type, verified_by=by, verified_at=datetime.now(timezone.utc))
    db.add(c)
    return c


@router.get("")
def list_patients(db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    rows = db.scalars(select(Patient).order_by(Patient.last_accessed_at.desc())).all()
    return [patient_brief(r) for r in rows]


@router.post("", status_code=201)
def create_patient(body: PatientCreate, db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    patient = Patient(name=body.name.strip(), age=body.age, preferred_language=body.preferred_language)
    db.add(patient)
    db.flush()
    db.add(PatientProfile(patient_id=patient.id, communication_abilities=body.communication_abilities,
                          accessibility_notes=body.accessibility_notes, medical_history=body.medical_history,
                          medications=body.medications, allergies=body.allergies, conditions=body.conditions,
                          caregiver=body.caregiver))
    db.add(AccessibilityProfile(patient_id=patient.id, input_mode=body.input_mode, language=body.preferred_language))
    # Clinician-entered facts are verified at entry and attributed to the clinician.
    created = []
    for kind, items in (("medication", body.medications), ("allergy", body.allergies),
                        ("condition", body.conditions), ("history", body.medical_history)):
        for it in items:
            created.append(add_verified(db, patient.id, kind, it, p.name))
    audit(db, p, "patient_created", resource=f"patient:{patient.id}")
    db.commit()
    for c in created:
        ts.index_context(context_doc(c))
    return patient_brief(patient)


@router.get("/{pid}")
def get_patient(pid: str, db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    patient = _get_patient(db, pid)
    patient.last_accessed_at = datetime.now(timezone.utc)
    audit(db, p, "patient_viewed", resource=f"patient:{pid}")
    db.commit()
    prof = patient.profile
    ctx = db.scalars(select(VerifiedMedicalContext).where(VerifiedMedicalContext.patient_id == pid)
                     .order_by(VerifiedMedicalContext.created_at.desc())).all()
    docs = db.scalars(select(MedicalDocument).where(MedicalDocument.patient_id == pid)
                      .order_by(MedicalDocument.uploaded_at.desc())).all()
    sessions = db.scalars(select(CareSession).where(CareSession.patient_id == pid)
                          .order_by(CareSession.started_at.desc())).all()
    notes = db.scalars(select(ClinicalNoteDraft).join(CareSession, ClinicalNoteDraft.session_id == CareSession.id)
                       .where(CareSession.patient_id == pid, ClinicalNoteDraft.status == "approved")
                       .order_by(ClinicalNoteDraft.updated_at.desc())).all()
    return {
        **patient_brief(patient),
        "profile": {"communication_abilities": prof.communication_abilities, "accessibility_notes": prof.accessibility_notes,
                    "caregiver": prof.caregiver} if prof else {},
        "accessibility": accessibility(patient.accessibility),
        "context": [context_item(c) for c in ctx],
        "documents": [document(d) for d in docs],
        "sessions": [ser_session(s) for s in sessions],
        "approved_notes": [{"id": n.id, "session_id": n.session_id, "content": n.content, "approved_by": n.approved_by,
                            "updated_at": n.updated_at} for n in notes],
    }


@router.patch("/{pid}/accessibility")
async def update_accessibility(pid: str, body: AccessibilityUpdate, db: Session = Depends(get_db),
                               p: Principal = Depends(current_principal)):
    if p.role == "patient" and p.patient_id != pid:
        raise HTTPException(403, "Not permitted")
    if p.role not in ("clinician", "patient"):
        raise HTTPException(403, "Not permitted")
    patient = _get_patient(db, pid)
    a = patient.accessibility
    changes = body.model_dump(exclude_none=True, exclude={"bump_calibration", "reason"})
    before = {k: getattr(a, k) for k in changes}
    for k, v in changes.items():
        setattr(a, k, v)
    if body.bump_calibration:
        a.calibration_version += 1
    audit(db, p, "accessibility_updated", resource=f"patient:{pid}", before=before, after=changes,
          reason=body.reason, calibration_version=a.calibration_version)
    db.commit()
    payload = accessibility(a)
    active = db.scalars(select(CareSession).where(CareSession.patient_id == pid, CareSession.status == "active")).all()
    for s in active:
        await hub.broadcast(s.id, "accessibility_updated", payload)
    return payload


@router.post("/{pid}/context", status_code=201)
def add_context(pid: str, body: dict, db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    _get_patient(db, pid)
    kind = body.get("kind")
    label = (body.get("label") or "").strip()
    if kind not in {"medication", "allergy", "condition", "history", "note"} or not label:
        raise HTTPException(422, "kind and label are required")
    c = add_verified(db, pid, kind, label[:255], p.name, (body.get("detail") or "")[:2000])
    audit(db, p, "context_added", resource=f"patient:{pid}", kind=kind)
    db.commit()
    ts.index_context(context_doc(c))
    return context_item(c)


@router.patch("/{pid}/context/{cid}")
def review_context(pid: str, cid: str, body: FieldReview, db: Session = Depends(get_db),
                   p: Principal = Depends(require_clinician)):
    c = db.get(VerifiedMedicalContext, cid)
    if not c or c.patient_id != pid:
        raise HTTPException(404, "Field not found")
    if body.label is not None:
        c.label = body.label
    if body.detail is not None:
        c.detail = body.detail
    c.status = body.status
    c.verified_by = p.name
    c.verified_at = datetime.now(timezone.utc)
    audit(db, p, f"context_{body.status}", resource=f"context:{cid}", source_document=c.source_document_id)
    db.commit()
    if c.status == "verified":
        ts.index_context(context_doc(c))
    else:
        ts.remove_context(f"ctx-{c.id}")
    return context_item(c)


@router.get("/{pid}/context/search")
def search_patient_context(pid: str, q: str = "", db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    _get_patient(db, pid)
    res = ts.search_context(pid, q)
    if res is not None:
        return res
    # Fallback: verified records from the database, simple substring match.
    rows = db.scalars(select(VerifiedMedicalContext).where(VerifiedMedicalContext.patient_id == pid,
                                                           VerifiedMedicalContext.status == "verified")).all()
    ql = q.lower().strip()
    hits = [context_doc(r) for r in rows if not ql or ql in f"{r.kind} {r.label} {r.detail}".lower()]
    return {"engine": "fallback:database", "results": hits, "search_time_ms": None}
