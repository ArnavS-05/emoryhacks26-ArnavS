import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ClinicianLayout, LoginPage } from './features/doctor/Layout'
import { Dashboard } from './features/doctor/Dashboard'
import { NewPatient } from './features/doctor/NewPatient'
import { PatientDetail, SessionPage } from './features/doctor/PatientDetail'
import { AnalyticsPage } from './features/analytics/AnalyticsPage'
import { Benchmark } from './features/analytics/Benchmark'
import { SearchInspector } from './features/search/SearchInspector'
import { DemoPage } from './pages/DemoPage'
import { InspectPage } from './pages/InspectPage'
import { JoinPage, PatientDevicePage } from './pages/PatientPages'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Navigate to="/demo" replace />} />
        <Route path="/demo" element={<DemoPage />} />
        <Route path="/inspect" element={<InspectPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/join" element={<JoinPage />} />
        <Route path="/patient/:sessionId" element={<PatientDevicePage />} />
        <Route path="/clinician" element={<ClinicianLayout />}>
          <Route index element={<Dashboard />} />
          <Route path="patients/new" element={<NewPatient />} />
          <Route path="patients/:patientId" element={<PatientDetail />} />
          <Route path="session/:sessionId" element={<SessionPage />} />
          <Route path="analytics" element={<AnalyticsPage />} />
          <Route path="search" element={<SearchInspector />} />
          <Route path="benchmark" element={<Benchmark />} />
        </Route>
        <Route path="*" element={<Navigate to="/demo" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
