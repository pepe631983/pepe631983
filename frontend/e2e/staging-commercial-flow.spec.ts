import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const email = process.env.STAGING_UI_TEST_EMAIL;
const password = process.env.STAGING_UI_TEST_PASSWORD;
const runId = String(Date.now()).slice(-6);
const artifactDir = path.join(process.cwd(), '..', 'docs', 'ui-e2e-screenshots');

test.beforeAll(() => {
  if (!email || !password) {
    throw new Error('Faltan STAGING_UI_TEST_EMAIL / STAGING_UI_TEST_PASSWORD');
  }
  fs.mkdirSync(artifactDir, { recursive: true });
});

async function snap(page: import('@playwright/test').Page, name: string) {
  await page.screenshot({ path: path.join(artifactDir, `${name}.png`), fullPage: true });
}

test('flujo comercial staging (UI real)', async ({ page }) => {
  test.setTimeout(240_000);
  const results: { step: string; ok: boolean; detail?: string }[] = [];
  const mark = (step: string, ok: boolean, detail?: string) => {
    results.push({ step, ok, detail });
  };

  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByLabel('Correo electrónico').fill(email!);
  await page.getByLabel('Contraseña').fill(password!);
  await page.getByRole('button', { name: 'Entrar' }).click();
  await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), null, { timeout: 30_000 });

  if (page.url().includes('registro-empresa')) {
    await page.getByLabel('Nombre comercial').fill(`UI PW Demo ${runId}`);
    await page.getByLabel('Su nombre completo').fill('Operador UI Playwright');
    await page.getByRole('button', { name: 'Crear empresa y continuar' }).click();
    await page.waitForFunction(() => window.location.pathname === '/', null, { timeout: 30_000 });
    mark('create_company', true);
  } else {
    mark('create_company', true, 'ya existía');
  }
  mark('login', true);
  await snap(page, '01-dashboard');

  await page.getByRole('link', { name: 'Usuarios y roles' }).click();
  await expect(page.getByRole('heading', { name: 'Usuarios y roles' })).toBeVisible({ timeout: 20_000 });
  mark('admin_permissions', true);
  await snap(page, '02-usuarios');

  const supplierName = `Prov UI ${runId}`;
  await page.getByRole('link', { name: 'Proveedores' }).click();
  await page.getByLabel('Nombre').fill(supplierName);
  await page.getByRole('button', { name: 'Agregar' }).click();
  await expect(page.getByText(supplierName)).toBeVisible({ timeout: 15_000 });
  mark('purchase_supplier', true);

  let productHint = '';
  await page.getByRole('link', { name: 'Recepciones' }).click();
  await expect(page.getByRole('heading', { name: 'Recepción de compra' })).toBeVisible({ timeout: 20_000 });
  await page.locator('select').first().selectOption({ label: supplierName });
  const productSelect = page.locator('select').nth(1);
  await productSelect.selectOption({ index: 1 });
  productHint = (await productSelect.locator('option:checked').textContent()) ?? '';
  await page.getByLabel('Cantidad').fill('5');
  await page.getByLabel('Costo unitario provisional').fill('60');
  await page.getByRole('button', { name: 'Confirmar recepción' }).click();
  await expect(page.getByText('Recepción confirmada')).toBeVisible({ timeout: 20_000 });
  mark('goods_receipt', true, productHint.slice(0, 40));

  await page.getByRole('link', { name: 'Facturas proveedor' }).click();
  await page.locator('select').first().selectOption({ index: 1 });
  await page.getByLabel('Número factura proveedor').fill(`INV-${runId}`);
  await page.getByRole('button', { name: 'Registrar factura' }).click();
  await expect(page.getByText('Factura registrada')).toBeVisible({ timeout: 15_000 });
  mark('supplier_invoice', true);

  await page.getByRole('link', { name: 'Caja' }).click();
  const openBtn = page.getByRole('button', { name: 'Abrir caja' });
  if (await openBtn.isVisible().catch(() => false)) {
    await page.getByLabel('Fondo inicial (USD)').fill('100');
    await openBtn.click();
    await expect(page.getByText('Sesión de caja abierta')).toBeVisible({ timeout: 15_000 });
    mark('cash_open', true, 'nueva sesión');
  } else {
    mark('cash_open', true, 'sesión ya abierta');
  }
  await snap(page, '03-caja');

  await page.getByRole('link', { name: 'Punto de venta' }).click();
  await expect(page.getByRole('heading', { name: 'Punto de venta' })).toBeVisible({ timeout: 20_000 });
  const productRow = page
    .locator('li')
    .filter({ has: page.getByRole('button', { name: '+' }) })
    .filter({ hasNot: page.getByRole('button', { name: '+', disabled: true }) })
    .first();
  await productRow.getByRole('button', { name: '+' }).click();
  await productRow.getByRole('button', { name: '+' }).click();
  await page.locator('label').filter({ hasText: 'Forma de pago' }).locator('select').selectOption({ label: 'Contado' });
  await page.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(page.getByText('Venta confirmada')).toBeVisible({ timeout: 25_000 });
  mark('pos_sale_cash', true);

  await page.locator('label').filter({ hasText: 'Forma de pago' }).locator('select').selectOption({ label: 'Crédito' });
  await productRow.getByRole('button', { name: '+' }).click();
  await page.getByRole('button', { name: 'Confirmar venta' }).click();
  await expect(page.getByText('Venta confirmada')).toBeVisible({ timeout: 25_000 });
  mark('pos_sale_credit', true);

  await page.getByRole('link', { name: 'Cobros' }).click();
  await page.locator('select').first().selectOption({ index: 1 });
  await page.getByLabel('Monto').fill('25');
  await page.getByRole('button', { name: 'Registrar cobro' }).click();
  await expect(page.getByText('Cobro registrado')).toBeVisible({ timeout: 15_000 });
  mark('customer_payment', true);

  await page.getByRole('link', { name: 'Devoluciones' }).click();
  const invSelect = page.locator('select').first();
  const cashOpt = invSelect.locator('option').filter({ hasText: '· cash ·' }).first();
  await invSelect.selectOption({ label: (await cashOpt.textContent()) ?? undefined });
  await page.waitForTimeout(800);
  await page.locator('input[type="number"]').first().fill('1');
  await page.getByRole('button', { name: 'Confirmar devolución' }).click();
  await expect(page.getByText('Devolución registrada')).toBeVisible({ timeout: 25_000 });
  mark('sales_return', true);

  await page.getByRole('link', { name: 'Caja' }).click();
  const expectedText = await page.locator('text=Efectivo esperado').locator('..').locator('strong').textContent();
  const expected = expectedText ? Number(expectedText.replace(/[^\d.-]/g, '')) : NaN;
  await page.getByLabel('Efectivo contado al cierre').fill(String(expected));
  await page.getByRole('button', { name: 'Cerrar caja' }).click();
  await expect(page.getByText(/Caja cerrada/)).toBeVisible({ timeout: 20_000 });
  mark('cash_close', Number.isFinite(expected), `counted=${expected}`);

  await page.getByRole('link', { name: 'Conciliación' }).click();
  await page.getByRole('button', { name: 'Actualizar' }).click();
  await expect(page.getByRole('heading', { name: 'Conciliación financiera' })).toBeVisible();
  await page.waitForTimeout(2000);
  const deltas = await page
    .locator('h2', { hasText: 'Diferencias' })
    .locator('xpath=following-sibling::div[1]//tbody/tr/td[4]')
    .allTextContents();
  const allZero = deltas.length > 0 && deltas.every((d) => Number(d.replace(/[^\d.-]/g, '')) === 0);
  mark('reconciliation', allZero, `${deltas.length} filas: ${deltas.join(', ')}`);
  await snap(page, '04-conciliacion');
  expect(allZero, `deltas: ${deltas.join(',')}`).toBeTruthy();

  fs.writeFileSync(path.join(artifactDir, 'results.json'), JSON.stringify({ summary: 'PASSED', results }, null, 2));
});
