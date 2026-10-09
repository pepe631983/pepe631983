# Pruebas de interfaz — staging (última ejecución)

**Fecha UTC:** 2026-10-09  
**Supabase:** `dcfqaubuehnkniqcfvyg.supabase.co`  
**Clave navegador:** `sb_publishable_...` (vía `VITE_SUPABASE_ANON_KEY`)

## Configuración comprobada

| Comprobación | Resultado |
|--------------|-----------|
| `npm run env:frontend-staging` | OK — genera `frontend/.env.local` |
| Formato clave `sb_publishable_*` | Aceptado por `@supabase/supabase-js` (`auth.getSession` OK) |
| Script `npm run validate:supabase-key` | OK (ejecutar desde repo tras `npm install`) |

## Cómo abrir la aplicación (exacto)

```bash
cd /ruta/al/repo
npm install
export VITE_SUPABASE_ANON_KEY='sb_publishable_...'   # su clave publica
# STAGING_DATABASE_URL solo si usa env:frontend-staging para derivar la URL
npm run env:frontend-staging
cd frontend && npx vite --host 0.0.0.0 --port 5173
```

Abrir en el navegador: **http://localhost:5173/login** (si Vite indica otro puerto, p. ej. 5174, use ese).

## Resultados reales (navegador automatizado)

| Paso | Resultado | Detalle |
|------|---------|---------|
| Carga `/login` | **PASS** | UI en español, branding TCI Auto Zone |
| Carga `/registro` | **PASS** | Formulario visible |
| Registro nuevo usuario | **BLOCKED** | Supabase Auth **429** — `email rate limit exceeded` |
| Login usuario SQL de prueba | **BLOCKED** | GoTrue **500** — `Database error querying schema` (usuario creado por SQL; no recomendado para login UI en hosted Auth) |
| Registro empresa | **NO EJECUTADO** | Sin sesión autenticada estable |
| Caja / conciliación / permisos admin | **NO EJECUTADO** | Requiere sesión + empresa |

**Conclusión UI:** el frontend staging está cableado correctamente con la clave **publishable**; el flujo completo autenticado queda **pendiente** de (a) esperar reset del rate limit de signup o (b) crear usuario desde el **Dashboard Supabase → Authentication → Add user** (recomendado) y luego login manual.

## Conciliación caja (corregido en SQL)

Antes se comparaba **arqueo total de caja** (incluye fondo inicial no contabilizado en 1000) contra **saldo histórico completo** de la cuenta 1000 — magnitudes **no equivalentes**.

Ahora (`get_financial_reconciliation`):

| Clave | Esperado | Actual | Debe coincidir |
|-------|----------|--------|----------------|
| `cash_session_internal` | `_cash_session_expected(session)` | `cash_sessions.expected_cash` | Movimientos vs registro de sesión |
| `cash_session_ops_vs_gl` | Neto operativo en caja (ventas/cobros/reembolsos; **sin** fondo inicial) | Neto en cuenta **1000** solo de documentos ligados a la sesión | Efectivo contabilizado = efectivo registrado en caja |

Todas las filas de `differences` deben tener **delta 0** (suite SQL 11/11 incluye E2E tesorería con sesión abierta).

## SQL (sin cambios de alcance)

```bash
STAGING_ALLOW_PUSH=1 npm run db:staging:validate
```

11 pruebas en suite + concurrencia 2× psql — ver `docs/PRUEBAS-STAGING-ULTIMA-EJECUCION.md`.

## Pendiente manual

- E2E UI completo tras usuario Auth creado en Dashboard (no SQL directo).
- Concurrencia en dos navegadores/POS.
- **Impresión física** — no realizada.
- **Instalación en equipos** — no realizada.
