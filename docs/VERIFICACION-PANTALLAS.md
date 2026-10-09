# Verificación manual de pantallas comerciales

Use empresa en **modo demostración**. Cada paso debe completarse sin error; la contabilidad la valida el servidor (RPC).

| Pantalla | Ruta | Permiso | Qué comprobar |
|----------|------|---------|----------------|
| Proveedores | `/compras/proveedores` | `purchase.create` | Crear proveedor y verlo en lista. |
| Recepción compra | `/compras/recepciones` | `purchase.post` | Recepción con proveedor; existencia sube; GRNI abierto > 0. |
| Factura proveedor | `/compras/facturas-proveedor` | `purchase.post` | Cierra GRNI; CxP aumenta; variación si total ≠ GRNI. |
| Alta inventario | `/inventario/alta` | `purchase.post` | Saldo inicial: inventario/capital (no GRNI). |
| Clientes | `/ventas/clientes` | `sales.confirm` | Alta de cliente. |
| POS crédito | `/pos` | `sales.pos` | Venta crédito; CxC operativa sube. |
| Cobros | `/ventas/cobros` | `payment.collect` | Cobro parcial; caja sube; CxC baja; ventas 4000 sin duplicar. |
| Conciliación | `/contabilidad/conciliacion` | `reports.financial` | Diferencias ≈ 0; fecha de corte. |

Orden sugerido: proveedor → producto (alta) → recepción compra → factura proveedor → ventas → cobro → conciliación.
