/** Evita traducir ruido del micrófono o fragmentos demasiado cortos. */

const GARBAGE_PATTERN =
  /^[^a-zA-ZáéíóúüñÁÉÍÓÚÜÑ¿¡]*$|^(um+|uh+|eh+|mm+|hmm+)$/i

export function isTranslatablePhrase(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (trimmed.length < 4) return false

  const words = trimmed.split(/\s+/).filter(Boolean)
  if (words.length < 2 && trimmed.length < 5) return false

  if (GARBAGE_PATTERN.test(trimmed)) return false

  const letters = trimmed.replace(/[^\p{L}]/gu, '')
  if (letters.length < 3) return false

  return true
}
