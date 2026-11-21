/**
 * A11y/tata letak: tidak ada scroll horizontal & tidak ada elemen keluar layar di lebar 360 px
 * pada layar utama kedua aplikasi. Elemen di dalam wadah yang memang bisa digeser (chip kategori)
 * atau terpotong (overflow hidden) diabaikan.
 */
import type { Page } from '@playwright/test';
import { apiAs, ensureShift, fakeInitData, loginUI, newPhone, ORDER, POS, tableToken } from './helpers';
import { expect, test } from './test';

async function overflowProblems(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const out: string[] = [];
    if (document.documentElement.scrollWidth > vw + 1)
      out.push(`document.scrollWidth ${document.documentElement.scrollWidth} > ${vw}`);
    const clipped = (el: Element): boolean => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const ox = getComputedStyle(p).overflowX;
        if (ox === 'auto' || ox === 'scroll' || ox === 'hidden' || ox === 'clip') return true;
      }
      return false;
    };
    for (const el of Array.from(document.body.querySelectorAll('*'))) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 || r.height === 0) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.position === 'fixed') continue;
      if ((r.right > vw + 1 || r.left < -1) && !clipped(el)) {
        const id = `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}.${String(el.className).slice(0, 60)}`;
        out.push(
          `${id} [${Math.round(r.left)}..${Math.round(r.right)}] "${(el.textContent ?? '').trim().slice(0, 40)}"`,
        );
      }
    }
    return out.slice(0, 10);
  });
}

async function check(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(300);
  expect(await overflowProblems(page), `overflow di ${path}`).toEqual([]);
}

test.beforeAll(async () => {
  const kasir = await apiAs('Kasir Pagi');
  await ensureShift(kasir);
  await kasir.dispose();
});

test('pos-web 360 px: tanpa scroll horizontal', async ({ browser }) => {
  const ctx = await newPhone(browser, 360);
  const page = await ctx.newPage();
  await check(page, `${POS}/login`);
  await loginUI(page, 'Owner');
  for (const path of [
    '/kasir',
    '/kasir/meja',
    '/kasir/meja/1',
    '/kasir/online',
    '/kasir/riwayat',
    '/kasir/pengeluaran',
    '/kasir/closing',
    '/dapur',
    '/driver',
    '/admin',
    '/admin/menu',
    '/admin/opsi/1',
    '/admin/meja',
    '/admin/pengguna',
    '/admin/settings',
    '/admin/promo',
    '/admin/telegram',
    '/printer',
  ])
    await check(page, `${POS}${path}`);

  // Keranjang & layar bayar dengan isi.
  await page.goto(`${POS}/kasir`);
  await page.getByRole('button', { name: /^Kerupuk, / }).click();
  await page.getByRole('button', { name: /Lihat pesanan/ }).click();
  await page.getByRole('radio', { name: 'Delivery' }).click();
  await page.waitForTimeout(200);
  expect(await overflowProblems(page), 'overflow keranjang').toEqual([]);
  await page.getByLabel('Nama', { exact: true }).fill('Tes Lebar');
  await page.getByLabel('Alamat', { exact: true }).fill('Jl. Panjang sekali nomor 123');
  await page.getByRole('button', { name: 'Bayar', exact: true }).click();
  await expect(page.getByRole('heading', { name: /^Bayar · #/ })).toBeVisible();
  expect(await overflowProblems(page), 'overflow bayar').toEqual([]);
  await ctx.close();
});

test('order-web 360 px: tanpa scroll horizontal', async ({ browser }) => {
  const ctx = await newPhone(browser, 360);
  const page = await ctx.newPage();
  await check(page, `${ORDER}/`);
  await page.getByRole('button', { name: 'Tambah Kerupuk' }).click();
  await check(page, `${ORDER}/keranjang`);
  await page.getByRole('button', { name: /Lanjut ke alamat/ }).click();
  await expect(page.getByRole('heading', { name: 'Alamat pengantaran' })).toBeVisible();
  expect(await overflowProblems(page), 'overflow alamat').toEqual([]);

  const meja = await tableToken('Meja 2');
  await check(page, `${ORDER}/m/${meja.qrToken}`);

  const tg = await newPhone(browser, 360);
  const tgPage = await tg.newPage();
  const init = fakeInitData({ id: 990002, first_name: 'Lebar' });
  await tgPage.goto(`${ORDER}/tg#tgWebAppData=${encodeURIComponent(init)}`);
  await expect(tgPage.getByText(/Halo Lebar/)).toBeVisible();
  expect(await overflowProblems(tgPage), 'overflow /tg').toEqual([]);
  await Promise.all([ctx.close(), tg.close()]);
});
