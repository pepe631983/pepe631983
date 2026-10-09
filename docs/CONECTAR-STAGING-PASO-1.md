# Paso 1 — Secreto de conexión (staging)

**Objetivo:** que el agente (o su PC) pueda hablar con la base **PostgreSQL de staging**, sin guardar la contraseña en Git ni en el chat.

## Dónde configurarlo

1. Abra **Cursor** → **Dashboard** → **Cloud Agents** → **Environments**.
2. Elija el entorno vinculado a este repositorio (`pepe631983`).
3. Sección **Secrets** (o **Environment variables** privadas).
4. Cree un secreto (tipo **Runtime Secret** recomendado):
   - **Nombre:** `STAGING_DATABASE_URL`
   - **Valor:** la URI completa de PostgreSQL del proyecto **staging** (no producción).
5. **Guarde** y **relance el agente** (nuevo run). Los secretos no se inyectan en sesiones ya abiertas.

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
