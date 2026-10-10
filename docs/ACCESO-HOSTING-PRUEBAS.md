# Acceso HTTPS de pruebas (cliente remoto)

El **localhost del Cloud Agent no es accesible** para el cliente. Opciones:

## Opción recomendada — app en su PC (ya documentado)

[ACCESO-WINDOWS-STAGING.md](./ACCESO-WINDOWS-STAGING.md): clone, `frontend\.env.local`, `npx vite`, login con usuario Dashboard.

## Opción — despliegue alojado (pendiente activación)

1. Build: `npm run build -w frontend` → `frontend/dist`
2. Variables en el host: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (staging `dcfqaubuehnkniqcfvyg`).
3. Servir `dist` con **HTTPS** (Firebase App Hosting, Cloudflare Pages, Netlify, etc.).
4. Rutas SPA: rewrite `/*` → `index.html` (incluir `/c/:token` cotización pública).

**Enlace de pruebas estable:** no incluido en el repo hasta que el cliente elija proveedor de hosting y dominio. El proyecto Supabase staging ya acepta origen del host configurado en Dashboard → Authentication → URL settings.

## Túneles temporales

`localtunnel` / ngrok desde el agente son **inestables** (408/recordatorio) — no sustituto de despliegue.
