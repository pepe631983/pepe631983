import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

export function CustomersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [duplicates, setDuplicates] = useState<Array<{ id: string; name: string; match_reason: string }>>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
  });

  const checkDupes = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('find_customer_duplicates', {
        p_name: name,
        p_email: email || null,
        p_phone: phone || null,
      });
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string; match_reason: string }>;
    },
    onSuccess: (rows) => setDuplicates(rows),
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_customer', { p_name: name });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setName('');
      setMsg(t('customers.saved'));
      await qc.invalidateQueries({ queryKey: ['customers'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.salesConfirm}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('customers.title')}</h1>
        <p className="text-sm text-slate-600">{t('customers.subtitle')}</p>
        <form
          className="flex gap-2 rounded-xl border border-border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input label={t('customers.name')} value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label="Correo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Teléfono" value={phone} onChange={(e) => setPhone(e.target.value)} />
          <Button type="button" variant="secondary" loading={checkDupes.isPending} className="self-end" onClick={() => checkDupes.mutate()}>
            Buscar duplicados
          </Button>
          <Button type="submit" loading={create.isPending} className="self-end">
            {t('customers.add')}
          </Button>
        </form>
        {duplicates.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm">
            <p className="font-medium">Posibles duplicados</p>
            <ul className="mt-1 list-disc pl-5">
              {duplicates.map((d) => (
                <li key={d.id}>
                  {d.name} ({d.match_reason})
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        {msg ? <p className="text-sm">{msg}</p> : null}
        <ul className="divide-y rounded-xl border border-border bg-white">
          {(list.data ?? []).map((c) => (
            <li key={c.id} className="flex justify-between px-4 py-3 text-sm">
              <span>{c.name}</span>
              <Link className="text-brand-navy underline" to={`/ventas/clientes/${c.id}`}>
                Ficha 360
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </PermissionGate>
  );
}
