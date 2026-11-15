from __future__ import annotations

import logging
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from .api import analytics, auth, demo, documents, patients, search, sessions, system
from .config import ROOT, get_settings
from .db import SessionLocal
from .migrations import run_migrations
from .services import typesense_service

logging.basicConfig(level=logging.INFO, format="%(levelname)s %(name)s: %(message)s")
log = logging.getLogger("synaphi")


@asynccontextmanager
async def lifespan(app: FastAPI):
    applied = run_migrations()
    log.info("migrations applied: %s", applied or "none (up to date)")
    await typesense_service.bootstrap()
    log.info("typesense: connected=%s embedding=%s", typesense_service.STATE["connected"],
             typesense_service.STATE["embedding_mode"])
    with SessionLocal() as db:
        demo.ensure_synthetic_patients(db)
    yield


s = get_settings()
app = FastAPI(title="Synaphi API", version="1.0.0", lifespan=lifespan,
              docs_url=None if s.is_production else "/api/docs", openapi_url=None if s.is_production else "/api/openapi.json")

app.add_middleware(CORSMiddleware, allow_origins=s.cors_origins, allow_credentials=False,
                   allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"], allow_headers=["Authorization", "Content-Type"])


@app.middleware("http")
async def security_headers(request: Request, call_next):
    resp = await call_next(request)
    resp.headers["X-Content-Type-Options"] = "nosniff"
    resp.headers["Referrer-Policy"] = "no-referrer"
    resp.headers["X-Frame-Options"] = "DENY"
    resp.headers["Permissions-Policy"] = "camera=(self), microphone=(self), geolocation=()"
    return resp


@app.exception_handler(Exception)
async def unhandled(request: Request, exc: Exception):
    log.exception("unhandled error on %s", request.url.path)
    return JSONResponse(status_code=500, content={"detail": "Internal error — the patient board keeps working offline."})


for r in (auth.router, patients.router, documents.router, sessions.router, analytics.router, search.router,
          system.router, demo.router):
    app.include_router(r)
app.include_router(sessions.ws_router)

# Serve the built frontend (single-container deployment).
DIST = ROOT / "frontend" / "dist"
if DIST.exists():
    app.mount("/assets", StaticFiles(directory=DIST / "assets"), name="assets")

    @app.get("/{path:path}", include_in_schema=False)
    async def spa(path: str):
        f = (DIST / path).resolve()
        if path and f.is_file() and DIST.resolve() in f.parents:
            return FileResponse(f)
        return FileResponse(DIST / "index.html")
