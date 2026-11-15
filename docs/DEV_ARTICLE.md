---
title: "Building Synaphi: letting patients who can't speak answer 'Where does it hurt?'"
published: false
tags: accessibility, ai, healthcare, hackathon
---

*Draft for the DEV Writing Challenge. EmoryHacks 2026.*

A ventilated patient can hear every word their doctor says and still have no way to answer. In one night we built **Synaphi**, a two-panel web app. A clinician asks a question. The patient answers with whatever they can still control: a single switch, a deliberate blink, a head turn, resting a pointer, a short word, or a tap. Only the sentence the patient confirms is spoken aloud.

This post covers the engineering decisions that made it work, and the places where we chose not to let AI decide.

## 1. AI chooses what to offer, never what to say

Using an LLM to "understand" a patient and speak for them would have been easy. We think it would also be dangerous. Synaphi splits the work:

- **Gemini** reads the *clinician's* question and returns structured JSON (a Pydantic schema): intent, response type, search keywords, a plain-language version and a translation.
- **Typesense** uses that intent to pick which answers to *offer*.
- **The patient's message** comes from a pure TypeScript state machine. It joins pre-translated templates with the patient's explicit selections:

```ts
s = chooseRegion(s, 'stomach', ctx)        // "I have pain in my stomach"
s = chooseSub(s, SUB_REGIONS.stomach[0])   // ", upper right."
s = chooseIntensity(s, 6, ctx)             // "My pain is 6 out of 10."
s = chooseQuality(s, 'sharp', ctx)         // "It feels sharp."
```

Because it's deterministic, the Spanish the patient reads and the English the clinician hears are both exact. We test that with unit tests instead of hoping.

## 2. One switch must reach everything

Switch users can only say "now". Linear scanning through 15 buttons is exhausting, so we implemented **two-level row scanning**: groups first (Help → answers → quick replies → controls), then items within the chosen group. Help is the first group in every cycle. Each full cycle without a selection is logged as a `scan_cycle_missed` event, and that turns out to be the most useful signal for personalization.

## 3. Blinks are not commands (most of the time)

People blink 15–20 times a minute. We use MediaPipe Face Landmarker *in the browser* (no frames leave the device) and take the **minimum** of the left and right `eyeBlink` blendshapes, so one-eyed squints don't count. A selection needs:

- closure above a calibrated threshold, held for **400 ms** (involuntary blinks last about 100–250 ms)
- hysteresis, so flicker near the threshold doesn't reset the hold
- a 1.2 s cooldown
- the eyes to open before another selection can happen

Near-misses (held 60–100 % of the required time) are reported as `blink_rejected` events. If they pile up, the adaptive engine *suggests* a shorter hold. All of this lives in pure functions with Vitest tests, so we could iterate without sitting in front of a webcam.

## 4. Search is the conversation

Our 138 phrases live in a Typesense Cloud collection with built-in embeddings (`ts/all-MiniLM-L12-v2`) generated from text and synonyms. Gemini's intent becomes `filter_by`, and hybrid search blends keyword and vector scores. Then we re-rank with an explicit formula (Typesense position + intent match + category + patient preference + safety priority). The Search Inspector shows every component, and server-side search runs at p50 15 ms.

## 5. Accessibility data is time-series data

Every selection, correction, missed cycle and confirmed message goes into a TimescaleDB **hypertable** on Tiger Data, along with the patient's current `calibration_version`. A continuous aggregate rolls it into 5-minute buckets. When a caregiver accepts a suggestion (say, scan interval 1.2 s → 1.6 s), the version increments and the analytics page compares before and after. Suggestions are never applied silently.

## 6. Plan for the model you don't get

Our key listed `gemini-3.8-flash`, but it returned `504 DEADLINE_EXCEEDED`, and no Live API model was available. So we built a model chain with a circuit breaker:

```python
for m in model_chain(primary):        # skips models that failed in the last 120 s
    try:
        return await _attempt(schema, m, contents, cfg, timeout), m
    except asyncio.TimeoutError:
        _cooldown[m] = time.monotonic() + COOLDOWN_S
```

Real-time interpretation runs on `gemini-3.1-flash-lite` (p50 819 ms) with a 5 s cap, then falls back to a rule engine. Every result carries an `engine` field, and the UI shows an amber **Fallback** badge whenever AI wasn't involved.

## 7. Tests found the bugs a demo would have

Our Playwright suite drives the full loop. It even answers a question with nothing but the Space key. When we switched from SQLite to the remote Tiger Data instance, it began failing 3 out of 4 times. The clinician panel's initial fetch returned *after* the live WebSocket presence event and overwrote it with stale data, so judges would have seen "Patient not connected" while the patient was online. That's a one-line fix, but we only found it because the test kept failing.

## Results (measured, not estimated)

| | p50 |
|---|---|
| Clinician question → patient device | 0.98 s |
| Patient confirmation → clinician | 0.20 s |
| Gemini interpretation | 0.82 s |
| Typesense hybrid search | 15 ms |
| Fictional prescription extraction | 9/9 fields, all held for clinician review |

## What's next

Real-webcam validation with occupational therapists, eye-tracker dwell, native-speaker translation review, and a bedside pilot.

*Synaphi is a prototype using synthetic data only. It is not a medical device.*
