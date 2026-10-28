import { useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../lib/api.js'
import { useT } from '../lib/settings.jsx'

const EMPTY = { medicine: '', dose: '', morning: 1, afternoon: 0, night: 1, food: 'after', days: 3, instructions: '' }
const STEPS = [0, 0.5, 1, 2, 3]

function Stepper({ label, value, onChange }) {
  const i = STEPS.indexOf(value)
  return (
    <div className="stepper">
      <span>{label}</span>
      <div>
        <button type="button" aria-label={`${label} −`} onClick={() => onChange(STEPS[Math.max(0, i - 1)])}>−</button>
        <output aria-live="polite">{value === 0.5 ? '½' : value}</output>
        <button type="button" aria-label={`${label} +`} onClick={() => onChange(STEPS[Math.min(STEPS.length - 1, i + 1)])}>+</button>
      </div>
    </div>
  )
}

/** Structured prescription: every field becomes accurate Hindi/English speech without translation. */
export default function PrescriptionForm({ code, patientName, patientLang }) {
  const t = useT()
  const [items, setItems] = useState([{ ...EMPTY }])
  const [diagnosis, setDiagnosis] = useState('')
  const [notes, setNotes] = useState('')
  const [saved, setSaved] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  const setItem = (idx, patch) => setItems((list) => list.map((it, i) => (i === idx ? { ...it, ...patch } : it)))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const body = {
        patient_name: patientName,
        diagnosis,
        notes,
        lang: patientLang,
        consultation_code: code,
        items: items.filter((it) => it.medicine.trim()).map((it) => ({ ...it, days: Number(it.days) || 1 })),
      }
      if (!body.items.length) throw new Error(t('Add at least one medicine.', 'कम से कम एक दवा जोड़ें।'))
      const rx = await api('/api/prescriptions', { method: 'POST', auth: true, body })
      setSaved(rx)
      setItems([{ ...EMPTY }])
    } catch (err) {
      setError(err.message)
    }
    setBusy(false)
  }

  return (
    <form onSubmit={submit} className="stack">
      <label className="field" style={{ marginBottom: 0 }}>
        <span>{t('Diagnosis', 'निदान')}</span>
        <input className="input" value={diagnosis} onChange={(e) => setDiagnosis(e.target.value)} placeholder={t('e.g. Viral fever', 'जैसे: वायरल बुखार')} />
      </label>

      <div className="rx-items">
        {items.map((it, idx) => (
          <fieldset key={idx} className="rx-item" style={{ border: 0, margin: 0 }}>
            <legend className="sr-only">{t(`Medicine ${idx + 1}`, `दवा ${idx + 1}`)}</legend>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>{t('Medicine', 'दवा')}</span>
              <input className="input" required={idx === 0} value={it.medicine} onChange={(e) => setItem(idx, { medicine: e.target.value })} placeholder="Paracetamol" />
            </label>
            <label className="field" style={{ marginBottom: 0 }}>
              <span>{t('Strength', 'मात्रा')}</span>
              <input className="input" value={it.dose} onChange={(e) => setItem(idx, { dose: e.target.value })} placeholder="500 mg" />
            </label>
            <div className="rx-item__row">
              <Stepper label={t('Morning', 'सुबह')} value={it.morning} onChange={(v) => setItem(idx, { morning: v })} />
              <Stepper label={t('Afternoon', 'दोपहर')} value={it.afternoon} onChange={(v) => setItem(idx, { afternoon: v })} />
              <Stepper label={t('Night', 'रात')} value={it.night} onChange={(v) => setItem(idx, { night: v })} />
              <label className="field" style={{ marginBottom: 0, flex: 1, minWidth: 140 }}>
                <span>{t('Food', 'खाना')}</span>
                <select className="select" value={it.food} onChange={(e) => setItem(idx, { food: e.target.value })}>
                  <option value="after">{t('After food', 'खाने के बाद')}</option>
                  <option value="before">{t('Before food', 'खाने से पहले')}</option>
                  <option value="any">{t('Any time', 'कभी भी')}</option>
                </select>
              </label>
              <label className="field" style={{ marginBottom: 0, width: 96 }}>
                <span>{t('Days', 'दिन')}</span>
                <input className="input" type="number" min={1} max={365} value={it.days} onChange={(e) => setItem(idx, { days: e.target.value })} />
              </label>
              {items.length > 1 && (
                <button type="button" className="btn btn--quiet" onClick={() => setItems(items.filter((_, i) => i !== idx))}>{t('Remove', 'हटाएँ')}</button>
              )}
            </div>
          </fieldset>
        ))}
      </div>
      <button type="button" className="btn btn--line" onClick={() => setItems([...items, { ...EMPTY }])}>{t('Add another medicine', 'एक और दवा जोड़ें')}</button>

      <label className="field" style={{ marginBottom: 0 }}>
        <span>{t('Advice (optional)', 'सलाह (वैकल्पिक)')}</span>
        <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={t('e.g. Drink plenty of water', 'जैसे: खूब पानी पिएँ')} />
      </label>

      {error && <p className="error" role="alert">{error}</p>}
      <button type="submit" className="btn btn--primary btn--big" disabled={busy}>{t('Send prescription to patient', 'पर्चा मरीज़ को भेजें')}</button>

      {saved && (
        <p className="note" role="status">
          {t('Sent. The patient can open, read and listen to it.', 'भेज दिया। मरीज़ इसे खोलकर पढ़ और सुन सकते हैं।')}{' '}
          <Link to={`/rx/${saved.token}`}>{t('View prescription', 'पर्चा देखें')}</Link>
        </p>
      )}
    </form>
  )
}
