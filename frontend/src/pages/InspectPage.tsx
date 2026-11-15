import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'
import { Badge, Button, Card, ErrorNote, Logo } from '../components/ui'

/** Evidence view for judges: live integration state pulled from the running backend. No secrets shown. */
export function InspectPage() {
  const clinician = useAuth((s) => s.clinician)
  const [data, setData] = useState<any>(null)
  const [health, setHealth] = useState<any>(null)
  const [verify, setVerify] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const load = () => {
    api('/api/health').then(setHealth).catch(() => null)
    if (clinician) api('/api/system/inspect', { token: clinician.token }).then(setData).catch((e) => setError(e.message))
  }
  useEffect(load, [clinician]) // eslint-disable-line react-hooks/exhaustive-deps
  const runVerify = async () => {
    setBusy(true)
    try { setVerify(await api('/api/system/verify-gemini', { method: 'POST', token: clinician!.token, timeoutMs: 90000 })); load() } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const ok = (v: boolean, yes: string, no: string) => <Badge tone={v ? 'teal' : 'amber'}>{v ? yes : no}</Badge>
  return (
    <div className="min-h-full bg-soft">
      <header className="flex items-center gap-4 border-b border-line bg-white px-6 py-3"><Logo /><span className="font-semibold">Technical inspection</span>
        <Link to="/demo" className="ml-auto text-sm text-teal-700 underline">Back to demo</Link><Link to="/clinician" className="text-sm text-teal-700 underline">Clinician app</Link></header>
      <main className="mx-auto max-w-6xl space-y-6 p-6">
        <p className="text-sm text-navy-500">Everything below is read live from the running backend. Fallbacks are labelled as fallbacks. No credentials are displayed.</p>
        <ErrorNote error={error} />
        {!clinician && <Card><p className="text-sm">Sign in (or open <Link className="text-teal-700 underline" to="/demo">/demo</Link> first) to view detailed integration state.</p></Card>}
        {health && <Card title="API health"><pre className="overflow-auto text-xs">{JSON.stringify(health, null, 2)}</pre></Card>}
        {data && (
          <div className="grid gap-6 lg:grid-cols-2">
            <Card title={<span className="flex items-center gap-2">Google Gemini {ok(data.gemini.configured, 'configured', 'not configured')}</span>}
              actions={<Button size="sm" variant="secondary" onClick={runVerify} loading={busy} disabled={!data.gemini.configured}>Run live verification</Button>}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-navy-500">Text model</dt><dd className="font-mono">{data.gemini.text_model}</dd>
                <dt className="text-navy-500">Live model</dt><dd className="font-mono">{data.gemini.live_model}</dd>
                <dt className="text-navy-500">Embeddings</dt><dd className="font-mono">{data.gemini.embedding_model}</dd>
              </dl>
              {(verify || Object.keys(data.gemini.verified_models).length > 0) && (
                <div className="mt-3"><h3 className="text-xs font-semibold uppercase text-navy-500">Verification (real API calls)</h3>
                  <ul className="text-sm">{Object.entries(verify ?? data.gemini.verified_models).map(([m, r]) => <li key={m}><span className="font-mono">{m}</span>: {String(r)}</li>)}</ul></div>
              )}
              <h3 className="mt-3 text-xs font-semibold uppercase text-navy-500">Calls since server start</h3>
              {Object.keys(data.gemini.calls).length === 0 ? <p className="text-sm text-navy-500">None yet.</p> : (
                <table className="w-full text-sm"><thead><tr className="text-left text-navy-500"><th>Operation</th><th>OK</th><th>Failed</th><th>Last ms</th></tr></thead>
                  <tbody>{Object.entries<any>(data.gemini.calls).map(([op, s]) => (
                    <tr key={op} className="border-t border-line" title={s.last_error}><td>{op}</td><td>{s.ok}</td><td>{s.failed}</td><td>{s.last_latency_ms}</td></tr>
                  ))}</tbody></table>
              )}
            </Card>
            <Card title={<span className="flex items-center gap-2">Typesense {ok(data.typesense.connected, 'connected', data.typesense.configured ? 'configured, not connected' : 'not configured · local fallback')}</span>}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-navy-500">Server version</dt><dd>{data.typesense.server_version || '—'}</dd>
                <dt className="text-navy-500">Phrases indexed</dt><dd>{data.typesense.indexed_phrases}</dd>
                <dt className="text-navy-500">Embeddings</dt><dd className="font-mono">{data.typesense.embedding_mode}</dd>
                <dt className="text-navy-500">Synonyms</dt><dd>{String(data.typesense.synonym_sets || '—')}</dd>
                <dt className="text-navy-500">Last error</dt><dd className="break-all text-xs">{data.typesense.last_error || '—'}</dd>
              </dl>
              <Link to="/clinician/search" className="mt-3 inline-block text-sm text-teal-700 underline">Open search inspector →</Link>
            </Card>
            <Card title={<span className="flex items-center gap-2">Database {ok(data.database.backend === 'tigerdata', 'Tiger Data', 'local SQLite fallback')}</span>}>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-navy-500">Server</dt><dd className="break-all text-xs">{String(data.database.server_version ?? '—').slice(0, 120)}</dd>
                <dt className="text-navy-500">TimescaleDB</dt><dd>{data.database.timescaledb ?? '—'}</dd>
                <dt className="text-navy-500">TLS</dt><dd>{data.database.ssl == null ? '—' : String(data.database.ssl)}</dd>
                <dt className="text-navy-500">Hypertables</dt><dd>{data.database.hypertables?.map((h: any) => `${h.hypertable_name} (${h.num_chunks} chunks)`).join(', ') || '—'}</dd>
                <dt className="text-navy-500">Continuous aggs</dt><dd>{data.database.continuous_aggregates?.join(', ') || '—'}</dd>
                <dt className="text-navy-500">Migrations</dt><dd>{data.database.migrations?.join(', ')}</dd>
                <dt className="text-navy-500">Interaction events</dt><dd>{data.database.interaction_events}</dd>
              </dl>
            </Card>
            <Card title="Deployment">
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
                <dt className="text-navy-500">Environment</dt><dd>{data.app.env}</dd>
                <dt className="text-navy-500">Public URL</dt><dd>{data.app.public_url ?? '—'}</dd>
                <dt className="text-navy-500">Served from</dt><dd>{location.origin}</dd>
                <dt className="text-navy-500">HTTPS</dt><dd>{location.protocol === 'https:' ? 'yes' : 'no (local)'}</dd>
              </dl>
            </Card>
          </div>
        )}
      </main>
    </div>
  )
}
