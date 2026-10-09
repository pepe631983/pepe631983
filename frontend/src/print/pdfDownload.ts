import html2canvas from 'html2canvas';
import { jsPDF } from 'jspdf';
import type { PrintPaperFormat, PrintThermalWidth } from '@repuestos/shared';

function pageSize(format: PrintPaperFormat | 'thermal', thermal?: PrintThermalWidth | null) {
  if (format === 'thermal') {
    const w = thermal === '58mm' ? 58 : 80;
    return { widthMm: w, heightMm: 200, orientation: 'p' as const };
  }
  if (format === 'a4') {
    return { widthMm: 210, heightMm: 297, orientation: 'p' as const };
  }
  return { widthMm: 215.9, heightMm: 279.4, orientation: 'p' as const };
}

export async function downloadPrintHtmlAsPdf(
  html: string,
  filename: string,
  options: {
    paperFormat: PrintPaperFormat;
    useThermal: boolean;
    thermalWidth: PrintThermalWidth | null;
  },
): Promise<void> {
  const host = document.createElement('div');
  host.style.position = 'fixed';
  host.style.left = '-10000px';
  host.style.top = '0';
  host.style.background = '#fff';
  host.innerHTML = html;
  document.body.appendChild(host);

  const sheet = host.querySelector('.sheet') as HTMLElement | null;
  if (!sheet) {
    document.body.removeChild(host);
    throw new Error('No se pudo renderizar el documento para PDF');
  }

  try {
    const canvas = await html2canvas(sheet, { scale: 2, useCORS: true, logging: false });
    const img = canvas.toDataURL('image/png');
    const { widthMm, heightMm, orientation } = pageSize(
      options.useThermal ? 'thermal' : options.paperFormat,
      options.thermalWidth,
    );
    const pdf = new jsPDF({ orientation, unit: 'mm', format: [widthMm, heightMm] });
    const imgHeight = (canvas.height * widthMm) / canvas.width;
    pdf.addImage(img, 'PNG', 0, 0, widthMm, Math.min(imgHeight, heightMm));
    pdf.save(filename);
  } finally {
    document.body.removeChild(host);
  }
}
