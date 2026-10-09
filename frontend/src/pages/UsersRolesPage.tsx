import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

export function UsersRolesPage() {
  const qc = useQueryClient();
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('cashier');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

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

  const invite = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('invite_company_member', {
        p_email: inviteEmail.trim(),
        p_role_code: inviteRole,
        p_expires_days: 7,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (token) => {
      const url = `${window.location.origin}/unirse/${token}`;
      setInviteLink(url);
      setMsg('Invitación creada. Comparta el enlace con el empleado (debe registrarse/iniciar sesión con ese correo).');
      void qc.invalidateQueries({ queryKey: ['profiles'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <h1 className="text-2xl font-semibold">Usuarios y roles</h1>
      <p className="text-sm text-slate-600">Los permisos se validan en el servidor. El administrador asigna rol al invitar.</p>

      <PermissionGate permission={PERMISSIONS.usersInvite}>
        <section className="space-y-3 rounded-xl border border-border bg-white p-4">
          <h2 className="font-medium">Invitar empleado</h2>
          <form
            className="flex flex-wrap gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              invite.mutate();
            }}
          >
            <Input label="Correo" type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} required />
            <label className="text-sm">
              Rol
              <select className="mt-1 block rounded-lg border px-3 py-2" value={inviteRole} onChange={(e) => setInviteRole(e.target.value)}>
                {(rolesQuery.data ?? [])
                  .filter((r) => r.code !== 'owner')
                  .map((r) => (
                    <option key={r.id} value={r.code}>
                      {r.name} ({r.code})
                    </option>
                  ))}
              </select>
            </label>
            <Button type="submit" className="self-end" loading={invite.isPending}>
              Generar invitación
            </Button>
          </form>
          {inviteLink ? (
            <p className="break-all rounded-lg bg-slate-50 p-2 font-mono text-xs">{inviteLink}</p>
          ) : null}
          {msg ? <p className="text-sm">{msg}</p> : null}
        </section>
      </PermissionGate>

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
