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
  /\b(the|and|you|are|is|am|was|were|hello|what|how|please|thanks|thank|yes|yeah|no|not|my|your|this|that|have|has|can|will|with|for|from|about|don't|i'm|it's|we|they|she|he|good|morning|night|see|time|today|tomorrow|where|when|who|why|speak|english|help|need|want|like|know|think|going|right|okay|ok|well|very|much|nice|meet|sorry|excuse|listen|understand|mean|tell|ask|work|live|here|there|name|call|phone|money|food|water|house|car|job|school|friend|family|love|happy|bad|great|fine|sure|maybe|because|before|after|always|never|sometimes|people|person|world|country|city|year|week|day|hour|minute|left|back|come|go|get|make|take|give|find|look|use|try|start|stop|wait|stay|walk|run|eat|drink|sleep|read|write|play|buy|sell|pay|cost|price|free|open|close|door|room|table|chair|phone|computer|internet|email|message|question|answer|problem|idea|number|part|place|thing|way|lot|little|more|less|most|best|worst|new|old|young|big|small|long|short|high|low|hot|cold|fast|slow|easy|hard|true|false|real|wrong|same|different|other|another|each|every|all|some|any|many|few|both|either|neither|own|just|only|also|still|already|yet|again|once|twice|now|then|soon|later|early|late|maybe|perhaps|probably|definitely|absolutely|exactly|almost|enough|too|so|such|quite|rather|pretty|really|actually|basically|simply|clearly|obviously|seriously|literally|honestly|obviously)\b/gi

const ES_MARKERS =
  /\b(el|la|los|las|un|una|unos|unas|que|qué|como|cómo|hola|gracias|por|para|está|estoy|estás|tengo|tiene|soy|eres|somos|muy|bien|mal|día|noche|hoy|mañana|dónde|donde|cuando|cuándo|quién|quien|porqué|porque|hablar|español|espanol|ayuda|necesito|quiero|puedo|también|tambien|pero|con|sin|del|al|yo|tú|tu|él|ella|nosotros|ellos|favor|señor|senor|señora|senora|buenos|buenas|tardes|noches|adiós|adios|perdón|perdon|disculpa|entender|escuchar|decir|preguntar|trabajo|casa|comida|agua|dinero|amigo|familia|amor|feliz|triste|grande|pequeño|pequeno|nuevo|viejo|mucho|poco|todo|nada|algo|alguien|nadie|siempre|nunca|ahora|después|despues|antes|aquí|aqui|allí|alli|donde|quien|cual|cuales|estamos|están|estan|hacer|tener|ser|ir|ver|dar|saber|poder|deber|poner|salir|venir|llegar|pasar|quedar|haber|leer|escribir|comprar|vender|pagar|precio|gratis|abierto|cerrado|puerta|mesa|silla|teléfono|telefono|ordenador|correo|mensaje|pregunta|respuesta|problema|idea|número|numero|parte|lugar|cosa|forma|mundo|país|pais|ciudad|año|ano|semana|hora|minuto|persona|gente|mismo|misma|otro|otra|todos|todas|algunos|algunas|muchos|muchas|pocos|pocas|mejor|peor|verdad|falso|real|claro|seguro|tal|vez|quizá|quiza|todavia|todavía|solo|sólo|solamente|además|ademas|aun|aún|otra|vez|pronto|tarde|temprano|rapido|rápido|lento|facil|fácil|difícil|dificil|caliente|frío|frio|alto|bajo|largo|corto|cerca|lejos|dentro|fuera|arriba|abajo|delante|detrás|detras|junto|conmigo|contigo|consigo|nos|les|os|me|te|se|lo|le|les|mi|mis|su|sus|nuestro|vuestra|este|esta|estos|estas|ese|esa|esos|esas|aquel|aquella|aquellos|aquellas)\b/gi

function countMatches(text: string, pattern: RegExp): number {
  return [...text.matchAll(pattern)].length
}

function codeInPair(code: string, langA: string, langB: string): boolean {
  return code === langA || code === langB
}

export function looksLikelyEnglish(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/[ñáéíóúü¿¡]/i.test(trimmed)) return false

  const en = countMatches(trimmed, EN_MARKERS)
  const es = countMatches(trimmed, ES_MARKERS)
  if (en > es) return true
  if (es > 0) return false

  return (
    /^[a-z0-9\s'.,!?@#$%-]+$/i.test(trimmed) &&
    trimmed.split(/\s+/).filter(Boolean).length >= 1
  )
}

export function looksLikelySpanish(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (/[ñáéíóúü¿¡]/i.test(trimmed)) return true

  const es = countMatches(trimmed, ES_MARKERS)
  const en = countMatches(trimmed, EN_MARKERS)
  return es > en && es > 0
}

function heuristicBetween(
  text: string,
  langA: string,
  langB: string,
): string | null {
  if (!text.trim()) return null

  const scores: Record<string, number> = { [langA]: 0, [langB]: 0 }

  if (codeInPair('en', langA, langB)) {
    scores.en = (scores.en ?? 0) + countMatches(text, EN_MARKERS) * 2
    if (looksLikelyEnglish(text)) scores.en = (scores.en ?? 0) + 2
  }
  if (codeInPair('es', langA, langB)) {
    scores.es = (scores.es ?? 0) + countMatches(text, ES_MARKERS) * 2
    if (looksLikelySpanish(text)) scores.es = (scores.es ?? 0) + 2
  }

  if (/[ñáéíóúü¿¡]/i.test(text) && codeInPair('es', langA, langB)) {
    scores.es = (scores.es ?? 0) + 3
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

  if (codeInPair('en', langA, langB) && codeInPair('es', langA, langB)) {
    if (looksLikelyEnglish(trimmed) && !looksLikelySpanish(trimmed)) return 'en'
    if (looksLikelySpanish(trimmed) && !looksLikelyEnglish(trimmed)) return 'es'
  }

  const heuristic = heuristicBetween(trimmed, langA, langB)
  if (heuristic) return heuristic

  if (trimmed.length < 2) return null

  const only = [langA, langB]
    .map((code) => CODE_TO_ISO3[code])
    .filter((iso3): iso3 is string => Boolean(iso3))

  if (only.length < 2) return null

  const iso3 = franc(trimmed, { minLength: 2, only })
  if (iso3 !== 'und') {
    const fromFranc = ISO3_TO_CODE[iso3] ?? null
    if (fromFranc === langA || fromFranc === langB) return fromFranc
  }

  return null
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

  if (codeInPair('en', langA, langB) && codeInPair('es', langA, langB)) {
    if (looksLikelyEnglish(text)) {
      return langA === 'en'
        ? { from: langA, to: langB }
        : { from: langB, to: langA }
    }
    if (looksLikelySpanish(text)) {
      return langA === 'es'
        ? { from: langA, to: langB }
        : { from: langB, to: langA }
    }
  }

  const from = lastFrom === langA || lastFrom === langB ? lastFrom : langA
  return { from, to: from === langA ? langB : langA }
}
