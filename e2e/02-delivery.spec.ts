/**
 * Delivery: kasir membuat order Telegram (channel telegram, dengan no. HP, bayar saat diantar)
 * → dapur Siap → driver melihatnya di "Siap diantar" → Ambil → Sudah diambil → Sudah sampai.
 * Driver kedua tidak bisa mengambil order yang sudah diambil.
 */
import {
  apiAs,
  collectErrors,
  ensureShift,
  json,
  loginUI,
  newPhone,
  openKasirCart,
  orderCard,
  orderNo,
} from './helpers';
import { expect, test } from './test';

const DRIVER2 = { name: 'Rudi Antar', pin: '4545' };

test.beforeAll(async () => {
  const kasir = await apiAs('Kasir Pagi');
  await ensureShift(kasir);
  await kasir.dispose();
  // Driver kedua (dibuat sekali per run; DB e2e di-reset di awal run).
  const owner = await apiAs('Owner');
  const { users } = await json<{ users: { name: string }[] }>(await owner.get('/api/admin/users'));
  if (!users.some((u) => u.name === DRIVER2.name)) {
    const { roles } = await json<{ roles: { id: number; name: string }[] }>(
      await owner.get('/api/admin/roles'),
    );
    const role = roles.find((r) => r.name === 'Driver')!;
    await json(
      await owner.post('/api/admin/users', {
        data: { name: DRIVER2.name, roleId: role.id, pin: DRIVER2.pin, lang: 'id', active: true },
      }),
    );
  }
  await owner.dispose();
});

test('delivery Telegram oleh kasir → dapur → driver ambil & antar; driver lain ditolak @tablet', async ({
  page,
  browser,
}) => {
  const errors = collectErrors(page);
  await loginUI(page, 'Kasir Pagi');
  await page.getByRole('button', { name: /^Kopi Susu, / }).click();
  await page
    .getByRole('dialog', { name: 'Kopi Susu' })
    .getByRole('button', { name: /^Tambah ·/ })
    .click();
  await openKasirCart(page);

  await page.getByRole('radio', { name: 'Telegram' }).click();
  await expect(page.getByText('Driver tidak perlu dipilih')).toBeVisible();
  await page.getByLabel('Nama', { exact: true }).fill('Pak Budi');
  await page.getByLabel(/No\. HP/).fill('012 345 678');
  await page.getByLabel('Alamat', { exact: true }).fill('Jl. Ekareach 12');
  await page.getByRole('switch', { name: /Bayar saat diantar/ }).click();
  await page.getByRole('button', { name: 'Kirim ke dapur' }).click();
  const toast = page.getByRole('status').filter({ hasText: 'dikirim ke dapur' });
  await expect(toast).toBeVisible();
  const no = orderNo(await toast.textContent());

  // Order tersimpan sebagai channel telegram, langsung diterima, HP tersimpan.
  const kasirApi = await apiAs('Kasir Pagi');
  const { orders } = await json<{
    orders: {
      id: string;
      displayNo: string;
      channel: string;
      status: string;
      customer: { phone: string } | null;
    }[];
  }>(await kasirApi.get('/api/orders?active=true'));
  const order = orders.find((o) => o.displayNo === no)!;
  expect(order).toMatchObject({
    channel: 'telegram',
    status: 'accepted',
    customer: { phone: '012 345 678' },
  });

  // Dapur → Siap.
  const kctx = await newPhone(browser);
  const kitchen = await kctx.newPage();
  await loginUI(kitchen, 'Dapur');
  const card = orderCard(kitchen, 'kitchen-card', no);
  await expect(card).toContainText('DELIVERY');
  await card.getByRole('button', { name: 'Mulai masak' }).click();
  await card.getByRole('button', { name: 'Siap' }).click();
  await expect(card).toBeHidden();

  // Driver 1 & driver 2 sama-sama melihat order di "Siap diantar".
  const d1ctx = await newPhone(browser);
  const d1 = await d1ctx.newPage();
  const d1Errors = collectErrors(d1);
  await loginUI(d1, 'Driver');
  await expect(d1).toHaveURL(/\/driver$/);
  // Bahasa ikut tersimpan di akun Driver (07-i18n mengembalikannya ke kh).
  await d1.getByRole('radio', { name: 'ID' }).click();
  const d2ctx = await newPhone(browser);
  const d2 = await d2ctx.newPage();
  await loginUI(d2, DRIVER2.name, DRIVER2.pin);
  await expect(d2).toHaveURL(/\/driver$/);

  const avail1 = orderCard(d1, 'driver-card', no);
  const avail2 = orderCard(d2, 'driver-card', no);
  await expect(d1.getByRole('tab', { name: /Siap diantar/ })).toHaveAttribute('aria-selected', 'true');
  await expect(avail1).toContainText('Pak Budi');
  await expect(avail1).toContainText('Jl. Ekareach 12');
  await expect(avail1).toContainText(/Tagih cash\s*6\.000 ៛/);
  await expect(avail2).toBeVisible();

  // Cash yang dibawa bertambah 6.000 (bisa sudah berisi dari run project lain di DB yang sama).
  const d1Api = await apiAs('Driver');
  const { cashCarried: cashBefore } = await json<{ cashCarried: number }>(
    await d1Api.get('/api/driver/mine'),
  );
  await d1Api.dispose();
  await avail1.getByRole('button', { name: 'Ambil antaran ini' }).click();
  await expect(d1.getByRole('tab', { name: 'Antaran saya (1)' })).toHaveAttribute('aria-selected', 'true');
  const mine = orderCard(d1, 'driver-card', no);
  await expect(mine.getByRole('link', { name: 'Telepon' })).toHaveAttribute('href', 'tel:012 345 678');

  // Driver 2: order hilang dari daftarnya (realtime) dan API menolak mengambilnya.
  await expect(avail2).toBeHidden();
  const d2Api = await apiAs(DRIVER2.name, DRIVER2.pin);
  const take2 = await d2Api.post(`/api/driver/orders/${order.id}/take`);
  expect(take2.status()).toBe(409);
  expect((await take2.json()).error.code).toBe('ALREADY_TAKEN');

  await mine.getByRole('button', { name: 'Sudah diambil' }).click();
  await expect(mine).toContainText('Menuju pelanggan');
  await mine.getByRole('button', { name: 'Sudah sampai' }).click();
  const confirm = d1.getByRole('dialog', { name: 'Pesanan sudah diterima pelanggan?' });
  await expect(confirm).toContainText('Cash diterima: 6.000 ៛');
  await confirm.getByRole('button', { name: 'Sudah sampai' }).click();
  await expect(mine).toBeHidden();
  await expect(d1.getByTestId('cash-carried')).toHaveText(`${(cashBefore + 6000).toLocaleString('id-ID')} ៛`);

  const after = await json<{ order: { status: string; paymentStatus: string } }>(
    await kasirApi.get(`/api/orders/${order.id}`),
  );
  expect(after.order.status).toMatch(/delivered|done/);

  expect(errors).toEqual([]);
  expect(d1Errors).toEqual([]);
  await Promise.all([kctx.close(), d1ctx.close(), d2ctx.close(), kasirApi.dispose(), d2Api.dispose()]);
});
