import { useCallback, useEffect, useRef, useState } from 'react'
import { detectBetween, resolveTranslationPair } from '../lib/detectLanguage'
import { dualSpeechTag, speechTagForCode } from '../lib/languages'
import { speakTranslationText } from '../lib/speech'
import { translateText } from '../lib/translate'

export type TranslationSegment = {
  id: string
  original: string
  translated: string
  fromLang: string
  toLang: string
  isFinal: boolean
}

function getSpeechRecognitionCtor():
  | (new () => SpeechRecognition)
  | undefined {
  if (typeof window === 'undefined') return undefined
  return window.SpeechRecognition ?? window.webkitSpeechRecognition
}

function normalizePhrase(text: string): string {
  return text.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function useRealtimeVoiceTranslation(
  langA: string,
  langB: string,
  autoDetect: boolean,
  speakTranslation: boolean,
) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [interimOriginal, setInterimOriginal] = useState('')
  const [interimTranslated, setInterimTranslated] = useState('')
  const [activeFrom, setActiveFrom] = useState(langA)
  const [activeTo, setActiveTo] = useState(langB)
  const [segments, setSegments] = useState<TranslationSegment[]>([])

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const shouldRestartRef = useRef(false)
  const translateRequestRef = useRef(0)
  const debounceRef = useRef<number | null>(null)
  const lastFromRef = useRef(langA)
  const lastFinalPhraseRef = useRef('')
  const lastSpokenKeyRef = useRef('')
  const speakTranslationRef = useRef(speakTranslation)

  useEffect(() => {
    speakTranslationRef.current = speakTranslation
  }, [speakTranslation])

  const recognitionLang = autoDetect
    ? dualSpeechTag(langA, langB)
    : speechTagForCode(langA)

  const resumeAfterSpeech = useCallback(() => {
    if (!shouldRestartRef.current) return
    const recognition = recognitionRef.current
    if (!recognition) return
    try {
      recognition.lang = recognitionLang
      recognition.start()
    } catch {
      /* onend handler will retry */
    }
  }, [recognitionLang])

  const speak = useCallback(
    (text: string, langCode: string, original: string) => {
      if (!speakTranslationRef.current || !text.trim()) return

      const speakKey = `${normalizePhrase(original)}|${normalizePhrase(text)}`
      if (speakKey === lastSpokenKeyRef.current) return
      lastSpokenKeyRef.current = speakKey

      recognitionRef.current?.stop()

      speakTranslationText(text, langCode, () => {
        window.setTimeout(() => resumeAfterSpeech(), 200)
      })
    },
    [resumeAfterSpeech],
  )

  const pickLanguages = useCallback(
    (text: string) => {
      if (!autoDetect) {
        return { from: langA, to: langB }
      }
      const pair = resolveTranslationPair(text, langA, langB, lastFromRef.current)
      if (detectBetween(text, langA, langB)) {
        lastFromRef.current = pair.from
      }
      return pair
    },
    [autoDetect, langA, langB],
  )

  const runTranslation = useCallback(
    async (text: string, isFinal: boolean) => {
      const trimmed = text.trim()
      if (!trimmed) {
        if (isFinal) {
          setInterimOriginal('')
          setInterimTranslated('')
        }
        return
      }

      const { from, to } = pickLanguages(trimmed)
      setActiveFrom(from)
      setActiveTo(to)
      setInterimOriginal(trimmed)

      const requestId = ++translateRequestRef.current

      try {
        const translated = await translateText(trimmed, from, to)
        if (requestId !== translateRequestRef.current) return

        setInterimTranslated(translated)

        if (!isFinal) return

        const normalized = normalizePhrase(trimmed)
        const isDuplicate = normalized === lastFinalPhraseRef.current
        lastFinalPhraseRef.current = normalized

        setInterimOriginal('')
        setInterimTranslated('')

        if (isDuplicate) return

        setSegments((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            original: trimmed,
            translated,
            fromLang: from,
            toLang: to,
            isFinal: true,
          },
        ])
        speak(translated, to, trimmed)
      } catch (e) {
        if (requestId !== translateRequestRef.current) return
        setError(e instanceof Error ? e.message : 'Error de traducción')
      }
    },
    [pickLanguages, speak],
  )

  const scheduleInterimTranslation = useCallback(
    (text: string) => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
      }
      debounceRef.current = window.setTimeout(() => {
        void runTranslation(text, false)
      }, 400)
    },
    [runTranslation],
  )

  const stop = useCallback(() => {
    shouldRestartRef.current = false
    setListening(false)
    recognitionRef.current?.stop()
  }, [])

  const start = useCallback(() => {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setSupported(false)
      setError(
        'Tu navegador no soporta reconocimiento de voz. Prueba Chrome o Edge.',
      )
      return
    }

    setError(null)
    shouldRestartRef.current = true
    lastFromRef.current = langA
    lastFinalPhraseRef.current = ''
    lastSpokenKeyRef.current = ''
    setActiveFrom(langA)
    setActiveTo(langB)
    setInterimOriginal('')
    setInterimTranslated('')

    const recognition = new Ctor()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = recognitionLang
    recognition.maxAlternatives = 1

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = ''
      let finalChunk = ''

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i]
        const transcript = result[0]?.transcript ?? ''
        if (result.isFinal) {
          finalChunk += transcript
        } else {
          interim += transcript
        }
      }

      if (finalChunk.trim()) {
        void runTranslation(finalChunk, true)
      } else if (interim.trim()) {
        scheduleInterimTranslation(interim)
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      setError(`Reconocimiento: ${event.error}`)
      if (event.error === 'not-allowed') {
        shouldRestartRef.current = false
        setListening(false)
      }
    }

    recognition.onend = () => {
      if (shouldRestartRef.current) {
        try {
          recognition.lang = recognitionLang
          recognition.start()
        } catch {
          setListening(false)
        }
      } else {
        setListening(false)
      }
    }

    recognitionRef.current = recognition

    try {
      recognition.start()
      setListening(true)
    } catch {
      setError('No se pudo iniciar el micrófono')
      setListening(false)
    }
  }, [langA, langB, recognitionLang, runTranslation, scheduleInterimTranslation])

  useEffect(() => {
    setSupported(!!getSpeechRecognitionCtor())
  }, [])

  useEffect(() => {
    if (recognitionRef.current) {
      recognitionRef.current.lang = recognitionLang
    }
    if (!listening) {
      lastFromRef.current = langA
      setActiveFrom(langA)
      setActiveTo(langB)
    }
  }, [langA, langB, recognitionLang, listening])

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current)
      }
      recognitionRef.current?.abort()
      window.speechSynthesis.cancel()
    }
  }, [])

  const clearHistory = useCallback(() => {
    setSegments([])
    setInterimOriginal('')
    setInterimTranslated('')
    lastFinalPhraseRef.current = ''
    lastSpokenKeyRef.current = ''
  }, [])

  return {
    listening,
    supported,
    error,
    interimOriginal,
    interimTranslated,
    activeFrom,
    activeTo,
    segments,
    start,
    stop,
    clearHistory,
    setError,
  }
}
