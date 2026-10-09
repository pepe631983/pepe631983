# Plan de implementación — Repuestos ERP

## Arquitectura

| Capa | Ubicación | Responsabilidad |
|------|-----------|-----------------|
| Interfaz | `frontend/src` | React + TypeScript, español, POS (etapas 4+) |
| Reglas compartidas | `packages/shared` | Validaciones Zod, permisos, dinero exacto |
| Datos y reglas críticas | `supabase/migrations` | PostgreSQL, RLS, funciones transaccionales |
| Operaciones sensibles | `supabase/functions` (próximas etapas) | Confirmaciones con transacciones e idempotencia |

## Etapas

1. **Hecho en esta entrega:** empresa multi-sucursal (base), RBAC, configuración, plan de cuentas sembrado, auditoría, auth UI.
2. Motor contable (asientos balanceados, COGS histórico) + movimientos de inventario/kardex.
3. Productos, compatibilidad vehículos, compras y recepción.
4. POS, ventas, cobros, numeración concurrente.
5. Crédito, proveedores, caja y bancos.
6. Devoluciones y garantías.
7. Reportes, conciliaciones, respaldos documentados.
8. Pruebas integrales y producción.

## Criterio transversal

Toda operación **confirmada** debe ejecutarse en **una transacción** PostgreSQL, con **idempotency_key** y sin inventario negativo por defecto.
