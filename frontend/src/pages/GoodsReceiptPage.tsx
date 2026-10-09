import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { useDefaultWarehouse } from '@/hooks/useDefaultWarehouse';
import { supabase } from '@/lib/supabase';

export function GoodsReceiptPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const wh = useDefaultWarehouse();
  const [supplierId, setSupplierId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('');
  const [unitCost, setUnitCost] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const suppliers = useQuery({
    queryKey: ['suppliers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('suppliers').select('id, name').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const products = useQuery({
    queryKey: ['products-active'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, internal_code, name').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const receipts = useQuery({
    queryKey: ['goods-receipts'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('goods_receipts')
        .select('id, receipt_number, receipt_kind, grni_open_amount, confirmed_at')
        .order('confirmed_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const post = useMutation({
    mutationFn: async () => {
      if (!wh.data?.id) throw new Error(t('purchases.noWarehouse'));
      const lines = [{ product_id: productId, quantity: Number(qty), unit_cost: Number(unitCost) }];
      const { data, error } = await supabase.rpc('confirm_goods_receipt', {
        p_warehouse_id: wh.data.id,
        p_receipt_kind: 'purchase_pending_invoice',
        p_lines: lines,
        p_idempotency_key: crypto.randomUUID(),
        p_supplier_id: supplierId,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setMsg(t('purchases.receiptSaved'));
      await qc.invalidateQueries({ queryKey: ['goods-receipts'] });
      await qc.invalidateQueries({ queryKey: ['pos-stock'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.purchasePost}>
      <div className="mx-auto max-w-2xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('purchases.receiptTitle')}</h1>
        <p className="text-sm text-slate-600">{t('purchases.receiptSubtitle')}</p>
        <form
          className="space-y-3 rounded-xl border border-border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            post.mutate();
          }}
        >
          <label className="block text-sm">
            <span className="text-slate-600">{t('purchases.supplier')}</span>
            <select
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              value={supplierId}
              onChange={(e) => setSupplierId(e.target.value)}
              required
            >
              <option value="">{t('purchases.selectSupplier')}</option>
              {(suppliers.data ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block text-sm">
            <span className="text-slate-600">{t('purchases.product')}</span>
            <select
              className="mt-1 w-full rounded-lg border border-border px-3 py-2"
              value={productId}
              onChange={(e) => setProductId(e.target.value)}
              required
            >
              <option value="">{t('purchases.selectProduct')}</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.internal_code} — {p.name}
                </option>
              ))}
            </select>
          </label>
          <Input label={t('purchases.qty')} type="number" value={qty} onChange={(e) => setQty(e.target.value)} required />
          <Input label={t('purchases.unitCost')} type="number" step="0.01" value={unitCost} onChange={(e) => setUnitCost(e.target.value)} required />
          <Button type="submit" loading={post.isPending}>
            {t('purchases.confirmReceipt')}
          </Button>
        </form>
        {msg ? <p className="text-sm">{msg}</p> : null}
        <section>
          <h2 className="mb-2 font-semibold text-brand-navy">{t('purchases.recentReceipts')}</h2>
          <ul className="divide-y rounded-xl border border-border bg-white text-sm">
            {(receipts.data ?? []).map((r) => (
              <li key={r.id} className="px-4 py-2">
                {r.receipt_number} · GRNI abierto: {r.grni_open_amount}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PermissionGate>
  );
}
