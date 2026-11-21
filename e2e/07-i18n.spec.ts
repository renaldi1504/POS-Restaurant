/** Layar dapur & driver: ganti bahasa ke Khmer (dan kembali) menampilkan teks Khmer. */
import { apiAs, collectErrors, ensureShift, itemId, json, loginUI, staffMenu } from './helpers';
import { expect, test } from './test';

test.beforeAll(async () => {
  // Satu order aktif supaya kartu dapur (tombol) ikut diuji terjemahannya.
  const kasir = await apiAs('Kasir Pagi');
  await ensureShift(kasir);
  const menu = await staffMenu(kasir);
  await json(
    await kasir.post('/api/orders', {
      data: { type: 'takeaway', items: [{ itemId: itemId(menu, 'Nasi Putih'), qty: 1 }] },
    }),
  );
  await kasir.dispose();
});

test('dapur: pilih ខ្មែរ → judul, tombol & nama menu Khmer', async ({ page }) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Dapur');
  await expect(page.getByRole('heading', { name: 'Dapur', level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: 'ខ្មែរ' }).click();
  await expect(page.getByTestId('kitchen-screen')).toHaveAttribute('lang', 'kh');
  await expect(page.getByRole('heading', { name: 'ផ្ទះបាយ', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'ត្រូវធ្វើ' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ចាប់ផ្តើមចម្អិន' }).first()).toBeVisible();
  await expect(page.getByTestId('kitchen-card').filter({ hasText: 'បាយស' }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: 'ផ្សេងៗ' })).toBeVisible();
  // Pilihan disimpan per perangkat.
  await page.reload();
  await expect(page.getByRole('heading', { name: 'ផ្ទះបាយ', level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: 'ID' }).click();
  await expect(page.getByRole('heading', { name: 'Dapur', level: 1 })).toBeVisible();
  expect(errors).toEqual([]);
});

test('driver: bahasa default dari user (kh), ganti ke ID lalu kembali ke ខ្មែរ', async ({ page }) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Driver');
  await expect(page).toHaveURL(/\/driver$/);
  await expect(page.getByRole('heading', { name: 'ការដឹកជញ្ជូន', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: /រួចរាល់សម្រាប់ដឹក/ })).toBeVisible();
  await page.getByRole('radio', { name: 'ID' }).click();
  await expect(page.getByRole('heading', { name: 'Antaran', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: /Siap diantar/ })).toBeVisible();
  await page.getByRole('radio', { name: 'ខ្មែរ' }).click();
  await expect(page.getByRole('heading', { name: 'ការដឹកជញ្ជូន', level: 1 })).toBeVisible();
  await expect(page.getByRole('tab', { name: /ការដឹករបស់ខ្ញុំ/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'ផ្សេងៗ' })).toBeVisible();
  expect(errors).toEqual([]);
});
