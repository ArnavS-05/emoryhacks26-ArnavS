import { useState } from 'react'
import { Maximize2, Minimize2 } from 'lucide-react'
import { PatientPanel } from '../patient/PatientPanel'
import { ClinicianSession } from '../doctor/ClinicianSession'

/** Live session: clinician ~40% / patient ~60%. Either panel can go full-screen. */
export function SplitView({ sessionId, clinicianToken, patientToken }: { sessionId: string; clinicianToken: string; patientToken: string }) {
  const [full, setFull] = useState<null | 'doctor' | 'patient'>(null)
  const btn = (which: 'doctor' | 'patient') => (
    <button type="button" onClick={() => setFull(full === which ? null : which)}
      className="absolute left-1/2 top-2 z-40 inline-flex -translate-x-1/2 items-center gap-1 rounded-lg border border-line bg-white/90 px-2 py-1 text-xs font-semibold text-navy shadow-sm"
      aria-label={full === which ? 'Exit full screen' : `Full screen ${which === 'doctor' ? 'clinician' : 'patient'} panel`}>
      {full === which ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}{full === which ? 'Split' : 'Full'}
    </button>
  )
  return (
    <div className="flex h-full min-h-0 flex-col lg:flex-row">
      <div className={`relative min-h-0 border-line lg:border-r ${full === 'patient' ? 'hidden' : full === 'doctor' ? 'flex-1' : 'h-[50vh] lg:h-auto lg:w-[40%]'}`}>
        {btn('doctor')}
        <ClinicianSession sessionId={sessionId} token={clinicianToken} compact={full !== 'doctor'} />
      </div>
      <div className={`relative min-h-0 ${full === 'doctor' ? 'hidden' : 'flex-1'}`}>
        {btn('patient')}
        <PatientPanel sessionId={sessionId} token={patientToken} embedded={full !== 'patient'} />
      </div>
    </div>
  )
}
