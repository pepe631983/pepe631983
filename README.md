# Repuestos ERP

Sistema profesional para venta de repuestos automotrices: inventario trazable, ventas, tesorería y **contabilidad de partida doble**. Este repositorio se construye **por etapas**; la Etapa 1 ya incluye base de datos, seguridad y configuración inicial.

## Estructura de carpetas

```
/workspace
├── frontend/                 # Aplicación web (React + TypeScript + Vite)
│   ├── src/
│   │   ├── pages/            # Pantallas (login, configuración, etc.)
│   │   ├── components/       # Layout, permisos, UI
│   │   ├── contexts/         # Sesión Supabase
│   │   ├── hooks/            # Permisos (consulta al servidor)
│   │   └── lib/supabase.ts   # Cliente público (solo clave anon)
├── packages/shared/          # Reglas compartidas (dinero, permisos, Zod)
├── supabase/migrations/      # Migraciones versionadas PostgreSQL + RLS
└── docs/PLAN-IMPLEMENTACION.md
```

## Qué hace la Etapa 1 (ahora)

- Registro de **empresa** con sucursal, almacén, políticas, series de documentos y métodos de pago base.
- **Roles**: propietario, gerente, vendedor, cajero, inventario, contador — con **permisos por acción**.
- **Plan de cuentas** mínimo (caja, bancos, CxC, inventario, ventas, COGS, etc.).
- **Auditoría** e **idempotencia** (tablas listas para etapas siguientes).
- **RLS** en Supabase: cada usuario solo ve su empresa.
- Interfaz en **español**: login, alta de empresa, panel, configuración, usuarios/roles, plan de cuentas.

**Aún no operativo:** POS, compras, kardex, asientos automáticos, caja, reportes financieros completos.

## Pasos que usted debe realizar

### 1. Crear proyecto en Supabase

1. Entre en [https://supabase.com](https://supabase.com) y cree un proyecto (anote contraseña de base de datos).
2. En **Project Settings → API**, copie:
   - **Project URL**
   - **anon public** key (no use `service_role` en la computadora del mostrador).

### 2. Aplicar migraciones a la base de datos

En su computadora, con [Docker](https://docs.docker.com/get-docker/) instalado (recomendado):

```bash
cd /ruta/al/repositorio
npm install
npx supabase login
npx supabase link --project-ref SU_PROJECT_REF
npx supabase db push
```

Alternativa sin CLI: en el panel Supabase → **SQL Editor**, ejecute **en orden** cada archivo en `supabase/migrations/` (del `00001` al `00010`).

### 3. Configurar variables de entorno del frontend

```bash
cp .env.example frontend/.env.local
```

Edite `frontend/.env.local` y pegue su URL y clave **anon**.

### 4. Ejecutar la aplicación en desarrollo

```bash
npm run dev
```

Abra la URL que muestra la terminal (por defecto `http://localhost:5173`).

### 5. Primer uso

1. **Crear cuenta** (correo y contraseña).
2. Si Supabase exige confirmación de correo, confirme el enlace antes de continuar.
3. Complete **Registrar empresa** (deje activo *modo demostración* hasta terminar pruebas).
4. Verifique en el panel que aparece su nombre comercial.
5. Entre en **Configuración** y guarde teléfono/dirección (queda registrado en auditoría).

### 6. Entornos separados

- **Desarrollo:** proyecto Supabase local (`npx supabase start`) o un proyecto Supabase de prueba.
- **Producción:** otro proyecto Supabase; mismas migraciones; `.env.local` distinto en el servidor de hosting.
- No publique datos reales de clientes hasta la Etapa 8.

### 7. Respaldo (obligatorio antes de producción)

En Supabase → **Database → Backups**, active respaldos del plan que corresponda.  
Documente una **restauración de prueba** (fecha y resultado) cuando active producción (Etapa 7–8).

## Pruebas automáticas ejecutables ahora

```bash
npm test
```

Prueba reglas de **dinero** y el ejemplo contable simplificado (utilidad bruta 40 sobre venta 100 y costo 60 a nivel de librería; el asiento completo se integrará en Etapa 2).

## Seguridad

- Los permisos se comprueban con funciones SQL (`has_permission`) y **RLS**; ocultar botones no es suficiente.
- Las claves **service_role** solo deben usarse en servidor (Edge Functions futuras), nunca en el navegador.
- Operaciones comerciales confirmadas **no** se guardan en `localStorage`.

## Siguiente etapa (Etapa 2)

Motor contable transaccional + movimientos de inventario (kardex, costo promedio, bloqueo de inventario negativo y costo histórico en salidas).

Consulte `docs/PLAN-IMPLEMENTACION.md` para el roadmap completo.
