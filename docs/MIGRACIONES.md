# Migraciones — revisión antes de producción

## Orden

Aplique en secuencia `20241009000001` … `20241009000016` (y posteriores).

## Entornos

1. Identifique el proyecto Supabase (**dev / staging / prod**).
2. Tome **backup** (Supabase Dashboard → Database → Backups).
3. Ejecute primero en **staging**.
4. Revise logs de `db push` o SQL Editor.

## Impacto reciente

| Migración | Cambio |
|-----------|--------|
| 14 | `claim_print_job`, RLS insert print_jobs bloqueado |
| 15 | Productos, inventario, ventas |
| 16 | `confirm_pos_sale`, `receive_inventory`, reimpresión |

## Rollback

No hay rollback automático. Restaure desde backup si falla.
