import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabase';

export function UsersRolesPage() {
  const rolesQuery = useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('roles').select('id, code, name, is_system').order('name');
      if (error) throw error;
      return data;
    },
  });

  const profilesQuery = useQuery({
    queryKey: ['profiles'],
    queryFn: async () => {
      const { data, error } = await supabase.from('profiles').select('user_id, full_name, is_active');
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Usuarios y roles</h1>
      <p className="text-sm text-slate-600">
        Los permisos se validan en el servidor. Invitar usuarios adicionales se habilitará en una siguiente entrega con flujo de invitación.
      </p>
      <section className="rounded-xl border border-border bg-white p-4">
        <h2 className="font-medium">Usuarios de la empresa</h2>
        <ul className="mt-2 text-sm">
          {profilesQuery.data?.map((p) => (
            <li key={p.user_id} className="border-b border-slate-100 py-2">
              {p.full_name} {p.is_active ? '' : '(inactivo)'}
            </li>
          ))}
        </ul>
      </section>
      <section className="rounded-xl border border-border bg-white p-4">
        <h2 className="font-medium">Roles del sistema</h2>
        <ul className="mt-2 text-sm">
          {rolesQuery.data?.map((r) => (
            <li key={r.id} className="flex justify-between border-b border-slate-100 py-2">
              <span>{r.name}</span>
              <span className="text-slate-500">{r.code}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
