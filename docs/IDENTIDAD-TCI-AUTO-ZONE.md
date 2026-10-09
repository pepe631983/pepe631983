# Identidad — TCI Auto Zone

Aplicar en **todas las etapas** del ERP.

| Elemento | Valor |
|----------|--------|
| Nombre comercial / app | **TCI Auto Zone** |
| Giro | Repuestos y accesorios para automóviles |
| Ubicación | Turks and Caicos Islands (código país `TC`) |
| Moneda | USD |
| Zona horaria | `America/Grand_Turk` |
| Idioma UI | Español por defecto; inglés con selector (`frontend/src/i18n/`) |
| Colores UI | Azul oscuro `#0c2340`, rojo `#c8102e`, blanco |
| Impuestos | Siempre `tax_config_pending` hasta configuración verificada |

## Código compartido

- `packages/shared/src/branding.ts` — constantes y tipo `DocumentBrandHeader` para impresos.
- `frontend/src/hooks/useCompanyBrand.ts` — datos reales de la empresa (sin inventar dirección, teléfono, logo ni fiscal).

## Documentos futuros

Facturas, recibos, cotizaciones, OC y reportes deben usar `DocumentBrandHeader` + nombre comercial configurado.
