import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createCompanySchema, DEFAULT_BUSINESS } from '@repuestos/shared';
import { AuthShell } from '@/components/AuthShell';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { supabase } from '@/lib/supabase';

export function CompanySetupPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, profile, refreshProfile, loading } = useAuth();
  const [commercialName, setCommercialName] = useState(DEFAULT_BUSINESS.commercialName);
  const [fullName, setFullName] = useState('');
  const [isDemo, setIsDemo] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!loading && !session) return <Navigate to="/login" replace />;
  if (!loading && profile) return <Navigate to="/" replace />;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const parsed = createCompanySchema.safeParse({
      commercialName,
      fullName,
      countryCode: DEFAULT_BUSINESS.countryCode,
      timezone: DEFAULT_BUSINESS.timezone,
      currencyCode: DEFAULT_BUSINESS.currencyCode,
      isDemo,
    });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? 'Datos inválidos');
      return;
    }
    setSubmitting(true);
    const { data, error: rpcError } = await supabase.rpc('create_company_with_owner', {
      p_commercial_name: parsed.data.commercialName,
      p_full_name: parsed.data.fullName,
      p_country_code: parsed.data.countryCode,
      p_timezone: parsed.data.timezone,
      p_currency_code: parsed.data.currencyCode,
      p_is_demo: parsed.data.isDemo,
    });
    setSubmitting(false);
    if (rpcError) {
      setError(rpcError.message);
      return;
    }
    if (!data) {
      setError('No se recibió confirmación del servidor. Verifique en configuración antes de reintentar.');
      return;
    }
    await refreshProfile();
    navigate('/');
  }

  return (
    <AuthShell>
      <div className="w-full max-w-lg rounded-2xl border border-border bg-white p-6 shadow-sm">
        <h1 className="text-xl font-semibold text-brand-navy">{t('companySetup.title')}</h1>
        <p className="mt-2 text-sm text-slate-600">{t('companySetup.intro')}</p>
        <p className="mt-2 rounded-lg bg-brand-50 px-3 py-2 text-xs text-brand-navy">{t('companySetup.regionNote')}</p>
        <form className="mt-6 space-y-4" onSubmit={(e) => void onSubmit(e)}>
          <Input label={t('companySetup.commercialName')} required value={commercialName} onChange={(e) => setCommercialName(e.target.value)} />
          <Input label={t('companySetup.fullName')} required value={fullName} onChange={(e) => setFullName(e.target.value)} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={isDemo} onChange={(e) => setIsDemo(e.target.checked)} />
            {t('companySetup.demoMode')}
          </label>
          {error ? <p className="text-sm text-red-600">{error}</p> : null}
          <Button type="submit" className="w-full" loading={submitting}>
            {t('companySetup.submit')}
          </Button>
        </form>
      </div>
    </AuthShell>
  );
}
