import { useState } from 'react'
import { InstallPawaBanner } from './components/InstallPawaBanner'
import { PwaUpdateToast } from './components/PwaUpdateToast'
import { useRealtimeVoiceTranslation } from './hooks/useRealtimeVoiceTranslation'
import { LANGUAGES, labelForCode } from './lib/languages'
import './App.css'

function App() {
  const [langA, setLangA] = useState('es')
  const [langB, setLangB] = useState('en')
  const [autoDetect, setAutoDetect] = useState(true)
  const [speakOut, setSpeakOut] = useState(true)

  const {
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
  } = useRealtimeVoiceTranslation(langA, langB, autoDetect, speakOut)

  const swapLanguages = () => {
    setLangA(langB)
    setLangB(langA)
  }

  return (
    <div className="app">
      <PwaUpdateToast />
      <header className="header">
        <div className="brand">
          <img
            src={`${import.meta.env.BASE_URL}pawa-icon.svg`}
            alt=""
            className="brand-logo"
            width={56}
            height={56}
          />
          <div>
            <p className="eyebrow">Progressive Web App</p>
            <h1>
              PAWA<span className="brand-dot">.</span>
            </h1>
            <p className="subtitle">Traducción de voz en tiempo real, instalable</p>
          </div>
        </div>
      </header>

      <InstallPawaBanner />

      <main className="main">
        <section className="controls card">
          <label className="toggle auto-detect">
            <input
              type="checkbox"
              checked={autoDetect}
              onChange={(e) => setAutoDetect(e.target.checked)}
              disabled={listening}
            />
            <span>
              <strong>Modo intérprete automático</strong>
              <small>
                Detecta el idioma y traduce al otro sin pulsar intercambiar
              </small>
            </span>
          </label>

          <div className="lang-row">
            <label className="field">
              <span>{autoDetect ? 'Idioma 1' : 'Idioma que hablas'}</span>
              <select
                value={langA}
                onChange={(e) => setLangA(e.target.value)}
                disabled={listening}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>

            {!autoDetect && (
              <button
                type="button"
                className="swap-btn"
                onClick={swapLanguages}
                disabled={listening}
                title="Intercambiar idiomas"
                aria-label="Intercambiar idiomas"
              >
                ⇄
              </button>
            )}

            {autoDetect && <div className="lang-auto-pill" aria-hidden>↔</div>}

            <label className="field">
              <span>{autoDetect ? 'Idioma 2' : 'Traducir a'}</span>
              <select
                value={langB}
                onChange={(e) => setLangB(e.target.value)}
                disabled={listening}
              >
                {LANGUAGES.map((lang) => (
                  <option key={lang.code} value={lang.code}>
                    {lang.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {autoDetect && listening && (
            <p className="direction-live" aria-live="polite">
              Ahora: {labelForCode(activeFrom)} → {labelForCode(activeTo)}
            </p>
          )}

          <label className="toggle">
            <input
              type="checkbox"
              checked={speakOut}
              onChange={(e) => setSpeakOut(e.target.checked)}
            />
            Reproducir traducción con voz sintética
          </label>

          <div className="actions">
            {!listening ? (
              <button
                type="button"
                className="mic-btn start"
                onClick={start}
                disabled={!supported || langA === langB}
              >
                Iniciar traducción
              </button>
            ) : (
              <button type="button" className="mic-btn stop" onClick={stop}>
                Detener
              </button>
            )}
            <button
              type="button"
              className="ghost-btn"
              onClick={clearHistory}
              disabled={segments.length === 0 && !interimOriginal}
            >
              Limpiar
            </button>
          </div>

          {langA === langB && (
            <p className="banner warn">Elige dos idiomas distintos.</p>
          )}

          {!supported && (
            <p className="banner warn">
              Usa Chrome o Edge en escritorio para reconocimiento de voz continuo.
            </p>
          )}

          {error && (
            <p className="banner error" role="alert">
              {error}
              <button
                type="button"
                className="dismiss"
                onClick={() => setError(null)}
              >
                Cerrar
              </button>
            </p>
          )}
        </section>

        <section className="live card">
          <h2>En vivo</h2>
          <div className="live-grid">
            <div className="pane">
              <h3>Original</h3>
              <p className={interimOriginal ? 'interim' : 'placeholder'}>
                {interimOriginal || 'Habla en cualquiera de los dos idiomas…'}
              </p>
            </div>
            <div className="pane accent">
              <h3>Traducción</h3>
              <p className={interimTranslated ? 'interim' : 'placeholder'}>
                {interimTranslated || 'La traducción aparecerá aquí…'}
              </p>
            </div>
          </div>
          {listening && <div className="pulse" aria-live="polite">Escuchando…</div>}
        </section>

        <section className="history card">
          <h2>Historial de la sesión</h2>
          {segments.length === 0 ? (
            <p className="placeholder">Las frases completadas se listarán aquí.</p>
          ) : (
            <ul className="segment-list">
              {segments.map((seg) => (
                <li key={seg.id} className="segment">
                  <p className="segment-meta">
                    {labelForCode(seg.fromLang)} → {labelForCode(seg.toLang)}
                  </p>
                  <p className="original">{seg.original}</p>
                  <p className="translated">{seg.translated}</p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </main>

      <footer className="footer">
        <p>
          PAWA usa Web Speech API y MyMemory. En HTTPS puedes instalarla desde el navegador
          (Chrome → Instalar app). Para traducción empresarial, conecta DeepL o Google Cloud.
        </p>
      </footer>
    </div>
  )
}

export default App
