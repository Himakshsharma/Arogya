import { useCallback, useEffect, useState } from 'react'
import AvatarStage, { forgetRecordedSigns } from '../avatar/AvatarStage.jsx'
import SignInput from '../components/SignInput.jsx'
import { api } from '../lib/api.js'
import { useT } from '../lib/settings.jsx'

export default function Teach() {
  const t = useT()
  const [lexicon, setLexicon] = useState([])
  const [word, setWord] = useState('PAIN')
  const [custom, setCustom] = useState('')
  const [phase, setPhase] = useState('idle') // idle | countdown | recording | review
  const [count, setCount] = useState(3)
  const [frames, setFrames] = useState(null)
  const [mine, setMine] = useState([])
  const [message, setMessage] = useState('')
  const [playKey, setPlayKey] = useState(0)

  const label = (custom.trim() || word).toUpperCase().replace(/[^A-Z0-9-]/g, '')

  const refresh = useCallback(() => api('/api/signs/templates').then(setMine).catch(() => {}), [])
  useEffect(() => {
    api('/api/isl/lexicon').then((l) => setLexicon(l.signs)).catch(() => {})
    refresh()
  }, [refresh])

  useEffect(() => {
    if (phase !== 'countdown') return
    if (count === 0) { setPhase('recording'); return }
    const id = setTimeout(() => setCount((c) => c - 1), 800)
    return () => clearTimeout(id)
  }, [phase, count])

  const startRecording = () => {
    setFrames(null)
    setMessage('')
    setCount(3)
    setPhase('countdown')
  }

  const onRecorded = useCallback((segment) => {
    setFrames(segment)
    setPhase('review')
    setPlayKey((k) => k + 1)
  }, [])

  const save = async () => {
    try {
      await api('/api/signs/templates', { method: 'POST', body: { label, frames } })
      forgetRecordedSigns()
      setMessage(t(`Saved. Arogya now recognises your sign for “${label.toLowerCase()}”.`, `सहेजा गया। आरोग्य अब “${label.toLowerCase()}” का आपका संकेत पहचानता है।`))
      setFrames(null)
      setPhase('idle')
      refresh()
    } catch (e) {
      setMessage(e.message)
    }
  }

  const remove = async (id) => {
    await api(`/api/signs/templates/${id}`, { method: 'DELETE' }).catch(() => {})
    forgetRecordedSigns()
    refresh()
  }

  const previewTokens = [{ gloss: label, kind: 'sign' }]

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Teach a sign', 'संकेत सिखाएँ')}</h1>
          <p>{t('Signing differs from region to region. Record how you sign a word and Arogya will recognise it, and the avatar will sign it your way.',
                'हर क्षेत्र में संकेत अलग होते हैं। किसी शब्द का अपना संकेत रिकॉर्ड करें, आरोग्य उसे पहचानेगा और अवतार उसे आपके तरीके से दिखाएगा।')}</p>
        </div>
      </div>

      <div className="split">
        <div>
          <div className="panel">
            <div className="field">
              <label htmlFor="teach-word">{t('Choose a word', 'शब्द चुनें')}</label>
              <select id="teach-word" className="select" value={word} onChange={(e) => { setWord(e.target.value); setCustom(''); setPlayKey((k) => k + 1) }}>
                {lexicon.map((w) => <option key={w} value={w}>{w.replace('-', ' ').toLowerCase()}</option>)}
              </select>
            </div>
            <div className="field">
              <label htmlFor="teach-custom">{t('Or type a new word', 'या नया शब्द लिखें')}</label>
              <input id="teach-custom" className="input" value={custom} maxLength={24}
                onChange={(e) => setCustom(e.target.value.replace(/[^a-zA-Z0-9-]/g, ''))}
                placeholder={t('e.g. diabetes', 'जैसे: diabetes')} />
              <small>{t('English letters only, it becomes the sign’s name.', 'केवल अंग्रेज़ी अक्षर, यही संकेत का नाम होगा।')}</small>
            </div>
          </div>

          <div className="mt" style={{ position: 'relative' }}>
            <SignInput mode="record" armed={phase === 'recording'} onRecorded={onRecorded} />
            {phase === 'countdown' && <div className="camera__count" aria-live="assertive">{count}</div>}
          </div>

          <div className="row mt">
            {phase !== 'review' && (
              <button type="button" className="btn btn--primary btn--big" onClick={startRecording} disabled={phase !== 'idle' || !label}>
                {phase === 'recording' ? t('Sign now…', 'अब संकेत करें…') : t(`Record “${label.toLowerCase()}”`, `“${label.toLowerCase()}” रिकॉर्ड करें`)}
              </button>
            )}
            {phase === 'recording' && (
              <button type="button" className="btn btn--line" onClick={() => setPhase('idle')}>{t('Cancel', 'रद्द करें')}</button>
            )}
            {phase === 'review' && (
              <>
                <button type="button" className="btn btn--primary btn--big" onClick={save}>{t('Save this sign', 'यह संकेत सहेजें')}</button>
                <button type="button" className="btn btn--line" onClick={startRecording}>{t('Record again', 'फिर से रिकॉर्ड करें')}</button>
              </>
            )}
          </div>
          {phase === 'idle' && (
            <p className="muted mt">{t('Turn on the camera, press record, then sign once and lower your hands. Record 2 or 3 times for best results.',
                                       'कैमरा चालू करें, रिकॉर्ड दबाएँ, फिर एक बार संकेत करें और हाथ नीचे करें। बेहतर नतीजों के लिए 2–3 बार रिकॉर्ड करें।')}</p>
          )}
          {message && <p className="note mt" role="status">{message}</p>}
        </div>

        <div>
          <AvatarStage
            size="md"
            tokens={previewTokens}
            playKey={playKey}
            extraRecorded={phase === 'review' && frames ? { [label]: frames } : null}
            label={phase === 'review' ? t('Your recording', 'आपकी रिकॉर्डिंग') : t('Built-in sign', 'पहले से मौजूद संकेत')}
          />
          <p className="muted" style={{ textAlign: 'center' }}>
            {phase === 'review' ? t('This is your recording, played on the avatar.', 'यह आपकी रिकॉर्डिंग है, अवतार पर।') : t('The built-in sign, for reference.', 'पहले से मौजूद संकेत, संदर्भ के लिए।')}
          </p>

          <div className="panel mt">
            <h2>{t('Signs you taught', 'आपके सिखाए संकेत')}</h2>
            {mine.length === 0 && <p className="muted">{t('None yet. Your recordings will be listed here.', 'अभी कोई नहीं। आपकी रिकॉर्डिंग यहाँ दिखेंगी।')}</p>}
            <ul className="list">
              {mine.map((m) => (
                <li key={m.id}>
                  <div>
                    <strong>{m.label.replace('-', ' ').toLowerCase()}</strong>
                    <span className="row">
                      <span className="muted">{m.frame_count} {t('frames', 'फ़्रेम')}</span>
                      <button type="button" className="btn btn--quiet" onClick={() => remove(m.id)}>{t('Delete', 'हटाएँ')}</button>
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}
