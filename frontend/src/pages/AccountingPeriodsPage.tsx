import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

export function AccountingPeriodsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [msg, setMsg] = useState<string | null>(null);

  const periodsQuery = useQuery({
    queryKey: ['accounting-periods'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('accounting_periods')
        .select('*')
        .order('period_start', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const closePeriod = useMutation({
    mutationFn: async (periodId: string) => {
      const { error } = await supabase.rpc('close_accounting_period', { p_period_id: periodId });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMsg(t('periods.closed'));
      await qc.invalidateQueries({ queryKey: ['accounting-periods'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.accountingPeriodClose}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('periods.title')}</h1>
        <p className="text-sm text-slate-600">{t('periods.subtitle')}</p>
        {msg ? <p className="rounded-lg border border-border bg-slate-50 p-3 text-sm">{msg}</p> : null}

        <ul className="divide-y rounded-xl border border-border bg-white text-sm">
          {(periodsQuery.data ?? []).map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
              <div>
                <p className="font-medium">
                  {p.period_start} → {p.period_end}
                </p>
                <p className="text-xs text-slate-500">{p.status}</p>
              </div>
              {p.status === 'open' ? (
                <Button variant="secondary" loading={closePeriod.isPending} onClick={() => closePeriod.mutate(p.id)}>
                  {t('periods.close')}
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </PermissionGate>
  );
}
