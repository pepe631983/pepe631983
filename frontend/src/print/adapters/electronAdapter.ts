import type { PrintAdapterImplementation, AdapterPrintInput, AdapterPrintOutcome } from '@/print/adapters/types';

type ElectronPrintApi = {
  listPrinters: () => Promise<Array<{ name: string; isDefault: boolean }>>;
  printHtml: (payload: { html: string; printerName?: string; copies: number }) => Promise<{ ok: boolean; error?: string }>;
};

function api(): ElectronPrintApi | null {
  return (window as Window & { electronAPI?: ElectronPrintApi }).electronAPI ?? null;
}

export const electronDirectAdapter: PrintAdapterImplementation = {
  id: 'electron_direct',
  async isAvailable() {
    return api() !== null;
  },
  async print(input: AdapterPrintInput): Promise<AdapterPrintOutcome> {
    const electron = api();
    if (!electron) {
      return { status: 'failed', message: 'App de escritorio no detectada' };
    }
    const result = await electron.printHtml({
      html: input.html,
      printerName: input.printerName ?? undefined,
      copies: input.copies,
    });
    if (!result.ok) {
      return { status: 'failed', message: result.error ?? 'Error al imprimir' };
    }
    return { status: 'sent_to_spooler' };
  },
  instructionsKey: 'printing.instructions.electron',
};

export async function listElectronPrinters(): Promise<Array<{ name: string; isDefault: boolean }>> {
  const electron = api();
  if (!electron) return [];
  return electron.listPrinters();
}
