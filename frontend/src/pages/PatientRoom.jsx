import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import AvatarStage from '../avatar/AvatarStage.jsx'
import Message from '../components/Message.jsx'
import MicButton from '../components/MicButton.jsx'
import PainInput from '../components/PainInput.jsx'
import SignInput from '../components/SignInput.jsx'
import SymptomBoard from '../components/SymptomBoard.jsx'
import { IconSpeaker } from '../components/icons.jsx'
import { api } from '../lib/api.js'
import { pick, useSettings, useT } from '../lib/settings.jsx'
import { speak } from '../lib/speech.js'
import { useRoom } from '../lib/useRoom.js'

// Which answer tools each patient sees first
const TABS = {
  deaf: ['symptoms', 'sign', 'pain', 'type'],
  speech: ['symptoms', 'pain', 'type', 'sign'],
  blind: ['voice', 'type'],
  general: ['voice', 'symptoms', 'pain', 'type'],
}
const TAB_LABEL = {
  symptoms: ['Symptoms', 'लक्षण'],
  sign: ['Sign', 'संकेत'],
  pain: ['Pain', 'दर्द'],
  type: ['Type', 'लिखें'],
  voice: ['Speak', 'बोलें'],
}

export default function PatientRoom() {
  const { code } = useParams()
  const { settings } = useSettings()
  const [info, setInfo] = useState(null)
  const [error, setError] = useState('')
  const lang = info?.patient_lang || settings.lang
  const t = useT(lang)
  const { messages, presence, status, send, onMessage, lastError } = useRoom(code, 'patient')
  const [tab, setTab] = useState(null)
  const [draft, setDraft] = useState('')
  const [signed, setSigned] = useState([])
  const [quick, setQuick] = useState([])
  const [sentSymptoms, setSentSymptoms] = useState([])
  const [replay, setReplay] = useState(0)
  const [showHistory, setShowHistory] = useState(false)
  const feedRef = useRef(null)

  useEffect(() => {
    api(`/api/consultations/${code}`)
      .then((c) => { setInfo(c); setTab(TABS[c.patient_mode][0]) })
      .catch((e) => setError(e.message))
    api('/api/phrases').then((p) => setQuick(p.patient)).catch(() => {})
  }, [code])

  const mode = info?.patient_mode || 'general'
  const speakAll = mode === 'blind' || mode === 'general' || settings.autoSpeak

  // speak new doctor messages (the avatar covers deaf patients)
  useEffect(() => onMessage((m) => {
    if (m.sender === 'doctor' && speakAll && mode !== 'deaf') speak(pick(m.text, lang), lang, { rate: settings.speechRate })
  }), [onMessage, speakAll, mode, lang, settings.speechRate])

  const lastDoctor = useMemo(() => [...messages].reverse().find((m) => m.sender === 'doctor'), [messages])

  useEffect(() => {
    if (showHistory) feedRef.current?.scrollTo({ top: feedRef.current.scrollHeight })
  }, [messages.length, showHistory])

  if (error) return <div className="center"><p className="error">{error}</p><Link to="/join" className="btn btn--primary">{t('Try another code', 'दूसरा कोड आज़माएँ')}</Link></div>
  if (!info) return <div className="center"><span className="spinner" /></div>

  const say = (text) => text.trim() && send({ kind: 'say', text: text.trim(), lang }) && setDraft('')
  const sendSigns = () => { if (signed.length && send({ kind: 'sign', glosses: signed })) setSigned([]) }

  return (
    <div lang={lang}>
      <div className="room-bar">
        <div>
          <h1>{t(`Talking with ${info.doctor_name || 'your doctor'}`, `${info.doctor_name || 'डॉक्टर'} से बातचीत`)}</h1>
          <span className="presence">
            <span className={`presence__dot ${presence.doctor ? 'is-on' : ''}`} />
            {presence.doctor ? t('Doctor is here', 'डॉक्टर जुड़े हैं') : t('Waiting for the doctor', 'डॉक्टर का इंतज़ार')}
          </span>
        </div>
        <button type="button" className="btn btn--line" onClick={() => setShowHistory((s) => !s)} aria-expanded={showHistory}>
          {showHistory ? t('Hide conversation', 'बातचीत छुपाएँ') : t('Show full conversation', 'पूरी बातचीत दिखाएँ')}
        </button>
      </div>

      {status === 'ended' && <p className="note" role="status">{t('The doctor has ended this consultation. Your prescription stays available from its link.', 'डॉक्टर ने परामर्श समाप्त कर दिया है। आपका पर्चा उसके लिंक पर उपलब्ध रहेगा।')}</p>}
      {(lastError || status === 'closed') && <p className="error" role="alert">{lastError || t('Connection lost. Reconnecting…', 'कनेक्शन टूटा। फिर से जुड़ रहे हैं…')}</p>}

      <div className="room">
        <section aria-label={t('What the doctor said', 'डॉक्टर ने क्या कहा')}>
          {mode !== 'blind' && (
            <AvatarStage
              size="md"
              tokens={lastDoctor?.gloss || []}
              playKey={`${lastDoctor?.id || 0}-${replay}`}
              question={lastDoctor?.is_question}
              lang={lang}
            />
          )}
          <div className={`now ${mode === 'blind' ? 'now--blind' : ''} mt`} aria-live="assertive">
            <span className="now__label">{t('Doctor says', 'डॉक्टर कह रहे हैं')}</span>
            <p className="now__text">{lastDoctor ? pick(lastDoctor.text, lang) : t('The doctor’s words will appear here.', 'डॉक्टर की बात यहाँ दिखेगी।')}</p>
            {lastDoctor?.kind === 'prescription' && lastDoctor.extra?.token && (
              <Link className="btn btn--primary btn--big" to={`/rx/${lastDoctor.extra.token}`}>{t('Open my prescription', 'मेरा पर्चा खोलें')}</Link>
            )}
            {lastDoctor && (
              <div className="row">
                <button type="button" className="btn btn--line" onClick={() => speak(pick(lastDoctor.text, lang), lang, { rate: settings.speechRate })}>
                  <IconSpeaker width="20" height="20" /> {t('Listen again', 'फिर से सुनें')}
                </button>
                {mode !== 'blind' && (
                  <button type="button" className="btn btn--line" onClick={() => setReplay((n) => n + 1)}>{t('Sign again', 'फिर से संकेत')}</button>
                )}
              </div>
            )}
          </div>

          {showHistory && (
            <div className="panel mt">
              <div className="feed" ref={feedRef}>
                {messages.map((m) => (
                  <Message key={m.id} msg={m} viewer="patient" lang={lang} onSpeak={(txt, l) => speak(txt, l, { rate: settings.speechRate })} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="panel" aria-label={t('Reply to the doctor', 'डॉक्टर को जवाब दें')}>
          <div className="tabs" role="tablist">
            {TABS[mode].map((id) => (
              <button key={id} role="tab" type="button" aria-selected={tab === id} onClick={() => setTab(id)}>
                {t(...TAB_LABEL[id])}
              </button>
            ))}
          </div>

          {tab === 'symptoms' && (
            <SymptomBoard
              lang={lang}
              sentIds={sentSymptoms}
              onPick={(s) => { if (send({ kind: 'symptom', id: s.id })) setSentSymptoms((l) => [...l, s.id]) }}
            />
          )}

          {tab === 'pain' && <PainInput lang={lang} onSend={({ level, region }) => send({ kind: 'pain', level, region })} />}

          {tab === 'sign' && (
            <div className="stack">
              <SignInput lang={lang} onSign={(g) => setSigned((l) => [...l, g].slice(-12))} />
              <div className="sentence">
                {signed.length === 0 && <span className="muted">{t('Your signs collect here before sending.', 'भेजने से पहले आपके संकेत यहाँ जमा होंगे।')}</span>}
                {signed.map((g, i) => <span key={`${g}-${i}`} className="sentence__word">{g.replace('-', ' ').toLowerCase()}</span>)}
              </div>
              <div className="row">
                <button type="button" className="btn btn--primary btn--big" disabled={!signed.length} onClick={sendSigns}>{t('Send to doctor', 'डॉक्टर को भेजें')}</button>
                <button type="button" className="btn btn--quiet" disabled={!signed.length} onClick={() => setSigned((l) => l.slice(0, -1))}>{t('Remove last', 'आख़िरी हटाएँ')}</button>
              </div>
            </div>
          )}

          {tab === 'voice' && (
            <div className="blind-pad">
              <MicButton big lang={lang} onText={say} label={t('Tap and tell the doctor', 'दबाएँ और डॉक्टर को बताएँ')} />
              <div className="yesno">
                <button type="button" className="btn btn--neel" onClick={() => send({ kind: 'phrase', id: 'p_yes' })}>{t('Yes', 'हाँ')}</button>
                <button type="button" className="btn btn--line" onClick={() => send({ kind: 'phrase', id: 'p_no' })}>{t('No', 'नहीं')}</button>
              </div>
            </div>
          )}

          {tab === 'type' && (
            <div className="stack">
              <form className="stack" onSubmit={(e) => { e.preventDefault(); say(draft) }}>
                <label className="sr-only" htmlFor="pat-text">{t('Message', 'संदेश')}</label>
                <textarea id="pat-text" className="textarea" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('Write to the doctor', 'डॉक्टर को लिखें')} maxLength={500} />
                <button type="submit" className="btn btn--primary btn--big" disabled={!draft.trim()}>{t('Send', 'भेजें')}</button>
              </form>
              <div className="quick__list">
                {quick.map((q) => (
                  <button key={q.id} type="button" className="chip-btn" onClick={() => send({ kind: 'phrase', id: q.id })}>{pick(q, lang)}</button>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
