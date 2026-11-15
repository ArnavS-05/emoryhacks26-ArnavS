"""Judge mode: repeatable, fully fictional demo scenario."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import AccessibilityProfile, CareSession, Patient, PatientProfile, VerifiedMedicalContext
from ..security import Principal, audit, issue_token, rate_limit
from ..serializers import patient_for_patient_view, session as ser_session
from ..services import typesense_service as ts
from .patients import add_verified, context_doc
from .sessions import create_session

router = APIRouter(prefix="/api/demo", tags=["demo"])

DEMO_PATIENT_ID = "00000000000000000000000000000d01"
DEMO_CLINICIAN = "Dr. Rivera (demo)"

SYNTHETIC_PATIENTS = [
    {
        "id": DEMO_PATIENT_ID, "name": "Elena Marsh", "age": 63, "lang": "en", "mode": "scan",
        "abilities": ["Nonverbal after brainstem stroke", "Reliable deliberate blinks", "Limited head movement",
                      "Understands spoken English"],
        "notes": "Uses single-switch scanning or deliberate blinks. Tires after ~20 minutes.",
        "caregiver": {"name": "Sam Marsh (fictional)", "relationship": "Spouse"},
        "context": [("medication", "Atorvastatin", "20 mg once daily"), ("medication", "Apixaban", "5 mg twice daily"),
                    ("allergy", "Penicillin", "Hives (reported 2019)"), ("condition", "Brainstem stroke", "2025"),
                    ("condition", "Atrial fibrillation", ""), ("history", "Laparoscopic appendectomy", "2011")],
    },
    {
        "id": "00000000000000000000000000000d02", "name": "Tomás Ibarra", "age": 41, "lang": "es", "mode": "touch",
        "abilities": ["Temporarily intubated", "Full arm movement", "Prefers Spanish"],
        "notes": "Large touch targets; Spanish-language interface.",
        "caregiver": {"name": "Lucía Ibarra (fictional)", "relationship": "Sister"},
        "context": [("medication", "Metformin", "500 mg twice daily"), ("allergy", "Latex", "Contact rash"),
                    ("condition", "Type 2 diabetes", "")],
    },
    {
        "id": "00000000000000000000000000000d03", "name": "Priya Natarajan", "age": 29, "lang": "en", "mode": "head",
        "abilities": ["ALS — progressive speech loss", "Good head control", "Uses residual speech for yes/no"],
        "notes": "Head gestures primary; voice for short words when rested.",
        "caregiver": {},
        "context": [("medication", "Riluzole", "50 mg twice daily"), ("condition", "Amyotrophic lateral sclerosis", "")],
    },
]


def ensure_synthetic_patients(db: Session) -> None:
    created = []
    for spec in SYNTHETIC_PATIENTS:
        if db.get(Patient, spec["id"]):
            continue
        p = Patient(id=spec["id"], name=spec["name"], age=spec["age"], preferred_language=spec["lang"])
        db.add(p)
        db.flush()
        db.add(PatientProfile(patient_id=p.id, communication_abilities=spec["abilities"],
                              accessibility_notes=spec["notes"], caregiver=spec["caregiver"]))
        db.add(AccessibilityProfile(patient_id=p.id, input_mode=spec["mode"], language=spec["lang"],
                                    simplified=False, scan_interval_ms=1200 if spec["mode"] == "scan" else 1500))
        for kind, label, detail in spec["context"]:
            created.append(add_verified(db, p.id, kind, label, "Seed data (synthetic)", detail))
    db.commit()
    for c in created:
        ts.index_context(context_doc(c))


@router.post("/start", dependencies=[Depends(rate_limit("demo", 20))])
def start_demo(db: Session = Depends(get_db)):
    if not get_settings().enable_demo:
        raise HTTPException(404, "Demo mode disabled")
    ensure_synthetic_patients(db)
    patient = db.get(Patient, DEMO_PATIENT_ID)
    # Close previous demo sessions so every run starts clean.
    for s in db.scalars(select(CareSession).where(CareSession.is_demo.is_(True), CareSession.status == "active")):
        s.status = "completed"
    s = create_session(db, patient, DEMO_CLINICIAN, "en", demo=True)
    db.flush()
    clinician = Principal(role="clinician", name=DEMO_CLINICIAN)
    pat = Principal(role="patient", name=patient.name, session_id=s.id, patient_id=patient.id)
    audit(db, clinician, "demo_started", resource=f"session:{s.id}")
    db.commit()
    return {"session": ser_session(s, patient), "clinician_token": issue_token(clinician),
            "patient_token": issue_token(pat), "patient": patient_for_patient_view(patient),
            "clinician_name": DEMO_CLINICIAN}
