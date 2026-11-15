const LOCALES: Record<string, string> = { en: 'en-US', es: 'es-ES', fr: 'fr-FR', hi: 'hi-IN', zh: 'zh-CN' }

export function locale(lang: string) {
  return LOCALES[lang] ?? lang
}

export function speechAvailable() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/** Speak text aloud with the browser's speech synthesis. Resolves when finished (or immediately if unavailable). */
export function speak(text: string, lang = 'en', rate = 0.95): Promise<boolean> {
  return new Promise((resolve) => {
    if (!speechAvailable()) return resolve(false)
    const synth = window.speechSynthesis
    synth.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = locale(lang)
    u.rate = rate
    const voice = synth.getVoices().find((v) => v.lang === u.lang) ?? synth.getVoices().find((v) => v.lang.startsWith(lang))
    if (voice) u.voice = voice
    u.onend = () => resolve(true)
    u.onerror = () => resolve(false)
    synth.speak(u)
    // Some browsers never fire onend; don't block the UI.
    setTimeout(() => resolve(true), Math.max(2500, text.length * 75))
  })
}

export function stopSpeaking() {
  if (speechAvailable()) window.speechSynthesis.cancel()
}

/** Audible alarm for urgent help that works without any network or AI service. */
export function playAlarm(durationMs = 2400) {
  try {
    const Ctx = window.AudioContext || (window as any).webkitAudioContext
    const ctx = new Ctx()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'square'
    osc.connect(gain)
    gain.connect(ctx.destination)
    gain.gain.value = 0.08
    const t = ctx.currentTime
    for (let i = 0; i < durationMs / 300; i++) osc.frequency.setValueAtTime(i % 2 ? 660 : 880, t + i * 0.3)
    osc.start()
    osc.stop(t + durationMs / 1000)
    osc.onended = () => ctx.close()
  } catch { /* audio unavailable */ }
}

export function chime() {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 740
    gain.gain.setValueAtTime(0.06, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35)
    osc.start()
    osc.stop(ctx.currentTime + 0.36)
    osc.onended = () => ctx.close()
  } catch { /* ignore */ }
}
