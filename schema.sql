BEGIN;
CREATE EXTENSION IF NOT EXISTS timescaledb;
CREATE TABLE IF NOT EXISTS patients (
 id uuid PRIMARY KEY, name text NOT NULL, language text NOT NULL,
 notes text NOT NULL DEFAULT '', settings jsonb NOT NULL DEFAULT '{"mode":"touch","dwellMs":1500,"speak":true,"largeText":false}', created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (id uuid PRIMARY KEY, patient_id uuid NOT NULL REFERENCES patients(id), active boolean NOT NULL DEFAULT true, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS auth_sessions (token_hash text PRIMARY KEY, role text NOT NULL CHECK(role IN ('clinician','patient')), session_id uuid REFERENCES sessions(id), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS pairings (token_hash text PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id), expires_at timestamptz NOT NULL);
CREATE TABLE IF NOT EXISTS messages (id bigserial PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id), role text NOT NULL CHECK(role IN ('clinician','patient')), body text NOT NULL, translation text, translation_status text NOT NULL DEFAULT 'pending', request_id uuid NOT NULL, created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(session_id,request_id));
CREATE INDEX IF NOT EXISTS messages_session ON messages(session_id,id);
CREATE TABLE IF NOT EXISTS insights (id uuid PRIMARY KEY, session_id uuid NOT NULL REFERENCES sessions(id), kind text NOT NULL, body text NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','approved','rejected')), reviewed_by text, reviewed_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE IF NOT EXISTS interaction_events (time timestamptz NOT NULL DEFAULT now(), session_id uuid NOT NULL REFERENCES sessions(id), method text NOT NULL, action text NOT NULL, duration_ms integer NOT NULL CHECK(duration_ms BETWEEN 0 AND 600000));
SELECT create_hypertable('interaction_events', 'time', if_not_exists => TRUE);
CREATE INDEX IF NOT EXISTS events_session_time ON interaction_events(session_id,time DESC);
COMMIT;
