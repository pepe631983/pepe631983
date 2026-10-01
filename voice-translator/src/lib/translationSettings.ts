import { SUGGESTED_BACKEND_URL } from './defaultBackend'

export type TranslationEngine = 'mymemory' | 'gemini' | 'cloud'

const ENGINE_KEY = 'pawa.translation.engine'
const GEMINI_KEY = 'pawa.translation.geminiKey'
const BACKEND_URL_KEY = 'pawa.translation.backendUrl'

export function loadTranslationEngine(): TranslationEngine {
  try {
    const raw = localStorage.getItem(ENGINE_KEY)
    if (raw === 'mymemory' || raw === 'gemini' || raw === 'cloud') return raw
    return 'cloud'
  } catch {
    return 'cloud'
  }
}

export function saveTranslationEngine(engine: TranslationEngine): void {
  localStorage.setItem(ENGINE_KEY, engine)
}

export function loadGeminiApiKey(): string {
  try {
    return localStorage.getItem(GEMINI_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function saveGeminiApiKey(key: string): void {
  localStorage.setItem(GEMINI_KEY, key.trim())
}

export function loadBackendUrl(): string {
  try {
    return localStorage.getItem(BACKEND_URL_KEY)?.trim() ?? ''
  } catch {
    return ''
  }
}

export function saveBackendUrl(url: string): void {
  localStorage.setItem(BACKEND_URL_KEY, url.trim())
}

export function hasNaturalTranslation(): boolean {
  const engine = loadTranslationEngine()
  if (engine === 'cloud') {
    const url = loadBackendUrl() || SUGGESTED_BACKEND_URL
    return url.startsWith('https://')
  }
  if (engine === 'gemini') {
    return loadGeminiApiKey().length > 8
  }
  return false
}

export function isCloudTranslationReady(): boolean {
  if (loadTranslationEngine() !== 'cloud') return false
  const url = loadBackendUrl() || SUGGESTED_BACKEND_URL
  return url.startsWith('https://')
}
