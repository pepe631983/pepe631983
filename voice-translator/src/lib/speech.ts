import { speechTagForCode } from './languages'

let voicesCache: SpeechSynthesisVoice[] = []

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

/** Debe llamarse desde un clic del usuario (p. ej. Iniciar) para que Chrome permita TTS. */
export function primeSpeechSynthesis(): void {
  const synth = window.speechSynthesis
  refreshVoices()
  if (synth.paused) synth.resume()
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
): void {
  const trimmed = text.trim()
  if (!trimmed) {
    onDone?.()
    return
  }

  primeSpeechSynthesis()

  const synth = window.speechSynthesis
  synth.cancel()

  const utterance = new SpeechSynthesisUtterance(trimmed)
  utterance.lang = speechTagForCode(langCode)
  utterance.rate = 1
  const voice = voiceForLang(langCode)
  if (voice) utterance.voice = voice

  const finish = () => onDone?.()
  utterance.onend = finish
  utterance.onerror = finish

  window.setTimeout(() => {
    synth.speak(utterance)
  }, 50)
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
