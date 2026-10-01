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

const EN_MARKERS =
  /\b(the|and|you|are|is|am|was|were|hello|what|how|please|thanks|thank|yes|yeah|no|not|my|your|this|that|have|has|can|will|with|for|from|about|don't|i'm|it's|we|they|she|he|good|morning|night|see|time|today|tomorrow|where|when|who|why|speak|english|help|need|want|like|know|think|going|right|okay|ok)\b/gi

const ES_MARKERS =
  /\b(el|la|los|las|un|una|unos|unas|que|qué|como|cómo|hola|gracias|por|para|está|estoy|estás|tengo|tiene|soy|eres|somos|muy|bien|mal|día|noche|hoy|mañana|dónde|donde|cuando|cuándo|quién|quien|porqué|porque|hablar|español|espanol|ayuda|necesito|quiero|puedo|también|tambien|pero|con|sin|del|al|yo|tú|tu|él|ella|nosotros|ellos|gracias|favor|señor|senor|señora|senora)\b/gi

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length
}

function heuristicBetween(
  text: string,
  langA: string,
  langB: string,
): string | null {
  if (!text.trim()) return null

  const scores: Record<string, number> = { [langA]: 0, [langB]: 0 }

  if (langA === 'en' || langB === 'en') {
    const enScore = countMatches(text, EN_MARKERS)
    scores.en = (scores.en ?? 0) + enScore * 2
  }
  if (langA === 'es' || langB === 'es') {
    const esScore = countMatches(text, ES_MARKERS)
    scores.es = (scores.es ?? 0) + esScore * 2
  }

  // Tildes and ¿¡ strongly suggest Spanish
  if (/[ñáéíóúü¿¡]/i.test(text)) {
    if (langA === 'es') scores.es = (scores.es ?? 0) + 3
    if (langB === 'es') scores.es = (scores.es ?? 0) + 3
  }

  const aScore = scores[langA] ?? 0
  const bScore = scores[langB] ?? 0
  if (aScore === bScore) return null
  return aScore > bScore ? langA : langB
}

export function detectBetween(
  text: string,
  langA: string,
  langB: string,
): string | null {
  const trimmed = text.trim()
  if (!trimmed) return null

  const heuristic = heuristicBetween(trimmed, langA, langB)
  if (heuristic && countMatches(trimmed, heuristic === 'en' ? EN_MARKERS : ES_MARKERS) >= 1) {
    return heuristic
  }

  if (trimmed.length < 3) return heuristic

  const only = [langA, langB]
    .map((code) => CODE_TO_ISO3[code])
    .filter((iso3): iso3 is string => Boolean(iso3))

  if (only.length < 2) return heuristic

  const iso3 = franc(trimmed, { minLength: 2, only })
  if (iso3 !== 'und') {
    const fromFranc = ISO3_TO_CODE[iso3] ?? null
    if (fromFranc === langA || fromFranc === langB) return fromFranc
  }

  return heuristic
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
