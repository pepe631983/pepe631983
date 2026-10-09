# Resultados de pruebas — TCI Auto Zone

Fecha de ejecución en agente cloud: 2026-10-09.

## Automatizadas (OK)

| Prueba | Comando | Resultado |
|--------|---------|-----------|
| Dinero / utilidad bruta | `npm test` | 9 tests passed |
| Plantillas 58 mm, 80 mm, carta, A4 (40 líneas, descuentos) | `renderHtml.stress.test.ts` | OK |
| Build frontend + PWA SW | `npm run build` | OK |
| Empaquetado Electron (Linux unpacked) | `npm run desktop:pack` | OK → `desktop/release/linux-unpacked/` |

## No ejecutadas aquí (requieren su entorno)

| Prueba | Motivo |
|--------|--------|
| Instaladores `.exe` / `.dmg` firmados | Requiere Windows/macOS + certificados |
| `run_commercial_integration_tests()` (migr. 00019) | Sin Docker/Supabase local en agente — ver `docs/PRUEBAS-INTEGRACION.md` |
| Impresión física térmica / red | Sin hardware |
| PWA en iPhone / Android real | Requiere dispositivo + HTTPS |
| Concurrencia dos dispositivos mismo print job | Requiere dos clientes contra BD |

## Hardware / validated_on_site

**Ningún modelo** marcado como `validated_on_site`. Matriz en `data/compatibility-matrix.json` mantiene `validated_lab` o `requires_on_site_test`.

## Checklist pendiente en el negocio

Ver `preProductionChecklist` en `compatibility-matrix.json`.
