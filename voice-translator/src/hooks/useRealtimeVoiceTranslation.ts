import { useCallback, useEffect, useRef, useState } from 'react'
import { resolveTranslationPair } from '../lib/detectLanguage'
import { dualSpeechTag, speechTagForCode } from '../lib/languages'
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

  const speak = useCallback(
    (text: string, langCode: string) => {
      if (!speakTranslation || !text.trim()) return
      window.speechSynthesis.cancel()
      const utterance = new SpeechSynthesisUtterance(text)
      utterance.lang = speechTagForCode(langCode)
      utterance.rate = 1
      window.speechSynthesis.speak(utterance)
    },
    [speakTranslation],
  )

  const pickLanguages = useCallback(
    (text: string) => {
      if (!autoDetect) {
        return { from: langA, to: langB }
      }
      const pair = resolveTranslationPair(text, langA, langB, lastFromRef.current)
      lastFromRef.current = pair.from
      return pair
    },
    [autoDetect, langA, langB],
  )

  const runTranslation = useCallback(
    async (text: string, isFinal: boolean) => {
      const trimmed = text.trim()
      if (!trimmed) {
        setInterimOriginal('')
        setInterimTranslated('')
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

        if (isFinal) {
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
          setInterimOriginal('')
          setInterimTranslated('')
          speak(translated, to)
        }
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

  const recognitionLang = autoDetect
    ? dualSpeechTag(langA, langB)
    : speechTagForCode(langA)

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
    setActiveFrom(langA)
    setActiveTo(langB)

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
