import { useEffect, useRef, useState } from 'react'
import { Camera, CameraOff, Crosshair } from 'lucide-react'
import { BlinkDetector, HeadGestureDetector, calibrateBlinkThreshold, headPose, type HeadGesture, type HeadPose } from './detectors'

type Props = {
  mode: 'blink' | 'head'
  blinkThreshold: number
  blinkHoldMs: number
  headSensitivity: number
  onSelect: () => void
  onHead: (g: HeadGesture) => void
  onBlinkRejected?: () => void
  onCalibrated?: (r: { blinkThreshold?: number }) => void
  compact?: boolean
}

type Landmarker = {
  detectForVideo: (v: HTMLVideoElement, t: number) => {
    faceBlendshapes?: { categories: { categoryName: string; score: number }[] }[]
    faceLandmarks?: { x: number; y: number }[][]
  }
  close: () => void
}

let landmarkerPromise: Promise<Landmarker> | null = null
async function loadLandmarker(): Promise<Landmarker> {
  if (!landmarkerPromise) {
    landmarkerPromise = (async () => {
      const { FilesetResolver, FaceLandmarker } = await import('@mediapipe/tasks-vision')
      const fileset = await FilesetResolver.forVisionTasks('/mediapipe/wasm')
      const opts = (modelAssetPath: string) => ({
        baseOptions: { modelAssetPath, delegate: 'GPU' as const },
        runningMode: 'VIDEO' as const, numFaces: 1, outputFaceBlendshapes: true,
      })
      try {
        return (await FaceLandmarker.createFromOptions(fileset, opts('/mediapipe/face_landmarker.task'))) as unknown as Landmarker
      } catch {
        return (await FaceLandmarker.createFromOptions(fileset, opts(
          'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task',
        ))) as unknown as Landmarker
      }
    })()
    landmarkerPromise.catch(() => { landmarkerPromise = null })
  }
  return landmarkerPromise
}

type Calib = null | { phase: 'open' | 'closed' | 'neutral'; until: number }

/**
 * Local, in-browser face tracking. Video frames never leave the device and are never recorded.
 */
export function FaceInput(p: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<'off' | 'loading' | 'running' | 'no-face' | 'error'>('off')
  const [error, setError] = useState('')
  const [progress, setProgress] = useState(0)
  const [eye, setEye] = useState(0)
  const [lastGesture, setLastGesture] = useState<string>('')
  const [calib, setCalib] = useState<Calib>(null)
  const calibRef = useRef<Calib>(null)
  calibRef.current = calib
  const samples = useRef<{ open: number[]; closed: number[]; poses: HeadPose[] }>({ open: [], closed: [], poses: [] })
  const blink = useRef(new BlinkDetector({ threshold: p.blinkThreshold, holdMs: p.blinkHoldMs, cooldownMs: 1200 }))
  const head = useRef(new HeadGestureDetector(p.headSensitivity))
  const cbs = useRef(p)
  cbs.current = p

  useEffect(() => {
    blink.current.cfg = { threshold: p.blinkThreshold, holdMs: p.blinkHoldMs, cooldownMs: 1200 }
    head.current.sensitivity = p.headSensitivity
  }, [p.blinkThreshold, p.blinkHoldMs, p.headSensitivity])

  useEffect(() => {
    if (!enabled) return
    let stream: MediaStream | null = null
    let raf = 0
    let stopped = false
    let lastVideoTime = -1
    ;(async () => {
      try {
        setStatus('loading')
        stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: 'user' }, audio: false })
        const v = videoRef.current!
        v.srcObject = stream
        await v.play()
        const lm = await loadLandmarker()
        if (stopped) return
        setStatus('running')
        const loop = () => {
          if (stopped) return
          const now = performance.now()
          if (v.currentTime !== lastVideoTime && v.readyState >= 2) {
            lastVideoTime = v.currentTime
            const res = lm.detectForVideo(v, now)
            const cats = res.faceBlendshapes?.[0]?.categories
            const marks = res.faceLandmarks?.[0]
            if (!cats || !marks) setStatus('no-face')
            else {
              setStatus('running')
              const l = cats.find((c) => c.categoryName === 'eyeBlinkLeft')?.score ?? 0
              const r = cats.find((c) => c.categoryName === 'eyeBlinkRight')?.score ?? 0
              const score = Math.min(l, r) // both eyes must close; winks/squints of one eye are ignored
              const pose = headPose(marks)
              setEye(score)
              const c = calibRef.current
              if (c) {
                if (c.phase === 'open') samples.current.open.push(score)
                if (c.phase === 'closed') samples.current.closed.push(score)
                if (c.phase === 'neutral') samples.current.poses.push(pose)
                if (now > c.until) advanceCalibration(c.phase)
              } else if (cbs.current.mode === 'blink') {
                const out = blink.current.update(score, now)
                setProgress(blink.current.progress(now))
                if (out === 'select') cbs.current.onSelect()
                if (out === 'rejected') cbs.current.onBlinkRejected?.()
              } else {
                const g = head.current.update(pose, now)
                if (g) {
                  setLastGesture(g)
                  cbs.current.onHead(g)
                }
              }
            }
          }
          raf = requestAnimationFrame(loop)
        }
        loop()
      } catch (e) {
        setStatus('error')
        setError((e as Error).name === 'NotAllowedError' ? 'Camera permission was denied.' : 'Camera or face tracking unavailable.')
      }
    })()
    return () => {
      stopped = true
      cancelAnimationFrame(raf)
      stream?.getTracks().forEach((t) => t.stop())
      setStatus('off')
    }
  }, [enabled])

  function startCalibration() {
    samples.current = { open: [], closed: [], poses: [] }
    if (p.mode === 'blink') setCalib({ phase: 'open', until: performance.now() + 2500 })
    else setCalib({ phase: 'neutral', until: performance.now() + 2000 })
  }

  function advanceCalibration(phase: 'open' | 'closed' | 'neutral') {
    if (phase === 'open') {
      setCalib({ phase: 'closed', until: performance.now() + 2500 })
      return
    }
    if (phase === 'closed') {
      // Use the most-closed half of samples (user may take a moment to close).
      const closed = [...samples.current.closed].sort((a, b) => b - a).slice(0, Math.ceil(samples.current.closed.length / 2))
      const th = calibrateBlinkThreshold(samples.current.open, closed)
      blink.current.cfg = { ...blink.current.cfg, threshold: th }
      cbs.current.onCalibrated?.({ blinkThreshold: th })
    }
    if (phase === 'neutral') {
      head.current.calibrate(samples.current.poses)
      cbs.current.onCalibrated?.({})
    }
    setCalib(null)
  }

  const calibText = calib?.phase === 'open' ? 'Keep your eyes open and look at the screen…'
    : calib?.phase === 'closed' ? 'Now close both eyes firmly and hold…'
    : calib?.phase === 'neutral' ? 'Hold your head still in a comfortable position…' : ''

  return (
    <div className="rounded-2xl border border-line bg-white/80 p-3 text-navy">
      <div className="flex items-center gap-3">
        <div className="relative h-20 w-28 shrink-0 overflow-hidden rounded-xl bg-navy/90">
          <video ref={videoRef} muted playsInline className={`h-full w-full -scale-x-100 object-cover ${enabled ? '' : 'hidden'}`} aria-label="Camera preview (not recorded)" />
          {!enabled && <CameraOff className="absolute inset-0 m-auto size-8 text-white/60" aria-hidden />}
          {p.mode === 'blink' && progress > 0 && (
            <div className="absolute inset-x-0 bottom-0 h-2 bg-amber" style={{ width: `${progress * 100}%` }} />
          )}
        </div>
        <div className="min-w-0 flex-1 text-sm">
          <div className="font-semibold">{p.mode === 'blink' ? 'Blink selection' : 'Head gestures'}</div>
          <div className="text-navy-500" role="status" aria-live="polite">
            {calib ? calibText
              : status === 'off' ? 'Camera off. Processing stays on this device.'
              : status === 'loading' ? 'Starting face tracking…'
              : status === 'no-face' ? 'Face not detected — adjust position.'
              : status === 'error' ? error
              : p.mode === 'blink' ? `Close both eyes for ${(p.blinkHoldMs / 1000).toFixed(1)}s to select. Eye closure ${Math.round(eye * 100)}%`
              : `Turn left/right to move, nod down to select, look up to go back.${lastGesture ? ` Last: ${lastGesture}` : ''}`}
          </div>
        </div>
        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => setEnabled((x) => !x)}
            className="inline-flex items-center gap-1 rounded-lg bg-navy px-3 py-2 text-sm font-semibold text-white">
            {enabled ? <CameraOff className="size-4" /> : <Camera className="size-4" />}{enabled ? 'Stop' : 'Enable camera'}
          </button>
          {enabled && status !== 'error' && (
            <button type="button" onClick={startCalibration} disabled={!!calib}
              className="inline-flex items-center gap-1 rounded-lg border border-navy px-3 py-2 text-sm font-semibold disabled:opacity-50">
              <Crosshair className="size-4" />Calibrate
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
