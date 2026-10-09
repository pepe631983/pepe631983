import {
  renderPrintDocumentHtml,
  type DocumentBrandHeader,
  type PrintChannel,
  type PrintProfile,
  type PrintableDocument,
} from '@repuestos/shared';
import { supabase } from '@/lib/supabase';
import { downloadPrintHtmlAsPdf } from '@/print/pdfDownload';
import { printHtmlViaSystemDialog } from '@/print/systemPrint';

export type PrintRequest = {
  profile: PrintProfile;
  brand: DocumentBrandHeader;
  document: PrintableDocument;
  channel: PrintChannel;
  copies?: number;
  isReprint?: boolean;
  isMarkedCopy?: boolean;
  sourceDocumentType?: string | null;
  sourceDocumentId?: string | null;
};

export type PrintResult = {
  jobId: string;
  status: 'sent_to_spooler' | 'completed' | 'failed' | 'unknown';
};

function buildClientRequestId(): string {
  return crypto.randomUUID();
}

export async function executePrint(request: PrintRequest): Promise<PrintResult> {
  const clientRequestId = buildClientRequestId();
  const copies = request.copies ?? request.profile.defaultCopies;
  const isReprint = Boolean(request.isReprint);
  const isMarkedCopy = Boolean(request.isMarkedCopy || isReprint);
  const isTestDocument = request.document.documentType === 'print_test';

  const { data: jobId, error: regError } = await supabase.rpc('register_print_job', {
    p_profile_key: request.profile.profileKey,
    p_channel: request.channel,
    p_client_request_id: clientRequestId,
    p_source_document_type: request.sourceDocumentType ?? request.document.documentType,
    p_source_document_id: request.sourceDocumentId ?? null,
    p_is_reprint: isReprint,
    p_is_marked_copy: isMarkedCopy,
    p_copies_requested: copies,
    p_metadata: { channel: request.channel, copies },
  });

  if (regError || !jobId) {
    throw new Error(regError?.message ?? 'No se pudo registrar la solicitud de impresión');
  }

  const html = renderPrintDocumentHtml({
    brand: request.brand,
    document: request.document,
    profile: request.profile,
    isMarkedCopy,
    isTestDocument,
  });

  try {
    if (request.channel === 'pdf_download') {
      const safeName = request.document.documentNumber.replace(/[^\w-]+/g, '_');
      await downloadPrintHtmlAsPdf(html, `TCI-${safeName}.pdf`, {
        paperFormat: request.profile.paperFormat,
        useThermal: request.profile.useThermal,
        thermalWidth: request.profile.thermalWidth,
      });
      await supabase.rpc('update_print_job_status', {
        p_job_id: jobId,
        p_status: 'completed',
        p_error_message: null,
      });
      return { jobId, status: 'completed' };
    }

    if (request.channel === 'system_dialog') {
      const spoolStatus = await printHtmlViaSystemDialog(html, copies);
      await supabase.rpc('update_print_job_status', {
        p_job_id: jobId,
        p_status: spoolStatus,
        p_error_message: null,
      });
      return { jobId, status: spoolStatus };
    }

    throw new Error('Canal de impresión directa aún no habilitado en la versión web');
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error de impresión';
    await supabase.rpc('update_print_job_status', {
      p_job_id: jobId,
      p_status: 'failed',
      p_error_message: message,
    });
    throw err;
  }
}

/** Solo genera HTML para vista previa — no registra venta ni movimientos. */
export function buildPreviewHtml(
  request: Omit<PrintRequest, 'channel' | 'copies' | 'isReprint'>,
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
