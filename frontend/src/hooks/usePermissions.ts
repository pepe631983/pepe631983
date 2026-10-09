import { useQuery } from '@tanstack/react-query';
import type { PermissionCode } from '@repuestos/shared';
import { supabase } from '@/lib/supabase';

async function fetchPermission(code: PermissionCode): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_permission', { p_permission: code });
  if (error) {
    if (error.message.includes('JWT')) return false;
    throw error;
  }
  return Boolean(data);
}

export function usePermission(code: PermissionCode) {
  return useQuery({
    queryKey: ['permission', code],
    queryFn: () => fetchPermission(code),
    staleTime: 60_000,
  });
}

export function usePermissions(codes: PermissionCode[]) {
  return useQuery({
    queryKey: ['permissions', ...codes],
    queryFn: async () => {
      const entries = await Promise.all(
        codes.map(async (code) => [code, await fetchPermission(code)] as const),
      );
      return Object.fromEntries(entries) as Record<PermissionCode, boolean>;
    },
    staleTime: 60_000,
  });
}
