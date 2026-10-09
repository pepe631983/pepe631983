import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../branding';
import { renderPrintDocumentHtml } from './renderHtml';
import type { PrintProfile } from './types';

const formats: PrintProfile[] = [
  {
    profileKey: 'sales_receipt',
    paperFormat: 'letter',
    useThermal: true,
    thermalWidth: '58mm',
    marginTopMm: 2,
    marginRightMm: 2,
    marginBottomMm: 2,
    marginLeftMm: 2,
    defaultCopies: 1,
    contentOptions: { showLogo: true, showCustomer: true, showTaxId: true },
  },
  {
    profileKey: 'sales_receipt',
    paperFormat: 'letter',
    useThermal: true,
    thermalWidth: '80mm',
    marginTopMm: 2,
    marginRightMm: 2,
    marginBottomMm: 2,
    marginLeftMm: 2,
    defaultCopies: 1,
    contentOptions: { showLogo: true, showCustomer: true },
  },
  {
    profileKey: 'sales_invoice',
    paperFormat: 'letter',
    useThermal: false,
    thermalWidth: null,
    marginTopMm: 10,
    marginRightMm: 10,
    marginBottomMm: 10,
    marginLeftMm: 10,
    defaultCopies: 1,
    contentOptions: { showLogo: true },
  },
  {
    profileKey: 'sales_invoice',
    paperFormat: 'a4',
    useThermal: false,
    thermalWidth: null,
    marginTopMm: 10,
    marginRightMm: 10,
    marginBottomMm: 10,
    marginLeftMm: 10,
    defaultCopies: 1,
    contentOptions: { showLogo: true },
  },
];

describe('renderPrintDocumentHtml stress', () => {
  for (const profile of formats) {
    it(`renderiza muchas líneas sin error (${profile.thermalWidth ?? profile.paperFormat})`, () => {
      const lines = Array.from({ length: 40 }, (_, i) => ({
        description: `Filtro de aceite premium compatibilidad extendida línea ${i + 1}`,
        qty: '2',
        unitPrice: '19.99',
        lineTotal: '39.98',
      }));
      const html = renderPrintDocumentHtml({
        brand: {
          appName: APP_NAME,
          commercialName: 'TCI Auto Zone',
          addressLines: ['Long address line for Providenciales Turks and Caicos'],
          taxConfigPending: true,
        },
        document: {
          documentType: 'sales_invoice',
          documentNumber: 'V000999',
          issuedAt: new Date().toISOString(),
          title: 'Factura',
          customerName: 'Cliente flota taxi',
          lines,
          subtotal: '1599.20',
          discount: '50.00',
          tax: '0.00',
          total: '1549.20',
          locale: 'es',
        },
        profile,
        isMarkedCopy: false,
        isTestDocument: false,
      });
      expect(html.length).toBeGreaterThan(500);
      expect(html).toContain('1549.20');
    });
  }
});
