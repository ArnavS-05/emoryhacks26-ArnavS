"""Database engine. Uses Tiger Data (PostgreSQL/TimescaleDB, TLS required) when configured,
otherwise a clearly-labelled local SQLite fallback so accessibility features keep working."""
from __future__ import annotations

from collections.abc import Iterator
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import create_engine, event
from sqlalchemy.engine import Engine
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from .config import get_settings


class Base(DeclarativeBase):
    pass


def normalize_postgres_url(raw: str) -> str:
    """Convert postgres:// URLs to SQLAlchemy psycopg3 URLs and enforce TLS."""
    parts = urlsplit(raw)
    scheme = "postgresql+psycopg"
    query = dict(parse_qsl(parts.query))
    if query.get("sslmode") not in {"require", "verify-ca", "verify-full"}:
        query["sslmode"] = "require"
    return urlunsplit((scheme, parts.netloc, parts.path, urlencode(query), parts.fragment))


def _build_engine() -> tuple[Engine, str]:
    s = get_settings()
    if s.tiger_database_url:
        url = normalize_postgres_url(s.tiger_database_url)
        eng = create_engine(url, pool_pre_ping=True, pool_size=5, max_overflow=5, connect_args={"connect_timeout": 10})
        return eng, "tigerdata"
    eng = create_engine(s.local_database_url, connect_args={"check_same_thread": False})

    @event.listens_for(eng, "connect")
    def _fk_on(dbapi_conn, _):  # pragma: no cover - sqlite pragma
        dbapi_conn.execute("PRAGMA foreign_keys=ON")

    return eng, "sqlite-fallback"


engine, DB_BACKEND = _build_engine()
SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def get_db() -> Iterator[Session]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


def is_postgres() -> bool:
    return DB_BACKEND == "tigerdata"
