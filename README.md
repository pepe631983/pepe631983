# PAWA — Traductor de voz en tiempo real (PWA)

**PAWA** es una Progressive Web App: escucha tu voz, transcribe y traduce al instante, y puedes **instalarla** en móvil o escritorio como app nativa.

## Inicio rápido

```bash
cd voice-translator
npm install
npm run dev
```

Abre la URL que muestra Vite (por defecto `http://localhost:5173`). Usa **Chrome** o **Edge** y concede permiso al micrófono.

### URL pública (instalar PAWA)

**App:** [https://pepe631983.github.io/pepe631983/](https://pepe631983.github.io/pepe631983/)

> Si ves 404, activa Pages **una sola vez** en el repo:
> [Settings → Pages](https://github.com/pepe631983/pepe631983/settings/pages) → **Build and deployment** → **Source: GitHub Actions** (o rama `gh-pages` / carpeta `/`) → Guardar. En 1–2 minutos la URL quedará activa.

**Instalar desde la URL:**

- **Chrome (Android o PC):** abre el enlace → menú ⋮ → *Instalar app* / *Instalar PAWA*.
- **iPhone:** Safari → Compartir → *Añadir a pantalla de inicio*.

Para probar en local: `npm run build && npm run preview` (HTTPS en producción).

## Cómo funciona

| Capa | Tecnología |
|------|------------|
| Voz → texto | [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) (reconocimiento continuo con resultados intermedios) |
| Traducción | [MyMemory](https://mymemory.translated.net/) vía proxy en desarrollo (`vite.config.ts`) |
| Texto → voz | `speechSynthesis` del navegador |

## Traducción natural (DeepL en la nube)

Backend en **`cloud-translate/`** (Cloudflare Worker). La clave DeepL **no** va en el móvil.

```bash
cd cloud-translate && npm install
npx wrangler login
npx wrangler secret put DEEPL_AUTH_KEY
npm run deploy
```

En PAWA → **Calidad de traducción** → **Nube (DeepL)** → pega la URL del worker.

## Producción

MyMemory es solo vista previa. Para calidad nativa usa el worker **DeepL** o Gemini.

El reconocimiento en el navegador depende del motor del SO/navegador; para mayor precisión y más idiomas, integra **Whisper** o **Google Speech-to-Text** en streaming.

## Estructura

- `voice-translator/src/hooks/useRealtimeVoiceTranslation.ts` — micrófono, debounce y historial
- `voice-translator/src/lib/translate.ts` — cliente de traducción
- `voice-translator/src/lib/languages.ts` — idiomas soportados
