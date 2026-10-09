# Resultados de pruebas — TCI Auto Zone

Fecha de ejecución en agente cloud: 2026-10-09.

## Automatizadas (OK)

| Prueba | Comando | Resultado |
|--------|---------|-----------|
| Dinero / utilidad bruta | `npm test` | 9 tests passed |
| Plantillas 58 mm, 80 mm, carta, A4 (40 líneas, descuentos) | `renderHtml.stress.test.ts` | OK |
| Build frontend + PWA SW | `npm run build` | OK |
| Empaquetado Electron (Linux unpacked) | `npm run desktop:pack` | OK → `desktop/release/linux-unpacked/` |

## Integración SQL (motor comercial)

Entorno del agente: **127.0.0.1:54322** no alcanzable (sin Supabase local); **`STAGING_DATABASE_URL` no configurada**.

| Prueba SQL | Estado |
|------------|--------|
| `reference_scenario` | Pendiente |
| `idempotency_all_ops` | Pendiente |
| `permissions_and_tenant` | Pendiente |
| `partial_ap_and_variance` | Pendiente |
| `rollback_on_fault` | Pendiente |
| `reconciliation_by_date` | Pendiente |
| Concurrencia 2 conexiones | Pendiente manual |
| Devolución + cierre caja | No implementado aún |

Ejecutar en staging: `npm run db:test:staging` (ver `docs/PRUEBAS-INTEGRACION.md`).

## No ejecutadas aquí (otros)

| Prueba | Motivo |
|--------|--------|
| Instaladores `.exe` / `.dmg` firmados | Requiere Windows/macOS + certificados |
| Impresión física térmica / red | Sin hardware |
| PWA en iPhone / Android real | Requiere dispositivo + HTTPS |
| Concurrencia dos dispositivos mismo print job | Requiere dos clientes contra BD |

## Hardware / validated_on_site

**Ningún modelo** marcado como `validated_on_site`. Matriz en `data/compatibility-matrix.json` mantiene `validated_lab` o `requires_on_site_test`.

## Checklist pendiente en el negocio

Ver `preProductionChecklist` en `compatibility-matrix.json`.
