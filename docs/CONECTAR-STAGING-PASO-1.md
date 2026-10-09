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

## Siguiente paso

Cuando el secreto exista, relance el agente o espere un nuevo run. Luego: **Paso 2** — verificar proyecto (`docs/CONECTAR-STAGING-PASO-2.md`).
