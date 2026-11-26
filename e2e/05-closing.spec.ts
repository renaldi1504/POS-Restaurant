/**
 * Closing: shift baru (modal 100.000 ៛) + jual cash 6.000 + jual ABA 10.000 + pengeluaran cash 3.000
 * (lewat layar Pengeluaran) → wizard closing: cash seharusnya 103.000, ABA 10.000, selisih −3.000
 * → kirim tanpa catatan ditolak → dengan catatan berhasil.
 */
import { apiAs, closeShiftIfOpen, collectErrors, itemId, json, loginUI, staffMenu } from './helpers';
import { expect, test } from './test';

test.beforeAll(async () => {
  const kasir = await apiAs('Kasir Pagi');
  await closeShiftIfOpen(kasir);
  await json(
    await kasir.post('/api/shifts/open', {
      data: { name: 'Malam', openingCash: { KHR: 100_000, USD: 0, IDR: 0 } },
    }),
  );
  const menu = await staffMenu(kasir);
  // Jual cash: Kopi Susu 6.000, dibayar 10.000 ៛ (kembali 4.000).
  const cash = await json<{ order: { id: string } }>(
    await kasir.post('/api/orders', {
      data: { type: 'takeaway', items: [{ itemId: itemId(menu, 'Kopi Susu'), qty: 1 }] },
    }),
  );
  await json(
    await kasir.post('/api/payments', {
      data: { orderId: cash.order.id, lines: [{ method: 'cash', currency: 'KHR', amount: 10_000 }] },
    }),
  );
  // Jual ABA: 2 × Kopi Hitam = 10.000.
  const aba = await json<{ order: { id: string } }>(
    await kasir.post('/api/orders', {
      data: { type: 'takeaway', items: [{ itemId: itemId(menu, 'Kopi Hitam'), qty: 2 }] },
    }),
  );
  await json(
    await kasir.post('/api/payments', {
      data: { orderId: aba.order.id, lines: [{ method: 'aba', currency: 'KHR', amount: 10_000 }] },
    }),
  );
  await kasir.dispose();
});

test('closing: cash seharusnya = modal + jual cash − keluar cash; selisih wajib catatan', async ({
  page,
}) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Kasir Pagi');

  // Pengeluaran cash 3.000 ៛ (Es batu).
  await page.goto('/kasir/pengeluaran');
  await page.getByRole('radio', { name: 'Es batu' }).click();
  await page.getByRole('textbox', { name: '2. Berapa?' }).fill('3000');
  await expect(page.getByRole('radio', { name: 'Cash laci' })).toBeChecked();
  await page.getByRole('textbox', { name: 'Catatan (boleh kosong)' }).fill('es batu 2 karung');
  await page.getByRole('button', { name: 'Simpan pengeluaran' }).click();
  await expect(page.getByRole('banner')).toContainText('3.000 ៛');

  // Wizard closing.
  await page.goto('/kasir/closing');
  await expect(page.getByRole('heading', { name: 'Tutup Shift Malam' })).toBeVisible();
  await page.getByRole('tab', { name: 'Total saja' }).click();
  await page.getByRole('textbox', { name: 'Total saja · Riel' }).fill('100000');
  await expect(page.getByRole('contentinfo')).toContainText('100.000 ៛');
  await page.getByRole('button', { name: 'Lanjut' }).click();
  // ABA per rekening (tanpa kurs): Riel & $.
  await page.getByRole('textbox', { name: 'ABA Riel — total masuk shift ini' }).fill('10000');
  await expect(page.getByRole('textbox', { name: 'ABA $ — total masuk shift ini' })).toBeVisible();
  await page.getByRole('button', { name: 'Lanjut' }).click();

  const result = page.getByRole('main');
  const cashBox = page.getByTestId('pocket-cash-KHR');
  await expect(cashBox).toContainText(/Kurang\s*3\.000 ៛/);
  await expect(cashBox).toContainText(/Seharusnya\s*103\.000 ៛/);
  await expect(cashBox).toContainText(/Dihitung\s*100\.000 ៛/);
  await cashBox.getByRole('button', { name: 'Cara menghitung' }).click();
  await expect(cashBox).toContainText(
    /Modal 100\.000 \+ diterima 10\.000 − kembalian 4\.000 − pengeluaran 3\.000/,
  );
  await expect(page.getByTestId('pocket-cash-USD')).toContainText('Cocok');
  const abaBox = page.getByTestId('pocket-aba-KHR');
  await expect(abaBox).toContainText('Cocok');
  await expect(abaBox).toContainText('10.000 ៛');
  // Modal tetap 0 → semua uang fisik disetor ke owner.
  await expect(page.getByTestId('deposit-KHR')).toContainText('100.000 ៛');
  await expect(result).toContainText(/Total penjualan\s*16\.000 ៛/);

  // Selisih tanpa catatan → ditolak.
  const submit = page.getByRole('button', { name: 'Tutup shift & cetak' });
  await submit.click();
  await expect(page.getByText('Ada selisih, wajib isi catatan').first()).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Tutup Shift Malam' })).toBeVisible();

  await page.getByRole('textbox', { name: 'Catatan selisih (wajib)' }).fill('Uang kembalian salah hitung');
  await submit.click();
  await expect(page.getByTestId('closing-done')).toBeVisible();
  await expect(page.getByTestId('deposit-summary')).toContainText('setor 100.000 ៛');

  // Shift sudah tertutup.
  const kasir = await apiAs('Kasir Pagi');
  const cur = await json<{ shift: unknown }>(await kasir.get('/api/shifts/current'));
  expect(cur.shift).toBeNull();
  await kasir.dispose();
  expect(errors).toEqual([]);
});
