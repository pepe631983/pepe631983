# Pruebas de integración — motor comercial y contable

**No ejecute estas pruebas en producción.** Use un proyecto Supabase separado (staging) o Supabase local.

## Requisitos

1. [Docker Desktop](https://docs.docker.com/get-docker/) o Podman en PATH (`docker` o `podman`).
2. Node.js 20+ y dependencias del monorepo (`npm install` en la raíz).
3. Supabase CLI (`npx supabase --version`).

## Configurar entorno local de prueba

```bash
cd /ruta/al/repo
npm install
npx supabase start
npx supabase db reset
```

`db reset` aplica todas las migraciones en `supabase/migrations/` sobre una base vacía.

## Ejecutar la suite automatizada

```bash
npm run db:test
```

Equivalente manual:

```bash
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" \
  -f supabase/tests/integration_commercial_engine.sql
```

La función `run_commercial_integration_tests()` devuelve JSON con **esperado vs obtenido** para:

| Métrica | Escenario de referencia |
|---------|-------------------------|
| Existencias | 10 compradas − 3 contado − 2 crédito = **5** unidades |
| Valor inventario | 5 × 60 = **300** USD |
| Caja | 300 contado + 120 cobro = **420** |
| Cuentas por cobrar | 200 − 120 = **80** |
| Cuentas por pagar | Recepción 600 facturada = **600** |
| Ventas netas | 300 + 200 = **500** |
| Costo de ventas | (3+2) × 60 = **300** |
| Utilidad bruta | **200** |
| Débitos = créditos | Totales del libro confirmado |

También valida:

- Recepción de compra con contrapartida GRNI (1210) sin duplicar inventario al facturar proveedor.
- Idempotencia POS (reintento OK, payload distinto rechazado).
- Venta con existencia insuficiente (no deja documentos parciales).
- Reimpresión sin nuevos asientos contables.
- Aislamiento básico entre empresas.

## Staging remoto (sin Docker local)

1. Cree un **segundo proyecto** Supabase (staging).
2. Enlace: `npx supabase link --project-ref <staging-ref>`.
3. Aplique migraciones: `npx supabase db push` (nunca en producción sin revisión).
4. En SQL Editor, ejecute como **service role** (o desde `psql` con la URI de servicio):

```sql
SELECT public.run_commercial_integration_tests();
```

5. Revise el JSON; si `status` ≠ `passed`, no promueva a producción.

## Pruebas pendientes en este entorno cloud

| Prueba | Estado |
|--------|--------|
| `run_commercial_integration_tests()` | **No ejecutada** — Docker no disponible en el agente |
| Concurrencia real (dos sesiones simultáneas última unidad) | Requiere dos conexiones `psql` o k6 |
| Fallo intermedio (kill conexión mid-RPC) | Requiere prueba de caos manual |
| Devoluciones / caja / bancos | Etapas comerciales siguientes |

## Pantalla de conciliación

Tras iniciar sesión en la app con permiso `reports.financial` o `accounting.journal.view`, abra **Contabilidad → Conciliación** (`/contabilidad/conciliacion`). Consulta el RPC `get_financial_reconciliation` y muestra diferencias entre inventario operativo, CxC operacional y saldos del mayor.
