/**
 * Pure gesture detectors fed by MediaPipe Face Landmarker output.
 * Deliberately conservative: ordinary involuntary blinks (~100–250 ms) never trigger a selection.
 */
export type BlinkConfig = { threshold: number; holdMs: number; cooldownMs: number }
export type BlinkResult = 'select' | 'rejected' | null

export class BlinkDetector {
  private closedSince: number | null = null
  private fired = false
  private lastFire = -Infinity
  cfg: BlinkConfig
  constructor(cfg: BlinkConfig) { this.cfg = cfg }

  /** score: eye-closure 0..1 (min of both eyes' eyeBlink blendshapes). t: ms timestamp. */
  update(score: number, t: number): BlinkResult {
    const closed = score >= this.cfg.threshold
    const opened = score < this.cfg.threshold * 0.8 // hysteresis band avoids flicker
    if (closed) {
      if (this.closedSince === null) {
        this.closedSince = t
        this.fired = false
      }
      if (!this.fired && t - this.closedSince >= this.cfg.holdMs && t - this.lastFire >= this.cfg.cooldownMs) {
        this.fired = true
        this.lastFire = t
        return 'select'
      }
      return null
    }
    if (opened && this.closedSince !== null) {
      const dur = t - this.closedSince
      const wasFired = this.fired
      this.closedSince = null
      this.fired = false
      // A near-miss (intentional-looking but too short) is reported for adaptive tuning.
      if (!wasFired && dur >= this.cfg.holdMs * 0.6 && dur < this.cfg.holdMs) return 'rejected'
    }
    return null
  }

  /** 0..1 progress toward a deliberate selection, for visual feedback. */
  progress(t: number): number {
    if (this.closedSince === null || this.fired) return 0
    return Math.min(1, (t - this.closedSince) / this.cfg.holdMs)
  }

  inCooldown(t: number) {
    return t - this.lastFire < this.cfg.cooldownMs
  }
}

/** Threshold halfway between calibrated open-eye and deliberate-closure scores. */
export function calibrateBlinkThreshold(openScores: number[], closedScores: number[]): number {
  const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / Math.max(a.length, 1)
  const o = mean(openScores)
  const c = mean(closedScores)
  if (c - o < 0.15) return Math.min(0.9, Math.max(0.3, o + 0.25)) // weak separation: be conservative
  return Math.round((o + (c - o) * 0.5) * 100) / 100
}

export type HeadGesture = 'left' | 'right' | 'up' | 'down'
export type HeadPose = { yaw: number; pitch: number }

type Pt = { x: number; y: number }
/** Approximate yaw/pitch from face landmarks (nose tip relative to face box). */
export function headPose(lm: Pt[]): HeadPose {
  const nose = lm[1], left = lm[234], right = lm[454], top = lm[10], chin = lm[152]
  const w = Math.abs(right.x - left.x) || 1
  const h = Math.abs(chin.y - top.y) || 1
  return { yaw: (nose.x - (left.x + right.x) / 2) / w, pitch: (nose.y - (top.y + chin.y) / 2) / h }
}

export class HeadGestureDetector {
  private neutral: HeadPose = { yaw: 0, pitch: 0 }
  private candidate: { g: HeadGesture; since: number } | null = null
  private armed = true
  sensitivity: number
  dwellMs: number
  constructor(sensitivity = 0.5, dwellMs = 300) { this.sensitivity = sensitivity; this.dwellMs = dwellMs }

  calibrate(samples: HeadPose[]) {
    const n = Math.max(samples.length, 1)
    this.neutral = {
      yaw: samples.reduce((a, s) => a + s.yaw, 0) / n,
      pitch: samples.reduce((a, s) => a + s.pitch, 0) / n,
    }
  }

  get threshold() {
    return 0.16 - this.sensitivity * 0.1 // sensitivity 0..1 → threshold 0.16..0.06
  }

  update(p: HeadPose, t: number): HeadGesture | null {
    const dy = p.yaw - this.neutral.yaw
    const dp = p.pitch - this.neutral.pitch
    const th = this.threshold
    const mag = Math.max(Math.abs(dy), Math.abs(dp) * 1.4)
    if (mag < th * 0.5) {
      this.armed = true // must return to neutral before the next gesture
      this.candidate = null
      return null
    }
    if (!this.armed || mag < th) return null
    // Camera image is not mirrored: nose moving to image-left means the user turned to their right.
    const g: HeadGesture = Math.abs(dy) >= Math.abs(dp) * 1.4 ? (dy < 0 ? 'right' : 'left') : dp < 0 ? 'up' : 'down'
    if (!this.candidate || this.candidate.g !== g) {
      this.candidate = { g, since: t }
      return null
    }
    if (t - this.candidate.since >= this.dwellMs) {
      this.armed = false
      this.candidate = null
      return g
    }
    return null
  }
}
