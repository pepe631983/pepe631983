import type { PrintAdapterImplementation, AdapterPrintInput, AdapterPrintOutcome } from '@/print/adapters/types';
import { printHtmlViaSystemDialog } from '@/print/systemPrint';

export const webSystemAdapter: PrintAdapterImplementation = {
  id: 'web_system',
  async isAvailable() {
    return typeof window !== 'undefined' && typeof window.print === 'function';
  },
  async print(input: AdapterPrintInput): Promise<AdapterPrintOutcome> {
    const result = await printHtmlViaSystemDialog(input.html, input.copies);
    return { status: result };
  },
  instructionsKey: 'printing.instructions.webSystem',
};
