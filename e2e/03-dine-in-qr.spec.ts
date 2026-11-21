/**
 * Makan di sini via QR meja: pelanggan scan Meja 1 → pesan (opsi) → Kirim ke dapur → kasir melihat
 * "Pesanan QR baru" & menerima → ronde 2 → Minta bill → kasir buka Meja 1 → nota sementara
 * (NOTA SEMENTARA + total benar) → Bayar → meja Kosong → scan ulang = tagihan baru.
 */
import { apiAs, collectErrors, ensureShift, loginUI, newPhone, ORDER, tableToken } from './helpers';
import { expect, test } from './test';

test.beforeAll(async () => {
  const kasir = await apiAs('Kasir Pagi');
  await ensureShift(kasir);
  await kasir.dispose();
});

test('QR meja: 2 ronde → minta bill → nota sementara → bayar → meja kosong → tagihan baru', async ({
  page,
  browser,
}) => {
  const meja = await tableToken('Meja 1');
  const errors = collectErrors(page);

  // ---------- Pelanggan: ronde 1 ----------
  await page.goto(`${ORDER}/m/${meja.qrToken}`);
  await expect(page.getByText('Meja 1 · Makan di sini')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Minta bill' })).toBeDisabled();
  await page.getByRole('button', { name: 'Tambah Ayam Goreng' }).first().click();
  const sheet = page.getByRole('dialog', { name: 'Ayam Goreng' });
  const add = sheet.getByRole('button', { name: /^Tambah ·/ });
  await expect(add).toBeDisabled();
  await sheet.getByRole('radio', { name: 'Dada' }).click();
  await sheet.getByRole('radio', { name: 'Pedas', exact: true }).click();
  await sheet.getByRole('checkbox', { name: /Telur ceplok/ }).click();
  await expect(add).toHaveText('Tambah · 13.000 ៛');
  await add.click();
  await page.getByRole('button', { name: /1 item · 13\.000 ៛\s*Kirim ke dapur/ }).click();
  await expect(page.getByRole('heading', { name: 'Pesanan Anda' })).toBeVisible();
  await expect(page.getByText('Dada, Pedas, Telur ceplok')).toBeVisible();
  await page.getByRole('button', { name: /Kirim ke dapur/ }).click();
  await expect(page.getByRole('heading', { name: 'Status pesanan' })).toBeVisible();
  await expect(page.getByTestId('status-pending')).toContainText('Menunggu diterima');

  // ---------- Kasir: denah → Pesanan QR baru → Terima ----------
  const kctx = await newPhone(browser);
  const kasir = await kctx.newPage();
  const kErrors = collectErrors(kasir);
  await loginUI(kasir, 'Kasir Pagi');
  await kasir.getByRole('button', { name: 'Denah meja' }).click();
  const tableBtn = kasir.getByRole('button', { name: /^Meja 1 / });
  await expect(tableBtn).toContainText('Pesanan QR baru');
  await tableBtn.click();
  await expect(kasir.getByRole('heading', { name: 'Meja 1' })).toBeVisible();
  await kasir.getByRole('button', { name: 'Terima' }).click();
  await expect(kasir.getByRole('button', { name: 'Terima' })).toHaveCount(0);
  await expect(kasir.getByRole('contentinfo')).toContainText('13.000 ៛');

  // Status pelanggan ikut berubah (realtime).
  await expect(page.getByTestId('status-steps').locator('[aria-current="step"]')).toContainText('Diterima');

  // ---------- Pelanggan: ronde 2 + Minta bill ----------
  await page.getByRole('button', { name: 'Pesan lagi' }).click();
  await page.getByRole('button', { name: 'Tambah Es Teh Manis' }).first().click();
  await page.getByRole('dialog', { name: 'Es Teh Manis' }).getByRole('radio', { name: 'Tanpa es' }).click();
  await page
    .getByRole('dialog', { name: 'Es Teh Manis' })
    .getByRole('button', { name: /^Tambah ·/ })
    .click();
  await page.getByRole('button', { name: /Kirim ke dapur/ }).click();
  await page.getByRole('button', { name: /Kirim ke dapur/ }).click();
  await expect(page.getByRole('heading', { name: 'Status pesanan' })).toBeVisible();
  const bill = page.getByRole('region', { name: 'Tagihan Meja 1' });
  await expect(bill).toContainText('Ronde 2');

  // Kasir menerima ronde 2.
  await expect(kasir.getByRole('button', { name: 'Terima' })).toBeVisible();
  await kasir.getByRole('button', { name: 'Terima' }).click();
  await expect(kasir.getByRole('contentinfo')).toContainText('17.000 ៛');

  await expect(bill).toContainText(/Total\s*17\.000 ៛/);
  await bill.getByRole('button', { name: 'Minta bill' }).click();
  await expect(kasir.getByText('Minta bill').first()).toBeVisible();

  // ---------- Kasir: nota sementara → bayar ----------
  await kasir.getByRole('button', { name: 'Cetak nota' }).click();
  await expect(kasir.getByRole('heading', { name: 'Pratinjau nota' })).toBeVisible();
  const nota = kasir.getByRole('main');
  await expect(nota).toContainText('NOTA SEMENTARA');
  await expect(nota).toContainText('MEJA 1');
  await expect(nota).toContainText(/TOTAL\s+17\.000 KHR/);
  await expect(nota).not.toContainText('MEJA MEJA');
  await kasir.getByRole('button', { name: 'Ke bayar' }).click();
  await expect(kasir.getByRole('heading', { name: 'Bayar · Meja 1' })).toBeVisible();
  await kasir.getByRole('button', { name: 'Uang pas' }).click();
  await kasir.getByRole('button', { name: /Selesai/ }).click();
  await expect(kasir.getByRole('heading', { name: 'Lunas' })).toBeVisible();

  // Meja kembali Kosong di denah.
  await kasir.goto('/kasir/meja');
  await expect(kasir.getByRole('button', { name: /^Meja 1 / })).toContainText('Kosong');

  // ---------- Scan ulang: tagihan baru ----------
  await page.goto(`${ORDER}/m/${meja.qrToken}`);
  await expect(page.getByText('Meja 1 · Makan di sini')).toBeVisible();
  await expect(page.getByText('Belum ada pesanan')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Minta bill' })).toBeDisabled();

  expect(errors).toEqual([]);
  expect(kErrors).toEqual([]);
  await kctx.close();
});
