import {
  DEFAULT_SETTINGS,
  type ClosingPreview,
  type DriverOrderDto,
  type OrderDto,
  type PublicSettingsResponse,
  type ShiftDto,
  type StaffMenuResponse,
  type StaffSettingsResponse,
  type StaffUser,
} from '@pos/shared';

const cashier: StaffUser = {
  id: 2,
  name: 'Kasir Pagi',
  lang: 'id',
  role: { id: 2, name: 'Kasir' },
  permissions: [
    'order.create',
    'payment.create',
    'order.accept',
    'kitchen.view',
    'menu.toggle_available',
    'shift.manage',
  ],
};
const kitchen: StaffUser = {
  id: 4,
  name: 'Dapur',
  lang: 'id',
  role: { id: 3, name: 'Dapur' },
  permissions: ['kitchen.view', 'kitchen.update', 'menu.toggle_available'],
};
const driver: StaffUser = {
  id: 5,
  name: 'Driver',
  lang: 'kh',
  role: { id: 4, name: 'Driver' },
  permissions: ['driver.deliver'],
};

const publicSettings: PublicSettingsResponse = {
  name: 'Rumah Makan Berkat',
  logoUrl: null,
  address: 'Sihanoukville',
  phone: '012 345 678',
  lat: 10.6278,
  lng: 103.5221,
  hours: { open: '08:00', close: '03:00', periods: [{ open: '08:00', close: '03:00' }], nextOpen: null },
  isOpen: true,
  businessDate: '2026-11-21',
  currency: { main: 'KHR', enabled: ['KHR', 'USD', 'IDR'], rates: { USD: 4100, IDR: 0.25 } },
  delivery: { minOrder: 0, defaultFee: 0 },
  qrRequireAccept: true,
  telegramBotUsername: null,
  aba: null,
};

const shift: ShiftDto = {
  id: 1,
  businessDate: '2026-11-21',
  name: 'Pagi',
  user: { id: 2, name: 'Kasir Pagi' },
  openedAt: '2026-11-21T01:00:00.000Z',
  closedAt: null,
  openingCash: { KHR: 250000, USD: 2000, IDR: 0 },
};

const prices = (store: number) => ({
  store,
  grab: Math.round(store * 1.25),
  foodpanda: Math.round(store * 1.25),
});
const item = (
  id: number,
  categoryId: number,
  name: { id: string; en?: string; kh?: string; zh?: string },
  store: number,
  extra: Partial<StaffMenuResponse['items'][number]> = {},
) => ({
  id,
  categoryId,
  name,
  description: {},
  aiInfo: '',
  photoUrl: null,
  available: true,
  bestSeller: false,
  sort: id,
  prices: prices(store),
  optionGroupIds: [] as number[],
  ...extra,
});
const opt = (id: number, groupId: number, name: string, priceDelta = 0, available = true) => ({
  id,
  groupId,
  name: { id: name, en: `${name} EN` },
  priceDelta,
  channelPrices: { grab: null, foodpanda: null },
  available,
  sort: id,
});

const menu: StaffMenuResponse = {
  categories: [
    { id: 1, name: { id: 'Ayam', en: 'Chicken' }, sort: 1 },
    { id: 2, name: { id: 'Pempek' }, sort: 2 },
    { id: 3, name: { id: 'Minuman', en: 'Drinks' }, sort: 3 },
  ],
  items: [
    item(1, 1, { id: 'Ayam Goreng', en: 'Fried Chicken', kh: 'មាន់បំពង', zh: '炸鸡' }, 10000, {
      optionGroupIds: [1, 2, 3],
    }),
    item(2, 1, { id: 'Ayam Bakar', en: 'Grilled Chicken', kh: 'មាន់អាំង', zh: '烤鸡' }, 12000, {
      optionGroupIds: [1, 2],
    }),
    item(3, 2, { id: 'Pempek Lenjer' }, 10000, { available: false }),
    item(4, 3, { id: 'Es Teh Manis', en: 'Sweet Iced Tea' }, 4000),
  ],
  optionGroups: [
    {
      id: 1,
      name: { id: 'Bagian ayam', en: 'Chicken part' },
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [opt(11, 1, 'Dada'), opt(12, 1, 'Paha atas'), opt(13, 1, 'Sayap', 0, false)],
    },
    {
      id: 2,
      name: { id: 'Level pedas' },
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [opt(21, 2, 'Tidak pedas'), opt(22, 2, 'Extra pedas', 1000)],
    },
    {
      id: 3,
      name: { id: 'Tambahan' },
      required: false,
      minSelect: 0,
      maxSelect: 3,
      options: [
        opt(31, 3, 'Nasi', 2000),
        opt(32, 3, 'Telur ceplok', 3000),
        opt(33, 3, 'Sambal ekstra', 1000),
        opt(34, 3, 'Tahu', 2000),
        opt(35, 3, 'Tempe', 2000, false),
      ],
    },
  ],
};

const ts = {
  createdAt: '2026-11-21T05:00:00.000Z',
  updatedAt: '2026-11-21T05:00:00.000Z',
  acceptedAt: null,
  cookingAt: null,
  readyAt: null,
  pickedUpAt: null,
  deliveredAt: null,
  servedAt: null,
  doneAt: null,
  cancelledAt: null,
};

export function makeOrder(over: Partial<OrderDto> = {}): OrderDto {
  return {
    ...ts,
    id: '11111111-1111-4111-8111-111111111111',
    businessDate: '2026-11-21',
    number: 12,
    displayNo: '#12',
    channel: 'kasir',
    type: 'takeaway',
    status: 'accepted',
    paymentStatus: 'unpaid',
    paymentMethod: null,
    shiftId: 1,
    tableSessionId: null,
    table: null,
    customer: null,
    customerName: null,
    address: null,
    driver: null,
    items: [
      {
        id: 1,
        itemId: 1,
        name: { id: 'Ayam Goreng', en: 'Fried Chicken', kh: 'មាន់បំពង', zh: '炸鸡' },
        qty: 2,
        unitPrice: 10000,
        options: [
          {
            groupId: 1,
            optionId: 12,
            groupName: { id: 'Bagian ayam' },
            optionName: { id: 'Paha atas', en: 'Thigh', kh: 'ភ្លៅ', zh: '鸡腿' },
            priceDelta: 0,
          },
        ],
        lineTotal: 20000,
        note: null,
      },
    ],
    subtotal: 20000,
    discount: 0,
    promoId: null,
    deliveryFee: 0,
    total: 20000,
    currency: 'KHR',
    note: null,
    rejectReason: null,
    cancelReason: null,
    proofUrl: null,
    payments: [],
    paidMain: 0,
    createdBy: { id: 2, name: 'Kasir Pagi' },
    createdByStaff: !['website', 'telegram', 'qr'].includes(over.channel ?? 'kasir'),
    ...over,
  };
}

export function makeDriverOrder(over: Partial<DriverOrderDto> = {}): DriverOrderDto {
  return {
    ...makeOrder({
      id: '22222222-2222-4222-8222-222222222222',
      displayNo: '#9',
      type: 'delivery',
      status: 'ready',
      customerName: 'Sokha',
      customer: { id: 7, name: 'Sokha', username: 'sokha', phone: '012999888', telegramId: '777' },
      address: {
        id: 3,
        label: 'Rumah',
        text: 'Jl. Ekareach 12',
        landmark: 'depan hotel',
        lat: 10.64,
        lng: 103.51,
      },
    }),
    distanceKm: 3.1,
    navigateUrl: 'https://www.google.com/maps/dir/?api=1&destination=10.64,103.51',
    cashToCollect: 42000,
    ...over,
  };
}

export const closingPreview: ClosingPreview = {
  shift,
  currency: 'KHR',
  openingCash: { KHR: 250000, USD: 2000, IDR: 0 },
  openingCashMain: 332000,
  orderCount: 64,
  salesTotalMain: 1803000,
  byChannel: [
    { channel: 'kasir', count: 50, gross: 1500000, discount: 0, commission: 0, net: 1498000 },
    { channel: 'grab', count: 10, gross: 300000, discount: 0, commission: 90000, net: 210000 },
    { channel: 'foodpanda', count: 4, gross: 135000, discount: 0, commission: 40000, net: 95000 },
  ],
  byMethod: [
    { method: 'cash', byCurrency: { KHR: 858000, USD: 0, IDR: 0 }, totalMain: 858000 },
    { method: 'aba', byCurrency: { KHR: 640000, USD: 0, IDR: 0 }, totalMain: 640000 },
  ],
  expenses: { cashMain: 70000, abaMain: 85000, cashByCurrency: { KHR: 70000, USD: 0, IDR: 0 }, count: 3 },
  expected: { cashMain: 1120000, abaMain: 555000, cashByCurrency: { KHR: 1038000, USD: 2000, IDR: 0 } },
  drivers: [
    {
      id: 1,
      shiftId: 1,
      driver: { id: 5, name: 'Driver 1' },
      deliveries: 4,
      cashCollected: 96000,
      settledAt: '2026-11-21T09:00:00.000Z',
    },
    {
      id: 2,
      shiftId: 1,
      driver: { id: 6, name: 'Driver 2' },
      deliveries: 2,
      cashCollected: 42000,
      settledAt: null,
    },
  ],
  unpaidOrderCount: 0,
  activeOrderCount: 0,
};

const staffSettings: StaffSettingsResponse = {
  settings: {
    ui: DEFAULT_SETTINGS.ui,
    kitchen: DEFAULT_SETTINGS.kitchen,
    shift: DEFAULT_SETTINGS.shift,
    commissions: DEFAULT_SETTINGS.commissions,
    delivery: DEFAULT_SETTINGS.delivery,
    qr: DEFAULT_SETTINGS.qr,
  },
};

export const fx = { cashier, kitchen, driver, publicSettings, staffSettings, shift, menu };
