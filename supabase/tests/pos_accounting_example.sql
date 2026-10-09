-- Ejecutar SOLO en entorno de prueba tras migraciones 01–16.
-- Valida idempotencia y asiento balanceado (requiere usuario autenticado en sesión SQL o usar supabase test).

-- Ejemplo manual documentado:
-- 1. create_product + receive_inventory (costo 60)
-- 2. confirm_pos_sale idempotency_key 'test-key-1' venta 100 contado
-- 3. Repetir confirm con misma key → mismo invoice id
-- 4. Verificar journal_lines: cash 100 / sales 100; cogs 60 / inventory 60
