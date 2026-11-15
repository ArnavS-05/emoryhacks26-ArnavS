import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../../lib/api'
import { LANGS } from '../../lib/i18n'
import { useAuth } from '../../store/auth'
import { Button, Card, ErrorNote, Field, inputCls } from '../../components/ui'

const ABILITIES = ['Nonverbal', 'Limited speech', 'Aphasia', 'Reliable deliberate blinks', 'Head movement', 'Hand/arm movement', 'Single-switch access', 'Hearing impairment', 'Low vision', 'Needs simplified language']
const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean)

export function NewPatient() {
  const token = useAuth((s) => s.clinician!.token)
  const nav = useNavigate()
  const [f, setF] = useState({ name: '', age: '', preferred_language: 'en', input_mode: 'touch', abilities: [] as string[], accessibility_notes: '', history: '', meds: '', allergies: '', conditions: '', cg_name: '', cg_rel: '', cg_phone: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF({ ...f, [k]: e.target.value })

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const p = await api('/api/patients', { token, body: {
        name: f.name, age: f.age ? Number(f.age) : null, preferred_language: f.preferred_language, input_mode: f.input_mode,
        communication_abilities: f.abilities, accessibility_notes: f.accessibility_notes, medical_history: lines(f.history),
        medications: lines(f.meds), allergies: lines(f.allergies), conditions: lines(f.conditions),
        caregiver: f.cg_name ? { name: f.cg_name, relationship: f.cg_rel, phone: f.cg_phone } : {},
      } })
      nav(`/clinician/patients/${p.id}`)
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }

  return (
    <form onSubmit={submit} className="mx-auto max-w-4xl space-y-6 p-6">
      <div><h1 className="text-2xl font-bold">New patient</h1><p className="text-sm text-navy-500">Use synthetic, fictional details only. Values you enter here are recorded as clinician-verified.</p></div>
      <Card title="Identity & language">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Patient name"><input className={inputCls} required value={f.name} onChange={set('name')} /></Field>
          <Field label="Age"><input className={inputCls} type="number" min={0} max={130} value={f.age} onChange={set('age')} /></Field>
          <Field label="Preferred language"><select className={inputCls} value={f.preferred_language} onChange={set('preferred_language')}>{LANGS.map((l) => <option key={l.code} value={l.code}>{l.name}</option>)}</select></Field>
        </div>
      </Card>
      <Card title="Communication abilities & accessibility">
        <fieldset><legend className="mb-2 text-sm font-semibold">Abilities</legend>
          <div className="flex flex-wrap gap-2">{ABILITIES.map((a) => {
            const on = f.abilities.includes(a)
            return <label key={a} className={`cursor-pointer rounded-full border px-3 py-1.5 text-sm ${on ? 'border-teal bg-ice text-teal-700' : 'border-line'}`}>
              <input type="checkbox" className="sr-only" checked={on} onChange={() => setF({ ...f, abilities: on ? f.abilities.filter((x) => x !== a) : [...f.abilities, a] })} />{a}</label>
          })}</div>
        </fieldset>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Field label="Starting input method" hint="Can be changed and calibrated by the patient or caregiver at any time."><select className={inputCls} value={f.input_mode} onChange={set('input_mode')}>
            <option value="touch">Touch</option><option value="keyboard">Keyboard</option><option value="scan">Switch scanning</option><option value="blink">Blink (camera)</option><option value="head">Head gestures (camera)</option><option value="voice">Residual speech</option>
          </select></Field>
          <Field label="Accessibility notes"><textarea className={inputCls} rows={2} value={f.accessibility_notes} onChange={set('accessibility_notes')} /></Field>
        </div>
      </Card>
      <Card title="Medical context (one item per line)">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Current medications"><textarea className={inputCls} rows={3} value={f.meds} onChange={set('meds')} placeholder="e.g. Lisinopril 10 mg daily" /></Field>
          <Field label="Allergies"><textarea className={inputCls} rows={3} value={f.allergies} onChange={set('allergies')} /></Field>
          <Field label="Existing conditions"><textarea className={inputCls} rows={3} value={f.conditions} onChange={set('conditions')} /></Field>
          <Field label="Medical history"><textarea className={inputCls} rows={3} value={f.history} onChange={set('history')} /></Field>
        </div>
      </Card>
      <Card title="Caregiver (optional)">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Name"><input className={inputCls} value={f.cg_name} onChange={set('cg_name')} /></Field>
          <Field label="Relationship"><input className={inputCls} value={f.cg_rel} onChange={set('cg_rel')} /></Field>
          <Field label="Phone (fictional)"><input className={inputCls} value={f.cg_phone} onChange={set('cg_phone')} /></Field>
        </div>
      </Card>
      <ErrorNote error={error} />
      <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={() => nav(-1)}>Cancel</Button><Button type="submit" loading={busy}>Create patient</Button></div>
    </form>
  )
}
