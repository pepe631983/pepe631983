import { z } from 'zod';

export const createCompanySchema = z.object({
  commercialName: z.string().trim().min(2, 'Indique el nombre comercial'),
  fullName: z.string().trim().min(2, 'Indique su nombre'),
  countryCode: z.string().length(2).default('MX'),
  timezone: z.string().min(1).default('America/Mexico_City'),
  currencyCode: z.string().length(3).default('MXN'),
  isDemo: z.boolean().default(false),
});

export type CreateCompanyInput = z.infer<typeof createCompanySchema>;

export const updateCompanySettingsSchema = z.object({
  commercialName: z.string().trim().min(2),
  legalName: z.string().trim().optional().nullable(),
  addressLine1: z.string().trim().optional().nullable(),
  city: z.string().trim().optional().nullable(),
  publicPhone: z.string().trim().optional().nullable(),
  publicEmail: z.string().email().optional().nullable().or(z.literal('')),
  pricesIncludeTax: z.boolean(),
  currencyDecimalPlaces: z.number().int().min(0).max(4),
});

export type UpdateCompanySettingsInput = z.infer<typeof updateCompanySettingsSchema>;
