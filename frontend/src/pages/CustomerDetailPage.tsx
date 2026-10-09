import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

type Customer360 = {
  customer: { id: string; name: string; store_credit_balance?: number };
  contacts: Array<{ id: string; name: string; email?: string; phone?: string }>;
  vehicles: Array<{ id: string; make?: string; model?: string; year?: number; plate?: string; vin?: string }>;
  quotes: Array<{ id: string; quote_number: string; status: string; total: number }>;
  invoices: Array<{ id: string; invoice_number: string; payment_kind: string; total: number; amount_paid: number }>;
  payments: Array<{ id: string; amount: number; confirmed_at?: string }>;
  ar_open: number;
  store_credit: number;
};

export function CustomerDetailPage() {
  const { customerId } = useParams<{ customerId: string }>();
  const { profile } = useAuth();
  const qc = useQueryClient();
  const [make, setMake] = useState('');
  const [model, setModel] = useState('');
  const [plate, setPlate] = useState('');
  const [msg, setMsg] = useState<string | null>(null);

  const detail = useQuery({
    queryKey: ['customer-360', customerId],
    enabled: Boolean(customerId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_customer_360', { p_customer_id: customerId! });
      if (error) throw error;
      return data as Customer360;
    },
  });

  const addVehicle = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from('customer_vehicles').insert({
        company_id: profile!.company_id,
        customer_id: customerId!,
        make: make || null,
        model: model || null,
        plate: plate || null,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMake('');
      setModel('');
      setPlate('');
      setMsg('Vehículo registrado.');
      await qc.invalidateQueries({ queryKey: ['customer-360', customerId] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const c = detail.data?.customer;

  return (
    <PermissionGate permission={PERMISSIONS.customersView}>
      <div className="mx-auto max-w-4xl space-y-6">
        <Link to="/ventas/clientes" className="text-sm text-brand-navy underline">
          ← Clientes
        </Link>
        <h1 className="text-2xl font-semibold text-brand-navy">{c?.name ?? 'Ficha de cliente'}</h1>
        {detail.error ? <p className="text-sm text-red-600">{(detail.error as Error).message}</p> : null}
        {msg ? <p className="text-sm text-slate-600">{msg}</p> : null}

        {detail.data ? (
          <>
            <section className="grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border bg-white p-4 text-sm">
                <h2 className="font-medium">Deuda (CxC abierta)</h2>
                <p className="mt-2 text-2xl font-semibold">{Number(detail.data.ar_open).toFixed(2)} USD</p>
                <p className="mt-1 text-xs text-slate-500">Pendiente de cobro en facturas a crédito confirmadas.</p>
              </div>
              <div className="rounded-xl border bg-white p-4 text-sm">
                <h2 className="font-medium">Saldo a favor</h2>
                <p className="mt-2 text-2xl font-semibold text-emerald-700">
                  {Number(detail.data.store_credit ?? 0).toFixed(2)} USD
                </p>
                <p className="mt-1 text-xs text-slate-500">Crédito en tienda del cliente (no es efectivo en caja).</p>
              </div>
            </section>

            <PermissionGate permission={PERMISSIONS.customersEdit}>
              <form
                className="flex flex-wrap gap-2 rounded-xl border bg-white p-4"
                onSubmit={(e) => {
                  e.preventDefault();
                  addVehicle.mutate();
                }}
              >
                <Input label="Marca" value={make} onChange={(e) => setMake(e.target.value)} />
                <Input label="Modelo" value={model} onChange={(e) => setModel(e.target.value)} />
                <Input label="Placa" value={plate} onChange={(e) => setPlate(e.target.value)} />
                <Button type="submit" className="self-end" loading={addVehicle.isPending}>
                  Agregar vehículo
                </Button>
              </form>
            </PermissionGate>

            <section className="rounded-xl border bg-white p-4">
              <h2 className="font-medium">Vehículos</h2>
              <ul className="mt-2 divide-y text-sm">
                {(detail.data.vehicles ?? []).map((v) => (
                  <li key={v.id} className="py-2">
                    {[v.make, v.model, v.year, v.plate].filter(Boolean).join(' · ') || v.vin || '—'}
                  </li>
                ))}
                {(detail.data.vehicles ?? []).length === 0 ? <li className="py-2 text-slate-500">Sin vehículos</li> : null}
              </ul>
            </section>

            <section className="rounded-xl border bg-white p-4">
              <h2 className="font-medium">Cotizaciones</h2>
              <ul className="mt-2 divide-y text-sm">
                {detail.data.quotes.map((q) => (
                  <li key={q.id} className="flex justify-between py-2">
                    <span>
                      {q.quote_number} · {q.status}
                    </span>
                    <span>{Number(q.total).toFixed(2)} USD</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="rounded-xl border bg-white p-4">
              <h2 className="font-medium">Ventas y cobros</h2>
              <ul className="mt-2 divide-y text-sm">
                {detail.data.invoices.map((i) => (
                  <li key={i.id} className="flex justify-between py-2">
                    <span>
                      {i.invoice_number} · {i.payment_kind}
                    </span>
                    <span>
                      {Number(i.amount_paid).toFixed(2)} / {Number(i.total).toFixed(2)} USD
                    </span>
                  </li>
                ))}
              </ul>
              <h3 className="mt-4 text-xs font-medium uppercase text-slate-500">Pagos registrados</h3>
              <ul className="divide-y text-sm">
                {detail.data.payments.map((p) => (
                  <li key={p.id} className="flex justify-between py-2">
                    <span>{p.confirmed_at ? new Date(p.confirmed_at).toLocaleString() : '—'}</span>
                    <span>{Number(p.amount).toFixed(2)} USD</span>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : (
          <p className="text-sm text-slate-600">Cargando ficha…</p>
        )}
      </div>
    </PermissionGate>
  );
}
