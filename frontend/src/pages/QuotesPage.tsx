import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

export function QuotesPage() {
  const qc = useQueryClient();
  const [customerId, setCustomerId] = useState('');
  const [productId, setProductId] = useState('');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [validUntil, setValidUntil] = useState('');
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [lastQuoteId, setLastQuoteId] = useState<string | null>(null);

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
      const { data, error } = await supabase.from('products').select('id, internal_code, name, sale_price').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const quotes = useQuery({
    queryKey: ['sales-quotes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('sales_quotes')
        .select('id, quote_number, status, total, valid_until, customer_id')
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const createQuote = useMutation({
    mutationFn: async () => {
      const prod = products.data?.find((p) => p.id === productId);
      if (!prod) throw new Error('Seleccione producto');
      const unitPrice = price ? Number(price) : Number(prod.sale_price);
      const lines = [{ product_id: productId, quantity: Number(qty), unit_price: unitPrice, discount: 0 }];
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
      const { data, error } = await supabase.rpc('convert_quote_to_sale', {
        p_quote_id: quoteId,
        p_idempotency_key: crypto.randomUUID(),
        p_payment_kind: 'cash',
        p_amount_paid: null,
        p_cash_session_id: null,
      });
      if (error) throw error;
      return data as string;
    },
    onSuccess: async () => {
      setMsg('Cotización convertida en venta (sin duplicar documento).');
      await qc.invalidateQueries({ queryKey: ['sales-quotes'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.salesQuoteManage}>
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-semibold text-brand-navy">Cotizaciones</h1>
        <p className="text-sm text-slate-600">
          Crear cotización con cliente, líneas, vencimiento y enlace público revocable. Aceptar no cobra ni confirma pago; la conversión verifica existencias.
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
              <a
                className="inline-flex items-center rounded-lg border border-border px-3 py-2 text-sm"
                href={`mailto:?subject=${encodeURIComponent('Cotización TCI Auto Zone')}&body=${encodeURIComponent(shareUrl)}`}
              >
                Correo
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
          <label className="block text-sm">
            Producto
            <select className="mt-1 w-full rounded-lg border px-3 py-2" value={productId} onChange={(e) => setProductId(e.target.value)} required>
              <option value="">Seleccione…</option>
              {(products.data ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.internal_code})
                </option>
              ))}
            </select>
          </label>
          <div className="grid gap-3 sm:grid-cols-3">
            <Input label="Cantidad" type="number" value={qty} onChange={(e) => setQty(e.target.value)} required />
            <Input label="Precio unitario" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} />
            <Input label="Válida hasta" type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
          <Button type="submit" loading={createQuote.isPending}>
            Crear cotización
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
                <span className="flex gap-2">
                  <Button variant="secondary" onClick={() => issueLink.mutate(q.id)}>
                    Enlace
                  </Button>
                  <Button variant="secondary" onClick={() => revokeLink.mutate(q.id)}>
                    Revocar
                  </Button>
                  {q.status === 'accepted' ? (
                    <Button onClick={() => convertQuote.mutate(q.id)} loading={convertQuote.isPending}>
                      Convertir venta
                    </Button>
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
