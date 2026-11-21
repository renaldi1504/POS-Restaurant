/** MSW: server API palsu dengan state per test (`db`, di-reset di setup). */
import { http, HttpResponse } from 'msw';
import { setupServer } from 'msw/node';
import type {
  AddressDto,
  CustomerSessionResponse,
  PublicMenuResponse,
  PublicOrderDto,
  PublicSettingsResponse,
} from '@pos/shared';
import {
  makeMenu,
  makeOrder,
  makeSettings,
  TABLE_TOKEN,
  tableBill,
  tableSession,
  telegramSession,
} from './fixtures';

export interface Call {
  method: string;
  path: string;
  body: unknown;
}

export const db = {
  settings: makeSettings() as PublicSettingsResponse,
  menu: makeMenu() as PublicMenuResponse,
  session: { mode: 'none', customer: null, table: null, tableSession: null } as CustomerSessionResponse,
  orders: new Map<string, PublicOrderDto>(),
  tableOrders: [] as PublicOrderDto[],
  addresses: [] as AddressDto[],
  billRequested: false,
  calls: [] as Call[],
  nextOrderSeq: 1,
};

export function resetDb() {
  db.settings = makeSettings();
  db.menu = makeMenu();
  db.session = { mode: 'none', customer: null, table: null, tableSession: null };
  db.orders = new Map();
  db.tableOrders = [];
  db.addresses = [];
  db.billRequested = false;
  db.calls = [];
  db.nextOrderSeq = 1;
}

const err = (status: number, code: string, message = code) =>
  HttpResponse.json({ error: { code, message } }, { status });

async function record(request: Request) {
  let body: unknown = null;
  const ct = request.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) body = await request.clone().json();
  else if (ct.includes('multipart/form-data')) body = 'multipart';
  db.calls.push({ method: request.method, path: new URL(request.url).pathname, body });
}

export const handlers = [
  http.get('*/api/public/settings', () => HttpResponse.json(db.settings)),
  http.get('*/api/public/menu', () => HttpResponse.json(db.menu)),
  http.get('*/api/public/geocode', () =>
    HttpResponse.json({ text: 'Jl. Ekareach, Sihanoukville', provider: 'osm' }),
  ),
  http.get('*/api/public/session', () => HttpResponse.json(db.session)),
  http.patch('*/api/public/session', async ({ request }) => {
    await record(request);
    return HttpResponse.json(db.session);
  }),
  http.post('*/api/public/session/telegram', async ({ request }) => {
    await record(request);
    const { initData } = (await request.json()) as { initData: string };
    if (!initData.includes('hash=')) return err(401, 'TELEGRAM_AUTH_FAILED');
    db.session = telegramSession();
    return HttpResponse.json(db.session);
  }),
  http.post('*/api/public/session/table', async ({ request }) => {
    await record(request);
    const { qrToken } = (await request.json()) as { qrToken: string };
    if (qrToken !== TABLE_TOKEN) return err(404, 'NOT_FOUND', 'Meja tidak ditemukan');
    db.session = tableSession();
    return HttpResponse.json(db.session);
  }),
  http.get('*/api/public/table/bill', () => {
    const b = tableBill(db.tableOrders);
    if (db.billRequested && b.session) b.session.status = 'bill_requested';
    return HttpResponse.json(b);
  }),
  http.post('*/api/public/table/bill-request', async ({ request }) => {
    await record(request);
    db.billRequested = true;
    return HttpResponse.json({ session: { ...tableBill().session!, status: 'bill_requested' } });
  }),
  http.get('*/api/public/addresses', () => HttpResponse.json({ addresses: db.addresses })),
  http.post('*/api/public/addresses', async ({ request }) => {
    await record(request);
    const b = (await request.json()) as Omit<AddressDto, 'id'>;
    const address: AddressDto = { ...b, id: db.addresses.length + 1, landmark: b.landmark ?? null };
    db.addresses.push(address);
    return HttpResponse.json({ address });
  }),
  http.post('*/api/public/orders', async ({ request }) => {
    await record(request);
    const b = (await request.json()) as {
      type?: string;
      items: { itemId: number; qty: number }[];
      paymentMethod?: string;
    };
    const n = db.nextOrderSeq++;
    const order = makeOrder({
      id: `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`,
      number: 20 + n,
      displayNo: `#${20 + n}`,
      type: (b.type as PublicOrderDto['type']) ?? 'delivery',
      channel: db.session.mode === 'table' ? 'qr' : db.session.mode === 'telegram' ? 'telegram' : 'website',
      paymentMethod: (b.paymentMethod as PublicOrderDto['paymentMethod']) ?? null,
      table: db.session.mode === 'table' ? { id: 5, name: 'Meja 5' } : null,
    });
    db.orders.set(order.id, order);
    if (db.session.mode === 'table') db.tableOrders.push(order);
    return HttpResponse.json({ order });
  }),
  http.get('*/api/public/orders/:id', ({ params }) => {
    const o = db.orders.get(String(params.id));
    return o ? HttpResponse.json({ order: o }) : err(404, 'NOT_FOUND');
  }),
  http.post('*/api/public/orders/:id/proof', async ({ request, params }) => {
    await record(request);
    const o = db.orders.get(String(params.id));
    if (!o) return err(404, 'NOT_FOUND');
    const next = { ...o, proofUploaded: true, paymentStatus: 'pending_verification' as const };
    db.orders.set(o.id, next);
    return HttpResponse.json({ order: next });
  }),
];

export const server = setupServer(...handlers);
