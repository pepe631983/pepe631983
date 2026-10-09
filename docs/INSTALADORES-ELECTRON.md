# Instaladores Electron — TCI Auto Zone

## Generar instaladores

Requisitos en **su** máquina de compilación:

| Plataforma | SO de build recomendado | Salida |
|------------|-------------------------|--------|
| Windows | Windows 10/11 | `.exe` (NSIS) |
| macOS | macOS 12+ | `.dmg` |

En este entorno Linux CI **no** se generaron instaladores firmados (falta Windows/macOS nativo).

```bash
npm run build -w frontend
npm run pack -w tci-auto-zone-desktop    # script electron-builder
```

Artefactos: `desktop/release/`

## Firma y distribución pendiente (obligatorio antes de producción)

### Windows

- Certificado **Authenticode** (EV recomendado para SmartScreen).
- Variable `CSC_LINK` o `win.sign` en electron-builder.
- Sin firma: Windows SmartScreen advertirá al usuario.

### macOS

- Cuenta **Apple Developer** (99 USD/año).
- Firma con `Developer ID Application` + **notarización** (`notarytool`).
- Sin notarización: Gatekeeper bloqueará la app.

### Actualizaciones

- Servidor de actualizaciones (p. ej. S3 + `electron-updater`) **no configurado** aún.
- La PWA y la web siguen el flujo `registerType: prompt` separado.

## Pruebas automatizadas vs hardware

- `npm test` valida plantillas HTML (58/80/carta/A4) — **no** sustituye prueba física.
- No marque `validated_on_site` en `compatibility-matrix.json` sin acta de prueba en el negocio.
