# Traductor de voz en tiempo real

Aplicación web que escucha tu voz, transcribe en el idioma que elijas y muestra (y opcionalmente reproduce) la traducción al instante.

## Inicio rápido

```bash
cd voice-translator
npm install
npm run dev
```

Abre la URL que muestra Vite (por defecto `http://localhost:5173`). Usa **Chrome** o **Edge** y concede permiso al micrófono.

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
