import {
  renderPrintDocumentHtml,
  type DocumentBrandHeader,
  type PrintProfile,
  type PrintableDocument,
} from '@repuestos/shared';
import { enqueueAndProcessPrint, type QueuePrintRequest } from '@/print/printQueueService';

export type PrintResult = { jobId: string; status: string };

/** @deprecated use enqueueAndProcessPrint */
export async function executePrint(request: QueuePrintRequest): Promise<PrintResult> {
  return enqueueAndProcessPrint(request);
}

/** Solo genera HTML para vista previa — no registra venta ni movimientos. */
export function buildPreviewHtml(
  request: {
    profile: PrintProfile;
    brand: DocumentBrandHeader;
    document: PrintableDocument;
  },
  options?: { isMarkedCopy?: boolean },
): string {
  return renderPrintDocumentHtml({
    brand: request.brand,
    document: request.document,
    profile: request.profile,
    isMarkedCopy: Boolean(options?.isMarkedCopy),
    isTestDocument: request.document.documentType === 'print_test',
  });
}
