export interface Env {
  DEEPL_AUTH_KEY?: string
  GEMINI_API_KEY?: string
  ALLOWED_ORIGINS?: string
}

const DEEPL_LANG: Record<string, string> = {
  en: 'EN',
  es: 'ES',
  fr: 'FR',
  de: 'DE',
  it: 'IT',
  pt: 'PT',
  ja: 'JA',
  ko: 'KO',
  zh: 'ZH',
  ru: 'RU',
  ar: 'AR',
  hi: 'HI',
}

function corsHeaders(origin: string | null, env: Env): HeadersInit {
  const allowed = (env.ALLOWED_ORIGINS ?? '*').split(',').map((s) => s.trim())
  const ok =
    !origin ||
    allowed.includes('*') ||
    allowed.some((o) => origin === o || origin.endsWith(o.replace('https://', '')))

  return {
    'Access-Control-Allow-Origin': ok && origin ? origin : '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
  }
}

async function translateDeepL(
  text: string,
  from: string,
  to: string,
  key: string,
): Promise<string> {
  const target = DEEPL_LANG[to]
  const source = DEEPL_LANG[from]
  if (!target) throw new Error(`DeepL no soporta idioma destino: ${to}`)

  const body = new URLSearchParams({ text, target_lang: target })
  if (source) body.set('source_lang', source)

  const host = key.endsWith(':fx') ? 'api-free.deepl.com' : 'api.deepl.com'
  const res = await fetch(`https://${host}/v2/translate`, {
    method: 'POST',
    headers: {
      Authorization: `DeepL-Auth-Key ${key}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body,
  })

  const data = (await res.json()) as {
    translations?: { text?: string }[]
    message?: string
  }

  if (!res.ok) {
    throw new Error(data.message ?? `DeepL ${res.status}`)
  }

  const out = data.translations?.[0]?.text?.trim()
  if (!out) throw new Error('DeepL sin resultado')
  return out
}

async function translateGemini(
  text: string,
  from: string,
  to: string,
  apiKey: string,
): Promise<string> {
  const prompt = `Traduce del idioma ${from} al ${to} de forma natural y nativa para conversación hablada. Solo devuelve la traducción, sin comillas ni notas.\n\n${text}`

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.25, maxOutputTokens: 512 },
      }),
    },
  )

  const data = (await res.json()) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[]
    error?: { message?: string }
  }

  if (!res.ok) {
    throw new Error(data.error?.message ?? `Gemini ${res.status}`)
  }

  const out = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()
  if (!out) throw new Error('Gemini sin resultado')
  return out.replace(/^["'«»]+|["'«»]+$/g, '').trim()
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const origin = request.headers.get('Origin')
    const headers = corsHeaders(origin, env)

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers })
    }

    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405, headers })
    }

    try {
      const body = (await request.json()) as {
        text?: string
        from?: string
        to?: string
      }

      const text = body.text?.trim()
      const from = body.from?.trim()
      const to = body.to?.trim()

      if (!text || !from || !to) {
        return Response.json(
          { error: 'Faltan text, from o to' },
          { status: 400, headers },
        )
      }

      if (from === to) {
        return Response.json({ translated: text, engine: 'none' }, { headers })
      }

      if (env.DEEPL_AUTH_KEY) {
        try {
          const translated = await translateDeepL(text, from, to, env.DEEPL_AUTH_KEY)
          return Response.json({ translated, engine: 'deepl' }, { headers })
        } catch (e) {
          if (!env.GEMINI_API_KEY) throw e
        }
      }

      if (env.GEMINI_API_KEY) {
        const translated = await translateGemini(text, from, to, env.GEMINI_API_KEY)
        return Response.json({ translated, engine: 'gemini' }, { headers })
      }

      return Response.json(
        { error: 'Configura DEEPL_AUTH_KEY o GEMINI_API_KEY en el worker' },
        { status: 503, headers },
      )
    } catch (e) {
      const message = e instanceof Error ? e.message : 'Error de traducción'
      return Response.json({ error: message }, { status: 500, headers })
    }
  },
}
