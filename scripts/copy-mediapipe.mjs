// Copies MediaPipe WASM runtime into frontend/public so blink/head tracking works without a CDN.
import { cpSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'frontend')
const src = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm')
const dst = resolve(root, 'public/mediapipe/wasm')
if (!existsSync(src)) { console.warn('mediapipe wasm not found; skipping'); process.exit(0) }
mkdirSync(dst, { recursive: true })
cpSync(src, dst, { recursive: true })
console.log('copied MediaPipe wasm ->', dst)

// Also cache the Face Landmarker model locally (downloaded once from Google's official model bucket).
const model = resolve(root, 'public/mediapipe/face_landmarker.task')
if (!existsSync(model)) {
  const url = 'https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task'
  try {
    const res = await fetch(url)
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const { writeFileSync } = await import('node:fs')
    writeFileSync(model, Buffer.from(await res.arrayBuffer()))
    console.log('downloaded face_landmarker.task')
  } catch (e) {
    console.warn('could not download face landmarker model (will load from CDN at runtime):', e.message)
  }
}
