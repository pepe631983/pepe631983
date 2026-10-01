import { labelForCode } from './languages'

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string }[] }
  }[]
  error?: { message?: string }
}

function cleanModelOutput(text: string): string {
  return text
    .trim()
    .replace(/^["'«»]+|["'«»]+$/g, '')
    .replace(/^(traducción|translation)\s*:\s*/i, '')
    .trim()
}

export async function translateWithGemini(
  text: string,
  from: string,
  to: string,
  apiKey: string,
  context?: string,
): Promise<string> {
  const fromName = labelForCode(from)
  const toName = labelForCode(to)

  const prompt = `Eres intérprete humano en una conversación hablada en tiempo real.
Traduce del ${fromName} al ${toName}.

Reglas:
- El texto puede venir de voz; corrige solo errores obvios de transcripción (sin inventar ideas nuevas).
- Traduce fielmente del ${fromName} al ${toName}; no cambies el sentido.
- Suena natural y nativa en ${toName}, pero respeta el significado literal.
- Conserva nombres, números y matices (formal/informal).
- Respuesta breve, lista para pronunciar en voz alta.
- Devuelve SOLO la traducción, sin comillas, sin explicación.
${context ? `\nContexto reciente de la conversación:\n${context}\n` : ''}
Texto a traducir:
${text}`

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.15,
        maxOutputTokens: 512,
      },
    }),
  })

  const data = (await res.json()) as GeminiResponse

  if (!res.ok) {
    throw new Error(data.error?.message ?? `Gemini error (${res.status})`)
  }

  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!raw) {
    throw new Error('Gemini no devolvió traducción')
  }

  return cleanModelOutput(raw)
}
