"""Versioned, idempotent schema migrations.

Each migration runs once and is recorded in `schema_migrations`. TimescaleDB-specific steps
(hypertable, continuous aggregate, policies) run only on Tiger Data, never on the SQLite fallback.
"""
from __future__ import annotations

import logging
from collections.abc import Callable

from sqlalchemy import text
from sqlalchemy.engine import Connection

from . import models  # noqa: F401  (register tables)
from .db import Base, engine, is_postgres

log = logging.getLogger("synaphi.migrations")


def _m001_core(conn: Connection) -> None:
    Base.metadata.create_all(conn)


def _m002_timescale(conn: Connection) -> None:
    if not is_postgres():
        return
    conn.execute(text("CREATE EXTENSION IF NOT EXISTS timescaledb"))
    conn.execute(text(
        "SELECT create_hypertable('interaction_events', by_range('ts', INTERVAL '1 day'), "
        "if_not_exists => TRUE, migrate_data => TRUE)"
    ))
    conn.execute(text("CREATE INDEX IF NOT EXISTS ix_interaction_patient_ts ON interaction_events (patient_id, ts DESC)"))


def _m003_continuous_aggregate(conn: Connection) -> None:
    if not is_postgres():
        return
    # Continuous aggregates cannot be created inside a transaction block.
    conn.commit()
    raw = conn.connection.driver_connection
    prev = raw.autocommit
    raw.autocommit = True
    try:
        with raw.cursor() as cur:
            cur.execute("""
                CREATE MATERIALIZED VIEW IF NOT EXISTS session_interaction_5m
                WITH (timescaledb.continuous) AS
                SELECT time_bucket(INTERVAL '5 minutes', ts) AS bucket,
                       patient_id,
                       session_id,
                       input_mode,
                       calibration_version,
                       count(*) FILTER (WHERE event_type = 'selection') AS selections,
                       count(*) FILTER (WHERE event_type = 'selection' AND selection_success) AS successful_selections,
                       count(*) FILTER (WHERE event_type = 'correction') AS corrections,
                       count(*) FILTER (WHERE event_type = 'scan_cycle_missed') AS missed_cycles,
                       count(*) FILTER (WHERE event_type = 'message_confirmed') AS confirmed_messages,
                       avg(response_latency_ms) FILTER (WHERE event_type = 'selection') AS avg_selection_latency_ms,
                       avg(response_latency_ms) FILTER (WHERE event_type = 'message_confirmed') AS avg_composition_ms
                FROM interaction_events
                GROUP BY bucket, patient_id, session_id, input_mode, calibration_version
                WITH NO DATA
            """)
            cur.execute("""
                SELECT add_continuous_aggregate_policy('session_interaction_5m',
                    start_offset => INTERVAL '30 days', end_offset => NULL,
                    schedule_interval => INTERVAL '1 minute', if_not_exists => TRUE)
            """)
    finally:
        raw.autocommit = prev


def _m004_pairing_and_dwell(conn: Connection) -> None:
    Base.metadata.create_all(conn)  # creates pairing_tokens
    cols = {c["name"] for c in __import__("sqlalchemy").inspect(conn).get_columns("accessibility_profiles")}
    if "dwell_ms" not in cols:
        conn.execute(text("ALTER TABLE accessibility_profiles ADD COLUMN dwell_ms INTEGER DEFAULT 1000"))


MIGRATIONS: list[tuple[str, Callable[[Connection], None]]] = [
    ("001_core_schema", _m001_core),
    ("002_timescale_hypertable", _m002_timescale),
    ("003_session_continuous_aggregate", _m003_continuous_aggregate),
    ("004_pairing_tokens_and_dwell", _m004_pairing_and_dwell),
]


def run_migrations() -> list[str]:
    applied: list[str] = []
    with engine.connect() as conn:
        conn.execute(text(
            "CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(80) PRIMARY KEY, "
            "applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)"
        ))
        conn.commit()
        done = {r[0] for r in conn.execute(text("SELECT version FROM schema_migrations"))}
        for version, fn in MIGRATIONS:
            if version in done:
                continue
            log.info("applying migration %s", version)
            fn(conn)
            conn.execute(text("INSERT INTO schema_migrations (version) VALUES (:v)"), {"v": version})
            conn.commit()
            applied.append(version)
    return applied


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    print("applied:", run_migrations() or "nothing (up to date)")
