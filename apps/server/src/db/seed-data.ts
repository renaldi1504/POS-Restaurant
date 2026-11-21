/**
 * Seed dev/test (SPEC §3). PERINGATAN: mengosongkan semua tabel aplikasi terlebih dulu.
 */
import { randomBytes } from 'node:crypto';
import { sql } from 'drizzle-orm';
import {
  DEFAULT_ROLE_PERMISSIONS,
  DEFAULT_SETTINGS,
  ROLE_NAMES,
  type LocalizedText,
  type SystemRoleKey,
} from '@pos/shared';
import { hashPin } from '../lib/pin';
import type { Db } from './client';
import * as s from './schema';

export const SEED_USERS = [
  { name: 'Owner', role: 'owner', pin: '1234', lang: 'id' },
  { name: 'Kasir Pagi', role: 'cashier', pin: '1111', lang: 'id' },
  { name: 'Kasir Malam', role: 'cashier', pin: '2222', lang: 'id' },
  { name: 'Dapur', role: 'kitchen', pin: '3333', lang: 'id' },
  { name: 'Driver', role: 'driver', pin: '4444', lang: 'kh' },
] as const satisfies readonly { name: string; role: SystemRoleKey; pin: string; lang: string }[];
export const BOT_USER_NAME = 'Bot Telegram';

/** Token QR meja: 24 byte acak → 32 karakter base64url. */
export function newQrToken(): string {
  return randomBytes(24).toString('base64url');
}

const L = (id: string, en: string, kh: string, zh: string): LocalizedText => ({ id, en, kh, zh });
/** Harga platform = +25%, dibulatkan ke 100 riel. */
const platformPrice = (store: number) => Math.round((store * 1.25) / 100) * 100;

const APP_TABLES = [
  'audit_logs',
  'driver_settlements',
  'closings',
  'expenses',
  'expense_categories',
  'payments',
  'order_items',
  'orders',
  'daily_counters',
  'shifts',
  'addresses',
  'sessions',
  'customers',
  'table_sessions',
  'dine_tables',
  'promos',
  'item_option_groups',
  'options',
  'option_groups',
  'item_prices',
  'menu_items',
  'categories',
  'users',
  'roles',
  'settings',
];

export async function seedDatabase(db: Db, _opts: { orderOrigin?: string } = {}): Promise<void> {
  await db.execute(sql.raw(`TRUNCATE ${APP_TABLES.join(', ')} RESTART IDENTITY CASCADE`));

  await db.transaction(async (tx) => {
    // Settings
    await tx
      .insert(s.settings)
      .values(Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({ key, value })));

    // Roles
    const roleIds = {} as Record<SystemRoleKey, number>;
    for (const key of Object.keys(ROLE_NAMES) as SystemRoleKey[]) {
      const [r] = await tx
        .insert(s.roles)
        .values({ name: ROLE_NAMES[key], permissions: DEFAULT_ROLE_PERMISSIONS[key], system: true })
        .returning({ id: s.roles.id });
      roleIds[key] = r!.id;
    }

    // Users
    for (const u of SEED_USERS) {
      await tx.insert(s.users).values({
        name: u.name,
        roleId: roleIds[u.role],
        pinHash: await hashPin(u.pin),
        lang: u.lang,
      });
    }
    await tx
      .insert(s.users)
      .values({ name: BOT_USER_NAME, roleId: roleIds.bot, pinHash: null, system: true });

    // Kategori
    const cats = [
      { key: 'ayam', name: L('Ayam', 'Chicken', 'សាច់មាន់', '鸡肉') },
      { key: 'pempek', name: L('Pempek', 'Pempek (fish cake)', 'ពែមពែក', '印尼鱼饼') },
      { key: 'minuman', name: L('Minuman', 'Drinks', 'ភេសជ្ជៈ', '饮料') },
      { key: 'tambahan', name: L('Tambahan', 'Extras', 'បន្ថែម', '加点') },
    ];
    const catIds: Record<string, number> = {};
    for (const [i, c] of cats.entries()) {
      const [row] = await tx
        .insert(s.categories)
        .values({ name: c.name, sort: i })
        .returning({ id: s.categories.id });
      catIds[c.key] = row!.id;
    }

    // Grup opsi
    type OptSeed = { name: LocalizedText; delta?: number; available?: boolean };
    const groups: Record<
      string,
      { name: LocalizedText; required: boolean; min: number; max: number; options: OptSeed[] }
    > = {
      bagian: {
        name: L('Bagian ayam', 'Chicken part', 'ផ្នែកសាច់មាន់', '鸡肉部位'),
        required: true,
        min: 1,
        max: 1,
        options: [
          { name: L('Paha', 'Thigh', 'ភ្លៅ', '鸡腿') },
          { name: L('Dada', 'Breast', 'ទ្រូង', '鸡胸') },
          { name: L('Sayap', 'Wing', 'ស្លាប', '鸡翅') },
        ],
      },
      pedas: {
        name: L('Level pedas', 'Spice level', 'កម្រិតហឹរ', '辣度'),
        required: true,
        min: 1,
        max: 1,
        options: [
          { name: L('Tidak pedas', 'Not spicy', 'មិនហឹរ', '不辣') },
          { name: L('Sedang', 'Medium', 'ហឹរមធ្យម', '中辣') },
          { name: L('Pedas', 'Spicy', 'ហឹរ', '辣') },
          { name: L('Extra pedas', 'Extra spicy', 'ហឹរខ្លាំង', '特辣'), delta: 1000 },
        ],
      },
      tambahan: {
        name: L('Tambahan', 'Add-ons', 'បន្ថែម', '加料'),
        required: false,
        min: 0,
        max: 3,
        options: [
          { name: L('Nasi', 'Rice', 'បាយ', '米饭'), delta: 2000 },
          { name: L('Telur ceplok', 'Fried egg', 'ពងមាន់ចៀន', '煎蛋'), delta: 3000 },
          { name: L('Sambal ekstra', 'Extra sambal', 'ទឹកម្ទេសបន្ថែម', '加辣酱'), delta: 1000 },
          { name: L('Tahu', 'Tofu', 'តៅហ៊ូ', '豆腐'), delta: 2000 },
          { name: L('Tempe', 'Tempeh', 'តេមប៉េ', '天贝'), delta: 2000, available: false },
        ],
      },
      gulaEs: {
        name: L('Gula & es', 'Sugar & ice', 'ស្ករ និងទឹកកក', '糖和冰'),
        required: false,
        min: 0,
        max: 1,
        options: [
          { name: L('Normal', 'Normal', 'ធម្មតា', '正常') },
          { name: L('Kurang gula', 'Less sugar', 'ស្ករតិច', '少糖') },
          { name: L('Tanpa gula', 'No sugar', 'គ្មានស្ករ', '无糖') },
          { name: L('Tanpa es', 'No ice', 'គ្មានទឹកកក', '去冰') },
        ],
      },
    };
    const groupIds: Record<string, number> = {};
    for (const [key, g] of Object.entries(groups)) {
      const [row] = await tx
        .insert(s.optionGroups)
        .values({ name: g.name, required: g.required, minSelect: g.min, maxSelect: g.max })
        .returning({ id: s.optionGroups.id });
      groupIds[key] = row!.id;
      await tx.insert(s.options).values(
        g.options.map((o, i) => ({
          groupId: row!.id,
          name: o.name,
          priceDelta: o.delta ?? 0,
          available: o.available ?? true,
          sort: i,
        })),
      );
    }

    // Menu
    const items: {
      cat: string;
      name: LocalizedText;
      price: number;
      available?: boolean;
      bestSeller?: boolean;
      groups?: string[];
      aiInfo?: string;
      description?: Partial<LocalizedText>;
    }[] = [
      {
        cat: 'ayam',
        name: L('Ayam Goreng', 'Fried Chicken', 'មាន់បំពង', '炸鸡'),
        price: 10000,
        bestSeller: true,
        groups: ['bagian', 'pedas', 'tambahan'],
        aiInfo: 'Ayam goreng bumbu kuning khas Indonesia, disajikan dengan sambal & lalapan. Halal.',
        description: {
          id: 'Ayam goreng bumbu kuning, sambal & lalapan',
          en: 'Turmeric fried chicken with sambal',
        },
      },
      {
        cat: 'ayam',
        name: L('Ayam Bakar', 'Grilled Chicken', 'មាន់អាំង', '烤鸡'),
        price: 12000,
        bestSeller: true,
        groups: ['bagian', 'pedas', 'tambahan'],
        aiInfo: 'Ayam bakar kecap manis, sedikit manis. Halal.',
        description: { id: 'Ayam bakar kecap manis', en: 'Sweet soy grilled chicken' },
      },
      {
        cat: 'pempek',
        name: L('Pempek Kapal Selam', 'Pempek with Egg', 'ពែមពែកស៊ុត', '潜艇鱼饼（含蛋）'),
        price: 14000,
        bestSeller: true,
        groups: ['pedas'],
        aiInfo: 'Pempek ikan isi telur, kuah cuko asam-manis-pedas khas Palembang.',
      },
      {
        cat: 'pempek',
        name: L('Pempek Lenjer', 'Long Pempek', 'ពែមពែកវែង', '长条鱼饼'),
        price: 10000,
        available: false,
        groups: ['pedas'],
        aiInfo: 'Pempek ikan bentuk panjang dengan kuah cuko.',
      },
      {
        cat: 'minuman',
        name: L('Kopi Susu', 'Milk Coffee', 'កាហ្វេទឹកដោះគោ', '牛奶咖啡'),
        price: 6000,
        bestSeller: true,
        groups: ['gulaEs'],
      },
      {
        cat: 'minuman',
        name: L('Kopi Hitam', 'Black Coffee', 'កាហ្វេខ្មៅ', '黑咖啡'),
        price: 5000,
        groups: ['gulaEs'],
      },
      {
        cat: 'minuman',
        name: L('Es Teh Manis', 'Sweet Iced Tea', 'តែទឹកកកផ្អែម', '冰甜茶'),
        price: 4000,
        groups: ['gulaEs'],
      },
      { cat: 'tambahan', name: L('Nasi Putih', 'Steamed Rice', 'បាយស', '白米饭'), price: 2000 },
      { cat: 'tambahan', name: L('Kerupuk', 'Crackers', 'នំក្រៀប', '虾片'), price: 2000 },
    ];
    for (const [i, it] of items.entries()) {
      const [row] = await tx
        .insert(s.menuItems)
        .values({
          categoryId: catIds[it.cat]!,
          name: it.name,
          description: it.description ?? {},
          aiInfo: it.aiInfo ?? '',
          available: it.available ?? true,
          bestSeller: it.bestSeller ?? false,
          sort: i,
        })
        .returning({ id: s.menuItems.id });
      const itemId = row!.id;
      await tx.insert(s.itemPrices).values([
        { itemId, channel: 'store', price: it.price },
        { itemId, channel: 'grab', price: platformPrice(it.price) },
        { itemId, channel: 'foodpanda', price: platformPrice(it.price) },
      ]);
      if (it.groups?.length) {
        await tx
          .insert(s.itemOptionGroups)
          .values(it.groups.map((g, sort) => ({ itemId, groupId: groupIds[g]!, sort })));
      }
    }

    // Meja
    const tables = [
      ...Array.from({ length: 6 }, (_, i) => ({ name: `Meja ${i + 1}`, area: 'Dalam' })),
      ...Array.from({ length: 4 }, (_, i) => ({ name: `Teras ${i + 1}`, area: 'Teras' })),
    ];
    await tx
      .insert(s.dineTables)
      .values(tables.map((t, i) => ({ ...t, seats: 4, qrToken: newQrToken(), active: true, sort: i })));

    // Kategori pengeluaran
    await tx
      .insert(s.expenseCategories)
      .values(
        [
          'Belanja dapur',
          'Gas',
          'Es batu',
          'Bensin & transport',
          'Kebersihan',
          'Gaji harian',
          'Lain-lain',
        ].map((name) => ({ name })),
      );
  });
}
