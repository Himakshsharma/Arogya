// Thin fetch wrapper. In production the API is on the same origin as the app;
// set VITE_API_URL when the frontend is hosted separately (e.g. Vercel).
const BASE = (import.meta.env?.VITE_API_URL || '').replace(/\/$/, '')

const TOKEN_KEY = 'arogya.token'
const DOCTOR_KEY = 'arogya.doctor'

export const session = {
  get token() {
    try { return localStorage.getItem(TOKEN_KEY) } catch { return null }
  },
  get doctor() {
    try { return JSON.parse(localStorage.getItem(DOCTOR_KEY) || 'null') } catch { return null }
  },
  save({ token, doctor }) {
    try {
      localStorage.setItem(TOKEN_KEY, token)
      localStorage.setItem(DOCTOR_KEY, JSON.stringify(doctor))
    } catch { /* private mode: session lasts until reload */ }
  },
  clear() {
    try { localStorage.removeItem(TOKEN_KEY); localStorage.removeItem(DOCTOR_KEY) } catch { /* ignore */ }
  },
}

export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

export async function api(path, { method = 'GET', body, auth = false, raw = false, signal } = {}) {
  const headers = {}
  if (body !== undefined && !(body instanceof FormData)) headers['Content-Type'] = 'application/json'
  if (auth && session.token) headers.Authorization = `Bearer ${session.token}`
  let res
  try {
    res = await fetch(BASE + path, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    })
  } catch (e) {
    if (e.name === 'AbortError') throw e
    throw new ApiError('Cannot reach the Arogya server. Check your internet connection.', 0)
  }
  if (res.status === 401 && auth) session.clear()
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try {
      const data = await res.json()
      if (typeof data.detail === 'string') detail = data.detail
      else if (Array.isArray(data.detail)) detail = data.detail.map((d) => d.msg).join('. ')
    } catch { /* not JSON */ }
    throw new ApiError(detail, res.status)
  }
  if (raw) return res
  if (res.status === 204) return null
  return res.json()
}

export function wsUrl(path) {
  if (BASE) return BASE.replace(/^http/, 'ws') + path
  const proto = location.protocol === 'https:' ? 'wss:' : 'ws:'
  return `${proto}//${location.host}${path}`
}

let healthPromise = null
export function capabilities() {
  if (!healthPromise) {
    healthPromise = api('/api/health')
      .then((h) => h.capabilities)
      .catch(() => {
        healthPromise = null
        return { server_stt: false, server_tts: false, translation_engine: 'offline', sign_model: false, sign_templates: 0 }
      })
  }
  return healthPromise
}
