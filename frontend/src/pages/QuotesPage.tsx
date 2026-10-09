import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { downloadQuotePdf } from '@/lib/quotePdf';
import { supabase } from '@/lib/supabase';

type DraftLine = { product_id: string; quantity: number; unit_price: number; discount: number };

export function QuotesPage() {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastQuoteId, setLastQuoteId] = useState<string | null>(null);
  const [draftProductId, setDraftProductId] = useState('');
  const [draftQty, setDraftQty] = useState('1');
  const [draftPrice, setDraftPrice] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const convertKeys = useMemo(() => new Map<string, string>(), []);

  const customers = useQuery({
    queryKey: ['customers'],
    queryFn: async () => {
      const { data, error } = await supabase.from('customers').select('id, name').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const products = useQuery({
    queryKey: ['pos-products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('id, internal_code, name, sale_price')
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const quotes = useQuery({
    queryKey: ['sales-quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_quotes')
        .select('id, quote_number, status, total, valid_until, customer_id, subtotal, tax_total')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  function addLine() {
    const prod = products.data?.find((p) => p.id === draftProductId);
    if (!prod) {
      setMsg('Seleccione un producto.');
      return;
    }
    const unitPrice = draftPrice ? Number(draftPrice) : Number(prod.sale_price);
    setLines((prev) => [
      ...prev,
      { product_id: draftProductId, quantity: Number(draftQty), unit_price: unitPrice, discount: 0 },
    ]);
    setDraftProductId('');
    setDraftQty('1');
    setDraftPrice('');
  }

  const createQuote = useMutation({
    mutationFn: async () => {
      if (lines.length === 0) throw new Error('Agregue al menos un repuesto a la cotización.');
      const { data, error } = await supabase.rpc('create_sales_quote', {
        p_idempotency_key: crypto.randomUUID(),
        p_customer_id: customerId || null,
        p_lines: lines,
        p_valid_until: validUntil || null,
        p_tax_rate_id: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async (id) => {
      setLastQuoteId(id);
      setLines([]);
      setMsg('Cotización creada (estado: enviada).');
      await qc.invalidateQueries({ queryKey: ['sales-quotes'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const issueLink = useMutation({
    mutationFn: async (quoteId: string) => {
      const { data, error } = await supabase.rpc('issue_quote_public_link', {
        p_quote_id: quoteId,
        p_expires_at: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: (token) => {
      const base = window.location.origin;
      setShareUrl(`${base}/c/${token}`);
      setMsg('Enlace listo para compartir (WhatsApp, correo).');
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const revokeLink = useMutation({
    mutationFn: async (quoteId: string) => {
      const { error } = await supabase.rpc('revoke_quote_public_link', { p_quote_id: quoteId });
      if (error) throw error;
    },
    onSuccess: () => {
      setShareUrl(null);
      setMsg('Enlace revocado.');
    },
  });

  const convertQuote = useMutation({
    mutationFn: async (quoteId: string) => {
      let key = convertKeys.get(quoteId);
      if (!key) {
        key = crypto.randomUUID();
        convertKeys.set(quoteId, key);
      }
      const { data, error } = await supabase.rpc('convert_quote_to_sale', {
        p_quote_id: quoteId,
        p_idempotency_key: key,
        p_payment_kind: 'cash',
        p_amount_paid: null,
        p_cash_session_id: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      setMsg('Cotización convertida en venta (idempotente: no duplica si repite).');
      await qc.invalidateQueries({ queryKey: ['sales-quotes'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  async function pdfForQuote(quoteId: string) {
    const { data: q, error } = await supabase
      .from('sales_quotes')
      .select('quote_number, valid_until, subtotal, tax_total, total')
      .eq('id', quoteId)
      .single();
    if (error) {
      setMsg(error.message);
      return;
    }
    const { data: ql, error: le } = await supabase
      .from('sales_quote_lines')
      .select('description, quantity, unit_price, discount, line_subtotal')
      .eq('sales_quote_id', quoteId)
      .order('line_number');
    if (le) {
      setMsg(le.message);
      return;
    }
    downloadQuotePdf(
      {
        quote_number: q.quote_number,
        valid_until: q.valid_until ?? undefined,
        subtotal: Number(q.subtotal),
        tax_total: Number(q.tax_total),
        total: Number(q.total),
      },
      (ql ?? []).map((l) => ({
        description: l.description,
        quantity: Number(l.quantity),
        unit_price: Number(l.unit_price),
        discount: Number(l.discount),
        line_subtotal: Number(l.line_subtotal),
      })),
    );
  }

  return (
    <PermissionGate permission={PERMISSIONS.salesQuoteManage}>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold text-brand-navy">Cotizaciones</h1>
        <p className="text-sm text-slate-600">
          Varios repuestos por cotización, PDF, enlace público revocable, aceptación del cliente y conversión a venta con
          verificación de stock y permisos.
        </p>
        {msg ? <p className="rounded-lg border border-border bg-slate-50 p-3 text-sm">{msg}</p> : null}
        {shareUrl ? (
          <div className="rounded-xl border border-border bg-white p-4 text-sm">
            <p className="font-medium">Enlace público (solo esta cotización)</p>
            <p className="mt-2 break-all font-mono text-xs">{shareUrl}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => void navigator.clipboard.writeText(shareUrl)}>
                Copiar
              </Button>
              <a
                className="inline-flex items-center rounded-lg bg-emerald-600 px-3 py-2 text-sm text-white"
                href={`https://wa.me/?text=${encodeURIComponent(`Cotización TCI Auto Zone: ${shareUrl}`)}`}
                target="_blank"
                rel="noreferrer"
              >
                WhatsApp
              </a>
            </div>
          </div>
        ) : null}

        <form
          className="space-y-3 rounded-xl border border-border bg-white p-4"
          onSubmit={(e) => {
            e.preventDefault();
            createQuote.mutate();
          }}
        >
          <label className="block text-sm">
            Cliente
            <select className="mt-1 w-full rounded-lg border px-3 py-2" value={customerId} onChange={(e) => setCustomerId(e.target.value)}>
              <option value="">Opcional</option>
              {(customers.data ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>
          <Input label="Válida hasta" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />

          <div className="rounded-lg border border-dashed p-3">
            <p className="text-sm font-medium">Líneas de la cotización</p>
            <div className="mt-2 grid gap-2 sm:grid-cols-4">
              <select
                className="rounded-lg border px-2 py-2 text-sm sm:col-span-2"
                value={draftProductId}
                onChange={(e) => setDraftProductId(e.target.value)}
              >
                <option value="">Producto…</option>
                {(products.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.internal_code})
                  </option>
                ))}
              </select>
              <Input label="Cant." type="number" value={draftQty} onChange={(e) => setDraftQty(e.target.value)} />
              <Input label="Precio" type="number" step="0.01" value={draftPrice} onChange={(e) => setDraftPrice(e.target.value)} />
            </div>
            <Button type="button" variant="secondary" className="mt-2" onClick={addLine}>
              Agregar línea
            </Button>
            {lines.length > 0 ? (
              <ul className="mt-3 divide-y text-sm">
                {lines.map((l, i) => {
                  const p = products.data?.find((x) => x.id === l.product_id);
                  return (
                    <li key={i} className="flex justify-between py-1">
                      <span>
                        {p?.name ?? l.product_id} × {l.quantity} @ {l.unit_price}
                      </span>
                      <button type="button" className="text-red-600" onClick={() => setLines((prev) => prev.filter((_, j) => j !== i))}>
                        Quitar
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          <Button type="submit" loading={createQuote.isPending} disabled={lines.length === 0}>
            Crear cotización ({lines.length} línea{lines.length === 1 ? '' : 's'})
          </Button>
        </form>

        <section className="rounded-xl border border-border bg-white p-4">
          <h2 className="font-medium">Recientes</h2>
          <ul className="mt-2 divide-y text-sm">
            {(quotes.data ?? []).map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {q.quote_number} · {q.status} · {Number(q.total).toFixed(2)} USD
                </span>
                <span className="flex flex-wrap gap-2">
                  <Button variant="secondary" onClick={() => void pdfForQuote(q.id)}>
                    PDF
                  </Button>
                  <Button variant="secondary" onClick={() => issueLink.mutate(q.id)}>
                    Enlace
                  </Button>
                  <Button variant="secondary" onClick={() => revokeLink.mutate(q.id)}>
                    Revocar
                  </Button>
                  {q.status === 'accepted' ? (
                    <PermissionGate permission={PERMISSIONS.salesQuoteConvert}>
                      <Button onClick={() => convertQuote.mutate(q.id)} loading={convertQuote.isPending}>
                        Convertir venta
                      </Button>
                    </PermissionGate>
                  ) : null}
                </span>
              </li>
            ))}
          </ul>
          {lastQuoteId ? (
            <Button className="mt-3" variant="secondary" onClick={() => issueLink.mutate(lastQuoteId)}>
              Enlace última cotización
            </Button>
          ) : null}
        </section>
      </div>
    </PermissionGate>
  );
}
