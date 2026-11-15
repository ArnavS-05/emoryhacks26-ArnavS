from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from ..db import get_db, is_postgres
from ..models import AccessibilityProfile, CareSession, InteractionEvent, Patient
from ..schemas import InteractionBatch
from ..security import Principal, audit, current_principal, rate_limit, require_clinician, require_session_access
from ..services import adaptation

router = APIRouter(prefix="/api", tags=["analytics"])


@router.post("/sessions/{sid}/events", status_code=201, dependencies=[Depends(rate_limit("events", 600))])
def record_events(sid: str, body: InteractionBatch, db: Session = Depends(get_db), p: Principal = Depends(current_principal)):
    require_session_access(sid, p)
    s = db.get(CareSession, sid)
    if not s:
        raise HTTPException(404, "Session not found")
    acc = db.get(AccessibilityProfile, s.patient_id)
    for e in body.events:
        db.add(InteractionEvent(patient_id=s.patient_id, session_id=sid, input_mode=e.input_mode,
                                event_type=e.event_type, response_latency_ms=e.response_latency_ms,
                                selection_success=e.selection_success, selection_errors=e.selection_errors,
                                scan_interval_ms=e.scan_interval_ms, calibration_version=acc.calibration_version,
                                context=e.context))
    db.commit()
    return {"recorded": len(body.events)}


@router.get("/patients/{pid}/analytics")
def patient_analytics(pid: str, hours: int = 72, db: Session = Depends(get_db), p: Principal = Depends(current_principal)):
    if p.role == "patient" and p.patient_id != pid:
        raise HTTPException(403, "Not permitted")
    if not db.get(Patient, pid):
        raise HTTPException(404, "Patient not found")
    analysis = adaptation.analyse(db, pid, hours)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    base = select(InteractionEvent).where(InteractionEvent.patient_id == pid, InteractionEvent.ts >= since)
    modes = db.execute(select(InteractionEvent.input_mode, func.count()).where(
        InteractionEvent.patient_id == pid, InteractionEvent.ts >= since,
        InteractionEvent.event_type == "selection").group_by(InteractionEvent.input_mode)).all()
    by_version = db.execute(select(
        InteractionEvent.calibration_version,
        func.count().filter(InteractionEvent.event_type == "selection"),
        func.count().filter(InteractionEvent.event_type == "correction"),
        func.count().filter(InteractionEvent.event_type == "scan_cycle_missed"),
        func.avg(InteractionEvent.response_latency_ms).filter(InteractionEvent.event_type == "message_confirmed"),
    ).where(InteractionEvent.patient_id == pid, InteractionEvent.ts >= since)
        .group_by(InteractionEvent.calibration_version).order_by(InteractionEvent.calibration_version)).all()
    timeline = db.scalars(base.where(InteractionEvent.event_type == "message_confirmed")
                          .order_by(InteractionEvent.ts)).all()
    return {
        **analysis,
        "mode_usage": [{"mode": m, "selections": c} for m, c in modes],
        "by_calibration_version": [{"version": v, "selections": s, "corrections": c, "missed_cycles": mc,
                                    "avg_composition_ms": round(a) if a else None} for v, s, c, mc, a in by_version],
        "composition_timeline": [{"ts": e.ts, "ms": e.response_latency_ms, "mode": e.input_mode} for e in timeline],
        "storage": "tigerdata" if is_postgres() else "sqlite-fallback",
    }


@router.post("/patients/{pid}/recommendations/apply")
def apply_recommendation(pid: str, body: dict, db: Session = Depends(get_db), p: Principal = Depends(current_principal)):
    """Apply a suggested change ONLY after explicit confirmation by patient/caregiver/clinician."""
    if p.role == "patient" and p.patient_id != pid:
        raise HTTPException(403, "Not permitted")
    if body.get("confirmed") is not True:
        raise HTTPException(400, "Explicit confirmation required")
    allowed = {"scan_interval_ms": int, "blink_hold_ms": int, "max_choices": int, "simplified": bool}
    setting, value = body.get("setting"), body.get("value")
    if setting not in allowed:
        raise HTTPException(422, "Unsupported setting")
    a = db.get(AccessibilityProfile, pid)
    before = getattr(a, setting)
    setattr(a, setting, allowed[setting](value))
    a.calibration_version += 1
    db.add(InteractionEvent(patient_id=pid, input_mode=a.input_mode, event_type="calibration",
                            calibration_version=a.calibration_version,
                            context={"setting": setting, "before": before, "after": value, "source": "recommendation"}))
    audit(db, p, "recommendation_applied", resource=f"patient:{pid}", setting=setting, before=before, after=value)
    db.commit()
    return {"setting": setting, "value": getattr(a, setting), "calibration_version": a.calibration_version}


@router.get("/analytics/overview")
def overview(db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    since = datetime.now(timezone.utc) - timedelta(days=7)
    q = select(
        func.count().filter(InteractionEvent.event_type == "selection"),
        func.count().filter(InteractionEvent.event_type == "selection", InteractionEvent.selection_success.is_(True)),
        func.count().filter(InteractionEvent.event_type == "correction"),
        func.count().filter(InteractionEvent.event_type == "message_confirmed"),
        func.avg(InteractionEvent.response_latency_ms).filter(InteractionEvent.event_type == "message_confirmed"),
        func.count().filter(InteractionEvent.event_type == "help_requested"),
    ).where(InteractionEvent.ts >= since, InteractionEvent.event_type != "benchmark_task")
    sel, ok, corr, conf, avg_comp, helps = db.execute(q).one()
    modes = db.execute(select(InteractionEvent.input_mode, func.count()).where(
        InteractionEvent.ts >= since, InteractionEvent.event_type == "message_confirmed")
        .group_by(InteractionEvent.input_mode)).all()
    return {"window_days": 7, "selections": sel, "successful_selections": ok, "corrections": corr,
            "confirmed_messages": conf, "avg_composition_ms": round(avg_comp) if avg_comp else None,
            "help_requests": helps, "mode_usage": [{"mode": m, "messages": c} for m, c in modes],
            "storage": "tigerdata" if is_postgres() else "sqlite-fallback"}


@router.get("/analytics/continuous-aggregate")
def continuous_aggregate(db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    """Read the TimescaleDB continuous aggregate directly (Tiger Data only)."""
    if not is_postgres():
        return {"available": False, "reason": "Continuous aggregates require Tiger Data (TimescaleDB)."}
    rows = db.execute(text(
        "SELECT bucket, patient_id, session_id, input_mode, calibration_version, selections, successful_selections, "
        "corrections, missed_cycles, confirmed_messages, avg_selection_latency_ms, avg_composition_ms "
        "FROM session_interaction_5m ORDER BY bucket DESC LIMIT 50")).mappings().all()
    info = db.execute(text(
        "SELECT hypertable_name, num_chunks FROM timescaledb_information.hypertables "
        "WHERE hypertable_name = 'interaction_events'")).mappings().first()
    return {"available": True, "hypertable": dict(info) if info else None, "rows": [dict(r) for r in rows]}


@router.post("/benchmark/runs", status_code=201)
def record_benchmark(body: dict, db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    """Store a real, user-performed benchmark task (static board vs Synaphi)."""
    board = body.get("board")
    if board not in {"static", "synaphi"}:
        raise HTTPException(422, "board must be static or synaphi")
    pid = body.get("patient_id")
    if not pid or not db.get(Patient, pid):
        raise HTTPException(422, "patient_id required")
    ctx = {k: body.get(k) for k in ("board", "task", "completed", "selections", "incorrect_selections",
                                    "corrections", "retrieval_ms", "input_mode")}
    db.add(InteractionEvent(patient_id=pid, input_mode=str(body.get("input_mode", "touch"))[:20],
                            event_type="benchmark_task", response_latency_ms=int(body.get("duration_ms") or 0),
                            selection_success=bool(body.get("completed")), selection_errors=int(body.get("incorrect_selections") or 0),
                            context=ctx))
    audit(db, p, "benchmark_recorded", board=board)
    db.commit()
    return {"ok": True}


@router.get("/benchmark/runs")
def list_benchmark(db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    rows = db.scalars(select(InteractionEvent).where(InteractionEvent.event_type == "benchmark_task")
                      .order_by(InteractionEvent.ts.desc()).limit(200)).all()
    return [{"ts": r.ts, "duration_ms": r.response_latency_ms, **r.context} for r in rows]
