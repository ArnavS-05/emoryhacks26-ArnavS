# 2-minute demo script

**Setup (before recording):** run `scripts/reset_activity.py --yes`, start the app, open `/demo` full-screen in Chrome (≥1440 px wide), unmute speakers, close other tabs. Optional: second device for the multi-device beat.

| Time | Screen | Say | Do |
|---|---|---|---|
| 0:00–0:12 | `/demo` scene 1 | "Elena had a brainstem stroke. She understands everything but can't speak or use her hands — she can blink and press one switch. When her doctor asks *where does it hurt?*, today she can't answer." | Point at the patient board (right). |
| 0:12–0:25 | Clinician panel | "Her doctor just asks." | Click **Where do you feel pain?** Point at the badges: "Gemini classified it as a pain-location question in under a second; Typesense retrieved the body-area answers." |
| 0:25–0:50 | Patient board | "Elena answers with one switch. The highlight scans groups, then items." | Press **Space** while the answers group is outlined, then press Space again when **Stomach** is highlighted (the highlight advances every 1.2 s). Repeat for **upper right**, **6 — Strong**, **Sharp**. (Practise the timing once; or tap the cards.) (Mention: same flow works with blinks, head turns, dwell, or touch.) |
| 0:50–1:05 | Review card | "Nothing is said until she confirms. The sentence is built only from her choices — never by the AI." | Select **Confirm and Speak**. Let the voice play. |
| 1:05–1:15 | Clinician panel | "Her doctor sees the verified message instantly, with how she communicated and how long it took." | Point at the teal Patient-confirmed card. |
| 1:15–1:30 | Patient Settings | "Every selection is stored in Tiger Data. If she keeps missing items, Synaphi suggests a slower scan — but never changes her controls without her consent." | Open Settings → show input methods + Adaptive suggestions. Close. |
| 1:30–1:42 | Clinician → Encounter draft | "Gemini drafts the visit note from confirmed statements and verified records only. The clinician edits and approves." | Click **Encounter draft → Draft encounter note**. |
| 1:42–1:52 | Patient **Help** | "And Help always works — even if every AI service is down." | Press **Help** → alarm overlay → Cancel. |
| 1:52–2:00 | `/inspect` | "Real Gemini, Typesense, and Tiger Data — verified live. That's Synaphi." | Show integration cards. |

### Backup beats (if time / Q&A)
- **Languages:** clinician dashboard → Tomás Ibarra → Start care session → **Pair device** QR → phone joins → ask "Are you thirsty or hungry?" → phone shows Spanish → answer **Sí** → clinician sees English. *(The QR encodes the address the clinician opened. A phone cannot reach `localhost`: use the deployed HTTPS URL, or open the clinician app via the laptop's LAN IP with `npm run dev -- --host` — note camera/mic need HTTPS on non-localhost origins.)*
- **Documents:** Elena's record → Upload `tests/fixtures/synthetic_prescription.png` → 9 unverified fields with source excerpts → Approve one.
- **Typesense:** `/clinician/search` → "my belly hurts" → keyword vs hybrid with score breakdown.

### If something fails live
- Gemini slow/unavailable → the question still works with the rule fallback (amber "Fallback" badge) — say so.
- Network down → Help still alarms locally; touch/scan still navigate the core board.
