"""Adaptive Accessibility Engine.

Analyses recorded interaction events and *suggests* setting changes. It never applies them:
any change that affects a patient's ability to communicate requires explicit confirmation.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from ..models import AccessibilityProfile, InteractionEvent

MIN_EVENTS = 6


def _metrics(events: list[InteractionEvent]) -> dict:
    sel = [e for e in events if e.event_type == "selection"]
    corrections = sum(1 for e in events if e.event_type == "correction")
    missed = sum(1 for e in events if e.event_type == "scan_cycle_missed")
    blink_rejected = sum(1 for e in events if e.event_type == "blink_rejected")
    confirmed = [e for e in events if e.event_type == "message_confirmed"]
    lat = [e.response_latency_ms for e in sel if e.response_latency_ms is not None]
    comp = [e.response_latency_ms for e in confirmed if e.response_latency_ms is not None]
    return {
        "events": len(events),
        "selections": len(sel),
        "successful_selections": sum(1 for e in sel if e.selection_success),
        "corrections": corrections,
        "missed_scan_cycles": missed,
        "blink_rejected": blink_rejected,
        "confirmed_messages": len(confirmed),
        "avg_selection_latency_ms": round(sum(lat) / len(lat)) if lat else None,
        "avg_composition_ms": round(sum(comp) / len(comp)) if comp else None,
        "correction_rate": round(corrections / len(sel), 3) if sel else None,
        "miss_rate": round(missed / (len(sel) + missed), 3) if (sel or missed) else None,
    }


def analyse(db: Session, patient_id: str, hours: int = 72) -> dict:
    prof = db.get(AccessibilityProfile, patient_id)
    since = datetime.now(timezone.utc) - timedelta(hours=hours)
    events = list(db.scalars(select(InteractionEvent).where(
        InteractionEvent.patient_id == patient_id, InteractionEvent.ts >= since,
        InteractionEvent.event_type != "benchmark_task").order_by(InteractionEvent.ts)))

    current = [e for e in events if prof and e.calibration_version == prof.calibration_version]
    previous = [e for e in events if prof and e.calibration_version == prof.calibration_version - 1]
    m = _metrics(current)
    recs: list[dict] = []

    if prof and m["events"] >= MIN_EVENTS:
        scan_events = [e for e in current if e.input_mode in ("scan", "blink")]
        sm = _metrics(scan_events)
        if sm["miss_rate"] is not None and sm["miss_rate"] >= 0.3 and (sm["selections"] + sm["missed_scan_cycles"]) >= 4:
            new = min(int(prof.scan_interval_ms * 1.3 / 100) * 100, 6000)
            recs.append({
                "id": "scan_slower", "setting": "scan_interval_ms", "current": prof.scan_interval_ms, "suggested": new,
                "reason": f"{sm['missed_scan_cycles']} full scan cycles passed without a selection "
                          f"({int(sm['miss_rate'] * 100)}% miss rate). A slower scan may make targets easier to catch.",
            })
        if sm["correction_rate"] is not None and sm["correction_rate"] >= 0.3 and sm["selections"] >= 4:
            new = max(int(prof.scan_interval_ms * 1.2 / 100) * 100, prof.scan_interval_ms + 200)
            if not any(r["setting"] == "scan_interval_ms" for r in recs):
                recs.append({
                    "id": "scan_slower_corrections", "setting": "scan_interval_ms", "current": prof.scan_interval_ms,
                    "suggested": min(new, 6000),
                    "reason": f"{int(sm['correction_rate'] * 100)}% of selections were corrected — the highlight may be "
                              f"moving on before the intended item is selected.",
                })
        if m["blink_rejected"] >= 4 and prof.input_mode == "blink":
            recs.append({
                "id": "blink_hold_shorter", "setting": "blink_hold_ms", "current": prof.blink_hold_ms,
                "suggested": max(prof.blink_hold_ms - 100, 250),
                "reason": f"{m['blink_rejected']} deliberate-looking blinks were slightly too short to count.",
            })
        if m["correction_rate"] is not None and m["correction_rate"] >= 0.4 and prof.max_choices > 4:
            recs.append({
                "id": "fewer_choices", "setting": "max_choices", "current": prof.max_choices,
                "suggested": max(prof.max_choices - 2, 4),
                "reason": "Frequent corrections across inputs. Showing fewer choices at once may reduce errors.",
            })
        if (m["avg_selection_latency_ms"] or 0) > 9000 and not prof.simplified:
            recs.append({
                "id": "simplified", "setting": "simplified", "current": False, "suggested": True,
                "reason": "Selections are taking over 9 seconds on average. Simplified mode shows larger, fewer options.",
            })

    comparison = None
    if previous:
        pm = _metrics(previous)
        comparison = {"previous_version": prof.calibration_version - 1, "previous": pm,
                      "current_version": prof.calibration_version, "current": m}
    return {"metrics": m, "recommendations": recs, "calibration_comparison": comparison,
            "calibration_version": prof.calibration_version if prof else None, "window_hours": hours,
            "min_events_for_recommendations": MIN_EVENTS}
