import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, ExternalLink, Play, RotateCcw } from 'lucide-react'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'
import { SplitView } from '../features/sessions/SplitView'
import { Button, ErrorNote, Logo } from '../components/ui'

const SCENES = [
  { t: 'A nonverbal patient', d: 'Elena Marsh (fictional), 63, cannot speak after a brainstem stroke. She can reliably make deliberate blinks and use a single switch.' },
  { t: 'Care session starts', d: 'The clinician panel (left) and the patient board (right) are synchronized over WebSockets. They could be two separate devices.' },
  { t: 'The clinician asks', d: 'Click “Where do you feel pain?” on the left, or type or dictate any question.' },
  { t: 'Gemini interprets', d: 'Gemini classifies the question (intent, response type, plain-language version). The label on the question shows which engine was used, including any fallback.' },
  { t: 'Typesense retrieves', d: 'The intent drives a context-aware hybrid search over 140+ curated communication phrases. Results are re-ranked and shown as large cards.' },
  { t: 'Hands-free selection', d: 'The patient board uses switch scanning: press Space when “Stomach” is highlighted. Under Settings you can switch to blink or head control (camera, processed on-device).' },
  { t: 'Confirm, then speak', d: 'Refine the location, rate the pain and describe it, then review. Nothing is spoken until the patient chooses “Confirm and Speak”.' },
  { t: 'Clinician receives', d: 'The verified, patient-confirmed message appears instantly on the clinician panel, with input method and composition time.' },
  { t: 'Performance recorded', d: 'Selections, corrections, missed scan cycles, and composition time are stored as time-series events (a Tiger Data hypertable when connected).' },
  { t: 'Clinician reviews', d: 'Open “Encounter draft” to generate an editable, AI-assisted note built only from confirmed statements and verified records.' },
]

export function DemoPage() {
  const [demo, setDemo] = useState<any>(null)
  const [error, setError] = useState('')
  const [scene, setScene] = useState(0)
  const [busy, setBusy] = useState(false)
  const setClinician = useAuth((s) => s.setClinician)

  const start = async () => {
    setBusy(true)
    setError('')
    try {
      const d = await api('/api/demo/start', { method: 'POST' })
      setDemo(d)
      setClinician({ token: d.clinician_token, name: d.clinician_name })
      setScene(1)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  useEffect(() => { void start() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="flex h-full flex-col">
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-navy px-4 py-2 text-white">
        <Logo light />
        <span className="rounded-full bg-amber px-2 py-0.5 text-xs font-bold text-navy">Judge mode · fictional data</span>
        <div className="flex min-w-0 flex-1 items-center gap-2 text-sm" aria-live="polite">
          <button type="button" aria-label="Previous scene" onClick={() => setScene((s) => Math.max(0, s - 1))} className="rounded p-1 hover:bg-white/10"><ChevronLeft className="size-4" /></button>
          <span className="shrink-0 font-semibold">Scene {scene + 1}/10 · {SCENES[scene].t}</span>
          <span className="hidden truncate text-white/80 xl:inline">— {SCENES[scene].d}</span>
          <button type="button" aria-label="Next scene" onClick={() => setScene((s) => Math.min(9, s + 1))} className="rounded p-1 hover:bg-white/10"><ChevronRight className="size-4" /></button>
        </div>
        <Link to="/inspect" className="inline-flex items-center gap-1 text-sm text-white/90 underline">Tech inspection<ExternalLink className="size-3" /></Link>
        <Link to="/clinician" className="text-sm text-white/90 underline">Clinician app</Link>
        <Button size="sm" variant="secondary" onClick={start} loading={busy}><RotateCcw className="size-3.5" />Restart</Button>
      </header>
      <p className="border-b border-line bg-amber-100 px-4 py-1.5 text-sm xl:hidden">{SCENES[scene].d}</p>
      <ErrorNote error={error} />
      <main className="min-h-0 flex-1">
        {demo ? (
          <SplitView key={demo.session.id} sessionId={demo.session.id} clinicianToken={demo.clinician_token} patientToken={demo.patient_token} />
        ) : (
          <div className="flex h-full items-center justify-center"><Button onClick={start} loading={busy}><Play className="size-4" />Start demo</Button></div>
        )}
      </main>
    </div>
  )
}
