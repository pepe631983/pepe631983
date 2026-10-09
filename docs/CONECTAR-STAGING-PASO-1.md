# Paso 1 — Secreto de conexión (staging)

**Objetivo:** que el agente (o su PC) pueda hablar con la base **PostgreSQL de staging**, sin guardar la contraseña en Git ni en el chat.

## Dónde configurarlo

1. Abra **Cursor** → **Dashboard** → **Cloud Agents** → **Environments**.
2. Elija el entorno vinculado a este repositorio (`pepe631983`).
3. Sección **Secrets** (o **Environment variables** privadas).
4. Cree un secreto (tipo **Runtime Secret** recomendado):
   - **Nombre:** `STAGING_DATABASE_URL`
   - **Valor:** la URI completa de PostgreSQL del proyecto **staging** (no producción).
5. **Guarde** el secreto.
6. En **Environments → Builds**, **active** el build más reciente que incluya `postgresql-client` y `npm ci` (p. ej. draft `bld-20261009-8d58e7d6…` o uno posterior con `.cursor/environment.json` del repo).
7. Inicie un **agente cloud nuevo** desde el Dashboard (**Cloud Agents → New** en este repositorio). La URL debe cambiar (`bc-…` distinto). Marcar “acción externa completada” en el mismo chat **no** inyecta secretos: hace falta un **run nuevo**.
8. En el nuevo run, el agente debe poder ejecutar `npm run db:check:staging-secret` sin exit 2 (solo muestra la longitud de la URI, nunca el valor).

## Dónde obtener la URI (Supabase)

1. [Supabase Dashboard](https://supabase.com/dashboard) → proyecto **staging** (verifique el nombre/ref antes de continuar).
2. **Settings** → **Database**.
3. **Connection string** → pestaña **URI** (modo *Session* o *Transaction*; para pruebas con `BEGIN/ROLLBACK` use **Session** o conexión directa al puerto **5432** si el pooler da problemas).
4. Sustituya `[YOUR-PASSWORD]` por la contraseña de base de datos del proyecto staging.

## Qué no hacer

- No commitear `.env.local` con la URI.
- No pegar la URI en issues, PRs ni en el chat del agente.
- No usar el proyecto de **producción** para pruebas de integración.

## Si “Add secret” falla varias veces

| Problema | Qué revisar |
|----------|-------------|
| El agente sigue sin ver la URI | ¿Run **nuevo** (`bc-…` distinto)? Los secretos solo entran al **arrancar** el agente. |
| Nombre distinto | Debe ser exactamente `STAGING_DATABASE_URL` (mayúsculas y guiones bajos). |
| Entorno equivocado | Secreto en el entorno vinculado a **este repo** ([enlace](https://cursor.com/dashboard/cloud-agents/environments/e/a53259a6-bcfb-11f1-977f-f6b8f2fcf9b2)), no otro Personal/Team. |
| URI incompleta | Sustituir `[YOUR-PASSWORD]`; una línea; si la contraseña tiene `@` o `#`, [codificar URL](https://developer.mozilla.org/en-US/docs/Glossary/Percent-encoding) esos caracteres. |
| `password authentication failed` con secreto presente | Resetee la contraseña en Supabase → Database, copie la URI nueva y **vuelva a guardar** el secreto (no reutilice una contraseña antigua). Los scripts usan `PGUSER=postgres.<ref>` vía parseo seguro de la URI. |
| Panel del agente | Use el flujo **Add secret** que Cursor muestra cuando el agente lo solicita (no hace falta buscar Secrets a mano si aparece el formulario en el run). |

El agente **no puede** escribir secretos en su cuenta Cursor; solo usted puede confirmarlos en ese formulario o en Dashboard → Environments → Secrets.

## Siguiente paso

Cuando el secreto exista, relance el agente o espere un nuevo run. Luego: **Paso 2** — verificar proyecto (`docs/CONECTAR-STAGING-PASO-2.md`).
