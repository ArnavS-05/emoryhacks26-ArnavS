import { useState } from 'react'
import { NavLink, Navigate, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Activity, FlaskConical, LayoutDashboard, LogOut, Search, ServerCog, UserPlus } from 'lucide-react'
import { api } from '../../lib/api'
import { useAuth } from '../../store/auth'
import { Button, ConnectionIndicators, ErrorNote, Field, Logo, inputCls } from '../../components/ui'

const NAV = [
  { to: '/clinician', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/clinician/patients/new', label: 'New patient', icon: UserPlus },
  { to: '/clinician/analytics', label: 'Accessibility analytics', icon: Activity },
  { to: '/clinician/search', label: 'Search inspector', icon: Search },
  { to: '/clinician/benchmark', label: 'Benchmark', icon: FlaskConical },
  { to: '/inspect', label: 'Tech inspection', icon: ServerCog },
]

export function ClinicianLayout() {
  const clinician = useAuth((s) => s.clinician)
  const logout = useAuth((s) => s.logout)
  const loc = useLocation()
  if (!clinician) return <Navigate to="/login" replace state={{ from: loc.pathname }} />
  return (
    <div className="flex h-full">
      <a href="#main" className="sr-only-focusable absolute left-2 top-2 z-50 rounded bg-amber px-3 py-2 font-semibold">Skip to content</a>
      <nav aria-label="Clinician navigation" className="hidden w-60 shrink-0 flex-col bg-navy p-4 text-white md:flex">
        <Logo light />
        <p className="mt-1 text-xs text-white/60">Clinician workspace</p>
        <ul className="mt-6 space-y-1">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink to={to} end={end} className={({ isActive }) => `flex items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium ${isActive ? 'bg-white/12 text-white' : 'text-white/75 hover:bg-white/8 hover:text-white'}`}>
                <Icon className="size-4" aria-hidden />{label}
              </NavLink>
            </li>
          ))}
        </ul>
        <div className="mt-auto rounded-xl bg-white/8 p-3 text-xs text-white/70">
          Prototype · synthetic data only. Not a certified medical device.
        </div>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-4 border-b border-line bg-white px-6 py-3">
          <div className="md:hidden"><Logo /></div>
          <ConnectionIndicators />
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-navy-500">{clinician.name}</span>
            <Button size="sm" variant="ghost" onClick={logout}><LogOut className="size-4" />Sign out</Button>
          </div>
        </header>
        <main id="main" className="min-h-0 flex-1 overflow-auto"><Outlet /></main>
      </div>
    </div>
  )
}

export function LoginPage() {
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const setClinician = useAuth((s) => s.setClinician)
  const nav = useNavigate()
  const loc = useLocation() as any
  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const r = await api('/api/auth/clinician', { body: { name, access_code: code } })
      setClinician({ token: r.token, name: r.name })
      nav(loc.state?.from ?? '/clinician')
    } catch (err) { setError((err as Error).message) } finally { setBusy(false) }
  }
  return (
    <main className="grid min-h-full lg:grid-cols-2">
      <section className="hidden flex-col justify-between bg-navy p-12 text-white lg:flex">
        <Logo light />
        <div>
          <h1 className="text-4xl font-bold leading-tight">The Intelligent Patient Communication Platform</h1>
          <p className="mt-4 max-w-md text-lg text-white/80">AI helps a patient who can’t speak tell you what they mean. Only messages the patient confirms are spoken, and clinical decisions stay with you.</p>
        </div>
        <p className="text-sm text-white/60">Hackathon prototype · synthetic patients only</p>
      </section>
      <section className="flex items-center justify-center p-8">
        <form onSubmit={submit} className="w-full max-w-sm space-y-4">
          <div className="lg:hidden"><Logo /></div>
          <h2 className="text-2xl font-bold">Clinician sign in</h2>
          <Field label="Your name"><input className={inputCls} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" /></Field>
          <Field label="Access code" hint="Set by CLINICIAN_ACCESS_CODE on the server."><input className={inputCls} type="password" value={code} onChange={(e) => setCode(e.target.value)} required /></Field>
          <ErrorNote error={error} />
          <Button type="submit" loading={busy} className="w-full">Sign in</Button>
          <p className="text-center text-sm text-navy-500">Judges: try <a className="font-semibold text-teal-700 underline" href="/demo">the guided demo</a> · Patients: <a className="font-semibold text-teal-700 underline" href="/join">join a session</a></p>
        </form>
      </section>
    </main>
  )
}
