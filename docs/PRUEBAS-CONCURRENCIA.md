# Prueba de concurrencia — última unidad (dos conexiones)

## Qué prueba

Dos sesiones `psql` **independientes** contra staging compiten por vender la **última unidad** en stock. Debe cumplirse:

| Métrica | Esperado |
|---------|----------|
| Facturas nuevas | 1 |
| Ventas exitosas | 1 |
| Fallos por stock insuficiente | 1 |

## Cómo ejecutar

```bash
npm run db:test:concurrent
```

Requiere `STAGING_DATABASE_URL` (o Supabase local). Habilita `integration_tests_enabled` de forma transitoria vía `integration_test.prepare_concurrent_last_unit`.

## Resultado real (2026-10-09, host pooler Supabase staging)

```
=== concurrent_last_unit ===
Facturas nuevas: 1 (esperado 1)
Ventas exitosas detectadas: 1 (esperado 1)
Alguna falló por stock: 1
RESULTADO: PASSED
```

## Relación con la suite SQL

- La suite `integration_test.run_suite()` **no** incluye esta prueba (PostgreSQL no permite dos conexiones dentro de la misma transacción `BEGIN … ROLLBACK` de la suite).
- Por eso aparece en `automated_outside_suite` como `npm run db:test:concurrent`, **no** como `pending_manual` por fallo: es un **script aparte con dos conexiones reales**, no una omisión.

## Pendiente manual distinto

- Repetir la misma prueba desde **dos navegadores/POS** en staging (misma SKU, stock 1) cuando exista `VITE_SUPABASE_ANON_KEY` y usuarios de mostrador.
