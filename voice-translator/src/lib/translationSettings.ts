export type TranslationEngine = 'mymemory' | 'gemini'

const ENGINE_KEY = 'pawa.translation.engine'
const GEMINI_KEY = 'pawa.translation.geminiKey'

export function loadTranslationEngine(): TranslationEngine {
  try {
    const raw = localStorage.getItem(ENGINE_KEY)
    if (raw === 'mymemory' || raw === 'gemini') return raw
    return 'gemini'
  } catch {
    return 'gemini'
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

export function hasNaturalTranslation(): boolean {
  return loadTranslationEngine() === 'gemini' && loadGeminiApiKey().length > 8
}
