# Sponsor technology integrations

Each section states what is **live and verified**, how it is used, and what is not done. Live state can be inspected at `/inspect` on a running instance.

## Google Gemini (MLH Gemini API)

**SDK:** official `google-genai` (Python). All calls use Pydantic `response_schema` structured output with validation, one retry on malformed JSON, timeouts, sanitized errors (keys never logged), and a model fallback chain with a 120 s circuit breaker.

| Use | Model (verified) | Where |
|---|---|---|
| Clinician question interpretation: intent, response type, search keywords, categories, plain-language + translated question | `gemini-3.1-flash-lite` (p50 819 ms over 12 live calls) | `services/gemini_service.py: classify_question` |
| Translation of answer options and composed text | `gemini-3.1-flash-lite` | `translate_batch` |
| Prescription / medication-list extraction from PNG, JPG, PDF (multimodal) | `gemini-3.5-flash` (9/9 and 6/6 fields on fictional documents) | `extract_document` |
| Clinician copilot: confirmed concerns, verified history, inconsistencies, missing info, follow-up questions, attributed considerations | `gemini-3.5-flash` | `copilot` |
| AI-assisted encounter draft | `gemini-3.5-flash` | `encounter_draft` |
| Embeddings (fallback vector mode for Typesense) | `gemini-embedding-001` | `embed` |

**Model verification (real calls, Nov 14 2026):** `gemini-3.1-flash-lite` ok (508 ms), `gemini-3.5-flash` ok (3.3 s), `gemini-embedding-001` ok, `gemini-3.8-flash` **504 DEADLINE_EXCEEDED**, `gemini-2.5-flash` retired for new keys, `gemini-3.8-live` **404 — no Live (`bidiGenerateContent`) model is available to this key**. The Live API verification code exists (`verify_live`) but Live is **not** claimed as working; clinician speech uses the browser's speech recognition.

**Safety:** prompts forbid answering for the patient, diagnosing, or prescribing. Document fields are stored **unverified**. Copilot considerations must cite their basis. MediaPipe — not Gemini — handles blink detection.

## Typesense (sponsor challenge)

**Cluster:** Typesense Cloud 30.2. All admin operations are backend-only.

- **`communication_phrases`** — 138 curated, general-purpose patient phrases across 12 categories with `synonyms`, `intent_tags`, `anatomical_region`, `response_type`, `pictogram_id`, `safety_priority`, and an auto-generated **`embedding`** (built-in `ts/all-MiniLM-L12-v2` over text + synonyms).
- **Synonym set** `synaphi-medical` (belly/stomach/abdomen/tummy, pee/toilet/bathroom, …).
- **`patient_context`** — only clinician-verified records and approved notes, always filtered server-side by `patient_id`.

**Context-Aware Accessible Search** (`services/typesense_service.py`): Gemini's intent and categories become `filter_by` (`intent_tags`, `category`, `response_type`, `language`), the keywords become `q` (stopwords removed), and hybrid search runs with `vector_query alpha 0.6`, typo tolerance (`num_typos 2`), prefix search, weighted fields, and facets. Synaphi then re-ranks with an explicit, inspectable score: Typesense position + intent match + category match + patient preference + safety priority. The **Search Inspector** (`/clinician/search`) shows query, filters, facets, server time, round trip, and keyword-vs-hybrid results side by side with every score component.

**Measured:** server-side search time p50 15 ms / p95 19 ms; backend round trip p50 39 ms.

## Tiger Data (MLH)

**Service:** Tiger Cloud PostgreSQL 18.6 with TimescaleDB 2.32; TLS enforced (`sslmode=require`, verified via `pg_stat_ssl`).

- All application tables (patients, records, documents with provenance, sessions, conversation turns, confirmed messages, notes, audit log, pairing tokens).
- **`interaction_events` hypertable** (1-day chunks): timestamp, patient, session, input mode, event type, response latency, success, errors, scan interval, calibration version, context JSON.
- **`session_interaction_5m` continuous aggregate** (5-minute buckets per patient/session/input mode/calibration version; refresh policy every minute) — read directly by `/clinician/analytics`.
- Powers the analytics dashboard (composition time, selection success, corrections, missed scan cycles, mode usage, calibration impact) and the adaptive engine.
- Versioned migrations; health check at `/api/health`.

## Vultr (MLH)

Prepared, **not yet deployed** (no Vultr instance available yet). `Dockerfile` (multi-stage, non-root, healthcheck), `docker-compose.yml` (app + Caddy automatic HTTPS), `deploy/vultr-setup.sh` (one command on a fresh Ubuntu instance). Production mode was verified locally (`APP_ENV=production`, built SPA, CSP) with both E2E suites passing. See [DEPLOYMENT.md](DEPLOYMENT.md).

## Entire (MLH)

- Entire CLI **0.13.4** installed from the official installer (checksum verified) and enabled for Claude Code (`entire enable --agent claude-code`), git hook with absolute path.
- **Checkpoints are kept local** (`push_sessions: false`, push policy `manual`) because this repository is public and agent transcripts from this session contain credentials pasted during setup. Custom redaction regexes were added for this project's credential formats on top of default Betterleaks redaction.
- To publish checkpoints safely: create a **private** repo, then `entire login`, `entire configure --checkpoint-remote github:<owner>/<private-repo>`, review with `entire checkpoint explain`, then `entire checkpoint push --all`.
- The provided Entire code: the official docs describe no CLI redemption/invite-code step, and new-account trial credits are currently paused. It is most likely an account credit/invite to redeem on entire.com — it has **not** been used and is not stored in the repo.
- Limitation: Claude Code hooks look up `entire` on PATH; the session in which Entire was installed predates the PATH update, so its turns were not captured. New terminals/sessions are.

## Coder (Coder for Good)

The application was built locally on the team's machine; **Coder workspace usage is not yet evidenced by this build.** To develop/run in a Coder Tech Stack Builder workspace (Node + Python):

```bash
git clone https://github.com/ArnavS-05/emoryhacks26-ArnavS.git && cd emoryhacks26-ArnavS
cp .env.example .env   # add keys via Coder workspace secrets / env, not committed
cd backend && python3 -m venv .venv && .venv/bin/pip install -r requirements.txt && .venv/bin/uvicorn app.main:app --host 0.0.0.0 --port 8000 &
cd ../frontend && npm ci && npm run dev -- --host 0.0.0.0
```

Coder for Good judging focuses on impact, innovation, UX and completion — see [ACCESSIBILITY.md](ACCESSIBILITY.md) for the accessibility work.

## GoDaddy Registry (domain)

Custom domains are supported by setting `DOMAIN` for Caddy (automatic Let's Encrypt). Name ideas — **availability and challenge eligibility not verified**: `synaphi.health`, `synaphi.care`, `getsynaphi.com`, `synaphi.us`. Point an A record at the Vultr instance and run `DOMAIN=<name> docker compose up -d`.
