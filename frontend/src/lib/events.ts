import { api } from './api'

export type InteractionEvent = {
  input_mode: string
  event_type: string
  response_latency_ms?: number | null
  selection_success?: boolean | null
  selection_errors?: number
  scan_interval_ms?: number | null
  context?: Record<string, unknown>
}

/** Batches accessibility interaction events and ships them to Tiger Data via the backend. */
export class EventRecorder {
  private queue: InteractionEvent[] = []
  private timer: number | undefined
  public sent = 0
  public failed = 0

  private sessionId: string
  private token: string
  constructor(sessionId: string, token: string) {
    this.sessionId = sessionId
    this.token = token
    this.timer = window.setInterval(() => this.flush(), 2000)
  }

  record(e: InteractionEvent) {
    this.queue.push(e)
    if (this.queue.length >= 25) this.flush()
  }

  async flush() {
    if (!this.queue.length) return
    const batch = this.queue.splice(0, 200)
    try {
      await api(`/api/sessions/${this.sessionId}/events`, { body: { events: batch }, token: this.token, timeoutMs: 8000 })
      this.sent += batch.length
    } catch {
      this.failed += batch.length
      this.queue.unshift(...batch.slice(-200)) // keep for retry, bounded
    }
  }

  dispose() {
    clearInterval(this.timer)
    void this.flush()
  }
}
