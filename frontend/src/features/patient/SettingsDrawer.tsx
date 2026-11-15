import { useEffect, useState } from 'react'
import { Lightbulb, X } from 'lucide-react'
import { api } from '../../lib/api'
import type { Accessibility } from './PatientPanel'

type Rec = { id: string; setting: string; current: unknown; suggested: unknown; reason: string }

const MODES: { v: Accessibility['input_mode']; label: string; desc: string }[] = [
  { v: 'touch', label: 'Touch / mouse', desc: 'Tap large cards directly' },
  { v: 'keyboard', label: 'Keyboard', desc: 'Tab or arrow keys, Enter to choose' },
  { v: 'scan', label: 'Switch scanning', desc: 'Highlight moves automatically; one switch selects' },
  { v: 'blink', label: 'Blink (camera)', desc: 'Scanning + deliberate long blink selects' },
  { v: 'head', label: 'Head gestures (camera)', desc: 'Turn to move, nod to select' },
  { v: 'voice', label: 'Residual speech', desc: 'Say short words like “yes” or an option' },
]

/** Caregiver/patient settings. Every change is explicit; nothing is auto-applied. */
export function SettingsDrawer({ acc, patientId, token, onChange, onClose }: {
  acc: Accessibility; patientId: string; token: string
  onChange: (p: Partial<Accessibility> & { bump_calibration?: boolean; reason?: string }) => void; onClose: () => void
}) {
  const [recs, setRecs] = useState<Rec[] | null>(null)
  const [metrics, setMetrics] = useState<any>(null)
  const [applied, setApplied] = useState('')

  const loadRecs = () => api(`/api/patients/${patientId}/analytics`, { token }).then((r) => { setRecs(r.recommendations); setMetrics(r.metrics) }).catch(() => setRecs([]))
  useEffect(() => { void loadRecs() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const apply = async (r: Rec) => {
    if (!window.confirm(`Change ${r.setting.replace(/_/g, ' ')} from ${r.current} to ${r.suggested}?`)) return
    const res = await api(`/api/patients/${patientId}/recommendations/apply`, { body: { setting: r.setting, value: r.suggested, confirmed: true }, token })
    onChange({ [r.setting]: r.suggested } as Partial<Accessibility>)
    setApplied(`Applied. Calibration version is now v${res.calibration_version}; new results will be compared with the previous version.`)
    void loadRecs()
  }

  return (
    <div className="absolute inset-0 z-30 flex justify-end bg-navy/40 font-sans text-[15px]" role="dialog" aria-modal="true" aria-label="Accessibility settings">
      <div className="h-full w-full max-w-md overflow-auto bg-white p-5 text-navy shadow-xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-bold">Accessibility settings</h2>
          <button type="button" onClick={onClose} autoFocus className="rounded-lg p-2 hover:bg-soft" aria-label="Close settings"><X className="size-5" /></button>
        </div>

        <fieldset className="mb-5">
          <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy-500">Input method</legend>
          <div className="grid gap-2">
            {MODES.map((m) => (
              <label key={m.v} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3 ${acc.input_mode === m.v ? 'border-teal bg-ice' : 'border-line'}`}>
                <input type="radio" name="mode" className="mt-1" checked={acc.input_mode === m.v} onChange={() => onChange({ input_mode: m.v, reason: 'input mode change' })} />
                <span><span className="font-semibold">{m.label}</span><br /><span className="text-sm text-navy-500">{m.desc}</span></span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="mb-5 grid gap-4">
          <Range label="Scanning speed (time per item)" value={acc.scan_interval_ms} min={500} max={5000} step={100} fmt={(v) => `${(v / 1000).toFixed(1)} s`}
            onCommit={(v) => onChange({ scan_interval_ms: v, bump_calibration: true, reason: 'scan interval' })} />
          <Range label="Blink hold to select" value={acc.blink_hold_ms} min={250} max={1500} step={50} fmt={(v) => `${v} ms`}
            onCommit={(v) => onChange({ blink_hold_ms: v, bump_calibration: true, reason: 'blink hold' })} />
          <Range label="Head-movement sensitivity" value={Math.round(acc.head_sensitivity * 100)} min={5} max={100} step={5} fmt={(v) => `${v}%`}
            onCommit={(v) => onChange({ head_sensitivity: v / 100, bump_calibration: true, reason: 'head sensitivity' })} />
          <Range label="Text size" value={Math.round(acc.font_scale * 100)} min={80} max={200} step={10} fmt={(v) => `${v}%`}
            onCommit={(v) => onChange({ font_scale: v / 100 })} />
          <Range label="Maximum choices shown" value={acc.max_choices} min={2} max={12} step={1} fmt={(v) => `${v}`}
            onCommit={(v) => onChange({ max_choices: v })} />
          <label className="text-sm font-semibold">Selection key for switch scanning
            <select className="mt-1 block w-full rounded-lg border border-line p-2" value={acc.select_keys?.[0] ?? ' '}
              onChange={(e) => onChange({ select_keys: [e.target.value] })}>
              <option value=" ">Space bar</option><option value="Enter">Enter</option><option value="1">Key 1 (external switch)</option><option value="F8">F8 (switch interface)</option>
            </select>
          </label>
        </div>

        <fieldset className="mb-5 grid gap-2">
          <legend className="mb-2 text-sm font-semibold uppercase tracking-wide text-navy-500">Display</legend>
          <Toggle label="High contrast" checked={acc.contrast_mode === 'high'} onChange={(v) => onChange({ contrast_mode: v ? 'high' : 'standard' })} />
          <Toggle label="Simplified (fewer, larger choices; plain-language questions)" checked={acc.simplified} onChange={(v) => onChange({ simplified: v })} />
          <Toggle label="Reduced motion" checked={acc.reduced_motion} onChange={(v) => onChange({ reduced_motion: v })} />
          <Toggle label="Read questions aloud to me" checked={acc.audio_prompts} onChange={(v) => onChange({ audio_prompts: v })} />
        </fieldset>

        <section className="rounded-xl border border-amber bg-amber-100 p-3">
          <h3 className="flex items-center gap-2 font-semibold"><Lightbulb className="size-4" />Adaptive suggestions</h3>
          <p className="mb-2 text-xs text-navy-500">Based on recorded interaction events for calibration v{acc.calibration_version}. Suggestions are never applied automatically.</p>
          {recs === null ? <p className="text-sm">Loading…</p> : recs.length === 0 ? (
            <p className="text-sm">No suggestions yet{metrics ? ` (${metrics.events} events recorded for this calibration)` : ''}.</p>
          ) : recs.map((r) => (
            <div key={r.id} className="mb-2 rounded-lg bg-white p-3 text-sm">
              <p>{r.reason}</p>
              <p className="mt-1 font-semibold">Suggest: {r.setting.replace(/_/g, ' ')} {String(r.current)} → {String(r.suggested)}</p>
              <button type="button" onClick={() => void apply(r)} className="mt-2 rounded-lg bg-navy px-3 py-1.5 font-semibold text-white">Review and apply</button>
            </div>
          ))}
          {applied && <p className="text-sm text-teal-700" role="status">{applied}</p>}
        </section>
      </div>
    </div>
  )
}

function Range({ label, value, min, max, step, fmt, onCommit }: { label: string; value: number; min: number; max: number; step: number; fmt: (v: number) => string; onCommit: (v: number) => void }) {
  const [v, setV] = useState(value)
  useEffect(() => setV(value), [value])
  return (
    <label className="text-sm font-semibold">
      <span className="flex justify-between"><span>{label}</span><span className="text-navy-500">{fmt(v)}</span></span>
      <input type="range" className="mt-1 w-full accent-teal" min={min} max={max} step={step} value={v}
        onChange={(e) => setV(Number(e.target.value))} onPointerUp={() => onCommit(v)} onKeyUp={() => onCommit(v)} onBlur={() => v !== value && onCommit(v)} />
    </label>
  )
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex cursor-pointer items-center gap-3 rounded-lg p-2 hover:bg-soft">
      <input type="checkbox" className="size-5 accent-teal" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>{label}</span>
    </label>
  )
}
