# Privacy, clinical safety, and security

Synaphi is a hackathon prototype. It is **not** a certified medical device, makes **no** HIPAA-compliance or clinical-effectiveness claims, and the public demo uses **synthetic patients only**.

## Clinical safety rules (enforced in code)

| Rule | Enforcement |
|---|---|
| Patient confirms every communicated statement | `POST /sessions/:id/messages` accepts only patient tokens (demo sessions excepted for split-screen); UI speaks only after "Confirm and Speak" |
| No invented symptoms / no AI-authored patient speech | Messages are built from static templates + explicit selections (`composer.ts`, unit-tested). Gemini output is used only to choose which options to *offer* |
| No inferred consent | No consent intent or auto-answers; "I have a question before agreeing" is an explicit phrase |
| No autonomous prescribing or diagnosis | Prompts forbid it; copilot output is clinician-only, labelled, and every consideration must cite its basis |
| Clinician review of AI summaries | Encounter drafts are editable and labelled "AI-assisted clinical encounter draft"; only explicit approval stores them as context |
| Source attribution for document-derived facts | Each extracted field stores source document, verbatim excerpt, confidence, and stays **unverified** until approved/rejected by a named clinician |
| Wrong-patient protection | Upload warns when the name on the document doesn't match the record |
| Patient can correct or reject AI interpretation | Back, Start over, "That is not what I meant", "Explain simpler", free choice of any core-board phrase |
| Help independent of AI | Local alarm + speech + clinician alert; no Gemini/Typesense dependency |
| Accessible fallback when AI fails | Rule-based interpreter and local search keep the board working; fallbacks are visibly labelled |

## Privacy

- No raw camera frames leave the device or are stored; MediaPipe runs in the browser. Camera/mic need explicit user action and browser permission.
- No patient data is used to train models. Gemini is used via API for inference only; context is passed per request.
- Patient devices receive only name, language, and accessibility settings — never the medical record.
- Minimal data: synthetic records, interaction metrics, confirmed messages.

## Security

- Secrets only in server-side environment (`.env`, gitignored; `.env.example` has names only). Typesense admin key never reaches the browser.
- `scripts/secret_scan.py` runs before every push (Google keys, credentialed Postgres URLs, private keys, env assignments).
- Role-based access: clinician tokens (signed, 12 h) vs session-scoped patient tokens; WebSocket requires a valid token for that session (close code 4401 otherwise). Tests cover forged tokens, cross-session access, patients reading records, clinicians confirming on a patient's behalf.
- One-time pairing links: only the SHA-256 hash is stored; single use; 10-minute expiry; token stripped from the URL on load.
- Clinician access code compared in constant time; login, join, AI and upload endpoints rate-limited.
- Uploads: type allow-list with magic-byte check, 10 MB cap.
- Headers: CSP (allows only `'self'`, WASM for MediaPipe), `X-Frame-Options: DENY`, `nosniff`, `no-referrer`, restrictive `Permissions-Policy`, `no-store` on API responses, HSTS via Caddy.
- Audit log for logins, record views, context changes, document uploads, message confirmations, help requests, setting changes, AI generations.
- Tiger Data connections require TLS.
- API docs disabled in production.

## Known limitations / required before any real use

- **Rotate all credentials** that were shared in chat during setup before a public deployment.
- `ENABLE_DEMO=true` lets anyone start a demo session and receive a demo clinician token scoped to the same synthetic data; disable it outside judging.
- In-memory rate limiting and WebSocket hub (single instance).
- Static translations should be reviewed by native-speaking clinicians.
- No formal accessibility audit with patients yet; real-webcam validation of blink/head control is pending.
