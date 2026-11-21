/**
 * Telegram Mini App (/tg + initData palsu): sapaan, delivery terkunci → tambah item → alamat manual
 * (lat/lng, tanpa Maps key) → bayar ABA + upload bukti → menunggu verifikasi → kasir melihat order
 * online + bukti (bel/badge realtime) → Terima → status pelanggan berubah live ke Diterima.
 */
import { fileURLToPath } from 'node:url';
import {
  apiAs,
  collectErrors,
  ensureShift,
  fakeInitData,
  loginUI,
  newPhone,
  ORDER,
  orderCard,
  openWebCart,
  orderNo,
} from './helpers';
import { expect, test } from './test';

const PROOF = fileURLToPath(new URL('./fixtures/bukti-aba.png', import.meta.url));

test.beforeAll(async () => {
  const kasir = await apiAs('Kasir Pagi');
  await ensureShift(kasir);
  await kasir.dispose();
});

test('Telegram: order delivery + bukti ABA → kasir terima → status live Diterima @tablet', async ({
  page,
  browser,
}) => {
  // Kasir sudah membuka layar kasir sebelum order masuk (cek bel/badge realtime).
  const kctx = await newPhone(browser);
  const kasir = await kctx.newPage();
  const kErrors = collectErrors(kasir);
  await loginUI(kasir, 'Kasir Pagi');
  await expect(kasir.getByTestId('cashier-screen')).toBeVisible();
  await expect(kasir.getByRole('button', { name: 'Order online', exact: true })).toBeVisible();

  const errors = collectErrors(page);
  const init = fakeInitData({ id: 990001, first_name: 'Sokha', username: 'sokha_e2e' });
  await page.goto(`${ORDER}/tg#tgWebAppData=${encodeURIComponent(init)}`);
  await expect(page.getByText('Halo Sokha · Masuk otomatis via Telegram')).toBeVisible();

  await page.getByRole('button', { name: 'Tambah Kopi Hitam' }).first().click();
  await page
    .getByRole('dialog', { name: 'Kopi Hitam' })
    .getByRole('button', { name: /^Tambah ·/ })
    .click();
  await openWebCart(page, /1 item · 5\.000 ៛/);

  // Delivery terkunci: tidak ada pilihan Ambil sendiri / Makan di sini.
  await expect(page.getByRole('heading', { name: 'Pesanan Anda' })).toBeVisible();
  await expect(page.getByRole('radio', { name: 'Ambil sendiri' })).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'Makan di sini' })).toHaveCount(0);
  await page.getByRole('button', { name: /Lanjut ke alamat/ }).click();

  // Alamat manual (tanpa Google Maps key): teks + lat/lng.
  await expect(page.getByRole('heading', { name: 'Alamat pengantaran' })).toBeVisible();
  await page.getByLabel('Alamat lengkap').fill('Jl. Ekareach no. 10, dekat Phsar Leu');
  await page.getByLabel('Lintang (lat)').fill('10.6112');
  await page.getByLabel('Bujur (lng)').fill('103.5234');
  await page.getByLabel(/Patokan/).fill('pagar biru');
  await expect(page.getByText(/Kontak: chat Telegram @sokha_e2e/)).toBeVisible();
  await page.getByRole('button', { name: /Lanjut ke pembayaran/ }).click();

  // Bayar ABA + bukti.
  await expect(page.getByRole('heading', { name: 'Pembayaran', level: 1 })).toBeVisible();
  await page.getByRole('radio', { name: /Bayar ABA/ }).click();
  const panel = page.getByTestId('aba-panel');
  await expect(panel.getByTestId('aba-account')).toContainText('RM BERKAT');
  await expect(panel.getByTestId('aba-account')).toContainText('000 123 456');
  await panel.getByLabel('Upload bukti transfer').setInputFiles(PROOF);
  await expect(panel.getByRole('img', { name: 'Pratinjau bukti transfer' })).toBeVisible();
  await page.getByRole('button', { name: 'Pesan sekarang · 5.000 ៛' }).click();

  await expect(page.getByRole('heading', { name: 'Status pesanan' })).toBeVisible();
  const header = page.getByText(/Pesanan #\d+ · Delivery/);
  const no = orderNo(await header.textContent());
  await expect(page.getByTestId('status-pending')).toContainText('Menunggu diterima');
  await expect(page.getByTestId('proof-done')).toContainText('Menunggu dicek kasir');

  // Kasir: badge order online baru (realtime) → layar order online → bukti → Terima.
  const bell = kasir.getByRole('button', { name: 'Order online, 1 baru' });
  await expect(bell).toBeVisible();
  await bell.click();
  await expect(kasir.getByRole('heading', { name: 'Order Online' })).toBeVisible();
  const card = orderCard(kasir, 'online-card', no);
  await expect(card).toContainText('TELEGRAM · MINI APP');
  await expect(card).toContainText('Sokha');
  await expect(card).toContainText('ABA · bukti diterima');
  await card.getByRole('button', { name: 'Lihat bukti' }).click();
  const proof = kasir.getByRole('dialog').getByRole('img');
  await expect(proof).toBeVisible();
  await expect
    .poll(() => proof.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0))
    .toBe(true);
  await kasir.keyboard.press('Escape');
  await expect(kasir.getByRole('dialog')).toBeHidden();
  await card.getByRole('button', { name: 'Terima' }).click();
  await expect(card).toBeHidden();

  // Pelanggan: status berubah live (tanpa reload) ke Diterima, bukti ABA terverifikasi.
  await expect(page.getByTestId('status-pending')).toBeHidden();
  await expect(page.getByTestId('status-steps').locator('[aria-current="step"]')).toContainText('Diterima');

  expect(errors).toEqual([]);
  expect(kErrors).toEqual([]);
  await kctx.close();
});
