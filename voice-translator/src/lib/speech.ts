import { speechTagForCode } from './languages'

let voicesCache: SpeechSynthesisVoice[] = []
let keepAliveTimer: number | null = null
let audioContext: AudioContext | null = null

function refreshVoices(): SpeechSynthesisVoice[] {
  voicesCache = window.speechSynthesis.getVoices()
  return voicesCache
}

if (typeof window !== 'undefined') {
  refreshVoices()
  window.speechSynthesis.onvoiceschanged = () => {
    refreshVoices()
  }
}

/** Desbloquea audio/TTS en el mismo gesto del usuario (clic en Iniciar). */
export function unlockAudioForSession(): void {
  primeSpeechSynthesis()

  try {
    if (!audioContext) {
      audioContext = new AudioContext()
    }
    void audioContext.resume()
  } catch {
    /* ignore */
  }

  const synth = window.speechSynthesis
  const warmup = new SpeechSynthesisUtterance(' ')
  warmup.volume = 0.01
  warmup.rate = 10
  synth.speak(warmup)
}

export function primeSpeechSynthesis(): void {
  const synth = window.speechSynthesis
  refreshVoices()
  if (synth.paused) synth.resume()
}

/** Evita que Chrome congele la cola de speechSynthesis durante sesiones largas. */
export function startSpeechKeepAlive(): void {
  stopSpeechKeepAlive()
  keepAliveTimer = window.setInterval(() => {
    const synth = window.speechSynthesis
    if (synth.speaking) {
      synth.pause()
      synth.resume()
    }
  }, 4000)
}

export function stopSpeechKeepAlive(): void {
  if (keepAliveTimer !== null) {
    window.clearInterval(keepAliveTimer)
    keepAliveTimer = null
  }
}

function voiceForLang(langCode: string): SpeechSynthesisVoice | undefined {
  const tag = speechTagForCode(langCode)
  const prefix = tag.split('-')[0]?.toLowerCase()
  const voices = voicesCache.length ? voicesCache : refreshVoices()

  const local = voices.filter((v) => v.localService)
  const pool = local.length ? local : voices

  return (
    pool.find((v) => v.lang.toLowerCase() === tag.toLowerCase()) ??
    pool.find((v) => v.lang.toLowerCase().startsWith(`${prefix}-`)) ??
    pool.find((v) => v.lang.toLowerCase().startsWith(prefix ?? '')) ??
    pool.find((v) => v.name.toLowerCase().includes(prefix ?? ''))
  )
}

export function speakTranslationText(
  text: string,
  langCode: string,
  onDone?: () => void,
): boolean {
  const trimmed = text.trim()
  if (!trimmed) {
    onDone?.()
    return false
  }

  primeSpeechSynthesis()

  const synth = window.speechSynthesis
  synth.cancel()

  const utterance = new SpeechSynthesisUtterance(trimmed)
  utterance.lang = speechTagForCode(langCode)
  utterance.rate = 0.95
  utterance.volume = 1
  const voice = voiceForLang(langCode)
  if (voice) utterance.voice = voice

  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    onDone?.()
  }
  utterance.onend = finish
  utterance.onerror = finish

  synth.speak(utterance)
  return true
}

const SPEAK_PREF_KEY = 'pawa.speakTranslation.v2'

export function loadSpeakPreference(): boolean {
  try {
    const raw = localStorage.getItem(SPEAK_PREF_KEY)
    if (raw === null) return true
    return raw === '1'
  } catch {
    return true
  }
}

export function saveSpeakPreference(enabled: boolean): void {
  try {
    localStorage.setItem(SPEAK_PREF_KEY, enabled ? '1' : '0')
  } catch {
    /* ignore */
  }
}
