type MyMemoryResponse = {
  responseData?: { translatedText?: string }
  matches?: { translation?: string }[]
}

export async function translateWithMyMemory(
  text: string,
  from: string,
  to: string,
): Promise<string> {
  const params = new URLSearchParams({
    q: text,
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

  if (/^MYMEMORY WARNING/i.test(translated)) {
    throw new Error('Límite de MyMemory alcanzado. Usa traducción natural (Gemini).')
  }

  return translated
}
