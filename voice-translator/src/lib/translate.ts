import { SUGGESTED_BACKEND_URL } from './defaultBackend'
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

function effectiveBackendUrl(): string {
  const stored = loadBackendUrl()
  if (stored.startsWith('https://')) return stored
  return SUGGESTED_BACKEND_URL
}

async function runTranslationPipeline(
  trimmed: string,
  from: string,
  to: string,
  context: string | undefined,
): Promise<{ text: string; mode: string }> {
  const engine = loadTranslationEngine()
  const backendUrl = effectiveBackendUrl()
  const geminiKey = loadGeminiApiKey()
  const errors: string[] = []

  const tryCloud =
    engine === 'cloud' &&
    backendUrl.startsWith('https://')
  const tryGemini =
    geminiKey.length > 8 &&
    (engine === 'gemini' || engine === 'cloud')

  if (tryCloud) {
    try {
      const result = await translateViaBackend(backendUrl, trimmed, from, to)
      return { text: result.translated, mode: `cloud:${result.engine}` }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'cloud')
    }
  }

  if (tryGemini) {
    try {
      const translated = await translateWithGemini(
        trimmed,
        from,
        to,
        geminiKey,
        context,
      )
      return { text: translated, mode: 'gemini' }
    } catch (e) {
      errors.push(e instanceof Error ? e.message : 'gemini')
    }
  }

  if (engine === 'gemini' && !tryGemini) {
    throw new Error('Configura tu clave API de Gemini en Calidad de traducción.')
  }

  try {
    const translated = await translateWithMyMemory(trimmed, from, to)
    return { text: translated, mode: 'mymemory' }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'MyMemory'
    throw new Error(
      errors.length
        ? `${msg} (tampoco funcionó: ${errors.join('; ')})`
        : msg,
    )
  }
}

export async function translateText(
  text: string,
  from: string,
  to: string,
  options: TranslateOptions = {},
): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed || from === to) return trimmed
  if (options.fastPreview) {
    return translateWithMyMemory(trimmed, from, to)
  }

  const engine = loadTranslationEngine()
  const key = cacheKey(trimmed, from, to, engine)
  const cached = cache.get(key)
  if (cached) return cached

  const preview = await runTranslationPipeline(
    trimmed,
    from,
    to,
    options.context,
  )

  cache.set(key, preview.text)
  return preview.text
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
