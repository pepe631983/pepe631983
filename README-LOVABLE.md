# TCI Auto Zone — paquete para Lovable (solo apariencia)

Este ZIP corresponde a la rama **`cursor/requisitos-cliente-21a4` (PR #5)**: motor comercial (POS, tesorería, caja, devoluciones, integración) más requisitos de cliente Etapa A/B (cotizaciones, enlaces públicos, invitaciones, ficha cliente 360, cobros combinados, exportación).

**Objetivo en Lovable:** mejorar **UI/UX, Tailwind, componentes visuales, layout, branding e i18n de textos**. **No** cambiar reglas de negocio, RPCs, permisos ni contratos de datos.

## Arranque del frontend

Requisitos: **Node.js ≥ 20**, npm.

```bash
cd tci-auto-zone-lovable   # raíz del ZIP descomprimido
npm install
cp .env.example frontend/.env.local
# Edite frontend/.env.local: VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY (clave anon publica)
npm run dev
```

La app queda en `http://127.0.0.1:5173` (Vite). Build de producción: `npm run build`.

Variables: ver `.env.example` en la raíz (valores vacíos; no incluir secretos en el repositorio de diseño).

## Qué SÍ puede modificarse (apariencia)

| Área | Rutas típicas |
|------|----------------|
| Estilos globales / Tailwind | `frontend/src/index.css`, `tailwind.config.js` |
| Shell y navegación | `frontend/src/components/Layout.tsx`, menús, iconos |
| Componentes presentacionales | `frontend/src/components/ui/*` (si existen), clases en páginas |
| Branding / copy visible | `frontend/src/i18n/locales/es.json`, `en.json`, assets en `frontend/public/` |
| Páginas (markup y estilos) | `frontend/src/pages/*.tsx` **manteniendo** llamadas a Supabase y nombres de RPC |

Puede reorganizar JSX y clases CSS siempre que **no elimine** comprobaciones de permisos (`usePermission`, guards) ni altere payloads de `supabase.rpc` / `.from()`.

## Qué NO debe tocarse (lógica que debe conservarse)

| Área | Por qué |
|------|---------|
| `supabase/migrations/*.sql` | Esquema, RLS, funciones RPC, motor comercial e integración |
| `packages/shared/` | Validaciones Zod, dinero, constantes de permisos |
| `frontend/src/lib/supabase.ts` | Cliente anon; sin service_role |
| `frontend/src/hooks/usePermission*.ts` | Autorización alineada con backend |
| RPC y flujos críticos en páginas | Cotizaciones (`QuotesPage`, `PublicQuotePage`), POS (`PosTerminal`, `PosPage`), **Caja** (`CashPage` pestañas mostrador/arqueo), cobros (`CustomerPaymentsPage`), export (`DataExportPage`), invitaciones (`JoinCompanyPage`, `UsersRolesPage`) |
| `frontend/e2e/*.spec.ts` | Contratos de comportamiento en staging |
| `scripts/db-*.sh`, `scripts/*staging*` | Operación y pruebas; no necesarios para diseño pero no reescribir lógica SQL desde el frontend |

Migraciones clave del alcance entregado: `00017`–`00021` (comercio/POS), `00025` (caja/devoluciones), `00032`–`00042` (tesorería/controles), `00043`–`00046` (requisitos cliente).

## Estructura del monorepo

```
frontend/           # React + Vite + TypeScript (foco Lovable)
packages/shared/    # Lógica compartida — no duplicar en UI
supabase/migrations/
docs/               # Matriz requisitos, hosting, pruebas
scripts/            # Deploy, staging, empaquetado
desktop/            # Electron (opcional; no requerido para rediseño web)
```

Documentación de negocio: `docs/REQUISITOS-CLIENTE-MATRIZ.md`, `docs/IDENTIDAD-TCI-AUTO-ZONE.md`.

## Pruebas (referencia)

Tras cambios solo visuales, conviene `npm run lint -w frontend` y, con credenciales de QA, Playwright staging (`npm run test:ui-staging-browser`). Este ZIP **no** incluye `.env`, `node_modules` ni builds generados.

## Contacto técnico

Para cambios de reglas de negocio o nuevas RPC, coordinar con el equipo backend; Lovable debe limitarse a la capa de presentación descrita arriba.
