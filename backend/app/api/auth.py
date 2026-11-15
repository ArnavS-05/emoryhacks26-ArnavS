from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import get_db
from ..models import CareSession, Patient
from ..security import Principal, audit, current_principal, issue_token, rate_limit
from ..serializers import patient_for_patient_view, session as ser_session

router = APIRouter(prefix="/api/auth", tags=["auth"])


class ClinicianLogin(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    access_code: str = Field(min_length=1, max_length=200)


class PatientJoin(BaseModel):
    join_code: str = Field(min_length=4, max_length=12)


@router.post("/clinician", dependencies=[Depends(rate_limit("login", 10))])
def clinician_login(body: ClinicianLogin, db: Session = Depends(get_db)):
    if not hmac.compare_digest(body.access_code.encode(), get_settings().effective_clinician_code.encode()):
        audit(db, None, "clinician_login_failed", detail_name=body.name)
        db.commit()
        raise HTTPException(401, "Invalid access code")
    p = Principal(role="clinician", name=body.name.strip())
    audit(db, p, "clinician_login")
    db.commit()
    return {"token": issue_token(p), "role": "clinician", "name": p.name}


@router.post("/patient", dependencies=[Depends(rate_limit("join", 20))])
def patient_join(body: PatientJoin, db: Session = Depends(get_db)):
    s = db.scalar(select(CareSession).where(CareSession.join_code == body.join_code.strip().upper()))
    if not s or s.status != "active":
        raise HTTPException(404, "No active session with that code")
    patient = db.get(Patient, s.patient_id)
    p = Principal(role="patient", name=patient.name, session_id=s.id, patient_id=patient.id)
    audit(db, p, "patient_joined", resource=f"session:{s.id}")
    db.commit()
    return {"token": issue_token(p), "role": "patient", "session": ser_session(s),
            "patient": patient_for_patient_view(patient)}


@router.get("/me")
def me(p: Principal = Depends(current_principal)):
    return {"role": p.role, "name": p.name, "session_id": p.session_id, "patient_id": p.patient_id}
