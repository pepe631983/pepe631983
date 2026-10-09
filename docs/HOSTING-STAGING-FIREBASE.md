# Hosting HTTPS de pruebas (Firebase — solo staging)

## Proyecto Firebase

- **Project ID:** `tci-auto-zone`
- **URLs esperadas:** `https://tci-auto-zone.web.app` y `https://tci-auto-zone.firebaseapp.com`

## Build (solo Supabase staging)

```bash
npm run env:frontend-staging   # VITE_SUPABASE_URL + anon key (dcfqaubuehnkniqcfvyg)
npm run build -w frontend
bash scripts/verify-frontend-build-secrets.sh
```

El bundle **no** debe incluir `STAGING_DATABASE_URL`, `service_role` ni URLs `postgres://`.

## Autenticación Firebase (oficial)

1. En Cursor, cuando el agente invoque `firebase login`, abra la URL que muestre.
2. Verifique que el **Session ID** del navegador coincide con el del agente (anti-phishing).
3. Tras iniciar sesión con su cuenta Google, copie el **código de autorización** y envíelo al agente (no envíe contraseñas ni tokens CI por chat).

Alternativa CI (GitHub Actions, no chat): `firebase login:ci` y guarde el token como secreto `FIREBASE_TOKEN`.

## Deploy

```bash
npm run deploy:hosting-staging
# o: npx -y firebase-tools@latest deploy --only hosting --project tci-auto-zone
```

**URL en producción de pruebas:** https://tci-auto-zone.web.app (requiere cuenta Google con rol Editor u Owner en IAM del proyecto Firebase).

## Supabase Auth (orígenes staging)

Tras el primer deploy, configure redirects (Dashboard → Authentication → URL configuration **o** script):

```bash
export SUPABASE_ACCESS_TOKEN=...   # token personal Supabase, no service role
bash scripts/configure-staging-supabase-auth-urls.sh https://tci-auto-zone.web.app
```

Incluye localhost para desarrollo local. **No** apunte este frontend a producción.
