# Usuario UI staging (recomendado)

No inserte en `auth.users` por SQL para pruebas de login en Supabase hosted: GoTrue puede devolver `Database error querying schema`.

1. Supabase Dashboard → **Authentication** → **Users** → **Add user**
2. Email: su elección (p. ej. `operador.prueba@su-dominio.com`)
3. Password: mínimo 8 caracteres
4. Marque **Auto confirm user**
5. En la app: `/login` → `/registro-empresa` (modo demo) → flujo E2E
