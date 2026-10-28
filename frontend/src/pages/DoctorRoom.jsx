import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import AvatarStage from '../avatar/AvatarStage.jsx'
import Message from '../components/Message.jsx'
import MicButton from '../components/MicButton.jsx'
import PrescriptionForm from '../components/PrescriptionForm.jsx'
import { api, session } from '../lib/api.js'
import { pick, useSettings, useT } from '../lib/settings.jsx'
import { speak } from '../lib/speech.js'
import { useRoom } from '../lib/useRoom.js'

const MODE_LABEL = {
  deaf: ['Deaf or hard of hearing', 'बधिर या कम सुनने वाले'],
  blind: ['Blind or low vision', 'दृष्टिहीन या कम दिखने वाले'],
  speech: ['Cannot speak', 'बोल नहीं सकते'],
  general: ['No disability', 'कोई अक्षमता नहीं'],
}
const GROUPS = [
  ['start', 'Start', 'शुरुआत'],
  ['ask', 'Ask', 'पूछें'],
  ['exam', 'Examine', 'जाँच'],
  ['end', 'Finish', 'आख़िर में'],
]

export default function DoctorRoom() {
  const { code } = useParams()
  const t = useT()
  const navigate = useNavigate()
  const { settings, update } = useSettings()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const [phrases, setPhrases] = useState([])
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [tab, setTab] = useState('phrases')
  const feedRef = useRef(null)
  const { messages, presence, status, send, onMessage, lastError } = useRoom(code, 'doctor')

  const dLang = info?.doctor_lang || 'en'
  const pLang = info?.patient_lang || 'hi'

  useEffect(() => {
    if (!session.token) { navigate('/clinic'); return }
    api(`/api/consultations/${code}`).then(setInfo).catch((e) => setError(e.message))
    api('/api/phrases').then((p) => setPhrases(p.doctor)).catch(() => {})
  }, [code, navigate])

  // Read patient messages aloud to the doctor
  useEffect(() => onMessage((m) => {
    if (m.sender === 'patient' && settings.autoSpeak) speak(pick(m.text, dLang), dLang, { rate: settings.speechRate })
  }), [onMessage, settings.autoSpeak, settings.speechRate, dLang])

  useEffect(() => {
    feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length])

  const lastDoctor = useMemo(() => [...messages].reverse().find((m) => m.sender === 'doctor'), [messages])

  const sendText = (value = text) => {
    const v = value.trim()
    if (!v) return
    if (send({ kind: 'say', text: v, lang: dLang })) setText('')
  }

  const end = async () => {
    if (!confirm(t('End this consultation? The patient will be disconnected.', 'परामर्श समाप्त करें? मरीज़ का कनेक्शन बंद हो जाएगा।'))) return
    await api(`/api/consultations/${code}/close`, { method: 'POST', auth: true }).catch(() => {})
    navigate('/clinic')
  }

  if (error) return <div className="center"><p className="error">{error}</p><Link to="/clinic" className="btn btn--primary">{t('Back to clinic', 'क्लिनिक पर लौटें')}</Link></div>
  if (!info) return <div className="center"><span className="spinner" /></div>
  if (status === 'denied') return <div className="center"><p className="error">{t('Only the doctor who started this consultation can open it.', 'केवल वही डॉक्टर इसे खोल सकते हैं जिन्होंने यह परामर्श शुरू किया।')}</p></div>

  const mode = MODE_LABEL[info.patient_mode]

  return (
    <>
      <div className="room-bar">
        <div>
          <h1>{info.patient_name}</h1>
          <span className="muted">{t(mode[0], mode[1])}, {pLang === 'hi' ? 'हिंदी' : 'English'}</span>
        </div>
        <div className="row">
          <span className="muted">{t('Patient joins with', 'मरीज़ इस कोड से जुड़ें')}</span>
          <span className="room-code" aria-label={code.split('').join(' ')}>{code}</span>
        </div>
        <span className="presence" aria-live="polite">
          <span className={`presence__dot ${presence.patient ? 'is-on' : ''}`} />
          {presence.patient ? t('Patient connected', 'मरीज़ जुड़े हैं') : t('Waiting for patient', 'मरीज़ का इंतज़ार')}
        </span>
        <button className="btn btn--line" type="button" onClick={end}>{t('End consultation', 'परामर्श समाप्त करें')}</button>
      </div>

      {status === 'ended' && <p className="note">{t('This consultation has ended.', 'यह परामर्श समाप्त हो गया है।')}</p>}

      <div className="room">
        <section className="panel" aria-label={t('Conversation', 'बातचीत')}>
          <div className="feed" ref={feedRef} aria-live="polite">
            {messages.length === 0 && (
              <p className="muted">{t('Say hello with the microphone or a quick phrase. The patient sees it as text and sign language.', 'माइक या तैयार वाक्य से नमस्ते कहें। मरीज़ को यह लिखा हुआ और सांकेतिक भाषा में दिखेगा।')}</p>
            )}
            {messages.map((m) => (
              <Message key={m.id} msg={m} viewer="doctor" lang={dLang} onSpeak={(txt, l) => speak(txt, l, { rate: settings.speechRate })} />
            ))}
          </div>

          <form className="composer mt" onSubmit={(e) => { e.preventDefault(); sendText() }}>
            <MicButton lang={dLang} onInterim={setInterim} onText={(said) => { setInterim(''); sendText(said) }} />
            <label className="sr-only" htmlFor="doc-text">{t('Message', 'संदेश')}</label>
            <textarea
              id="doc-text"
              className="textarea"
              lang={dLang}
              value={interim || text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() } }}
              placeholder={t('Type or press the microphone and speak', 'लिखें या माइक दबाकर बोलें')}
            />
            <button className="btn btn--neel" type="submit" disabled={!text.trim()}>{t('Send', 'भेजें')}</button>
          </form>
          {(lastError || status === 'closed') && <p className="error">{lastError || t('Connection lost. Reconnecting…', 'कनेक्शन टूटा। फिर से जुड़ रहे हैं…')}</p>}
          <label className="row mt">
            <input type="checkbox" checked={settings.autoSpeak} onChange={(e) => update({ autoSpeak: e.target.checked })} />
            {t('Read patient messages aloud', 'मरीज़ के संदेश पढ़कर सुनाएँ')}
          </label>
        </section>

        <section>
          <div className="tabs" role="tablist">
            {[['phrases', 'Quick phrases', 'तैयार वाक्य'], ['rx', 'Prescription', 'पर्चा'], ['view', 'Patient’s screen', 'मरीज़ की स्क्रीन']].map(([id, en, hi]) => (
              <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}>{t(en, hi)}</button>
            ))}
          </div>

          {tab === 'phrases' && (
            <div className="quick">
              {GROUPS.map(([g, en, hi]) => (
                <div className="quick__group" key={g}>
                  <h3>{t(en, hi)}</h3>
                  <div className="quick__list">
                    {phrases.filter((p) => p.group === g).map((p) => (
                      <button key={p.id} type="button" className="chip-btn" onClick={() => send({ kind: 'phrase', id: p.id })} title={p[pLang]}>
                        {p[dLang]}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'rx' && (
            <div className="panel">
              <PrescriptionForm code={code} patientName={info.patient_name} patientLang={pLang} />
            </div>
          )}

          {tab === 'view' && (
            <div className="panel">
              {info.patient_mode === 'blind' ? (
                <p>{t('The patient’s phone reads every message aloud in their language.', 'मरीज़ का फ़ोन हर संदेश उनकी भाषा में पढ़कर सुनाता है।')}</p>
              ) : (
                <AvatarStage size="md" tokens={lastDoctor?.gloss || []} question={lastDoctor?.is_question} />
              )}
              {lastDoctor && <p className="now__text mt" lang={pLang}>{pick(lastDoctor.text, pLang)}</p>}
            </div>
          )}
        </section>
      </div>
    </>
  )
}
