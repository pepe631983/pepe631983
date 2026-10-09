import { useState } from 'react';
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
  const [msg, setMsg] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('id, name').order('name');
      if (error) throw error;
      return data;
    },
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
          <Button type="submit" loading={create.isPending} className="self-end">
            {t('customers.add')}
          </Button>
        </form>
        {msg ? <p className="text-sm">{msg}</p> : null}
        <ul className="divide-y rounded-xl border border-border bg-white">
          {(list.data ?? []).map((c) => (
            <li key={c.id} className="px-4 py-3 text-sm">
              {c.name}
            </li>
          ))}
        </ul>
      </div>
    </PermissionGate>
  );
}
