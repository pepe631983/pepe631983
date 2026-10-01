import { franc } from 'franc-min'

const CODE_TO_ISO3: Record<string, string> = {
  es: 'spa',
  en: 'eng',
  fr: 'fra',
  de: 'deu',
  it: 'ita',
  pt: 'por',
  ja: 'jpn',
  ko: 'kor',
  zh: 'cmn',
  ar: 'arb',
  ru: 'rus',
  hi: 'hin',
}

const ISO3_TO_CODE: Record<string, string> = Object.fromEntries(
  Object.entries(CODE_TO_ISO3).map(([code, iso3]) => [iso3, code]),
)

export function detectBetween(
  text: string,
  langA: string,
  langB: string,
): string | null {
  const trimmed = text.trim()
  if (trimmed.length < 4) return null

  const only = [langA, langB]
    .map((code) => CODE_TO_ISO3[code])
    .filter((iso3): iso3 is string => Boolean(iso3))

  if (only.length < 2) return null

  const iso3 = franc(trimmed, { minLength: 3, only })
  if (iso3 === 'und') return null

  return ISO3_TO_CODE[iso3] ?? null
}

export function resolveTranslationPair(
  text: string,
  langA: string,
  langB: string,
  lastFrom: string,
): { from: string; to: string } {
  const detected = detectBetween(text, langA, langB)

  if (detected === langA) {
    return { from: langA, to: langB }
  }
  if (detected === langB) {
    return { from: langB, to: langA }
  }

  const from = lastFrom === langA || lastFrom === langB ? lastFrom : langA
  return { from, to: from === langA ? langB : langA }
}
