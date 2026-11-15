# Synaphi — status report (Nov 14 2026, late evening ET)

## ✅ Working and tested (automated and/or live)

- Two-panel real-time care session over WebSockets: question → patient device p50 0.98 s, confirmation → clinician p50 0.20 s (live services)
- Patient board: touch, keyboard (roving focus), **single-switch two-level scanning** (E2E: Space-only answer), **dwell** (E2E, no chained selections)
- Signature pain flow: body region → body-diagram sub-area → 0–10 intensity → quality → review → Confirm and Speak
- Deterministic multilingual message composition (en/es/fr/hi/zh); live Gemini translation of questions/options (E2E: English ↔ Spanish across two devices)
- Urgent Help independent of AI (local alarm + speech + clinician alert)
- Gemini (live): question interpretation (`gemini-3.1-flash-lite`), translation, multimodal document extraction (fictional prescription 9/9, med list 6/6), clinician copilot, encounter draft (`gemini-3.5-flash`), embeddings; verified model chain + labelled fallbacks
- Document review: unverified-until-approved, source excerpt + confidence + document provenance, wrong-patient warning
- Typesense (live): 138-phrase hybrid collection with built-in embeddings, synonym set, filters/facets, context re-ranker, patient-scoped verified context; Search Inspector
- Tiger Data (live): all tables, `interaction_events` hypertable, `session_interaction_5m` continuous aggregate, TLS, versioned migrations (4)
- Adaptive engine: suggestions from real events; applied only after explicit confirmation; calibration-version comparison
- Role-based auth (clinician vs session-scoped patient), single-use QR pairing links, rate limits, audit log, CSP and security headers, secret scan
- Clinician workspace: dashboard, new patient, record + documents, sessions, analytics, benchmark (records human runs), tech inspection, judge `/demo`
- Production serving mode (built SPA + CSP) verified locally with both E2E suites

Tests: 16 pytest · 12 vitest · 2 Playwright E2E flows · latency script.

## ⚠️ Implemented but not fully verified

- **Blink and head-gesture control** — MediaPipe model + WASM load under production CSP and run detection (fake camera reports "Face not detected" as expected); detector logic unit-tested. **Needs testing with a real webcam and a person.**
- **Residual-speech input and clinician dictation** — browser Web Speech API (Chrome/Edge); not automatable here.
- **Speech output** — invoked correctly; audible voice depends on the demo machine's installed voices.
- **Docker / Compose / Caddy / Vultr script** — written; not executed (no Docker locally, no Vultr instance).

## ❌ Incomplete / not built

- Coarse gaze tracking (optional in brief) — not built; dwell supports eye-tracker cursors instead.
- Human benchmark results (static board vs Synaphi) — tool exists, no human runs recorded.
- Native-speaker review of static translations; screen-reader audit.
- Horizontal scaling (WebSocket hub is in-process; single worker).

## ⛔ Blocked (needs the team)

| Item | Blocker | Next step |
|---|---|---|
| Vultr deployment / live URL | No Vultr instance | Create instance → `docs/DEPLOYMENT.md` (≈10 min) |
| Credential rotation | Keys were pasted in chat | Rotate Gemini, Typesense (admin + search), Tiger password; update server `.env` |
| Gemini Live API | No `bidiGenerateContent` model on this key (404) | Request Live access or use another key; browser speech recognition is the working fallback |
| `gemini-3.8-flash` | 504 DEADLINE_EXCEEDED for this key | Automatic fallback to 3.5 Flash / 3.1 Flash-Lite already in place |
| Entire checkpoints on entire.com | Requires `entire login` (interactive) + a **private** checkpoint repo; redemption code purpose undocumented | `entire login`; create private repo; `entire configure --checkpoint-remote github:<owner>/<repo>`; redeem the code on entire.com / ask MLH |
| Coder workspace evidence | Development happened locally | Open the repo in the Coder Tech Stack Builder workspace and run it (commands in `docs/INTEGRATIONS.md`) |
| GoDaddy domain | Availability/eligibility unverified | Check names in `docs/INTEGRATIONS.md`, register, point A record at Vultr |
| Real-webcam validation | Needs a person at a camera | `/demo` → Settings → Blink → Enable camera → Calibrate |

## Before judging
1. `backend/.venv/Scripts/python scripts/reset_activity.py --yes` (clears test activity so dashboards show only real use)
2. Set `ENABLE_DEMO=true` only while judging.
3. Rehearse `docs/DEMO_SCRIPT.md` once (scan timing).
