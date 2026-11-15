# Devpost submission — Synaphi

**Title:** Synaphi — Hands-free communication for patients who can't speak

**Tagline:** A clinician asks. The patient answers with a blink, a switch, or a glance, and only what they confirm is spoken.

**Tracks / challenges:** Healthcare · Coder for Good · Typesense · Gemini API · Tiger Data · Vultr · Entire · GoDaddy Registry · DEV Writing

---

## Inspiration

In an ICU, a ventilated patient is asked "Where does it hurt?" and can only shake their head. Stroke, ALS, aphasia, intubation, hearing loss, and language barriers leave many patients unable to tell their care team what's wrong. Laminated picture boards are slow, generic and monolingual, and clinicians end up guessing. We wanted a patient to answer that question accurately, in their own language, using whatever movement they still control.

## What it does

Synaphi is a two-panel, real-time communication platform:

- **The clinician** types, dictates, or taps a question.
- **Gemini** interprets it (intent, response type, plain-language version, translation) only to decide which answers to offer.
- **Typesense** retrieves the best answers from a 138-phrase medical communication library with context-aware hybrid search.
- **The patient** sees large pictogram cards in their language and answers with switch scanning, deliberate blinks, head gestures, dwell, residual speech, keyboard or touch. For pain they pick the area on a body diagram, then intensity, then quality.
- The patient reviews the sentence and chooses **Confirm and Speak**. Only then is it spoken aloud and delivered to the clinician, in the clinician's language.
- **Tiger Data** records every selection, correction and missed scan cycle as time-series data. That powers analytics and *suggested* accessibility adjustments, which are never applied without confirmation.
- Clinicians also get Gemini document extraction from prescriptions and medication lists (every field unverified until approved, with source excerpts and a wrong-patient check), a clinician-only copilot, and an editable AI-assisted encounter draft.
- A Help button works with every AI service offline.

## How we built it

- **Frontend:** React 19, TypeScript, Tailwind v4, Zustand, MediaPipe Face Landmarker running entirely in the browser, and browser speech APIs. Atkinson Hyperlegible Next is used for patients.
- **Backend:** FastAPI, Pydantic structured outputs, SQLAlchemy, WebSockets, and signed role-scoped tokens.
- **Gemini:** `gemini-3.1-flash-lite` for real-time interpretation and translation (p50 819 ms), `gemini-3.5-flash` for multimodal document extraction, copilot and notes, and `gemini-embedding-001`. A model fallback chain with a circuit breaker and labelled rule-based fallbacks keeps it running.
- **Typesense Cloud:** a phrase collection with built-in `all-MiniLM-L12-v2` embeddings, a synonym set, intent/category/response-type filters, hybrid `vector_query`, facets, and a patient-scoped verified-context collection. On top sits an explainable re-ranker and a Search Inspector that compares keyword and hybrid results.
- **Tiger Data:** PostgreSQL 18 + TimescaleDB, an `interaction_events` hypertable, a 5-minute continuous aggregate, TLS, and versioned migrations.
- **Deployment:** a multi-stage Dockerfile, Docker Compose with Caddy automatic HTTPS, and a one-command Vultr setup script.
- **Entire:** CLI enabled for Claude Code with local checkpoints and custom redaction.

## Challenges we ran into

- **Model availability.** `gemini-3.8-flash` returned 504s and no Live API model was available to our key. We built a verified model chain, moved real-time work to Flash-Lite, and stopped claiming Live support.
- **Blinks.** Telling deliberate blinks from involuntary ones took both-eye blendshapes, a hold threshold, hysteresis, cooldowns and calibration, all unit-tested without a camera.
- **Keeping AI out of the patient's mouth.** Messages are assembled by a deterministic state machine from explicit selections and pre-translated templates, so the spoken sentence is exactly what the patient chose.
- **Real-time races.** Remote-database latency exposed a presence race and a speech-pause bug. Our E2E suite caught both and we fixed them.

## Accomplishments we're proud of

- A complete loop from question to confirmed spoken answer: p50 under 1 s for the question to reach the patient and 0.2 s for the answer to reach the clinician.
- One switch can operate the whole interface, Help included.
- Live multimodal extraction got 15/15 fields right on our fictional prescription and medication list, every one kept unverified with provenance.
- An English clinician and a Spanish-speaking patient on separate devices, paired by a single-use QR code.

## What we learned

The interface determines whether a patient can be heard at all. Every AI output needs a visible label and a human checkpoint, and fallbacks have to exist before the demo needs them.

## What's next for Synaphi

- Real-webcam and switch-user testing with occupational and speech therapists.
- Eye-gaze support with certified trackers via dwell.
- Native-speaker review of translations.
- Deployment on hospital tablets with EHR integration (FHIR) for verified context.
- A pilot with an ICU or rehab unit, measuring time-to-communicate against current boards.

## Impact & startup potential

Communication-vulnerable patients face higher risk of adverse events, and existing AAC devices are expensive, slow to set up and rarely available at the bedside. Synaphi runs on any tablet with a browser and camera, needs no special hardware for switch, blink, head or dwell access, and fits the clinician's workflow. Possible routes to market: per-bed SaaS for hospitals and rehab centers, an add-on for nurse-call or EHR vendors, and home-care licensing for families and caregivers.

## Sponsor-specific notes

- **Coder for Good:** Accessibility is the product. It offers seven input methods, calibration, an adaptive engine with explicit consent, cognitive simplification, five languages, and high contrast and reduced motion. See `docs/ACCESSIBILITY.md`.
- **Typesense:** Search sits in the middle of every conversation. Gemini's intent becomes filters, and hybrid retrieval plus explainable re-ranking produce the answers a patient sees. The Search Inspector exposes every score.
- **Gemini:** It handles real-time interpretation, translation, multimodal extraction, a grounded copilot and encounter drafts, all with structured output, verified models and labelled fallbacks.
- **Tiger Data:** A hypertable and continuous aggregate of accessibility interactions drive analytics and personalization.
- **Vultr:** Containerized and ready for production HTTPS deployment; it will be deployed as soon as an instance is available.
- **Entire:** Session checkpoints are captured locally with redaction; publishing goes to a private repo.

## Built with

react · typescript · vite · tailwindcss · zustand · mediapipe · fastapi · python · pydantic · sqlalchemy · websockets · google-gemini · typesense · timescaledb · tiger-data · postgresql · docker · caddy · vultr · playwright · entire

## Honest status

See `docs/STATUS.md`. Blink and head tracking are unit-tested and load correctly, but haven't yet been validated with a real webcam. The Live API is unavailable to our key. Vultr deployment is pending an instance. No human benchmark results are claimed.
