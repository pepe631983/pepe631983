import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

export function SupplierInvoicePage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [receiptId, setReceiptId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceTotal, setInvoiceTotal] = useState('');
  const [grniClear, setGrniClear] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const openReceipts = useQuery({
    queryKey: ['goods-receipts-open'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goods_receipts')
        .select('id, receipt_number, grni_open_amount')
        .eq('receipt_kind', 'purchase_pending_invoice')
        .gt('grni_open_amount', 0);
      if (error) throw error;
      return data;
    },
  });

  const post = useMutation({
    mutationFn: async () => {
      const args: Record<string, unknown> = {
        p_goods_receipt_id: receiptId,
        p_supplier_invoice_number: invoiceNumber,
        p_idempotency_key: crypto.randomUUID(),
      };
      if (invoiceTotal) args.p_invoice_total = Number(invoiceTotal);
      if (grniClear) args.p_grni_amount_to_clear = Number(grniClear);
      const { data, error } = await supabase.rpc('post_supplier_invoice_for_receipt', args);
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setMsg(t('purchases.invoiceSaved'));
      await qc.invalidateQueries({ queryKey: ['goods-receipts-open'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.purchasePost}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('purchases.invoiceTitle')}</h1>
        <p className="text-sm text-slate-600">{t('purchases.invoiceSubtitle')}</p>
        <form
          className="space-y-3 rounded-xl border border-border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            post.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="text-slate-600">{t('purchases.receipt')}</span>
            <select
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              value={receiptId}
              onChange={(e) => setReceiptId(e.target.value)}
              required
            >
              <option value="">{t('purchases.selectReceipt')}</option>
              {(openReceipts.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.receipt_number} (GRNI {r.grni_open_amount})
                </option>
              ))}
            </select>
          </label>
          <Input label={t('purchases.invoiceNumber')} value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} required />
          <Input
            label={t('purchases.invoiceTotalOptional')}
            type="number"
            step="0.01"
            value={invoiceTotal}
            onChange={(e) => setInvoiceTotal(e.target.value)}
          />
          <Input
            label={t('purchases.grniClearOptional')}
            type="number"
            step="0.01"
            value={grniClear}
            onChange={(e) => setGrniClear(e.target.value)}
          />
          <Button type="submit" loading={post.isPending}>
            {t('purchases.postInvoice')}
          </Button>
        </form>
        {msg ? <p className="text-sm">{msg}</p> : null}
      </div>
    </PermissionGate>
  );
}
