# Paso 2 — Verificar proyecto y aplicar migraciones

## 2.1 Confirmar que es staging

En Supabase Dashboard anote el **Project ref** (subdominio `xxxx.supabase.co`). Debe ser el proyecto **de pruebas**, no producción.

En su máquina (sin pegar contraseñas en el chat):

```bash
cd /ruta/al/repo
npx supabase link --project-ref SU_REF_STAGING
```

## 2.2 Impacto de `db push`

- **No** es un reset: no borra toda la base.
- **Sí** puede crear tablas, columnas, funciones y cambiar comportamiento de RPCs.
- En staging compartido, coordine con el equipo antes de empujar.

```bash
npx supabase db push
```

## 2.3 Habilitar pruebas (solo staging)

En SQL Editor del **mismo** proyecto staging:

```sql
UPDATE public.database_capabilities
SET value = 'true'
WHERE key = 'integration_tests_enabled';
```

## Siguiente: Paso 3 — ejecutar pruebas (`docs/CONECTAR-STAGING-PASO-3.md`).
