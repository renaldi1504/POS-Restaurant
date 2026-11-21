import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import { fx } from './fixtures';

/** Handler default (bisa ditimpa per test dengan server.use()). */
export const defaultHandlers = [
  http.get('*/api/auth/me', () => HttpResponse.json({ user: fx.cashier })),
  http.get('*/api/public/settings', () => HttpResponse.json(fx.publicSettings)),
  http.get('*/api/settings/staff', () => HttpResponse.json(fx.staffSettings)),
  http.get('*/api/shifts/current', () => HttpResponse.json({ shift: fx.shift })),
  http.get('*/api/menu', () => HttpResponse.json(fx.menu)),
  http.get('*/api/orders', () => HttpResponse.json({ orders: [], serverTime: new Date().toISOString() })),
  http.get('*/api/tables', () => HttpResponse.json({ tables: [] })),
];

export const server = setupServer(...defaultHandlers);
export { http, HttpResponse };
