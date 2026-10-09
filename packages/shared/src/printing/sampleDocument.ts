import type { PrintableDocument } from './types';

/** Documento de prueba — no representa una venta confirmada. */
export function buildPrintTestDocument(locale: 'es' | 'en'): PrintableDocument {
  const isEs = locale === 'es';
  return {
    documentType: 'print_test',
    documentNumber: isEs ? 'PRUEBA-001' : 'TEST-001',
    issuedAt: new Date().toISOString(),
    title: isEs ? 'Impresión de prueba' : 'Test print',
    customerName: isEs ? 'Cliente de demostración' : 'Demo customer',
    lines: [
      {
        description: isEs ? 'Artículo de ejemplo (no inventado en producción)' : 'Sample line item',
        qty: '1',
        unitPrice: '0.00',
        lineTotal: '0.00',
      },
    ],
    subtotal: '0.00',
    discount: '0.00',
    tax: '0.00',
    total: '0.00',
    notes: isEs
      ? 'Este documento solo valida diseño e impresión. No registra ventas ni inventario.'
      : 'This document only validates layout and printing. It does not post sales or inventory.',
    locale,
  };
}
