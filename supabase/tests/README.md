# Pruebas de base de datos

Ejecute con Supabase local:

```bash
npx supabase start
npx supabase db reset
psql "postgresql://postgres:postgres@127.0.0.1:54322/postgres" -f supabase/tests/stage2_accounting_example.sql
```

El archivo `stage2_accounting_example.sql` se añadirá en la Etapa 2 para validar el ciclo compra → venta crédito → COGS → cobro.
