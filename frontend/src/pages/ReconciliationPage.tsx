import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS } from '@repuestos/shared';
import { supabase } from '@/lib/supabase';
import { usePermission } from '@/hooks/usePermissions';

type ReconciliationRow = {
  key?: string;
  label?: string;
  expected?: number;
  actual?: number;
  delta?: number;
  metric?: string;
};

type ReconciliationPayload = {
  as_of?: string;
  metrics?: Record<string, number>;
  differences?: ReconciliationRow[];
  documents?: Array<{
    type: string;
    id: string;
    description: string;
    confirmed_at: string;
  }>;
};

function money(n: number | undefined) {
  if (n === undefined || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);
}

export function ReconciliationPage() {
  const { t } = useTranslation();
  const fin = usePermission(PERMISSIONS.reportsFinancial);
  const journal = usePermission(PERMISSIONS.accountingJournalView);
  const allowed = fin.data || journal.data;
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ['financial-reconciliation'],
    enabled: !!allowed,
    queryFn: async () => {
      const { data: payload, error: rpcErr } = await supabase.rpc('get_financial_reconciliation');
      if (rpcErr) throw rpcErr;
      return payload as ReconciliationPayload;
    },
  });

  const metrics = data?.metrics ?? {};
  const metricRows = [
    { key: 'inventory_quantity', label: t('reconciliation.inventoryQty') },
    { key: 'inventory_book_value', label: t('reconciliation.inventoryValue') },
    { key: 'inventory_gl_balance', label: t('reconciliation.inventoryGl') },
    { key: 'cash_gl_balance', label: t('reconciliation.cash') },
    { key: 'accounts_receivable_gl', label: t('reconciliation.arGl') },
    { key: 'accounts_receivable_operational', label: t('reconciliation.arOps') },
    { key: 'accounts_payable_gl', label: t('reconciliation.ap') },
    { key: 'net_sales_gl', label: t('reconciliation.netSales') },
    { key: 'cost_of_goods_sold_gl', label: t('reconciliation.cogs') },
    { key: 'gross_profit', label: t('reconciliation.grossProfit') },
    { key: 'journal_debits_total', label: t('reconciliation.debits') },
    { key: 'journal_credits_total', label: t('reconciliation.credits') },
  ];

  if (fin.isLoading || journal.isLoading) {
    return <p className="text-sm text-slate-600">{t('reconciliation.loading')}</p>;
  }
  if (!allowed) {
    return <p className="text-sm text-slate-600">{t('reconciliation.denied')}</p>;
  }

  return (
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl font-semibold text-brand-navy">{t('reconciliation.title')}</h1>
            <p className="text-sm text-slate-600">{t('reconciliation.subtitle')}</p>
          </div>
          <button
            type="button"
            className="rounded-lg border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-slate-50"
            onClick={() => void refetch()}
            disabled={isFetching}
          >
            {isFetching ? t('common.processing') : t('reconciliation.refresh')}
          </button>
        </div>

        {isLoading ? <p className="text-sm text-slate-600">{t('reconciliation.loading')}</p> : null}
        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{(error as Error).message}</p>
        ) : null}

        {data ? (
          <>
            <section className="overflow-x-auto rounded-xl border border-border bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                  <tr>
                    <th className="px-4 py-3">{t('reconciliation.metric')}</th>
                    <th className="px-4 py-3 text-right">{t('reconciliation.amount')}</th>
                  </tr>
                </thead>
                <tbody>
                  {metricRows.map((row) => {
                    const val = metrics[row.key];
                    const isQty = row.key === 'inventory_quantity';
                    return (
                      <tr key={row.key} className="border-t border-border">
                        <td className="px-4 py-2">{row.label}</td>
                        <td className="px-4 py-2 text-right font-mono">{isQty ? val ?? '—' : money(val)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-brand-navy">{t('reconciliation.differences')}</h2>
              <div className="overflow-x-auto rounded-xl border border-border bg-white">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
                    <tr>
                      <th className="px-4 py-3">{t('reconciliation.check')}</th>
                      <th className="px-4 py-3 text-right">{t('reconciliation.expected')}</th>
                      <th className="px-4 py-3 text-right">{t('reconciliation.actual')}</th>
                      <th className="px-4 py-3 text-right">{t('reconciliation.delta')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.differences ?? []).map((d) => (
                      <tr key={d.key ?? d.label} className="border-t border-border">
                        <td className="px-4 py-2">{d.label}</td>
                        <td className="px-4 py-2 text-right font-mono">{money(Number(d.expected))}</td>
                        <td className="px-4 py-2 text-right font-mono">{money(Number(d.actual))}</td>
                        <td
                          className={`px-4 py-2 text-right font-mono ${
                            Number(d.delta) !== 0 ? 'font-semibold text-amber-700' : 'text-emerald-700'
                          }`}
                        >
                          {money(Number(d.delta))}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>

            <section className="space-y-2">
              <h2 className="text-lg font-semibold text-brand-navy">{t('reconciliation.documents')}</h2>
              <ul className="divide-y divide-border rounded-xl border border-border bg-white text-sm">
                {(data.documents ?? []).slice(-20).reverse().map((doc) => (
                  <li key={`${doc.type}-${doc.id}`} className="px-4 py-3">
                    <p className="font-medium text-brand-navy">{doc.description}</p>
                    <p className="text-xs text-slate-500">
                      {doc.type} · {doc.id}
                      {doc.confirmed_at ? ` · ${new Date(doc.confirmed_at).toLocaleString()}` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            </section>
          </>
        ) : null}
      </div>
  );
}
