import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'
import { AlertTriangle, Bot, QrCode, CheckCircle2, ClipboardList, FileText, Mic, MicOff, Search, Send, Square, Stethoscope, Volume2 } from 'lucide-react'
import { api } from '../../lib/api'
import { LANGS } from '../../lib/i18n'
import { chime, playAlarm, speak } from '../../lib/speech'
import { useSessionSocket } from '../../lib/useSessionSocket'
import { Badge, Button, EngineBadge, Empty, ErrorNote, fmtTime, inputCls } from '../../components/ui'
import { SummaryEditor } from './SummaryEditor'

const QUICK_QUESTIONS = [
  'Where do you feel pain?',
  'How bad is the pain, from 0 to 10?',
  'What does the pain feel like?',
  'Are you having trouble breathing?',
  'Is there anything you need right now?',
  'Have you taken your medicine today?',
]

type Turn = any
type Msg = any

export function ClinicianSession({ sessionId, token, compact = false, onEnded }: { sessionId: string; token: string; compact?: boolean; onEnded?: () => void }) {
  const [state, setState] = useState<any>(null)
  const [turns, setTurns] = useState<Turn[]>([])
  const [messages, setMessages] = useState<Msg[]>([])
  const [question, setQuestion] = useState('')
  const [asking, setAsking] = useState(false)
  const [error, setError] = useState('')
  const [patientStage, setPatientStage] = useState('')
  const [presence, setPresence] = useState<{ patient: number; clinician: number }>({ patient: 0, clinician: 0 })
  const [alert, setAlert] = useState<Msg | null>(null)
  const [repeatAsked, setRepeatAsked] = useState(false)
  const [tab, setTab] = useState<'context' | 'copilot' | 'summary'>('context')
  const [listening, setListening] = useState(false)
  const [autoSpeak, setAutoSpeak] = useState(false)
  const [pair, setPair] = useState<null | { url: string; qr: string; expires: string; code: string }>(null)
  const livePresence = useRef(false) // WebSocket presence is authoritative over the fetched snapshot
  const recRef = useRef<any>(null)
  const feedRef = useRef<HTMLDivElement>(null)

  const load = () => api(`/api/sessions/${sessionId}`, { token }).then((s) => {
    setState(s)
    setTurns(s.turns)
    setMessages(s.messages)
    if (!livePresence.current) setPresence(s.presence)
  }).catch((e) => setError(e.message))
  useEffect(() => { void load() }, [sessionId, token]) // eslint-disable-line react-hooks/exhaustive-deps

  const { status: sock } = useSessionSocket(sessionId, token, (e) => {
    if (e.type === 'question') setTurns((t) => (t.some((x) => x.id === e.payload.id) ? t : [...t, e.payload]))
    if (e.type === 'message_confirmed') {
      setMessages((m) => [...m, e.payload])
      setPatientStage('')
      chime()
      // In split-screen demo the patient device speaks; on a separate clinician device, optionally speak here too.
      if (autoSpeak) void speak(e.payload.clinician_text, e.payload.clinician_language)
    }
    if (e.type === 'help') {
      setMessages((m) => [...m, e.payload])
      setAlert(e.payload)
      playAlarm()
    }
    if (e.type === 'patient_status') setPatientStage(e.payload.stage)
    if (e.type === 'repeat_request') { setRepeatAsked(true); setTimeout(() => setRepeatAsked(false), 6000) }
    if (e.type === 'presence') { livePresence.current = true; setPresence(e.payload) }
    if (e.type === 'session_ended') load()
  })

  useEffect(() => { feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' }) }, [turns.length, messages.length])

  const ask = async (text: string, source: 'typed' | 'browser_speech' | 'quick' = 'typed') => {
    if (!text.trim()) return
    setAsking(true)
    setError('')
    try {
      const t = await api(`/api/sessions/${sessionId}/questions`, { body: { text, source }, token })
      setTurns((ts) => (ts.some((x) => x.id === t.id) ? ts : [...ts, t]))
      setQuestion('')
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setAsking(false)
    }
  }

  const toggleMic = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
    if (!SR) { setError('Speech recognition is not supported in this browser — type the question instead.'); return }
    if (listening) { recRef.current?.stop(); return }
    const rec = new SR()
    rec.lang = state?.session?.clinician_language === 'es' ? 'es-ES' : 'en-US'
    rec.interimResults = true
    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1]
      setQuestion(r[0].transcript)
      if (r.isFinal) { rec.stop(); void ask(r[0].transcript, 'browser_speech') }
    }
    rec.onend = () => setListening(false)
    rec.onerror = () => setListening(false)
    recRef.current = rec
    rec.start()
    setListening(true)
  }

  const pairDevice = async () => {
    try {
      const r = await api(`/api/sessions/${sessionId}/pair`, { method: 'POST', token })
      const url = `${location.origin}${r.path}`
      setPair({ url, qr: await QRCode.toDataURL(url, { margin: 1, width: 240, color: { dark: '#102a43', light: '#ffffff' } }), expires: r.expires_at, code: r.join_code })
    } catch (e) { setError((e as Error).message) }
  }

  const end = async () => {
    await api(`/api/sessions/${sessionId}/end`, { method: 'POST', token })
    await load()
    onEnded?.()
  }

  if (!state) return <div className="p-6 text-sm text-navy-500" role="status">{error || 'Loading session…'}</div>
  const s = state.session
  const patient = state.patient
  const lastQ = [...turns].reverse().find((t) => t.speaker === 'clinician')
  const feed = [
    ...turns.filter((t) => t.speaker === 'clinician').map((t) => ({ kind: 'q' as const, at: t.created_at, t })),
    ...messages.map((m) => ({ kind: 'm' as const, at: m.confirmed_at, m })),
  ].sort((a, b) => +new Date(a.at) - +new Date(b.at))
  const stageText: Record<string, string> = {
    options: 'choosing an answer', region: 'choosing a body area', subregion: 'refining the location', intensity: 'rating intensity',
    quality: 'describing the pain', review: 'reviewing their message', idle: 'idle', sent: 'idle',
  }

  return (
    <section className="flex h-full min-h-0 flex-col bg-soft" aria-label="Clinician care session">
      {/* Header */}
      <header className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-3">
        <Stethoscope className="size-5 text-teal" aria-hidden />
        <div className="min-w-0">
          <div className="font-semibold leading-tight">{patient.name} <span className="font-normal text-navy-500">· {patient.age ?? '—'} y · {LANGS.find((l) => l.code === patient.preferred_language)?.name ?? patient.preferred_language}</span></div>
          <div className="text-xs text-navy-500">Join code <span className="font-mono font-semibold tracking-widest text-navy">{s.join_code}</span> · {s.status}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge tone={sock === 'open' ? 'teal' : 'amber'}>{sock === 'open' ? 'Live' : 'Reconnecting'}</Badge>
          <Badge tone={presence.patient > 0 ? 'teal' : 'neutral'}>{presence.patient > 0 ? 'Patient connected' : 'Patient not connected'}</Badge>
          {s.status === 'active' && <Button size="sm" variant="secondary" onClick={pairDevice}><QrCode className="size-3.5" />Pair device</Button>}
          {s.status === 'active' && <Button size="sm" variant="secondary" onClick={end}><Square className="size-3.5" />End</Button>}
        </div>
      </header>

      {pair && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-navy/50 p-4" role="dialog" aria-modal="true" aria-label="Pair patient device">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6 text-center">
            <h2 className="text-lg font-bold">Pair the patient’s device</h2>
            <p className="mt-1 text-sm text-navy-500">Scan with the patient’s tablet or phone. Single use, expires {fmtTime(pair.expires)}.</p>
            <img src={pair.qr} alt="QR code for the one-time pairing link" className="mx-auto mt-4 size-60" />
            <p className="mt-3 text-sm">Or open <span className="font-mono">{location.origin}/join</span> and enter <span className="font-mono text-lg font-bold tracking-widest">{pair.code}</span></p>
            <Button className="mt-4 w-full" variant="secondary" autoFocus onClick={() => setPair(null)}>Done</Button>
          </div>
        </div>
      )}
      {alert && (
        <div role="alert" className="flex items-center gap-3 bg-urgent px-4 py-3 text-white urgent-pulse">
          <AlertTriangle className="size-6" aria-hidden />
          <div className="flex-1"><div className="font-bold">Patient requested help</div><div className="text-sm">{fmtTime(alert.confirmed_at)} · via {alert.input_mode}</div></div>
          <Button size="sm" variant="secondary" onClick={() => setAlert(null)}>Acknowledge</Button>
        </div>
      )}
      {repeatAsked && <div className="bg-amber-100 px-4 py-2 text-sm font-semibold" role="status">Patient asked you to repeat the question.</div>}

      <div className={`grid min-h-0 flex-1 ${compact ? 'grid-rows-[minmax(0,1fr)_auto]' : 'lg:grid-cols-[minmax(0,1fr)_380px]'}`}>
        {/* Transcript + ask */}
        <div className="flex min-h-0 flex-col">
          <div ref={feedRef} className="min-h-0 flex-1 space-y-3 overflow-auto p-4" aria-live="polite" aria-label="Live transcript">
            {feed.length === 0 && <Empty>Ask a question to begin. The patient will see it with accessible answer choices.</Empty>}
            {feed.map((f) => f.kind === 'q' ? (
              <article key={f.t.id} className="rounded-2xl border border-line bg-white p-3">
                <div className="flex items-center justify-between text-xs text-navy-500"><span className="font-semibold uppercase tracking-wide">Clinician</span><span>{fmtTime(f.at)}</span></div>
                <p className="mt-1 font-medium">{f.t.original_text}</p>
                {f.t.translated_text && <p className="text-sm text-navy-500">Patient sees: {f.t.translated_text}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <EngineBadge engine={f.t.ai_engine} />
                  <Badge>{f.t.intent?.intent?.replace(/_/g, ' ')}</Badge>
                  <Badge>{f.t.intent?.response_type?.replace(/_/g, ' ')}</Badge>
                  {typeof f.t.intent?.confidence === 'number' && <Badge tone={f.t.intent.confidence < 0.5 ? 'amber' : 'neutral'}>conf {Math.round(f.t.intent.confidence * 100)}%</Badge>}
                  {f.t.intent?.search?.engine && <Badge tone={f.t.intent.search.engine === 'typesense' ? 'teal' : 'amber'}><Search className="size-3" />{f.t.intent.search.engine}{f.t.intent.search.search_time_ms != null ? ` · ${f.t.intent.search.search_time_ms} ms` : ''}</Badge>}
                  {f.t.intent?.needs_clarification && <Badge tone="amber">may need rephrasing</Badge>}
                </div>
              </article>
            ) : (
              <article key={f.m.id} className={`rounded-2xl border-2 p-3 ${f.m.is_urgent ? 'border-urgent bg-urgent-100' : 'border-teal bg-white'}`}>
                <div className="flex items-center justify-between text-xs">
                  <span className={`flex items-center gap-1 font-semibold uppercase tracking-wide ${f.m.is_urgent ? 'text-urgent' : 'text-teal'}`}>
                    {f.m.is_urgent ? <AlertTriangle className="size-3.5" /> : <CheckCircle2 className="size-3.5" />}{f.m.is_urgent ? 'Help requested' : 'Patient-confirmed response'}
                  </span>
                  <span className="text-navy-500">{fmtTime(f.at)}</span>
                </div>
                <p className="mt-1 text-lg font-semibold">{f.m.clinician_text}</p>
                {f.m.patient_language !== f.m.clinician_language && <p className="text-sm text-navy-500" lang={f.m.patient_language}>Patient’s words: {f.m.patient_text}</p>}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                  <Badge tone="teal">via {f.m.input_mode}</Badge>
                  {f.m.composition_ms != null && <Badge>{(f.m.composition_ms / 1000).toFixed(1)} s to compose</Badge>}
                  {f.m.selections?.length > 0 && !f.m.is_urgent && <Badge>{f.m.selections.length} selections</Badge>}
                  <button type="button" onClick={() => speak(f.m.clinician_text, f.m.clinician_language)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-teal-700 hover:bg-ice"><Volume2 className="size-3" />Replay</button>
                </div>
              </article>
            ))}
            {patientStage && !['idle', 'sent'].includes(patientStage) && (
              <p className="flex items-center gap-2 text-sm text-navy-500" role="status"><span className="size-2 animate-pulse rounded-full bg-teal" />Patient is {stageText[patientStage] ?? patientStage}…</p>
            )}
          </div>

          {s.status === 'active' && (
            <div className="border-t border-line bg-white p-3">
              <ErrorNote error={error} />
              <div className="mb-2 flex flex-wrap gap-1.5">
                {QUICK_QUESTIONS.slice(0, compact ? 4 : 6).map((q) => (
                  <button key={q} type="button" disabled={asking} onClick={() => ask(q, 'quick')} className="rounded-full border border-line bg-soft px-3 py-1 text-xs font-medium hover:border-teal disabled:opacity-50">{q}</button>
                ))}
              </div>
              <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void ask(question) }}>
                <label htmlFor={`q-${sessionId}`} className="sr-only">Question for the patient</label>
                <input id={`q-${sessionId}`} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask the patient a question…" className={inputCls} maxLength={500} />
                <Button type="button" variant={listening ? 'danger' : 'secondary'} onClick={toggleMic} aria-label={listening ? 'Stop dictation' : 'Dictate question (browser speech recognition)'}>
                  {listening ? <MicOff className="size-4" /> : <Mic className="size-4" />}
                </Button>
                <Button type="submit" loading={asking} disabled={!question.trim()}><Send className="size-4" />Ask</Button>
              </form>
              <label className="mt-2 flex items-center gap-2 text-xs text-navy-500">
                <input type="checkbox" checked={autoSpeak} onChange={(e) => setAutoSpeak(e.target.checked)} />Also speak confirmed responses on this device
              </label>
            </div>
          )}
        </div>

        {/* Side: context / copilot / summary (clinician-only) */}
        <aside className={`flex min-h-0 flex-col border-line bg-white ${compact ? 'max-h-[42vh] border-t' : 'border-l'}`} aria-label="Clinician tools">
          <div role="tablist" className="flex border-b border-line text-sm">
            {([['context', 'Verified context', FileText], ['copilot', 'AI copilot', Bot], ['summary', 'Encounter draft', ClipboardList]] as const).map(([k, label, Icon]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
                className={`flex flex-1 items-center justify-center gap-1.5 px-2 py-2.5 font-semibold ${tab === k ? 'border-b-2 border-teal text-teal-700' : 'text-navy-500'}`}>
                <Icon className="size-4" aria-hidden />{label}
              </button>
            ))}
          </div>
          <div className="min-h-0 flex-1 overflow-auto p-4">
            {tab === 'context' && <ContextPanel patientId={patient.id} token={token} lastQuestion={lastQ?.original_text} />}
            {tab === 'copilot' && <CopilotPanel sessionId={sessionId} token={token} count={messages.length} />}
            {tab === 'summary' && <SummaryEditor sessionId={sessionId} token={token} initial={state.note} />}
          </div>
        </aside>
      </div>
    </section>
  )
}

function ContextPanel({ patientId, token, lastQuestion }: { patientId: string; token: string; lastQuestion?: string }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState<any>(null)
  const run = (query: string) => api(`/api/patients/${patientId}/context/search?q=${encodeURIComponent(query)}`, { token }).then(setRes).catch(() => setRes({ results: [], engine: 'error' }))
  useEffect(() => { void run('') }, [patientId]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <div className="space-y-3">
      <form onSubmit={(e) => { e.preventDefault(); void run(q) }} className="flex gap-2">
        <label className="sr-only" htmlFor="ctxq">Search verified context</label>
        <input id="ctxq" value={q} onChange={(e) => { setQ(e.target.value); void run(e.target.value) }} placeholder="Search meds, allergies, history…" className={inputCls} />
      </form>
      {lastQuestion && <button type="button" className="text-xs text-teal-700 underline" onClick={() => { const k = lastQuestion.split(/\s+/).filter((w) => w.length > 3).slice(0, 3).join(' '); setQ(k); void run(k) }}>Search context for “{lastQuestion}”</button>}
      <div className="flex items-center gap-2 text-xs text-navy-500">
        <Badge tone={res?.engine === 'typesense' ? 'teal' : 'amber'}>{res?.engine ?? '…'}</Badge>
        {res?.search_time_ms != null && <span>{res.search_time_ms} ms</span>}
        <span>Verified records only</span>
      </div>
      {res?.results?.length === 0 && <Empty>No verified records match.</Empty>}
      <ul className="space-y-2">
        {res?.results?.map((r: any) => (
          <li key={r.id} className="rounded-xl border border-line p-2.5 text-sm">
            <div className="flex items-center justify-between"><span className="font-semibold">{r.label}</span><Badge tone={r.kind === 'allergy' ? 'urgent' : 'neutral'}>{r.kind}</Badge></div>
            {r.detail && <p className="text-navy-500">{r.detail}</p>}
            <p className="text-xs text-navy-300">source: {r.source}</p>
          </li>
        ))}
      </ul>
    </div>
  )
}

function CopilotPanel({ sessionId, token, count }: { sessionId: string; token: string; count: number }) {
  const [data, setData] = useState<any>(null)
  const [loading, setLoading] = useState(false)
  const run = async () => {
    setLoading(true)
    try { setData(await api(`/api/sessions/${sessionId}/copilot`, { method: 'POST', token })) } finally { setLoading(false) }
  }
  const sec = (title: string, items?: string[]) => items && items.length > 0 && (
    <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-500">{title}</h3>
      <ul className="list-disc space-y-1 pl-5 text-sm">{items.map((x, i) => <li key={i}>{x}</li>)}</ul></div>
  )
  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-amber-100 p-3 text-xs"><strong>Clinician-only.</strong> AI-assisted organization of patient-confirmed statements and verified records for your review. It does not diagnose, prescribe, or decide treatment.</div>
      <Button onClick={run} loading={loading} variant="secondary" className="w-full"><Bot className="size-4" />{data ? 'Refresh insights' : 'Generate insights'} ({count} confirmed)</Button>
      {data && (
        <div className="space-y-4">
          <div className="flex items-center gap-2"><EngineBadge engine={data.engine} />{data.error && <span className="text-xs text-navy-500">{data.error}</span>}</div>
          {sec('Patient-confirmed concerns', data.insights.patient_confirmed_concerns)}
          {sec('Relevant verified history', data.insights.relevant_verified_history)}
          {sec('Possible inconsistencies', data.insights.possible_inconsistencies)}
          {sec('Missing information', data.insights.missing_information)}
          {data.insights.suggested_follow_up_questions?.length > 0 && (
            <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-500">Suggested follow-up questions</h3>
              <ul className="space-y-1 text-sm">{data.insights.suggested_follow_up_questions.map((x: string, i: number) => <li key={i} className="rounded-lg bg-soft px-2 py-1">{x}</li>)}</ul></div>
          )}
          {data.insights.general_considerations?.length > 0 && (
            <div><h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-500">General considerations (for professional review)</h3>
              <ul className="space-y-2 text-sm">{data.insights.general_considerations.map((c: any, i: number) => (
                <li key={i} className="rounded-lg border border-line p-2">{c.text}<div className="mt-1 text-xs text-navy-500">Basis: {c.basis}</div></li>
              ))}</ul></div>
          )}
          <p className="text-xs text-navy-500">{data.disclaimer}</p>
        </div>
      )}
    </div>
  )
}
