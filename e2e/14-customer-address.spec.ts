/**
 * Kasir "Order baru" → Data pengantaran: cari pelanggan Telegram lama → alamat tersimpan terpilih otomatis →
 * order tertaut ke pelanggan (notifikasi Telegram). Jalur kedua: tempel link Google Maps → alamat baru
 * dengan titik (tanpa Maps key & tanpa OSM: alamat diketik) → tersimpan ke pelanggan untuk order berikutnya.
 */
import { request, type Page } from '@playwright/test';
import {
  API,
  apiAs,
  collectErrors,
  ensureShift,
  fakeInitData,
  json,
  loginUI,
  openKasirCart,
  orderNo,
} from './helpers';
import { expect, test } from './test';

interface OrderLite {
  id: string;
  displayNo: string;
  channel: string;
  customer: { id: number; telegramId: string | null; phone: string | null } | null;
  address: {
    id: number;
    text: string;
    landmark: string | null;
    lat: number | null;
    lng: number | null;
  } | null;
}

test.beforeAll(async () => {
  const kasir = await apiAs('Kasir Pagi');
  await ensureShift(kasir);
  await kasir.dispose();
});

async function addKopiSusu(page: Page) {
  await page.getByRole('button', { name: /^Kopi Susu, / }).click();
  await page
    .getByRole('dialog', { name: 'Kopi Susu' })
    .getByRole('button', { name: /^Tambah ·/ })
    .click();
  await openKasirCart(page);
}

async function findOrder(no: string): Promise<OrderLite> {
  const kasir = await apiAs('Kasir Pagi');
  const { orders } = await json<{ orders: OrderLite[] }>(await kasir.get('/api/orders?active=true'));
  await kasir.dispose();
  const o = orders.find((x) => x.displayNo === no);
  if (!o) throw new Error(`order ${no}`);
  return o;
}

test('Telegram: cari pelanggan lama → alamat tersimpan → order tertaut ke pelanggan Telegram @tablet', async ({
  page,
}) => {
  const errors = collectErrors(page);
  // Pelanggan pernah pesan lewat Mini App: punya akun Telegram + alamat tersimpan.
  const uniq = Date.now() % 1e9;
  const username = `sokha${uniq}`;
  const cust = await request.newContext({ baseURL: API });
  await json(
    await cust.post('/api/public/session/telegram', {
      data: { initData: fakeInitData({ id: uniq, first_name: 'Sokha', username }) },
    }),
  );
  await json(
    await cust.post('/api/public/addresses', {
      data: {
        label: 'Rumah',
        text: 'Street 108, Sihanoukville',
        landmark: 'Dekat masjid',
        lat: 10.6271,
        lng: 103.5221,
      },
    }),
  );
  await cust.dispose();

  await loginUI(page, 'Kasir Pagi');
  await addKopiSusu(page);
  await page.getByRole('radio', { name: 'Telegram' }).click();
  await expect(page.getByText(/supaya dia menerima notifikasi/)).toBeVisible();

  await page.getByLabel('Cari pelanggan lama').fill(`@${username}`);
  const result = page.getByTestId('customer-result');
  await expect(result).toHaveCount(1);
  await expect(result).toContainText('Street 108, Sihanoukville');
  await result.click();

  await expect(page.getByTestId('picked-customer')).toContainText(`@${username}`);
  await expect(page.getByLabel('Nama', { exact: true })).toHaveValue('Sokha');
  const card = page.getByTestId('address-card');
  await expect(card).toContainText('Street 108, Sihanoukville');
  await expect(card).toContainText('Dekat masjid');
  await expect(card.getByTestId('point-set')).toBeVisible();

  await page.getByRole('switch', { name: /Bayar saat diantar/ }).click();
  await page.getByRole('button', { name: 'Kirim ke dapur' }).click();
  const toast = page.getByRole('status').filter({ hasText: 'dikirim ke dapur' });
  await expect(toast).toBeVisible();
  const order = await findOrder(orderNo(await toast.textContent()));
  expect(order.channel).toBe('telegram');
  expect(order.customer?.telegramId).toBe(String(uniq));
  expect(order.address).toMatchObject({ text: 'Street 108, Sihanoukville', lat: 10.6271, lng: 103.5221 });
  expect(errors).toEqual([]);
});

test('Delivery: tempel link Google Maps → alamat baru dengan titik → tersimpan ke pelanggan', async ({
  page,
}) => {
  const errors = collectErrors(page);
  const phone = `09${Date.now() % 1e7}`;
  await loginUI(page, 'Kasir Pagi');
  await addKopiSusu(page);
  await page.getByRole('radio', { name: 'Delivery', exact: true }).click();
  await page.getByLabel('Nama', { exact: true }).fill('Bu Lina');
  await page.getByLabel(/No\. HP/).fill(phone);

  await page.getByLabel('Link lokasi').fill('https://maps.google.com/?q=10.61,103.52');
  await expect(page.getByTestId('link-status')).toContainText('Titik lokasi ditemukan (10.61000, 103.52000)');
  // Tanpa Maps key & OSM mati: nama alamat tidak ketemu → kasir mengetik.
  await expect(page.getByTestId('link-status')).toContainText('ketik alamatnya');
  await expect(page.getByTestId('new-address').getByTestId('point-set')).toBeVisible();
  await page.getByLabel('Alamat', { exact: true }).fill('Jl. Ekareach 99');
  await page.getByLabel('Patokan').fill('Pagar biru');

  await page.getByRole('switch', { name: /Bayar saat diantar/ }).click();
  await page.getByRole('button', { name: 'Kirim ke dapur' }).click();
  const toast = page.getByRole('status').filter({ hasText: 'dikirim ke dapur' });
  await expect(toast).toBeVisible();
  const order = await findOrder(orderNo(await toast.textContent()));
  expect(order.address).toMatchObject({
    text: 'Jl. Ekareach 99',
    landmark: 'Pagar biru',
    lat: 10.61,
    lng: 103.52,
  });

  // Order berikutnya: pelanggan ditemukan lewat no HP dan alamat tadi jadi alamat utama.
  await addKopiSusu(page);
  await page.getByRole('radio', { name: 'Delivery', exact: true }).click();
  await page.getByLabel('Cari pelanggan lama').fill(phone);
  const result = page.getByTestId('customer-result');
  await expect(result).toContainText('Bu Lina');
  await expect(result).toContainText('Jl. Ekareach 99');
  await result.click();
  await expect(page.getByTestId('address-card')).toContainText('Pagar biru');
  await expect(page.getByTestId('address-card').getByTestId('point-set')).toBeVisible();
  expect(errors).toEqual([]);
});
