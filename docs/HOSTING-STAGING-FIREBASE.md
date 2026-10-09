# Hosting HTTPS de pruebas (solo staging)

Build local:

```bash
npm run env:frontend-staging
npm run build -w frontend
```

Despliegue Firebase Hosting (requiere **un dato**: ID de proyecto Firebase con Hosting activo):

```bash
npx firebase-tools deploy --only hosting --project YOUR_FIREBASE_PROJECT_ID
```

Variables en el build (ya en `.env.staging` / `write-frontend-staging-env.sh`):

- `VITE_SUPABASE_URL=https://dcfqaubuehnkniqcfvyg.supabase.co`
- `VITE_SUPABASE_ANON_KEY` (clave **anon** pública, nunca service role)

En Supabase Dashboard → Authentication → URL configuration, agregue el dominio `https://YOUR_FIREBASE_PROJECT_ID.web.app`.

**URL estable:** se obtiene tras el primer deploy (`https://<project>.web.app`). Este repo no incluye credenciales de deploy; el cliente debe ejecutar deploy con su cuenta o proporcionar token CI de solo hosting.
