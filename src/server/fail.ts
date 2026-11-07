export function failure(error: unknown, prefix: string): Response {
  const raw = error instanceof Error ? error.message : "";
  const secret = typeof process !== "undefined" && typeof process.env?.DATABASE_URL === "string" ? process.env.DATABASE_URL : "";
  let safe = raw;
  if (secret) safe = safe.split(secret).join("postgres://…");
  safe = safe.replace(/postgres(?:ql)?:\/\/\S+/gi, "postgres://…");
  safe = safe.replace(/\/\/[^\s/@:]+:[^\s/@]+@/g, "//…@");
  safe = safe.replace(/password[=:][^\s&]+/gi, "password=…");
  safe = safe.replace(/[\r\n]+/g, " ").trim().slice(0, 160);
  return new Response(JSON.stringify({ error: safe ? `${prefix} ${safe}` : prefix }), {
    status: 500,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });
}
