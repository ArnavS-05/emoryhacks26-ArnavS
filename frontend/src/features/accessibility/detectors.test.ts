import { describe, expect, it } from 'vitest'
import { BlinkDetector, HeadGestureDetector, calibrateBlinkThreshold } from './detectors'

const feed = (d: BlinkDetector, frames: [number, number][]) => frames.map(([s, t]) => d.update(s, t)).filter(Boolean)

describe('BlinkDetector', () => {
  const cfg = { threshold: 0.5, holdMs: 400, cooldownMs: 1000 }

  it('ignores ordinary short blinks', () => {
    const d = new BlinkDetector(cfg)
    const out = feed(d, [[0.1, 0], [0.8, 33], [0.8, 66], [0.8, 150], [0.1, 180], [0.1, 220]])
    expect(out).toEqual([])
  })

  it('selects on a deliberate hold, once per closure', () => {
    const d = new BlinkDetector(cfg)
    const frames: [number, number][] = []
    for (let t = 0; t <= 900; t += 33) frames.push([0.9, t])
    frames.push([0.1, 933])
    expect(feed(d, frames)).toEqual(['select'])
  })

  it('reports near-misses as rejected (for adaptive tuning)', () => {
    const d = new BlinkDetector(cfg)
    expect(feed(d, [[0.9, 0], [0.9, 300], [0.1, 300 + 1]])).toEqual(['rejected'])
  })

  it('enforces cooldown between selections', () => {
    const d = new BlinkDetector(cfg)
    const a = feed(d, [[0.9, 0], [0.9, 420], [0.1, 450]])
    const b = feed(d, [[0.9, 500], [0.9, 950], [0.1, 980]]) // within 1000ms cooldown of first fire at 420
    const c = feed(d, [[0.9, 1500], [0.9, 1950], [0.1, 1990]])
    expect(a).toEqual(['select'])
    expect(b).toEqual([])
    expect(c).toEqual(['select'])
  })

  it('hysteresis: flicker around threshold does not reset the hold', () => {
    const d = new BlinkDetector(cfg)
    expect(feed(d, [[0.9, 0], [0.45, 200], [0.9, 300], [0.9, 410]])).toEqual(['select'])
  })
})

describe('calibrateBlinkThreshold', () => {
  it('sits between open and closed means', () => {
    expect(calibrateBlinkThreshold([0.05, 0.1], [0.85, 0.95])).toBeCloseTo(0.49, 1)
  })
  it('is conservative when separation is weak', () => {
    expect(calibrateBlinkThreshold([0.3], [0.35])).toBeGreaterThanOrEqual(0.3)
  })
})

describe('HeadGestureDetector', () => {
  it('requires dwell and return-to-neutral', () => {
    const h = new HeadGestureDetector(0.5, 300)
    h.calibrate([{ yaw: 0, pitch: 0 }])
    expect(h.update({ yaw: -0.2, pitch: 0 }, 0)).toBeNull()
    expect(h.update({ yaw: -0.2, pitch: 0 }, 310)).toBe('right')
    expect(h.update({ yaw: -0.2, pitch: 0 }, 700)).toBeNull() // still turned: not re-armed
    h.update({ yaw: 0, pitch: 0 }, 800)
    h.update({ yaw: 0, pitch: 0.2 }, 900)
    expect(h.update({ yaw: 0, pitch: 0.2 }, 1250)).toBe('down')
  })
})
