# Pruebas de integración — motor comercial y contable

## Identificar entorno antes de ejecutar

| Comando | ¿Borra datos? | Dónde |
|---------|----------------|--------|
| `npm run db:reset:local` | **Sí — toda la base local** | Solo si URL es `127.0.0.1:54322` |
| `supabase db reset` | **Sí** | Igual que arriba; no use en staging/prod |
| `npm run db:test:local` | **No** (ROLLBACK) | Local |
| `npm run db:test:staging` | **No** (ROLLBACK) | Staging vía `STAGING_DATABASE_URL` |
| `supabase db push` | No borra; **aplica migraciones** | Staging/prod — revisar antes |

Los scripts en `scripts/` imprimen host detectado antes de actuar (`db-guard.sh`).

## Opción A — Supabase local (Docker)

```bash
npx supabase start
npm run db:reset:local    # opcional: base limpia + flag pruebas
npm run db:test:local
```

## Opción B — Proyecto Supabase **staging** (sin Docker)

1. Cree un proyecto Supabase **distinto de producción**.
2. Aplique migraciones: `npx supabase link --project-ref <STAGING_REF>` y `npx supabase db push`.
3. **Una sola vez** en SQL Editor del proyecto staging:

```sql
UPDATE public.database_capabilities
SET value = 'true'
WHERE key = 'integration_tests_enabled';
```

**Nunca** ejecute esto en producción.

4. Configure en su entorno (secretos del agente o `.env.local` **no commitear**):

```bash
export STAGING_DATABASE_URL='postgresql://postgres.[ref]:[PASSWORD]@...pooler.supabase.com:6543/postgres'
```

Obtenga la URI en: Dashboard → Settings → Database → Connection string (URI). Use contraseña de base de datos, no la anon key.

5. Ejecute:

```bash
npm run db:test:staging
```

La suite corre dentro de `BEGIN … ROLLBACK`: no persiste empresas/usuarios de prueba.

### Configuración que falta en este agente cloud

- `STAGING_DATABASE_URL` no está definida → **no se pudo ejecutar la suite aquí**.
- Docker no disponible → **no se pudo ejecutar local**.

## Qué ejecuta la suite

Función `integration_test.run_suite()` (schema `integration_test`, solo rol **service_role** / postgres):

| Prueba | Contenido |
|--------|-----------|
| `reference_scenario` | Compra, factura, venta contado/crédito, cobro, métricas 5 u / 420 caja / etc. |
| `idempotency_all_ops` | Recepción, factura proveedor, POS, cobro |
| `permissions_and_tenant` | Vendedor sin `purchase.post`; aislamiento básico |
| `partial_ap_and_variance` | Factura parcial GRNI, sobrefacturación rechazada, variación 6200 |
| `rollback_on_fault` | Aborto simulado: sin movimientos/facturas parciales |
| `reconciliation_by_date` | Conciliación por empresa y fecha |

**Pendientes manuales** (listadas al final del JSON): concurrencia dos conexiones (`scripts/db-test-concurrent-last-unit.sh`), devoluciones, cierre caja, impresión física.

## Variación costo provisional vs facturado

- Recepción: DR 1200 / CR 1210 al **costo provisional** de líneas.
- Factura: DR 1210 (hasta `grni_amount_to_clear`) / CR 2000 por **total factura**.
- Diferencia (`invoice_total - grni_cleared`) → cuenta **6200** (documentado en migración 00020).

## Resultados de ejecución (agente 2026-10-09)

| Prueba | Estado |
|--------|--------|
| Todas las automatizadas anteriores | **Pendiente** — sin `STAGING_DATABASE_URL` ni Docker |
| `npm test` / `npm run build` | Ejecutadas en CI local del agente (OK) |

Reporte por prueba: actualice esta tabla tras `npm run db:test:staging` en su proyecto.

## Concurrencia (última unidad)

Dos terminales con el mismo stock preparado: una venta gana, la otra debe recibir `Existencia insuficiente` sin factura huérfana. Ver `supabase/tests/concurrent_last_unit.sql`.
