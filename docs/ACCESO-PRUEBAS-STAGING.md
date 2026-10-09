# Acceso a pruebas (staging TCI Auto Zone)

## Importante: dos conexiones distintas

| Uso | Variable | Dónde |
|-----|----------|--------|
| Migraciones / SQL / agentes | `STAGING_DATABASE_URL` | Secretos del entorno / `.env` local (nunca en el repo) |
| **Frontend en el navegador** | `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` | `frontend/.env.local` |

`STAGING_DATABASE_URL` **no** configura el frontend. Solo la URL pública del proyecto Supabase y la clave **anon** llegan al navegador.

## Entrar a la versión de pruebas

1. Clonar el repo y rama `cursor/tci-caja-devoluciones-21a4` (o la PR activa hacia `main`).
2. En `frontend/.env.local`:

   ```env
   VITE_SUPABASE_URL=https://<ref>.supabase.co
   VITE_SUPABASE_ANON_KEY=<anon-key-del-proyecto-staging>
   ```

3. Instalar y arrancar:

   ```bash
   npm install
   npm run dev
   ```

4. Abrir la URL local (p. ej. `http://localhost:5173`).
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

## Pendientes (no producción)

- Impresión física en impresoras del negocio (térmica / láser).
- Instalación y verificación en equipos de mostrador (PWA / desktop).
- Validación fiscal/legal de formatos de factura e impuestos en Turks and Caicos.
- Prueba concurrente «última unidad» con dos conexiones (`npm run db:test:concurrent`).

**No declarar producción lista** hasta completar lo anterior en sitio.
