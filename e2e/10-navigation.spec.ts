/**
 * Navigasi adaptif (SKILL §8 / §8b): HP → navigation bar bawah dengan tujuan yang paling sering dipakai
 * (sesuai permission, pin dari "Lainnya"); tablet → navigation rail kiri + tata letak list-detail.
 */
import { apiAs, collectErrors, ensureShift, loginUI } from './helpers';
import { expect, test } from './test';

test.beforeAll(async () => {
  const kasir = await apiAs('Kasir Pagi');
  await ensureShift(kasir);
  await kasir.dispose();
});

test('kasir (HP): bottom nav tampil, bernavigasi, pin dari Lainnya; disembunyikan saat bayar', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Kasir Pagi');
  const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
  await expect(nav).toBeVisible();
  await expect(page.getByTestId('navigation-rail')).toHaveCount(0);
  const box = (await nav.boundingBox())!;
  expect(box.y + box.height).toBeGreaterThan(page.viewportSize()!.height - 2); // menempel di bawah
  await expect(nav.getByRole('link', { name: 'Kasir' })).toHaveAttribute('aria-current', 'page');
  await expect(nav.getByRole('link')).toHaveText(['Kasir', 'Meja', 'Online', 'Riwayat']);

  await nav.getByRole('link', { name: 'Denah meja' }).click();
  await expect(page).toHaveURL(/\/kasir\/meja$/);
  await expect(page.getByTestId('tables-screen')).toBeVisible();
  await expect(nav.getByRole('link', { name: 'Denah meja' })).toHaveAttribute('aria-current', 'page');
  // Urutan stabil: tidak bergeser setelah navigasi.
  await expect(nav.getByRole('link')).toHaveText(['Kasir', 'Meja', 'Online', 'Riwayat']);

  // Lainnya: tujuan di luar 4 slot + pin.
  await nav.getByRole('button', { name: 'Lainnya' }).click();
  const sheet = page.getByRole('dialog', { name: 'Lainnya' });
  await expect(sheet.getByText('Kasir Pagi').first()).toBeVisible();
  await sheet.getByRole('button', { name: 'Sematkan Pengeluaran' }).click();
  await expect(nav.getByRole('link').first()).toHaveAccessibleName('Pengeluaran');
  await sheet.getByRole('button', { name: 'Pengeluaran', exact: true }).click();
  await expect(page).toHaveURL(/\/kasir\/pengeluaran$/);
  await nav.getByRole('button', { name: 'Lainnya' }).click();
  await sheet.getByRole('button', { name: 'Lepas sematan Pengeluaran' }).click();
  await page.keyboard.press('Escape');
  // Rute aktif di luar 4 besar tetap tampil (slot ke-4) & disorot.
  await expect(nav.getByRole('link', { name: 'Pengeluaran' })).toHaveAttribute('aria-current', 'page');

  // Alur fokus: layar bayar tanpa navigation bar.
  await page.goto('/kasir/bayar');
  await expect(page.getByRole('navigation', { name: 'Navigasi utama' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('dapur (HP): hanya tujuan dapur & printer — tidak ada tujuan admin/kasir', async ({ page }) => {
  await loginUI(page, 'Dapur');
  const nav = page.getByRole('navigation', { name: 'Navigasi utama' });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole('link')).toHaveText(['Dapur', 'Printer']);
  await nav.getByRole('button', { name: 'Lainnya' }).click();
  const all = page.getByRole('dialog', { name: 'Lainnya' }).getByRole('navigation', { name: 'Semua menu' });
  await expect(all.getByRole('button', { name: 'Layar dapur', exact: true })).toBeVisible();
  for (const name of ['Kasir', 'Dashboard penjualan', 'Kelola menu', 'Pengguna & role', 'Settings'])
    await expect(all.getByRole('button', { name, exact: true })).toHaveCount(0);
});

test('tablet: navigation rail kiri (tanpa bar bawah) + list-detail Kelola menu & panel pesanan kasir @tablet-only', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Owner');
  const rail = page.getByTestId('navigation-rail');
  await expect(rail).toBeVisible();
  await expect(page.getByTestId('navigation-bar')).toHaveCount(0);
  // Kasir: grid menu + panel pesanan selalu tampil (tanpa bar keranjang).
  await expect(page.locator('[data-pane="detail"]').getByTestId('cart-screen')).toBeVisible();
  await expect(page.getByRole('button', { name: /Lihat pesanan/ })).toHaveCount(0);
  const box = (await rail.boundingBox())!;
  expect(box.x).toBeLessThan(2);
  expect(box.width).toBeLessThanOrEqual(81);

  await rail.getByRole('link', { name: 'Kelola menu' }).click();
  await expect(page).toHaveURL(/\/admin\/menu$/);
  await expect(page.getByText('Pilih menu atau grup pilihan untuk diubah')).toBeVisible();
  await page
    .getByRole('button', { name: /^Ayam Goreng/ })
    .first()
    .click();
  await expect(page).toHaveURL(/\/admin\/menu\/\d+$/);
  // Daftar tetap terlihat di samping form edit.
  await expect(page.getByTestId('menu-admin-screen')).toBeVisible();
  await expect(page.getByTestId('menu-edit-screen')).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Kelola menu' })).toHaveAttribute('aria-current', 'page');

  // Owner: Meja tidak termasuk 4 slot default → saat dibuka sementara mengisi slot ke-4 rail.
  await page.goto('/kasir/meja');
  await expect(page.getByText('Pilih meja untuk melihat tagihannya')).toBeVisible();
  await expect(rail.getByRole('link', { name: 'Denah meja' })).toHaveAttribute('aria-current', 'page');
  expect(errors).toEqual([]);
});
