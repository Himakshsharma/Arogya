import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { useSettings, useT } from '../lib/settings.jsx'
import { buildTimeline } from './sequencer.js'
import { hasSign } from './signs.js'

// recordings from /teach override built-in animations
let recordedIndex = null
const recordedCache = new Map()

async function loadRecorded(tokens) {
  if (!recordedIndex) {
    recordedIndex = api('/api/signs/templates')
      .then((rows) => new Set(rows.map((r) => r.label)))
      .catch(() => new Set())
  }
  const labels = await recordedIndex
  const out = {}
  await Promise.all(
    tokens
      .filter((t) => t.kind === 'sign' && labels.has(t.gloss))
      .map(async (t) => {
        if (!recordedCache.has(t.gloss)) {
          recordedCache.set(t.gloss, api(`/api/signs/recorded/${t.gloss}`).then((r) => r.frames).catch(() => null))
        }
        const frames = await recordedCache.get(t.gloss)
        if (frames) out[t.gloss] = frames
      }),
  )
  return out
}

export function forgetRecordedSigns() {
  recordedIndex = null
  recordedCache.clear()
}

/**
 * The 3D signer with captions.
 * tokens: [{ gloss, kind: 'sign' | 'spell', letters? }]
 * playKey: change it to replay the same tokens
 */
export default function AvatarStage({
  tokens = [],
  playKey = 0,
  question = false,
  size = 'lg',
  autoPlay = true,
  liveFrame = null,
  onDone,
  label,
  extraRecorded = null,
  lang,
}) {
  const t = useT(lang)
  const { settings, update } = useSettings()
  const holder = useRef(null)
  const rendererRef = useRef(null)
  const [failed, setFailed] = useState(false)
  const [current, setCurrent] = useState({ label: '', letter: '', index: -1 })
  const [playing, setPlaying] = useState(false)
  const [readyTick, setReadyTick] = useState(0)
  const doneRef = useRef(onDone)
  doneRef.current = onDone

  // three.js is loaded lazily
  useEffect(() => {
    let disposed = false
    import('./AvatarRenderer.js').then(({ AvatarRenderer, webglAvailable }) => {
      if (disposed || !holder.current) return
      if (!webglAvailable()) {
        setFailed(true)
        return
      }
      try {
        const r = new AvatarRenderer(holder.current, { reduceMotion: settings.reduceMotion })
        r.onUpdate = (info) => {
          if (info.done) {
            setPlaying(false)
            setCurrent({ label: '', letter: '', index: -1 })
            doneRef.current?.()
          } else {
            setCurrent({ label: info.label, letter: info.letter, index: info.index })
          }
        }
        rendererRef.current = r
        setReadyTick((n) => n + 1)
      } catch {
        setFailed(true)
      }
    }).catch(() => setFailed(true)) // chunk failed to load (offline) - show words instead
    return () => {
      disposed = true
      rendererRef.current?.dispose()
      rendererRef.current = null
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const tokenKey = useMemo(() => tokens.map((x) => `${x.kind}:${x.gloss}`).join(' '), [tokens])

  useEffect(() => {
    if (rendererRef.current) rendererRef.current.mirror = settings.leftHanded
  }, [settings.leftHanded, readyTick])

  useEffect(() => {
    const r = rendererRef.current
    if (!r || !autoPlay || !tokens.length) return
    let cancelled = false
    loadRecorded(tokens).then((recorded) => {
      if (cancelled) return
      if (extraRecorded) Object.assign(recorded, extraRecorded)
      r.play(buildTimeline(tokens, { speed: settings.avatarSpeed, recorded }), { question })
      setPlaying(true)
    })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tokenKey, playKey, readyTick, settings.avatarSpeed])

  useEffect(() => {
    const r = rendererRef.current
    if (!r) return
    if (liveFrame) r.showLive(liveFrame)
    else if (r.liveFrame) r.liveFrame = null
  }, [liveFrame, readyTick])

  const replay = () => {
    const r = rendererRef.current
    if (!r || !tokens.length) return
    loadRecorded(tokens).then((recorded) => {
      if (extraRecorded) Object.assign(recorded, extraRecorded)
      r.play(buildTimeline(tokens, { speed: settings.avatarSpeed, recorded }), { question })
      setPlaying(true)
    })
  }

  const slow = settings.avatarSpeed < 1
  const word = current.label

  return (
    <figure className={`stage stage--${size}`} aria-label={label || t('Sign language avatar', 'साइन भाषा अवतार')}>
      <div className="stage__disc" />
      <div className="stage__canvas" ref={holder} />
      {failed && (
        <p className="stage__fallback">
          {t('3D is not supported on this device. Read the words below.', 'इस डिवाइस पर 3D नहीं चलता। नीचे लिखे शब्द पढ़ें।')}
        </p>
      )}

      <figcaption className="stage__caption" aria-live="polite">
        <span className="stage__word">{word ? word.replace('-', ' ').toLowerCase() : ' '}</span>
        {current.letter && <span className="stage__letter">{current.letter}</span>}
      </figcaption>

      {tokens.length > 0 && size !== 'sm' && (
        <ol className="gloss" aria-label={t('Signs in order', 'क्रम से संकेत')}>
          {tokens.map((tok, i) => (
            <li
              key={`${tok.gloss}-${i}`}
              className={`gloss__chip ${current.label === tok.gloss ? 'is-on' : ''} ${tok.kind === 'spell' || !hasSign(tok.gloss) ? 'is-spelled' : ''}`}
            >
              {tok.gloss.replace('-', ' ')}
            </li>
          ))}
        </ol>
      )}

      {size !== 'sm' && (
        <div className="stage__controls">
          <button type="button" className="btn btn--quiet" onClick={replay} disabled={!tokens.length || playing}>
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 12a8 8 0 1 0 2.4-5.7M4 4v5h5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            {t('Sign again', 'फिर से दिखाएँ')}
          </button>
          <button
            type="button"
            className={`btn btn--quiet ${slow ? 'is-active' : ''}`}
            aria-pressed={slow}
            onClick={() => update({ avatarSpeed: slow ? 1 : 0.6 })}
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M3 15c2-6 6-8 10-8s7 3 8 8M7 15v3M17 15v3" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
            {t('Slower', 'धीमा')}
          </button>
        </div>
      )}
    </figure>
  )
}
