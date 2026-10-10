import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

type LinePick = { lineId: string; label: string; maxQty: number; qty: string };

export function SalesReturnsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [invoiceId, setInvoiceId] = useState('');
  const [refundKind, setRefundKind] = useState<'cash' | 'credit_balance'>('cash');
  const [lines, setLines] = useState<LinePick[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  const branchQuery = useQuery({
    queryKey: ['default-branch'],
    queryFn: async () => {
      const { data, error } = await supabase.from('branches').select('id').eq('is_default', true).maybeSingle();
      if (error) throw error;
      return data?.id as string | undefined;
    },
  });

  const sessionQuery = useQuery({
    queryKey: ['cash-session-ret', branchQuery.data],
    enabled: Boolean(branchQuery.data),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_cash_session', { p_branch_id: branchQuery.data! });
      if (error) throw error;
      return data as string | null;
    },
  });

  const invoicesQuery = useQuery({
    queryKey: ['invoices-for-return'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_invoices')
        .select('id, invoice_number, payment_kind, total, amount_paid')
        .eq('status', 'confirmed')
        .order('confirmed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  async function loadLines(invId: string) {
    setInvoiceId(invId);
    const { data, error } = await supabase
      .from('sales_invoice_lines')
      .select('id, description, quantity, quantity_returned')
      .eq('sales_invoice_id', invId);
    if (error) {
      setMsg(error.message);
      return;
    }
    setLines(
      (data ?? [])
        .map((l) => ({
          lineId: l.id,
          label: l.description ?? l.id,
          maxQty: Number(l.quantity) - Number(l.quantity_returned ?? 0),
          qty: '',
        }))
        .filter((l) => l.maxQty > 0),
    );
  }

  const selectedInvoice = invoicesQuery.data?.find((i) => i.id === invoiceId);

  const confirmReturn = useMutation({
    mutationFn: async () => {
      const payload = lines
        .filter((l) => Number(l.qty) > 0)
        .map((l) => ({ sales_invoice_line_id: l.lineId, quantity: Number(l.qty) }));
      if (payload.length === 0) throw new Error(t('returns.noLines'));
      const inv = invoicesQuery.data?.find((i) => i.id === invoiceId);
      const kind = inv?.payment_kind === 'credit' ? 'credit_balance' : refundKind;
      const needsCash = kind === 'cash';
      let cashSessionId: string | null = null;
      if (needsCash) {
        if (!branchQuery.data) throw new Error(t('returns.needCashSession'));
        const { data: openId, error: sessErr } = await supabase.rpc('get_open_cash_session', {
          p_branch_id: branchQuery.data,
        });
        if (sessErr) throw sessErr;
        if (!openId) throw new Error(t('returns.needCashSession'));
        cashSessionId = openId;
      }
      const { data, error } = await supabase.rpc('confirm_sales_return', {
        p_idempotency_key: crypto.randomUUID(),
        p_original_invoice_id: invoiceId,
        p_lines: payload,
        p_refund_kind: kind,
        p_cash_session_id: cashSessionId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setMsg(t('returns.confirmed'));
      setLines([]);
      await qc.invalidateQueries({ queryKey: ['invoices-for-return'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.returnsProcess}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('returns.title')}</h1>
        <p className="text-sm text-slate-600">{t('returns.subtitle')}</p>
        {msg ? <p className="rounded-lg border border-border bg-slate-50 p-3 text-sm">{msg}</p> : null}

        <label className="block text-sm">
          {t('returns.invoice')}
          <select
            className="mt-1 w-full rounded-lg border border-border px-3 py-2"
            value={invoiceId}
            onChange={(e) => void loadLines(e.target.value)}
          >
            <option value="">{t('returns.selectInvoice')}</option>
            {(invoicesQuery.data ?? []).map((inv) => (
              <option key={inv.id} value={inv.id}>
                {inv.invoice_number} · {inv.payment_kind} · {Number(inv.total)}
              </option>
            ))}
          </select>
        </label>

        {lines.length > 0 ? (
          <>
            {selectedInvoice?.payment_kind === 'credit' ? (
              <p className="text-sm text-slate-600">{t('returns.creditAutoSplit')}</p>
            ) : (
              <label className="block text-sm">
                {t('returns.refundKind')}
                <select
                  className="mt-1 w-full rounded-lg border border-border px-3 py-2"
                  value={refundKind}
                  onChange={(e) => setRefundKind(e.target.value as 'cash' | 'credit_balance')}
                >
                  <option value="cash">{t('returns.refundCash')}</option>
                  <option value="credit_balance">{t('returns.refundCredit')}</option>
                </select>
              </label>
            )}
            {refundKind === 'cash' && !sessionQuery.data ? (
              <p className="text-sm text-amber-800">{t('returns.needCashSession')}</p>
            ) : null}
            <ul className="space-y-2 rounded-xl border border-border bg-white p-4">
              {lines.map((l) => (
                <li key={l.lineId} className="flex flex-wrap items-center gap-2 text-sm">
                  <span className="flex-1">{l.label}</span>
                  <span className="text-slate-500">{t('returns.max', { n: l.maxQty })}</span>
                  <Input
                    label=""
                    type="number"
                    min={0}
                    max={l.maxQty}
                    className="w-24"
                    value={l.qty}
                    onChange={(e) =>
                      setLines((prev) => prev.map((x) => (x.lineId === l.lineId ? { ...x, qty: e.target.value } : x)))
                    }
                  />
                </li>
              ))}
            </ul>
            <Button
              loading={confirmReturn.isPending}
              disabled={confirmReturn.isPending}
              onClick={() => confirmReturn.mutate()}
            >
              {t('returns.submit')}
            </Button>
          </>
        ) : null}
      </div>
    </PermissionGate>
  );
}
