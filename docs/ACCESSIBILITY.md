# Accessibility design

Synaphi's patient board is designed around one question: *what can this person reliably control right now?* Every input method drives the same set of actions, so a patient (or caregiver) can switch methods without relearning the interface.

## Input methods

| Method | How it works | Calibration / tuning | Verified |
|---|---|---|---|
| **Touch / mouse** | Large cards (min ~6 em tall), high-contrast borders | Text size 80–200 %, max choices | E2E |
| **Keyboard** | Native buttons, arrow-key roving focus, Enter/Space, visible 4 px amber focus ring | — | E2E |
| **Single-switch scanning** | Two-level row scanning: groups (Help, answers, quick replies, controls) → items. One key/switch selects. | Scan interval 0.5–5 s; selection key (Space, Enter, `1`, F8 for switch interfaces) | E2E (Space-only answer) |
| **Blink** | MediaPipe Face Landmarker blendshapes, both eyes must close; a *deliberate hold* (default 400 ms) selects; normal blinks (~100–250 ms) ignored; 1.2 s cooldown; hysteresis band | Guided calibration: open-eye baseline + deliberate closure → threshold halfway; hold time 250–1500 ms | Unit tests + fake-camera load; **real webcam pending** |
| **Head gestures** | Turn right/left = next/previous, nod down = select, look up = back. 300 ms dwell and return-to-neutral required between gestures | Neutral-pose calibration; sensitivity 5–100 % | Unit tests; **real webcam pending** |
| **Dwell** | Rest a pointer / head-mouse / eye-tracker cursor on a card; amber progress bar fills; selection after dwell time. Must move ≥14 px before the next dwell (prevents chained selections) | Dwell 0.3–4 s | E2E |
| **Residual speech** | Browser speech recognition matches short words ("yes", "help", or an option label) in the patient's language | Language | Manual (Chrome/Edge) |

Camera processing runs **entirely in the browser**; no frames are sent anywhere or recorded. Camera access requires an explicit button press and browser permission.

## Always-available safety controls

The bottom bar is present on every screen: **Help · Yes · No · Unsure · Repeat · Back · Stop · Confirm and Speak**.

- **Help** sounds a local alarm, speaks "I need help now", and alerts the clinician — it does not depend on Gemini or Typesense, and still alarms locally if the network is down. In scanning it is the first group of every cycle.
- **Stop** pauses everything (scanning, speech); any selection input resumes.
- **Back** undoes the last selection (logged as a correction for adaptive tuning).
- **Repeat** re-speaks the question and notifies the clinician.
- Nothing is spoken or sent until **Confirm and Speak**.

## Cognitive accessibility

- Simplified mode: at most 4 larger choices, plain-language question (Gemini `simplified_question`).
- Pictograms on every card (Lucide icon set), consistent placement.
- "Explain simpler" and "That is not what I meant" on the core board for misunderstood questions.
- Optional audio prompts read questions aloud in the patient's language.
- Reduced-motion mode (also honours `prefers-reduced-motion`); dwell progress is kept because it is functional feedback.

## Visual design

- Patient font: **Atkinson Hyperlegible Next**; clinician font: Inter.
- High-contrast mode (black/white/cyan/amber).
- Palette: Navy `#102A43`, Teal `#087A7F`, Soft White `#F6F9FC`, Ice `#EAF4F4`, Focus Amber `#F9BB45`, Urgent Red `#B42318`.
- Body diagram: front view, patient's right on viewer's left (labelled R/L), back shown dashed; scanning focus highlights the zone.

## Adaptive Accessibility Engine

Every selection, correction, missed scan cycle, near-miss blink, and confirmed message is stored as a time-series event with the current `calibration_version`. `services/adaptation.py` analyses recent events and **suggests** changes, e.g.:

- miss rate ≥ 30 % in scanning → slower scan interval (×1.3)
- correction rate ≥ 30 % → slower scan
- ≥ 4 near-miss blinks → shorter blink hold
- correction rate ≥ 40 % → fewer choices
- average selection > 9 s → simplified mode

Suggestions appear in the patient's Settings drawer with the reason; applying one requires an explicit confirmation, bumps the calibration version, and the analytics page compares performance before vs after. **No access setting is ever changed silently.**

## Languages

English, Spanish, French, Hindi, Chinese (Simplified). Interface strings, body regions, pain scale, pain qualities, and the core board are pre-translated (static; should be reviewed by native-speaking clinicians before real use). Dynamic answer options and questions are translated by Gemini and labelled; if translation fails, the original is shown with a notice.
