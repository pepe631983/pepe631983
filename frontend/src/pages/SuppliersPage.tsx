import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

export function SuppliersPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const list = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('id, name, is_active').order('name');
      if (error) throw error;
      return data;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('create_supplier', { p_name: name });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      setName('');
      setMsg(t('suppliers.saved'));
      await qc.invalidateQueries({ queryKey: ['suppliers'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.purchaseCreate}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('suppliers.title')}</h1>
        <p className="text-sm text-slate-600">{t('suppliers.subtitle')}</p>
        <form
          className="flex gap-2 rounded-xl border border-border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            create.mutate();
          }}
        >
          <Input label={t('suppliers.name')} value={name} onChange={(e) => setName(e.target.value)} required />
          <Button type="submit" loading={create.isPending} className="self-end">
            {t('suppliers.add')}
          </Button>
        </form>
        {msg ? <p className="text-sm">{msg}</p> : null}
        <ul className="divide-y rounded-xl border border-border bg-white">
          {(list.data ?? []).map((s) => (
            <li key={s.id} className="px-4 py-3 text-sm">
              {s.name}
            </li>
          ))}
        </ul>
      </div>
    </PermissionGate>
  );
}
