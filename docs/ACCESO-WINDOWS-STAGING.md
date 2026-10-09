# Acceso desde Windows (PowerShell) — staging TCI Auto Zone

El **localhost del Cloud Agent no es el de su PC**. Para probar la interfaz en su equipo, clone el repo y apunte el frontend al proyecto Supabase **staging** (`dcfqaubuehnkniqcfvyg`).

## Requisitos

- [Node.js 20+](https://nodejs.org/) (LTS)
- Git
- Clave **publica** del Dashboard: **Settings → API → Publishable key** (`sb_publishable_...`) o anon JWT (`eyJ...`)

## Pasos (PowerShell)

```powershell
cd $env:USERPROFILE\Documents
git clone https://github.com/pepe631983/pepe631983.git
cd pepe631983
git checkout cursor/tci-caja-devoluciones-21a4

npm install

# Crear frontend\.env.local (solo variables publicas; no commitear)
@"
VITE_SUPABASE_URL=https://dcfqaubuehnkniqcfvyg.supabase.co
VITE_SUPABASE_ANON_KEY=COLOQUE_AQUI_SU_sb_publishable_o_anon
"@ | Set-Content -Encoding utf8 frontend\.env.local

npm run validate:supabase-key

cd frontend
npx vite --host 127.0.0.1 --port 5173
```

Abra en el navegador: **http://127.0.0.1:5173/login**

Use el usuario que creó en **Supabase Dashboard → Authentication → Users** (Auto confirm). Luego **Registro de empresa** (modo demo).

## Credenciales de prueba (seguro)

- **No** guarde contraseñas en el repositorio.
- En **Cursor Cloud Agent**, puede añadir secretos de entorno (solo para el agente):
  - `STAGING_UI_TEST_EMAIL` — p. ej. su usuario Dashboard
  - `STAGING_UI_TEST_PASSWORD` — la contraseña que definió al crear el usuario
- En su PC, solo necesita recordar la contraseña al iniciar sesión en el navegador; no hace falta ponerla en archivos.

## Comprobar login desde consola (opcional, con secretos en el agente)

Desde la raíz del repo (Linux/macOS o Git Bash en Windows con secretos exportados en esa sesión):

```powershell
# PowerShell: variables de sesión (no van al repo)
$env:STAGING_UI_TEST_EMAIL = "su-email@dominio.com"
$env:STAGING_UI_TEST_PASSWORD = "su-contraseña"
node scripts/auth-probe-ui-login.mjs
```

## Usuario SQL antiguo

No use usuarios insertados manualmente en `auth.users`. El usuario agente `tci.staging.e2e@cursor-agent.test` (renombrado en staging) puede devolver **500 Database error querying schema**; use solo usuarios creados desde el **Dashboard Authentication**.

## Flujo manual sugerido (E2E)

Ver orden detallado en [ACCESO-PRUEBAS-STAGING.md](./ACCESO-PRUEBAS-STAGING.md#escenario-manual-en-pantallas-e2e).

## Pendientes (no producción)

Impresión física, instalación en mostrador y validación fiscal en sitio — ver documentación principal de acceso.
