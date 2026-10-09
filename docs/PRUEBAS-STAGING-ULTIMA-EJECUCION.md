# Última ejecución staging

Fecha UTC: 2026-10-09 (run `bc-d29d60e4-c5d3-40bc-85bb-945b550e21a4`)

Host: `aws-0-us-east-1.pooler.supabase.com:5432`

## Resultado (3.er intento — acciones completadas en Portal)

| Paso | Estado |
|------|--------|
| Run cloud | Sigue `bc-d29d60e4-…` (mismo URL de agente) |
| Huella URI (sha256/12) | `a8ace1c92ea9d4b7` (sin cambio → mismo valor que intentos anteriores) |
| `npm run db:verify:staging` | **FAILED** — contraseña rechazada en pooler |

## Resultado (2.º intento de secreto)

| Paso | Estado |
|------|--------|
| `STAGING_DATABASE_URL` en proceso | OK (longitud **107**, sin cambio vs intento anterior) |
| Usuario URI parseado | `postgres.dcfqaubuehnkniqcfvyg` |
| Longitud contraseña en URI | 14 caracteres (sin espacios; sin placeholder `[YOUR-PASSWORD]`) |
| Pooler `:5432` / `:6543` | **FAILED** — `password authentication failed` |
| Host directo `db.*.supabase.co` | No usable (solo IPv6 desde este entorno) |
| Migraciones / suite / concurrencia | **No ejecutado** |

## Acción requerida

1. Supabase → proyecto staging (`dcfqaubuehnkniqcfvyg`) → **Settings → Database → Reset database password**.
2. Copie de nuevo la **Connection string (URI)** en modo Session (pooler `:5432`) y sustituya la contraseña.
3. Si la contraseña contiene `@`, `#`, `%`, etc., use [codificación URL](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding) en el secreto.
4. Actualice el secreto **`STAGING_DATABASE_URL`** en Cursor (mismo entorno) y relance agente si hace falta.
5. Reejecutar: `npm run db:verify:staging` luego `STAGING_ALLOW_PUSH=1 npm run db:staging:validate`.
