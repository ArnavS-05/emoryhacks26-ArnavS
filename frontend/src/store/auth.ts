import { create } from 'zustand'
import { createJSONStorage, persist } from 'zustand/middleware'

type PatientAuth = { token: string; sessionId: string; patientName: string }

type AuthState = {
  clinician: { token: string; name: string } | null
  patient: PatientAuth | null
  setClinician: (c: AuthState['clinician']) => void
  setPatient: (p: PatientAuth | null) => void
  logout: () => void
}

// sessionStorage: tokens disappear when the tab closes (shared clinical devices).
export const useAuth = create<AuthState>()(persist((set) => ({
  clinician: null,
  patient: null,
  setClinician: (clinician) => set({ clinician }),
  setPatient: (patient) => set({ patient }),
  logout: () => set({ clinician: null }),
}), { name: 'synaphi-auth', storage: createJSONStorage(() => sessionStorage) }))
