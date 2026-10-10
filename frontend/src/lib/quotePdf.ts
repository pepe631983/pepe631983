import { jsPDF } from 'jspdf';

export type QuotePdfLine = {
  description: string;
  quantity: number;
  unit_price: number;
  discount: number;
  line_subtotal: number;
};

export function downloadQuotePdf(
  meta: { quote_number: string; valid_until?: string; subtotal: number; tax_total: number; total: number },
  lines: QuotePdfLine[],
  filename?: string,
): void {
  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  let y = 18;
  pdf.setFontSize(16);
  pdf.text('TCI Auto Zone — Cotización', 14, y);
  y += 8;
  pdf.setFontSize(11);
  pdf.text(`Número: ${meta.quote_number}`, 14, y);
  y += 6;
  if (meta.valid_until) {
    pdf.text(`Válida hasta: ${meta.valid_until}`, 14, y);
    y += 6;
  }
  y += 4;
  pdf.setFontSize(10);
  lines.forEach((l) => {
    const row = `${l.description} · ${l.quantity} × ${Number(l.unit_price).toFixed(2)} = ${Number(l.line_subtotal).toFixed(2)} USD`;
    pdf.text(row, 14, y, { maxWidth: 180 });
    y += 7;
    if (y > 270) {
      pdf.addPage();
      y = 18;
    }
  });
  y += 4;
  pdf.text(`Subtotal: ${Number(meta.subtotal).toFixed(2)} USD`, 14, y);
  y += 6;
  pdf.text(`Impuestos: ${Number(meta.tax_total).toFixed(2)} USD`, 14, y);
  y += 6;
  pdf.setFontSize(12);
  pdf.text(`Total: ${Number(meta.total).toFixed(2)} USD`, 14, y);
  pdf.save(filename ?? `cotizacion-${meta.quote_number}.pdf`);
}
