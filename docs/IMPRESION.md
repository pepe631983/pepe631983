# Impresión — TCI Auto Zone

## Fase actual (web)

| Función | Estado |
|---------|--------|
| Carta / A4 (factura, cotización, OC, reportes) | HTML + `@page` + diálogo del sistema / PDF |
| Térmico 58 mm / 80 mm | Diseños CSS dedicados |
| Vista previa, prueba, reimpresión **COPIA** | Pantalla `/impresion` |
| Registro de trabajos | Tabla `print_jobs` |
| ESC/POS, RawBT, Electron directo | **No implementado** (fase posterior) |

## Archivos

- `packages/shared/src/printing/renderHtml.ts` — plantillas HTML
- `frontend/src/print/printOrchestrator.ts` — registro + PDF / diálogo
- `supabase/migrations/20241009000012_printing.sql` — perfiles y log

## Reglas de negocio

1. **Confirmar venta ≠ imprimir.** La impresión usa documentos ya confirmados (hoy: documento de prueba).
2. **Reimprimir** no crea ventas, cobros ni movimientos de inventario.
3. **Estados:** `sent_to_spooler` ≠ papel impreso; `unknown` si el navegador no confirma; **sin reintento automático**.
4. **No ESC/POS** hasta validar modelo y canal (Electron / RawBT).

## Plataformas

- **Windows:** impresoras instaladas vía diálogo del navegador; Electron futuro para impresora predeterminada.
- **Android:** diálogo del sistema; RawBT opcional más adelante.
- **iOS/iPadOS:** AirPrint si aparece en el diálogo; PDF siempre disponible.

## Migración

```bash
npx supabase db push
```

Aplica `20241009000012_printing.sql` si aún no está en su proyecto.
