import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCompanyBrand } from '@/hooks/useCompanyBrand';
import { StagingConnectionHint } from '@/components/StagingConnectionHint';
import { supabase } from '@/lib/supabase';

export function DashboardPage() {
  const { t } = useTranslation();
  const { profile } = useAuth();
  const brand = useCompanyBrand();
  const companyQuery = useQuery({
    queryKey: ['company'],
    enabled: Boolean(profile?.company_id),
    queryFn: async () => {
      const { data, error } = await supabase.from('companies').select('*').single();
      if (error) throw error;
      return data;
    },
  });

  const modules = [
    { name: 'Catálogo y compatibilidad', status: 'Etapa 3', ready: false },
    { name: 'Compras e inventario (kardex)', status: 'Etapa 2–3', ready: false },
    { name: 'Punto de venta', status: 'Etapa 4', ready: false },
    { name: 'Motor contable confirmado', status: 'Etapa 2', ready: false },
    { name: 'Caja, bancos y crédito', status: 'Etapa 5', ready: false },
    { name: 'Devoluciones y garantías', status: 'Etapa 6', ready: false },
    { name: 'Reportes y conciliaciones', status: 'Etapa 7', ready: false },
  ];

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-brand-navy">{t('dashboard.title')}</h1>
        <p className="text-slate-600">
          {brand.data?.commercialName ?? companyQuery.data?.commercial_name ?? t('app.name')} — {t('dashboard.stage1Done')}
        </p>
        {companyQuery.data?.is_demo ? (
          <p className="mt-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {t('dashboard.demoBanner')}
          </p>
        ) : null}
        {brand.data?.taxConfigPending ? (
          <p className="mt-2 rounded-lg border border-brand-accent/30 bg-red-50 px-3 py-2 text-sm text-brand-navy">
            {t('settings.taxPending')}
          </p>
        ) : null}
      </header>

      <StagingConnectionHint />

      <section className="rounded-xl border border-border bg-white p-4">
        <h2 className="font-medium text-brand-navy">{t('dashboard.moduleStatus')}</h2>
        <ul className="mt-3 divide-y divide-slate-100">
          {modules.map((m) => (
            <li key={m.name} className="flex items-center justify-between py-2 text-sm">
              <span>{m.name}</span>
              <span className={m.ready ? 'text-green-700' : 'text-slate-500'}>{m.status}</span>
            </li>
          ))}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-white p-4 text-sm text-slate-600">
        <h2 className="font-medium text-brand-navy">{t('dashboard.whatNow')}</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>{t('dashboard.now1')}</li>
          <li>{t('dashboard.now2')}</li>
          <li>{t('dashboard.now3')}</li>
        </ul>
      </section>
    </div>
  );
}
