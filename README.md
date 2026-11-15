# Synaphi

**Every patient deserves to be understood.** A clinician/patient communication prototype built for EmoryHacks, with real server-side Gemini, Typesense, and Tiger Data integrations.

## Run

Requires Node.js 22+ and a Tiger Cloud PostgreSQL service with TimescaleDB. This is a Node application suitable for a Vultr VM/container; it is not a static GitHub Pages site.

1. `npm install`
2. Supply the variables in `.env.example` through your host's secret manager or an ignored local `.env`. Never use `VITE_`/browser-exposed variables for secrets.
3. `npm run setup` — applies the idempotent database schema and embeds/indexes the curated search corpus. Requires permission to enable TimescaleDB and create tables.
4. `npm start` — open `http://localhost:3000`.
5. `npm test` and, with real credentials, `npm run verify:live`.

Set `APP_ORIGIN` to the exact external origin, without a trailing slash. Production requires HTTPS and `NODE_ENV=production` for Secure cookies. `CLINICIAN_PASSWORD` must be at least 16 characters. `TYPESENSE_HOST` is a hostname only, without `https://` or port; HTTPS port 443 is used. The Typesense admin key remains on the server. `DATABASE_URL` must be a PostgreSQL URI; certificate verification is always enabled even if the supplied URI uses `sslmode=require`. Supply `DATABASE_CA` only when your service uses a private CA. Secrets are never logged by application handlers.

## Communication workflow

1. Clinician signs in, creates a synthetic patient profile, selects the language and enters communication needs.
2. Open a session and choose **Pair patient display**. Open its one-use, 10-minute link on a separate patient browser/device. Pairing secrets are URL fragments, cleared immediately on load, and exchanged for an HttpOnly cookie.
3. Send a clinician question. The original is persisted immediately. Gemini translates it into the patient's language. Patient messages are translated into English. Both devices synchronize every 1.5 seconds. Failed translations have an explicit retry control.
4. The patient responds by typing, speech recognition, response card, pointer dwell, or single-switch scanning. Cards and voice commands require confirmation before sending. Settings persist per patient.
5. **Find relevant choices** uses real Gemini query embeddings plus Typesense hybrid keyword/vector search. The clinician's search also shows source links for curated medical communication context.
6. Generate a conversation insight or upload a PNG/JPEG/PDF prescription, up to 5 MB. Gemini receives recent history and retrieved context, and returns a draft. Approve/reject controls are clinician-only; drafts are never exposed on the patient panel. Files are sent directly to Gemini and not stored locally.
7. Review interaction counts, confirmations, and average interaction duration from the Tiger Data hypertable. End the session to revoke further patient access.

## Accessibility

- Keyboard-focusable controls, large cards, responsive layouts, live conversation region, high-contrast colors, optional larger text, and text-to-speech.
- **Dwell:** hold a pointer (including an OS head-controlled pointer) over a choice, then over Confirm or Cancel. Adjustable 600–5000 ms timing.
- **Scan:** cards cycle at the selected interval. With focus outside a text/form control, press Space or use a switch mapped to Space. Confirmation/cancel also scan.
- **Voice:** start the microphone explicitly, then select Voice control in preferences. Say “choose one” through “choose six”, “confirm”, or “cancel”; free speech becomes a proposed response. Command words are currently English; dictation uses the patient's chosen language. Chrome/Edge speech support and microphone permission are required. Browser speech recognition may use the browser vendor's service.
- This version does **not** implement webcam blink/gesture detection or Gemini Live bidirectional audio. It uses real Gemini text/multimodal inference with browser speech input/output and near-real-time message synchronization.

## Services and data

| Service | Implementation |
| --- | --- |
| Gemini | REST `generateContent` for translation and multimodal prescription/insight drafts; `gemini-embedding-001` for normalized 768-dimensional retrieval embeddings. Model IDs are configurable. |
| Typesense | Dedicated `synaphi_context_v1` collection; keyword + vector rank fusion with `alpha=0.5`; only `verified=true` records returned. |
| Tiger Data | PostgreSQL profiles, sessions, hashed authentication/pairing tokens, messages, settings, review decisions, and TimescaleDB interaction-event hypertable. Parameterized queries and verified TLS. |

The small bundled corpus contains authored response choices and paraphrased communication guidance from [NIDCD](https://www.nidcd.nih.gov/health/aphasia) and [MedlinePlus](https://medlineplus.gov/talkingwithyourdoctor.html), reviewed against those pages on 2026-11-14. “Verified” identifies this curated seed set, not medical certification or validation of AI output. Extend `data/context.json` only after source review; rerun setup to re-embed. Do not change the embedding model without rebuilding the collection. No patient text is indexed in Typesense; search query text is sent to Gemini and Typesense.

## Verification status

Automated tests use explicit test-only adapters for provider responses and storage, and inject requests into the actual HTTP handler without TCP. They cover role isolation, one-use pairing, origin checks, duplicate request IDs, conversation persistence, translation failure, settings, analytics, draft visibility/review, session end, redacted errors, multimodal request format, and hybrid-search parameters. They are not evidence of live provider connectivity or SQL execution.

The live verification script creates only labeled synthetic data, checks the real database, two-device API conversation, translation, search, settings, analytics and insight approval, then removes its test records. It exits nonzero when credentials are missing. Prescription accuracy and assistive controls require manual browser testing.

At initial implementation, rotated credentials were not provided; outbound DNS and local TCP client access were restricted in the development environment. Live API checks, dependency installation, actual database migrations, and visual/browser/hardware verification remain pending. There is no production mock-response fallback.

## Deployment and scope

`docker build -t synaphi .` then run with environment variables and a reverse proxy providing HTTPS. Run setup once before serving requests. Keep the database and search services private behind their credentials. Do not commit `.env`; `.dockerignore` also excludes it. Automated CI runs tests and JavaScript syntax checks on pushes.

This is a **single-clinic hackathon prototype using one shared clinician credential**, not a clinical production system or a HIPAA-compliant product. Use synthetic data. Before real patient use, add individual clinician identity and MFA, organization-level authorization, formal audit/retention policies, consent and vendor agreements, accessibility evaluation, clinical validation, robust shared rate limiting, and operational monitoring. Translation and prescription analysis can be wrong; review originals and involve a qualified clinician/interpreter. No autonomous diagnosis, medication change, or treatment decision is made by this app.
