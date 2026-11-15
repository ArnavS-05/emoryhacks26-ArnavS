import { useEffect, useRef, useState } from 'react'
import { wsUrl } from './api'

export type SocketStatus = 'connecting' | 'open' | 'closed' | 'unauthorized'
export type SessionEvent = { type: string; payload: any; at?: string }

/** Session WebSocket with automatic reconnect and heartbeat. */
export function useSessionSocket(sessionId: string | undefined, token: string | null | undefined,
                                 onEvent: (e: SessionEvent) => void) {
  const [status, setStatus] = useState<SocketStatus>('connecting')
  const handler = useRef(onEvent)
  handler.current = onEvent
  const sockRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!sessionId || !token) return
    let stop = false
    let retry = 0
    let ping: number | undefined
    let timer: number | undefined
    const connect = () => {
      setStatus('connecting')
      const ws = new WebSocket(wsUrl(`/ws/sessions/${sessionId}?token=${encodeURIComponent(token)}`))
      sockRef.current = ws
      ws.onopen = () => {
        retry = 0
        setStatus('open')
        ping = window.setInterval(() => ws.readyState === 1 && ws.send(JSON.stringify({ type: 'ping' })), 20000)
      }
      ws.onmessage = (m) => {
        try {
          const e = JSON.parse(m.data)
          if (e.type !== 'pong') handler.current(e)
        } catch { /* ignore */ }
      }
      ws.onclose = (ev) => {
        clearInterval(ping)
        if (ev.code === 4401) { setStatus('unauthorized'); return }
        setStatus('closed')
        if (!stop) timer = window.setTimeout(connect, Math.min(8000, 500 * 2 ** retry++))
      }
    }
    connect()
    return () => {
      stop = true
      clearTimeout(timer)
      clearInterval(ping)
      sockRef.current?.close()
    }
  }, [sessionId, token])

  const send = (type: string, payload: unknown = {}) => {
    const ws = sockRef.current
    if (ws && ws.readyState === 1) ws.send(JSON.stringify({ type, payload }))
  }
  return { status, send }
}
