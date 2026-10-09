# Paso 3 — Ejecutar pruebas (sin reset)

Con `STAGING_DATABASE_URL` ya configurado como secreto del entorno:

```bash
npm run db:test:staging
```

El script:

1. Muestra host/puerto detectado (**sin** imprimir la URI).
2. Ejecuta `BEGIN` → `integration_test.run_suite()` → `ROLLBACK`.

Concurrencia (dos conexiones):

```bash
npm run db:test:concurrent
```

## Tras validar en staging

En SQL Editor (staging), desactivar pruebas:

```sql
SELECT public.disable_integration_tests();
SELECT integration_test.assert_tests_disabled();  -- solo postgres/service_role
```

O desde shell con la misma URI (secreto):

```bash
npm run db:integration:off
```

## Producción

- **No** poner `integration_tests_enabled = true`.
- Las funciones `integration_test.*` no están granted a `authenticated`.
