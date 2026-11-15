import { useEffect, useRef, useState } from 'react'
import { Mic, MicOff } from 'lucide-react'
import { locale } from '../../lib/speech'

/** Residual-speech input: short words matched against on-screen options (browser speech recognition). */
export function VoiceInput({ lang, onPhrase }: { lang: string; onPhrase: (text: string) => void }) {
  const [on, setOn] = useState(false)
  const [heard, setHeard] = useState('')
  const cb = useRef(onPhrase)
  cb.current = onPhrase
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

  useEffect(() => {
    if (!on || !SR) return
    const rec = new SR()
    rec.lang = locale(lang)
    rec.continuous = true
    rec.interimResults = false
    rec.onresult = (e: any) => {
      const r = e.results[e.results.length - 1]
      const text = r[0].transcript.trim()
      setHeard(text)
      cb.current(text)
    }
    rec.onend = () => { try { rec.start() } catch { /* already started */ } }
    rec.start()
    return () => { rec.onend = null; rec.stop() }
  }, [on, lang, SR])

  if (!SR) return <div className="rounded-2xl border border-line bg-white/80 p-3 text-sm">Speech recognition isn’t supported in this browser. Use touch, keyboard, or scanning.</div>
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-line bg-white/80 p-3 text-navy">
      <button type="button" onClick={() => setOn((x) => !x)} aria-pressed={on}
        className={`inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold ${on ? 'bg-teal text-white' : 'bg-navy text-white'}`}>
        {on ? <Mic className="size-4" /> : <MicOff className="size-4" />}{on ? 'Listening' : 'Enable voice'}
      </button>
      <div className="text-sm text-navy-500" aria-live="polite">{on ? (heard ? `Heard: “${heard}”` : 'Say an option, “yes”, “no”, or “help”.') : 'Short spoken words select options.'}</div>
    </div>
  )
}
