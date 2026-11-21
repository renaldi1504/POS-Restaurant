import { expect, test } from '@playwright/test';

test('kasir login dengan PIN 1111 masuk ke layar kasir', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Siapa yang masuk?' })).toBeVisible();

  await page.getByRole('button', { name: /Kasir Pagi/ }).click();
  await expect(page.getByText('PIN untuk Kasir Pagi')).toBeVisible();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '1', exact: true }).click();
  await page.getByRole('button', { name: 'Masuk' }).click();

  await expect(page).toHaveURL(/\/kasir$/);
  await expect(page.getByTestId('cashier-screen')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Kasir' })).toBeVisible();
});

test('PIN salah menampilkan sisa percobaan', async ({ page }) => {
  await page.goto('/login', { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: /Dapur/ }).click();
  for (let i = 0; i < 4; i++) await page.getByRole('button', { name: '9', exact: true }).click();
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page.getByRole('alert')).toContainText('PIN salah');
});

test('order-web menampilkan menu', async ({ page }) => {
  await page.goto('http://localhost:5184/', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('order-menu')).toBeVisible();
});
