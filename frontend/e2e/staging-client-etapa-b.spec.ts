import { expect, test } from '@playwright/test';
import fs from 'fs';
import path from 'path';

const email = process.env.STAGING_UI_TEST_EMAIL;
const password = process.env.STAGING_UI_TEST_PASSWORD;
const artifactDir = path.join(process.cwd(), '..', 'docs', 'ui-e2e-screenshots');

test.beforeAll(() => {
  if (!email || !password) {
    throw new Error('Faltan STAGING_UI_TEST_EMAIL / STAGING_UI_TEST_PASSWORD');
  }
  fs.mkdirSync(artifactDir, { recursive: true });
});

test('etapa B: cotización pública anónima + multi-línea + concurrencia POS', async ({ browser }) => {
  test.setTimeout(300_000);
  const results: { step: string; ok: boolean; detail?: string }[] = [];
  const mark = (step: string, ok: boolean, detail?: string) => results.push({ step, ok, detail });

  const admin = await browser.newContext();
  const adminPage = await admin.newPage();
  await adminPage.goto('/login');
  await adminPage.getByLabel('Correo electrónico').fill(email!);
  await adminPage.getByLabel('Contraseña').fill(password!);
  await adminPage.getByRole('button', { name: 'Entrar' }).click();
  await adminPage.waitForFunction(() => !window.location.pathname.startsWith('/login'), null, { timeout: 30_000 });

  await adminPage.getByRole('link', { name: 'Cotizaciones' }).click();
  await expect(adminPage.getByRole('heading', { name: 'Cotizaciones' })).toBeVisible({ timeout: 20_000 });

  const productSelect = adminPage.locator('select').filter({ has: adminPage.locator('option', { hasText: 'Producto' }) }).first();
  await productSelect.selectOption({ index: 1 });
  await adminPage.getByRole('button', { name: 'Agregar línea' }).click();
  await productSelect.selectOption({ index: 2 });
  await adminPage.getByRole('button', { name: 'Agregar línea' }).click();
  await adminPage.getByRole('button', { name: /Crear cotización/ }).click();
  await expect(adminPage.getByText(/Cotización creada/)).toBeVisible({ timeout: 20_000 });
  mark('quote_multiline', true);

  await adminPage.getByRole('button', { name: 'Enlace' }).first().click();
  await expect(adminPage.getByText(/Enlace listo/)).toBeVisible({ timeout: 15_000 });
  const shareText = await adminPage.locator('.font-mono.text-xs').textContent();
  const publicUrl = shareText?.trim() ?? '';
  expect(publicUrl).toContain('/c/');
  mark('quote_public_link', true);

  const anon = await browser.newContext();
  const anonPage = await anon.newPage();
  await anonPage.goto(publicUrl);
  await expect(anonPage.getByText(/Cotización/)).toBeVisible({ timeout: 20_000 });
  const anonBody = await anonPage.content();
  expect(anonBody).not.toMatch(/avg_unit_cost|cost\.view|journal_entries/i);
  mark('public_no_cost_leak', true);

  await anonPage.getByRole('button', { name: 'Aceptar cotización' }).click();
  await expect(anonPage.getByText(/aceptada/i)).toBeVisible({ timeout: 15_000 });
  mark('public_accept', true);
  await anon.close();

  await adminPage.getByRole('button', { name: 'Convertir venta' }).first().click();
  await expect(adminPage.getByText(/convertida en venta/i)).toBeVisible({ timeout: 25_000 });
  await adminPage.getByRole('button', { name: 'Convertir venta' }).first().click();
  await expect(adminPage.getByText(/ya convertida|convertida en venta/i)).toBeVisible({ timeout: 15_000 });
  mark('quote_convert_idempotent', true);

  await adminPage.getByRole('link', { name: 'Exportación' }).click();
  await adminPage.getByRole('button', { name: /Generar exportación/ }).click();
  await expect(adminPage.getByText(/Exportación lista|Totales de control/i)).toBeVisible({ timeout: 25_000 });
  mark('export_bundle_ui', true);

  await adminPage.getByRole('link', { name: 'Usuarios y roles' }).click();
  await expect(adminPage.getByRole('heading', { name: 'Invitar empleado' })).toBeVisible({ timeout: 10_000 });
  mark('invite_ui', true);

  const ctxA = await browser.newContext();
  const ctxB = await browser.newContext();
  const pageA = await ctxA.newPage();
  const pageB = await ctxB.newPage();
  for (const p of [pageA, pageB]) {
    await p.goto('/login');
    await p.getByLabel('Correo electrónico').fill(email!);
    await p.getByLabel('Contraseña').fill(password!);
    await p.getByRole('button', { name: 'Entrar' }).click();
    await p.waitForFunction(() => !window.location.pathname.startsWith('/login'), null, { timeout: 30_000 });
    await p.getByRole('link', { name: 'Punto de venta' }).click();
  }

  const rowA = pageA.locator('li').filter({ has: pageA.getByRole('button', { name: '+' }) }).first();
  const rowB = pageB.locator('li').filter({ has: pageB.getByRole('button', { name: '+' }) }).first();
  await rowA.getByRole('button', { name: '+' }).click();
  await rowB.getByRole('button', { name: '+' }).click();
  await pageA.locator('label').filter({ hasText: 'Forma de pago' }).locator('select').selectOption({ label: 'Contado' });
  await pageB.locator('label').filter({ hasText: 'Forma de pago' }).locator('select').selectOption({ label: 'Contado' });

  await Promise.all([
    pageA.getByRole('button', { name: 'Confirmar venta' }).click(),
    pageB.getByRole('button', { name: 'Confirmar venta' }).click(),
  ]);

  await pageA.waitForTimeout(3000);
  const okA = await pageA.getByText('Venta confirmada').isVisible().catch(() => false);
  const okB = await pageB.getByText('Venta confirmada').isVisible().catch(() => false);
  const errA = await pageA.locator('text=/Stock|insuficiente|error/i').first().isVisible().catch(() => false);
  const errB = await pageB.locator('text=/Stock|insuficiente|error/i').first().isVisible().catch(() => false);
  const oneWins = (okA && !okB) || (okB && !okA) || (okA && okB);
  mark('dual_session_pos', oneWins, `A ok=${okA} err=${errA} B ok=${okB} err=${errB}`);

  await ctxA.close();
  await ctxB.close();
  await admin.close();

  fs.writeFileSync(path.join(artifactDir, 'etapa-b-results.json'), JSON.stringify({ summary: 'DONE', results }, null, 2));
  expect(results.filter((r) => !r.ok).length).toBe(0);
});
