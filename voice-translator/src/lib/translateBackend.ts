export async function translateViaBackend(
  backendUrl: string,
  text: string,
  from: string,
  to: string,
): Promise<{ translated: string; engine: string }> {
  const base = backendUrl.replace(/\/$/, '')
  const res = await fetch(`${base}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, from, to }),
  })

  const data = (await res.json()) as {
    translated?: string
    engine?: string
    error?: string
  }

  if (!res.ok) {
    throw new Error(data.error ?? `Backend ${res.status}`)
  }

  if (!data.translated?.trim()) {
    throw new Error('Backend sin traducción')
  }

  return { translated: data.translated.trim(), engine: data.engine ?? 'cloud' }
}
