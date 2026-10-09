# Variación entre recepción provisional y factura del proveedor

## Política por defecto (`split_sold_and_remaining`)

1. **Recepción:** costo provisional por línea → DR Inventario (1200) / CR GRNI (1210). El `avg_unit_cost` operativo refleja lo provisional.
2. **Factura:** liquida GRNI por el monto provisional (`grni_cleared`) y registra CxP por el **total factura**.
3. **Diferencia** `total factura − grni_cleared`:
   - Se reparte en proporción a unidades **vendidas** vs **aún en existencia** (desde movimientos `sale` posteriores a la recepción).
   - **Unidades ya vendidas:** va a **6200** (variación en compras vendidas). **No** se reabren facturas POS ni líneas de COGS históricas.
   - **Existencia restante:** se capitaliza en **1200** en el asiento de factura y se ajusta el **`avg_unit_cost` hacia adelante** (solo saldo restante).

## Casos

| Mercancía | Variación +10 sobre GRNI 100 |
|-----------|------------------------------|
| Sin vender | +10 inventario (avg +1 si 10 u.) |
| 50% vendida | +5 en 6200, +5 inventario |
| 100% vendida | +10 en 6200 |

## Política alternativa

`business_policies.supplier_invoice_variance_policy = expense_all_to_6200` (legacy / auditoría específica): toda la diferencia a 6200.

## Inmutabilidad

Documentos confirmados no se editan; la factura de proveedor es un **nuevo** documento con asiento propio y trazabilidad en `supplier_invoices.variance_*`.
