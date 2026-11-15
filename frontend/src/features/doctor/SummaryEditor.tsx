import { useState } from 'react'
import { ClipboardList, ShieldCheck } from 'lucide-react'
import { api } from '../../lib/api'
import { Badge, Button, EngineBadge, ErrorNote, inputCls } from '../../components/ui'

const LIST_FIELDS = [
  ['patient_confirmed_statements', 'Patient-confirmed statements'],
  ['reviewed_medication_context', 'Reviewed medication context'],
  ['relevant_history_references', 'Relevant medical-history references'],
  ['unresolved_questions', 'Unresolved questions'],
  ['accessibility_methods_used', 'Accessibility methods used'],
] as const
const TEXT_FIELDS = [
  ['reason_for_visit', 'Reason for visit'],
  ['clinician_observations', 'Clinician observations'],
  ['follow_up_documentation', 'Follow-up documentation'],
] as const

export function SummaryEditor({ sessionId, token, initial }: { sessionId: string; token: string; initial: any }) {
  const [note, setNote] = useState<any>(initial)
  const [content, setContent] = useState<any>(initial?.content ?? null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState('')

  const draft = async () => {
    setBusy(true)
    setError('')
    try {
      const n = await api(`/api/sessions/${sessionId}/summary`, { method: 'POST', token })
      setNote(n)
      setContent(n.content)
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }
  const save = async (approve: boolean) => {
    if (approve && !window.confirm('Approve this encounter note? It will be stored as clinician-reviewed context for future visits.')) return
    setBusy(true)
    try {
      const n = await api(`/api/sessions/${sessionId}/summary/${note.id}`, { method: 'PUT', body: { content, approve }, token })
      setNote(n)
      setSaved(approve ? 'Approved and indexed for future retrieval.' : 'Draft saved.')
    } catch (e) { setError((e as Error).message) } finally { setBusy(false) }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-line bg-soft p-3 text-xs"><strong>AI-assisted clinical encounter draft</strong> — not a prescription or final record. Edit freely; only clinician approval makes it part of the record.</div>
      <Button onClick={draft} loading={busy && !note} variant="secondary" className="w-full"><ClipboardList className="size-4" />{note ? 'Regenerate draft' : 'Draft encounter note'}</Button>
      <ErrorNote error={error} />
      {note && content && (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(false) }}>
          <div className="flex items-center gap-2"><EngineBadge engine={note.engine} /><Badge tone={note.status === 'approved' ? 'teal' : 'amber'}>{note.status}</Badge></div>
          {TEXT_FIELDS.map(([k, label]) => (
            <label key={k} className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>
              <textarea rows={2} className={inputCls} value={content[k] ?? ''} onChange={(e) => setContent({ ...content, [k]: e.target.value })} /></label>
          ))}
          {LIST_FIELDS.map(([k, label]) => (
            <label key={k} className="block text-sm"><span className="mb-1 block font-semibold">{label}</span>
              <textarea rows={Math.max(2, (content[k]?.length ?? 0) + 1)} className={inputCls} value={(content[k] ?? []).join('\n')}
                onChange={(e) => setContent({ ...content, [k]: e.target.value.split('\n') })} />
              <span className="text-xs text-navy-500">One item per line</span></label>
          ))}
          <div className="flex gap-2">
            <Button type="submit" variant="secondary" loading={busy}>Save draft</Button>
            <Button type="button" onClick={() => save(true)} disabled={busy || note.status === 'approved'}><ShieldCheck className="size-4" />Approve</Button>
          </div>
          {saved && <p role="status" className="text-sm text-teal-700">{saved}</p>}
        </form>
      )}
    </div>
  )
}
