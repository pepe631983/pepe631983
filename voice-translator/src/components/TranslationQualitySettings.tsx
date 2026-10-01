import { useState } from 'react'
import { SUGGESTED_BACKEND_URL } from '../lib/defaultBackend'
import {
  hasNaturalTranslation,
  isCloudTranslationReady,
  loadBackendUrl,
  loadGeminiApiKey,
  loadTranslationEngine,
  saveBackendUrl,
  saveGeminiApiKey,
  saveTranslationEngine,
  type TranslationEngine,
} from '../lib/translationSettings'
import './TranslationQualitySettings.css'

export function TranslationQualitySettings({ disabled }: { disabled: boolean }) {
  const [engine, setEngine] = useState<TranslationEngine>(loadTranslationEngine)
  const [apiKey, setApiKey] = useState(loadGeminiApiKey)
  const [backendUrl, setBackendUrl] = useState(loadBackendUrl)
  const [saved, setSaved] = useState(false)

  const persist = (
    nextEngine: TranslationEngine,
    key: string,
    url: string,
  ) => {
    saveTranslationEngine(nextEngine)
    saveGeminiApiKey(key)
    saveBackendUrl(url)
    setSaved(true)
    window.setTimeout(() => setSaved(false), 2000)
  }

  return (
    <section className="quality card" aria-labelledby="quality-title">
      <h2 id="quality-title">Calidad de traducción</h2>
      <p className="quality-intro">
        Para traducción <strong>exacta, fluida y nativa</strong>, usa{' '}
        <strong>Nube (DeepL)</strong>: la clave API va en el servidor, no en
        tu móvil.
      </p>

      <div className="engine-options">
        <label className="engine-option">
          <input
            type="radio"
            name="engine"
            checked={engine === 'cloud'}
            onChange={() => {
              setEngine('cloud')
              persist('cloud', apiKey, backendUrl)
            }}
            disabled={disabled}
          />
          <span>
            <strong>Nube (DeepL) — recomendado</strong>
            <small>Natural · clave segura en Cloudflare Worker</small>
          </span>
        </label>
        <label className="engine-option">
          <input
            type="radio"
            name="engine"
            checked={engine === 'gemini'}
            onChange={() => {
              setEngine('gemini')
              persist('gemini', apiKey, backendUrl)
            }}
            disabled={disabled}
          />
          <span>
            <strong>Natural (Gemini en el navegador)</strong>
            <small>Requiere pegar clave en este dispositivo</small>
          </span>
        </label>
        <label className="engine-option">
          <input
            type="radio"
            name="engine"
            checked={engine === 'mymemory'}
            onChange={() => {
              setEngine('mymemory')
              persist('mymemory', apiKey, backendUrl)
            }}
            disabled={disabled}
          />
          <span>
            <strong>Básica (MyMemory)</strong>
            <small>Gratis · calidad limitada</small>
          </span>
        </label>
      </div>

      {engine === 'cloud' && (
        <label className="field api-key">
          <span>URL de tu backend PAWA (Cloudflare Worker)</span>
          <input
            type="url"
            value={backendUrl}
            onChange={(e) => setBackendUrl(e.target.value)}
            onBlur={() => persist('cloud', apiKey, backendUrl)}
            placeholder="https://pawa-translate.tu-cuenta.workers.dev"
            disabled={disabled}
            autoComplete="off"
          />
          <p className="hint">
            Despliega con <code>cloud-translate/setup-deepl.sh</code> en tu PC
            (clave segura en Cloudflare). O usa el backend de prueba:
          </p>
          <button
            type="button"
            className="use-backend-btn"
            disabled={disabled}
            onClick={() => {
              setBackendUrl(SUGGESTED_BACKEND_URL)
              persist('cloud', apiKey, SUGGESTED_BACKEND_URL)
            }}
          >
            Usar backend configurado
          </button>
        </label>
      )}

      {engine === 'gemini' && (
        <label className="field api-key">
          <span>Clave API de Gemini</span>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            onBlur={() => persist('gemini', apiKey, backendUrl)}
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
        {isCloudTranslationReady()
          ? 'DeepL/Gemini en la nube activo (frases completas).'
          : engine === 'cloud'
            ? 'Pega la URL del worker tras desplegar cloud-translate.'
            : hasNaturalTranslation()
              ? 'Traducción natural activa (Gemini local).'
              : engine === 'gemini'
                ? 'Pega tu clave Gemini.'
                : 'Modo básico: puede sonar literal o incorrecto.'}
        {saved && ' · Guardado'}
      </p>
    </section>
  )
}
