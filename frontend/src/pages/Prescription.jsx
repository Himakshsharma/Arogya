import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'react-router-dom'
import AvatarStage from '../avatar/AvatarStage.jsx'
import { IconMoon, IconNoon, IconPlate, IconPrint, IconSpeaker, IconSun } from '../components/icons.jsx'
import { api } from '../lib/api.js'
import { useSettings, useT } from '../lib/settings.jsx'
import { speak, stopSpeaking } from '../lib/speech.js'

const qty = (v) => (v === 0.5 ? '½' : String(v))

export default function Prescription() {
  const { token } = useParams()
  const { settings } = useSettings()
  const [rx, setRx] = useState(null)
  const [error, setError] = useState('')
  const [lang, setLang] = useState(null)
  const [signItem, setSignItem] = useState(null)
  const [speaking, setSpeaking] = useState(false)
  const t = useT(lang || undefined)

  useEffect(() => {
    api(`/api/prescriptions/${token}`).then((r) => { setRx(r); setLang((l) => l || r.lang) }).catch((e) => setError(e.message))
    return () => stopSpeaking()
  }, [token])

  const tokens = useMemo(() => (signItem === null || !rx ? [] : rx.items[signItem].gloss.map((g) => ({ gloss: g, kind: /^\d+$/.test(g) ? 'spell' : 'sign', letters: g }))), [signItem, rx])

  if (error) return <div className="center"><p className="error">{error}</p></div>
  if (!rx) return <div className="center"><span className="spinner" /></div>

  const listen = async (text) => {
    setSpeaking(true)
    await speak(text, lang, { rate: settings.speechRate * 0.95 })
    setSpeaking(false)
  }

  return (
    <div className="rx">
      <header className="rx-head">
        <p>{t('Prescription for', 'पर्चा')}</p>
        <h1>{rx.patient_name}</h1>
        <p>{rx.doctor?.name}{rx.doctor?.specialty ? `, ${rx.doctor.specialty}` : ''}</p>
        <p>{new Date(rx.created_at).toLocaleDateString(lang === 'hi' ? 'hi-IN' : 'en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</p>
        {rx.diagnosis && <p>{t('Diagnosis', 'निदान')}: {rx.diagnosis}</p>}
      </header>

      <div className="row no-print" style={{ marginBottom: 16 }}>
        <div className="segmented" role="group" aria-label="Language">
          <button type="button" aria-pressed={lang === 'hi'} onClick={() => setLang('hi')} lang="hi">हिंदी</button>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
        </div>
        <button type="button" className="btn btn--primary btn--big" onClick={() => (speaking ? (stopSpeaking(), setSpeaking(false)) : listen(rx.speech[lang]))}>
          <IconSpeaker width="24" height="24" /> {speaking ? t('Stop', 'रोकें') : t('Listen to all', 'पूरा सुनें')}
        </button>
        <button type="button" className="btn btn--line" onClick={() => window.print()}>
          <IconPrint width="20" height="20" /> {t('Print', 'प्रिंट')}
        </button>
      </div>

      {signItem !== null && (
        <div className="panel no-print" style={{ marginBottom: 16 }}>
          <AvatarStage size="md" tokens={tokens} lang={lang} />
          <button type="button" className="btn btn--quiet" onClick={() => setSignItem(null)}>{t('Close sign view', 'संकेत बंद करें')}</button>
        </div>
      )}

      {rx.items.map((it, i) => (
        <article className="med" key={i}>
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <div>
              <h2 className="med__name">{it.medicine}</h2>
              {it.dose && <span className="med__dose">{it.dose}</span>}
            </div>
            <span className="tag" style={{ fontSize: 'var(--step-0)' }}>{it.days} {t(it.days === 1 ? 'day' : 'days', 'दिन')}</span>
          </div>

          <div className="slots" role="list">
            {[
              ['morning', IconSun, 'Morning', 'सुबह'],
              ['afternoon', IconNoon, 'Afternoon', 'दोपहर'],
              ['night', IconMoon, 'Night', 'रात'],
            ].map(([key, Icon, en, hi]) => (
              <div key={key} role="listitem" className={`slot ${it[key] > 0 ? 'is-on' : ''}`} aria-label={`${t(en, hi)}: ${it[key]}`}>
                <Icon />
                <strong>{it[key] > 0 ? qty(it[key]) : '—'}</strong>
                <span>{t(en, hi)}</span>
              </div>
            ))}
          </div>

          {it.food !== 'any' && (
            <p className="row" style={{ margin: 0, fontWeight: 600 }}>
              <IconPlate width="22" height="22" />
              {it.food === 'after' ? t('After food', 'खाने के बाद') : t('Before food', 'खाने से पहले')}
            </p>
          )}
          <p className="med__line" lang={lang}>{it.text[lang]}</p>
          <div className="row no-print">
            <button type="button" className="btn btn--line" onClick={() => listen(it.text[lang])}>
              <IconSpeaker width="20" height="20" /> {t('Listen', 'सुनें')}
            </button>
            <button type="button" className="btn btn--quiet" onClick={() => setSignItem(i)}>{t('Show in sign language', 'सांकेतिक भाषा में देखें')}</button>
          </div>
        </article>
      ))}

      {rx.notes && <p className="note mt">{rx.notes}</p>}
    </div>
  )
}
