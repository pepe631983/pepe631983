import { describe, expect, it } from 'vitest';
import { APP_NAME } from '../branding';
import { renderPrintDocumentHtml } from './renderHtml';
import { buildPrintTestDocument } from './sampleDocument';
import type { PrintProfile } from './types';

const profileLetter: PrintProfile = {
  profileKey: 'sales_invoice',
  paperFormat: 'letter',
  useThermal: false,
  thermalWidth: null,
  marginTopMm: 10,
  marginRightMm: 10,
  marginBottomMm: 10,
  marginLeftMm: 10,
  defaultCopies: 1,
  contentOptions: { showLogo: true, showTaxId: true, showCustomer: true },
};

const profile80: PrintProfile = {
  ...profileLetter,
  profileKey: 'sales_receipt',
  useThermal: true,
  thermalWidth: '80mm',
};

describe('renderPrintDocumentHtml', () => {
  it('incluye marca COPIA en reimpresión', () => {
    const html = renderPrintDocumentHtml({
      brand: {
        appName: APP_NAME,
        commercialName: 'TCI Auto Zone',
        addressLines: [],
        taxConfigPending: true,
      },
      document: buildPrintTestDocument('es'),
      profile: profileLetter,
      isMarkedCopy: true,
      isTestDocument: true,
    });
    expect(html).toContain('COPIA');
  });

  it('aplica ancho térmico 80mm', () => {
    const html = renderPrintDocumentHtml({
      brand: {
        appName: APP_NAME,
        commercialName: 'TCI Auto Zone',
        addressLines: [],
        taxConfigPending: true,
      },
      document: buildPrintTestDocument('en'),
      profile: profile80,
      isMarkedCopy: false,
      isTestDocument: true,
    });
    expect(html).toContain('page-thermal-80');
    expect(html).toContain('80mm');
  });
});
