"""Role-based access: signed bearer tokens for clinicians and session-scoped patient tokens."""
from __future__ import annotations

import time
from collections import defaultdict, deque
from dataclasses import dataclass

from fastapi import Depends, HTTPException, Request, status
from itsdangerous import BadSignature, SignatureExpired, URLSafeTimedSerializer
from sqlalchemy.orm import Session

from .config import get_settings
from .db import get_db
from .models import AuditEvent

TOKEN_MAX_AGE_S = 12 * 3600


@dataclass
class Principal:
    role: str  # clinician | patient
    name: str
    session_id: str | None = None
    patient_id: str | None = None


def _serializer() -> URLSafeTimedSerializer:
    return URLSafeTimedSerializer(get_settings().signing_secret, salt="synaphi-auth")


def issue_token(p: Principal) -> str:
    return _serializer().dumps({"r": p.role, "n": p.name, "s": p.session_id, "p": p.patient_id})


def decode_token(token: str) -> Principal:
    try:
        d = _serializer().loads(token, max_age=TOKEN_MAX_AGE_S)
    except SignatureExpired as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired — sign in again") from e
    except BadSignature as e:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid credentials") from e
    return Principal(role=d["r"], name=d["n"], session_id=d.get("s"), patient_id=d.get("p"))


def current_principal(request: Request) -> Principal:
    auth = request.headers.get("authorization", "")
    if not auth.lower().startswith("bearer "):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Authentication required")
    return decode_token(auth[7:].strip())


def require_clinician(p: Principal = Depends(current_principal)) -> Principal:
    if p.role != "clinician":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Clinician access required")
    return p


def require_session_access(session_id: str, p: Principal) -> None:
    """Clinicians may access any session; patients only their own."""
    if p.role == "clinician":
        return
    if p.role == "patient" and p.session_id == session_id:
        return
    raise HTTPException(status.HTTP_403_FORBIDDEN, "Not permitted for this session")


def audit(db: Session, p: Principal | None, action: str, resource: str = "", **detail) -> None:
    db.add(AuditEvent(actor_role=p.role if p else "system", actor=p.name if p else "", action=action,
                      resource=resource, detail=detail))


# ---- Simple in-memory rate limiting (per client IP + bucket) ----
_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(bucket: str, limit: int, window_s: float = 60.0):
    def dep(request: Request) -> None:
        ip = request.client.host if request.client else "unknown"
        key = f"{bucket}:{ip}"
        q = _hits[key]
        t = time.monotonic()
        while q and t - q[0] > window_s:
            q.popleft()
        if len(q) >= limit:
            raise HTTPException(status.HTTP_429_TOO_MANY_REQUESTS, "Too many requests — please slow down")
        q.append(t)

    return dep


DbDep = Depends(get_db)
