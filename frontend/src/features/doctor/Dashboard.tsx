import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Play, UserPlus, Users } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { Badge, Button, Card, Empty, ErrorNote, fmtDate } from '../../components/ui'

export function Dashboard() {
  const token = useAuth((s) => s.clinician!.token)
  const [patients, setPatients] = useState<any[] | null>(null)
  const [sessions, setSessions] = useState<any[] | null>(null)
  const [overview, setOverview] = useState<any>(null)
  const [error, setError] = useState('')
  const nav = useNavigate()

  useEffect(() => {
    api('/api/patients', { token }).then(setPatients).catch((e) => setError(e.message))
    api('/api/sessions', { token }).then(setSessions).catch(() => setSessions([]))
    api('/api/analytics/overview', { token }).then(setOverview).catch(() => null)
  }, [token])

  const startSession = async (patientId: string) => {
    const s = await api('/api/sessions', { body: { patient_id: patientId }, token })
    nav(`/clinician/session/${s.id}`)
  }

  const active = sessions?.filter((s) => s.status === 'active') ?? []
  const done = sessions?.filter((s) => s.status !== 'active') ?? []
  const stat = (label: string, value: React.ReactNode, sub?: string) => (
    <div className="rounded-2xl border border-line bg-white p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-navy-500">{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs text-navy-500">{sub}</div>}
    </div>
  )

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h1 className="text-2xl font-bold">Dashboard</h1><p className="text-sm text-navy-500">Synthetic patient records · accessible care sessions</p></div>
        <div className="flex gap-2">
          <Button variant="secondary" onClick={() => nav('/clinician/patients/new')}><UserPlus className="size-4" />New patient</Button>
        </div>
      </div>
      <ErrorNote error={error} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {stat('Patients', patients?.length ?? '—')}
        {stat('Active sessions', active.length)}
        {stat('Confirmed messages (7d)', overview?.confirmed_messages ?? '—')}
        {stat('Avg. composition', overview?.avg_composition_ms ? `${(overview.avg_composition_ms / 1000).toFixed(1)} s` : '—', 'per confirmed message')}
        {stat('Help requests (7d)', overview?.help_requests ?? '—', overview ? `stored in ${overview.storage === 'tigerdata' ? 'Tiger Data' : 'local DB'}` : '')}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Card title={<span className="flex items-center gap-2"><Users className="size-4" />Patients</span>}>
          {patients === null ? <p className="text-sm text-navy-500">Loading…</p> : patients.length === 0 ? <Empty>No patients yet.</Empty> : (
            <ul className="divide-y divide-line">
              {patients.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                  <div className="flex size-10 items-center justify-center rounded-full bg-ice font-semibold text-teal-700" aria-hidden>{p.name.split(' ').map((x: string) => x[0]).join('').slice(0, 2)}</div>
                  <div className="min-w-0 flex-1">
                    <Link to={`/clinician/patients/${p.id}`} className="font-semibold hover:text-teal-700">{p.name}</Link>
                    <div className="truncate text-xs text-navy-500">{p.age ?? '—'} y · {p.preferred_language.toUpperCase()} · {p.communication_abilities?.[0] ?? 'No abilities recorded'}</div>
                  </div>
                  <Badge tone="teal">{p.input_mode}</Badge>
                  {p.is_synthetic && <Badge>synthetic</Badge>}
                  <span className="hidden text-xs text-navy-500 md:inline">viewed {fmtDate(p.last_accessed_at)}</span>
                  <Button size="sm" onClick={() => startSession(p.id)}><Play className="size-3.5" />Start care session</Button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div className="space-y-6">
          <Card title="Active sessions">
            {active.length === 0 ? <Empty>No active sessions.</Empty> : (
              <ul className="space-y-2">{active.map((s) => (
                <li key={s.id}><Link to={`/clinician/session/${s.id}`} className="flex items-center justify-between rounded-xl border border-line p-3 hover:border-teal">
                  <span><span className="font-semibold">{s.patient_name}</span><br /><span className="text-xs text-navy-500">{fmtDate(s.started_at)} {s.is_demo ? '· demo' : ''}</span></span>
                  <span className="font-mono text-sm tracking-widest">{s.join_code}</span>
                </Link></li>
              ))}</ul>
            )}
          </Card>
          <Card title="Completed sessions">
            {done.length === 0 ? <Empty>None yet.</Empty> : (
              <ul className="space-y-1 text-sm">{done.slice(0, 8).map((s) => (
                <li key={s.id}><Link to={`/clinician/session/${s.id}`} className="flex justify-between rounded-lg px-2 py-1.5 hover:bg-soft"><span>{s.patient_name}</span><span className="text-navy-500">{fmtDate(s.started_at)}</span></Link></li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>
    </div>
  )
}
