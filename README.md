# PAWA — Traductor de voz en tiempo real (PWA)

**PAWA** es una Progressive Web App: escucha tu voz, transcribe y traduce al instante, y puedes **instalarla** en móvil o escritorio como app nativa.

## Inicio rápido

```bash
cd voice-translator
npm install
npm run dev
```

Abre la URL que muestra Vite (por defecto `http://localhost:5173`). Usa **Chrome** o **Edge** y concede permiso al micrófono.

### Instalar PAWA

- **Android / Chrome (escritorio):** menú → *Instalar app* o el banner *Instalar PAWA* cuando aparezca.
- **iPhone:** Safari → Compartir → *Añadir a pantalla de inicio* (modo standalone).

Para probar la PWA en local con service worker: `npm run build && npm run preview` (sirve en HTTPS recomendado en producción).

## Cómo funciona

| Capa | Tecnología |
|------|------------|
| Voz → texto | [Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API) (reconocimiento continuo con resultados intermedios) |
| Traducción | [MyMemory](https://mymemory.translated.net/) vía proxy en desarrollo (`vite.config.ts`) |
| Texto → voz | `speechSynthesis` del navegador |

## Producción

Para un despliegue serio conviene sustituir MyMemory por **DeepL**, **Google Cloud Translation**, **Azure Translator** o **OpenAI**, y exponer la traducción en un backend propio para no exponer claves API.

El reconocimiento en el navegador depende del motor del SO/navegador; para mayor precisión y más idiomas, integra **Whisper** o **Google Speech-to-Text** en streaming.

## Estructura

- `voice-translator/src/hooks/useRealtimeVoiceTranslation.ts` — micrófono, debounce y historial
- `voice-translator/src/lib/translate.ts` — cliente de traducción
- `voice-translator/src/lib/languages.ts` — idiomas soportados
