import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

// Accessibility and language preferences, saved on this device.
const DEFAULTS = {
  lang: 'en',            // interface language: en | hi
  textSize: 'm',         // m | l | xl
  contrast: 'normal',    // normal | high
  theme: 'auto',         // auto | light | dark
  reduceMotion: false,
  autoSpeak: true,       // read incoming messages aloud
  speechRate: 0.95,
  avatarSpeed: 1,
  leftHanded: false,     // mirror the avatar and recognition for left-handed signers
}

const KEY = 'arogya.settings'
const SettingsContext = createContext(null)

function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return DEFAULTS
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(load)

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(settings)) } catch { /* ignore */ }
    const root = document.documentElement
    root.lang = settings.lang === 'hi' ? 'hi' : 'en'
    root.dataset.text = settings.textSize
    root.dataset.contrast = settings.contrast
    if (settings.theme === 'auto') delete root.dataset.theme
    else root.dataset.theme = settings.theme
    root.dataset.motion = settings.reduceMotion ? 'reduce' : 'full'
  }, [settings])

  const update = useCallback((patch) => setSettings((s) => ({ ...s, ...patch })), [])
  const value = useMemo(() => ({ settings, update }), [settings, update])
  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>
}

export function useSettings() {
  return useContext(SettingsContext)
}

// t(en, hi) -> string for the active language
export function useT(langOverride) {
  const { settings } = useSettings()
  const lang = langOverride || settings.lang
  return useCallback((en, hi) => (lang === 'hi' && hi ? hi : en), [lang])
}

export function pick(obj, lang) {
  if (!obj) return ''
  return obj[lang] || obj.en || obj.hi || ''
}
