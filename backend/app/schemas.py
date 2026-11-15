"""Pydantic schemas: API payloads and structured Gemini outputs."""
from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field, field_validator

LANG_RE = r"^[a-z]{2}(-[A-Z]{2})?$"


# ---------------- Structured AI outputs ----------------
class Intent(str, Enum):
    pain_location = "pain_location"
    pain_intensity = "pain_intensity"
    pain_quality = "pain_quality"
    pain_timing = "pain_timing"
    symptom_check = "symptom_check"
    breathing = "breathing"
    comfort = "comfort"
    mobility = "mobility"
    nutrition = "nutrition"
    hygiene = "hygiene"
    feelings = "feelings"
    medication = "medication"
    allergy = "allergy"
    yes_no = "yes_no"
    general = "general"
    unclear = "unclear"


class ResponseType(str, Enum):
    body_location = "body_location"
    scale = "scale"
    yes_no = "yes_no"
    choice = "choice"
    free = "free"


class QuestionInterpretation(BaseModel):
    """Gemini's interpretation of a clinician utterance. Used ONLY to choose response options;
    never used as the patient's answer."""
    intent: Intent
    response_type: ResponseType
    topic: str = Field(description="Short topic label, e.g. 'pain location'")
    search_query: str = Field(description="Keywords for retrieving patient response phrases")
    categories: list[str] = Field(default_factory=list, description="Phrase categories most relevant")
    simplified_question: str = Field(description="Plain-language version of the question in the clinician's language, max 12 words")
    translated_question: str = Field(default="", description="Question translated into the patient language")
    translated_simplified: str = Field(default="", description="Simplified question in the patient language")
    confidence: float = Field(ge=0, le=1)
    needs_clarification: bool = False


class ExtractedField(BaseModel):
    kind: Literal["medication", "allergy", "condition", "history"]
    label: str = Field(description="Name, e.g. medication name or allergen")
    detail: str = Field(default="", description="Dose/frequency/reaction/date as written")
    source_excerpt: str = Field(description="Verbatim text from the document supporting this field")
    confidence: float = Field(ge=0, le=1)


class DocumentExtraction(BaseModel):
    document_type: str
    patient_name_on_document: str = ""
    fields: list[ExtractedField]
    warnings: list[str] = Field(default_factory=list)


class CopilotConsideration(BaseModel):
    text: str
    basis: str = Field(description="Which confirmed statements or verified records this is based on")


class CopilotInsights(BaseModel):
    patient_confirmed_concerns: list[str]
    relevant_verified_history: list[str]
    possible_inconsistencies: list[str]
    suggested_follow_up_questions: list[str]
    missing_information: list[str]
    general_considerations: list[CopilotConsideration] = Field(
        description="General clinical considerations for professional review only — no diagnosis, no prescriptions")


class EncounterDraft(BaseModel):
    reason_for_visit: str
    patient_confirmed_statements: list[str]
    clinician_observations: str = ""
    reviewed_medication_context: list[str]
    relevant_history_references: list[str]
    unresolved_questions: list[str]
    follow_up_documentation: str
    accessibility_methods_used: list[str]


class TranslationBatch(BaseModel):
    translations: list[str]


# ---------------- API payloads ----------------
class PatientCreate(BaseModel):
    name: str = Field(min_length=1, max_length=120)
    age: int | None = Field(default=None, ge=0, le=130)
    preferred_language: str = Field(default="en", pattern=LANG_RE)
    communication_abilities: list[str] = Field(default_factory=list)
    accessibility_notes: str = Field(default="", max_length=2000)
    input_mode: Literal["touch", "scan", "blink", "head", "voice", "keyboard"] = "touch"
    medical_history: list[str] = Field(default_factory=list)
    medications: list[str] = Field(default_factory=list)
    allergies: list[str] = Field(default_factory=list)
    conditions: list[str] = Field(default_factory=list)
    caregiver: dict = Field(default_factory=dict)

    @field_validator("communication_abilities", "medical_history", "medications", "allergies", "conditions")
    @classmethod
    def _clean(cls, v: list[str]) -> list[str]:
        return [s.strip()[:300] for s in v if s and s.strip()][:50]


class AccessibilityUpdate(BaseModel):
    input_mode: Literal["touch", "scan", "blink", "head", "voice", "keyboard"] | None = None
    scan_interval_ms: int | None = Field(default=None, ge=400, le=8000)
    blink_threshold: float | None = Field(default=None, ge=0.05, le=0.95)
    blink_hold_ms: int | None = Field(default=None, ge=150, le=2000)
    head_sensitivity: float | None = Field(default=None, ge=0.05, le=1.0)
    font_scale: float | None = Field(default=None, ge=0.8, le=2.0)
    contrast_mode: Literal["standard", "high"] | None = None
    simplified: bool | None = None
    max_choices: int | None = Field(default=None, ge=2, le=12)
    reduced_motion: bool | None = None
    audio_prompts: bool | None = None
    language: str | None = Field(default=None, pattern=LANG_RE)
    preferred_categories: list[str] | None = None
    select_keys: list[str] | None = None
    bump_calibration: bool = False
    reason: str = Field(default="manual", max_length=200)


class FieldReview(BaseModel):
    status: Literal["verified", "rejected"]
    label: str | None = Field(default=None, max_length=255)
    detail: str | None = Field(default=None, max_length=2000)


class SessionCreate(BaseModel):
    patient_id: str
    clinician_language: str = Field(default="en", pattern=LANG_RE)


class QuestionIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)
    source: Literal["typed", "browser_speech", "gemini_live", "quick"] = "typed"


class Selection(BaseModel):
    step: str = Field(max_length=40)
    phrase_id: str | None = Field(default=None, max_length=60)
    label: str = Field(max_length=200)
    clinician_label: str = Field(default="", max_length=200)


class ConfirmIn(BaseModel):
    turn_id: str | None = None
    patient_text: str = Field(min_length=1, max_length=600)
    patient_language: str = Field(pattern=LANG_RE)
    clinician_text: str = Field(min_length=1, max_length=600)
    selections: list[Selection] = Field(default_factory=list)
    input_mode: str = Field(max_length=20)
    composition_ms: int | None = Field(default=None, ge=0, le=3_600_000)


class HelpIn(BaseModel):
    input_mode: str = Field(default="touch", max_length=20)


class InteractionIn(BaseModel):
    input_mode: str = Field(max_length=20)
    event_type: Literal[
        "option_presented", "selection", "correction", "scan_cycle_missed", "message_confirmed",
        "message_cancelled", "help_requested", "blink_detected", "blink_rejected", "head_gesture",
        "calibration", "repeat_requested", "benchmark_task",
    ]
    response_latency_ms: int | None = Field(default=None, ge=0, le=3_600_000)
    selection_success: bool | None = None
    selection_errors: int = Field(default=0, ge=0, le=100)
    scan_interval_ms: int | None = Field(default=None, ge=0, le=60000)
    context: dict = Field(default_factory=dict)


class InteractionBatch(BaseModel):
    events: list[InteractionIn] = Field(max_length=200)


class ComposeTranslateIn(BaseModel):
    texts: list[str] = Field(max_length=40)
    source_language: str = Field(pattern=LANG_RE)
    target_language: str = Field(pattern=LANG_RE)


class NoteUpdate(BaseModel):
    content: dict
    approve: bool = False


class SearchIn(BaseModel):
    q: str = Field(default="", max_length=200)
    intent: str | None = None
    categories: list[str] = Field(default_factory=list)
    response_types: list[str] = Field(default_factory=list)
    patient_id: str | None = None
    mode: Literal["keyword", "hybrid"] = "hybrid"
    limit: int = Field(default=8, ge=1, le=30)


class TurnOut(BaseModel):
    id: str
    speaker: str
    original_text: str
    original_language: str
    translated_text: str
    translated_language: str
    simplified_text: str
    intent: dict
    options: list
    ai_engine: str
    created_at: datetime
