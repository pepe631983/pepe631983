import {
  loadBackendUrl,
  loadGeminiApiKey,
  loadTranslationEngine,
} from './translationSettings'
import { translateViaBackend } from './translateBackend'
import { translateWithGemini } from './translateGemini'
import { translateWithMyMemory } from './translateMyMemory'

export type TranslateOptions = {
  fastPreview?: boolean
  context?: string
}

const cache = new Map<string, string>()

function cacheKey(
  text: string,
  from: string,
  to: string,
  mode: string,
): string {
  return `${mode}|${from}|${to}|${text.trim().toLowerCase()}`
}

export async function translateText(
  text: string,
  from: string,
  to: string,
  options: TranslateOptions = {},
): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed || from === to) return trimmed

  const engine = loadTranslationEngine()
  const backendUrl = loadBackendUrl()
  const geminiKey = loadGeminiApiKey()

  let mode: string
  if (engine === 'cloud' && backendUrl.startsWith('https://') && !options.fastPreview) {
    mode = 'cloud'
  } else if (engine === 'gemini' && geminiKey.length > 8 && !options.fastPreview) {
    mode = 'gemini'
  } else {
    mode = 'mymemory'
  }

  const key = cacheKey(trimmed, from, to, mode)
  const cached = cache.get(key)
  if (cached) return cached

  let translated: string

  if (mode === 'cloud') {
    try {
      const result = await translateViaBackend(backendUrl, trimmed, from, to)
      translated = result.translated
    } catch {
      translated = await translateWithMyMemory(trimmed, from, to)
    }
  } else if (mode === 'gemini') {
    try {
      translated = await translateWithGemini(
        trimmed,
        from,
        to,
        geminiKey,
        options.context,
      )
    } catch {
      translated = await translateWithMyMemory(trimmed, from, to)
    }
  } else {
    translated = await translateWithMyMemory(trimmed, from, to)
  }

  cache.set(key, translated)
  return translated
}

export function buildTranslationContext(
  segments: {
    original: string
    translated: string
    fromLang: string
    toLang: string
  }[],
  maxItems = 3,
): string | undefined {
  if (segments.length === 0) return undefined
  return segments
    .slice(-maxItems)
    .map(
      (s) =>
        `(${s.fromLang}→${s.toLang}) «${s.original}» → «${s.translated}»`,
    )
    .join('\n')
}
