import {
  renderPrintDocumentHtml,
  type DocumentBrandHeader,
  type PrintAdapterId,
  type PrintFunction,
  type PrintProfile,
  type PrintableDocument,
  profileKeyForFunction,
} from '@repuestos/shared';
import { getAdapter } from '@/print/adapters/registry';
import { createWebPdfAdapter } from '@/print/adapters/webPdfAdapter';
import { getDeviceFingerprint } from '@/lib/deviceFingerprint';
import { supabase } from '@/lib/supabase';

export type QueuePrintRequest = {
  profile: PrintProfile;
  brand: DocumentBrandHeader;
  document: PrintableDocument;
  adapterId: PrintAdapterId;
  printFunction?: PrintFunction;
  copies?: number;
  isReprint?: boolean;
  isMarkedCopy?: boolean;
  printerName?: string | null;
  paperHint?: string | null;
  sourceDocumentType?: string | null;
  sourceDocumentId?: string | null;
};

export type QueuePrintResult = {
  jobId: string;
  status: string;
};

function channelForAdapter(adapterId: PrintAdapterId) {
  switch (adapterId) {
    case 'web_pdf':
      return 'pdf_download' as const;
    case 'electron_direct':
      return 'electron_direct' as const;
    case 'rawbt_android':
      return 'rawbt_android' as const;
    case 'local_agent':
      return 'local_agent' as const;
    case 'airprint_via_system':
      return 'airprint_via_system' as const;
    default:
      return 'system_dialog' as const;
  }
}

/** Encola en BD (pending) y procesa sin tocar ventas ni contabilidad. */
export async function enqueueAndProcessPrint(request: QueuePrintRequest): Promise<QueuePrintResult> {
  const clientRequestId = crypto.randomUUID();
  const copies = request.copies ?? request.profile.defaultCopies;
  const isReprint = Boolean(request.isReprint);
  const isMarkedCopy = Boolean(request.isMarkedCopy || isReprint);
  const printFunction = request.printFunction ?? inferFunction(request.profile.profileKey);
  const fingerprint = getDeviceFingerprint();

  const { data: jobId, error: regError } = await supabase.rpc('register_print_job', {
    p_profile_key: request.profile.profileKey,
    p_channel: channelForAdapter(request.adapterId),
    p_client_request_id: clientRequestId,
    p_source_document_type: request.sourceDocumentType ?? request.document.documentType,
    p_source_document_id: request.sourceDocumentId ?? null,
    p_is_reprint: isReprint,
    p_is_marked_copy: isMarkedCopy,
    p_copies_requested: copies,
    p_metadata: { adapterId: request.adapterId },
    p_print_function: printFunction,
    p_device_fingerprint: fingerprint,
    p_printer_name: request.printerName ?? null,
    p_paper_hint: request.paperHint ?? null,
  });

  if (regError || !jobId) {
    throw new Error(regError?.message ?? 'No se pudo encolar la impresión');
  }

  return processExistingJob(String(jobId), request, { copies, isMarkedCopy });
}

export async function processExistingJob(
  jobId: string,
  request: QueuePrintRequest,
  opts: { copies: number; isMarkedCopy: boolean },
): Promise<QueuePrintResult> {
  const html = renderPrintDocumentHtml({
    brand: request.brand,
    document: request.document,
    profile: request.profile,
    isMarkedCopy: opts.isMarkedCopy,
    isTestDocument: request.document.documentType === 'print_test',
  });

  await supabase.rpc('update_print_job_status', {
    p_job_id: jobId,
    p_status: 'sending',
    p_error_message: null,
    p_increment_attempt: true,
  });

  const adapter =
    request.adapterId === 'web_pdf'
      ? createWebPdfAdapter({
          paperFormat: request.profile.paperFormat,
          useThermal: request.profile.useThermal,
          thermalWidth: request.profile.thermalWidth,
          filename: `TCI-${request.document.documentNumber.replace(/[^\w-]+/g, '_')}.pdf`,
        })
      : getAdapter(request.adapterId);

  if (!adapter) {
    await supabase.rpc('update_print_job_status', {
      p_job_id: jobId,
      p_status: 'failed',
      p_error_message: 'Adaptador no disponible en esta plataforma',
      p_increment_attempt: false,
    });
    throw new Error('Adaptador no disponible');
  }

  const available = await adapter.isAvailable();
  if (!available) {
    await supabase.rpc('update_print_job_status', {
      p_job_id: jobId,
      p_status: 'failed',
      p_error_message: 'Adaptador no disponible en este dispositivo',
      p_increment_attempt: false,
    });
    throw new Error('Adaptador no disponible en este dispositivo');
  }

  try {
    const outcome = await adapter.print({
      html,
      copies: opts.copies,
      printerName: request.printerName,
      paperHint: request.paperHint,
    });
    await supabase.rpc('update_print_job_status', {
      p_job_id: jobId,
      p_status: outcome.status,
      p_error_message: outcome.message ?? null,
      p_increment_attempt: false,
    });
    return { jobId, status: outcome.status };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error de impresión';
    await supabase.rpc('update_print_job_status', {
      p_job_id: jobId,
      p_status: 'failed',
      p_error_message: message,
      p_increment_attempt: false,
    });
    throw err;
  }
}

function inferFunction(profileKey: string): PrintFunction {
  if (profileKey === 'sales_receipt') return 'ticket';
  if (profileKey === 'report' || profileKey === 'purchase_order') return 'report';
  return 'invoice';
}

export async function recoverPrintQueueOnStartup(): Promise<number> {
  const { data, error } = await supabase.rpc('recover_stale_print_jobs', { p_stale_minutes: 5 });
  if (error) return 0;
  return Number(data ?? 0);
}

export async function fetchRecoverableJobs() {
  const { data, error } = await supabase
    .from('print_jobs')
    .select('*')
    .in('status', ['pending', 'sending', 'uncertain'])
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export { profileKeyForFunction };
