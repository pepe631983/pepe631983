import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PERMISSIONS, updateCompanySettingsSchema } from '@repuestos/shared';
import { BrandMark } from '@/components/BrandMark';
import { PermissionGate } from '@/components/PermissionGate';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePermission } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabase';

export function SettingsPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const canEdit = usePermission(PERMISSIONS.companySettingsEdit);
  const [form, setForm] = useState({
    commercialName: '',
    legalName: '',
    logoUrl: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    stateRegion: '',
    postalCode: '',
    publicPhone: '',
    publicEmail: '',
    website: '',
    taxIdLabel: '',
    taxIdValue: '',
    pricesIncludeTax: false,
    currencyDecimalPlaces: 2,
  });
  const [message, setMessage] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const [companyRes, contactRes] = await Promise.all([
        supabase.from('companies').select('*').single(),
        supabase.from('company_contacts').select('*').maybeSingle(),
      ]);
      if (companyRes.error) throw companyRes.error;
      return { company: companyRes.data, contact: contactRes.data };
    },
  });

  useEffect(() => {
    if (!query.data) return;
    const { company, contact } = query.data;
    setForm({
      commercialName: company.commercial_name ?? '',
      legalName: company.legal_name ?? '',
      logoUrl: company.logo_url ?? '',
      addressLine1: company.address_line1 ?? '',
      addressLine2: company.address_line2 ?? '',
      city: company.city ?? '',
      stateRegion: company.state_region ?? '',
      postalCode: company.postal_code ?? '',
      publicPhone: contact?.public_phone ?? '',
      publicEmail: contact?.public_email ?? '',
      website: contact?.website ?? '',
      taxIdLabel: contact?.tax_id_label ?? '',
      taxIdValue: contact?.tax_id_value ?? '',
      pricesIncludeTax: company.prices_include_tax ?? false,
      currencyDecimalPlaces: company.currency_decimal_places ?? 2,
    });
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = updateCompanySettingsSchema.parse({
        ...form,
        publicEmail: form.publicEmail || undefined,
        logoUrl: form.logoUrl || undefined,
        website: form.website || undefined,
      });
      const taxPending =
        !parsed.taxIdValue?.trim() ||
        query.data?.contact?.tax_config_pending === true;
      const { error: companyError } = await supabase
        .from('companies')
        .update({
          commercial_name: parsed.commercialName,
          legal_name: parsed.legalName,
          logo_url: parsed.logoUrl || null,
          address_line1: parsed.addressLine1,
          address_line2: parsed.addressLine2,
          city: parsed.city,
          state_region: parsed.stateRegion,
          postal_code: parsed.postalCode,
          prices_include_tax: parsed.pricesIncludeTax,
          currency_decimal_places: parsed.currencyDecimalPlaces,
        })
        .eq('id', query.data!.company.id);
      if (companyError) throw companyError;
      const { error: contactError } = await supabase.from('company_contacts').upsert({
        company_id: query.data!.company.id,
        public_phone: parsed.publicPhone,
        public_email: parsed.publicEmail || null,
        website: parsed.website || null,
        tax_id_label: parsed.taxIdLabel || 'Tax ID / ID fiscal',
        tax_id_value: parsed.taxIdValue || null,
        tax_config_pending: taxPending,
      });
      if (contactError) throw contactError;
      await supabase.rpc('log_audit', {
        p_action: 'company.settings.updated',
        p_entity_type: 'company',
        p_entity_id: query.data!.company.id,
        p_reason: 'Actualización identidad TCI Auto Zone',
      });
    },
    onSuccess: async () => {
      setMessage(t('settings.saved'));
      await qc.invalidateQueries({ queryKey: ['settings'] });
      await qc.invalidateQueries({ queryKey: ['company-brand'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (query.isLoading) return <p>{t('settings.loading')}</p>;
  if (query.isError) return <p className="text-red-600">{t('settings.error')}</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold text-brand-navy">{t('settings.title')}</h1>
      {query.data?.contact?.tax_config_pending !== false ? (
        <p className="rounded-lg border border-brand-accent/40 bg-red-50 p-3 text-sm text-brand-navy">
          {t('settings.taxPending')}
        </p>
      ) : null}

      <div className="rounded-xl border border-border bg-white p-4">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{t('settings.identity')}</p>
        <div className="mt-3">
          <BrandMark commercialName={form.commercialName} logoUrl={form.logoUrl || null} theme="onLight" showTagline />
        </div>
        <p className="mt-2 text-xs text-slate-500">
          Vista previa del encabezado en facturas, recibos, cotizaciones, órdenes de compra y reportes (etapas siguientes).
        </p>
      </div>

      <form
        className="space-y-4 rounded-xl border border-border bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          if (!canEdit.data) return;
          save.mutate();
        }}
      >
        <Input label={t('settings.commercialName')} value={form.commercialName} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, commercialName: e.target.value })} />
        <Input label={t('settings.legalName')} value={form.legalName} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
        <Input label={t('settings.logoUrl')} value={form.logoUrl} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, logoUrl: e.target.value })} placeholder="https://..." />
        <Input label={t('settings.address1')} value={form.addressLine1} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
        <Input label={t('settings.address2')} value={form.addressLine2} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, addressLine2: e.target.value })} />
        <div className="grid gap-4 sm:grid-cols-2">
          <Input label={t('settings.city')} value={form.city} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, city: e.target.value })} />
          <Input label={t('settings.state')} value={form.stateRegion} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, stateRegion: e.target.value })} />
        </div>
        <Input label={t('settings.postal')} value={form.postalCode} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, postalCode: e.target.value })} />
        <Input label={t('settings.phone')} value={form.publicPhone} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, publicPhone: e.target.value })} />
        <Input label={t('settings.email')} type="email" value={form.publicEmail} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, publicEmail: e.target.value })} />
        <Input label={t('settings.website')} value={form.website} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, website: e.target.value })} placeholder="https://..." />
        <Input label={t('settings.taxIdLabel')} value={form.taxIdLabel} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, taxIdLabel: e.target.value })} />
        <Input label={t('settings.taxIdValue')} value={form.taxIdValue} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, taxIdValue: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!canEdit.data} checked={form.pricesIncludeTax} onChange={(e) => setForm({ ...form, pricesIncludeTax: e.target.checked })} />
          {t('settings.pricesIncludeTax')}
        </label>
        <PermissionGate permission={PERMISSIONS.companySettingsEdit}>
          <Button type="submit" loading={save.isPending}>
            {t('settings.save')}
          </Button>
        </PermissionGate>
        {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      </form>
    </div>
  );
}
