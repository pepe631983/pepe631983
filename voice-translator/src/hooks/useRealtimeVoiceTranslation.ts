import { useCallback, useEffect, useRef, useState } from 'react'
import {
  fixEnEsDirection,
  resolveTranslationPair,
} from '../lib/detectLanguage'
import { dualSpeechTag, speechTagForCode } from '../lib/languages'
import {
  speakTranslationText,
  startSpeechKeepAlive,
  stopSpeechKeepAlive,
} from '../lib/speech'
import { buildTranslationContext, translateText } from '../lib/translate'

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
  conversationMode: boolean,
) {
  const [listening, setListening] = useState(false)
  const [supported, setSupported] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [interimOriginal, setInterimOriginal] = useState('')
  const [interimTranslated, setInterimTranslated] = useState('')
  const [activeFrom, setActiveFrom] = useState(langA)
  const [activeTo, setActiveTo] = useState(langB)
  const [segments, setSegments] = useState<TranslationSegment[]>([])
  const segmentsRef = useRef<TranslationSegment[]>([])

  const recognitionRef = useRef<SpeechRecognition | null>(null)
  const shouldRestartRef = useRef(false)
  const pausingForTtsRef = useRef(false)
  const interimRunIdRef = useRef(0)
  const finalRunIdRef = useRef(0)
  const debounceRef = useRef<number | null>(null)
  const interimFinalizeRef = useRef<number | null>(null)
  const latestInterimRef = useRef('')
  const conversationModeRef = useRef(conversationMode)
  const lastFromRef = useRef(langA)
  const lastFinalPhraseRef = useRef('')
  const lastSpokenKeyRef = useRef('')
  const speakTranslationRef = useRef(speakTranslation)

  useEffect(() => {
    speakTranslationRef.current = speakTranslation
  }, [speakTranslation])

  useEffect(() => {
    conversationModeRef.current = conversationMode
  }, [conversationMode])

  useEffect(() => {
    segmentsRef.current = segments
  }, [segments])

  const recognitionLang = autoDetect
    ? dualSpeechTag(langA, langB)
    : speechTagForCode(langA)

  const resumeListening = useCallback(() => {
    if (!shouldRestartRef.current || pausingForTtsRef.current) return
    const recognition = recognitionRef.current
    if (!recognition) return
    try {
      recognition.lang = recognitionLang
      recognition.start()
    } catch {
      /* onend reintentará */
    }
  }, [recognitionLang])

  const speak = useCallback(
    (text: string, langCode: string, original: string) => {
      if (!speakTranslationRef.current || !text.trim()) return

      const speakKey = `${normalizePhrase(original)}|${normalizePhrase(text)}`
      if (speakKey === lastSpokenKeyRef.current) return
      lastSpokenKeyRef.current = speakKey

      pausingForTtsRef.current = true
      try {
        recognitionRef.current?.stop()
      } catch {
        /* ignore */
      }

      speakTranslationText(text, langCode, () => {
        pausingForTtsRef.current = false
        window.setTimeout(() => resumeListening(), 250)
      })
    },
    [resumeListening],
  )

  const pickLanguages = useCallback(
    (text: string) => {
      const smartDirection = autoDetect || conversationMode
      if (!smartDirection) {
        return { from: langA, to: langB }
      }
      const pair = resolveTranslationPair(text, langA, langB, lastFromRef.current)
      lastFromRef.current = pair.from
      return pair
    },
    [autoDetect, conversationMode, langA, langB],
  )

  const cancelInterimWork = useCallback(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    interimRunIdRef.current += 1
  }, [])

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

      if (isFinal) {
        cancelInterimWork()
      }

      const runId = isFinal
        ? ++finalRunIdRef.current
        : ++interimRunIdRef.current

      let { from, to } = pickLanguages(trimmed)
      setActiveFrom(from)
      setActiveTo(to)
      setInterimOriginal(trimmed)

      try {
        let translated = await translateText(trimmed, from, to, {
          fastPreview: !isFinal,
          context: isFinal
            ? buildTranslationContext(segmentsRef.current)
            : undefined,
        })

        const fixed = fixEnEsDirection(
          trimmed,
          translated,
          from,
          to,
          langA,
          langB,
        )
        if (fixed.needsRetranslate) {
          from = fixed.from
          to = fixed.to
          setActiveFrom(from)
          setActiveTo(to)
          translated = await translateText(trimmed, from, to, {
            fastPreview: !isFinal,
            context: isFinal
              ? buildTranslationContext(segmentsRef.current)
              : undefined,
          })
        }

        if (isFinal) {
          if (runId !== finalRunIdRef.current) return

          setInterimTranslated(translated)

          const normalized = normalizePhrase(trimmed)
          const isDuplicate = normalized === lastFinalPhraseRef.current
          lastFinalPhraseRef.current = normalized

          if (!isDuplicate) {
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
          }

          speak(translated, to, trimmed)

          setInterimOriginal('')
          setInterimTranslated('')
        } else {
          if (runId !== interimRunIdRef.current) return
          setInterimTranslated(translated)
        }
      } catch (e) {
        if (isFinal && runId !== finalRunIdRef.current) return
        if (!isFinal && runId !== interimRunIdRef.current) return
        setError(e instanceof Error ? e.message : 'Error de traducción')
      }
    },
    [cancelInterimWork, pickLanguages, speak],
  )

  const clearInterimFinalize = useCallback(() => {
    if (interimFinalizeRef.current !== null) {
      window.clearTimeout(interimFinalizeRef.current)
      interimFinalizeRef.current = null
    }
  }, [])

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

  const scheduleInterimFinalize = useCallback(() => {
    if (!conversationModeRef.current) return
    clearInterimFinalize()
    interimFinalizeRef.current = window.setTimeout(() => {
      const trimmed = latestInterimRef.current.trim()
      if (trimmed.length >= 2) {
        void runTranslation(trimmed, true)
      }
    }, 1400)
  }, [clearInterimFinalize, runTranslation])

  const stop = useCallback(() => {
    shouldRestartRef.current = false
    pausingForTtsRef.current = false
    setListening(false)
    stopSpeechKeepAlive()
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
    pausingForTtsRef.current = false
    lastFromRef.current = langA
    lastFinalPhraseRef.current = ''
    lastSpokenKeyRef.current = ''
    latestInterimRef.current = ''
    setActiveFrom(langA)
    setActiveTo(langB)
    setInterimOriginal('')
    setInterimTranslated('')
    startSpeechKeepAlive()

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
        clearInterimFinalize()
        void runTranslation(finalChunk, true)
      } else if (interim.trim()) {
        latestInterimRef.current = interim
        setInterimOriginal(interim)
        scheduleInterimTranslation(interim)
        scheduleInterimFinalize()
      }
    }

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === 'no-speech' || event.error === 'aborted') return
      setError(`Reconocimiento: ${event.error}`)
      if (event.error === 'not-allowed') {
        shouldRestartRef.current = false
        setListening(false)
        stopSpeechKeepAlive()
      }
    }

    recognition.onend = () => {
      if (pausingForTtsRef.current) return
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
      stopSpeechKeepAlive()
    }
  }, [
    langA,
    langB,
    recognitionLang,
    runTranslation,
    scheduleInterimTranslation,
    scheduleInterimFinalize,
    clearInterimFinalize,
  ])

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
      clearInterimFinalize()
      stopSpeechKeepAlive()
      recognitionRef.current?.abort()
      window.speechSynthesis.cancel()
    }
  }, [clearInterimFinalize])

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
