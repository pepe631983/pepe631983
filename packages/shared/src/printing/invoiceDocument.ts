import type { PrintableDocument } from './types';

export type InvoicePrintLine = {
  description: string;
  quantity: string;
  unitPrice: string;
  discount: string;
  lineSubtotal: string;
};

export function buildPrintableFromInvoice(params: {
  invoiceNumber: string;
  issuedAt: string;
  customerName?: string;
  lines: InvoicePrintLine[];
  subtotal: string;
  discountTotal: string;
  taxTotal: string;
  total: string;
  locale: 'es' | 'en';
}): PrintableDocument {
  return {
    documentType: 'sales_invoice',
    documentNumber: params.invoiceNumber,
    issuedAt: params.issuedAt,
    title: params.locale === 'es' ? 'Factura de venta' : 'Sales invoice',
    customerName: params.customerName,
    lines: params.lines.map((l) => ({
      description: l.description,
      qty: l.quantity,
      unitPrice: l.unitPrice,
      lineTotal: l.lineSubtotal,
    })),
    subtotal: params.subtotal,
    discount: params.discountTotal,
    tax: params.taxTotal,
    total: params.total,
    locale: params.locale,
  };
}
