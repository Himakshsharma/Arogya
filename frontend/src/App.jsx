import { lazy, Suspense, useEffect } from 'react'
import { Link, Route, Routes, useLocation } from 'react-router-dom'
import Layout from './components/Layout.jsx'
import { useT } from './lib/settings.jsx'
import Home from './pages/Home.jsx'

const SignToText = lazy(() => import('./pages/SignToText.jsx'))
const SpeakToSign = lazy(() => import('./pages/SpeakToSign.jsx'))
const Teach = lazy(() => import('./pages/Teach.jsx'))
const Clinic = lazy(() => import('./pages/Clinic.jsx'))
const DoctorRoom = lazy(() => import('./pages/DoctorRoom.jsx'))
const PatientJoin = lazy(() => import('./pages/PatientJoin.jsx'))
const PatientRoom = lazy(() => import('./pages/PatientRoom.jsx'))
const Prescription = lazy(() => import('./pages/Prescription.jsx'))
const Settings = lazy(() => import('./pages/Settings.jsx'))

function NotFound() {
  const t = useT()
  return (
    <div className="center">
      <h1>{t('This page does not exist', 'यह पेज मौजूद नहीं है')}</h1>
      <Link className="btn btn--primary" to="/">{t('Go to home', 'होम पर जाएँ')}</Link>
    </div>
  )
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
  return null
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Suspense fallback={<div className="center"><span className="spinner" /></div>}>
        <Routes>
          <Route element={<Layout />}>
            <Route index element={<Home />} />
            <Route path="sign" element={<SignToText />} />
            <Route path="speak" element={<SpeakToSign />} />
            <Route path="teach" element={<Teach />} />
            <Route path="clinic" element={<Clinic />} />
            <Route path="clinic/room/:code" element={<DoctorRoom />} />
            <Route path="join" element={<PatientJoin />} />
            <Route path="join/:code" element={<PatientJoin />} />
            <Route path="patient/:code" element={<PatientRoom />} />
            <Route path="rx/:token" element={<Prescription />} />
            <Route path="settings" element={<Settings />} />
            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </Suspense>
    </>
  )
}
