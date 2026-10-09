# PWA, web adaptable y escritorio — TCI Auto Zone

## Web + PWA

- Frontend **responsive** (teléfono, tablet, PC).
- **PWA** vía `vite-plugin-pwa`: icono, modo standalone, caché de assets.
- **No** equivale a app nativa: el navegador **no** garantiza USB/BT/ESC/POS.

### Instalar PWA

1. Publique el frontend (HTTPS obligatorio).
2. Chrome/Edge Android o desktop: menú → **Instalar aplicación**.
3. iOS Safari: **Compartir → Añadir a inicio** (limitaciones de iOS aplican).

## Escritorio (Electron)

Carpeta `desktop/` — Windows y macOS.

```bash
npm install
npm run dev -w frontend          # terminal 1
npm run start:dev -w tci-auto-zone-desktop   # terminal 2
```

Expone `window.electronAPI.listPrinters()` e impresión directa a impresora instalada.

## Cola de impresión

- Persistente en PostgreSQL (`print_jobs`).
- Recuperación al abrir la app: trabajos `pending`, `sending` (obsoletos → `uncertain`), sin reintento automático.
- Matriz de compatibilidad: `data/compatibility-matrix.json` (copia servida en `/compatibility-matrix.json`).

## Antes de producción

Ejecute la checklist en `compatibility-matrix.json` en **sus** equipos reales.
