import { useSpeechInput } from '../lib/speech.js'
import { useT } from '../lib/settings.jsx'
import { IconMic, IconStop } from './icons.jsx'

/** Tap to talk. Shows live words while listening and hands back the final text. */
export default function MicButton({ lang = 'en', onText, onInterim, big = false, label }) {
  const t = useT(lang)
  const { listening, start, stop, error } = useSpeechInput({ lang, onFinal: onText, onInterim })

  return (
    <div className="stack" style={{ justifyItems: big ? 'center' : 'start', gap: 6 }}>
      <button
        type="button"
        className={`mic ${big ? 'mic--big' : ''} ${listening ? 'is-on' : ''}`}
        onClick={listening ? stop : start}
        aria-pressed={listening}
        aria-label={listening ? t('Stop listening', 'सुनना बंद करें') : label || t('Speak', 'बोलें')}
      >
        {listening ? <IconStop /> : <IconMic />}
      </button>
      {big && (
        <strong>{listening ? t('Listening… tap to stop', 'सुन रहे हैं… रोकने के लिए दबाएँ') : label || t('Tap and speak', 'दबाएँ और बोलें')}</strong>
      )}
      {error && <p className="error" role="alert" style={{ margin: 0 }}>{error}</p>}
    </div>
  )
}
