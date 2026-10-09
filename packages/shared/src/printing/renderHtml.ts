import type { RenderPrintInput } from './types';

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');
}

function moneyLabel(locale: 'es' | 'en'): string {
  return locale === 'es' ? 'USD' : 'USD';
}

export function renderPrintDocumentHtml(input: RenderPrintInput): string {
  const { brand, document, profile, isMarkedCopy, isTestDocument } = input;
  const opts = profile.contentOptions;
  const thermal = profile.useThermal;
  const width = profile.thermalWidth ?? '80mm';
  const pageClass = thermal
    ? width === '58mm'
      ? 'thermal-58'
      : 'thermal-80'
    : profile.paperFormat;
  const pageRuleName =
    pageClass === 'thermal-58'
      ? 'thermal-58'
      : pageClass === 'thermal-80'
        ? 'thermal-80'
        : pageClass;
  const copyLabel = document.locale === 'es' ? 'COPIA' : 'COPY';
  const testLabel = document.locale === 'es' ? 'SOLO PRUEBA' : 'TEST ONLY';

  const margins = `${profile.marginTopMm}mm ${profile.marginRightMm}mm ${profile.marginBottomMm}mm ${profile.marginLeftMm}mm`;

  const headerLines = brand.addressLines.map((l) => `<div>${escapeHtml(l)}</div>`).join('');
  const logo = opts.showLogo && brand.logoUrl
    ? `<img class="logo" src="${escapeHtml(brand.logoUrl)}" alt="" />`
    : `<div class="logo-placeholder">${escapeHtml(brand.commercialName.slice(0, 3).toUpperCase())}</div>`;

  const taxBlock =
    opts.showTaxId && brand.taxIdValue
      ? `<div class="muted">${escapeHtml(brand.taxIdLabel ?? 'Tax ID')}: ${escapeHtml(brand.taxIdValue)}</div>`
      : brand.taxConfigPending
        ? `<div class="muted tax-pending">${document.locale === 'es' ? 'Impuestos pendientes de configuración' : 'Tax settings pending'}</div>`
        : '';

  const linesHtml = document.lines
    .map(
      (line) => `
      <tr>
        <td>${escapeHtml(line.description)}</td>
        <td class="num">${escapeHtml(line.qty)}</td>
        <td class="num">${escapeHtml(line.unitPrice)}</td>
        <td class="num">${escapeHtml(line.lineTotal)}</td>
      </tr>`,
    )
    .join('');

  const customer =
    opts.showCustomer && document.customerName
      ? `<div><strong>${document.locale === 'es' ? 'Cliente' : 'Customer'}:</strong> ${escapeHtml(document.customerName)}</div>`
      : '';

  return `<!DOCTYPE html>
<html lang="${document.locale}">
<head>
<meta charset="utf-8" />
<title>${escapeHtml(document.title)} — ${escapeHtml(brand.commercialName)}</title>
<style>
  @page page-letter { size: letter; margin: ${margins}; }
  @page page-a4 { size: A4; margin: ${margins}; }
  @page page-thermal-58 { size: 58mm auto; margin: ${margins}; }
  @page page-thermal-80 { size: 80mm auto; margin: ${margins}; }

  * { box-sizing: border-box; }
  body {
    font-family: system-ui, sans-serif;
    color: #0c2340;
    margin: 0;
    padding: 0;
  }
  .sheet.page-letter { page: page-letter; max-width: 8.5in; }
  .sheet.page-a4 { page: page-a4; max-width: 210mm; }
  .sheet.page-thermal-58 { page: page-thermal-58; width: 58mm; font-size: 10px; }
  .sheet.page-thermal-80 { page: page-thermal-80; width: 80mm; font-size: 11px; }

  .watermark {
    position: fixed;
    top: 40%;
    left: 50%;
    transform: translate(-50%, -50%) rotate(-30deg);
    font-size: ${thermal ? '28px' : '64px'};
    font-weight: 800;
    color: rgba(200, 16, 46, 0.18);
    letter-spacing: 0.15em;
    pointer-events: none;
    z-index: 0;
  }
  .content { position: relative; z-index: 1; }
  header { border-bottom: 2px solid #0c2340; padding-bottom: 8px; margin-bottom: 12px; }
  .logo { max-height: ${thermal ? '36px' : '56px' }; max-width: ${thermal ? '100%' : '180px' }; object-fit: contain; }
  .logo-placeholder {
    display: inline-flex; align-items: center; justify-content: center;
    width: ${thermal ? '36px' : '48px'}; height: ${thermal ? '36px' : '48px'};
    background: #0c2340; color: #fff; font-weight: 700; border-radius: 6px;
  }
  h1 { margin: 8px 0 4px; font-size: ${thermal ? '14px' : '20px'}; color: #c8102e; }
  .muted { color: #475569; font-size: ${thermal ? '9px' : '12px'}; }
  table { width: 100%; border-collapse: collapse; margin-top: 10px; }
  th, td { padding: ${thermal ? '2px 0' : '6px 4px'}; text-align: left; vertical-align: top; }
  th { border-bottom: 1px solid #cbd5e1; font-size: ${thermal ? '9px' : '11px'}; }
  td.num { text-align: right; white-space: nowrap; }
  .totals { margin-top: 10px; width: 100%; }
  .totals td { padding: 2px 0; }
  .totals .grand { font-weight: 800; font-size: ${thermal ? '12px' : '14px'}; color: #c8102e; }
  footer { margin-top: 14px; border-top: 1px dashed #94a3b8; padding-top: 8px; font-size: ${thermal ? '9px' : '11px'}; }
  .banner-test {
    background: #fff7ed; border: 1px solid #fdba74; color: #9a3412;
    padding: 6px 8px; margin-bottom: 8px; font-size: ${thermal ? '9px' : '12px'};
  }
  @media print {
    body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  }
</style>
</head>
<body>
  <div class="sheet page-${pageRuleName}">
    ${isMarkedCopy ? `<div class="watermark">${copyLabel}</div>` : ''}
    <div class="content">
      ${isTestDocument ? `<div class="banner-test">${testLabel}</div>` : ''}
      <header>
        ${logo}
        <h1>${escapeHtml(brand.commercialName)}</h1>
        <div class="muted">${escapeHtml(brand.appName)}</div>
        ${headerLines}
        ${brand.phone ? `<div class="muted">${escapeHtml(brand.phone)}</div>` : ''}
        ${brand.email ? `<div class="muted">${escapeHtml(brand.email)}</div>` : ''}
        ${taxBlock}
      </header>
      <section>
        <div><strong>${escapeHtml(document.title)}</strong> #${escapeHtml(document.documentNumber)}</div>
        <div class="muted">${new Date(document.issuedAt).toLocaleString(document.locale === 'es' ? 'es' : 'en', { timeZone: 'America/Grand_Turk' })}</div>
        ${customer}
      </section>
      <table>
        <thead>
          <tr>
            <th>${document.locale === 'es' ? 'Descripción' : 'Description'}</th>
            <th class="num">${document.locale === 'es' ? 'Cant.' : 'Qty'}</th>
            <th class="num">${document.locale === 'es' ? 'Precio' : 'Price'}</th>
            <th class="num">${document.locale === 'es' ? 'Importe' : 'Amount'}</th>
          </tr>
        </thead>
        <tbody>${linesHtml}</tbody>
      </table>
      <table class="totals">
        <tr><td>${document.locale === 'es' ? 'Subtotal' : 'Subtotal'}</td><td class="num">${escapeHtml(document.subtotal)} ${moneyLabel(document.locale)}</td></tr>
        <tr><td>${document.locale === 'es' ? 'Descuento' : 'Discount'}</td><td class="num">${escapeHtml(document.discount)}</td></tr>
        <tr><td>${document.locale === 'es' ? 'Impuesto' : 'Tax'}</td><td class="num">${escapeHtml(document.tax)}</td></tr>
        <tr class="grand"><td>${document.locale === 'es' ? 'Total' : 'Total'}</td><td class="num">${escapeHtml(document.total)} ${moneyLabel(document.locale)}</td></tr>
      </table>
      ${document.notes ? `<footer>${escapeHtml(document.notes)}</footer>` : ''}
      ${opts.footerText ? `<footer>${escapeHtml(opts.footerText)}</footer>` : ''}
    </div>
  </div>
</body>
</html>`;
}
