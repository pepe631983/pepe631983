export type LanguageOption = {
  code: string
  speechTag: string
  label: string
}

export const LANGUAGES: LanguageOption[] = [
  { code: 'es', speechTag: 'es-ES', label: 'Español' },
  { code: 'en', speechTag: 'en-US', label: 'English' },
  { code: 'fr', speechTag: 'fr-FR', label: 'Français' },
  { code: 'de', speechTag: 'de-DE', label: 'Deutsch' },
  { code: 'it', speechTag: 'it-IT', label: 'Italiano' },
  { code: 'pt', speechTag: 'pt-BR', label: 'Português' },
  { code: 'ja', speechTag: 'ja-JP', label: '日本語' },
  { code: 'ko', speechTag: 'ko-KR', label: '한국어' },
  { code: 'zh', speechTag: 'zh-CN', label: '中文' },
  { code: 'ar', speechTag: 'ar-SA', label: 'العربية' },
  { code: 'ru', speechTag: 'ru-RU', label: 'Русский' },
  { code: 'hi', speechTag: 'hi-IN', label: 'हिन्दी' },
]

export function speechTagForCode(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.speechTag ?? 'en-US'
}

export function labelForCode(code: string): string {
  return LANGUAGES.find((l) => l.code === code)?.label ?? code
}

export function dualSpeechTag(codeA: string, codeB: string): string {
  const tags = [speechTagForCode(codeA), speechTagForCode(codeB)]
  tags.sort((a, b) => {
    if (a.startsWith('en')) return -1
    if (b.startsWith('en')) return 1
    return 0
  })
  return tags.join(',')
}
