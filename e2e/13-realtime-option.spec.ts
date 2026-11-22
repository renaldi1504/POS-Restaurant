/** Grup pilihan: ubah Tersedia/Habis langsung berlaku di website pelanggan tanpa refresh. */
import { collectErrors, loginUI, newPhone, ORDER } from './helpers';
import { expect, test } from './test';

test('admin: pilihan Habis tampil live di lembar opsi website', async ({ page, browser }) => {
  const errors = collectErrors(page);
  const cctx = await newPhone(browser);
  const web = await cctx.newPage();
  await web.goto(ORDER);
  await web.getByRole('button', { name: 'Tambah Ayam Goreng' }).first().click();
  const sheet = web.getByRole('dialog', { name: 'Ayam Goreng' });
  await expect(sheet.getByRole('radio', { name: /^Sedang/ })).toBeEnabled();

  await loginUI(page, 'Owner');
  await page.goto('/admin/menu?tab=opsi');
  await page.getByRole('button', { name: /^Level pedas/ }).click();
  await page.getByRole('button', { name: 'Sedang: Tersedia' }).click();
  await expect(page.getByRole('button', { name: 'Sedang: Habis' })).toBeVisible();

  // Tanpa reload: pilihan langsung tidak bisa dipilih di website
  await expect(sheet.getByRole('radio', { name: /^Sedang/ })).toBeDisabled();

  await page.getByRole('button', { name: 'Sedang: Habis' }).click();
  await expect(sheet.getByRole('radio', { name: /^Sedang/ })).toBeEnabled();
  expect(errors).toEqual([]);
  await cctx.close();
});
