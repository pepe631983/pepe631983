import type { PrintChannel, PrintFunction, PrintJobStatus } from './types';

/** Adaptadores de impresión — separados de ventas y contabilidad. */
export type PrintAdapterId =
  | 'web_system'
  | 'web_pdf'
  | 'electron_direct'
  | 'rawbt_android'
  | 'local_agent'
  | 'airprint_via_system';

export type PrintAdapterCapabilities = {
  id: PrintAdapterId;
  channel: PrintChannel;
  labelEs: string;
  labelEn: string;
  /** Acceso directo USB/BT en navegador — normalmente false */
  directHardwareAccess: boolean;
  canConfirmPhysicalPrint: boolean;
  requiresAuxiliaryApp?: string;
  platformHints: string[];
};

export const PRINT_ADAPTERS: Record<PrintAdapterId, PrintAdapterCapabilities> = {
  web_system: {
    id: 'web_system',
    channel: 'system_dialog',
    labelEs: 'Diálogo del sistema (web)',
    labelEn: 'System print dialog (web)',
    directHardwareAccess: false,
    canConfirmPhysicalPrint: false,
    platformHints: ['Windows', 'macOS', 'Android', 'iOS/iPadOS vía diálogo'],
  },
  web_pdf: {
    id: 'web_pdf',
    channel: 'pdf_download',
    labelEs: 'Descargar PDF',
    labelEn: 'Download PDF',
    directHardwareAccess: false,
    canConfirmPhysicalPrint: true,
    platformHints: ['Todas las plataformas'],
  },
  airprint_via_system: {
    id: 'airprint_via_system',
    channel: 'airprint_via_system',
    labelEs: 'AirPrint (si aparece en el diálogo)',
    labelEn: 'AirPrint (when shown in dialog)',
    directHardwareAccess: false,
    canConfirmPhysicalPrint: false,
    platformHints: ['iPhone', 'iPad'],
  },
  electron_direct: {
    id: 'electron_direct',
    channel: 'electron_direct',
    labelEs: 'Impresora instalada (app de escritorio)',
    labelEn: 'Installed printer (desktop app)',
    directHardwareAccess: true,
    canConfirmPhysicalPrint: false,
    platformHints: ['Windows', 'macOS con TCI Auto Zone Desktop'],
  },
  rawbt_android: {
    id: 'rawbt_android',
    channel: 'rawbt_android',
    labelEs: 'RawBT (Android, modelos compatibles)',
    labelEn: 'RawBT (Android, compatible models)',
    directHardwareAccess: true,
    canConfirmPhysicalPrint: false,
    requiresAuxiliaryApp: 'RawBT',
    platformHints: ['Android + impresora térmica compatible'],
  },
  local_agent: {
    id: 'local_agent',
    channel: 'local_agent',
    labelEs: 'Agente local en red (experimental)',
    labelEn: 'Local network agent (experimental)',
    directHardwareAccess: true,
    canConfirmPhysicalPrint: false,
    platformHints: ['Tablet/teléfono → PC con agente en LAN'],
  },
};

export function profileKeyForFunction(fn: PrintFunction): string {
  switch (fn) {
    case 'ticket':
      return 'sales_receipt';
    case 'invoice':
      return 'sales_invoice';
    case 'report':
      return 'report';
  }
}

/** Estados de cola visibles al usuario */
export type QueueStatus =
  | 'pending'
  | 'sending'
  | 'sent_to_spooler'
  | 'failed'
  | 'uncertain'
  | 'confirmed_printed'
  | 'completed';

export function normalizeQueueStatus(status: PrintJobStatus | string): QueueStatus {
  if (status === 'requested') return 'pending';
  if (status === 'unknown') return 'uncertain';
  return status as QueueStatus;
}
