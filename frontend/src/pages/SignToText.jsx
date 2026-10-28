import { useEffect, useState } from 'react'
import SignInput from '../components/SignInput.jsx'
import { IconSpeaker } from '../components/icons.jsx'
import { api } from '../lib/api.js'
import { useSettings, useT } from '../lib/settings.jsx'
import { speak } from '../lib/speech.js'

export default function SignToText() {
  const t = useT()
  const { settings } = useSettings()
  const [glosses, setGlosses] = useState([])
  const [outLang, setOutLang] = useState(settings.lang)
  const [text, setText] = useState('')

  useEffect(() => {
    if (!glosses.length) { setText(''); return }
    const ctrl = new AbortController()
    api('/api/isl/sentence', { method: 'POST', body: { glosses, lang: outLang }, signal: ctrl.signal })
      .then((r) => setText(r.text))
      .catch(() => setText(glosses.join(' ').toLowerCase()))
    return () => ctrl.abort()
  }, [glosses, outLang])

  return (
    <>
      <div className="page-head">
        <div>
          <h1>{t('Sign to speech', 'संकेत से आवाज़')}</h1>
          <p>{t('Sign one word at a time and lower your hands between words.', 'एक बार में एक शब्द का संकेत करें और हर शब्द के बाद हाथ नीचे करें।')}</p>
        </div>
      </div>

      <div className="split split--wide-left">
        <SignInput onSign={(g) => setGlosses((list) => [...list, g].slice(-20))} />

        <div className="panel">
          <h2>{t('Your sentence', 'आपका वाक्य')}</h2>
          <div className="sentence" aria-live="polite">
            {glosses.length === 0 && <span className="muted">{t('Signed words appear here.', 'संकेत किए शब्द यहाँ दिखेंगे।')}</span>}
            {glosses.map((g, i) => <span className="sentence__word" key={`${g}-${i}`}>{g.replace('-', ' ').toLowerCase()}</span>)}
            {text && <p className="sentence__text" lang={outLang}>{text}</p>}
          </div>

          <div className="row mt">
            <div className="segmented" role="group" aria-label={t('Speak in', 'किस भाषा में बोलें')}>
              <button type="button" aria-pressed={outLang === 'en'} onClick={() => setOutLang('en')}>English</button>
              <button type="button" aria-pressed={outLang === 'hi'} onClick={() => setOutLang('hi')} lang="hi">हिंदी</button>
            </div>
          </div>

          <div className="row mt">
            <button type="button" className="btn btn--primary btn--big" disabled={!text} onClick={() => speak(text, outLang, { rate: settings.speechRate })}>
              <IconSpeaker width="24" height="24" /> {t('Say it aloud', 'ज़ोर से बोलें')}
            </button>
            <button type="button" className="btn btn--line" disabled={!glosses.length} onClick={() => setGlosses((g) => g.slice(0, -1))}>
              {t('Remove last word', 'आख़िरी शब्द हटाएँ')}
            </button>
            <button type="button" className="btn btn--quiet" disabled={!glosses.length} onClick={() => setGlosses([])}>
              {t('Clear', 'साफ़ करें')}
            </button>
          </div>

          <p className="note mt">
            {t('Arogya knows the clinic words in its sign library plus every sign you teach it. A word it does not know can be taught on the Teach screen in under a minute.',
               'आरोग्य अपनी लाइब्रेरी के क्लिनिक शब्द और आपके सिखाए सभी संकेत पहचानता है। नया शब्द “सिखाएँ” स्क्रीन पर एक मिनट में सिखाया जा सकता है।')}
          </p>
        </div>
      </div>
    </>
  )
}
