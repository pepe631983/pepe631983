/** Voz sintética solo cuando se habla español; inglés captado → solo texto. */
export function shouldSpeakCapturedSource(fromLang: string): boolean {
  return fromLang === 'es'
}
