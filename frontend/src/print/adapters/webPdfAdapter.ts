import type { PrintAdapterImplementation, AdapterPrintInput, AdapterPrintOutcome } from '@/print/adapters/types';
import { downloadPrintHtmlAsPdf } from '@/print/pdfDownload';
import type { PrintPaperFormat, PrintThermalWidth } from '@repuestos/shared';

export function createWebPdfAdapter(options: {
  paperFormat: PrintPaperFormat;
  useThermal: boolean;
  thermalWidth: PrintThermalWidth | null;
  filename: string;
}): PrintAdapterImplementation {
  return {
    id: 'web_pdf',
    async isAvailable() {
      return true;
    },
    async print(input: AdapterPrintInput): Promise<AdapterPrintOutcome> {
      await downloadPrintHtmlAsPdf(input.html, options.filename, {
        paperFormat: options.paperFormat,
        useThermal: options.useThermal,
        thermalWidth: options.thermalWidth,
      });
      return { status: 'completed' };
    },
    instructionsKey: 'printing.instructions.pdf',
  };
}
