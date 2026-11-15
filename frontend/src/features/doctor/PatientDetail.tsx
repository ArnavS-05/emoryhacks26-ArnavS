import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { Check, FileUp, Play, ShieldCheck, X } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { Badge, Button, Card, EngineBadge, Empty, ErrorNote, fmtDate, inputCls } from '../../components/ui'
import { PatientAnalytics } from '../analytics/AnalyticsPage'
import { SplitView } from '../sessions/SplitView'
import { ClinicianSession } from './ClinicianSession'

const KINDS = ['medication', 'allergy', 'condition', 'history'] as const

export function PatientDetail() {
  const { patientId } = useParams()
  const token = useAuth((s) => s.clinician!.token)
  const nav = useNavigate()
  const [p, setP] = useState<any>(null)
  const [error, setError] = useState('')
  const [upload, setUpload] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [add, setAdd] = useState({ kind: 'medication', label: '', detail: '' })

  const load = () => api(`/api/patients/${patientId}`, { token }).then(setP).catch((e) => setError(e.message))
  useEffect(() => { void load() }, [patientId]) // eslint-disable-line react-hooks/exhaustive-deps

  const onUpload = async (file: File) => {
    setBusy(true)
    setError('')
    setUpload(null)
    const form = new FormData()
    form.append('file', file)
    try {
      setUpload(await api(`/api/patients/${patientId}/documents`, { form, token, timeoutMs: 90000 }))
      await load()
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const review = async (id: string, status: 'verified' | 'rejected') => {
    await api(`/api/patients/${patientId}/context/${id}`, { method: 'PATCH', body: { status }, token })
    await load()
  }
  const addItem = async (e: React.FormEvent) => {
    e.preventDefault()
    await api(`/api/patients/${patientId}/context`, { body: add, token })
    setAdd({ ...add, label: '', detail: '' })
    await load()
  }
  const start = async () => {
    const s = await api('/api/sessions', { body: { patient_id: patientId }, token })
    nav(`/clinician/session/${s.id}`)
  }

  if (!p) return <div className="p-6"><ErrorNote error={error} />{!error && <p className="text-sm text-navy-500">Loading…</p>}</div>
  const pending = p.context.filter((c: any) => c.status === 'unverified')
  const verified = p.context.filter((c: any) => c.status === 'verified')
  const docName = (id: string) => p.documents.find((d: any) => d.id === id)?.filename ?? 'document'

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex size-12 items-center justify-center rounded-full bg-ice text-lg font-bold text-teal-700" aria-hidden>{p.name.split(' ').map((x: string) => x[0]).join('').slice(0, 2)}</div>
        <div><h1 className="text-2xl font-bold">{p.name}</h1><p className="text-sm text-navy-500">{p.age ?? '—'} y · language {p.preferred_language.toUpperCase()} · input {p.accessibility.input_mode} {p.is_synthetic && '· synthetic record'}</p></div>
        <Button className="ml-auto" onClick={start}><Play className="size-4" />Start care session</Button>
      </div>
      <ErrorNote error={error} />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Communication profile" className="lg:col-span-1">
          <ul className="flex flex-wrap gap-1.5">{p.profile.communication_abilities?.map((a: string) => <li key={a}><Badge tone="teal">{a}</Badge></li>)}</ul>
          {p.profile.accessibility_notes && <p className="mt-3 text-sm">{p.profile.accessibility_notes}</p>}
          <dl className="mt-3 grid grid-cols-2 gap-2 text-sm">
            <dt className="text-navy-500">Scan interval</dt><dd>{(p.accessibility.scan_interval_ms / 1000).toFixed(1)} s</dd>
            <dt className="text-navy-500">Blink hold</dt><dd>{p.accessibility.blink_hold_ms} ms</dd>
            <dt className="text-navy-500">Text size</dt><dd>{Math.round(p.accessibility.font_scale * 100)}%</dd>
            <dt className="text-navy-500">Simplified</dt><dd>{p.accessibility.simplified ? 'Yes' : 'No'}</dd>
            <dt className="text-navy-500">Calibration</dt><dd>v{p.accessibility.calibration_version}</dd>
          </dl>
          {p.profile.caregiver?.name && <p className="mt-3 text-sm"><span className="text-navy-500">Caregiver:</span> {p.profile.caregiver.name} ({p.profile.caregiver.relationship})</p>}
        </Card>

        <Card title="Verified medical context" className="lg:col-span-2">
          {verified.length === 0 ? <Empty>No verified records.</Empty> : (
            <div className="grid gap-4 sm:grid-cols-2">
              {KINDS.map((k) => {
                const items = verified.filter((c: any) => c.kind === k)
                return (
                  <div key={k}>
                    <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-navy-500">{({ medication: 'Medications', allergy: 'Allergies', condition: 'Conditions', history: 'History' } as const)[k]}</h3>
                    {items.length === 0 ? <p className="text-sm text-navy-300">None recorded</p> : (
                      <ul className="space-y-1">{items.map((c: any) => (
                        <li key={c.id} className="text-sm"><span className="font-medium">{c.label}</span>{c.detail && <span className="text-navy-500"> — {c.detail}</span>}
                          <span className="block text-xs text-navy-300">{c.source_type === 'document' ? `from ${docName(c.source_document_id)}` : c.source_type} · verified by {c.verified_by}</span></li>
                      ))}</ul>
                    )}
                  </div>
                )
              })}
            </div>
          )}
          <form onSubmit={addItem} className="mt-4 flex flex-wrap gap-2 border-t border-line pt-4">
            <select aria-label="Kind" className={`${inputCls} w-36`} value={add.kind} onChange={(e) => setAdd({ ...add, kind: e.target.value })}>{KINDS.map((k) => <option key={k}>{k}</option>)}</select>
            <input aria-label="Label" className={`${inputCls} flex-1`} placeholder="Label" value={add.label} onChange={(e) => setAdd({ ...add, label: e.target.value })} required />
            <input aria-label="Detail" className={`${inputCls} flex-1`} placeholder="Detail (dose, reaction…)" value={add.detail} onChange={(e) => setAdd({ ...add, detail: e.target.value })} />
            <Button type="submit" variant="secondary">Add verified</Button>
          </form>
        </Card>
      </div>

      <Card title="Medical documents" actions={
        <>
          <input ref={fileRef} type="file" accept="application/pdf,image/png,image/jpeg" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          <Button size="sm" onClick={() => fileRef.current?.click()} loading={busy}><FileUp className="size-4" />Upload PDF / JPG / PNG</Button>
        </>
      }>
        <p className="mb-3 text-sm text-navy-500">Gemini extracts medications, allergies, conditions, and history. Every extracted field stays <strong>unverified</strong> until you approve it, and keeps a link to its source document and excerpt.</p>
        {upload && (
          <div className="mb-4 rounded-xl border border-line bg-soft p-3 text-sm">
            <div className="flex items-center gap-2"><strong>{upload.document.filename}</strong><EngineBadge engine={upload.document.extraction_engine} />{upload.document_type && <Badge>{upload.document_type}</Badge>}</div>
            {upload.document.extraction_status === 'failed' && <p className="mt-1 text-urgent">Extraction unavailable: {upload.document.extraction_error}. You can add fields manually.</p>}
            {upload.warnings?.map((w: string, i: number) => <p key={i} className="mt-1 text-[#7a4b00]">⚠ {w}</p>)}
          </div>
        )}
        <h3 className="mb-2 text-sm font-semibold">Pending review ({pending.length})</h3>
        {pending.length === 0 ? <Empty>No unverified fields.</Empty> : (
          <ul className="space-y-2">{pending.map((c: any) => (
            <li key={c.id} className="flex flex-wrap items-start gap-3 rounded-xl border border-amber bg-amber-100/50 p-3">
              <Badge tone="amber">unverified</Badge><Badge>{c.kind}</Badge>
              <div className="min-w-0 flex-1 text-sm">
                <div className="font-semibold">{c.label}{c.detail && <span className="font-normal"> — {c.detail}</span>}</div>
                <div className="text-xs text-navy-500">Source: {docName(c.source_document_id)} · “{c.source_excerpt}” {c.confidence != null && `· confidence ${Math.round(c.confidence * 100)}%`}</div>
              </div>
              <Button size="sm" onClick={() => review(c.id, 'verified')}><Check className="size-4" />Approve</Button>
              <Button size="sm" variant="secondary" onClick={() => review(c.id, 'rejected')}><X className="size-4" />Reject</Button>
            </li>
          ))}</ul>
        )}
        {p.documents.length > 0 && (
          <ul className="mt-4 divide-y divide-line text-sm">{p.documents.map((d: any) => (
            <li key={d.id} className="flex items-center gap-3 py-2"><span className="flex-1">{d.filename}</span><Badge tone={d.extraction_status === 'extracted' ? 'teal' : 'amber'}>{d.extraction_status}</Badge><span className="text-navy-500">{fmtDate(d.uploaded_at)}</span></li>
          ))}</ul>
        )}
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card title="Sessions">
          {p.sessions.length === 0 ? <Empty>No sessions yet.</Empty> : (
            <ul className="divide-y divide-line text-sm">{p.sessions.map((s: any) => (
              <li key={s.id}><Link to={`/clinician/session/${s.id}`} className="flex justify-between py-2 hover:text-teal-700"><span>{fmtDate(s.started_at)}</span><Badge tone={s.status === 'active' ? 'teal' : 'neutral'}>{s.status}</Badge></Link></li>
            ))}</ul>
          )}
        </Card>
        <Card title={<span className="flex items-center gap-2"><ShieldCheck className="size-4" />Approved encounter notes</span>}>
          {p.approved_notes.length === 0 ? <Empty>No approved notes yet.</Empty> : (
            <ul className="space-y-3 text-sm">{p.approved_notes.map((n: any) => (
              <li key={n.id} className="rounded-xl border border-line p-3">
                <div className="font-semibold">{n.content.reason_for_visit || 'Encounter note'}</div>
                <ul className="mt-1 list-disc pl-5">{(n.content.patient_confirmed_statements ?? []).filter(Boolean).map((x: string, i: number) => <li key={i}>{x}</li>)}</ul>
                <div className="mt-1 text-xs text-navy-500">Approved by {n.approved_by} · {fmtDate(n.updated_at)}</div>
              </li>
            ))}</ul>
          )}
        </Card>
      </div>

      <PatientAnalytics patientId={p.id} token={token} />
    </div>
  )
}

export function SessionPage() {
  const { sessionId } = useParams()
  const token = useAuth((s) => s.clinician!.token)
  const [patientToken, setPatientToken] = useState<string | null>(null)
  const [err, setErr] = useState('')
  const openHere = async () => {
    try {
      const s = await api(`/api/sessions/${sessionId}`, { token })
      const r = await api('/api/auth/patient', { body: { join_code: s.session.join_code } })
      setPatientToken(r.token)
    } catch (e) { setErr((e as Error).message) }
  }
  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-3 border-b border-line bg-white px-4 py-2 text-sm">
        <span className="text-navy-500">Patient device: open <span className="font-mono font-semibold">{location.origin}/join</span> and enter the join code.</span>
        {!patientToken && <Button size="sm" variant="secondary" className="ml-auto" onClick={openHere}>Open patient board on this screen</Button>}
        <ErrorNote error={err} />
      </div>
      <div className="min-h-0 flex-1">
        {patientToken ? <SplitView sessionId={sessionId!} clinicianToken={token} patientToken={patientToken} /> : <ClinicianSession sessionId={sessionId!} token={token} />}
      </div>
    </div>
  )
}
