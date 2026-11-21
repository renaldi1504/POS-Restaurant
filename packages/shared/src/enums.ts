import { z } from 'zod';

/** Bahasa yang didukung. `id` = default & fallback. */
export const LANGS = ['id', 'en', 'kh', 'zh'] as const;
export const Lang = z.enum(LANGS);
export type Lang = z.infer<typeof Lang>;
export const DEFAULT_LANG: Lang = 'id';

/** Mata uang. KHR tanpa desimal, USD dalam sen, IDR dalam rupiah. */
export const CURRENCIES = ['KHR', 'USD', 'IDR'] as const;
export const Currency = z.enum(CURRENCIES);
export type Currency = z.infer<typeof Currency>;

/** Sumber order. */
export const ORDER_CHANNELS = ['kasir', 'website', 'telegram', 'qr', 'grab', 'foodpanda'] as const;
export const OrderChannel = z.enum(ORDER_CHANNELS);
export type OrderChannel = z.infer<typeof OrderChannel>;
/** Channel yang boleh dibuat staf lewat `POST /orders`. */
export const STAFF_ORDER_CHANNELS = ['kasir', 'grab', 'foodpanda'] as const;
export const StaffOrderChannel = z.enum(STAFF_ORDER_CHANNELS);
export type StaffOrderChannel = z.infer<typeof StaffOrderChannel>;
/** Channel online yang perlu diterima kasir (pending_accept). */
export const ONLINE_CHANNELS: readonly OrderChannel[] = ['website', 'telegram', 'qr'];

/** Daftar harga per channel (item_prices). */
export const PRICE_CHANNELS = ['store', 'grab', 'foodpanda'] as const;
export const PriceChannel = z.enum(PRICE_CHANNELS);
export type PriceChannel = z.infer<typeof PriceChannel>;
/** Channel order → daftar harga yang dipakai. */
export function priceChannelFor(channel: OrderChannel): PriceChannel {
  if (channel === 'grab') return 'grab';
  if (channel === 'foodpanda') return 'foodpanda';
  return 'store';
}

export const ORDER_TYPES = ['dine_in', 'takeaway', 'delivery'] as const;
export const OrderType = z.enum(ORDER_TYPES);
export type OrderType = z.infer<typeof OrderType>;

export const ORDER_STATUSES = [
  'pending_accept',
  'accepted',
  'cooking',
  'ready',
  'picked_up',
  'delivered',
  'served',
  'done',
  'rejected',
  'cancelled',
] as const;
export const OrderStatus = z.enum(ORDER_STATUSES);
export type OrderStatus = z.infer<typeof OrderStatus>;

/** Status yang dianggap "aktif" (belum selesai/batal). */
export const ACTIVE_ORDER_STATUSES: readonly OrderStatus[] = [
  'pending_accept',
  'accepted',
  'cooking',
  'ready',
  'picked_up',
  'delivered',
  'served',
];
export const TERMINAL_ORDER_STATUSES: readonly OrderStatus[] = ['done', 'rejected', 'cancelled'];
/** Status yang tampil di layar dapur. */
export const KITCHEN_STATUSES: readonly OrderStatus[] = ['accepted', 'cooking'];

/**
 * Peta transisi status order (tanpa memperhatikan tipe).
 * Gunakan `canTransition(from, to, type)` untuk validasi lengkap (tipe-aware).
 */
export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending_accept: ['accepted', 'rejected', 'cancelled'],
  accepted: ['cooking', 'ready', 'cancelled'],
  cooking: ['ready', 'cancelled'],
  ready: ['picked_up', 'served', 'cancelled'],
  picked_up: ['delivered', 'ready', 'cancelled'],
  delivered: ['done', 'cancelled'],
  served: ['done', 'cancelled'],
  done: [],
  rejected: [],
  cancelled: [],
};

/**
 * Validasi transisi status termasuk aturan tipe order:
 * - delivery: ready → picked_up → delivered → done (picked_up → ready = driver melepas order)
 * - dine_in / takeaway: ready → served → done
 */
export function canTransition(from: OrderStatus, to: OrderStatus, type: OrderType): boolean {
  if (!ORDER_TRANSITIONS[from].includes(to)) return false;
  const deliveryOnly: OrderStatus[] = ['picked_up', 'delivered'];
  if (type !== 'delivery' && deliveryOnly.includes(to)) return false;
  if (type === 'delivery' && to === 'served') return false;
  if (from === 'picked_up' && to === 'ready' && type !== 'delivery') return false;
  return true;
}

/** Status berikutnya yang boleh dari `from` untuk tipe tertentu. */
export function nextStatuses(from: OrderStatus, type: OrderType): OrderStatus[] {
  return ORDER_TRANSITIONS[from].filter((to) => canTransition(from, to, type));
}

/** Status awal order: kasir/grab/foodpanda langsung `accepted`; online menunggu terima. */
export function initialStatusFor(channel: OrderChannel, opts: { qrRequireAccept: boolean }): OrderStatus {
  if (channel === 'website' || channel === 'telegram') return 'pending_accept';
  if (channel === 'qr') return opts.qrRequireAccept ? 'pending_accept' : 'accepted';
  return 'accepted';
}

export const PAYMENT_STATUSES = ['unpaid', 'pending_verification', 'paid'] as const;
export const PaymentStatus = z.enum(PAYMENT_STATUSES);
export type PaymentStatus = z.infer<typeof PaymentStatus>;

export const PAYMENT_METHODS = ['cash', 'aba', 'platform'] as const;
export const PaymentMethod = z.enum(PAYMENT_METHODS);
export type PaymentMethod = z.infer<typeof PaymentMethod>;

/** Metode bayar yang bisa dipilih pelanggan online. */
export const PUBLIC_PAYMENT_METHODS = ['cash', 'aba'] as const;
export const PublicPaymentMethod = z.enum(PUBLIC_PAYMENT_METHODS);
export type PublicPaymentMethod = z.infer<typeof PublicPaymentMethod>;

export const TABLE_SESSION_STATUSES = ['open', 'bill_requested', 'paid'] as const;
export const TableSessionStatus = z.enum(TABLE_SESSION_STATUSES);
export type TableSessionStatus = z.infer<typeof TableSessionStatus>;

/** Status meja di denah kasir. */
export const TABLE_STATUSES = ['empty', 'eating', 'bill_requested', 'qr_new'] as const;
export const TableStatus = z.enum(TABLE_STATUSES);
export type TableStatus = z.infer<typeof TableStatus>;

export const EXPENSE_SOURCES = ['cash', 'aba'] as const;
export const ExpenseSource = z.enum(EXPENSE_SOURCES);
export type ExpenseSource = z.infer<typeof ExpenseSource>;

export const PROMO_KINDS = ['pct', 'amount'] as const;
export const PromoKind = z.enum(PROMO_KINDS);
export type PromoKind = z.infer<typeof PromoKind>;

export const TEXT_SIZES = ['normal', 'large', 'xlarge'] as const;
export const TextSize = z.enum(TEXT_SIZES);
export type TextSize = z.infer<typeof TextSize>;

/** Mode order-web. */
export const CUSTOMER_MODES = ['telegram', 'table', 'none'] as const;
export const CustomerMode = z.enum(CUSTOMER_MODES);
export type CustomerMode = z.infer<typeof CustomerMode>;

/** Kode error standar di `{ error: { code, message } }`. */
export const ERROR_CODES = [
  'BAD_REQUEST',
  'VALIDATION_ERROR',
  'UNAUTHORIZED',
  'FORBIDDEN',
  'NOT_FOUND',
  'CONFLICT',
  'RATE_LIMITED',
  'PIN_INVALID',
  'PIN_LOCKED',
  'ADMIN_PIN_REQUIRED',
  'INVALID_TRANSITION',
  'SHIFT_NOT_OPEN',
  'SHIFT_ALREADY_OPEN',
  'SHIFT_CLOSED',
  'OPTION_INVALID',
  'ITEM_UNAVAILABLE',
  'MIN_ORDER',
  'STORE_CLOSED',
  'ORDER_LOCKED',
  'PAYMENT_INSUFFICIENT',
  'PROOF_REQUIRED',
  'ALREADY_TAKEN',
  'TABLE_OCCUPIED',
  'TELEGRAM_AUTH_FAILED',
  'CLOSING_NOTE_REQUIRED',
  'FILE_TOO_LARGE',
  'UNSUPPORTED_FILE',
  'INTEGRATION_DISABLED',
  'INTERNAL_ERROR',
] as const;
export const ErrorCode = z.enum(ERROR_CODES);
export type ErrorCode = z.infer<typeof ErrorCode>;

/** Batas PIN: 5x salah → terkunci 5 menit. */
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCK_MINUTES = 5;
/** Batas umur initData Telegram (detik). */
export const TELEGRAM_INITDATA_MAX_AGE_SEC = 24 * 60 * 60;
/** Ukuran upload maksimum (byte). */
export const MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
/** Pecahan uang cepat KHR di layar bayar. */
export const KHR_QUICK_CASH = [50_000, 100_000, 200_000, 500_000] as const;
/** Pecahan untuk hitung kas (closing/buka shift), satuan minor. */
export const DENOMINATIONS: Record<Currency, readonly number[]> = {
  KHR: [100, 500, 1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000, 200_000],
  USD: [100, 500, 1_000, 2_000, 5_000, 10_000],
  IDR: [1_000, 2_000, 5_000, 10_000, 20_000, 50_000, 100_000],
};
export const BUSINESS_TIMEZONE = 'Asia/Phnom_Penh';
