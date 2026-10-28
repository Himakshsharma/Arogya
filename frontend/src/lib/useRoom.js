import { useCallback, useEffect, useRef, useState } from 'react'
import { session, wsUrl } from './api.js'

/**
 * Live consultation over a WebSocket with automatic reconnect.
 * Returns messages, who is online and a send() function.
 */
export function useRoom(code, role) {
  const [messages, setMessages] = useState([])
  const [presence, setPresence] = useState({ doctor: 0, patient: 0 })
  const [status, setStatus] = useState('connecting') // connecting | open | closed | ended | denied
  const [lastError, setLastError] = useState('')
  const wsRef = useRef(null)
  const retryRef = useRef(0)
  const stoppedRef = useRef(false)
  const listenersRef = useRef(new Set())

  const connect = useCallback(() => {
    const params = new URLSearchParams({ role })
    if (role === 'doctor' && session.token) params.set('token', session.token)
    const ws = new WebSocket(wsUrl(`/ws/consult/${code}?${params}`))
    wsRef.current = ws
    setStatus('connecting')

    ws.onopen = () => {
      retryRef.current = 0
      setStatus('open')
    }
    ws.onmessage = (e) => {
      let data
      try { data = JSON.parse(e.data) } catch { return }
      if (data.type === 'history') setMessages(data.messages)
      else if (data.type === 'message') {
        setMessages((m) => (m.some((x) => x.id === data.message.id) ? m : [...m, data.message]))
        listenersRef.current.forEach((fn) => fn(data.message))
      } else if (data.type === 'presence') setPresence({ doctor: data.doctor, patient: data.patient })
      else if (data.type === 'closed') { stoppedRef.current = true; setStatus('ended') }
      else if (data.type === 'error') setLastError(data.detail)
    }
    ws.onclose = (e) => {
      if (e.code === 4404) { stoppedRef.current = true; setStatus('ended'); return }
      if (e.code === 4401) { stoppedRef.current = true; setStatus('denied'); return }
      if (stoppedRef.current) return
      setStatus('closed')
      const delay = Math.min(1000 * 2 ** retryRef.current, 10000)
      retryRef.current += 1
      setTimeout(() => !stoppedRef.current && connect(), delay)
    }
  }, [code, role])

  useEffect(() => {
    stoppedRef.current = false
    connect()
    const ping = setInterval(() => {
      if (wsRef.current?.readyState === 1) wsRef.current.send(JSON.stringify({ type: 'ping' }))
    }, 25000)
    return () => {
      stoppedRef.current = true
      clearInterval(ping)
      wsRef.current?.close()
    }
  }, [connect])

  const send = useCallback((payload) => {
    if (wsRef.current?.readyState !== 1) {
      setLastError('Not connected. Reconnecting…')
      return false
    }
    setLastError('')
    wsRef.current.send(JSON.stringify(payload))
    return true
  }, [])

  /** Subscribe to new incoming messages (not history). */
  const onMessage = useCallback((fn) => {
    listenersRef.current.add(fn)
    return () => listenersRef.current.delete(fn)
  }, [])

  return { messages, presence, status, send, onMessage, lastError }
}
