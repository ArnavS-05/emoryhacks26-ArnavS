"""Remove test-generated activity (sessions, messages, events, notes, audit log) while keeping synthetic
patients and their verified context. Run before a judged demo so dashboards show only real use.

Run: backend/.venv/Scripts/python scripts/reset_activity.py --yes
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "backend"))
from sqlalchemy import delete  # noqa: E402

from app.db import DB_BACKEND, SessionLocal  # noqa: E402
from app.migrations import run_migrations  # noqa: E402
from app.models import (  # noqa: E402
    AuditEvent, CareSession, ClinicalNoteDraft, ConfirmedMessage, ConversationTurn, InteractionEvent, PairingToken,
)

if "--yes" not in sys.argv:
    raise SystemExit("Refusing to run without --yes (this deletes all session activity).")
run_migrations()
with SessionLocal() as db:
    counts = {}
    for model in (PairingToken, ClinicalNoteDraft, ConfirmedMessage, ConversationTurn, CareSession, InteractionEvent, AuditEvent):
        counts[model.__tablename__] = db.execute(delete(model)).rowcount
    # Restore each synthetic patient's documented access profile (tests change these).
    from app.api.demo import SYNTHETIC_PATIENTS
    from app.models import AccessibilityProfile
    for spec in SYNTHETIC_PATIENTS:
        a = db.get(AccessibilityProfile, spec["id"])
        if a:
            a.input_mode, a.language = spec["mode"], spec["lang"]
            a.scan_interval_ms = 1200 if spec["mode"] == "scan" else 1500
            a.simplified, a.font_scale, a.contrast_mode, a.max_choices = False, 1.0, "standard", 8
            a.blink_threshold, a.blink_hold_ms, a.dwell_ms, a.calibration_version = 0.5, 400, 1000, 1
    db.commit()
print(f"[{DB_BACKEND}] deleted:", counts)
