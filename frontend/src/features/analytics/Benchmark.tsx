import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../../lib/api'
import { Pictogram } from '../../lib/pictograms'
import { useAuth } from '../../store/auth'
import { Badge, Button, Card, Empty } from '../../components/ui'

const TASKS = [
  { id: 'pain-location', question: 'Where do you feel pain?', target: 'pain-stomach', instruction: 'Answer: your stomach hurts' },
  { id: 'toilet', question: 'Is there anything you need right now?', target: 'hy-toilet', instruction: 'Answer: you need the toilet' },
  { id: 'breathing', question: 'Are you having trouble breathing?', target: 'br-hard', instruction: 'Answer: it is hard to breathe' },
]
const DEMO_PATIENT = '00000000000000000000000000000d01'

type Run = { board: 'static' | 'synaphi'; task: string; duration_ms: number; selections: number; incorrect_selections: number; corrections: number; completed: boolean; retrieval_ms?: number | null }

/** Real, user-performed comparison of a static communication board vs. Synaphi's contextual board. */
export function Benchmark() {
  const token = useAuth((s) => s.clinician!.token)
  const [phrases, setPhrases] = useState<any[]>([])
  const [task, setTask] = useState(TASKS[0])
  const [board, setBoard] = useState<'static' | 'synaphi'>('static')
  const [running, setRunning] = useState(false)
  const [cat, setCat] = useState('pain')
  const [options, setOptions] = useState<any[]>([])
  const [meta, setMeta] = useState<any>(null)
  const [runs, setRuns] = useState<any[]>([])
  const counters = useRef({ start: 0, selections: 0, incorrect: 0, corrections: 0 })
  const [flash, setFlash] = useState('')

  const loadRuns = () => api('/api/benchmark/runs', { token }).then(setRuns).catch(() => setRuns([]))
  useEffect(() => { api('/api/search/phrases/all', { token }).then(setPhrases); void loadRuns() }, [token]) // eslint-disable-line react-hooks/exhaustive-deps
  const cats = useMemo(() => [...new Set(phrases.map((p) => p.category))], [phrases])

  const start = async () => {
    setFlash('')
    counters.current = { start: performance.now(), selections: 0, incorrect: 0, corrections: 0 }
    if (board === 'synaphi') {
      const r = await api('/api/search/benchmark-options', { token, body: { question: task.question } })
      setOptions(r.options)
      setMeta(r)
    } else {
      setCat(cats[cats.length - 1] ?? 'general') // start away from the answer, as a fixed board would
    }
    setRunning(true)
  }

  const pick = async (id: string) => {
    counters.current.selections += 1
    if (id !== task.target) { counters.current.incorrect += 1; setFlash('Not the target — try again'); return }
    const c = counters.current
    const run: Run = { board, task: task.id, duration_ms: Math.round(performance.now() - c.start), selections: c.selections, incorrect_selections: c.incorrect, corrections: c.corrections, completed: true, retrieval_ms: board === 'synaphi' ? meta?.retrieval_ms : null }
    setRunning(false)
    setFlash(`Done in ${(run.duration_ms / 1000).toFixed(1)} s`)
    await api('/api/benchmark/runs', { token, body: { ...run, patient_id: DEMO_PATIENT, input_mode: 'touch' } })
    void loadRuns()
  }

  const summary = useMemo(() => {
    const g: Record<string, Run[]> = {}
    runs.forEach((r) => { const k = `${r.board}|${r.task}`; (g[k] ??= []).push(r) })
    return Object.entries(g).map(([k, rs]) => {
      const [b, t] = k.split('|')
      const avg = (f: (r: Run) => number) => rs.reduce((a, r) => a + f(r), 0) / rs.length
      const ret = rs.filter((r) => r.retrieval_ms != null)
      return { board: b, task: t, n: rs.length, time: avg((r) => r.duration_ms), sel: avg((r) => r.selections), wrong: avg((r) => r.incorrect_selections), ret: ret.length ? ret.reduce((a, r) => a + (r.retrieval_ms ?? 0), 0) / ret.length : null }
    }).sort((a, b) => a.task.localeCompare(b.task) || a.board.localeCompare(b.board))
  }, [runs])

  return (
    <div className="mx-auto max-w-7xl space-y-6 p-6">
      <div><h1 className="text-2xl font-bold">Benchmark: static board vs. Synaphi</h1>
        <p className="text-sm text-navy-500">Perform each task yourself. Time, selections and errors are measured in the browser and stored as benchmark events. Only real runs are shown; nothing is simulated.</p></div>
      <Card>
        <div className="flex flex-wrap items-end gap-4">
          <label className="text-sm font-semibold">Task<select className="ml-2 rounded-lg border border-line px-2 py-1" value={task.id} disabled={running} onChange={(e) => setTask(TASKS.find((t) => t.id === e.target.value)!)}>{TASKS.map((t) => <option key={t.id} value={t.id}>{t.question}</option>)}</select></label>
          <fieldset className="flex gap-2 text-sm" disabled={running}><legend className="sr-only">Board</legend>
            {(['static', 'synaphi'] as const).map((b) => <label key={b} className={`cursor-pointer rounded-lg border px-3 py-1.5 ${board === b ? 'border-teal bg-ice' : 'border-line'}`}><input type="radio" className="sr-only" checked={board === b} onChange={() => setBoard(b)} />{b === 'static' ? 'Static board (all phrases by category)' : 'Synaphi (contextual)'}</label>)}
          </fieldset>
          <Button onClick={start} disabled={running || !phrases.length}>Start task</Button>
          {flash && <span role="status" className="text-sm font-semibold text-teal-700">{flash}</span>}
        </div>
        {running && (
          <div className="mt-5">
            <p className="mb-3 text-lg"><span className="font-semibold">Clinician asks:</span> “{task.question}” — <span className="text-teal-700">{task.instruction}</span></p>
            {board === 'static' ? (
              <>
                <div className="mb-3 flex flex-wrap gap-1.5" role="tablist">{cats.map((c) => (
                  <button key={c} role="tab" aria-selected={cat === c} onClick={() => { counters.current.selections += 1; setCat(c) }} className={`rounded-lg border px-3 py-1.5 text-sm ${cat === c ? 'border-teal bg-ice font-semibold' : 'border-line'}`}>{c.replace('_', ' ')}</button>
                ))}</div>
                <div className="grid grid-cols-3 gap-2 md:grid-cols-5">{phrases.filter((p) => p.category === cat).map((p) => (
                  <button key={p.id} onClick={() => pick(p.id)} className="rounded-xl border border-line p-2 text-sm hover:border-teal">{p.text}</button>
                ))}</div>
              </>
            ) : (
              <>
                <p className="mb-2 text-xs text-navy-500">Interpretation: {meta?.engine} ({meta?.classify_ms} ms) · retrieval: {meta?.search_engine} ({meta?.retrieval_ms} ms)</p>
                <div className="grid grid-cols-2 gap-3 md:grid-cols-4">{options.map((o) => (
                  <button key={o.id} onClick={() => pick(o.id)} className="flex flex-col items-center gap-2 rounded-2xl border-2 border-line p-4 text-base font-semibold hover:border-teal"><Pictogram id={o.pictogram_id} className="size-8" />{o.text}</button>
                ))}</div>
              </>
            )}
          </div>
        )}
      </Card>
      <Card title="Recorded results">
        {summary.length === 0 ? <Empty>No runs recorded yet.</Empty> : (
          <table className="w-full text-sm"><thead><tr className="text-left text-navy-500"><th className="py-1">Task</th><th>Board</th><th>Runs</th><th>Avg. time</th><th>Avg. selections</th><th>Avg. incorrect</th><th>Avg. retrieval</th></tr></thead>
            <tbody>{summary.map((s) => (
              <tr key={s.board + s.task} className="border-t border-line"><td className="py-1">{TASKS.find((t) => t.id === s.task)?.question ?? s.task}</td><td><Badge tone={s.board === 'synaphi' ? 'teal' : 'neutral'}>{s.board}</Badge></td><td>{s.n}</td><td>{(s.time / 1000).toFixed(1)} s</td><td>{s.sel.toFixed(1)}</td><td>{s.wrong.toFixed(1)}</td><td>{s.ret != null ? `${s.ret.toFixed(0)} ms` : '—'}</td></tr>
            ))}</tbody></table>
        )}
        <p className="mt-2 text-xs text-navy-500">Note: Synaphi time includes interpretation and retrieval latency; the static board does not need either.</p>
      </Card>
    </div>
  )
}
