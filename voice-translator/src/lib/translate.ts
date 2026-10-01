type MyMemoryResponse = {
  responseData?: { translatedText?: string }
  responseStatus?: number
  quotaFinished?: boolean
  matches?: { translation?: string }[]
}

const cache = new Map<string, string>()

function cacheKey(text: string, from: string, to: string): string {
  return `${from}|${to}|${text.trim().toLowerCase()}`
}

export async function translateText(
  text: string,
  from: string,
  to: string,
): Promise<string> {
  const trimmed = text.trim()
  if (!trimmed || from === to) return trimmed

  const key = cacheKey(trimmed, from, to)
  const cached = cache.get(key)
  if (cached) return cached

  const params = new URLSearchParams({
    q: trimmed,
    langpair: `${from}|${to}`,
  })

  const base = import.meta.env.DEV
    ? `/api/translate?${params.toString()}`
    : `https://api.mymemory.translated.net/get?${params.toString()}`

  const res = await fetch(base)
  if (!res.ok) {
    throw new Error(`Traducción fallida (${res.status})`)
  }

  const data = (await res.json()) as MyMemoryResponse
  const translated =
    data.responseData?.translatedText?.trim() ||
    data.matches?.[0]?.translation?.trim()

  if (!translated) {
    throw new Error('No se recibió traducción')
  }

  cache.set(key, translated)
  return translated
}
