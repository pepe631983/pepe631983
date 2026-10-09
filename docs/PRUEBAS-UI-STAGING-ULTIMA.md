# Pruebas de interfaz — staging (última ejecución)

**Fecha UTC:** 2026-10-09 (continuación)  
**Supabase:** `dcfqaubuehnkniqcfvyg.supabase.co`  
**Clave navegador:** `sb_publishable_...` (`VITE_SUPABASE_ANON_KEY`)

## Auth — diagnóstico

| Usuario | Origen | `signInWithPassword` (probe) | Notas |
|---------|--------|------------------------------|--------|
| `auto09719@gmail.com` | Dashboard Authentication | **OK** → `400 Invalid login credentials` con contraseña incorrecta (comportamiento esperado) | Sin empresa aún (`profiles` vacío). **Usar para E2E UI.** |
| `tci.staging.e2e@cursor-agent.test` | SQL agente (renombrado en DB a `…repaired@example.com`) | **500** `Database error querying schema` | No usar; crear usuarios solo en Dashboard. |
| Registro `/registro` | UI | **429** rate limit email (histórico) | Evitar signup masivo; Dashboard Add user. |

**Causa probable del 500:** usuario creado por SQL/identidad manual incompatible con GoTrue hosted (no es fallo del esquema `auth` del proyecto ni de migraciones `public`). **No** se eliminaron usuarios ni se alteró el esquema Auth a ciegas.

**Integración SQL:** migración `20241009000042_integration_auth_identities.sql` — `integration_test.create_auth_user` ahora inserta también `auth.identities` (solo usuarios `@invalid.local` de pruebas SQL).

## Credenciales seguras (Cloud Agent)

Secretos disponibles en el entorno del agente: `STAGING_DATABASE_URL`, `VITE_SUPABASE_ANON_KEY`.

**Faltan** (para automatizar login en el agente):

- `STAGING_UI_TEST_EMAIL` — p. ej. `auto09719@gmail.com`
- `STAGING_UI_TEST_PASSWORD` — la contraseña que definió en Dashboard

Comandos (sin imprimir contraseña):

```bash
npm run auth:probe-ui-login
npm run test:ui-staging-e2e
```

## Cómo abrir la app **desde su PC (Windows)**

Ver **[ACCESO-WINDOWS-STAGING.md](./ACCESO-WINDOWS-STAGING.md)** (PowerShell, sin `export` de Bash).

Resumen: clone repo → `frontend\.env.local` con URL + publishable key → `npx vite` → **http://127.0.0.1:5173/login**

> El `localhost` del Cloud Agent **no** es accesible desde su equipo; debe ejecutar el frontend localmente o usar la URL que Vite muestre en su máquina.

## Servidor en el agente (solo pruebas internas)

```bash
npm run dev:staging
```

En esta VM Vite puede usar **5175** si 5173/5174 están ocupados (ver consola).

## Resultados E2E (flujo completo)

| Paso | Resultado | Detalle |
|------|-----------|---------|
| Login UI | **PENDIENTE** | Requiere `STAGING_UI_TEST_PASSWORD` en secretos del agente o login manual en su PC |
| Creación empresa | **PENDIENTE** | Tras login; RPC `create_company_with_owner` probado en suite SQL |
| Permisos admin (owner) | **PENDIENTE** | Automatizable con `test:ui-staging-e2e` tras login |
| Compra (GR + factura proveedor) | **PASS (SQL)** | Suite 11/11 incluye escenario tesorería |
| Caja apertura/cierre | **PASS (SQL)** | Delta 0 en integración |
| Venta / cobro / devolución | **PASS (SQL)** | Idem |
| Conciliación deltas 0 | **PASS (SQL)** | `get_financial_reconciliation` |
| Flujo en **pantallas** | **PENDIENTE** | Mismo backend; falta sesión UI autenticada en agente |

## SQL (referencia)

```bash
STAGING_ALLOW_PUSH=1 npm run db:staging:validate
```

11/11 + concurrencia — sin regresión tras migración 00042 (aplicar push en staging).

## Pendiente manual / producción

- E2E navegador completo con usuario Dashboard (credenciales en secretos o PC local).
- Concurrencia dos navegadores/POS.
- **Impresión física** — no realizada.
- **Instalación en equipos** — no realizada.
