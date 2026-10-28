import { Link } from 'react-router-dom'
import { pick, useT } from '../lib/settings.jsx'
import { IconSpeaker } from './icons.jsx'
import SymptomIcon from './SymptomIcon.jsx'

const SOURCE = {
  sign: { en: 'Signed', hi: 'संकेत से' },
  symptom: { en: 'Symptom', hi: 'लक्षण' },
  pain: { en: 'Pain', hi: 'दर्द' },
  phrase: { en: 'Quick phrase', hi: 'तैयार वाक्य' },
  prescription: { en: 'Prescription', hi: 'पर्चा' },
}

/** One message, shown in the reader's language with the other language underneath. */
export default function Message({ msg, viewer, lang, onSpeak, rxBase = '/rx/' }) {
  const t = useT(lang)
  const other = lang === 'en' ? 'hi' : 'en'
  const mine = msg.sender === viewer
  const main = pick(msg.text, lang)
  const sub = msg.text?.[other] && msg.text[other] !== main ? msg.text[other] : ''
  const time = new Date(msg.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })

  return (
    <article className={`msg ${mine ? 'msg--mine' : ''} ${msg.urgent ? 'msg--urgent' : ''}`}>
      <p className="msg__main" lang={lang}>
        {msg.extra?.symptom_id && <SymptomIcon id={msg.extra.symptom_id} className="msg__icon" />}
        {main}
      </p>
      {sub && <p className="msg__sub" lang={other}>{sub}</p>}
      {msg.kind === 'prescription' && msg.extra?.token && (
        <Link className="btn btn--primary mt" to={`${rxBase}${msg.extra.token}`}>{t('Open prescription', 'पर्चा खोलें')}</Link>
      )}
      <div className="msg__meta">
        <span>{msg.sender === 'doctor' ? t('Doctor', 'डॉक्टर') : t('Patient', 'मरीज़')}</span>
        <span>{time}</span>
        {SOURCE[msg.kind] && <span className="tag">{t(SOURCE[msg.kind].en, SOURCE[msg.kind].hi)}</span>}
        {msg.urgent && <span className="tag tag--urgent">{t('Urgent', 'तुरंत ध्यान दें')}</span>}
        {msg.approximate && <span className="tag tag--warn">{t('Approximate', 'अनुमानित')}</span>}
        {onSpeak && (
          <button type="button" className="btn btn--quiet" style={{ minHeight: 36 }} onClick={() => onSpeak(main, lang)} aria-label={t('Read aloud', 'पढ़कर सुनाएँ')}>
            <IconSpeaker width="18" height="18" />
          </button>
        )}
      </div>
    </article>
  )
}
