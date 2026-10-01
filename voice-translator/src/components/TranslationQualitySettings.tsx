import { useState } from 'react'
import {
  hasNaturalTranslation,
  loadGeminiApiKey,
  loadTranslationEngine,
  saveGeminiApiKey,
  saveTranslationEngine,
  type TranslationEngine,
} from '../lib/translationSettings'
import './TranslationQualitySettings.css'

export function TranslationQualitySettings({ disabled }: { disabled: boolean }) {
  const [engine, setEngine] = useState<TranslationEngine>(loadTranslationEngine)
  const [apiKey, setApiKey] = useState(loadGeminiApiKey)
  const [saved, setSaved] = useState(false)

  const persist = (nextEngine: TranslationEngine, key: string) => {
    saveTranslationEngine(nextEngine)
    saveGeminiApiKey(key)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section className="quality card" aria-labelledby="quality-title">
      <h2 id="quality-title">Calidad de traducción</h2>
      <p className="quality-intro">
        Para traducción <strong>fluida y nativa</strong>, usa{' '}
        <strong>Natural (Gemini)</strong>. MyMemory es básica y suele sonar
        literal o incorrecta.
      </p>

      <div className="engine-options">
        <label className="engine-option">
          <input
            type="radio"
            name="engine"
            checked={engine === 'gemini'}
            onChange={() => {
              setEngine('gemini')
              persist('gemini', apiKey)
            }}
            disabled={disabled}
          />
          <span>
            <strong>Natural (Gemini)</strong>
            <small>Recomendado · conversación humana</small>
          </span>
        </label>
        <label className="engine-option">
          <input
            type="radio"
            name="engine"
            checked={engine === 'mymemory'}
            onChange={() => {
              setEngine('mymemory')
              persist('mymemory', apiKey)
            }}
            disabled={disabled}
          />
          <span>
            <strong>Básica (MyMemory)</strong>
            <small>Gratis sin clave · calidad limitada</small>
          </span>
        </label>
      </div>

      {engine === 'gemini' && (
        <label className="field api-key">
          <span>Clave API de Gemini (gratis en Google AI Studio)</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={() => persist('gemini', apiKey)}
            placeholder="AIza..."
            disabled={disabled}
            autoComplete="off"
          />
          <a
            href="https://aistudio.google.com/apikey"
            target="_blank"
            rel="noreferrer"
          >
            Obtener clave API
          </a>
        </label>
      )}

      <p className={`quality-status ${hasNaturalTranslation() ? 'ok' : 'warn'}`}>
        {hasNaturalTranslation()
          ? 'Traducción natural activa (Gemini en frases completas).'
          : engine === 'gemini'
            ? 'Pega tu clave Gemini para activar traducción natural.'
            : 'Modo básico: las frases pueden no sonar naturales.'}
        {saved && ' · Guardado'}
      </p>
    </section>
  )
}
