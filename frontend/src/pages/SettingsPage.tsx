import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { PERMISSIONS, updateCompanySettingsSchema } from '@repuestos/shared';
import { PermissionGate } from '@/components/PermissionGate';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { usePermission } from '@/hooks/usePermissions';
import { supabase } from '@/lib/supabase';

export function SettingsPage() {
  const qc = useQueryClient();
  const canEdit = usePermission(PERMISSIONS.companySettingsEdit);
  const [form, setForm] = useState({
    commercialName: '',
    legalName: '',
    addressLine1: '',
    city: '',
    publicPhone: '',
    publicEmail: '',
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
      addressLine1: company.address_line1 ?? '',
      city: company.city ?? '',
      publicPhone: contact?.public_phone ?? '',
      publicEmail: contact?.public_email ?? '',
      pricesIncludeTax: company.prices_include_tax ?? false,
      currencyDecimalPlaces: company.currency_decimal_places ?? 2,
    });
  }, [query.data]);

  const save = useMutation({
    mutationFn: async () => {
      const parsed = updateCompanySettingsSchema.parse({
        ...form,
        publicEmail: form.publicEmail || undefined,
      });
      const { error: companyError } = await supabase
        .from('companies')
        .update({
          commercial_name: parsed.commercialName,
          legal_name: parsed.legalName,
          address_line1: parsed.addressLine1,
          city: parsed.city,
          prices_include_tax: parsed.pricesIncludeTax,
          currency_decimal_places: parsed.currencyDecimalPlaces,
        })
        .eq('id', query.data!.company.id);
      if (companyError) throw companyError;
      const { error: contactError } = await supabase.from('company_contacts').upsert({
        company_id: query.data!.company.id,
        public_phone: parsed.publicPhone,
        public_email: parsed.publicEmail || null,
      });
      if (contactError) throw contactError;
      await supabase.rpc('log_audit', {
        p_action: 'company.settings.updated',
        p_entity_type: 'company',
        p_entity_id: query.data!.company.id,
        p_reason: 'Actualización desde configuración',
      });
    },
    onSuccess: async () => {
      setMessage('Configuración guardada.');
      await qc.invalidateQueries({ queryKey: ['settings'] });
    },
    onError: (err: Error) => setMessage(err.message),
  });

  if (query.isLoading) return <p>Cargando configuración…</p>;
  if (query.isError) return <p className="text-red-600">No se pudo cargar la configuración.</p>;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <h1 className="text-2xl font-semibold">Configuración de la empresa</h1>
      {query.data?.contact?.tax_config_pending ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
          Impuestos y formato fiscal: pendiente de configuración con su contador. El sistema no inventa tasas legales.
        </p>
      ) : null}
      <form
        className="space-y-4 rounded-xl border border-border bg-white p-4"
        onSubmit={(e) => {
          e.preventDefault();
          setMessage(null);
          if (!canEdit.data) return;
          save.mutate();
        }}
      >
        <Input label="Nombre comercial" value={form.commercialName} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, commercialName: e.target.value })} />
        <Input label="Razón social" value={form.legalName} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, legalName: e.target.value })} />
        <Input label="Dirección" value={form.addressLine1} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, addressLine1: e.target.value })} />
        <Input label="Ciudad" value={form.city} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, city: e.target.value })} />
        <Input label="Teléfono público" value={form.publicPhone} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, publicPhone: e.target.value })} />
        <Input label="Correo público" type="email" value={form.publicEmail} disabled={!canEdit.data} onChange={(e) => setForm({ ...form, publicEmail: e.target.value })} />
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" disabled={!canEdit.data} checked={form.pricesIncludeTax} onChange={(e) => setForm({ ...form, pricesIncludeTax: e.target.checked })} />
          Precios con impuesto incluido
        </label>
        <PermissionGate permission={PERMISSIONS.companySettingsEdit}>
          <Button type="submit" loading={save.isPending}>
            Guardar cambios
          </Button>
        </PermissionGate>
        {message ? <p className="text-sm text-slate-600">{message}</p> : null}
      </form>
    </div>
  );
}
