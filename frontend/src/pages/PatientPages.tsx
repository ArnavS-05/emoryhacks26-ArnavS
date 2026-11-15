import { useEffect, useRef, useState } from 'react'
import { Navigate, useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api'
import { useAuth } from '../store/auth'
import { PatientPanel } from '../features/patient/PatientPanel'
import { Button, ErrorNote, Logo } from '../components/ui'

export function JoinPage() {
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const setPatient = useAuth((s) => s.setPatient)
  const nav = useNavigate()
  const join = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api('/api/auth/patient', { body: { join_code: code.trim().toUpperCase() } })
      setPatient({ token: r.token, sessionId: r.session.id, patientName: r.patient.name })
      nav(`/patient/${r.session.id}`)
    } catch (err) {
      setError((err as Error).message)
    } finally { setBusy(false) }
  }
  return (
    <main className="flex min-h-full items-center justify-center bg-ice p-6 font-patient">
      <form onSubmit={join} className="w-full max-w-md rounded-3xl bg-white p-8 shadow-sm">
        <Logo />
        <h1 className="mt-6 text-3xl font-bold">Join your care session</h1>
        <p className="mt-2 text-lg text-navy-500">Enter the 6-character code shown on your clinician’s screen.</p>
        <label htmlFor="code" className="mt-6 block text-lg font-semibold">Session code</label>
        <input id="code" value={code} onChange={(e) => setCode(e.target.value)} autoFocus autoComplete="off" maxLength={8}
          className="mt-2 w-full rounded-2xl border-2 border-line px-4 py-4 text-center font-mono text-3xl uppercase tracking-[0.4em]" />
        <div className="mt-4"><ErrorNote error={error} /></div>
        <Button type="submit" loading={busy} className="mt-4 w-full py-4 text-lg" disabled={code.trim().length < 4}>Join</Button>
      </form>
    </main>
  )
}

export function PatientDevicePage() {
  const { sessionId } = useParams()
  const patient = useAuth((s) => s.patient)
  if (!patient || patient.sessionId !== sessionId) return <Navigate to="/join" replace />
  return <div className="h-full"><PatientPanel sessionId={sessionId!} token={patient.token} /></div>
}

/** One-time pairing link landing page (/pair#token). The token is removed from the URL immediately. */
export function PairPage() {
  const setPatient = useAuth((s) => s.setPatient)
  const nav = useNavigate()
  const [error, setError] = useState('')
  const started = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const token = location.hash.slice(1)
    history.replaceState(null, '', '/pair')
    if (!token) { setError('This pairing link is incomplete.'); return }
    api('/api/auth/pair', { body: { token } })
      .then((r) => { setPatient({ token: r.token, sessionId: r.session.id, patientName: r.patient.name }); nav(`/patient/${r.session.id}`, { replace: true }) })
      .catch((e) => setError(e.message))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <main className="flex min-h-full items-center justify-center bg-ice p-6 font-patient">
      <div className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-sm">
        <Logo />
        {error ? (
          <>
            <h1 className="mt-6 text-2xl font-bold">Couldn’t pair this device</h1>
            <div className="mt-4"><ErrorNote error={error} /></div>
            <a href="/join" className="mt-4 inline-block text-lg font-semibold text-teal-700 underline">Enter a session code instead</a>
          </>
        ) : <p className="mt-6 text-xl" role="status">Pairing with your care session…</p>}
      </div>
    </main>
  )
}
