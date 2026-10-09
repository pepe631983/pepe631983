import type { PrintAdapterImplementation, AdapterPrintInput, AdapterPrintOutcome } from '@/print/adapters/types';

/** RawBT: intent Android; no ESC/POS genérico sin verificar modelo. */
export const rawbtAdapter: PrintAdapterImplementation = {
  id: 'rawbt_android',
  async isAvailable() {
    return /Android/i.test(navigator.userAgent);
  },
  async print(input: AdapterPrintInput): Promise<AdapterPrintOutcome> {
    if (!/Android/i.test(navigator.userAgent)) {
      return { status: 'failed', message: 'RawBT solo aplica en Android' };
    }
    try {
      const encoded = btoa(unescape(encodeURIComponent(input.html)));
      const url = `rawbt:base64,${encoded}`;
      window.location.href = url;
      return { status: 'uncertain', message: 'Enviado a RawBT; confirme en la impresora' };
    } catch {
      return { status: 'failed', message: 'No se pudo abrir RawBT. Instale la app auxiliar.' };
    }
  },
  instructionsKey: 'printing.instructions.rawbt',
};
