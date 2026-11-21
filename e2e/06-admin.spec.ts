/**
 * Admin: Kelola menu (Habis → web pelanggan ikut habis secara live), edit grup pilihan (tambah pilihan
 * berharga → muncul di lembar opsi web), Meja & QR (PDF), Pengguna (buat user → login PIN baru).
 */
import { collectErrors, loginUI, newPhone, ORDER } from './helpers';
import { expect, test } from './test';

test('admin: toggle Habis tampil live di web pelanggan', async ({ page, browser }) => {
  const errors = collectErrors(page);
  const cctx = await newPhone(browser);
  const web = await cctx.newPage();
  await web.goto(ORDER);
  await expect(web.getByTestId('order-menu')).toBeVisible();
  const card = web.getByRole('region', { name: 'Minuman' }).getByRole('article', { name: 'Kopi Hitam' });
  await expect(card.getByRole('button', { name: 'Tambah Kopi Hitam' })).toBeVisible();

  await loginUI(page, 'Owner');
  await page.goto('/admin/menu');
  const toggle = page.getByRole('button', { name: 'Kopi Hitam: Tersedia' });
  await toggle.click();
  await expect(page.getByRole('button', { name: 'Kopi Hitam: Habis' })).toBeVisible();

  // Web pelanggan: kartu menu jadi Habis tanpa reload.
  await expect(card).toContainText('Habis');
  await expect(card.getByRole('button', { name: 'Tambah Kopi Hitam' })).toHaveCount(0);

  // Kembalikan.
  await page.getByRole('button', { name: 'Kopi Hitam: Habis' }).click();
  await expect(page.getByRole('button', { name: 'Kopi Hitam: Tersedia' })).toBeVisible();
  await expect(card.getByRole('button', { name: 'Tambah Kopi Hitam' })).toBeVisible();
  expect(errors).toEqual([]);
  await cctx.close();
});

test('admin: tambah pilihan berharga di grup → muncul di lembar opsi web', async ({ page, browser }) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Owner');
  await page.goto('/admin/menu');
  await page.getByRole('tab', { name: /Grup pilihan/ }).click();
  await page.getByRole('button', { name: /^Tambahan Opsional/ }).click();
  await expect(page.getByRole('heading', { name: 'Grup pilihan' })).toBeVisible();
  const before = await page.getByRole('textbox', { name: /^Nama pilihan \d+$/ }).count();
  await page.getByRole('button', { name: '+ Tambah pilihan' }).click();
  const nameBox = page.getByRole('textbox', { name: `Nama pilihan ${before + 1}` });
  await nameBox.fill('Perkedel');
  await page.getByRole('textbox', { name: 'Harga Perkedel' }).fill('2500');
  await page.getByRole('button', { name: 'Simpan grup' }).click();
  await expect(
    page
      .getByRole('status')
      .filter({ hasText: /disimpan|tersimpan/i })
      .first(),
  ).toBeVisible();

  const cctx = await newPhone(browser);
  const web = await cctx.newPage();
  await web.goto(ORDER);
  await web.getByRole('button', { name: 'Tambah Ayam Goreng' }).first().click();
  const sheet = web.getByRole('dialog', { name: 'Ayam Goreng' });
  await expect(sheet.getByRole('checkbox', { name: 'Perkedel +2.500 ៛' })).toBeVisible();
  await sheet.getByRole('radio', { name: 'Paha' }).click();
  await sheet.getByRole('radio', { name: 'Tidak pedas' }).click();
  await sheet.getByRole('checkbox', { name: 'Perkedel +2.500 ៛' }).click();
  await expect(sheet.getByRole('button', { name: /^Tambah ·/ })).toHaveText('Tambah · 12.500 ៛');
  expect(errors).toEqual([]);
  await cctx.close();
});

test('admin: Meja & QR → Cetak QR menghasilkan PDF', async ({ page, context }) => {
  await loginUI(page, 'Owner');
  await page.goto('/admin/meja');
  await expect(page.getByRole('heading', { name: 'Meja & QR' })).toBeVisible();
  const popupPromise = context.waitForEvent('page');
  await page.getByRole('button', { name: /^Cetak semua QR/ }).click();
  const popup = await popupPromise;
  const url = popup.url() === 'about:blank' ? (await popup.waitForURL(/qr\.pdf/), popup.url()) : popup.url();
  expect(url).toMatch(/\/api\/admin\/tables\/qr\.pdf/);
  await popup.close();
  const res = await page.request.get(url);
  expect(res.status()).toBe(200);
  expect(res.headers()['content-type']).toContain('application/pdf');
  const body = await res.body();
  expect(body.subarray(0, 5).toString()).toBe('%PDF-');
  expect(body.length).toBeGreaterThan(2000);
});

test('admin: buat pengguna baru lalu login dengan PIN barunya', async ({ page }) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Owner');
  await page.goto('/admin/pengguna');
  await page.getByRole('button', { name: '+ Tambah pengguna' }).click();
  const dlg = page.getByRole('dialog', { name: '+ Tambah pengguna' });
  await dlg.getByRole('textbox', { name: 'Nama' }).fill('Kasir Sore');
  await dlg.getByRole('combobox', { name: 'Role' }).selectOption({ label: 'Kasir' });
  await dlg.getByRole('textbox', { name: 'PIN' }).fill('5678');
  await dlg.getByRole('button', { name: 'Simpan' }).click();
  await expect(dlg).toBeHidden();
  await expect(page.getByRole('button', { name: /Kasir Sore/ })).toBeVisible();

  // Keluar → login sebagai Kasir Sore.
  await page.getByRole('button', { name: 'Menu lainnya' }).click();
  await page.getByRole('dialog', { name: 'Menu lainnya' }).getByRole('button', { name: 'Keluar' }).click();
  await expect(page).toHaveURL(/\/login/);
  await loginUI(page, 'Kasir Sore', '5678');
  await expect(page).toHaveURL(/\/kasir$/);
  await expect(page.getByTestId('cashier-screen')).toBeVisible();
  expect(errors).toEqual([]);
});

test('admin: Settings → upload gambar QR ABA (potong 1:1) → tampil di web pelanggan, lalu hapus', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Owner');
  await page.goto('/admin/settings');
  const field = page.getByTestId('aba-qr-field');
  await field.scrollIntoViewIfNeeded();
  // Bukan kolom URL lagi: tombol upload + pratinjau.
  await expect(page.getByRole('textbox', { name: /QR ABA/ })).toHaveCount(0);
  await field.getByTestId('photo-input').setInputFiles('e2e/fixtures/bukti-aba.png');
  const crop = page.getByRole('dialog', { name: 'Atur foto' });
  await expect(crop).toBeVisible();
  await crop.getByRole('button', { name: 'Pakai foto' }).click();
  const img = field.getByRole('img', { name: 'Gambar QR ABA' });
  await expect(img).toHaveAttribute('src', /^\/uploads\/public\/aba-qr\//);
  await expect.poll(() => img.evaluate((el: HTMLImageElement) => el.naturalWidth)).toBeGreaterThan(0);
  const src = (await img.getAttribute('src'))!;
  // Rasio 1:1 hasil potong.
  const ratio = await img.evaluate((el: HTMLImageElement) => el.naturalWidth / el.naturalHeight);
  expect(ratio).toBeCloseTo(1, 1);

  // Web pelanggan memakai field yang sama (settings.payment.aba.qrImageUrl) dan file bisa diambil lewat origin web.
  const pub = await page.request.get(`${ORDER}/api/public/settings`);
  expect(((await pub.json()) as { aba: { qrImageUrl: string } }).aba.qrImageUrl).toBe(src);
  const file = await page.request.get(`${ORDER}${src}`);
  expect(file.status()).toBe(200);
  expect(file.headers()['content-type']).toMatch(/^image\//);

  // Ganti tersedia; hapus dengan konfirmasi.
  await expect(field.getByRole('button', { name: 'Ganti QR' })).toBeVisible();
  await field.getByRole('button', { name: 'Hapus QR' }).click();
  await page.getByRole('dialog', { name: 'Hapus QR' }).getByRole('button', { name: 'Hapus' }).click();
  await expect(img).toHaveCount(0);
  await expect(field.getByRole('button', { name: 'Upload QR' })).toBeVisible();
  const pub2 = await page.request.get(`${ORDER}/api/public/settings`);
  expect(((await pub2.json()) as { aba: { qrImageUrl: string | null } }).aba.qrImageUrl).toBeNull();
  expect(errors).toEqual([]);
});
