import { z } from 'zod';
import { DEFAULT_BUSINESS } from '../branding';

export const createCompanySchema = z.object({
  commercialName: z.string().trim().min(2, 'Indique el nombre comercial'),
  fullName: z.string().trim().min(2, 'Indique su nombre'),
  countryCode: z.string().length(2).default(DEFAULT_BUSINESS.countryCode),
  timezone: z.string().min(1).default(DEFAULT_BUSINESS.timezone),
  currencyCode: z.string().length(3).default(DEFAULT_BUSINESS.currencyCode),
  isDemo: z.boolean().default(false),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySettingsSchema = z.object({
  commercialName: z.string().trim().min(2),
  legalName: z.string().trim().optional().nullable(),
  logoUrl: z.string().url().optional().nullable().or(z.literal('')),
  addressLine1: z.string().trim().optional().nullable(),
  addressLine2: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  stateRegion: z.string().trim().optional().nullable(),
  postalCode: z.string().trim().optional().nullable(),
  publicPhone: z.string().trim().optional().nullable(),
  publicEmail: z.string().email().optional().nullable().or(z.literal('')),
  website: z.string().url().optional().nullable().or(z.literal('')),
  taxIdLabel: z.string().trim().optional().nullable(),
  taxIdValue: z.string().trim().optional().nullable(),
  pricesIncludeTax: z.boolean(),
  currencyDecimalPlaces: z.number().int().min(0).max(4),
});

export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;
