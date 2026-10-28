import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { useT } from '../lib/settings.jsx'
import SymptomIcon from './SymptomIcon.jsx'

let cache = null
export function useSymptoms() {
  const [data, setData] = useState(cache)
  useEffect(() => {
    if (!cache) api('/api/symptoms').then((d) => { cache = d; setData(d) }).catch(() => {})
  }, [])
  return data
}

/** Tap a picture to tell the doctor. Bilingual labels on every tile. */
export default function SymptomBoard({ onPick, sentIds = [], lang }) {
  const t = useT(lang)
  const data = useSymptoms()
  const [cat, setCat] = useState('pain')
  if (!data) return <div className="center"><span className="spinner" /></div>

  const list = data.symptoms.filter((s) => s.cat === cat)
  return (
    <div>
      <div className="board-tabs segmented" role="group" aria-label={t('Symptom groups', 'लक्षणों के समूह')}>
        {data.categories.map((c) => (
          <button key={c.id} type="button" aria-pressed={cat === c.id} onClick={() => setCat(c.id)}>
            {t(c.en, c.hi)}
          </button>
        ))}
      </div>
      <div className="symptoms">
        {list.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`symptom ${s.urgent ? 'symptom--urgent' : ''} ${sentIds.includes(s.id) ? 'symptom--sent' : ''}`}
            onClick={() => onPick(s)}
          >
            <SymptomIcon id={s.id} className="symptom__icon" />
            {lang === 'hi' ? (
              <>
                <span className="symptom__en" lang="hi">{s.hi}</span>
                <span className="symptom__hi" lang="en">{s.en}</span>
              </>
            ) : (
              <>
                <span className="symptom__en">{s.en}</span>
                <span className="symptom__hi" lang="hi">{s.hi}</span>
              </>
            )}
          </button>
        ))}
      </div>
    </div>
  )
}
