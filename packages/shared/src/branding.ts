/** Identidad de producto — usar en UI, PDFs y reportes (etapas futuras). */
export const APP_NAME = 'TCI Auto Zone';

export const DEFAULT_BUSINESS = {
  commercialName: APP_NAME,
  countryCode: 'TC',
  timezone: 'America/Grand_Turk',
  currencyCode: 'USD',
  currencyDecimalPlaces: 2,
  defaultLocale: 'es' as const,
};

export const SUPPORTED_LOCALES = ['es', 'en'] as const;
export type AppLocale = (typeof SUPPORTED_LOCALES)[number];

/** Encabezado para documentos impresos (facturas, recibos, etc.). */
export type DocumentBrandHeader = {
  appName: string;
  commercialName: string;
  legalName?: string | null;
  addressLines: string[];
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  logoUrl?: string | null;
  taxIdLabel?: string | null;
  taxIdValue?: string | null;
  taxConfigPending: boolean;
};
