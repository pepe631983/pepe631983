import type { PrintAdapterId } from '@repuestos/shared';
import { electronDirectAdapter } from '@/print/adapters/electronAdapter';
import { rawbtAdapter } from '@/print/adapters/rawbtAdapter';
import { webSystemAdapter } from '@/print/adapters/webSystemAdapter';
import type { PrintAdapterImplementation } from '@/print/adapters/types';

const base: Record<PrintAdapterId, PrintAdapterImplementation | null> = {
  web_system: webSystemAdapter,
  web_pdf: null,
  electron_direct: electronDirectAdapter,
  rawbt_android: rawbtAdapter,
  local_agent: null,
  airprint_via_system: webSystemAdapter,
};

export function getAdapter(id: PrintAdapterId): PrintAdapterImplementation | null {
  return base[id];
}
