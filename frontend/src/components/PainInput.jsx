import { useState } from 'react'
import { useT } from '../lib/settings.jsx'
import { useSymptoms } from './SymptomBoard.jsx'
import { PainFace } from './SymptomIcon.jsx'

// Green to red, readable with black numbers
const COLORS = ['#7ccf9a', '#94d48e', '#b2d77f', '#cfd873', '#e8d36a', '#f2c25e', '#f4a957', '#f28f52', '#ec7550', '#e25a4b', '#d64545']

const REGIONS = [
  { id: 'head', d: 'M100 12a26 30 0 1 1 0 60a26 30 0 1 1 0-60z' },
  { id: 'eyes', d: 'M84 36h32v10H84z' },
  { id: 'throat', d: 'M90 72h20v16H90z' },
  { id: 'chest', d: 'M66 90h68v52H66z' },
  { id: 'stomach', d: 'M70 142h60v50H70z' },
  { id: 'right_arm', d: 'M40 92h24l-6 110H38z' },
  { id: 'left_arm', d: 'M136 92h24l2 110h-20z' },
  { id: 'right_leg', d: 'M70 194h28l-4 120H72z' },
  { id: 'left_leg', d: 'M102 194h28l-2 120h-22z' },
]

/** Pain level 0-10 with an optional place on the body. */
export default function PainInput({ onSend, lang }) {
  const t = useT(lang)
  const data = useSymptoms()
  const [level, setLevel] = useState(null)
  const [region, setRegion] = useState(null)
  const regionName = (id) => {
    const r = data?.body_regions.find((x) => x.id === id)
    return r ? t(r.en, r.hi) : ''
  }

  return (
    <div className="stack">
      <h3>{t('Where does it hurt?', 'दर्द कहाँ है?')}</h3>
      <div className="bodymap">
        <svg viewBox="0 0 200 330" role="group" aria-label={t('Body map', 'शरीर का नक्शा')}>
          {REGIONS.map((r) => (
            <path
              key={r.id}
              d={r.d}
              className={`region ${region === r.id ? 'is-on' : ''}`}
              tabIndex={0}
              role="button"
              aria-pressed={region === r.id}
              aria-label={regionName(r.id)}
              onClick={() => setRegion(r.id)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), setRegion(r.id))}
            />
          ))}
        </svg>
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            {t('Tap the place. The figure is facing you, so its right arm is on your left.', 'जगह पर दबाएँ। आकृति आपकी ओर मुँह किए है, इसलिए उसका दायाँ हाथ आपकी बाईं ओर है।')}
          </p>
          {region && <strong style={{ fontSize: 'var(--step-2)' }}>{regionName(region)}</strong>}
          <button type="button" className="btn btn--line" onClick={() => setRegion('back')} aria-pressed={region === 'back'}>
            {t('My back', 'मेरी पीठ')}
          </button>
        </div>
      </div>

      <h3 className="mt">{t('How strong is the pain?', 'दर्द कितना तेज़ है?')}</h3>
      <div className="pain" role="group" aria-label={t('Pain from 0 to 10', 'दर्द 0 से 10')}>
        {COLORS.map((c, i) => (
          <button key={i} type="button" style={{ background: c }} aria-pressed={level === i} onClick={() => setLevel(i)}>
            {i}
          </button>
        ))}
      </div>
      <div className="pain-faces" aria-hidden="true">{[0, 1, 2, 3, 4, 5].map((n) => <PainFace key={n} level={n} />)}</div>

      <button
        type="button"
        className="btn btn--primary btn--big mt"
        disabled={level === null}
        onClick={() => { onSend({ level, region }); setLevel(null); setRegion(null) }}
      >
        {t('Tell the doctor', 'डॉक्टर को बताएँ')}
      </button>
    </div>
  )
}
