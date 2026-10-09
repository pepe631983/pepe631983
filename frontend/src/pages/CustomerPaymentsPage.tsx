import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

export function CustomerPaymentsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const creditInvoices = useQuery({
    queryKey: ['credit-invoices-open'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_invoices')
        .select('id, invoice_number, total, amount_paid')
        .eq('payment_kind', 'credit')
        .eq('status', 'confirmed');
      if (error) throw error;
      return data.filter((i) => Number(i.total) > Number(i.amount_paid));
    },
  });

  const branchQuery = useQuery({
    queryKey: ['default-branch-pay'],
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('id').eq('is_default', true).maybeSingle();
      if (error) throw error;
      return data?.id as string | undefined;
    },
  });

  const cashSessionQuery = useQuery({
    queryKey: ['cash-session-pay', branchQuery.data],
    enabled: Boolean(branchQuery.data),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_cash_session', { p_branch_id: branchQuery.data! });
      if (error) throw error;
      return data as string | null;
    },
  });

  const collect = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc('collect_customer_payment', {
        p_sales_invoice_id: invoiceId,
        p_amount: Number(amount),
        p_idempotency_key: crypto.randomUUID(),
        p_cash_session_id: cashSessionQuery.data,
        p_payment_method_id: null,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setMsg(t('collections.saved'));
      setAmount('');
      await qc.invalidateQueries({ queryKey: ['credit-invoices-open'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.paymentCollect}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('collections.title')}</h1>
        <p className="text-sm text-slate-600">{t('collections.subtitle')}</p>
        {!cashSessionQuery.data ? <p className="text-xs text-amber-800">{t('collections.noCashSession')}</p> : null}
        <form
          className="space-y-3 rounded-xl border border-border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            collect.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="text-slate-600">{t('collections.invoice')}</span>
            <select
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value)}
              required
            >
              <option value="">{t('collections.selectInvoice')}</option>
              {(creditInvoices.data ?? []).map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} · pendiente {Number(inv.total) - Number(inv.amount_paid)}
                </option>
              ))}
            </select>
          </label>
          <Input label={t('collections.amount')} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
          <Button type="submit" loading={collect.isPending}>
            {t('collections.submit')}
          </Button>
        </form>
        {msg ? <p className="text-sm">{msg}</p> : null}
      </div>
    </PermissionGate>
  );
}
