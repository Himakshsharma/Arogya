import { useCallback, useEffect, useRef, useState } from 'react'
import { api, capabilities } from './api.js'

const LOCALE = { en: 'en-IN', hi: 'hi-IN' }

// ---------- Text to speech ----------

function pickVoice(lang) {
  if (typeof speechSynthesis === 'undefined') return null
  const voices = speechSynthesis.getVoices()
  const want = LOCALE[lang]
  return (
    voices.find((v) => v.lang === want) ||
    voices.find((v) => v.lang?.startsWith(lang)) ||
    null
  )
}

let currentAudio = null

export function stopSpeaking() {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  if (currentAudio) { currentAudio.pause(); currentAudio = null }
}

/**
 * Speak text aloud. Uses the device voice when it has one for the language,
 * otherwise asks the server for an MP3 (gTTS). Resolves when speech ends.
 */
export async function speak(text, lang = 'en', { rate = 0.95 } = {}) {
  if (!text) return
  stopSpeaking()
  const voice = pickVoice(lang)
  const caps = await capabilities()

  if (!voice && caps.server_tts) {
    try {
      const res = await api('/api/speech/tts', { method: 'POST', body: { text, lang }, raw: true })
      const url = URL.createObjectURL(await res.blob())
      currentAudio = new Audio(url)
      currentAudio.playbackRate = rate
      await new Promise((resolve) => {
        currentAudio.onended = resolve
        currentAudio.onerror = resolve
        currentAudio.play().catch(resolve)
      })
      URL.revokeObjectURL(url)
      return
    } catch { /* fall back to the browser voice */ }
  }

  if (typeof speechSynthesis === 'undefined') return
  await new Promise((resolve) => {
    const u = new SpeechSynthesisUtterance(text)
    u.lang = LOCALE[lang] || 'en-IN'
    if (voice) u.voice = voice
    u.rate = rate
    u.onend = resolve
    u.onerror = resolve
    speechSynthesis.speak(u)
  })
}

// Voices load asynchronously in Chrome; touching the list early warms it up.
if (typeof speechSynthesis !== 'undefined') {
  speechSynthesis.getVoices()
  speechSynthesis.onvoiceschanged = () => speechSynthesis.getVoices()
}

// ---------- Speech to text ----------

const BrowserRecognition =
  typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : null

/**
 * Microphone input. Prefers the browser's live recognition (Chrome, Edge,
 * Android), falls back to recording and sending audio to Whisper on the server.
 */
export function useSpeechInput({ lang = 'en', onFinal, onInterim } = {}) {
  const [listening, setListening] = useState(false)
  const [mode, setMode] = useState(BrowserRecognition ? 'browser' : 'none')
  const [error, setError] = useState('')
  const recRef = useRef(null)
  const mediaRef = useRef(null)
  const finalRef = useRef(onFinal)
  const interimRef = useRef(onInterim)
  finalRef.current = onFinal
  interimRef.current = onInterim

  useEffect(() => {
    if (!BrowserRecognition) capabilities().then((c) => setMode(c.server_stt ? 'server' : 'none'))
  }, [])

  const stop = useCallback(() => {
    recRef.current?.stop()
    if (mediaRef.current?.state === 'recording') mediaRef.current.stop()
    setListening(false)
  }, [])

  const start = useCallback(async () => {
    setError('')
    if (mode === 'browser') {
      const rec = new BrowserRecognition()
      rec.lang = LOCALE[lang]
      rec.interimResults = true
      rec.continuous = false
      rec.onresult = (e) => {
        let interim = ''
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i]
          if (r.isFinal) finalRef.current?.(r[0].transcript.trim())
          else interim += r[0].transcript
        }
        if (interim) interimRef.current?.(interim)
      }
      rec.onerror = (e) => {
        if (e.error === 'not-allowed') setError('Microphone permission was blocked. Allow it in the browser address bar.')
        else if (e.error !== 'no-speech' && e.error !== 'aborted') setError('Could not hear clearly. Try again.')
      }
      rec.onend = () => setListening(false)
      recRef.current = rec
      rec.start()
      setListening(true)
      return
    }
    if (mode === 'server') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const chunks = []
        const mr = new MediaRecorder(stream)
        mr.ondataavailable = (e) => e.data.size && chunks.push(e.data)
        mr.onstop = async () => {
          stream.getTracks().forEach((t) => t.stop())
          const form = new FormData()
          form.append('audio', new Blob(chunks, { type: mr.mimeType || 'audio/webm' }), 'speech.webm')
          form.append('lang', lang)
          try {
            const out = await api('/api/speech/stt', { method: 'POST', body: form })
            if (out.text) finalRef.current?.(out.text)
          } catch (e) {
            setError(e.message)
          }
        }
        mediaRef.current = mr
        mr.start()
        setListening(true)
      } catch {
        setError('Microphone permission was blocked. Allow it in the browser address bar.')
      }
      return
    }
    setError('Voice input is not available in this browser. Type instead, or open Arogya in Chrome.')
  }, [lang, mode])

  useEffect(() => () => stop(), [stop])

  return { supported: mode !== 'none', listening, start, stop, error, mode }
}
