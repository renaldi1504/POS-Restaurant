/** Data contoh mirip seed server (SPEC §3) untuk test. */
import type {
  CustomerSessionResponse,
  LocalizedText,
  OptionGroupDto,
  PublicMenuResponse,
  PublicOrderDto,
  PublicSettingsResponse,
  PublicTableBillResponse,
} from '@pos/shared';

const L = (id: string, en: string, kh: string, zh: string): LocalizedText => ({ id, en, kh, zh });

export function makeSettings(over: Partial<PublicSettingsResponse> = {}): PublicSettingsResponse {
  return {
    name: 'Rumah Makan Berkat',
    logoUrl: null,
    address: 'Sihanoukville',
    phone: '012 888 999',
    lat: 10.6278,
    lng: 103.5221,
    hours: { open: '08:00', close: '03:00' },
    isOpen: true,
    businessDate: '2026-11-21',
    currency: { main: 'KHR', enabled: ['KHR', 'USD', 'IDR'], rates: { USD: 4100, IDR: 0.25 } },
    delivery: { minOrder: 0, defaultFee: 0 },
    qrRequireAccept: true,
    telegramBotUsername: 'rmberkat_bot',
    ...over,
  };
}

let optSeq = 0;
const opt = (groupId: number, name: LocalizedText, priceDelta = 0, available = true) => ({
  id: ++optSeq,
  groupId,
  name,
  priceDelta,
  available,
  sort: optSeq,
});

export function makeMenu(): PublicMenuResponse {
  optSeq = 0;
  const groups: OptionGroupDto[] = [
    {
      id: 1,
      name: L('Bagian ayam', 'Chicken part', 'ផ្នែកសាច់មាន់', '鸡肉部位'),
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        opt(1, L('Paha', 'Thigh', 'ភ្លៅ', '鸡腿')),
        opt(1, L('Dada', 'Breast', 'ទ្រូង', '鸡胸')),
        opt(1, L('Sayap', 'Wing', 'ស្លាប', '鸡翅'), 0, false),
      ],
    },
    {
      id: 2,
      name: L('Level pedas', 'Spice level', 'កម្រិតហឹរ', '辣度'),
      required: true,
      minSelect: 1,
      maxSelect: 1,
      options: [
        opt(2, L('Tidak pedas', 'Not spicy', 'មិនហឹរ', '不辣')),
        opt(2, L('Sedang', 'Medium', 'ហឹរមធ្យម', '中辣')),
        opt(2, L('Pedas', 'Spicy', 'ហឹរ', '辣')),
        opt(2, L('Extra pedas', 'Extra spicy', 'ហឹរខ្លាំង', '特辣'), 1000),
      ],
    },
    {
      id: 3,
      name: L('Tambahan', 'Add-ons', 'បន្ថែម', '加料'),
      required: false,
      minSelect: 0,
      maxSelect: 3,
      options: [
        opt(3, L('Nasi', 'Rice', 'បាយ', '米饭'), 2000),
        opt(3, L('Telur ceplok', 'Fried egg', 'ពងមាន់ចៀន', '煎蛋'), 3000),
        opt(3, L('Sambal ekstra', 'Extra sambal', 'ទឹកម្ទេសបន្ថែម', '加辣酱'), 1000),
        opt(3, L('Tahu', 'Tofu', 'តៅហ៊ូ', '豆腐'), 2000),
        opt(3, L('Tempe', 'Tempeh', 'តេមប៉េ', '天贝'), 2000, false),
      ],
    },
    {
      id: 4,
      name: L('Gula & es', 'Sugar & ice', 'ស្ករ និងទឹកកក', '糖和冰'),
      required: false,
      minSelect: 0,
      maxSelect: 1,
      options: [
        opt(4, L('Normal', 'Normal', 'ធម្មតា', '正常')),
        opt(4, L('Tanpa es', 'No ice', 'គ្មានទឹកកក', '去冰')),
      ],
    },
  ];
  const item = (
    id: number,
    categoryId: number,
    name: LocalizedText,
    price: number,
    o: { best?: boolean; available?: boolean; groups?: number[] } = {},
  ) => ({
    id,
    categoryId,
    name,
    description: {},
    photoUrl: null,
    available: o.available ?? true,
    bestSeller: o.best ?? false,
    sort: id,
    price,
    optionGroupIds: o.groups ?? [],
  });
  const items = [
    item(1, 1, L('Ayam Goreng', 'Fried Chicken', 'មាន់បំពង', '炸鸡'), 10000, { best: true, groups: [1, 2, 3] }),
    item(2, 1, L('Ayam Bakar', 'Grilled Chicken', 'មាន់អាំង', '烤鸡'), 12000, { groups: [1, 2, 3] }),
    item(3, 2, L('Pempek Kapal Selam', 'Pempek with Egg', 'ពែមពែកស៊ុត', '潜艇鱼饼（含蛋）'), 14000, {
      best: true,
      groups: [2],
    }),
    item(4, 2, L('Pempek Lenjer', 'Long Pempek', 'ពែមពែកវែង', '长条鱼饼'), 10000, { available: false }),
    item(5, 3, L('Kopi Susu', 'Milk Coffee', 'កាហ្វេទឹកដោះគោ', '牛奶咖啡'), 6000, { best: true, groups: [4] }),
    item(6, 3, L('Kopi Hitam', 'Black Coffee', 'កាហ្វេខ្មៅ', '黑咖啡'), 5000, { groups: [4] }),
    item(7, 3, L('Es Teh Manis', 'Sweet Iced Tea', 'តែទឹកកកផ្អែម', '冰甜茶'), 4000, { groups: [4] }),
    item(8, 4, L('Nasi Putih', 'Steamed Rice', 'បាយស', '白米饭'), 2000),
    item(9, 4, L('Kerupuk', 'Crackers', 'នំក្រៀប', '虾片'), 2000),
  ];
  const cats = [
    { id: 1, name: L('Ayam', 'Chicken', 'សាច់មាន់', '鸡肉'), sort: 0 },
    { id: 2, name: L('Pempek', 'Pempek (fish cake)', 'ពែមពែក', '印尼鱼饼'), sort: 1 },
    { id: 3, name: L('Minuman', 'Drinks', 'ភេសជ្ជៈ', '饮料'), sort: 2 },
    { id: 4, name: L('Tambahan', 'Extras', 'បន្ថែម', '加点'), sort: 3 },
  ];
  return {
    categories: cats.map((c) => ({ ...c, itemCount: items.filter((i) => i.categoryId === c.id).length })),
    items,
    optionGroups: groups,
  };
}

const NOW = '2026-11-21T05:00:00.000Z';

export function makeOrder(over: Partial<PublicOrderDto> = {}): PublicOrderDto {
  return {
    id: '11111111-1111-4111-8111-111111111111',
    number: 12,
    displayNo: '#12',
    channel: 'website',
    type: 'delivery',
    status: 'pending_accept',
    paymentStatus: 'unpaid',
    paymentMethod: 'cash',
    table: null,
    address: { id: 1, label: 'Rumah', text: 'Jl. Ekareach', landmark: 'pagar biru', lat: 10.6, lng: 103.5 },
    items: [
      {
        id: 1,
        itemId: 9,
        name: L('Kerupuk', 'Crackers', 'នំក្រៀប', '虾片'),
        qty: 2,
        unitPrice: 2000,
        options: [],
        lineTotal: 4000,
        note: null,
      },
    ],
    subtotal: 4000,
    discount: 0,
    deliveryFee: 0,
    total: 4000,
    currency: 'KHR',
    note: null,
    rejectReason: null,
    proofUploaded: false,
    driverName: null,
    createdAt: NOW,
    updatedAt: NOW,
    acceptedAt: null,
    cookingAt: null,
    readyAt: null,
    pickedUpAt: null,
    deliveredAt: null,
    servedAt: null,
    doneAt: null,
    cancelledAt: null,
    ...over,
  };
}

export const TABLE_TOKEN = 'tok_abcdefghijklmnopqrstuvwxyz012';

export function tableSession(): CustomerSessionResponse {
  return {
    mode: 'table',
    customer: null,
    table: { id: 5, name: 'Meja 5', area: 'Dalam' },
    tableSession: { id: 7, tableId: 5, status: 'open', openedAt: NOW, closedAt: null },
  };
}

export function tableBill(orders: PublicOrderDto[] = []): PublicTableBillResponse {
  const total = orders.reduce((a, o) => a + o.total, 0);
  return {
    table: { id: 5, name: 'Meja 5', area: 'Dalam' },
    session: { id: 7, tableId: 5, status: 'open', openedAt: NOW, closedAt: null },
    orders,
    total,
    paid: 0,
    remaining: total,
    currency: 'KHR',
  };
}

export function telegramSession(): CustomerSessionResponse {
  return {
    mode: 'telegram',
    customer: { id: 3, name: 'Budi', username: 'budi_pp', phone: null, lang: 'id', telegramId: '777' },
    table: null,
    tableSession: null,
  };
}
