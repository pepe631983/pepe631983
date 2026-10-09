import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { PermissionGate } from '@/components/PermissionGate';
import { supabase } from '@/lib/supabase';

type TenderDraft = {
  instrument_kind: 'cash' | 'card' | 'transfer' | 'check';
  amount: string;
  reference: string;
  check_bank: string;
  check_number: string;
  transfer_reference: string;
  card_terminal_reference: string;
};

const emptyTender = (): TenderDraft => ({
  instrument_kind: 'cash',
  amount: '',
  reference: '',
  check_bank: '',
  check_number: '',
  transfer_reference: '',
  card_terminal_reference: '',
});

export function CustomerPaymentsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [invoiceId, setInvoiceId] = useState('');
  const [amount, setAmount] = useState('');
  const [mode, setMode] = useState<'simple' | 'combined'>('combined');
  const [tenders, setTenders] = useState<TenderDraft[]>([emptyTender(), emptyTender()]);
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

  const bankAccounts = useQuery({
    queryKey: ['bank-accounts'],
    queryFn: async () => {
      const { data, error } = await supabase.from('bank_accounts').select('id, name, account_number_masked').eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  const pendingChecks = useQuery({
    queryKey: ['pending-check-tenders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('customer_payment_tenders')
        .select('id, amount, check_number, check_bank, settlement_status, check_status, customer_payment_id')
        .eq('instrument_kind', 'check')
        .in('settlement_status', ['pending', 'cleared'])
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  const selectedOpen = useMemo(() => {
    const inv = creditInvoices.data?.find((i) => i.id === invoiceId);
    if (!inv) return 0;
    return Number(inv.total) - Number(inv.amount_paid);
  }, [creditInvoices.data, invoiceId]);

  const combinedTotal = useMemo(
    () => tenders.reduce((s, t) => s + (Number(t.amount) || 0), 0),
    [tenders],
  );

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

  const collectCombined = useMutation({
    mutationFn: async () => {
      const payload = tenders
        .filter((t) => Number(t.amount) > 0)
        .map((t) => ({
          instrument_kind: t.instrument_kind,
          amount: Number(t.amount),
          reference: t.reference || null,
          check_bank: t.check_bank || null,
          check_number: t.check_number || null,
          check_date: new Date().toISOString().slice(0, 10),
          check_status: 'received',
          transfer_bank_account_id: bankAccounts.data?.[0]?.id ?? null,
          transfer_reference: t.transfer_reference || null,
          card_terminal_reference: t.card_terminal_reference || null,
        }));
      const { data, error } = await supabase.rpc('collect_customer_payment_combined', {
        p_sales_invoice_id: invoiceId,
        p_idempotency_key: crypto.randomUUID(),
        p_tenders: payload,
        p_cash_session_id: cashSessionQuery.data,
      });
      if (error) throw error;
      return data;
    },
    onSuccess: async () => {
      setMsg('Cobro combinado registrado. Cheques/tarjeta/transferencia quedan pendientes de liquidación; efectivo en caja si hay sesión.');
      setTenders([emptyTender(), emptyTender()]);
      await qc.invalidateQueries({ queryKey: ['credit-invoices-open', 'pending-check-tenders'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  const rejectCheck = useMutation({
    mutationFn: async (tenderId: string) => {
      const { error } = await supabase.rpc('reject_customer_check_tender', {
        p_tender_id: tenderId,
        p_reason: 'Rechazado desde cobros',
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      setMsg('Cheque rechazado: CxC reabierta y asiento de tránsito revertido.');
      await qc.invalidateQueries({ queryKey: ['pending-check-tenders', 'credit-invoices-open'] });
    },
    onError: (e: Error) => setMsg(e.message),
  });

  return (
    <PermissionGate permission={PERMISSIONS.paymentCollect}>
      <div className="mx-auto max-w-3xl space-y-4">
        <h1 className="text-2xl font-semibold text-brand-navy">{t('collections.title')}</h1>
        <p className="text-sm text-slate-600">
          Cobro simple o combinado (efectivo, tarjeta externa, transferencia, cheque). Pendiente ≠ fondos disponibles en
          caja.
        </p>
        {!cashSessionQuery.data ? <p className="text-xs text-amber-800">{t('collections.noCashSession')}</p> : null}

        <div className="flex gap-2 text-sm">
          <button
            type="button"
            className={`rounded-lg px-3 py-1 ${mode === 'combined' ? 'bg-brand-navy text-white' : 'border'}`}
            onClick={() => setMode('combined')}
          >
            Cobro combinado
          </button>
          <button
            type="button"
            className={`rounded-lg px-3 py-1 ${mode === 'simple' ? 'bg-brand-navy text-white' : 'border'}`}
            onClick={() => setMode('simple')}
          >
            Cobro simple
          </button>
        </div>

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
                {inv.invoice_number} · pendiente {(Number(inv.total) - Number(inv.amount_paid)).toFixed(2)}
              </option>
            ))}
          </select>
        </label>
        {invoiceId ? <p className="text-xs text-slate-500">Saldo abierto: {selectedOpen.toFixed(2)} USD</p> : null}

        {mode === 'simple' ? (
          <form
            className="space-y-3 rounded-xl border border-border bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              collect.mutate();
            }}
          >
            <Input label={t('collections.amount')} type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} required />
            <Button type="submit" loading={collect.isPending}>
              {t('collections.submit')}
            </Button>
          </form>
        ) : (
          <form
            className="space-y-3 rounded-xl border border-border bg-white p-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (combinedTotal <= 0 || combinedTotal > selectedOpen) {
                setMsg('Total combinado debe ser mayor que 0 y no superar el saldo abierto.');
                return;
              }
              collectCombined.mutate();
            }}
          >
            {tenders.map((tender, idx) => (
              <div key={idx} className="grid gap-2 rounded-lg border border-dashed p-3 sm:grid-cols-2">
                <label className="text-sm">
                  Medio
                  <select
                    className="mt-1 w-full rounded-lg border px-2 py-2"
                    value={tender.instrument_kind}
                    onChange={(e) => {
                      const v = e.target.value as TenderDraft['instrument_kind'];
                      setTenders((prev) => prev.map((t, i) => (i === idx ? { ...t, instrument_kind: v } : t)));
                    }}
                  >
                    <option value="cash">Efectivo (disponible en caja)</option>
                    <option value="card">Tarjeta externa (pendiente liquidación)</option>
                    <option value="transfer">Transferencia (pendiente verificación)</option>
                    <option value="check">Cheque (en tránsito)</option>
                  </select>
                </label>
                <Input
                  label="Monto"
                  type="number"
                  step="0.01"
                  value={tender.amount}
                  onChange={(e) => setTenders((prev) => prev.map((t, i) => (i === idx ? { ...t, amount: e.target.value } : t)))}
                />
                {tender.instrument_kind === 'check' ? (
                  <>
                    <Input
                      label="Banco"
                      value={tender.check_bank}
                      onChange={(e) => setTenders((prev) => prev.map((t, i) => (i === idx ? { ...t, check_bank: e.target.value } : t)))}
                    />
                    <Input
                      label="Número cheque"
                      value={tender.check_number}
                      onChange={(e) => setTenders((prev) => prev.map((t, i) => (i === idx ? { ...t, check_number: e.target.value } : t)))}
                    />
                  </>
                ) : null}
                {tender.instrument_kind === 'transfer' ? (
                  <Input
                    label="Referencia transferencia"
                    value={tender.transfer_reference}
                    onChange={(e) => setTenders((prev) => prev.map((t, i) => (i === idx ? { ...t, transfer_reference: e.target.value } : t)))}
                  />
                ) : null}
                {tender.instrument_kind === 'card' ? (
                  <Input
                    label="Ref. terminal / lote"
                    value={tender.card_terminal_reference}
                    onChange={(e) =>
                      setTenders((prev) => prev.map((t, i) => (i === idx ? { ...t, card_terminal_reference: e.target.value } : t)))
                    }
                  />
                ) : null}
              </div>
            ))}
            <p className="text-sm font-medium">Total medios: {combinedTotal.toFixed(2)} USD</p>
            <Button type="submit" loading={collectCombined.isPending} disabled={!invoiceId}>
              Registrar cobro combinado
            </Button>
          </form>
        )}

        {msg ? <p className="text-sm">{msg}</p> : null}

        <section className="rounded-xl border bg-white p-4">
          <h2 className="font-medium text-sm">Cheques recientes</h2>
          <ul className="mt-2 divide-y text-sm">
            {(pendingChecks.data ?? []).map((c) => (
              <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                <span>
                  {c.check_bank} #{c.check_number} · {Number(c.amount).toFixed(2)} · {c.settlement_status}
                </span>
                {c.settlement_status === 'pending' ? (
                  <Button variant="secondary" loading={rejectCheck.isPending} onClick={() => rejectCheck.mutate(c.id)}>
                    Rechazar cheque
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </PermissionGate>
  );
}
