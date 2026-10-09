import type { PrintAdapterId } from '@repuestos/shared';

export type AdapterPrintInput = {
  html: string;
  copies: number;
  printerName?: string | null;
  paperHint?: string | null;
};

export type AdapterPrintOutcome = {
  status: 'sent_to_spooler' | 'completed' | 'failed' | 'uncertain' | 'confirmed_printed';
  message?: string;
};

export interface PrintAdapterImplementation {
  id: PrintAdapterId;
  print(input: AdapterPrintInput): Promise<AdapterPrintOutcome>;
  isAvailable(): Promise<boolean>;
  instructionsKey?: string;
}
