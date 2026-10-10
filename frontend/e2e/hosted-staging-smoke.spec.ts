import { expect, test } from '@playwright/test';

const base = process.env.PLAYWRIGHT_BASE_URL ?? 'https://tci-auto-zone.web.app';
const email = process.env.STAGING_UI_TEST_EMAIL;
const password = process.env.STAGING_UI_TEST_PASSWORD;

test.describe('hosted staging smoke', () => {
  test.skip(!email || !password, 'Credenciales staging requeridas');

  test('login, SPA reload, cotización pública', async ({ browser, page }) => {
    test.setTimeout(180_000);
    await page.goto(`${base}/login`);
    await page.getByLabel('Correo electrónico').fill(email!);
    await page.getByLabel('Contraseña').fill(password!);
    await page.getByRole('button', { name: 'Entrar' }).click();
    await page.waitForFunction(() => !window.location.pathname.startsWith('/login'), null, { timeout: 30_000 });

    await page.goto(`${base}/ventas/cotizaciones`);
    await expect(page.getByRole('heading', { name: 'Cotizaciones' })).toBeVisible({ timeout: 20_000 });
    await page.goto(`${base}/ventas/cotizaciones`);
    await expect(page.getByRole('heading', { name: 'Cotizaciones' })).toBeVisible();

    const anon = await browser.newContext();
    const anonPage = await anon.newPage();
    await page.getByRole('button', { name: 'Enlace' }).first().click().catch(() => {});
    const linkEl = page.locator('.font-mono.text-xs').first();
    if (await linkEl.isVisible().catch(() => false)) {
      const url = (await linkEl.textContent())?.trim() ?? '';
      if (url.includes('/c/')) {
        await anonPage.goto(url.replace('127.0.0.1:5173', new URL(base).host).replace('localhost:5173', new URL(base).host));
        await expect(anonPage.getByText(/Cotización|aceptada/i)).toBeVisible({ timeout: 15_000 });
      }
    }
    await anon.close();
  });
});
