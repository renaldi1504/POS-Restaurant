/** Hak akses: dapur tidak bisa membuka /admin & /kasir (dialihkan); API menolak aksi terlarang (403). */
import { request } from '@playwright/test';
import { API, apiAs, collectErrors, loginUI } from './helpers';
import { expect, test } from './test';

test('dapur: rute admin & kasir dialihkan ke /dapur', async ({ page }) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Dapur');
  await expect(page).toHaveURL(/\/dapur$/);
  for (const path of [
    '/admin',
    '/admin/menu',
    '/admin/settings',
    '/admin/pengguna',
    '/kasir',
    '/kasir/closing',
  ]) {
    await page.goto(path);
    await expect(page, `akses ${path}`).toHaveURL(/\/dapur$/);
    await expect(page.getByTestId('kitchen-screen')).toBeVisible();
  }
  expect(errors).toEqual([]);
});

test('kasir: rute admin dialihkan ke /kasir', async ({ page }) => {
  await loginUI(page, 'Kasir Pagi');
  for (const path of ['/admin/menu', '/admin/settings', '/admin/pengguna', '/admin/meja']) {
    await page.goto(path);
    await expect(page, `akses ${path}`).toHaveURL(/\/kasir$/);
  }
});

test('API: 403 untuk aksi di luar hak akses, 401 tanpa sesi', async () => {
  const dapur = await apiAs('Dapur');
  const forbidden = [
    await dapur.post('/api/orders', { data: { type: 'takeaway', items: [{ itemId: 1, qty: 1 }] } }),
    await dapur.get('/api/admin/settings'),
    await dapur.patch('/api/admin/settings', { data: { kitchen: { lateMinutes: 1 } } }),
    await dapur.get('/api/admin/users'),
    await dapur.post('/api/shifts/open', { data: { name: 'X', openingCash: { KHR: 0, USD: 0, IDR: 0 } } }),
    await dapur.get('/api/reports/daily'),
  ];
  for (const res of forbidden) {
    expect(res.status(), res.url()).toBe(403);
    expect((await res.json()).error.code).toBe('FORBIDDEN');
  }
  // Settings untuk staf tetap boleh dibaca dapur.
  expect((await dapur.get('/api/settings/staff')).status()).toBe(200);

  const driver = await apiAs('Driver');
  expect(
    (await driver.post('/api/payments', { data: { orderId: crypto.randomUUID(), lines: [] } })).status(),
  ).toBe(403);
  expect((await driver.get('/api/admin/tables')).status()).toBe(403);

  const kasir = await apiAs('Kasir Pagi');
  expect((await kasir.get('/api/admin/settings')).status()).toBe(403);
  expect(
    (await kasir.post('/api/admin/users', { data: { name: 'X', roleId: 1, pin: '0000' } })).status(),
  ).toBe(403);

  const anon = await request.newContext({ baseURL: API });
  const r = await anon.get('/api/orders');
  expect(r.status()).toBe(401);
  await Promise.all([dapur.dispose(), driver.dispose(), kasir.dispose(), anon.dispose()]);
});
