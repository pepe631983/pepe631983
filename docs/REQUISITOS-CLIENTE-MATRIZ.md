# Requisitos cliente TCI Auto Zone — matriz de cumplimiento

**Última revisión UTC:** 2026-10-09  
**Base de código:** `cursor/repuestos-erp-etapa1-21a4` + merge motor comercial/caja (`00032`–`00043`)

Leyenda de **estado:** **Implementado** | **Parcial** | **Pendiente** | **No aplica (alcance explícito)**

| # | Requisito | Estado | Qué hay hoy | Pruebas realizadas | Pendiente |
|---|-----------|--------|-------------|-------------------|-----------|
| **1** | **Cotizaciones online** | **Parcial** | Tablas `sales_quotes`, líneas, enlaces públicos revocables (`00043`). UI `/ventas/cotizaciones`, vista pública `/c/:token` (sin auth). RPC: crear, enlace, revocar, aceptar (no pago), convertir a venta con chequeo de stock. Impresos: perfil `quote` en impresión (PDF vía flujo existente — botón dedicado en UI cotización **pendiente**). | Migración + UI manual en agente **pendiente** tras `db push` staging. Playwright flujo comercial previo **PASS** (no incluye cotizaciones aún). | PDF one-click en cotización; prueba E2E cotización→enlace→aceptar→convertir; multi-línea y descuentos avanzados en UI. |
| 1a | Cliente, repuestos, cantidades, precios, descuentos, impuestos, vencimiento | Parcial | RPC `create_sales_quote` (líneas JSON, `valid_until`, `tax_rate_id` opcional). UI actual: 1 producto por formulario. | SQL manual post-migración | Formulario multi-línea; selector impuesto en UI. |
| 1b | PDF y enlace WhatsApp/correo | Parcial | Acciones copiar / `wa.me` / `mailto` con URL `/c/{token}`. | — | PDF desde cotización (reutilizar `PrintingPage` / cola). |
| 1c | Enlace aislado, revocable | Implementado | Token hash SHA-256; `revoke_quote_public_link`; vista pública sin costos ni otros docs. | — | Prueba revocación en staging. |
| 1d | Aceptación ≠ pago; conversión sin duplicar | Implementado | `accept_public_quote` solo marca aceptada; `convert_quote_to_sale` exige `accepted`, usa `confirm_pos_sale` e idempotencia, enlaza `converted_invoice_id`. | — | E2E UI/API cotización. |
| 1e | Verificar existencias al convertir | Implementado | `convert_quote_to_sale` compara `inventory_balances.quantity` vs líneas. | Suite integración existente para POS **PASS**; caso quote **pendiente** test dedicado. | Test `integration_test` cotización. |
| **2** | **Varios vendedores** | **Parcial** | Auth Supabase por usuario; RBAC; `created_by` / `audit_log` en operaciones comerciales; inventario centralizado por empresa. | `npm run db:test:concurrent` (2× psql última unidad) **PASS** en staging (rama caja). | UI E2E dos navegadores; invitación de usuarios (hoy solo owner en `/usuarios`). |
| 2a | Cuenta y permisos por empleado | Parcial | Roles `seller`, `cashier`, etc.; permisos granulares. | Login probe staging **PASS** | Flujo invitación / alta empleados. |
| 2b | Ventas simultáneas | Parcial | POS + idempotencia + bloqueo inventario en confirmación. | Concurrencia SQL **PASS** | Dos sesiones UI simultáneas documentadas. |
| 2c | Trazabilidad crear/confirmar/cobrar/revertir | Parcial | `audit_log`, `created_by` en facturas/cobros; reversión aislada documentada en migraciones comerciales. | Suite SQL controles **PASS** | Informe por usuario en UI. |
| 2d | “Vender online” = empleados remotos | Parcial | SPA + Supabase (acceso remoto vía hosting HTTPS). Tienda pública comprador **No aplica** hasta solicitud. | — | Despliegue HTTPS (§4). |
| **3** | **Consultar inventario** | **Parcial** | RPC `search_inventory_availability` (físico, reservado cotizaciones sent/accepted, disponible; costo si `cost.view`). UI `/inventario/consulta`. OEM + fitments (`product_vehicle_fitments`). | — | Prueba UI búsqueda; reservas por pedidos futuros. |
| **4** | **Acceso desde cualquier lugar** | **Parcial** | PWA-ready Vite; auth + RLS por empresa. Docs Windows + staging Supabase. | UI Playwright **PASS** (agente). | **URL HTTPS pública estable** para cliente (Firebase App Hosting / similar) — ver `docs/ACCESO-HOSTING-PRUEBAS.md`. |
| **5** | **Clientes** | **Parcial** | Alta básica; columnas email/teléfono/crédito; tablas contactos/vehículos; RPC duplicados. UI duplicados antes de crear. | — | Edición completa, historial cot/ventas/cobros/deuda en ficha cliente. |
| **6** | **Formas de pago** | **Parcial** | Catálogo `payment_methods` (cash/card/transfer/check/other); cobros parciales POS/caja; cuentas GL 1020 tarjeta pendiente en seed. | Tesorería E2E SQL **PASS** | Detalle transferencia/cheque/estados; pagos combinados UI; pasarela **solo tras proveedor** — no simular éxito. |
| **7** | **Exportación y migración** | **Parcial** | RPC `export_company_snapshot` (JSON v1); script `npm run export:company`. CSV por entidad **pendiente**. | — | CSV, adjuntos, totales control, adaptador destino bajo demanda. |

## Pruebas de interfaz actuales (motor comercial)

| Prueba | Resultado | Notas |
|--------|-----------|--------|
| `npm run auth:probe-ui-login` | **PASS** (staging, secretos) | |
| `npm run test:ui-staging-e2e` (API) | **PASS** | 16 pasos |
| `npm run test:ui-staging-browser` (Playwright) | **PASS** | Tras fix caché caja en devoluciones |
| Flujo cotizaciones UI | **Pendiente** | Tras aplicar migración `00043` en staging |

## Etapas siguientes (sin reemplazar el ERP)

1. **Etapa A (hecho en repo):** migración `00043` + pantallas cotización, consulta inventario, duplicados clientes.  
2. **Etapa B:** ficha cliente 360°, pagos combinados + metadatos cheque/transferencia, export CSV.  
3. **Etapa C:** hosting HTTPS producción/pruebas + E2E cotizaciones + dos vendedores UI.  
4. **Etapa D:** pasarela real cuando el cliente indique proveedor; tienda pública solo si se solicita.

## Comandos

```bash
STAGING_ALLOW_PUSH=1 npm run db:staging:validate   # tras push 00043
npm run test:ui-staging-browser
npm run export:company                             # JSON snapshot (requiere data.export)
```
