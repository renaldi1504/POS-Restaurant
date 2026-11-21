/** Urutan kategori & menu (panah atas/bawah) dan kategori 4 bahasa di lembar Kategori. */
import { apiAs, collectErrors, ensureShift, loginUI } from './helpers';
import { expect, test } from './test';

test('admin: urutkan kategori & menu dengan panah, urutan ikut di kasir', async ({ page }, info) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Owner');
  await page.goto('/admin/menu');

  // Kategori: Ayam turun satu → Pempek jadi pertama
  await page.getByRole('button', { name: 'Kategori', exact: true }).click();
  const sheet = page.getByRole('dialog', { name: 'Kategori' });
  await expect(sheet.getByRole('button', { name: 'Naikkan urutan: Ayam' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Turunkan urutan: Ayam' }).click();
  await expect(sheet.getByRole('button', { name: 'Naikkan urutan: Pempek' })).toBeDisabled();
  await page.screenshot({ path: `/home/claude/reorder-shots/${info.project.name}-kategori.png` });

  // Ubah kategori: 4 bahasa terlihat
  await sheet.getByRole('button', { name: 'Ubah: Pempek' }).click();
  await expect(sheet.getByLabel('Indonesia')).toHaveValue('Pempek');
  await expect(sheet.getByLabel('ខ្មែរ (Khmer)')).toBeVisible();
  await page.screenshot({ path: `/home/claude/reorder-shots/${info.project.name}-kategori-edit.png` });
  await sheet.getByRole('button', { name: 'Batal' }).click();

  // Kembalikan urutan
  await sheet.getByRole('button', { name: 'Naikkan urutan: Ayam' }).click();
  await expect(sheet.getByRole('button', { name: 'Naikkan urutan: Ayam' })).toBeDisabled();
  await sheet.getByRole('button', { name: 'Tutup' }).click();

  // Menu: mode urutkan, Ayam Goreng turun di bawah Ayam Bakar
  await page.getByRole('button', { name: 'Urutkan' }).click();
  await expect(page.getByRole('button', { name: 'Naikkan urutan: Ayam Goreng' })).toBeDisabled();
  await page.getByRole('button', { name: 'Turunkan urutan: Ayam Goreng' }).click();
  await expect(page.getByRole('button', { name: 'Naikkan urutan: Ayam Bakar' })).toBeDisabled();
  await page.screenshot({ path: `/home/claude/reorder-shots/${info.project.name}-menu.png` });

  // Kasir mengikuti urutan baru
  await ensureShift(await apiAs('Owner'));
  await page.goto('/kasir');
  const names = page.getByRole('button', { name: /^Ayam (Goreng|Bakar)/ });
  await expect(names.first()).toHaveAccessibleName(/^Ayam Bakar/);

  // Kembalikan
  await page.goto('/admin/menu');
  await page.getByRole('button', { name: 'Urutkan' }).click();
  await page.getByRole('button', { name: 'Naikkan urutan: Ayam Goreng' }).click();
  await expect(page.getByRole('button', { name: 'Naikkan urutan: Ayam Goreng' })).toBeDisabled();
  expect(errors).toEqual([]);
});
