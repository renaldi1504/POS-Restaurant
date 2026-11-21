/**
 * Helper e2e: URL, login UI & API, shift, konteks HP baru, blokir sumber luar (font/Telegram SDK).
 * Server e2e memakai DB pos_e2e yang di-reset di awal setiap `pnpm test:e2e`.
 */
import {
  expect,
  request,
  test as pwTest,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

export const API = 'http://localhost:3101';
export const POS = 'http://localhost:5183';
export const ORDER = 'http://localhost:5184';

export const PIN = {
  Owner: '1234',
  'Kasir Pagi': '1111',
  'Kasir Malam': '2222',
  Dapur: '3333',
  Driver: '4444',
} as const;
export type SeedUser = keyof typeof PIN;

/** Sumber luar yang tidak bisa dijangkau di lingkungan test (font Google, SDK Telegram, peta). */
export async function blockExternal(ctx: BrowserContext): Promise<void> {
  await ctx.route(
    /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|telegram\.org|maps\.googleapis\.com)\//,
    (r) => r.abort(),
  );
}

/** Viewport project yang sedang jalan (HP 390×844 atau tablet 1024×768). */
function projectViewport(): { width: number; height: number } {
  try {
    return pwTest.info().project.use.viewport ?? { width: 390, height: 844 };
  } catch {
    return { width: 390, height: 844 };
  }
}

/**
 * Konteks perangkat baru untuk peran kedua/ketiga dalam satu test. Ukuran default = viewport project
 * (HP di project mobile-chrome, tablet di project tablet).
 */
export async function newPhone(
  browser: Browser,
  width = projectViewport().width,
  height = projectViewport().height,
): Promise<BrowserContext> {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
    locale: 'id-ID',
    timezoneId: 'Asia/Phnom_Penh',
    baseURL: POS,
  });
  await blockExternal(ctx);
  return ctx;
}

/** Kumpulkan error konsol/halaman (dipakai test untuk memastikan tidak ada error JS). */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const text = m.text();
    // 401 /auth/me di layar login = cek sesi (wajar); sumber luar diblokir sengaja.
    if (/401 \(Unauthorized\)|ERR_FAILED|ERR_BLOCKED/.test(text)) return;
    errors.push(`console: ${text}`);
  });
  return errors;
}

/** Lebar expanded (tablet landscape ≥ 840px): kasir & web pelanggan memakai panel pesanan di samping. */
export function isExpanded(page: Page): boolean {
  return (page.viewportSize()?.width ?? 0) >= 840;
}

/** Kasir: buka keranjang — HP lewat bar "Lihat pesanan", tablet panel pesanan sudah tampil. */
export async function openKasirCart(page: Page, summary: RegExp = /Lihat pesanan/): Promise<void> {
  if (isExpanded(page)) {
    await expect(page.locator('[data-pane="detail"]').getByTestId('cart-screen')).toBeVisible();
    return;
  }
  await page.getByRole('button', { name: summary }).click();
}

/** Web pelanggan: buka keranjang — HP lewat bar keranjang, tablet panel keranjang di kanan. */
export async function openWebCart(page: Page, summary: RegExp): Promise<void> {
  if (isExpanded(page)) {
    await expect(page.getByTestId('cart-pane')).toBeVisible();
    return;
  }
  await page.getByRole('button', { name: summary }).click();
}

export async function loginUI(page: Page, name: SeedUser | string, pin?: string): Promise<void> {
  await page.goto(`${POS}/login`, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: new RegExp(`^\\S+ ${escapeRe(name)}\\b`) }).click();
  await expect(page.getByText(`PIN untuk ${name}`)).toBeVisible();
  const digits = pin ?? PIN[name as SeedUser];
  for (const d of digits) await page.getByRole('button', { name: d, exact: true }).click();
  await page.getByRole('button', { name: 'Masuk' }).click();
  await expect(page).not.toHaveURL(/\/login/);
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Klien API langsung ke server e2e (cookie sesi staf tersimpan di konteks). */
export async function apiAs(name: SeedUser | string, pin?: string): Promise<APIRequestContext> {
  const api = await request.newContext({ baseURL: API });
  const users = (await (await api.get('/api/auth/users')).json()) as {
    users: { id: number; name: string }[];
  };
  const u = users.users.find((x) => x.name === name);
  if (!u) throw new Error(`User ${name} tidak ada`);
  const res = await api.post('/api/auth/pin', { data: { userId: u.id, pin: pin ?? PIN[name as SeedUser] } });
  expect(res.status(), await res.text()).toBe(200);
  return api;
}

export async function json<T = Record<string, unknown>>(
  res: Awaited<ReturnType<APIRequestContext['get']>>,
): Promise<T> {
  const body = await res.text();
  expect(res.ok(), `${res.url()} → ${res.status()} ${body}`).toBe(true);
  return JSON.parse(body) as T;
}

interface ShiftDto {
  id: number;
  name: string;
}

export async function currentShift(api: APIRequestContext): Promise<ShiftDto | null> {
  return (await json<{ shift: ShiftDto | null }>(await api.get('/api/shifts/current'))).shift;
}

/** Pastikan ada shift terbuka (dibuka lewat API bila belum). */
export async function ensureShift(api: APIRequestContext, openingKHR = 0): Promise<ShiftDto> {
  const cur = await currentShift(api);
  if (cur) return cur;
  return (
    await json<{ shift: ShiftDto }>(
      await api.post('/api/shifts/open', {
        data: { name: 'Pagi', openingCash: { KHR: openingKHR, USD: 0, IDR: 0 } },
      }),
    )
  ).shift;
}

/** Tutup shift yang terbuka lewat API (uang dihitung = seharusnya). */
export async function closeShiftIfOpen(api: APIRequestContext): Promise<void> {
  const cur = await currentShift(api);
  if (!cur) return;
  const preview = await json<{
    expected: { cashByCurrency: Record<'KHR' | 'USD' | 'IDR', number>; abaMain: number };
  }>(await api.get('/api/closing/preview'));
  const c = preview.expected.cashByCurrency;
  await json(
    await api.post('/api/closing', {
      data: {
        shiftId: cur.id,
        actual: {
          cashByCurrency: { KHR: Math.max(0, c.KHR), USD: Math.max(0, c.USD), IDR: Math.max(0, c.IDR) },
          abaMain: Math.max(0, preview.expected.abaMain),
        },
        note: 'Ditutup otomatis oleh test e2e',
      },
    }),
  );
}

export interface MenuInfo {
  items: { id: number; name: { id: string }; available: boolean }[];
  optionGroups: { id: number; name: { id: string }; options: { id: number; name: { id: string } }[] }[];
}

export async function staffMenu(api: APIRequestContext): Promise<MenuInfo> {
  return json<MenuInfo>(await api.get('/api/menu'));
}

export function itemId(menu: MenuInfo, name: string): number {
  const it = menu.items.find((i) => i.name.id === name);
  if (!it) throw new Error(`menu ${name}`);
  return it.id;
}

export function optionId(menu: MenuInfo, name: string): number {
  for (const g of menu.optionGroups) {
    const o = g.options.find((x) => x.name.id === name);
    if (o) return o.id;
  }
  throw new Error(`opsi ${name}`);
}

export async function tableToken(name: string): Promise<{ id: number; qrToken: string }> {
  const owner = await apiAs('Owner');
  const { tables } = await json<{ tables: { id: number; name: string; qrToken: string }[] }>(
    await owner.get('/api/admin/tables'),
  );
  await owner.dispose();
  const t = tables.find((x) => x.name === name);
  if (!t) throw new Error(`meja ${name}`);
  return t;
}

/** initData Telegram palsu (server tanpa bot token di luar produksi hanya cek bentuk & umur). */
export function fakeInitData(user: { id: number; first_name: string; username?: string }): string {
  return new URLSearchParams({
    query_id: 'AAE2E',
    auth_date: String(Math.floor(Date.now() / 1000)),
    user: JSON.stringify({ language_code: 'id', ...user }),
    hash: '0'.repeat(64),
  }).toString();
}

/** Nomor order dari teks seperti "Bayar · #12" / "Order #12 dikirim ke dapur". */
export function orderNo(text: string | null): string {
  const m = /#(\d+)/.exec(text ?? '');
  if (!m) throw new Error(`nomor order tidak ditemukan di "${text}"`);
  return `#${m[1]}`;
}

/** Kartu order (dapur / driver / order online) berdasarkan nomor tampil. */
export function orderCard(page: Page, testId: 'kitchen-card' | 'driver-card' | 'online-card', no: string) {
  return page.locator(`[data-testid="${testId}"][data-order-no="${no}"]`);
}
