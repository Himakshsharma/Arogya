import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { mirrorFrame } from '../lib/landmarks.js'
import { SignSegmenter } from '../lib/segmenter.js'
import { useSettings, useT } from '../lib/settings.jsx'
import { HAND_EDGES, SignTracker } from '../lib/tracker.js'
import { IconCamera } from './icons.jsx'

const words = (g) => g.replace('-', ' ').toLowerCase()

/**
 * Camera-based sign recognition.
 *  - Landmarks are extracted in the browser (video never leaves the device)
 *  - The stream is cut into signs by SignSegmenter
 *  - Each sign is sent to /api/signs/recognize
 * Confident results are added automatically; unsure ones ask the signer to pick.
 *
 * mode="recognize" (default) calls onSign(gloss) for each accepted sign.
 * mode="record" calls onRecorded(frames) for one sign, for the Teach screen.
 */
export default function SignInput({ onSign, onRecorded, mode = 'recognize', onFrame, armed = true, lang }) {
  const t = useT(lang)
  const { settings } = useSettings()
  const videoRef = useRef(null)
  const canvasRef = useRef(null)
  const trackerRef = useRef(null)
  const segRef = useRef(new SignSegmenter())
  const [status, setStatus] = useState('off') // off | loading | live | signing | thinking | error
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [guess, setGuess] = useState(null)
  const armedRef = useRef(armed)
  armedRef.current = armed
  const onFrameRef = useRef(onFrame)
  onFrameRef.current = onFrame

  const draw = useCallback((raw) => {
    const c = canvasRef.current
    const v = videoRef.current
    if (!c || !v) return
    if (c.width !== v.videoWidth) { c.width = v.videoWidth; c.height = v.videoHeight }
    const ctx = c.getContext('2d')
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.lineWidth = 4
    ctx.strokeStyle = '#F2B035'
    ctx.fillStyle = '#ffffff'
    for (const hand of raw.hands) {
      for (const [a, b] of HAND_EDGES) {
        ctx.beginPath()
        ctx.moveTo(hand[a][0] * c.width, hand[a][1] * c.height)
        ctx.lineTo(hand[b][0] * c.width, hand[b][1] * c.height)
        ctx.stroke()
      }
      for (const p of hand) {
        ctx.beginPath()
        ctx.arc(p[0] * c.width, p[1] * c.height, 4, 0, Math.PI * 2)
        ctx.fill()
      }
    }
    if (raw.pose) {
      ctx.strokeStyle = 'rgba(223, 226, 243, 0.8)'
      ctx.lineWidth = 3
      for (const [a, b] of [[11, 12], [11, 13], [13, 15], [12, 14], [14, 16]]) {
        ctx.beginPath()
        ctx.moveTo(raw.pose[a][0] * c.width, raw.pose[a][1] * c.height)
        ctx.lineTo(raw.pose[b][0] * c.width, raw.pose[b][1] * c.height)
        ctx.stroke()
      }
    }
  }, [])

  const recognize = useCallback(async (segment) => {
    setStatus('thinking')
    const frames = settings.leftHanded ? segment.map(mirrorFrame) : segment
    try {
      const res = await api('/api/signs/recognize', { method: 'POST', body: { frames, top_k: 4 } })
      if (!res.predictions.length) {
        setGuess({ unsure: true, predictions: [] })
      } else if (res.confident) {
        setGuess({ accepted: res.predictions[0], predictions: res.predictions })
        onSign?.(res.predictions[0].label)
      } else {
        setGuess({ unsure: true, predictions: res.predictions })
      }
    } catch (e) {
      setError(e.message)
    }
    setStatus('live')
  }, [onSign, settings.leftHanded])

  const handleFrame = useCallback(({ frame, raw }) => {
    draw(raw)
    if (!frame) return
    onFrameRef.current?.(frame)
    if (!armedRef.current) return
    const out = segRef.current.push(frame)
    if (out.state === 'signing') {
      setStatus((s) => (s === 'thinking' ? s : 'signing'))
      setProgress(out.progress || 0)
    } else {
      setProgress(0)
      setStatus((s) => (s === 'signing' ? 'live' : s))
    }
    if (out.segment) {
      if (mode === 'record') onRecorded?.(out.segment)
      else recognize(out.segment)
    }
  }, [draw, mode, onRecorded, recognize])

  const start = async () => {
    setError('')
    setStatus('loading')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
        audio: false,
      })
      const v = videoRef.current
      v.srcObject = stream
      await v.play()
      const tracker = new SignTracker(v, { onFrame: handleFrame })
      trackerRef.current = tracker
      await tracker.start()
      setStatus('live')
    } catch (e) {
      stop()
      setStatus('error')
      setError(
        e?.name === 'NotAllowedError'
          ? t('Camera permission was blocked. Allow the camera in the browser address bar, then try again.',
              'कैमरा की अनुमति बंद है। ब्राउज़र के एड्रेस बार में कैमरा की अनुमति दें और फिर कोशिश करें।')
          : t('The camera or sign model could not start. Check your internet connection and try again.',
              'कैमरा या मॉडल शुरू नहीं हुआ। इंटरनेट जाँचें और फिर कोशिश करें।'),
      )
    }
  }

  const stop = () => {
    trackerRef.current?.stop()
    trackerRef.current = null
    const v = videoRef.current
    v?.srcObject?.getTracks().forEach((tr) => tr.stop())
    if (v) v.srcObject = null
    segRef.current.reset()
    setStatus('off')
  }

  // Keep the latest frame handler without restarting the camera
  useEffect(() => {
    if (trackerRef.current) trackerRef.current.onFrame = handleFrame
  }, [handleFrame])

  useEffect(() => () => stop(), []) // eslint-disable-line react-hooks/exhaustive-deps

  const statusText = {
    off: t('Camera off', 'कैमरा बंद'),
    loading: t('Starting camera…', 'कैमरा शुरू हो रहा है…'),
    live: mode === 'record'
      ? t('Raise your hands and sign once', 'हाथ उठाएँ और एक बार संकेत करें')
      : t('Ready. Sign one word, then lower your hands', 'तैयार। एक शब्द का संकेत करें, फिर हाथ नीचे करें'),
    signing: t('Watching…', 'देख रहे हैं…'),
    thinking: t('Reading the sign…', 'संकेत पढ़ रहे हैं…'),
    error: t('Camera unavailable', 'कैमरा उपलब्ध नहीं'),
  }[status]

  const choose = (label) => {
    setGuess({ accepted: { label }, predictions: [] })
    onSign?.(label)
  }

  return (
    <div>
      <div className="camera">
        <video ref={videoRef} playsInline muted />
        <canvas ref={canvasRef} />
        {status !== 'off' && status !== 'error' && (
          <span className="camera__status" aria-live="polite">
            <span className={`camera__dot ${status === 'signing' ? 'is-signing' : status === 'loading' ? '' : 'is-live'}`} />
            {statusText}
          </span>
        )}
        {status === 'signing' && <span className="camera__bar" style={{ width: `${progress * 100}%` }} />}
        {(status === 'off' || status === 'error') && (
          <div className="camera__empty">
            <IconCamera width="44" height="44" />
            <p style={{ margin: 0 }}>
              {t('Sit about an arm’s length from the camera so your hands and shoulders are visible.',
                 'कैमरे से एक हाथ की दूरी पर बैठें ताकि हाथ और कंधे दिखें।')}
            </p>
            <button type="button" className="btn btn--primary" onClick={start}>
              {t('Turn on camera', 'कैमरा चालू करें')}
            </button>
            {error && <p className="error" role="alert" style={{ color: '#ffb4ab' }}>{error}</p>}
          </div>
        )}
        {status === 'loading' && <div className="camera__empty"><span className="spinner" /></div>}
      </div>

      {status !== 'off' && (
        <div className="row mt" style={{ justifyContent: 'space-between' }}>
          <span className="muted">{t('Video stays on this device. Only hand positions are sent.', 'वीडियो इसी डिवाइस पर रहता है। केवल हाथों की स्थिति भेजी जाती है।')}</span>
          <button type="button" className="btn btn--line" onClick={stop}>{t('Turn off camera', 'कैमरा बंद करें')}</button>
        </div>
      )}

      {mode === 'recognize' && guess && (
        <div className="guess" aria-live="polite">
          {guess.accepted && (
            <>
              <span className="muted">{t('Understood', 'समझा')}</span>
              <span className="guess__main">{words(guess.accepted.label)}</span>
              {guess.accepted.score !== undefined && (
                <div className="confidence" aria-label={`${Math.round(guess.accepted.score * 100)}%`}>
                  <span style={{ width: `${Math.round(guess.accepted.score * 100)}%` }} />
                </div>
              )}
            </>
          )}
          {guess.unsure && (
            <span className="muted">
              {guess.predictions.length
                ? t('Not sure. Did you mean:', 'पक्का नहीं। क्या आपका मतलब था:')
                : t('No sign recognised. Keep both hands in view and sign a little slower.', 'संकेत नहीं पहचाना। दोनों हाथ कैमरे में रखें और थोड़ा धीरे करें।')}
            </span>
          )}
          {(guess.unsure ? guess.predictions : guess.predictions.slice(1)).length > 0 && (
            <div className="guess__alts">
              {(guess.unsure ? guess.predictions : guess.predictions.slice(1)).map((p) => (
                <button key={p.label} type="button" className="chip-btn" onClick={() => choose(p.label)}>
                  {words(p.label)}
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
