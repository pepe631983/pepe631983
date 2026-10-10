import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { buildPrintableFromInvoice, type PrintProfile } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useCompanyBrand } from '@/hooks/useCompanyBrand';
import { supabase } from '@/lib/supabase';
import { enqueueAndProcessPrint, processPendingPrintJobById } from '@/print/printQueueService';

type CartLine = { productId: string; name: string; qty: number; unitPrice: number; discount: number };
type PayMode = 'cash' | 'credit' | 'card' | 'check' | 'transfer';

type Props = {
  showHeader?: boolean;
  compact?: boolean;
};

export function PosTerminal({ showHeader = true, compact = false }: Props) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const brand = useCompanyBrand();
  const [cart, setCart] = useState<CartLine[]>([]);
  const [payMode, setPayMode] = useState<PayMode>('cash');
  const [payReference, setPayReference] = useState('');
  const [taxRateId, setTaxRateId] = useState<string>('');
  const [message, setMessage] = useState<string | null>(null);
  const [lastInvoiceId, setLastInvoiceId] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  const productsQuery = useQuery({
    queryKey: ['pos-products'],
    queryFn: async () => {
      const { data, error } = await supabase.from('products').select('id, internal_code, name, sale_price').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const warehouseQuery = useQuery({
    queryKey: ['default-warehouse'],
    queryFn: async () => {
      const { data, error } = await supabase.from('warehouses').select('id, branch_id').eq('is_default', true).maybeSingle();
      if (error) throw error;
      return data as { id: string; branch_id: string } | null;
    },
  });

  const cashSessionQuery = useQuery({
    queryKey: ['pos-cash-session', warehouseQuery.data?.branch_id],
    enabled: Boolean(warehouseQuery.data?.branch_id),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_open_cash_session', {
        p_branch_id: warehouseQuery.data!.branch_id,
      });
      if (error) throw error;
      return data as string | null;
    },
  });

  const taxRatesQuery = useQuery({
    queryKey: ['pos-tax-rates'],
    queryFn: async () => {
      const { data, error } = await supabase.from('tax_rates').select('id, code, name, rate_percent').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const stockQuery = useQuery({
    queryKey: ['pos-stock', warehouseQuery.data?.id],
    enabled: Boolean(warehouseQuery.data?.id),
    queryFn: async () => {
      const { data, error } = await supabase
        .from('inventory_balances')
        .select('product_id, quantity')
        .eq('warehouse_id', warehouseQuery.data!.id);
      if (error) throw error;
      return Object.fromEntries(data.map((r) => [r.product_id, Number(r.quantity)]));
    },
  });

  const filteredProducts = useMemo(() => {
    const q = search.trim().toLowerCase();
    const list = productsQuery.data ?? [];
    if (!q) return list;
    return list.filter(
      (p) => p.name.toLowerCase().includes(q) || String(p.internal_code).toLowerCase().includes(q),
    );
  }, [productsQuery.data, search]);

  const netTotal = useMemo(() => cart.reduce((acc, l) => acc + l.qty * l.unitPrice - l.discount, 0), [cart]);

  const taxPercent = useMemo(() => {
    const row = taxRatesQuery.data?.find((r) => r.id === taxRateId);
    return row ? Number(row.rate_percent) : 0;
  }, [taxRateId, taxRatesQuery.data]);

  const taxAmount = useMemo(() => Math.round(((netTotal * taxPercent) / 100) * 100) / 100, [netTotal, taxPercent]);
  const total = netTotal + (taxRateId ? taxAmount : 0);

  const paymentKind = payMode === 'credit' ? 'credit' : 'cash';
  const needsCashSession = paymentKind === 'cash';

  const confirmSale = useMutation({
    mutationFn: async () => {
      const warehouseId = warehouseQuery.data?.id;
      if (!warehouseId) throw new Error('Sin almacén predeterminado');
      if (needsCashSession && !cashSessionQuery.data) {
        throw new Error(t('pos.noCashSession'));
      }
      const idempotencyKey = crypto.randomUUID();
      const lines = cart.map((l) => ({
        product_id: l.productId,
        quantity: l.qty,
        unit_price: l.unitPrice,
        discount: l.discount,
      }));
      const { data: invoiceId, error } = await supabase.rpc('confirm_pos_sale', {
        p_idempotency_key: idempotencyKey,
        p_warehouse_id: warehouseId,
        p_payment_kind: paymentKind,
        p_amount_paid: paymentKind === 'cash' ? total : null,
        p_lines: lines,
        p_cash_session_id: paymentKind === 'cash' ? cashSessionQuery.data : null,
        p_tax_rate_id: taxRateId || null,
        p_payment_method_id: null,
      });
      if (error) throw error;
      return { invoiceId: String(invoiceId), idempotencyKey };
    },
    onSuccess: async ({ invoiceId }) => {
      setLastInvoiceId(invoiceId);
      setCart([]);
      setPayReference('');
      const tenderNote =
        payMode === 'card'
          ? t('pos.paidCardNote')
          : payMode === 'check'
            ? t('pos.paidCheckNote')
            : payMode === 'transfer'
              ? t('pos.paidTransferNote')
              : null;
      setMessage(tenderNote ? `${t('pos.confirmed')} ${tenderNote}${payReference ? ` (${payReference})` : ''}` : t('pos.confirmed'));
      await qc.invalidateQueries({ queryKey: ['pos-stock'] });
      await qc.invalidateQueries({ queryKey: ['cash-session'] });
      await tryPrintInvoice(invoiceId);
    },
    onError: (err: Error) => setMessage(err.message),
  });

  async function tryPrintInvoice(invoiceId: string, isReprint = false) {
    if (!brand.data) return;
    const { data: invoice, error } = await supabase.from('sales_invoices').select('*').eq('id', invoiceId).single();
    if (error || !invoice) {
      setMessage(t('pos.printQueueFailed'));
      return;
    }
    const { data: lineRows, error: linesError } = await supabase
      .from('sales_invoice_lines')
      .select('description, quantity, unit_price, discount, line_subtotal')
      .eq('sales_invoice_id', invoiceId);
    if (linesError) {
      setMessage(t('pos.printQueueFailed'));
      return;
    }
    const { data: profileRow } = await supabase
      .from('print_profiles')
      .select('*')
      .eq('profile_key', paymentKind === 'cash' ? 'sales_receipt' : 'sales_invoice')
      .maybeSingle();
    if (!profileRow) return;

    const locale = i18n.language === 'en' ? 'en' : 'es';
    const doc = buildPrintableFromInvoice({
      invoiceNumber: invoice.invoice_number,
      issuedAt: invoice.confirmed_at ?? invoice.created_at,
      lines: (lineRows ?? []).map((l) => ({
        description: String(l.description),
        quantity: String(l.quantity),
        unitPrice: String(l.unit_price),
        discount: String(l.discount),
        lineSubtotal: String(l.line_subtotal),
      })),
      subtotal: String(invoice.subtotal),
      discountTotal: String(invoice.discount_total),
      taxTotal: String(invoice.tax_total),
      total: String(invoice.total),
      locale,
    });

    try {
      const profile: PrintProfile = {
        profileKey: profileRow.profile_key,
        paperFormat: profileRow.paper_format,
        useThermal: profileRow.use_thermal,
        thermalWidth: profileRow.thermal_width,
        marginTopMm: Number(profileRow.margin_top_mm),
        marginRightMm: Number(profileRow.margin_right_mm),
        marginBottomMm: Number(profileRow.margin_bottom_mm),
        marginLeftMm: Number(profileRow.margin_left_mm),
        defaultCopies: profileRow.default_copies,
        contentOptions: (profileRow.content_options ?? {}) as PrintProfile['contentOptions'],
      };
      const printReq = {
        profile,
        brand: brand.data,
        document: doc,
        adapterId: 'web_system' as const,
        isReprint,
        isMarkedCopy: isReprint,
        sourceDocumentType: 'sales_invoice',
        sourceDocumentId: invoiceId,
      };
      if (isReprint) {
        const clientRequestId = crypto.randomUUID();
        const { data: jobId, error: reprintErr } = await supabase.rpc('request_reprint_for_document', {
          p_source_document_type: 'sales_invoice',
          p_source_document_id: invoiceId,
          p_profile_key: profileRow.profile_key,
          p_channel: 'system_dialog',
          p_client_request_id: clientRequestId,
        });
        if (reprintErr || !jobId) throw reprintErr ?? new Error('Reimpresión no registrada');
        await processPendingPrintJobById(String(jobId), printReq);
      } else {
        await enqueueAndProcessPrint(printReq);
      }
    } catch {
      setMessage(t('pos.printFailedSaleSaved'));
    }
  }

  function addProduct(p: { id: string; name: string; sale_price: number }) {
    setCart((c) => {
      const existing = c.find((x) => x.productId === p.id);
      if (existing) {
        return c.map((x) => (x.productId === p.id ? { ...x, qty: x.qty + 1 } : x));
      }
      return [...c, { productId: p.id, name: p.name, qty: 1, unitPrice: Number(p.sale_price), discount: 0 }];
    });
  }

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {showHeader ? (
        <>
          <h2 className="text-lg font-semibold text-brand-navy">{t('pos.title')}</h2>
          <p className="text-sm text-slate-600">{t('pos.subtitle')}</p>
        </>
      ) : null}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border border-border bg-white p-4">
          <h3 className="font-medium">{t('pos.products')}</h3>
          <Input
            label={t('pos.search')}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="mt-2"
          />
          <ul className="mt-2 max-h-80 space-y-2 overflow-y-auto text-sm">
            {filteredProducts.map((p) => {
              const stock = stockQuery.data?.[p.id] ?? 0;
              return (
                <li key={p.id} className="flex items-center justify-between gap-2 border-b border-slate-100 py-2">
                  <span>
                    {p.name} ({p.internal_code}) — {Number(p.sale_price).toFixed(2)} USD · {t('pos.stock')}: {stock}
                  </span>
                  <Button variant="secondary" disabled={stock <= 0} onClick={() => addProduct(p)}>
                    +
                  </Button>
                </li>
              );
            })}
          </ul>
        </section>
        <section className="rounded-xl border border-border bg-white p-4">
          <h3 className="font-medium">{t('pos.cart')}</h3>
          <ul className="mt-2 min-h-[4rem] text-sm">
            {cart.length === 0 ? <li className="text-slate-500">{t('pos.emptyCart')}</li> : null}
            {cart.map((l) => (
              <li key={l.productId} className="flex items-center justify-between border-b py-1">
                <span>
                  {l.name} × {l.qty}
                </span>
                <span className="flex items-center gap-2">
                  {(l.qty * l.unitPrice - l.discount).toFixed(2)}
                  <button type="button" className="text-xs text-red-600" onClick={() => setCart((c) => c.filter((x) => x.productId !== l.productId))}>
                    ×
                  </button>
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-lg font-semibold text-brand-navy">
            {t('pos.total')}: {total.toFixed(2)} USD
            {taxRateId ? (
              <span className="block text-sm font-normal text-slate-600">
                {t('pos.net')}: {netTotal.toFixed(2)} · {t('pos.tax')}: {taxAmount.toFixed(2)}
              </span>
            ) : null}
          </p>
          {needsCashSession && !cashSessionQuery.data ? (
            <p className="text-xs text-amber-800">{t('pos.noCashSession')}</p>
          ) : null}
          <label className="mt-2 block text-sm">
            {t('pos.taxRate')}
            <select className="mt-1 w-full rounded border px-2 py-1" value={taxRateId} onChange={(e) => setTaxRateId(e.target.value)}>
              <option value="">{t('pos.noTax')}</option>
              {(taxRatesQuery.data ?? []).map((r) => (
                <option key={r.id} value={r.id}>
                  {r.code} ({Number(r.rate_percent)}%)
                </option>
              ))}
            </select>
          </label>
          <label className="mt-2 block text-sm">
            {t('pos.paymentKind')}
            <select className="mt-1 w-full rounded border px-2 py-1" value={payMode} onChange={(e) => setPayMode(e.target.value as PayMode)}>
              <option value="cash">{t('pos.cash')}</option>
              <option value="card">{t('pos.card')}</option>
              <option value="check">{t('pos.check')}</option>
              <option value="transfer">{t('pos.transfer')}</option>
              <option value="credit">{t('pos.credit')}</option>
            </select>
          </label>
          {payMode !== 'cash' && payMode !== 'credit' ? (
            <Input
              label={t('pos.reference')}
              value={payReference}
              onChange={(e) => setPayReference(e.target.value)}
              className="mt-2"
            />
          ) : null}
          <Button
            className="mt-3 w-full"
            loading={confirmSale.isPending}
            disabled={cart.length === 0}
            onClick={() => confirmSale.mutate()}
          >
            {t('pos.confirm')}
          </Button>
          {lastInvoiceId ? (
            <Button variant="secondary" className="mt-2 w-full" onClick={() => void tryPrintInvoice(lastInvoiceId, true)}>
              {t('pos.reprintCopy')}
            </Button>
          ) : null}
          {message ? <p className="mt-2 text-sm text-slate-600">{message}</p> : null}
        </section>
      </div>
    </div>
  );
}
