import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api, session } from '../lib/api.js'
import { useT } from '../lib/settings.jsx'

const MODES = [
  { id: 'deaf', en: 'Deaf or hard of hearing', hi: 'बधिर या कम सुनने वाले' },
  { id: 'blind', en: 'Blind or low vision', hi: 'दृष्टिहीन या कम दिखने वाले' },
  { id: 'speech', en: 'Cannot speak', hi: 'बोल नहीं सकते' },
  { id: 'general', en: 'No disability', hi: 'कोई अक्षमता नहीं' },
]

function SignIn({ onDone }) {
  const t = useT()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ name: '', email: '', password: '', specialty: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e, demo = false) => {
    e?.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = demo
        ? { email: 'demo@arogya.in', password: 'arogya123' }
        : mode === 'login' ? { email: form.email, password: form.password } : form
      const res = await api(`/api/auth/${mode === 'register' && !demo ? 'register' : 'login'}`, { method: 'POST', body })
      session.save(res)
      onDone(res.doctor)
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <div className="auth panel">
      <h1 style={{ fontSize: 'var(--step-3)' }}>{mode === 'login' ? t('Doctor sign in', 'डॉक्टर साइन इन') : t('Create a doctor account', 'डॉक्टर खाता बनाएँ')}</h1>
      <form onSubmit={submit}>
        {mode === 'register' && (
          <>
            <label className="field"><span>{t('Full name', 'पूरा नाम')}</span><input className="input" required minLength={2} value={form.name} onChange={set('name')} autoComplete="name" /></label>
            <label className="field"><span>{t('Speciality', 'विशेषज्ञता')}</span><input className="input" value={form.specialty} onChange={set('specialty')} placeholder={t('e.g. General Medicine', 'जैसे: जनरल मेडिसिन')} /></label>
          </>
        )}
        <label className="field"><span>{t('Email', 'ईमेल')}</span><input className="input" type="email" required value={form.email} onChange={set('email')} autoComplete="email" /></label>
        <label className="field"><span>{t('Password', 'पासवर्ड')}</span><input className="input" type="password" required minLength={6} value={form.password} onChange={set('password')} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>
        {error && <p className="error" role="alert">{error}</p>}
        <button className="btn btn--neel btn--block" type="submit" disabled={busy}>
          {mode === 'login' ? t('Sign in', 'साइन इन') : t('Create account', 'खाता बनाएँ')}
        </button>
      </form>
      <div className="stack mt">
        <button className="btn btn--primary btn--block" type="button" onClick={(e) => submit(e, true)} disabled={busy}>
          {t('Try the demo doctor account', 'डेमो डॉक्टर खाते से आज़माएँ')}
        </button>
        <button className="btn btn--quiet" type="button" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
          {mode === 'login' ? t('New here? Create an account', 'नए हैं? खाता बनाएँ') : t('Already have an account? Sign in', 'खाता है? साइन इन करें')}
        </button>
      </div>
    </div>
  )
}

function Dashboard({ doctor, onSignOut }) {
  const t = useT()
  const navigate = useNavigate()
  const [form, setForm] = useState({ patient_name: '', patient_mode: 'deaf', patient_lang: 'hi', doctor_lang: 'en' })
  const [recent, setRecent] = useState([])
  const [rx, setRx] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    api('/api/consultations', { auth: true }).then(setRecent).catch(() => {})
    api('/api/prescriptions', { auth: true }).then(setRx).catch(() => {})
  }, [])

  const start = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const c = await api('/api/consultations', { method: 'POST', auth: true, body: form })
      navigate(`/clinic/room/${c.code}`)
    } catch (err) {
      setError(err.message)
      if (err.status === 401) onSignOut()
    }
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t(`Namaste, ${doctor.name}`, `नमस्ते, ${doctor.name}`)}</h1>
          <p>{doctor.specialty || t('Doctor', 'डॉक्टर')}</p>
        </div>
        <button className="btn btn--line" type="button" onClick={onSignOut}>{t('Sign out', 'साइन आउट')}</button>
      </div>

      <div className="split">
        <form className="panel" onSubmit={start}>
          <h2>{t('Start a consultation', 'परामर्श शुरू करें')}</h2>
          <label className="field">
            <span>{t('Patient name', 'मरीज़ का नाम')}</span>
            <input className="input" required value={form.patient_name} onChange={(e) => setForm({ ...form, patient_name: e.target.value })} />
          </label>
          <fieldset className="field" style={{ border: 0, padding: 0 }}>
            <legend style={{ fontWeight: 600, marginBottom: 6 }}>{t('How does the patient communicate?', 'मरीज़ कैसे बात करते हैं?')}</legend>
            <div className="segmented">
              {MODES.map((m) => (
                <button key={m.id} type="button" aria-pressed={form.patient_mode === m.id} onClick={() => setForm({ ...form, patient_mode: m.id })}>
                  {t(m.en, m.hi)}
                </button>
              ))}
            </div>
          </fieldset>
          <div className="row">
            <label className="field" style={{ flex: 1 }}>
              <span>{t('Patient’s language', 'मरीज़ की भाषा')}</span>
              <select className="select" value={form.patient_lang} onChange={(e) => setForm({ ...form, patient_lang: e.target.value })}>
                <option value="hi">हिंदी</option>
                <option value="en">English</option>
              </select>
            </label>
            <label className="field" style={{ flex: 1 }}>
              <span>{t('Your language', 'आपकी भाषा')}</span>
              <select className="select" value={form.doctor_lang} onChange={(e) => setForm({ ...form, doctor_lang: e.target.value })}>
                <option value="en">English</option>
                <option value="hi">हिंदी</option>
              </select>
            </label>
          </div>
          {error && <p className="error" role="alert">{error}</p>}
          <button className="btn btn--primary btn--big btn--block" type="submit">{t('Start consultation', 'परामर्श शुरू करें')}</button>
        </form>

        <div>
          <div className="panel">
            <h2>{t('Recent consultations', 'हाल के परामर्श')}</h2>
            {recent.length === 0 && <p className="muted">{t('Consultations you start will be listed here.', 'आपके शुरू किए परामर्श यहाँ दिखेंगे।')}</p>}
            <ul className="list">
              {recent.slice(0, 8).map((c) => (
                <li key={c.code}>
                  {c.status === 'active' ? (
                    <Link to={`/clinic/room/${c.code}`}>
                      <span><strong>{c.patient_name}</strong> <span className="muted">{c.code}</span></span>
                      <span className="tag">{t('Open', 'खोलें')}</span>
                    </Link>
                  ) : (
                    <div>
                      <span><strong>{c.patient_name}</strong> <span className="muted">{c.message_count} {t('messages', 'संदेश')}</span></span>
                      <span className="tag">{t('Ended', 'समाप्त')}</span>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          </div>
          <div className="panel">
            <h2>{t('Prescriptions', 'पर्चे')}</h2>
            {rx.length === 0 && <p className="muted">{t('Prescriptions you write during a consultation appear here.', 'परामर्श में लिखे पर्चे यहाँ दिखेंगे।')}</p>}
            <ul className="list">
              {rx.slice(0, 8).map((r) => (
                <li key={r.token}>
                  <Link to={`/rx/${r.token}`}>
                    <span><strong>{r.patient_name}</strong> <span className="muted">{r.diagnosis}</span></span>
                    <span className="tag">{new Date(r.created_at).toLocaleDateString('en-IN')}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}

export default function Clinic() {
  const [doctor, setDoctor] = useState(session.token ? session.doctor : null)

  useEffect(() => {
    if (!session.token) return
    api('/api/auth/me', { auth: true }).then(setDoctor).catch(() => { session.clear(); setDoctor(null) })
  }, [])

  if (!doctor) return <SignIn onDone={setDoctor} />
  return <Dashboard doctor={doctor} onSignOut={() => { session.clear(); setDoctor(null) }} />
}
