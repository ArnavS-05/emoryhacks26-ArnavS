from __future__ import annotations

import hashlib
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import ROOT
from ..db import get_db
from ..models import MedicalDocument, Patient, VerifiedMedicalContext
from ..security import Principal, audit, rate_limit, require_clinician
from ..serializers import context_item, document
from ..services import gemini_service

router = APIRouter(prefix="/api/patients/{pid}/documents", tags=["documents"])

ALLOWED = {"application/pdf": b"%PDF", "image/png": b"\x89PNG", "image/jpeg": b"\xff\xd8\xff"}
MAX_BYTES = 10 * 1024 * 1024
UPLOAD_DIR = ROOT / "backend" / "uploads"


@router.post("", status_code=201, dependencies=[Depends(rate_limit("upload", 20))])
async def upload(pid: str, file: UploadFile = File(...), db: Session = Depends(get_db),
                 p: Principal = Depends(require_clinician)):
    if not db.get(Patient, pid):
        raise HTTPException(404, "Patient not found")
    data = await file.read(MAX_BYTES + 1)
    if len(data) > MAX_BYTES:
        raise HTTPException(413, "File too large (max 10 MB)")
    mime = file.content_type or ""
    magic = ALLOWED.get(mime)
    if not magic or not data.startswith(magic):
        raise HTTPException(415, "Only PDF, PNG and JPG files are supported")
    sha = hashlib.sha256(data).hexdigest()
    doc = MedicalDocument(patient_id=pid, filename=Path(file.filename or "document").name[:255], mime_type=mime,
                          size_bytes=len(data), sha256=sha)
    db.add(doc)
    db.flush()
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    (UPLOAD_DIR / f"{doc.id}").write_bytes(data)
    audit(db, p, "document_uploaded", resource=f"document:{doc.id}", sha256=sha)

    # Extract with Gemini. Every extracted field starts UNVERIFIED with provenance.
    fields = []
    try:
        result, model = await gemini_service.extract_document(data, mime)
        doc.extraction_status = "extracted"
        doc.extraction_engine = model
        for f in result.fields:
            c = VerifiedMedicalContext(patient_id=pid, kind=f.kind, label=f.label[:255], detail=f.detail[:2000],
                                       status="unverified", source_type="document", source_document_id=doc.id,
                                       source_excerpt=f.source_excerpt[:2000], confidence=f.confidence)
            db.add(c)
            fields.append(c)
        warnings = result.warnings
        doc_type = result.document_type
    except gemini_service.GeminiUnavailable as e:
        doc.extraction_status = "failed"
        doc.extraction_engine = "unavailable"
        doc.extraction_error = str(e)
        warnings, doc_type = [], ""
    db.commit()
    return {"document": document(doc), "document_type": doc_type, "warnings": warnings,
            "fields": [context_item(c) for c in fields]}


@router.get("/{doc_id}/fields")
def doc_fields(pid: str, doc_id: str, db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    doc = db.get(MedicalDocument, doc_id)
    if not doc or doc.patient_id != pid:
        raise HTTPException(404, "Document not found")
    rows = db.scalars(select(VerifiedMedicalContext).where(VerifiedMedicalContext.source_document_id == doc_id)).all()
    return {"document": document(doc), "fields": [context_item(c) for c in rows]}
