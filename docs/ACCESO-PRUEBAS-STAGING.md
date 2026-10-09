# Acceso a pruebas (staging TCI Auto Zone)

## Importante: dos conexiones distintas

| Uso | Variable | Dónde |
|-----|----------|--------|
| Migraciones / SQL / agentes | `STAGING_DATABASE_URL` | Secretos del entorno / `.env` local (nunca en el repo) |
| **Frontend en el navegador** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | `frontend/.env.local` |

`STAGING_DATABASE_URL` **no** configura el frontend. Solo la URL pública del proyecto Supabase y la clave **anon** llegan al navegador.

## Entrar a la versión de pruebas

1. Clonar el repo y rama `cursor/tci-caja-devoluciones-21a4` (o la PR activa hacia `main`).
2. Generar `frontend/.env.local` (solo claves públicas):

   ```bash
   # Requiere STAGING_DATABASE_URL en el entorno (agente/CLI) y el secreto:
   export VITE_SUPABASE_ANON_KEY=<anon-key Dashboard → Settings → API>
   npm run env:frontend-staging
   ```

   | Variable | Obligatoria | Origen |
   |----------|-------------|--------|
   | `VITE_SUPABASE_URL` | Sí | Se deriva de `STAGING_DATABASE_URL` (`https://dcfqaubuehnkniqcfvyg.supabase.co` en staging actual) o se exporta manualmente |
   | `VITE_SUPABASE_ANON_KEY` | **Sí** | **No** está en `STAGING_DATABASE_URL`; debe venir del Dashboard Supabase (clave **anon public**) |

   Si falta **solo** `VITE_SUPABASE_ANON_KEY`, el script `npm run env:frontend-staging` termina con código 2 e indica ese nombre exacto.

3. Validar clave publica (anon `eyJ...` o publishable `sb_publishable_...`):

   ```bash
   npm run validate:supabase-key
   ```

4. Instalar y arrancar:

   ```bash
   npm install
   npm run env:frontend-staging
   npm run dev:staging
   ```

5. Abrir la URL local: `http://localhost:5173` (si el puerto está ocupado, Vite puede usar 5174; mire la consola).
5. En el **panel principal** verifique la línea «Proyecto Supabase (navegador)» — el host debe ser el de **staging**, no otro proyecto.
6. Crear usuario → registrar empresa (modo demostración recomendado).

## Escenario manual en pantallas (E2E)

Orden sugerido (resultados esperados = conciliación con deltas **0** en inventario libro vs GL, CxC operacional vs GL y asientos cuadrados):

1. **Compras → Proveedores** — alta proveedor.
2. **Recepciones** — recepción compra pendiente factura.
3. **Facturas proveedor** — registrar factura contra recepción.
4. **Tesorería → Caja** — apertura con fondo inicial.
5. **Configuración → Impuestos** — crear tasa (usted define el %; no hay tasa inventada).
6. **POS** — venta contado (opcional: tasa + sesión de caja abierta).
7. **POS** — venta crédito.
8. **Cobros** — cobro parcial (con caja abierta).
9. **Devoluciones** — parcial sobre factura contado (requiere caja para reembolso efectivo).
10. **Caja** — cierre con efectivo contado = esperado (diferencia 0).
11. **Contabilidad → Conciliación** — revisar tabla de diferencias (deltas en 0).
12. **POS → Reimprimir COPIA** — no debe crear nuevos asientos contables.

Compare columnas **Esperado / Obtenido / Delta** en conciliación tras el escenario.

## Pruebas SQL (staging)

Con integración habilitada solo en el proyecto de prueba:

```bash
STAGING_ALLOW_PUSH=1 npm run db:staging:validate
```

Incluye suite `integration_test.run_suite()` (escenario referencia, idempotencia, caja/devoluciones E2E, redondeo impuesto, etc.).

## Pruebas automatizadas vs manuales

| Tipo | Comando / acción | Estado |
|------|------------------|--------|
| SQL integración (11 casos) | `npm run db:test:staging` | Automatizado en staging |
| Concurrencia 2× psql | `npm run db:test:concurrent` | Automatizado (ver `docs/PRUEBAS-CONCURRENCIA.md`) |
| E2E navegador staging | `npm run dev` + flujo en pantallas | **Manual pendiente** hasta configurar `VITE_SUPABASE_ANON_KEY` |
| Impresión física | Impresoras del local | **No realizada** |

## Acceso desde Windows (su PC)

El localhost del Cloud Agent **no** es el de su equipo. Use **[ACCESO-WINDOWS-STAGING.md](./ACCESO-WINDOWS-STAGING.md)** (PowerShell): clone, `frontend\.env.local`, `npx vite`, abrir `http://127.0.0.1:5173/login`.

Credenciales de prueba: usuario creado en **Dashboard → Authentication** (no SQL). Para automatización en el agente, configure secretos `STAGING_UI_TEST_EMAIL` y `STAGING_UI_TEST_PASSWORD` (ver `scripts/seed-staging-ui-user.md`).

## Enlace publicado

No hay despliegue web público en este repositorio. La versión de pruebas es **local en su máquina** o en el agente (solo visible dentro de la VM).

## Pendientes (no producción)

- Impresión física en impresoras del negocio (térmica / láser).
- Instalación y verificación en equipos de mostrador (PWA / desktop).
- Validación fiscal/legal de formatos de factura e impuestos en Turks and Caicos.
- Prueba concurrente «última unidad» con dos conexiones (`npm run db:test:concurrent`).

**No declarar producción lista** hasta completar lo anterior en sitio.
