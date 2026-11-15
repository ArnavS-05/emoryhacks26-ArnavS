"""ORM models. All patient data in the public demo is synthetic."""
from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import JSON, Boolean, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def uid() -> str:
    return uuid.uuid4().hex


def now() -> datetime:
    return datetime.now(timezone.utc)


class Patient(Base):
    __tablename__ = "patients"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    name: Mapped[str] = mapped_column(String(120))
    age: Mapped[int | None] = mapped_column(Integer, nullable=True)
    preferred_language: Mapped[str] = mapped_column(String(10), default="en")
    is_synthetic: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    last_accessed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)

    profile: Mapped["PatientProfile"] = relationship(back_populates="patient", uselist=False, cascade="all, delete-orphan")
    accessibility: Mapped["AccessibilityProfile"] = relationship(back_populates="patient", uselist=False, cascade="all, delete-orphan")


class PatientProfile(Base):
    """Clinician-entered profile. Entered values are treated as clinician-verified."""
    __tablename__ = "patient_profiles"
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), primary_key=True)
    communication_abilities: Mapped[list] = mapped_column(JSON, default=list)
    accessibility_notes: Mapped[str] = mapped_column(Text, default="")
    medical_history: Mapped[list] = mapped_column(JSON, default=list)
    medications: Mapped[list] = mapped_column(JSON, default=list)
    allergies: Mapped[list] = mapped_column(JSON, default=list)
    conditions: Mapped[list] = mapped_column(JSON, default=list)
    caregiver: Mapped[dict] = mapped_column(JSON, default=dict)
    patient: Mapped[Patient] = relationship(back_populates="profile")


class AccessibilityProfile(Base):
    __tablename__ = "accessibility_profiles"
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), primary_key=True)
    input_mode: Mapped[str] = mapped_column(String(20), default="touch")  # touch|scan|blink|head|voice|keyboard|dwell
    scan_interval_ms: Mapped[int] = mapped_column(Integer, default=1500)
    blink_threshold: Mapped[float] = mapped_column(Float, default=0.5)
    blink_hold_ms: Mapped[int] = mapped_column(Integer, default=400)
    dwell_ms: Mapped[int] = mapped_column(Integer, default=1000)
    head_sensitivity: Mapped[float] = mapped_column(Float, default=0.5)
    font_scale: Mapped[float] = mapped_column(Float, default=1.0)
    contrast_mode: Mapped[str] = mapped_column(String(20), default="standard")  # standard|high
    simplified: Mapped[bool] = mapped_column(Boolean, default=False)
    max_choices: Mapped[int] = mapped_column(Integer, default=8)
    reduced_motion: Mapped[bool] = mapped_column(Boolean, default=False)
    audio_prompts: Mapped[bool] = mapped_column(Boolean, default=False)
    language: Mapped[str] = mapped_column(String(10), default="en")
    preferred_categories: Mapped[list] = mapped_column(JSON, default=list)
    select_keys: Mapped[list] = mapped_column(JSON, default=lambda: [" ", "Enter"])
    calibration_version: Mapped[int] = mapped_column(Integer, default=1)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)
    patient: Mapped[Patient] = relationship(back_populates="accessibility")


class MedicalDocument(Base):
    __tablename__ = "medical_documents"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    filename: Mapped[str] = mapped_column(String(255))
    mime_type: Mapped[str] = mapped_column(String(60))
    size_bytes: Mapped[int] = mapped_column(Integer)
    sha256: Mapped[str] = mapped_column(String(64))
    extraction_status: Mapped[str] = mapped_column(String(20), default="pending")  # pending|extracted|failed
    extraction_engine: Mapped[str] = mapped_column(String(60), default="")
    extraction_error: Mapped[str] = mapped_column(Text, default="")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class VerifiedMedicalContext(Base):
    """A single medical fact. Document-derived facts start unverified until a clinician approves."""
    __tablename__ = "verified_medical_context"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    kind: Mapped[str] = mapped_column(String(30))  # medication|allergy|condition|history|note
    label: Mapped[str] = mapped_column(String(255))
    detail: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="unverified")  # unverified|verified|rejected
    source_type: Mapped[str] = mapped_column(String(20), default="clinician")  # clinician|document|session
    source_document_id: Mapped[str | None] = mapped_column(ForeignKey("medical_documents.id", ondelete="SET NULL"), nullable=True)
    source_excerpt: Mapped[str] = mapped_column(Text, default="")
    confidence: Mapped[float | None] = mapped_column(Float, nullable=True)
    verified_by: Mapped[str] = mapped_column(String(120), default="")
    verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class CareSession(Base):
    __tablename__ = "care_sessions"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    patient_id: Mapped[str] = mapped_column(ForeignKey("patients.id", ondelete="CASCADE"), index=True)
    clinician_name: Mapped[str] = mapped_column(String(120), default="")
    clinician_language: Mapped[str] = mapped_column(String(10), default="en")
    join_code: Mapped[str] = mapped_column(String(12), unique=True, index=True)
    status: Mapped[str] = mapped_column(String(20), default="active")  # active|completed
    is_demo: Mapped[bool] = mapped_column(Boolean, default=False)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    ended_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)


class ConversationTurn(Base):
    __tablename__ = "conversation_turns"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("care_sessions.id", ondelete="CASCADE"), index=True)
    speaker: Mapped[str] = mapped_column(String(20))  # clinician|patient|system
    original_text: Mapped[str] = mapped_column(Text)
    original_language: Mapped[str] = mapped_column(String(10), default="en")
    translated_text: Mapped[str] = mapped_column(Text, default="")
    translated_language: Mapped[str] = mapped_column(String(10), default="")
    simplified_text: Mapped[str] = mapped_column(Text, default="")
    intent: Mapped[dict] = mapped_column(JSON, default=dict)
    options: Mapped[list] = mapped_column(JSON, default=list)
    ai_engine: Mapped[str] = mapped_column(String(60), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ConfirmedMessage(Base):
    """A statement the patient explicitly reviewed and confirmed. Never AI-authored content."""
    __tablename__ = "confirmed_messages"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("care_sessions.id", ondelete="CASCADE"), index=True)
    turn_id: Mapped[str | None] = mapped_column(ForeignKey("conversation_turns.id", ondelete="SET NULL"), nullable=True)
    patient_text: Mapped[str] = mapped_column(Text)
    patient_language: Mapped[str] = mapped_column(String(10))
    clinician_text: Mapped[str] = mapped_column(Text)
    clinician_language: Mapped[str] = mapped_column(String(10))
    translation_engine: Mapped[str] = mapped_column(String(60), default="none")
    selections: Mapped[list] = mapped_column(JSON, default=list)
    input_mode: Mapped[str] = mapped_column(String(20))
    is_urgent: Mapped[bool] = mapped_column(Boolean, default=False)
    composition_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    confirmed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)


class ClinicalNoteDraft(Base):
    __tablename__ = "clinical_note_drafts"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    session_id: Mapped[str] = mapped_column(ForeignKey("care_sessions.id", ondelete="CASCADE"), index=True)
    content: Mapped[dict] = mapped_column(JSON, default=dict)
    engine: Mapped[str] = mapped_column(String(60), default="")
    status: Mapped[str] = mapped_column(String(20), default="draft")  # draft|approved
    approved_by: Mapped[str] = mapped_column(String(120), default="")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, onupdate=now)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    actor_role: Mapped[str] = mapped_column(String(20))
    actor: Mapped[str] = mapped_column(String(120), default="")
    action: Mapped[str] = mapped_column(String(60))
    resource: Mapped[str] = mapped_column(String(120), default="")
    detail: Mapped[dict] = mapped_column(JSON, default=dict)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now, index=True)


class InteractionEvent(Base):
    """Accessibility interaction time-series. Converted to a TimescaleDB hypertable on Tiger Data."""
    __tablename__ = "interaction_events"
    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=uid)
    ts: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True, default=now)
    patient_id: Mapped[str] = mapped_column(String(32), index=True)
    session_id: Mapped[str | None] = mapped_column(String(32), index=True, nullable=True)
    input_mode: Mapped[str] = mapped_column(String(20))
    event_type: Mapped[str] = mapped_column(String(40))
    response_latency_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    selection_success: Mapped[bool | None] = mapped_column(Boolean, nullable=True)
    selection_errors: Mapped[int] = mapped_column(Integer, default=0)
    scan_interval_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    calibration_version: Mapped[int] = mapped_column(Integer, default=1)
    context: Mapped[dict] = mapped_column(JSON, default=dict)


class PairingToken(Base):
    """One-time, short-lived device pairing link (only the SHA-256 hash is stored)."""
    __tablename__ = "pairing_tokens"
    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    session_id: Mapped[str] = mapped_column(ForeignKey("care_sessions.id", ondelete="CASCADE"), index=True)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
