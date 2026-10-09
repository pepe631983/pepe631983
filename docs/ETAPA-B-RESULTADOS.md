# Etapa B — resultados en staging

Fecha: generado tras validación en rama `cursor/requisitos-cliente-21a4` (PR #5).

## Entorno

- Supabase staging: `dcfqaubuehnkniqcfvyg.supabase.co`
- Migraciones aplicadas: `00043`, `00044`, `00045` (pgcrypto / enlaces públicos)
- SQL: `npm run db:staging:validate` — suite integración + concurrencia última unidad **OK**

## URL HTTPS de pruebas

**Publicada:** https://tci-auto-zone.web.app (Firebase Hosting, proyecto `tci-auto-zone`, deploy 2026-10-09 UTC).

Alias: https://tci-auto-zone.firebaseapp.com

Frontend embebido: solo Supabase staging `dcfqaubuehnkniqcfvyg` + clave anon/publicable.

## Resultados por requisito

| # | Requisito | Resultado | Evidencia |
|---|-----------|-----------|-----------|
| 1 | Cotizaciones multi-repuesto, PDF, enlace revocable, aceptación, conversión | **OK UI + RPC** | Playwright `staging-client-etapa-b.spec.ts`; enlace anónimo sin costos; `00045` corrige `digest` |
| 2 | Invitación empleados con rol | **OK UI + RPC** | `/usuarios` → invitar; canje `/unirse/:token` |
| 3 | Inventario + ficha cliente 360 | **OK UI + RPC** | `/inventario/consulta`, `/ventas/clientes/:id` → `get_customer_360` |
| 4 | Cobros combinados / cheques / transferencias / tarjeta | **OK UI + RPC** | `/ventas/cobros` modo combinado; `reject_customer_check_tender` |
| 5 | Export CSV/JSON + totales control | **OK UI + RPC** | `/configuracion/exportacion` → `export_company_bundle` |
| 6 | Hosting HTTPS staging | **Config listo** | `firebase.json`; pendiente deploy con proyecto Firebase del cliente |

## Flujo repetible (UI)

1. **Cotización:** Ventas → Cotizaciones → agregar 2+ líneas → Crear → Enlace última cotización → abrir `/c/...` en ventana privada → Aceptar → volver autenticado → Convertir venta.
2. **Invitación:** Usuarios y roles → Invitar empleado → copiar `/unirse/...` → el invitado inicia sesión con ese correo.
3. **Cliente 360:** Clientes → Ficha 360 → vehículos, cotizaciones, ventas, deuda y saldo a favor.
4. **Cobro combinado:** Cobros → Cobro combinado → factura crédito → efectivo + cheque → registrar; rechazar cheque en listado si aplica.
5. **Export:** Exportación → Generar exportación.

## Pendientes (cliente / hardware)

- Pasarela de pagos en línea (no simulada, por diseño).
- Tienda pública B2C completa.
- Impresión física de tickets (depende de hardware local / RawBT / Desktop).
- URL HTTPS estable: deploy Firebase/Cloudflare con dominio acordado.
