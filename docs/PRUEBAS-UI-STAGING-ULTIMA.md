# Pruebas de interfaz — staging (última ejecución)

**Fecha UTC:** 2026-10-09  
**Supabase:** `dcfqaubuehnkniqcfvyg.supabase.co`  
**Frontend:** `http://127.0.0.1:5175` (Vite en agente; puerto puede variar)

## Secretos (Cloud Agent)

| Variable | Disponible | Valor mostrado |
|----------|------------|----------------|
| `STAGING_UI_TEST_EMAIL` | Sí | Solo longitud / dominio (`gmail.com`, prefijo 9 chars) |
| `STAGING_UI_TEST_PASSWORD` | Sí | Solo longitud (12) |

Comprobación:

```bash
test -n "$STAGING_UI_TEST_EMAIL" && echo "email: set (len=${#STAGING_UI_TEST_EMAIL})"
test -n "$STAGING_UI_TEST_PASSWORD" && echo "password: set (len=${#STAGING_UI_TEST_PASSWORD})"
npm run auth:probe-ui-login
```

## Resultado A — Prueba **API** (no sustituye UI)

Comando: `npm run test:ui-staging-e2e`

| Paso | Resultado |
|------|-----------|
| login | **PASS** |
| create_company_with_owner | **PASS** (ya existía) |
| admin_permissions_owner | **PASS** (owner) |
| compra (proveedor → GR → factura) | **PASS** |
| caja apertura / cierre Δ=0 | **PASS** |
| venta contado + crédito + cobro + devolución | **PASS** |
| conciliación (3 filas, Δ=0) | **PASS** |

**Resumen API:** `PASSED` (16/16 pasos)

## Resultado B — Prueba **UI real** (navegador)

Comando: `npm run test:ui-staging-browser`  
Motor: Playwright Chromium contra pantallas Vite (DOM, clics, formularios).

| Paso | Resultado |
|------|-----------|
| Login | **PASS** |
| Empresa | **PASS** (ya existía — Raquel Auto) |
| Usuarios / permisos admin | **PASS** |
| Proveedor + recepción + factura proveedor | **PASS** |
| Caja (abrir o usar sesión) | **PASS** |
| POS venta contado + crédito | **PASS** |
| Cobros parcial | **PASS** |
| Devolución (factura **cash**, no crédito) | **PASS** |
| Cierre caja Δ=0 | **PASS** |
| Conciliación Δ=0 | **PASS** |

**Resumen UI:** **1 passed** (~7 s)

Capturas: `docs/ui-e2e-screenshots/` (01-dashboard … 04-conciliacion).

### Nota devoluciones UI

En el desplegable de facturas, elegir línea con `· cash ·`. La factura `credit` sin cliente muestra error de saldo a favor.

**Corrección (caché caja):** el informe manual del agente [Full UI E2E staging](bc-fcee250c-7555-5dbb-a6b7-88d6f8f902d6) reportó «Sesión de caja no válida» al devolver tras abrir caja en otra pantalla: React Query no refrescaba `cash-session-ret` al abrir/cerrar caja. Corregido en `CashPage` (invalidación cruzada) y `SalesReturnsPage` (relee sesión abierta al confirmar).

## Acceso desde su PC

**Recomendado:** [ACCESO-WINDOWS-STAGING.md](./ACCESO-WINDOWS-STAGING.md) — clone + `frontend\.env.local` + `npx vite` → `http://127.0.0.1:5173/login`.

**Túnel temporal (agente):** se probó `localtunnel` (`https://famous-yaks-kick.loca.lt`); respuesta **408** desde red externa — **no fiable** para preview. Use la app en su máquina con la guía Windows.

## SQL de referencia

```bash
STAGING_ALLOW_PUSH=0 npm run db:staging:validate
```

Suite 11/11 sin regresión.

## Pendiente producción

Impresión física, instalación en mostrador, validación fiscal in situ.
