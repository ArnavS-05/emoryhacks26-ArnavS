import { useEffect, useState } from 'react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { Badge, Card, Empty, fmtTime } from '../../components/ui'

type Bar = { label: string; value: number | null; display: string }

/** Single-series bar chart: teal marks, 4px rounded data-ends, focusable hover tooltips, table fallback. */
function BarChart({ title, bars, unit }: { title: string; bars: Bar[]; unit: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const [table, setTable] = useState(false)
  const max = Math.max(1, ...bars.map((b) => b.value ?? 0))
  const W = 520, H = 180, pad = 28, bw = Math.min(56, (W - pad * 2) / Math.max(bars.length, 1) - 8)
  if (!bars.length) return <Empty>No data yet for {title.toLowerCase()}.</Empty>
  return (
    <figure>
      <figcaption className="mb-2 flex items-center justify-between text-sm font-semibold">
        {title}
        <button type="button" className="text-xs font-normal text-teal-700 underline" onClick={() => setTable((t) => !t)}>{table ? 'Show chart' : 'Show table'}</button>
      </figcaption>
      {table ? (
        <table className="w-full text-sm"><thead><tr className="text-left text-navy-500"><th className="py-1">Item</th><th>{unit}</th></tr></thead>
          <tbody>{bars.map((b) => <tr key={b.label} className="border-t border-line"><td className="py-1">{b.label}</td><td>{b.display}</td></tr>)}</tbody></table>
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H + 24}`} className="w-full" role="img" aria-label={`${title}: ${bars.map((b) => `${b.label} ${b.display}`).join(', ')}`}>
            {[0.5, 1].map((f) => <line key={f} x1={pad} x2={W - pad} y1={H - (H - 20) * f} y2={H - (H - 20) * f} stroke="#e4ebf1" strokeWidth={1} />)}
            <line x1={pad} x2={W - pad} y1={H} y2={H} stroke="#9fb3c8" strokeWidth={1} />
            {bars.map((b, i) => {
              const step = (W - pad * 2) / bars.length
              const x = pad + step * i + (step - bw) / 2
              const h = b.value == null ? 0 : Math.max(2, ((H - 20) * b.value) / max)
              const r = Math.min(4, h / 2)
              return (
                <g key={b.label} tabIndex={0} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} aria-label={`${b.label}: ${b.display}`}>
                  <rect x={x - 6} y={20} width={bw + 12} height={H - 20} fill="transparent" />
                  <path d={`M${x},${H} V${H - h + r} Q${x},${H - h} ${x + r},${H - h} H${x + bw - r} Q${x + bw},${H - h} ${x + bw},${H - h + r} V${H} Z`} fill={hover === i ? '#06585c' : '#087a7f'} />
                  {bars.length <= 6 && <text x={x + bw / 2} y={H - h - 6} textAnchor="middle" fontSize="11" fill="#243b53">{b.display}</text>}
                  <text x={x + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="#486581">{b.label}</text>
                </g>
              )
            })}
          </svg>
          {hover != null && (
            <div className="pointer-events-none absolute top-0 rounded-lg border border-line bg-white px-2 py-1 text-xs shadow" style={{ left: `${((hover + 0.5) / bars.length) * 100}%`, transform: 'translateX(-50%)' }}>
              <div className="font-bold">{bars[hover].display}</div><div className="text-navy-500">{bars[hover].label}</div>
            </div>
          )}
        </div>
      )}
    </figure>
  )
}

function Tile({ label, value, sub }: { label: string; value: React.ReactNode; sub?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-navy-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value ?? '—'}</div>
      {sub && <div className="text-xs text-navy-500">{sub}</div>}
    </div>
  )
}

const sec = (ms?: number | null) => (ms == null ? '—' : `${(ms / 1000).toFixed(1)} s`)
const pct = (x?: number | null) => (x == null ? '—' : `${Math.round(x * 100)}%`)

export function PatientAnalytics({ patientId, token }: { patientId: string; token: string }) {
  const [a, setA] = useState<any>(null)
  useEffect(() => { api(`/api/patients/${patientId}/analytics?hours=168`, { token }).then(setA).catch(() => setA(null)) }, [patientId, token])
  if (!a) return null
  const m = a.metrics
  return (
    <Card title={<span className="flex items-center gap-2">Communication analytics <Badge tone={a.storage === 'tigerdata' ? 'teal' : 'amber'}>{a.storage === 'tigerdata' ? 'Tiger Data' : 'local fallback DB'}</Badge></span>}>
      <p className="mb-4 text-sm text-navy-500">Recorded interaction events for the current calibration (v{a.calibration_version}), last 7 days. Real measurements only; empty until the patient uses the board.</p>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Tile label="Confirmed messages" value={m.confirmed_messages} />
        <Tile label="Avg. composition time" value={sec(m.avg_composition_ms)} />
        <Tile label="Selection success" value={m.selections ? pct(m.successful_selections / m.selections) : '—'} sub={`${m.selections} selections`} />
        <Tile label="Corrections" value={m.corrections} sub={`correction rate ${pct(m.correction_rate)}`} />
        <Tile label="Missed scan cycles" value={m.missed_scan_cycles} sub={`miss rate ${pct(m.miss_rate)}`} />
        <Tile label="Avg. selection latency" value={sec(m.avg_selection_latency_ms)} />
        <Tile label="Near-miss blinks" value={m.blink_rejected} />
        <Tile label="Suggestions" value={a.recommendations.length} sub="shown to patient/caregiver to confirm" />
      </div>
      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <BarChart title="Avg. composition time by calibration version" unit="seconds"
          bars={a.by_calibration_version.map((v: any) => ({ label: `v${v.version}`, value: v.avg_composition_ms, display: sec(v.avg_composition_ms) }))} />
        <BarChart title="Selections by input mode" unit="selections"
          bars={a.mode_usage.map((u: any) => ({ label: u.mode, value: u.selections, display: String(u.selections) }))} />
        <BarChart title="Composition time per confirmed message (most recent 12)" unit="seconds"
          bars={a.composition_timeline.slice(-12).map((e: any) => ({ label: fmtTime(e.ts), value: e.ms, display: sec(e.ms) }))} />
        <div>
          <h3 className="mb-2 text-sm font-semibold">Calibration impact</h3>
          {a.by_calibration_version.length < 2 ? <Empty>Apply a calibration change to compare before/after.</Empty> : (
            <table className="w-full text-sm"><thead><tr className="text-left text-navy-500"><th className="py-1">Version</th><th>Selections</th><th>Corrections</th><th>Missed cycles</th><th>Avg. compose</th></tr></thead>
              <tbody>{a.by_calibration_version.map((v: any) => (
                <tr key={v.version} className="border-t border-line"><td className="py-1">v{v.version}</td><td>{v.selections}</td><td>{v.corrections}</td><td>{v.missed_cycles}</td><td>{sec(v.avg_composition_ms)}</td></tr>
              ))}</tbody></table>
          )}
        </div>
      </div>
    </Card>
  )
}

export function AnalyticsPage() {
  const token = useAuth((s) => s.clinician!.token)
  const [patients, setPatients] = useState<any[]>([])
  const [pid, setPid] = useState('')
  const [overview, setOverview] = useState<any>(null)
  const [cagg, setCagg] = useState<any>(null)
  useEffect(() => {
    api('/api/patients', { token }).then((ps) => { setPatients(ps); if (ps[0]) setPid(ps[0].id) })
    api('/api/analytics/overview', { token }).then(setOverview)
    api('/api/analytics/continuous-aggregate', { token }).then(setCagg)
  }, [token])
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div><h1 className="text-2xl font-bold">Accessibility analytics</h1><p className="text-sm text-navy-500">Time-series interaction data drives adaptive suggestions. Nothing is applied automatically.</p></div>
      {overview && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <Tile label="Selections (7d)" value={overview.selections} />
          <Tile label="Success rate" value={overview.selections ? pct(overview.successful_selections / overview.selections) : '—'} />
          <Tile label="Corrections" value={overview.corrections} />
          <Tile label="Confirmed messages" value={overview.confirmed_messages} />
          <Tile label="Avg. composition" value={sec(overview.avg_composition_ms)} />
        </div>
      )}
      <label className="block text-sm font-semibold">Patient
        <select className="ml-2 rounded-lg border border-line px-2 py-1" value={pid} onChange={(e) => setPid(e.target.value)}>
          {patients.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </label>
      {pid && <PatientAnalytics key={pid} patientId={pid} token={token} />}
      <Card title="TimescaleDB continuous aggregate · session_interaction_5m">
        {!cagg ? <p className="text-sm">Loading…</p> : !cagg.available ? <Empty>{cagg.reason}</Empty> : cagg.rows.length === 0 ? <Empty>No aggregated buckets yet (refreshes every minute).</Empty> : (
          <div className="overflow-auto"><table className="w-full text-sm"><thead><tr className="text-left text-navy-500"><th className="py-1">Bucket</th><th>Mode</th><th>Cal.</th><th>Selections</th><th>Corrections</th><th>Missed</th><th>Confirmed</th><th>Avg. compose</th></tr></thead>
            <tbody>{cagg.rows.map((r: any, i: number) => (
              <tr key={i} className="border-t border-line"><td className="py-1">{fmtTime(r.bucket)}</td><td>{r.input_mode}</td><td>v{r.calibration_version}</td><td>{r.selections}</td><td>{r.corrections}</td><td>{r.missed_cycles}</td><td>{r.confirmed_messages}</td><td>{sec(r.avg_composition_ms)}</td></tr>
            ))}</tbody></table>
            {cagg.hypertable && <p className="mt-2 text-xs text-navy-500">Hypertable interaction_events · {cagg.hypertable.num_chunks} chunks</p>}
          </div>
        )}
      </Card>
    </div>
  )
}
