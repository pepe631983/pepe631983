import { useQuery } from '@tanstack/react-query';
import { APP_NAME, type DocumentBrandHeader } from '@repuestos/shared';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/lib/supabase';

/** Nombre y datos de marca desde la empresa configurada (sin inventar valores). */
export function useCompanyBrand() {
  const { profile } = useAuth();

  return useQuery({
    queryKey: ['company-brand', profile?.company_id],
    enabled: Boolean(profile?.company_id),
    queryFn: async (): Promise<DocumentBrandHeader> => {
      const [companyRes, contactRes] = await Promise.all([
        supabase
          .from('companies')
          .select(
            'commercial_name, legal_name, logo_url, address_line1, address_line2, city, state_region, postal_code',
          )
          .single(),
        supabase
          .from('company_contacts')
          .select('public_phone, public_email, website, tax_id_label, tax_id_value, tax_config_pending')
          .maybeSingle(),
      ]);
      if (companyRes.error) throw companyRes.error;
      const c = companyRes.data;
      const contact = contactRes.data;
      const addressLines = [c.address_line1, c.address_line2, [c.city, c.state_region, c.postal_code].filter(Boolean).join(', ')]
        .filter(Boolean) as string[];

      return {
        appName: APP_NAME,
        commercialName: c.commercial_name || APP_NAME,
        legalName: c.legal_name,
        addressLines,
        phone: contact?.public_phone ?? null,
        email: contact?.public_email ?? null,
        website: contact?.website ?? null,
        logoUrl: c.logo_url ?? null,
        taxIdLabel: contact?.tax_id_label ?? null,
        taxIdValue: contact?.tax_id_value ?? null,
        taxConfigPending: contact?.tax_config_pending ?? true,
      };
    },
  });
}
