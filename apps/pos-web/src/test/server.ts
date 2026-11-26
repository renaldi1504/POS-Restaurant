import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { fx } from './fixtures';

/** Handler default (bisa ditimpa per test dengan server.use()). */
export const defaultHandlers = [
  http.get('*/api/auth/me', () => HttpResponse.json({ user: fx.cashier })),
  http.get('*/api/public/settings', () => HttpResponse.json(fx.publicSettings)),
  http.get('*/api/settings/staff', () => HttpResponse.json(fx.staffSettings)),
  http.get('*/api/shifts/current', () => HttpResponse.json({ shift: fx.shift })),
  http.get('*/api/shifts/opening-suggestion', () => HttpResponse.json({ expected: null, fromShift: null })),
  http.get('*/api/menu', () => HttpResponse.json(fx.menu)),
  http.get('*/api/orders', () => HttpResponse.json({ orders: [], serverTime: new Date().toISOString() })),
  http.get('*/api/tables', () => HttpResponse.json({ tables: [] })),
  // Simpan bahasa akun: balas user yang sama dengan bahasa baru.
  http.patch('*/api/auth/me/lang', async ({ request }) => {
    const { lang } = (await request.json()) as { lang: typeof fx.cashier.lang };
    return HttpResponse.json({ user: { ...fx.cashier, lang } });
  }),
];

export const server = setupServer(...defaultHandlers);
export { http, HttpResponse };
