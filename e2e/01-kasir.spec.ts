/**
 * Alur kasir: login PIN → buka shift → menu dengan opsi wajib → Pesanan → bayar cash KHR (uang cepat)
 * → kembalian → order muncul di layar Dapur (konteks kedua) → Mulai masak → Siap.
 */
import { apiAs, closeShiftIfOpen, collectErrors, loginUI, newPhone, orderCard, orderNo } from './helpers';
import { expect, test } from './test';

test.beforeAll(async () => {
  // Mulai dari kondisi tanpa shift supaya layar "Buka shift" selalu muncul.
  const kasir = await apiAs('Kasir Pagi');
  await closeShiftIfOpen(kasir);
  await kasir.dispose();
});

test('kasir: buka shift → order dengan opsi → bayar cash → dapur masak → siap', async ({ page, browser }) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Kasir Pagi');
  await expect(page).toHaveURL(/\/kasir$/);

  // Buka shift (modal awal: 1 × 50.000 ៛).
  await expect(page.getByRole('heading', { name: /Buka Shift/ })).toBeVisible();
  await page.getByRole('button', { name: 'Pagi', exact: true }).click();
  await page.getByRole('button', { name: 'Tambah 50.000 ៛' }).click();
  await expect(page.getByRole('contentinfo')).toContainText('50.000 ៛');
  await page.getByRole('button', { name: 'Mulai shift' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Shift Pagi dibuka' })).toBeVisible();

  // Ayam Goreng: Bagian ayam & Level pedas wajib → tombol Tambah aktif setelah keduanya dipilih.
  await page.getByRole('button', { name: /^Ayam Goreng, / }).click();
  const ayam = page.getByRole('dialog', { name: 'Ayam Goreng' });
  const addAyam = ayam.getByRole('button', { name: /^Tambah ·/ });
  await expect(addAyam).toBeDisabled();
  await ayam.getByRole('radio', { name: 'Paha' }).click();
  await expect(addAyam).toBeDisabled();
  await ayam.getByRole('radio', { name: /Extra pedas/ }).click();
  await expect(addAyam).toHaveText('Tambah · 11.000 ៛');
  await addAyam.click();
  await expect(ayam).toBeHidden();

  // Es Teh Manis: Gula & es (opsional, pilih 1).
  await page.getByRole('button', { name: /^Es Teh Manis, / }).click();
  const esteh = page.getByRole('dialog', { name: 'Es Teh Manis' });
  await esteh.getByRole('radio', { name: 'Kurang gula' }).click();
  await esteh.getByRole('button', { name: 'Tambah · 4.000 ៛' }).click();
  await expect(page.getByRole('button', { name: /Ayam Goreng, .*1 di keranjang/ })).toBeVisible();

  // Pesanan (keranjang) → Bayar.
  await page.getByRole('button', { name: /2 item 15\.000 ៛ Lihat pesanan/ }).click();
  await expect(page.getByTestId('cart-screen')).toBeVisible();
  await expect(page.getByText('Paha · Extra pedas')).toBeVisible();
  await expect(page.getByText('Kurang gula')).toBeVisible();
  await expect(page.getByTestId('cart-total')).toHaveText('15.000 ៛');
  await page.getByRole('button', { name: 'Bayar', exact: true }).click();

  const heading = page.getByRole('heading', { name: /^Bayar · #\d+/ });
  await expect(heading).toBeVisible();
  const no = orderNo(await heading.textContent());
  await expect(page.getByRole('radio', { name: 'Cash' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'Riel ៛' })).toBeChecked();
  await page.getByRole('button', { name: '20.000 ៛' }).click();
  const change = page.getByTestId('change-box');
  await expect(change).toContainText('Diterima 20.000 ៛');
  await expect(change).toContainText(/Kembalian\s*5\.000 ៛/);
  await page.getByRole('button', { name: /Selesai/ }).click();
  await expect(page.getByRole('heading', { name: 'Lunas' })).toBeVisible();
  await expect(page.getByRole('main').getByRole('status')).toHaveText(/Kembalian\s*5\.000 ៛/);

  // Dapur (konteks kedua): order muncul → Mulai masak → Siap.
  const kctx = await newPhone(browser);
  const kitchen = await kctx.newPage();
  const kErrors = collectErrors(kitchen);
  await loginUI(kitchen, 'Dapur');
  await expect(kitchen).toHaveURL(/\/dapur$/);
  const card = orderCard(kitchen, 'kitchen-card', no);
  await expect(card).toBeVisible();
  await expect(card).toContainText('Ayam Goreng');
  await expect(card).toContainText('Paha');
  await expect(card).toContainText('Extra pedas');
  await expect(card).toContainText('Es Teh Manis');
  await card.getByRole('button', { name: 'Mulai masak' }).click();
  await expect(card).toHaveAttribute('data-tone', 'cooking');
  await card.getByRole('button', { name: 'Siap' }).click();
  await expect(card).toBeHidden();

  expect(errors).toEqual([]);
  expect(kErrors).toEqual([]);
  await kctx.close();
});
