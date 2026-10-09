import { z } from 'zod';
import { PRINT_PROFILE_KEYS } from './types';

export const printContentOptionsSchema = z.object({
  showLogo: z.boolean().optional(),
  showTaxId: z.boolean().optional(),
  showCustomer: z.boolean().optional(),
  showBarcode: z.boolean().optional(),
  footerText: z.string().max(500).optional(),
});

export const updatePrintProfileSchema = z.object({
  profileKey: z.enum(PRINT_PROFILE_KEYS),
  paperFormat: z.enum(['letter', 'a4']),
  useThermal: z.boolean(),
  thermalWidth: z.enum(['58mm', '80mm']).nullable(),
  marginTopMm: z.number().min(0).max(50),
  marginRightMm: z.number().min(0).max(50),
  marginBottomMm: z.number().min(0).max(50),
  marginLeftMm: z.number().min(0).max(50),
  defaultCopies: z.number().int().min(1).max(10),
  contentOptions: printContentOptionsSchema,
}).refine(
  (v) => (v.useThermal ? v.thermalWidth !== null : v.thermalWidth === null),
  { message: 'Indique ancho térmico 58 mm u 80 mm, o desactive térmico' },
);

export type UpdatePrintProfileInput = z.infer<typeof updatePrintProfileSchema>;
