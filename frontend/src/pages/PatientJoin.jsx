import { useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useT } from '../lib/settings.jsx'

export default function PatientJoin() {
  const t = useT()
  const params = useParams()
  const navigate = useNavigate()
  const [code, setCode] = useState((params.code || '').toUpperCase())
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const inputRef = useRef(null)

  const join = async (value = code) => {
    const c = value.trim().toUpperCase()
    if (c.length !== 6) { setError(t('The code has 6 letters and numbers.', 'कोड में 6 अक्षर और अंक होते हैं।')); return }
    setBusy(true)
    setError('')
    try {
      const info = await api(`/api/consultations/${c}`)
      if (info.status !== 'active') throw new Error(t('This consultation has already ended.', 'यह परामर्श पहले ही समाप्त हो चुका है।'))
      navigate(`/patient/${c}`)
    } catch (e) {
      setError(e.status === 404 ? t('No consultation with this code. Check the doctor’s screen.', 'इस कोड से कोई परामर्श नहीं मिला। डॉक्टर की स्क्रीन देखें।') : e.message)
    }
    setBusy(false)
  }

  useEffect(() => {
    if (params.code?.length === 6) join(params.code)
    else inputRef.current?.focus()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className="auth panel">
      <h1 style={{ fontSize: 'var(--step-3)' }}>{t('Join your doctor', 'अपने डॉक्टर से जुड़ें')}</h1>
      <p className="muted">{t('Type the 6-character code shown on the doctor’s screen.', 'डॉक्टर की स्क्रीन पर दिखा 6 अक्षरों का कोड लिखें।')}</p>
      <form onSubmit={(e) => { e.preventDefault(); join() }}>
        <label className="sr-only" htmlFor="code">{t('Code', 'कोड')}</label>
        <input
          id="code"
          ref={inputRef}
          className="input"
          style={{ fontSize: 'var(--step-3)', letterSpacing: '0.3em', textAlign: 'center', fontWeight: 800, textTransform: 'uppercase' }}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/[^a-z0-9]/gi, '').slice(0, 6).toUpperCase())}
          autoComplete="off"
          aria-describedby={error ? 'code-error' : undefined}
        />
        {error && <p id="code-error" className="error" role="alert">{error}</p>}
        <button className="btn btn--primary btn--big btn--block mt" type="submit" disabled={busy}>
          {busy ? <span className="spinner" /> : t('Join', 'जुड़ें')}
        </button>
      </form>
    </div>
  )
}
