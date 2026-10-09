import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

export function TaxRatesPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [rate, setRate] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const ratesQuery = useQuery({
    queryKey: ['tax-rates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tax_rates').select('*').order('code');
      if (error) throw error;
      return data;
    },
  });

  const addRate = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('tax_rates').insert({
        code: code.trim(),
        name: name.trim(),
        rate_percent: Number(rate),
        is_active: true,
        is_default_sales: false,
        legal_format_pending: true,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setCode('');
      setName('');
      setRate('');
      setMsg(t('taxRates.saved'));
      await qc.invalidateQueries({ queryKey: ['tax-rates'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.companySettingsEdit}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('taxRates.title')}</h1>
        <p className="text-sm text-slate-600">{t('taxRates.subtitle')}</p>
        {msg ? <p className="rounded-lg border border-border bg-slate-50 p-3 text-sm">{msg}</p> : null}

        <ul className="divide-y rounded-xl border border-border bg-white text-sm">
          {(ratesQuery.data ?? []).map((r) => (
            <li key={r.id} className="flex justify-between px-4 py-3">
              <span>
                {r.code} — {r.name}
              </span>
              <span className="font-mono">{Number(r.rate_percent)}%</span>
            </li>
          ))}
          {(ratesQuery.data ?? []).length === 0 ? (
            <li className="px-4 py-3 text-slate-500">{t('taxRates.empty')}</li>
          ) : null}
        </ul>

        <form
          className="space-y-3 rounded-xl border border-border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            addRate.mutate();
          }}
        >
          <Input label={t('taxRates.code')} value={code} onChange={(e) => setCode(e.target.value)} required />
          <Input label={t('taxRates.name')} value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label={t('taxRates.rate')} type="number" step="0.0001" min={0} value={rate} onChange={(e) => setRate(e.target.value)} required />
          <Button type="submit" loading={addRate.isPending}>
            {t('taxRates.add')}
          </Button>
        </form>
      </div>
    </PermissionGate>
  );
}
