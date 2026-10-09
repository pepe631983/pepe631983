import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Button } from '@/components/ui/Button';
import { supabase } from '@/lib/supabase';

type PublicQuote = {
  quote_number: string;
  status: string;
  valid_until?: string;
  subtotal: number;
  tax_total: number;
  total: number;
  customer_accepted_at?: string;
  lines: Array<{ description: string; quantity: number; unit_price: number; discount: number; line_subtotal: number }>;
};

export function PublicQuotePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicQuote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      const { data: payload, error: err } = await supabase.rpc('get_public_quote_by_token', { p_token: token });
      if (err) {
        setError(err.message);
        return;
      }
      setData(payload as PublicQuote);
    })();
  }, [token]);

  async function accept() {
    if (!token) return;
    setAccepting(true);
    const { error: err } = await supabase.rpc('accept_public_quote', { p_token: token });
    setAccepting(false);
    if (err) {
      setError(err.message);
      return;
    }
    const { data: payload } = await supabase.rpc('get_public_quote_by_token', { p_token: token });
    setData(payload as PublicQuote);
  }

  if (error) {
    return (
      <div className="mx-auto max-w-lg p-8 text-center">
        <p className="text-red-600">{error}</p>
      </div>
    );
  }
  if (!data) {
    return <p className="p-8 text-center text-slate-600">Cargando cotización…</p>;
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 p-6">
      <header className="border-b pb-4">
        <h1 className="text-xl font-semibold text-brand-navy">TCI Auto Zone</h1>
        <p className="text-sm text-slate-600">Cotización {data.quote_number}</p>
        {data.valid_until ? <p className="text-xs text-slate-500">Válida hasta {data.valid_until}</p> : null}
      </header>
      <ul className="divide-y rounded-xl border bg-white text-sm">
        {data.lines.map((l, i) => (
          <li key={i} className="flex justify-between px-4 py-2">
            <span>
              {l.description} × {l.quantity}
            </span>
            <span>{Number(l.line_subtotal).toFixed(2)} USD</span>
          </li>
        ))}
      </ul>
      <p className="text-right text-lg font-semibold">Total: {Number(data.total).toFixed(2)} USD</p>
      <p className="text-xs text-slate-500">
        Aceptar esta cotización no realiza un pago ni confirma una venta en mostrador; su taller la convertirá tras verificar existencias.
      </p>
      {data.status === 'sent' ? (
        <Button className="w-full" loading={accepting} onClick={() => void accept()}>
          Aceptar cotización
        </Button>
      ) : data.customer_accepted_at ? (
        <p className="text-center text-sm text-emerald-700">Cotización aceptada. Gracias.</p>
      ) : null}
    </div>
  );
}
