/**
 * Skema database (Drizzle, PostgreSQL 16) — SPEC §3.
 * Uang = bigint satuan minor (mode number) + kode mata uang. Teks multi-bahasa = JSONB {id,en,kh,zh}.
 * Setelah mengubah file ini: `pnpm db:generate` lalu commit folder drizzle/.
 */
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import {
  CURRENCIES,
  EXPENSE_SOURCES,
  ORDER_CHANNELS,
  ORDER_STATUSES,
  ORDER_TYPES,
  PAYMENT_METHODS,
  PAYMENT_STATUSES,
  PRICE_CHANNELS,
  PROMO_KINDS,
  TABLE_SESSION_STATUSES,
  type ClosingActual,
  type ClosingDiff,
  type ClosingExpected,
  type DenominationCounts,
  type LocalizedLongText,
  type LocalizedText,
  type MoneyByCurrency,
  type OptionSnapshot,
  type PromoScope,
} from '@pos/shared';

const money = (name: string) => bigint(name, { mode: 'number' });
const tsz = (name: string) => timestamp(name, { withTimezone: true, mode: 'date' });
const createdAt = () => tsz('created_at').notNull().defaultNow();
const id = () => integer('id').primaryKey().generatedAlwaysAsIdentity();

// ---------- Enums ----------
export const orderChannelEnum = pgEnum('order_channel', ORDER_CHANNELS);
export const orderTypeEnum = pgEnum('order_type', ORDER_TYPES);
export const orderStatusEnum = pgEnum('order_status', ORDER_STATUSES);
export const paymentStatusEnum = pgEnum('payment_status', PAYMENT_STATUSES);
export const paymentMethodEnum = pgEnum('payment_method', PAYMENT_METHODS);
export const priceChannelEnum = pgEnum('price_channel', PRICE_CHANNELS);
export const tableSessionStatusEnum = pgEnum('table_session_status', TABLE_SESSION_STATUSES);
export const expenseSourceEnum = pgEnum('expense_source', EXPENSE_SOURCES);
export const promoKindEnum = pgEnum('promo_kind', PROMO_KINDS);
export const currencyEnum = pgEnum('currency', CURRENCIES);
export const sessionKindEnum = pgEnum('session_kind', ['staff', 'customer']);

// ---------- Settings, role, user, sesi ----------
export const settings = pgTable('settings', {
  key: text('key').primaryKey(),
  value: jsonb('value').notNull(),
  updatedAt: tsz('updated_at').notNull().defaultNow(),
});

export const roles = pgTable('roles', {
  id: id(),
  name: text('name').notNull().unique(),
  permissions: jsonb('permissions').$type<string[]>().notNull().default([]),
  system: boolean('system').notNull().default(false),
  createdAt: createdAt(),
});

export const users = pgTable('users', {
  id: id(),
  name: text('name').notNull(),
  roleId: integer('role_id')
    .notNull()
    .references(() => roles.id),
  /** null untuk user sistem (Bot Telegram) → tidak bisa login. */
  pinHash: text('pin_hash'),
  lang: text('lang').notNull().default('id'),
  active: boolean('active').notNull().default(true),
  system: boolean('system').notNull().default(false),
  failedAttempts: integer('failed_attempts').notNull().default(0),
  lockedUntil: tsz('locked_until'),
  createdAt: createdAt(),
});

/**
 * Sesi cookie (staf & pelanggan). Cookie berisi id sesi yang ditandatangani (SESSION_SECRET).
 * Staf: user_id. Pelanggan: customer_id (telegram/tamu) dan/atau table_id (mode meja).
 */
export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    kind: sessionKindEnum('kind').notNull(),
    userId: integer('user_id').references(() => users.id, { onDelete: 'cascade' }),
    customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    tableId: integer('table_id').references(() => dineTables.id, { onDelete: 'cascade' }),
    userAgent: text('user_agent'),
    createdAt: createdAt(),
    lastSeenAt: tsz('last_seen_at').notNull().defaultNow(),
    expiresAt: tsz('expires_at').notNull(),
  },
  (t) => [index('sessions_expires_idx').on(t.expiresAt)],
);

// ---------- Menu ----------
export const categories = pgTable('categories', {
  id: id(),
  name: jsonb('name').$type<LocalizedText>().notNull(),
  sort: integer('sort').notNull().default(0),
});

export const menuItems = pgTable(
  'menu_items',
  {
    id: id(),
    categoryId: integer('category_id')
      .notNull()
      .references(() => categories.id),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    description: jsonb('description').$type<LocalizedLongText>().notNull().default({}),
    aiInfo: text('ai_info').notNull().default(''),
    photoUrl: text('photo_url'),
    available: boolean('available').notNull().default(true),
    bestSeller: boolean('best_seller').notNull().default(false),
    sort: integer('sort').notNull().default(0),
    createdAt: createdAt(),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
  },
  (t) => [index('menu_items_category_idx').on(t.categoryId)],
);

export const itemPrices = pgTable(
  'item_prices',
  {
    itemId: integer('item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    channel: priceChannelEnum('channel').notNull(),
    price: money('price').notNull(),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.channel] })],
);

export const optionGroups = pgTable('option_groups', {
  id: id(),
  name: jsonb('name').$type<LocalizedText>().notNull(),
  required: boolean('required').notNull().default(false),
  minSelect: integer('min_select').notNull().default(0),
  /** 0 = tanpa batas. */
  maxSelect: integer('max_select').notNull().default(1),
});

export const options = pgTable(
  'options',
  {
    id: id(),
    groupId: integer('group_id')
      .notNull()
      .references(() => optionGroups.id, { onDelete: 'cascade' }),
    name: jsonb('name').$type<LocalizedText>().notNull(),
    priceDelta: money('price_delta').notNull().default(0),
    /** Tambahan harga khusus Grab / foodpanda; null = sama dengan harga toko. */
    priceGrab: money('price_grab'),
    priceFoodpanda: money('price_foodpanda'),
    available: boolean('available').notNull().default(true),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [index('options_group_idx').on(t.groupId)],
);

export const itemOptionGroups = pgTable(
  'item_option_groups',
  {
    itemId: integer('item_id')
      .notNull()
      .references(() => menuItems.id, { onDelete: 'cascade' }),
    groupId: integer('group_id')
      .notNull()
      .references(() => optionGroups.id, { onDelete: 'cascade' }),
    sort: integer('sort').notNull().default(0),
  },
  (t) => [primaryKey({ columns: [t.itemId, t.groupId] })],
);

export const promos = pgTable('promos', {
  id: id(),
  name: text('name').notNull(),
  /** null = semua channel. */
  channel: orderChannelEnum('channel'),
  kind: promoKindEnum('kind').notNull(),
  /** pct: 0–100; amount: minor mata uang utama. */
  value: doublePrecision('value').notNull(),
  scope: jsonb('scope').$type<PromoScope>().notNull().default({}),
  startsAt: tsz('starts_at'),
  endsAt: tsz('ends_at'),
  active: boolean('active').notNull().default(true),
  createdAt: createdAt(),
});

// ---------- Meja ----------
export const dineTables = pgTable('dine_tables', {
  id: id(),
  name: text('name').notNull(),
  area: text('area').notNull().default('Dalam'),
  seats: integer('seats').notNull().default(4),
  qrToken: text('qr_token').notNull().unique(),
  active: boolean('active').notNull().default(true),
  sort: integer('sort').notNull().default(0),
});

export const tableSessions = pgTable(
  'table_sessions',
  {
    id: id(),
    tableId: integer('table_id')
      .notNull()
      .references(() => dineTables.id),
    status: tableSessionStatusEnum('status').notNull().default('open'),
    openedAt: tsz('opened_at').notNull().defaultNow(),
    closedAt: tsz('closed_at'),
    billRequestedAt: tsz('bill_requested_at'),
    /** Sesi digabung ke sesi lain (gabung meja). */
    mergedIntoId: integer('merged_into_id'),
  },
  (t) => [index('table_sessions_table_idx').on(t.tableId, t.status)],
);

// ---------- Pelanggan ----------
export const customers = pgTable('customers', {
  id: id(),
  /** ID Telegram (bigint sebagai teks). null untuk tamu website. */
  telegramId: text('telegram_id').unique(),
  name: text('name'),
  username: text('username'),
  phone: text('phone'),
  lang: text('lang').notNull().default('id'),
  /** Chat lewat akun Telegram Business → notifikasi dikirim lewat koneksi ini. */
  tgBusinessConnectionId: text('tg_business_connection_id'),
  createdAt: createdAt(),
});

export const addresses = pgTable(
  'addresses',
  {
    id: id(),
    customerId: integer('customer_id').references(() => customers.id, { onDelete: 'cascade' }),
    label: text('label').notNull().default('Rumah'),
    lat: doublePrecision('lat'),
    lng: doublePrecision('lng'),
    text: text('text').notNull(),
    landmark: text('landmark'),
    createdAt: createdAt(),
  },
  (t) => [index('addresses_customer_idx').on(t.customerId)],
);

// ---------- Shift & order ----------
export const shifts = pgTable(
  'shifts',
  {
    id: id(),
    businessDate: date('business_date', { mode: 'string' }).notNull(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    name: text('name').notNull(),
    openedAt: tsz('opened_at').notNull().defaultNow(),
    closedAt: tsz('closed_at'),
    openingCash: jsonb('opening_cash').$type<MoneyByCurrency>().notNull(),
    openingDenominations: jsonb('opening_denominations').$type<DenominationCounts>(),
  },
  (t) => [index('shifts_business_date_idx').on(t.businessDate)],
);

export const dailyCounters = pgTable('daily_counters', {
  businessDate: date('business_date', { mode: 'string' }).primaryKey(),
  lastNo: integer('last_no').notNull().default(0),
});

export const orders = pgTable(
  'orders',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    businessDate: date('business_date', { mode: 'string' }).notNull(),
    number: integer('number').notNull(),
    displayNo: text('display_no').notNull(),
    channel: orderChannelEnum('channel').notNull(),
    type: orderTypeEnum('type').notNull(),
    status: orderStatusEnum('status').notNull(),
    shiftId: integer('shift_id').references(() => shifts.id),
    tableSessionId: integer('table_session_id').references(() => tableSessions.id),
    customerId: integer('customer_id').references(() => customers.id),
    customerName: text('customer_name'),
    addressId: integer('address_id').references(() => addresses.id),
    driverId: integer('driver_id').references(() => users.id),
    deliveryFee: money('delivery_fee').notNull().default(0),
    subtotal: money('subtotal').notNull().default(0),
    discount: money('discount').notNull().default(0),
    promoId: integer('promo_id').references(() => promos.id),
    total: money('total').notNull().default(0),
    currency: currencyEnum('currency').notNull().default('KHR'),
    note: text('note'),
    paymentStatus: paymentStatusEnum('payment_status').notNull().default('unpaid'),
    /** Pilihan pelanggan online (cash saat diantar / aba). */
    paymentMethod: paymentMethodEnum('payment_method'),
    rejectReason: text('reject_reason'),
    cancelReason: text('cancel_reason'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: createdAt(),
    updatedAt: tsz('updated_at').notNull().defaultNow(),
    acceptedAt: tsz('accepted_at'),
    cookingAt: tsz('cooking_at'),
    readyAt: tsz('ready_at'),
    pickedUpAt: tsz('picked_up_at'),
    deliveredAt: tsz('delivered_at'),
    servedAt: tsz('served_at'),
    doneAt: tsz('done_at'),
    cancelledAt: tsz('cancelled_at'),
  },
  (t) => [
    uniqueIndex('orders_business_date_number_uq').on(t.businessDate, t.number),
    index('orders_status_idx').on(t.status),
    index('orders_updated_at_idx').on(t.updatedAt),
    index('orders_shift_idx').on(t.shiftId),
    index('orders_table_session_idx').on(t.tableSessionId),
    index('orders_customer_idx').on(t.customerId),
    index('orders_driver_idx').on(t.driverId),
  ],
);

export const orderItems = pgTable(
  'order_items',
  {
    id: id(),
    orderId: uuid('order_id')
      .notNull()
      .references(() => orders.id, { onDelete: 'cascade' }),
    itemId: integer('item_id').references(() => menuItems.id, { onDelete: 'set null' }),
    nameSnapshot: jsonb('name_snapshot').$type<LocalizedText>().notNull(),
    qty: integer('qty').notNull(),
    unitPrice: money('unit_price').notNull(),
    optionsSnapshot: jsonb('options_snapshot').$type<OptionSnapshot[]>().notNull().default([]),
    lineTotal: money('line_total').notNull(),
    note: text('note'),
  },
  (t) => [index('order_items_order_idx').on(t.orderId)],
);

export const payments = pgTable(
  'payments',
  {
    id: id(),
    orderId: uuid('order_id').references(() => orders.id, { onDelete: 'cascade' }),
    tableSessionId: integer('table_session_id').references(() => tableSessions.id),
    shiftId: integer('shift_id').references(() => shifts.id),
    method: paymentMethodEnum('method').notNull(),
    currency: currencyEnum('currency').notNull(),
    amount: money('amount').notNull(),
    amountMain: money('amount_main').notNull(),
    changeMain: money('change_main').notNull().default(0),
    proofUrl: text('proof_url'),
    verifiedBy: integer('verified_by').references(() => users.id),
    verifiedAt: tsz('verified_at'),
    /** Bukti ditolak / pembayaran dibatalkan → tidak dihitung. */
    voidedAt: tsz('voided_at'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [
    index('payments_order_idx').on(t.orderId),
    index('payments_session_idx').on(t.tableSessionId),
    index('payments_shift_idx').on(t.shiftId),
  ],
);

// ---------- Kas ----------
export const expenseCategories = pgTable('expense_categories', {
  id: id(),
  name: text('name').notNull().unique(),
  active: boolean('active').notNull().default(true),
});

export const expenses = pgTable(
  'expenses',
  {
    id: id(),
    shiftId: integer('shift_id')
      .notNull()
      .references(() => shifts.id),
    categoryId: integer('category_id')
      .notNull()
      .references(() => expenseCategories.id),
    amount: money('amount').notNull(),
    currency: currencyEnum('currency').notNull(),
    source: expenseSourceEnum('source').notNull(),
    note: text('note'),
    photoUrl: text('photo_url'),
    createdBy: integer('created_by').references(() => users.id),
    createdAt: createdAt(),
  },
  (t) => [index('expenses_shift_idx').on(t.shiftId)],
);

export const closings = pgTable('closings', {
  shiftId: integer('shift_id')
    .primaryKey()
    .references(() => shifts.id),
  expected: jsonb('expected').$type<ClosingExpected>().notNull(),
  actual: jsonb('actual').$type<ClosingActual>().notNull(),
  diff: jsonb('diff').$type<ClosingDiff>().notNull(),
  note: text('note'),
  createdBy: integer('created_by').references(() => users.id),
  createdAt: createdAt(),
});

export const driverSettlements = pgTable(
  'driver_settlements',
  {
    id: id(),
    shiftId: integer('shift_id')
      .notNull()
      .references(() => shifts.id),
    driverId: integer('driver_id')
      .notNull()
      .references(() => users.id),
    deliveries: integer('deliveries').notNull().default(0),
    cashCollected: money('cash_collected').notNull().default(0),
    settledAt: tsz('settled_at'),
    settledBy: integer('settled_by').references(() => users.id),
  },
  (t) => [uniqueIndex('driver_settlements_shift_driver_uq').on(t.shiftId, t.driverId)],
);

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: integer('id').primaryKey().generatedAlwaysAsIdentity(),
    userId: integer('user_id').references(() => users.id),
    action: text('action').notNull(),
    entity: text('entity').notNull(),
    entityId: text('entity_id'),
    before: jsonb('before'),
    after: jsonb('after'),
    reason: text('reason'),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_logs_entity_idx').on(t.entity, t.entityId),
    index('audit_logs_created_idx').on(t.createdAt),
  ],
);
