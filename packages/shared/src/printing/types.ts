import type { DocumentBrandHeader } from '../branding';

export const PRINT_PROFILE_KEYS = [
  'sales_invoice',
  'quote',
  'purchase_order',
  'report',
  'sales_receipt',
] as const;

export type PrintProfileKey = (typeof PRINT_PROFILE_KEYS)[number];

export type PrintPaperFormat = 'letter' | 'a4';
export type PrintThermalWidth = '58mm' | '80mm';
export type PrintChannel =
  | 'system_dialog'
  | 'pdf_download'
  | 'direct_device'
  | 'rawbt_android'
  | 'electron_direct'
  | 'local_agent'
  | 'airprint_via_system';

export type PrintJobStatus =
  | 'pending'
  | 'sending'
  | 'sent_to_spooler'
  | 'completed'
  | 'failed'
  | 'uncertain'
  | 'confirmed_printed'
  /** legacy */
  | 'requested'
  | 'unknown';

export type PrintFunction = 'ticket' | 'invoice' | 'report';

export type PrintContentOptions = {
  showLogo?: boolean;
  showTaxId?: boolean;
  showCustomer?: boolean;
  showBarcode?: boolean;
  footerText?: string;
};

export type PrintProfile = {
  profileKey: PrintProfileKey;
  paperFormat: PrintPaperFormat;
  useThermal: boolean;
  thermalWidth: PrintThermalWidth | null;
  marginTopMm: number;
  marginRightMm: number;
  marginBottomMm: number;
  marginLeftMm: number;
  defaultCopies: number;
  contentOptions: PrintContentOptions;
};

/** Documento imprimible (venta confirmada o prueba). La impresión no altera el documento origen. */
export type PrintableDocument = {
  documentType: PrintProfileKey | 'print_test';
  documentNumber: string;
  issuedAt: string;
  title: string;
  customerName?: string;
  lines: Array<{ description: string; qty: string; unitPrice: string; lineTotal: string }>;
  subtotal: string;
  discount: string;
  tax: string;
  total: string;
  notes?: string;
  locale: 'es' | 'en';
};

export type RenderPrintInput = {
  brand: DocumentBrandHeader;
  document: PrintableDocument;
  profile: PrintProfile;
  isMarkedCopy: boolean;
  isTestDocument: boolean;
};

/** Capacidades futuras — no implementadas en web v1 */
export type DirectPrintCapability = {
  platform: 'web' | 'electron' | 'android' | 'ios';
  escPos: false;
  rawBt: false;
  airPrint: 'via_system_dialog_only';
  note: string;
};

export const WEB_PRINT_CAPABILITY: DirectPrintCapability = {
  platform: 'web',
  escPos: false,
  rawBt: false,
  airPrint: 'via_system_dialog_only',
  note: 'Use el diálogo del sistema o PDF. ESC/POS y RawBT requieren integración por dispositivo.',
};
