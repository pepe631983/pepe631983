import type { PermissionCode } from '@repuestos/shared';
import type { ReactNode } from 'react';
import { usePermission } from '@/hooks/usePermissions';

type Props = {
  permission: PermissionCode;
  children: ReactNode;
  fallback?: ReactNode;
};

/** Ocultar UI no es seguridad; el servidor valida con RLS y funciones. */
export function PermissionGate({ permission, children, fallback = null }: Props) {
  const { data, isLoading } = usePermission(permission);
  if (isLoading) return null;
  if (!data) return <>{fallback}</>;
  return <>{children}</>;
}
