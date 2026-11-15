from __future__ import annotations

import time
from dataclasses import asdict

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from ..config import get_settings
from ..db import DB_BACKEND, get_db, is_postgres
from ..security import Principal, rate_limit, require_clinician
from ..services import gemini_service, typesense_service as ts

router = APIRouter(prefix="/api", tags=["system"])


@router.get("/health")
def health(db: Session = Depends(get_db)):
    t0 = time.perf_counter()
    db_ok = True
    try:
        db.execute(text("SELECT 1"))
    except Exception:
        db_ok = False
    return {"status": "ok" if db_ok else "degraded", "database": DB_BACKEND, "database_ok": db_ok,
            "db_latency_ms": round((time.perf_counter() - t0) * 1000, 1)}


@router.get("/status")
def public_status():
    """Coarse connection indicators (no secrets)."""
    return {
        "gemini": "configured" if gemini_service.configured() else "not_configured",
        "typesense": "connected" if ts.STATE["connected"] else ("configured" if ts.configured() else "not_configured"),
        "database": DB_BACKEND,
    }


@router.get("/system/inspect")
def inspect(db: Session = Depends(get_db), p: Principal = Depends(require_clinician)):
    s = get_settings()
    db_info: dict = {"backend": DB_BACKEND}
    try:
        db_info["server_version"] = db.execute(text("SELECT version()")).scalar() if is_postgres() else "sqlite"
        if is_postgres():
            db_info["timescaledb"] = db.execute(text(
                "SELECT extversion FROM pg_extension WHERE extname='timescaledb'")).scalar()
            db_info["hypertables"] = [dict(r) for r in db.execute(text(
                "SELECT hypertable_name, num_chunks FROM timescaledb_information.hypertables")).mappings()]
            db_info["continuous_aggregates"] = [r[0] for r in db.execute(text(
                "SELECT view_name FROM timescaledb_information.continuous_aggregates"))]
            db_info["ssl"] = db.execute(text("SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()")).scalar()
        db_info["migrations"] = [r[0] for r in db.execute(text("SELECT version FROM schema_migrations ORDER BY version"))]
        db_info["interaction_events"] = db.execute(text("SELECT count(*) FROM interaction_events")).scalar()
    except Exception as e:
        db_info["error"] = str(e)[:200]
    return {
        "gemini": {"configured": gemini_service.configured(), "text_model": s.gemini_text_model,
                   "live_model": s.gemini_live_model, "embedding_model": s.gemini_embedding_model,
                   "verified_models": gemini_service.STATUS.verified_models,
                   "calls": {k: asdict(v) for k, v in gemini_service.STATUS.calls.items()}},
        "typesense": {"configured": ts.configured(), "host_set": bool(s.typesense_host),
                      **{k: v for k, v in ts.STATE.items()}},
        "database": db_info,
        "app": {"env": s.app_env, "public_url": s.public_app_url or None, "vultr_host_set": bool(s.vultr_host)},
    }


@router.post("/system/verify-gemini", dependencies=[Depends(rate_limit("verify", 5))])
async def verify_gemini(p: Principal = Depends(require_clinician)):
    return await gemini_service.verify_models()


@router.post("/system/reindex", dependencies=[Depends(rate_limit("verify", 5))])
async def reindex(p: Principal = Depends(require_clinician)):
    return await ts.bootstrap(force=True)
