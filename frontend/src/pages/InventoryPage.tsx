import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

export function InventoryPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [price, setPrice] = useState('');
  const [qty, setQty] = useState('');
  const [cost, setCost] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const save = useMutation({
    mutationFn: async () => {
      const { data: wh } = await supabase.from('warehouses').select('id').eq('is_default', true).single();
      if (!wh) throw new Error('Sin almacén');
      const { data: productId, error: cpErr } = await supabase.rpc('create_product', {
        p_internal_code: code,
        p_name: name,
        p_sale_price: Number(price),
      });
      if (cpErr) throw cpErr;
      const lines = [{ product_id: productId, quantity: Number(qty), unit_cost: Number(cost) }];
      const { error: rcvErr } = await supabase.rpc('confirm_goods_receipt', {
        p_warehouse_id: wh.id,
        p_receipt_kind: 'opening_balance',
        p_lines: lines,
        p_idempotency_key: crypto.randomUUID(),
        p_reason: 'Saldo inicial desde alta de producto (demostración)',
      });
      if (rcvErr) throw rcvErr;
    },
    onSuccess: async () => {
      setMsg(t('inventory.saved'));
      await qc.invalidateQueries({ queryKey: ['pos-products'] });
      await qc.invalidateQueries({ queryKey: ['pos-stock'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.purchasePost}>
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('inventory.title')}</h1>
        <p className="text-sm text-slate-600">{t('inventory.subtitle')}</p>
        <form
          className="space-y-3 rounded-xl border border-border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <Input label={t('inventory.code')} value={code} onChange={(e) => setCode(e.target.value)} required />
          <Input label={t('inventory.name')} value={name} onChange={(e) => setName(e.target.value)} required />
          <Input label={t('inventory.salePrice')} type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} required />
          <Input label={t('inventory.qty')} type="number" step="1" value={qty} onChange={(e) => setQty(e.target.value)} required />
          <Input label={t('inventory.unitCost')} type="number" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} required />
          <Button type="submit" loading={save.isPending}>
            {t('inventory.save')}
          </Button>
          {msg ? <p className="text-sm">{msg}</p> : null}
        </form>
      </div>
    </PermissionGate>
  );
}
