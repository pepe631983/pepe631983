# Usuario UI staging (recomendado)

No inserte en `auth.users` por SQL para pruebas de login en Supabase hosted: GoTrue puede devolver `Database error querying schema` (p. ej. usuario agente `tci.staging.e2e@cursor-agent.test`, aunque tenga fila en `auth.identities`).

Para automatización en Cloud Agent, configure secretos (no commitear):

- `STAGING_UI_TEST_EMAIL`
- `STAGING_UI_TEST_PASSWORD`

Luego: `npm run auth:probe-ui-login` y `npm run test:ui-staging-e2e`.

1. Supabase Dashboard → **Authentication** → **Users** → **Add user**
2. Email: su elección (p. ej. `operador.prueba@su-dominio.com`)
3. Password: mínimo 8 caracteres
4. Marque **Auto confirm user**
5. En la app: `/login` → `/registro-empresa` (modo demo) → flujo E2E
