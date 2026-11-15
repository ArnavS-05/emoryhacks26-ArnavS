import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, Check, CircleHelp, Hand, LifeBuoy, Pause, Play, RotateCcw, Settings2, Volume2, Wifi, WifiOff, X } from 'lucide-react'
import { api } from '../../lib/api'
import { EventRecorder } from '../../lib/events'
import {
  CORE_BOARD, HELP_SENTENCE, LANGS, type Lang, QUALITIES, REGION_LABEL, type Region, SCALE_LABEL, SCALE_POINTS,
  SUB_REGIONS, UI_TEXT, asLang,
} from '../../lib/i18n'
import { Pictogram } from '../../lib/pictograms'
import { chime, playAlarm, speak, stopSpeaking } from '../../lib/speech'
import { useSessionSocket } from '../../lib/useSessionSocket'
import { FaceInput } from '../accessibility/FaceInput'
import { type ScanGroup, type ScanMode, useScanner } from '../accessibility/useScanner'
import { VoiceInput } from '../accessibility/VoiceInput'
import { BodyMap } from './BodyMap'
import * as C from './composer'
import { SettingsDrawer } from './SettingsDrawer'

export type Accessibility = {
  input_mode: 'touch' | 'scan' | 'blink' | 'head' | 'voice' | 'keyboard'
  scan_interval_ms: number; blink_threshold: number; blink_hold_ms: number; head_sensitivity: number
  font_scale: number; contrast_mode: 'standard' | 'high'; simplified: boolean; max_choices: number
  reduced_motion: boolean; audio_prompts: boolean; language: string; preferred_categories: string[]
  select_keys: string[]; calibration_version: number
}

type Item = {
  id: string; group: 'help' | 'main' | 'quick' | 'controls'; label: string; sub?: string; icon?: string
  tone?: 'urgent' | 'primary' | 'quiet' | 'scale'; scale?: number; disabled?: boolean; activate: () => void
}

const SCALE_COLORS = ['#e6f4ea', '#d9f0d3', '#fff3c4', '#ffd9a8', '#ffb4a1', '#f28b82']

export function PatientPanel({ sessionId, token, embedded = false }: { sessionId: string; token: string; embedded?: boolean }) {
  const [acc, setAcc] = useState<Accessibility | null>(null)
  const [patientId, setPatientId] = useState('')
  const [patientName, setPatientName] = useState('')
  const [clinicianLang, setClinicianLang] = useState<Lang>('en')
  const [comp, setComp] = useState<C.ComposerState>(C.initialComposer)
  const [paused, setPaused] = useState(false)
  const [help, setHelp] = useState<null | 'sending' | 'sent' | 'local'>(null)
  const [speaking, setSpeaking] = useState(false)
  const [sentText, setSentText] = useState('')
  const [sendWarning, setSendWarning] = useState('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [ended, setEnded] = useState(false)
  const recorder = useRef<EventRecorder | null>(null)
  const compStart = useRef<number | null>(null)
  const presentedAt = useRef(performance.now())
  const selectionsSinceReview = useRef(0)

  const pl = asLang(acc?.language)
  const t = UI_TEXT[pl]
  const ctx = { pl, cl: clinicianLang }
  const mode = acc?.input_mode ?? 'touch'

  // ---------- load session ----------
  useEffect(() => {
    let alive = true
    api(`/api/sessions/${sessionId}`, { token }).then((s) => {
      if (!alive) return
      setAcc(s.patient.accessibility)
      setPatientId(s.patient.id)
      setPatientName(s.patient.name)
      setClinicianLang(asLang(s.session.clinician_language))
      setEnded(s.session.status !== 'active')
      // Resume a pending clinician question that has no patient answer yet.
      const turns = s.turns as any[]
      const last = turns[turns.length - 1]
      if (last && last.speaker === 'clinician') setComp(C.onQuestion(C.initialComposer, last))
    }).catch(() => { /* panel still usable for local help */ })
    recorder.current = new EventRecorder(sessionId, token)
    return () => { alive = false; recorder.current?.dispose() }
  }, [sessionId, token])

  const log = useCallback((event_type: string, extra: Record<string, unknown> = {}) => {
    recorder.current?.record({
      input_mode: mode, event_type, scan_interval_ms: mode === 'scan' || mode === 'blink' ? acc?.scan_interval_ms : null,
      ...extra,
    })
  }, [mode, acc?.scan_interval_ms])

  // ---------- socket ----------
  const { status: sock, send } = useSessionSocket(sessionId, token, (e) => {
    if (e.type === 'question') {
      setComp(C.onQuestion(C.initialComposer, e.payload))
      setSentText('')
      compStart.current = performance.now()
      chime()
      if (acc?.audio_prompts) speak(e.payload.translated_text || e.payload.original_text, pl)
    } else if (e.type === 'accessibility_updated') {
      setAcc(e.payload)
    } else if (e.type === 'session_ended') {
      setEnded(true)
    }
  })

  // Report progress to the clinician (no message content until confirmed).
  useEffect(() => {
    presentedAt.current = performance.now()
    send('patient_status', { stage: comp.stage })
    if (['options', 'region', 'subregion', 'intensity', 'quality', 'idle'].includes(comp.stage)) log('option_presented', { context: { stage: comp.stage } })
  }, [comp.stage]) // eslint-disable-line react-hooks/exhaustive-deps

  // ---------- actions ----------
  const selected = (step: string) => {
    if (compStart.current === null) compStart.current = performance.now()
    selectionsSinceReview.current += 1
    if (mode !== 'scan' && mode !== 'blink' && mode !== 'head') {
      log('selection', { response_latency_ms: Math.round(performance.now() - presentedAt.current), selection_success: true, context: { step } })
    }
  }

  const doBack = () => {
    if (comp.stage === 'idle' || comp.stage === 'sent') return
    log('correction', { context: { from: comp.stage } })
    setComp((s) => C.back(s))
  }

  const doConfirm = async () => {
    if (comp.stage !== 'review') return
    const patient_text = C.patientMessage(comp)
    const clinician_text = C.clinicianMessage(comp)
    const composition_ms = compStart.current ? Math.round(performance.now() - compStart.current) : null
    setSpeaking(true)
    setSentText(patient_text)
    const body = { turn_id: comp.turn?.id ?? null, patient_text, patient_language: pl, clinician_text, selections: comp.selections, input_mode: mode, composition_ms }
    setComp((s) => C.markSent(s))
    compStart.current = null
    selectionsSinceReview.current = 0
    try {
      await api(`/api/sessions/${sessionId}/messages`, { body, token, timeoutMs: 8000 })
      setSendWarning('')
    } catch {
      setSendWarning('Spoken here, but not delivered to the clinician screen (connection issue).')
    }
    await speak(clinician_text, clinicianLang)
    setSpeaking(false)
  }

  const doHelp = async () => {
    setHelp('sending')
    playAlarm()
    void speak(HELP_SENTENCE[clinicianLang], clinicianLang)
    try {
      await api(`/api/sessions/${sessionId}/help`, { body: { input_mode: mode }, token, timeoutMs: 5000 })
      setHelp('sent')
    } catch {
      setHelp('local')
    }
  }

  const doRepeat = () => {
    log('repeat_requested')
    send('repeat_request')
    const q = comp.turn
    if (q) void speak(q.translated_text || q.original_text, q.translated_text ? pl : clinicianLang)
  }

  const doStop = () => {
    stopSpeaking()
    setPaused((p) => !p)
  }

  // ---------- items for current stage ----------
  const maxChoices = acc?.simplified ? Math.min(acc.max_choices, 4) : acc?.max_choices ?? 8
  const mainItems: Item[] = useMemo(() => {
    const items: Item[] = []
    const s = comp
    if (s.stage === 'idle' || s.stage === 'sent') {
      CORE_BOARD.slice(0, acc?.simplified ? maxChoices : CORE_BOARD.length).forEach((ci) => items.push({
        id: `core-${ci.id}`, group: 'main', label: ci.label[pl], icon: ci.icon, tone: ci.urgent ? 'urgent' : undefined,
        activate: () => { selected('core'); setComp((x) => C.chooseCore(x, ci, ctx)) },
      }))
    } else if (s.stage === 'region') {
      s.regions.forEach((r) => items.push({
        id: `region-${r}`, group: 'main', label: REGION_LABEL[pl][r], icon: regionIcon(r),
        activate: () => { selected('location'); setComp((x) => C.chooseRegion(x, r, ctx)) },
      }))
    } else if (s.stage === 'subregion' && s.region) {
      ;(SUB_REGIONS[s.region] ?? []).forEach((sr) => items.push({
        id: `sub-${sr.key}`, group: 'main', label: sr.label[pl], icon: regionIcon(s.region!),
        activate: () => { selected('sub_location'); setComp((x) => C.chooseSub(x, sr, ctx)) },
      }))
      items.push({ id: 'sub-skip', group: 'main', label: t.skip, tone: 'quiet', activate: () => { selected('sub_skip'); setComp((x) => C.chooseSub(x, null, ctx)) } })
    } else if (s.stage === 'intensity') {
      SCALE_POINTS.forEach((n, i) => items.push({
        id: `scale-${n}`, group: 'main', label: String(n), sub: SCALE_LABEL[pl][i], tone: 'scale', scale: i,
        activate: () => { selected('intensity'); setComp((x) => C.chooseIntensity(x, n, ctx)) },
      }))
    } else if (s.stage === 'quality') {
      QUALITIES.forEach((q) => items.push({
        id: `q-${q.key}`, group: 'main', label: q.label[pl], icon: q.icon,
        activate: () => { selected('quality'); setComp((x) => C.chooseQuality(x, q.key, ctx)) },
      }))
      items.push({ id: 'q-skip', group: 'main', label: t.skip, tone: 'quiet', activate: () => { selected('quality_skip'); setComp((x) => C.chooseQuality(x, null, ctx)) } })
    } else if (s.stage === 'options' && s.turn) {
      s.turn.options.slice(0, maxChoices).forEach((o) => items.push({
        id: `opt-${o.id}`, group: 'main', label: o.label, icon: o.pictogram_id ?? undefined,
        tone: o.category === 'urgent' ? 'urgent' : undefined,
        activate: () => { selected('phrase'); setComp((x) => C.chooseOption(x, o)) },
      }))
      if (!s.turn.options.length) {
        CORE_BOARD.slice(0, maxChoices).forEach((ci) => items.push({
          id: `core-${ci.id}`, group: 'main', label: ci.label[pl], icon: ci.icon,
          activate: () => { selected('core'); setComp((x) => C.chooseCore(x, ci, ctx)) },
        }))
      }
    } else if (s.stage === 'review') {
      items.push({ id: 'review-confirm', group: 'main', label: t.confirm, icon: 'yes', tone: 'primary', activate: () => void doConfirm() })
      items.push({ id: 'review-back', group: 'main', label: t.back, icon: 'repeat', tone: 'quiet', activate: doBack })
      items.push({ id: 'review-restart', group: 'main', label: t.startOver, icon: 'other', tone: 'quiet', activate: () => { log('message_cancelled'); setComp((x) => C.reset(x)) } })
    }
    return items
  }, [comp, pl, clinicianLang, acc?.simplified, maxChoices]) // eslint-disable-line react-hooks/exhaustive-deps

  const quickItems: Item[] = [
    { id: 'quick-yes', group: 'quick', label: t.yes, icon: 'yes', activate: () => { selected('quick'); setComp((x) => C.chooseQuick(x, 'yes', ctx)) } },
    { id: 'quick-no', group: 'quick', label: t.no, icon: 'no', activate: () => { selected('quick'); setComp((x) => C.chooseQuick(x, 'no', ctx)) } },
    { id: 'quick-unsure', group: 'quick', label: t.unsure, icon: 'unsure', activate: () => { selected('quick'); setComp((x) => C.chooseQuick(x, 'unsure', ctx)) } },
  ]
  const controlItems: Item[] = [
    { id: 'ctl-repeat', group: 'controls', label: t.repeat, icon: 'repeat', disabled: !comp.turn, activate: doRepeat },
    { id: 'ctl-back', group: 'controls', label: t.back, icon: 'back', disabled: comp.stage === 'idle' || comp.stage === 'sent', activate: doBack },
    { id: 'ctl-stop', group: 'controls', label: paused ? t.resume : t.stop, icon: 'stop', activate: doStop },
    { id: 'ctl-confirm', group: 'controls', label: t.confirm, icon: 'yes', tone: 'primary', disabled: comp.stage !== 'review', activate: () => void doConfirm() },
  ]
  const helpItem: Item = { id: 'help', group: 'help', label: t.help, icon: 'help', tone: 'urgent', activate: () => void doHelp() }

  const scanMode: ScanMode = paused ? 'off' : mode === 'scan' || mode === 'blink' ? 'scan' : mode === 'head' ? 'step' : 'off'
  const enabled = (xs: Item[]) => xs.filter((x) => !x.disabled)
  const groups: ScanGroup[] = [
    { id: 'help', label: t.help, items: [helpItem] },
    { id: 'main', label: 'main', items: enabled(mainItems) },
    { id: 'quick', label: 'quick', items: enabled(quickItems) },
    { id: 'controls', label: 'controls', items: enabled(controlItems) },
  ]
  const scanner = useScanner({
    groups, mode: scanMode, intervalMs: acc?.scan_interval_ms ?? 1500, paused: paused || speaking || !!help, startGroup: 1,
    onCycleMissed: () => log('scan_cycle_missed'),
    onActivate: (id, latency) => log('selection', { response_latency_ms: latency, selection_success: true, context: { item: id } }),
  })

  // ---------- keyboard / switch ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tgt = e.target as HTMLElement
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT' || tgt.isContentEditable)) return
      if (settingsOpen) return
      const keys = acc?.select_keys?.length ? acc.select_keys : [' ', 'Enter']
      if (paused && keys.includes(e.key)) { e.preventDefault(); setPaused(false); return }
      if (scanMode === 'scan') {
        if (keys.includes(e.key)) { e.preventDefault(); scanner.select() }
        else if (e.key === 'Escape') scanner.escape()
      } else if (scanMode === 'step') {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); scanner.next() }
        else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); scanner.prev() }
        else if (keys.includes(e.key)) { e.preventDefault(); scanner.select() }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [scanMode, scanner, acc?.select_keys, paused, settingsOpen])

  // Roving arrow-key focus for direct keyboard users.
  const onGridKey = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (scanMode !== 'off') return
    if (!['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) return
    const btns = Array.from(e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-item]:not([disabled])'))
    const idx = btns.indexOf(document.activeElement as HTMLButtonElement)
    const dir = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : -1
    btns[(idx + dir + btns.length) % btns.length]?.focus()
    e.preventDefault()
  }

  const onVoice = (text: string) => {
    const s = text.toLowerCase()
    const all = [helpItem, ...enabled(mainItems), ...enabled(quickItems), ...enabled(controlItems)]
    const hit = all.find((it) => s === it.label.toLowerCase()) ?? all.find((it) => s.includes(it.label.toLowerCase()) || it.label.toLowerCase().includes(s))
    if (hit) hit.activate()
  }

  const updateAcc = async (patch: Partial<Accessibility> & { bump_calibration?: boolean; reason?: string }) => {
    setAcc((a) => (a ? { ...a, ...patch } : a))
    try {
      const next = await api(`/api/patients/${patientId}/accessibility`, { method: 'PATCH', body: patch, token })
      setAcc(next)
    } catch { /* keep local */ }
  }

  if (!acc) {
    return <div className="flex h-full items-center justify-center font-patient text-2xl text-navy-500" role="status">Loading communication board…</div>
  }

  const question = comp.turn
  const qText = question ? (acc.simplified ? question.simplified_text || question.translated_text || question.original_text : question.translated_text || question.original_text) : ''
  const stageTitle: Record<C.Stage, string> = {
    idle: t.quickNeeds, sent: t.quickNeeds, options: t.chooseAnswer, region: t.whereHurts, subregion: t.whereExactly,
    intensity: t.howStrong, quality: t.whatFeel, review: t.reviewPrompt,
  }
  const cls = (it: Item) => {
    const focus = scanner.focusedItem === it.id ? ' scan-focus' : ''
    const base = 'relative flex flex-col items-center justify-center gap-[0.35em] rounded-[1.1em] border-[3px] p-[0.6em] text-center font-semibold transition-transform disabled:opacity-35'
    if (it.tone === 'urgent') return `${base} border-urgent bg-urgent-100 text-urgent${focus}`
    if (it.tone === 'primary') return `${base} border-teal-700 bg-teal text-white${focus}`
    if (it.tone === 'quiet') return `${base} border-line bg-white text-navy-500${focus}`
    return `${base} border-line bg-white text-navy hover:border-teal${focus}`
  }
  const cols = acc.simplified ? 'grid-cols-2' : comp.stage === 'intensity' ? 'grid-cols-3 lg:grid-cols-6' : 'grid-cols-2 md:grid-cols-3 xl:grid-cols-4'
  const showBody = comp.stage === 'region' || comp.stage === 'subregion'
  const focusedRegion = scanner.focusedItem?.startsWith('region-') ? (scanner.focusedItem.slice(7) as Region) : null
  const subZones = comp.stage === 'subregion' && scanner.focusedItem?.startsWith('sub-')
    ? SUB_REGIONS[comp.region!]?.find((x) => `sub-${x.key}` === scanner.focusedItem)?.zone.split(',') : undefined

  return (
    <section
      aria-label="Patient communication board"
      className={`relative flex h-full flex-col font-patient ${acc.contrast_mode === 'high' ? 'patient-high-contrast' : 'bg-ice text-navy'} ${acc.reduced_motion ? 'reduce-motion' : ''}`}
      style={{ fontSize: `${acc.font_scale * (embedded ? 15 : 18)}px` }}
      lang={pl}
    >
      {/* ---------- TOP: question + status ---------- */}
      <header className="border-b border-line bg-white/70 px-[1.1em] py-[0.8em]">
        <div className="flex items-center justify-between gap-3 text-[0.8em]">
          <div className="flex items-center gap-2 text-navy-500">
            {sock === 'open' ? <Wifi className="size-[1.2em] text-teal" aria-hidden /> : <WifiOff className="size-[1.2em] text-urgent" aria-hidden />}
            <span role="status">{sock === 'open' ? `${patientName}` : t.offline}</span>
            {mode !== 'touch' && <span className="rounded-full bg-teal-100 px-2 py-0.5 font-semibold text-teal-700">{mode}</span>}
          </div>
          <div className="flex items-center gap-2">
            <label className="sr-only" htmlFor={`lang-${sessionId}`}>Language</label>
            <select id={`lang-${sessionId}`} value={pl} onChange={(e) => updateAcc({ language: e.target.value, reason: 'patient language change' })}
              className="rounded-lg border border-line bg-white px-2 py-1 text-navy">
              {LANGS.map((l) => <option key={l.code} value={l.code}>{l.native}</option>)}
            </select>
            <button type="button" onClick={() => setSettingsOpen(true)} className="inline-flex items-center gap-1 rounded-lg border border-line bg-white px-2 py-1 text-navy" aria-label="Accessibility settings">
              <Settings2 className="size-[1.2em]" aria-hidden /><span className="hidden sm:inline">Settings</span>
            </button>
          </div>
        </div>
        <div className="mt-[0.4em] min-h-[3.2em]" aria-live="polite">
          {question ? (
            <>
              <div className="text-[0.85em] font-semibold uppercase tracking-wide text-teal">{t.clinicianAsks}</div>
              <p className="text-[1.7em] font-bold leading-tight">{qText}</p>
              {question.intent.translation_unavailable && <p className="text-[0.8em] text-navy-500">{t.translationUnavailable}</p>}
              {question.translated_text && !acc.simplified && <p className="text-[0.85em] text-navy-500">“{question.original_text}”</p>}
            </>
          ) : ended ? (
            <p className="text-[1.5em] font-bold">Session ended</p>
          ) : (
            <>
              <p className="text-[1.5em] font-bold">{t.waiting}</p>
              <p className="text-[0.95em] text-navy-500">{t.waitingSub}</p>
            </>
          )}
        </div>
      </header>

      {/* ---------- CENTER: adaptive cards ---------- */}
      <div className="min-h-0 flex-1 overflow-auto px-[1.1em] py-[0.9em]" onKeyDown={onGridKey}>
        <div className="mb-[0.6em] flex items-center justify-between">
          <h2 className="text-[1.15em] font-bold">{stageTitle[comp.stage]}</h2>
          {comp.selections.length > 0 && comp.stage !== 'review' && (
            <ol className="flex flex-wrap gap-1 text-[0.8em]" aria-label="Your selections so far">
              {comp.selections.map((s, i) => <li key={i} className="rounded-full bg-teal-100 px-2 py-0.5 text-teal-700">{s.label}</li>)}
            </ol>
          )}
        </div>

        {comp.stage === 'sent' && sentText && (
          <div className="mb-[0.8em] flex items-center gap-3 rounded-[1em] border-2 border-teal bg-white p-[0.8em]" role="status">
            {speaking ? <Volume2 className="size-[1.6em] shrink-0 text-teal" aria-hidden /> : <Check className="size-[1.6em] shrink-0 text-teal" aria-hidden />}
            <div>
              <div className="font-bold">{speaking ? t.speaking : t.sent}</div>
              <div className="text-[0.95em]">“{sentText}”</div>
              <div className="text-[0.8em] text-navy-500">{sendWarning || t.sentSub}</div>
            </div>
          </div>
        )}

        {comp.stage === 'review' ? (
          <div className="flex flex-col gap-[0.8em]">
            <div className="rounded-[1.2em] border-[3px] border-teal bg-white p-[1em]">
              <div className="text-[0.85em] font-semibold uppercase tracking-wide text-teal">{t.yourMessage}</div>
              <p className="mt-1 text-[1.8em] font-bold leading-snug">{C.patientMessage(comp)}</p>
              {pl !== clinicianLang && <p className="mt-2 text-[0.9em] text-navy-500" lang={clinicianLang}>→ {C.clinicianMessage(comp)}</p>}
            </div>
            <div className={`${scanner.focusedGroup === 'main' ? 'scan-group' : ''} grid grid-cols-3 gap-[0.7em]`}>
              {mainItems.map((it) => (
                <button key={it.id} data-item type="button" onClick={it.activate} className={`${cls(it)} min-h-[5.5em] text-[1.15em]`}>
                  <Pictogram id={it.icon} className="size-[1.6em]" />{it.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={showBody ? 'grid gap-[1em] md:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]' : ''}>
            {showBody && (
              <div className="hidden items-center justify-center rounded-[1.2em] bg-white/60 p-2 md:flex">
                <BodyMap
                  label="Body diagram"
                  region={comp.stage === 'subregion' ? comp.region : null}
                  activeZones={subZones}
                  focusRegion={focusedRegion}
                  selectable={comp.stage === 'region' ? comp.regions : []}
                  onRegion={comp.stage === 'region' ? (r) => { selected('location'); setComp((x) => C.chooseRegion(x, r, ctx)) } : undefined}
                />
              </div>
            )}
            <div className={`${scanner.focusedGroup === 'main' ? 'scan-group' : ''} grid ${showBody ? 'grid-cols-2' : cols} content-start gap-[0.7em] p-1`}>
              {mainItems.map((it) => (
                <button key={it.id} data-item type="button" onClick={it.activate} className={`${cls(it)} ${acc.simplified ? 'min-h-[8em] text-[1.4em]' : 'min-h-[6.4em] text-[1.15em]'}`}
                  style={it.tone === 'scale' ? { background: SCALE_COLORS[it.scale!], borderColor: '#9fb3c8' } : undefined}>
                  {it.tone === 'scale' ? <span className="text-[2em] font-bold leading-none">{it.label}</span> : <Pictogram id={it.icon} className="size-[2em]" />}
                  <span>{it.tone === 'scale' ? it.sub : it.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ---------- input adapters ---------- */}
      {(mode === 'blink' || mode === 'head' || mode === 'voice') && (
        <div className="px-[1.1em] pb-2 text-[14px]">
          {mode === 'voice' ? <VoiceInput lang={pl} onPhrase={onVoice} /> : (
            <FaceInput mode={mode} blinkThreshold={acc.blink_threshold} blinkHoldMs={acc.blink_hold_ms} headSensitivity={acc.head_sensitivity}
              onSelect={() => (paused ? setPaused(false) : scanner.select())}
              onHead={(g) => { log('head_gesture', { context: { g } }); if (g === 'right') scanner.next(); else if (g === 'left') scanner.prev(); else if (g === 'down') scanner.select(); else doBack() }}
              onBlinkRejected={() => log('blink_rejected')}
              onCalibrated={(r) => { log('calibration', { context: r }); if (r.blinkThreshold) void updateAcc({ blink_threshold: r.blinkThreshold, bump_calibration: true, reason: 'blink calibration' }) }}
            />
          )}
        </div>
      )}
      {mode === 'scan' && (
        <p className="px-[1.1em] pb-1 text-[0.75em] text-navy-500">
          Switch scanning: press <kbd className="rounded border border-line bg-white px-1">{(acc.select_keys?.[0] ?? ' ') === ' ' ? 'Space' : acc.select_keys[0]}</kbd> to choose the highlighted group, then the item.
        </p>
      )}

      {/* ---------- BOTTOM: always-available controls ---------- */}
      <nav aria-label="Core controls" className="border-t border-line bg-white/80 px-[1.1em] py-[0.7em]" onKeyDown={onGridKey}>
        <div className="flex flex-wrap items-stretch gap-[0.5em]">
          <div className={scanner.focusedGroup === 'help' ? 'scan-group' : ''}>
            <button data-item type="button" onClick={helpItem.activate}
              className={`flex h-full min-h-[3.6em] items-center gap-2 rounded-[0.9em] border-[3px] border-urgent bg-urgent px-[1em] text-[1.1em] font-bold text-white ${scanner.focusedItem === 'help' ? 'scan-focus' : ''}`}>
              <LifeBuoy className="size-[1.3em]" aria-hidden />{t.help}
            </button>
          </div>
          <div className={`flex gap-[0.5em] ${scanner.focusedGroup === 'quick' ? 'scan-group' : ''}`}>
            {quickItems.map((it) => (
              <button key={it.id} data-item type="button" onClick={it.activate}
                className={`flex min-h-[3.6em] min-w-[4.6em] items-center justify-center gap-1 rounded-[0.9em] border-[3px] border-line bg-white px-[0.8em] text-[1.05em] font-bold ${scanner.focusedItem === it.id ? 'scan-focus' : ''}`}>
                {it.id === 'quick-yes' ? <Check className="size-[1.2em] text-teal" aria-hidden /> : it.id === 'quick-no' ? <X className="size-[1.2em] text-urgent" aria-hidden /> : <CircleHelp className="size-[1.2em] text-navy-500" aria-hidden />}
                {it.label}
              </button>
            ))}
          </div>
          <div className={`ml-auto flex flex-wrap gap-[0.5em] ${scanner.focusedGroup === 'controls' ? 'scan-group' : ''}`}>
            {controlItems.map((it) => {
              const Icon = it.id === 'ctl-repeat' ? RotateCcw : it.id === 'ctl-back' ? ArrowLeft : it.id === 'ctl-stop' ? (paused ? Play : Pause) : Volume2
              return (
                <button key={it.id} data-item type="button" onClick={it.activate} disabled={it.disabled}
                  className={`flex min-h-[3.6em] items-center gap-1 rounded-[0.9em] border-[3px] px-[0.8em] text-[1em] font-bold disabled:opacity-35 ${it.tone === 'primary' ? 'border-teal-700 bg-teal text-white' : 'border-line bg-white'} ${scanner.focusedItem === it.id ? 'scan-focus' : ''}`}>
                  <Icon className="size-[1.2em]" aria-hidden />{it.label}
                </button>
              )
            })}
          </div>
        </div>
      </nav>

      {/* ---------- overlays ---------- */}
      {paused && !help && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-4 bg-navy/80 text-white">
          <Hand className="size-16" aria-hidden />
          <p className="text-[2em] font-bold">{t.stopped}</p>
          <button type="button" onClick={() => setPaused(false)} className="rounded-2xl bg-amber px-8 py-4 text-[1.4em] font-bold text-navy">
            <Play className="mr-2 inline size-6" aria-hidden />{t.resume}
          </button>
          <button type="button" onClick={() => void doHelp()} className="rounded-2xl border-2 border-white px-6 py-3 text-[1.1em] font-bold">
            <LifeBuoy className="mr-2 inline size-5" aria-hidden />{t.help}
          </button>
        </div>
      )}
      {help && (
        <div className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-4 bg-urgent text-white" role="alertdialog" aria-live="assertive" aria-label={t.help}>
          <LifeBuoy className="size-20 urgent-pulse rounded-full" aria-hidden />
          <p className="text-[2.2em] font-bold">{help === 'local' ? t.help : t.helpSent}</p>
          <p className="max-w-md text-center text-[1.1em]">{help === 'sending' ? '…' : help === 'sent' ? t.helpSentSub : t.helpLocal}</p>
          <button type="button" autoFocus onClick={() => { setHelp(null); stopSpeaking() }} className="rounded-2xl bg-white px-8 py-4 text-[1.3em] font-bold text-urgent">{t.cancelHelp}</button>
        </div>
      )}
      {settingsOpen && (
        <SettingsDrawer acc={acc} patientId={patientId} token={token} onChange={updateAcc} onClose={() => setSettingsOpen(false)} />
      )}
    </section>
  )
}

function regionIcon(r: Region) {
  return ({ head: 'head', neck: 'neck', chest: 'chest', stomach: 'stomach', back: 'back', arms: 'arm', legs: 'leg', pelvis: 'pelvis', whole_body: 'body', other: 'other' } as const)[r]
}
