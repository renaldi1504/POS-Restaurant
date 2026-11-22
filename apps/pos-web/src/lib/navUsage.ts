/**
 * Navigation bar adaptif — "fitur yang sering dipakai" (SKILL §8). Logika murni (tanpa React) supaya mudah dites.
 *
 * - Kandidat = MENU_ENTRIES yang diizinkan permission user (rute terlarang tidak pernah tampil).
 * - Pemakaian dicatat per user di localStorage `pos.navUsage.<userId>`: count + lastUsed per tujuan.
 *   Skor = count dengan peluruhan: dibagi dua untuk setiap 14 hari sejak terakhir dipakai (kebiasaan bisa berubah).
 * - 4 slot + "Lainnya". Sebelum 10 navigasi: default per peran. Disematkan (maks 4) selalu di depan.
 * - Urutan stabil: dihitung sekali per login / start aplikasi (lapisan React menyimpan hasilnya); rute aktif yang
 *   tidak masuk 4 besar sementara mengisi slot ke-4.
 */
import { hasAnyPermission, type PermissionKey } from '@pos/shared';
import type { IconName } from '@pos/shared/icons';

export interface NavEntry {
  to: string;
  /** Label lengkap (kunci i18n) — juga untuk aria-label. */
  key: string;
  /** Label pendek untuk bar bawah (kunci i18n). */
  short: string;
  icon: IconName;
  /** Salah satu permission ini wajib; kosong = semua staf. */
  any: PermissionKey[];
}

export const MENU_ENTRIES: NavEntry[] = [
  {
    to: '/kasir',
    key: 'nav.cashier',
    short: 'bnav.short.cashier',
    icon: 'point_of_sale',
    any: ['order.create'],
  },
  {
    to: '/kasir/meja',
    key: 'nav.tables',
    short: 'bnav.short.tables',
    icon: 'table_restaurant',
    any: ['order.create'],
  },
  {
    to: '/kasir/online',
    key: 'nav.online',
    short: 'bnav.short.online',
    icon: 'notifications_active',
    any: ['order.accept'],
  },
  {
    to: '/kasir/riwayat',
    key: 'nav.history',
    short: 'bnav.short.history',
    icon: 'history',
    any: ['order.create', 'order.accept'],
  },
  {
    to: '/kasir/pengeluaran',
    key: 'nav.expenses',
    short: 'bnav.short.expenses',
    icon: 'payments',
    any: ['shift.manage'],
  },
  {
    to: '/kasir/closing',
    key: 'nav.closing',
    short: 'bnav.short.closing',
    icon: 'account_balance_wallet',
    any: ['shift.manage'],
  },
  { to: '/dapur', key: 'nav.kitchen', short: 'bnav.short.kitchen', icon: 'skillet', any: ['kitchen.view'] },
  {
    to: '/driver',
    key: 'nav.driver',
    short: 'bnav.short.driver',
    icon: 'two_wheeler',
    any: ['driver.deliver'],
  },
  {
    to: '/admin',
    key: 'nav.dashboard',
    short: 'bnav.short.dashboard',
    icon: 'bar_chart',
    any: ['reports.view'],
  },
  {
    to: '/admin/laporan',
    key: 'nav.reports',
    short: 'bnav.short.reports',
    icon: 'monitoring',
    any: ['reports.owner'],
  },
  {
    to: '/admin/menu',
    key: 'nav.menu',
    short: 'bnav.short.menu',
    icon: 'restaurant_menu',
    any: ['menu.manage'],
  },
  { to: '/admin/promo', key: 'nav.promos', short: 'bnav.short.promos', icon: 'sell', any: ['menu.manage'] },
  {
    to: '/admin/meja',
    key: 'nav.tablesQr',
    short: 'bnav.short.tablesQr',
    icon: 'qr_code_2',
    any: ['tables.manage'],
  },
  {
    to: '/admin/pengguna',
    key: 'nav.users',
    short: 'bnav.short.users',
    icon: 'group',
    any: ['users.manage'],
  },
  {
    to: '/admin/settings',
    key: 'nav.settings',
    short: 'bnav.short.settings',
    icon: 'settings',
    any: ['settings.manage'],
  },
  { to: '/printer', key: 'nav.printer', short: 'bnav.short.printer', icon: 'print', any: [] },
];

export const NAV_SLOTS = 4;
export const MAX_PINS = 4;
/** Di bawah jumlah navigasi ini dipakai default per peran. */
export const MIN_NAVIGATIONS = 10;
export const DECAY_DAYS = 14;
const DAY = 86_400_000;

export interface UsageRecord {
  count: number;
  lastUsed: number;
}
export interface NavUsageState {
  usage: Record<string, UsageRecord>;
  pins: string[];
  /** Total navigasi tercatat (penentu kapan default peran berhenti dipakai). */
  total: number;
}

export const emptyUsage = (): NavUsageState => ({ usage: {}, pins: [], total: 0 });
export const storageKey = (userId: number | string) => `pos.navUsage.${userId}`;

type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;
const defaultStorage = (): StorageLike | null => (typeof localStorage !== 'undefined' ? localStorage : null);

/** Baca catatan pemakaian (rusak / tidak ada → kosong). */
export function loadUsage(
  userId: number | string,
  storage: StorageLike | null = defaultStorage(),
): NavUsageState {
  try {
    const raw = storage?.getItem(storageKey(userId));
    if (!raw) return emptyUsage();
    const v = JSON.parse(raw) as Partial<NavUsageState>;
    const usage: Record<string, UsageRecord> = {};
    for (const [k, r] of Object.entries(v.usage ?? {}))
      if (r && Number.isFinite(r.count) && Number.isFinite(r.lastUsed))
        usage[k] = { count: Math.max(0, r.count), lastUsed: r.lastUsed };
    const pins = Array.isArray(v.pins) ? v.pins.filter((p): p is string => typeof p === 'string') : [];
    return {
      usage,
      pins: [...new Set(pins)].slice(0, MAX_PINS),
      total: Number.isFinite(v.total) ? v.total! : 0,
    };
  } catch {
    return emptyUsage();
  }
}

export function saveUsage(
  userId: number | string,
  state: NavUsageState,
  storage: StorageLike | null = defaultStorage(),
): void {
  try {
    storage?.setItem(storageKey(userId), JSON.stringify(state));
  } catch {
    /* penyimpanan penuh / mode privat — navigasi tetap jalan dengan default */
  }
}

/** Tujuan utama untuk sebuah path (cocok persis), atau null untuk layar detail. */
export function entryFor(pathname: string): NavEntry | null {
  const p = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
  return MENU_ENTRIES.find((e) => e.to === p) ?? null;
}

/** Catat satu navigasi ke tujuan utama (path lain diabaikan). */
export function recordNavigation(state: NavUsageState, pathname: string, now = Date.now()): NavUsageState {
  const e = entryFor(pathname);
  if (!e) return state;
  const prev = state.usage[e.to];
  return {
    ...state,
    usage: { ...state.usage, [e.to]: { count: (prev?.count ?? 0) + 1, lastUsed: now } },
    total: state.total + 1,
  };
}

/** Skor dengan peluruhan: count / 2 untuk setiap 14 hari penuh sejak terakhir dipakai. */
export function decayedScore(rec: UsageRecord | undefined, now = Date.now()): number {
  if (!rec || rec.count <= 0) return 0;
  const periods = Math.floor(Math.max(0, now - rec.lastUsed) / (DECAY_DAYS * DAY));
  return rec.count / 2 ** periods;
}

export function allowedEntries(perms: readonly PermissionKey[] | undefined): NavEntry[] {
  return MENU_ENTRIES.filter((e) => !e.any.length || hasAnyPermission(perms, e.any));
}

/** Default per peran (dari permission, karena role bisa diganti nama/ditambah admin). */
export function roleDefaults(perms: readonly PermissionKey[] | undefined): string[] {
  const has = (p: PermissionKey) => !!perms?.includes(p);
  if (has('reports.view') || has('settings.manage'))
    return ['/kasir', '/kasir/online', '/admin', '/admin/menu'];
  if (has('order.create')) return ['/kasir', '/kasir/meja', '/kasir/online', '/kasir/riwayat'];
  if (has('kitchen.view')) return ['/dapur', '/printer'];
  if (has('driver.deliver')) return ['/driver'];
  return [];
}

/**
 * Hitung 4 slot (path) untuk user: disematkan dulu, lalu (≥10 navigasi) skor tertinggi atau (awal) default peran,
 * lalu sisa tujuan sesuai urutan menu. Hanya tujuan yang diizinkan.
 */
export function computeSlots(
  state: NavUsageState,
  perms: readonly PermissionKey[] | undefined,
  now = Date.now(),
): string[] {
  const allowed = allowedEntries(perms);
  const ok = new Set(allowed.map((e) => e.to));
  const out: string[] = [];
  const push = (p: string) => {
    if (out.length < NAV_SLOTS && ok.has(p) && !out.includes(p)) out.push(p);
  };
  state.pins.slice(0, MAX_PINS).forEach(push);
  if (state.total >= MIN_NAVIGATIONS) {
    const order = new Map(allowed.map((e, i) => [e.to, i]));
    allowed
      .map((e) => ({
        to: e.to,
        score: decayedScore(state.usage[e.to], now),
        last: state.usage[e.to]?.lastUsed ?? 0,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || b.last - a.last || order.get(a.to)! - order.get(b.to)!)
      .forEach((x) => push(x.to));
  }
  roleDefaults(perms).forEach(push);
  allowed.forEach((e) => push(e.to));
  return out;
}

/** Rute aktif yang tidak termasuk slot sementara menggantikan slot ke-4 (urutan lain tidak berubah). */
export function withCurrent(
  slots: string[],
  pathname: string,
  perms: readonly PermissionKey[] | undefined,
): string[] {
  const e = entryFor(pathname);
  if (!e || slots.includes(e.to) || !allowedEntries(perms).some((a) => a.to === e.to)) return slots;
  if (slots.length < NAV_SLOTS) return [...slots, e.to];
  return [...slots.slice(0, NAV_SLOTS - 1), e.to];
}

/** Sematkan / lepas. Penuh (4) → tidak berubah, `full: true`. */
export function togglePin(state: NavUsageState, path: string): { state: NavUsageState; full: boolean } {
  if (state.pins.includes(path))
    return { state: { ...state, pins: state.pins.filter((p) => p !== path) }, full: false };
  if (state.pins.length >= MAX_PINS) return { state, full: true };
  return { state: { ...state, pins: [...state.pins, path] }, full: false };
}

/** Alur fokus: bar disembunyikan supaya tidak salah ketuk (bayar, closing, buka shift, login). */
export function isFocusedFlow(pathname: string): boolean {
  return (
    pathname === '/login' ||
    pathname === '/' ||
    pathname.startsWith('/shift/buka') ||
    pathname.startsWith('/kasir/bayar') ||
    pathname.startsWith('/kasir/closing')
  );
}

/**
 * Bar tampil di layar tujuan utama yang diizinkan, bukan alur fokus, dan hanya bila user punya > 1 tujuan
 * (layar dapur/driver dengan satu tujuan tetap layar penuh).
 */
export function navVisible(pathname: string, perms: readonly PermissionKey[] | undefined): boolean {
  if (isFocusedFlow(pathname)) return false;
  const e = entryFor(pathname);
  if (!e) return false;
  const allowed = allowedEntries(perms);
  return allowed.length > 1 && allowed.some((a) => a.to === e.to);
}
