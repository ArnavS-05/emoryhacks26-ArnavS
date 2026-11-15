import { useState } from 'react'
import { Search } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { Badge, Button, Card, ErrorNote, inputCls } from '../../components/ui'

const PRESETS = [
  { q: 'my belly hurts', intent: 'pain_location', categories: ['pain'] },
  { q: 'cant catch my breath', intent: 'breathing', categories: ['breathing', 'urgent'] },
  { q: 'tummy', intent: '', categories: [] },
  { q: 'need to pee', intent: 'hygiene', categories: ['hygiene'] },
  { q: 'painkiller', intent: 'medication', categories: ['medication'] },
  { q: 'brething', intent: '', categories: [] },
]
const CATS = ['pain', 'symptoms', 'breathing', 'comfort', 'movement', 'eating_drinking', 'hygiene', 'questions', 'feelings', 'medication', 'urgent', 'general']

function ResultList({ title, r }: { title: string; r: any }) {
  return (
    <Card title={<span className="flex items-center gap-2">{title}<Badge tone={r.engine === 'typesense' ? 'teal' : 'amber'}>{r.engine}</Badge><Badge>{r.mode}{r.embedding_mode ? ` · ${r.embedding_mode}` : ''}</Badge></span>}>
      <dl className="mb-3 grid grid-cols-3 gap-2 text-xs">
        <div><dt className="text-navy-500">Typesense time</dt><dd className="font-semibold">{r.search_time_ms ?? '—'} ms</dd></div>
        <div><dt className="text-navy-500">Round trip</dt><dd className="font-semibold">{r.round_trip_ms} ms</dd></div>
        <div><dt className="text-navy-500">Found</dt><dd className="font-semibold">{r.found}</dd></div>
      </dl>
      <p className="mb-3 break-all rounded-lg bg-soft p-2 font-mono text-xs">filter_by: {r.filter_by}</p>
      <ol className="space-y-2">
        {r.results.map((d: any, i: number) => (
          <li key={d.id} className="rounded-xl border border-line p-2.5 text-sm">
            <div className="flex items-center gap-2"><span className="w-5 text-navy-500">{i + 1}</span><span className="flex-1 font-semibold">{d.text}</span><Badge>{d.category}</Badge><span className="font-mono text-xs">{d.score}</span></div>
            <div className="mt-1 flex flex-wrap gap-x-3 pl-7 text-xs text-navy-500">
              <span>ts rank {d.ranking.typesense_rank}</span>
              {d.ranking.text_match != null && <span>text_match {String(d.ranking.text_match).slice(0, 12)}</span>}
              {d.ranking.vector_distance != null && <span>vector dist {Number(d.ranking.vector_distance).toFixed(3)}</span>}
              {d.ranking.hybrid_score != null && <span>fusion {Number(d.ranking.hybrid_score).toFixed(3)}</span>}
              {d.ranking.intent_boost > 0 && <span className="text-teal-700">+intent {d.ranking.intent_boost}</span>}
              {d.ranking.category_boost > 0 && <span className="text-teal-700">+category {d.ranking.category_boost}</span>}
              {d.ranking.safety_boost > 0 && <span>+safety {d.ranking.safety_boost}</span>}
            </div>
          </li>
        ))}
      </ol>
    </Card>
  )
}

export function SearchInspector() {
  const token = useAuth((s) => s.clinician!.token)
  const [q, setQ] = useState(PRESETS[0].q)
  const [intent, setIntent] = useState(PRESETS[0].intent)
  const [cats, setCats] = useState<string[]>(PRESETS[0].categories)
  const [res, setRes] = useState<any>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const run = async (over?: Partial<{ q: string; intent: string; categories: string[] }>) => {
    setBusy(true)
    setError('')
    try {
      setRes(await api('/api/search/compare', { token, body: { q: over?.q ?? q, intent: (over?.intent ?? intent) || null, categories: over?.categories ?? cats, limit: 8 } }))
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div><h1 className="text-2xl font-bold">Context-Aware Accessible Search</h1>
        <p className="text-sm text-navy-500">Inputs: Gemini-classified intent, topic categories, and patient preferences. Typesense retrieves (typo tolerance, prefix, synonyms, filters, facets, vectors); Synaphi re-ranks with an explicit, inspectable score.</p></div>
      <Card>
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void run() }}>
          <div className="flex gap-2">
            <label className="sr-only" htmlFor="sq">Query</label>
            <input id="sq" className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} />
            <label className="sr-only" htmlFor="si">Intent</label>
            <input id="si" className={`${inputCls} w-48`} placeholder="intent (optional)" value={intent} onChange={(e) => setIntent(e.target.value)} />
            <Button type="submit" loading={busy}><Search className="size-4" />Compare</Button>
          </div>
          <div className="flex flex-wrap gap-1.5">{CATS.map((c) => {
            const on = cats.includes(c)
            return <button key={c} type="button" aria-pressed={on} onClick={() => setCats(on ? cats.filter((x) => x !== c) : [...cats, c])} className={`rounded-full border px-2.5 py-1 text-xs ${on ? 'border-teal bg-ice text-teal-700' : 'border-line'}`}>{c}</button>
          })}</div>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-navy-500">Try:{PRESETS.map((p) => (
            <button key={p.q} type="button" className="rounded-full bg-soft px-2.5 py-1 hover:bg-ice" onClick={() => { setQ(p.q); setIntent(p.intent); setCats(p.categories); void run(p) }}>{p.q}</button>
          ))}</div>
        </form>
      </Card>
      <ErrorNote error={error} />
      {res && (
        <>
          <p className="text-sm text-navy-500">Collection state: {res.state.connected ? 'connected' : 'not connected (local fallback)'} · embeddings {res.state.embedding_mode} · {res.state.indexed_phrases} phrases indexed</p>
          <div className="grid gap-6 lg:grid-cols-2">
            <ResultList title="Keyword" r={res.keyword} />
            <ResultList title="Hybrid (keyword + vector)" r={res.hybrid} />
          </div>
          {res.hybrid.facets?.length > 0 && (
            <Card title="Facets">
              <div className="flex flex-wrap gap-6 text-sm">{res.hybrid.facets.map((f: any) => (
                <div key={f.field}><div className="font-semibold">{f.field}</div>{f.counts.map((c: any) => <div key={c.value} className="text-navy-500">{c.value}: {c.count}</div>)}</div>
              ))}</div>
            </Card>
          )}
        </>
      )}
    </div>
  )
}
