import { useState } from 'react'
import AvatarStage from '../avatar/AvatarStage.jsx'
import MicButton from '../components/MicButton.jsx'
import { api } from '../lib/api.js'
import { useSettings, useT } from '../lib/settings.jsx'

const SAMPLES = {
  en: ['Where does it hurt?', 'Take this medicine after food.', 'Do you have a fever?', 'Please lie down.', 'Come back tomorrow morning.'],
  hi: ['दर्द कहाँ है?', 'खाने के बाद दवा लीजिए', 'क्या आपको बुखार है?', 'गहरी साँस लीजिए', 'कल सुबह फिर आइए'],
}

export default function SpeakToSign() {
  const t = useT()
  const { settings } = useSettings()
  const [lang, setLang] = useState(settings.lang)
  const [text, setText] = useState('')
  const [interim, setInterim] = useState('')
  const [result, setResult] = useState(null)
  const [translation, setTranslation] = useState(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const [playKey, setPlayKey] = useState(0)

  const convert = async (value = text) => {
    const v = value.trim()
    if (!v) return
    setBusy(true)
    setError('')
    try {
      const other = lang === 'en' ? 'hi' : 'en'
      const [g, tr] = await Promise.all([
        api('/api/isl/gloss', { method: 'POST', body: { text: v, lang } }),
        api('/api/translate', { method: 'POST', body: { text: v, source: lang, target: other } }),
      ])
      setResult(g)
      setTranslation(tr)
      setPlayKey((k) => k + 1)
    } catch (e) {
      setError(e.message)
    }
    setBusy(false)
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Speech to sign', 'आवाज़ से संकेत')}</h1>
          <p>{t('Speak or type in Hindi or English. The avatar signs it in Indian Sign Language word order.', 'हिंदी या अंग्रेज़ी में बोलें या लिखें। अवतार उसे भारतीय सांकेतिक भाषा के क्रम में दिखाता है।')}</p>
        </div>
        <div className="segmented" role="group" aria-label={t('I am speaking in', 'मैं इस भाषा में बोल रहा हूँ')}>
          <button type="button" aria-pressed={lang === 'en'} onClick={() => setLang('en')}>English</button>
          <button type="button" aria-pressed={lang === 'hi'} onClick={() => setLang('hi')} lang="hi">हिंदी</button>
        </div>
      </div>

      <div className="split">
        <div className="panel">
          <form onSubmit={(e) => { e.preventDefault(); convert() }}>
            <label className="field">
              <span>{t('What should the avatar sign?', 'अवतार क्या दिखाए?')}</span>
              <div className="composer">
                <textarea
                  className="textarea"
                  lang={lang}
                  value={interim || text}
                  onChange={(e) => { setInterim(''); setText(e.target.value) }}
                  placeholder={lang === 'hi' ? 'जैसे: दर्द कहाँ है?' : 'For example: Where does it hurt?'}
                  maxLength={300}
                />
                <MicButton
                  lang={lang}
                  onInterim={setInterim}
                  onText={(said) => { setInterim(''); setText(said); convert(said) }}
                />
              </div>
            </label>
            <button className="btn btn--primary btn--big" type="submit" disabled={busy || !text.trim()}>
              {busy ? <span className="spinner" /> : t('Show in sign language', 'सांकेतिक भाषा में दिखाएँ')}
            </button>
          </form>

          <h3 className="mt">{t('Try a clinic sentence', 'क्लिनिक का कोई वाक्य आज़माएँ')}</h3>
          <div className="samples">
            {SAMPLES[lang].map((s) => (
              <button key={s} type="button" className="chip-btn" lang={lang} onClick={() => { setText(s); convert(s) }}>{s}</button>
            ))}
          </div>

          {error && <p className="error" role="alert">{error}</p>}

          {result && (
            <div className="stack" aria-live="polite">
              <div>
                <span className="muted">{t('ISL word order', 'ISL शब्द क्रम')}</span>
                <p style={{ fontSize: 'var(--step-2)', fontWeight: 700, margin: 0 }}>{result.gloss_text || '—'}</p>
              </div>
              {translation && (
                <div>
                  <span className="muted">{lang === 'en' ? 'हिंदी में' : 'In English'}</span>
                  <p style={{ fontSize: 'var(--step-1)', margin: 0 }} lang={lang === 'en' ? 'hi' : 'en'}>{translation.text}</p>
                  {translation.approximate && (
                    <span className="tag tag--warn">{t('Approximate translation', 'अनुमानित अनुवाद')}</span>
                  )}
                </div>
              )}
              <p className="muted" style={{ margin: 0 }}>
                {t('Dashed words have no sign yet, so the avatar fingerspells them.', 'डैश वाले शब्दों का अभी संकेत नहीं है, इसलिए अवतार उन्हें अक्षरों में दिखाता है।')}
              </p>
            </div>
          )}
        </div>

        <AvatarStage tokens={result?.tokens || []} playKey={playKey} question={result?.is_question} />
      </div>
    </>
  )
}
