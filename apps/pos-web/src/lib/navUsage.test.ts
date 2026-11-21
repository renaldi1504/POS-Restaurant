/** Navigation bar adaptif (SKILL §8): kandidat per permission, default peran, skor + peluruhan, pin, urutan. */
import { describe, expect, it } from 'vitest';
import type { PermissionKey } from '@pos/shared';
import {
  MAX_PINS,
  MIN_NAVIGATIONS,
  allowedEntries,
  computeSlots,
  decayedScore,
  emptyUsage,
  entryFor,
  isFocusedFlow,
  loadUsage,
  navVisible,
  recordNavigation,
  roleDefaults,
  saveUsage,
  storageKey,
  togglePin,
  withCurrent,
  type NavUsageState,
} from './navUsage';

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 10, 21, 5);
const KASIR: PermissionKey[] = [
  'order.create',
  'payment.create',
  'order.accept',
  'kitchen.view',
  'menu.toggle_available',
  'shift.manage',
];
const DAPUR: PermissionKey[] = ['kitchen.view', 'kitchen.update', 'menu.toggle_available'];
const DRIVER: PermissionKey[] = ['driver.deliver'];
const OWNER: PermissionKey[] = [
  ...KASIR,
  'kitchen.update',
  'order.cancel_paid',
  'menu.manage',
  'reports.view',
  'settings.manage',
  'users.manage',
  'tables.manage',
  'driver.deliver',
];

/** Catat `n` navigasi ke `path`. */
function visit(state: NavUsageState, path: string, n: number, at = NOW): NavUsageState {
  let s = state;
  for (let i = 0; i < n; i++) s = recordNavigation(s, path, at);
  return s;
}

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => m.get(k) ?? null,
    setItem: (k: string, v: string) => void m.set(k, v),
    raw: m,
  };
}

describe('kandidat & default peran', () => {
  it('hanya tujuan yang diizinkan permission', () => {
    expect(allowedEntries(DAPUR).map((e) => e.to)).toEqual(['/dapur', '/printer']);
    expect(allowedEntries(DRIVER).map((e) => e.to)).toEqual(['/driver', '/printer']);
    const kasir = allowedEntries(KASIR).map((e) => e.to);
    expect(kasir).toContain('/kasir/closing');
    expect(kasir.some((p) => p.startsWith('/admin'))).toBe(false);
    expect(allowedEntries(OWNER).map((e) => e.to)).toContain('/admin/settings');
  });

  it('default per peran (dari permission)', () => {
    expect(roleDefaults(KASIR)).toEqual(['/kasir', '/kasir/meja', '/kasir/online', '/kasir/riwayat']);
    expect(roleDefaults(OWNER)).toEqual(['/kasir', '/kasir/online', '/admin', '/admin/menu']);
    expect(roleDefaults(DAPUR)).toEqual(['/dapur', '/printer']);
    expect(roleDefaults(DRIVER)).toEqual(['/driver']);
  });

  it('sebelum 10 navigasi: default peran, sisa diisi urutan menu', () => {
    const s = visit(emptyUsage(), '/kasir/closing', MIN_NAVIGATIONS - 1);
    expect(computeSlots(s, KASIR, NOW)).toEqual(['/kasir', '/kasir/meja', '/kasir/online', '/kasir/riwayat']);
    expect(computeSlots(emptyUsage(), DAPUR, NOW)).toEqual(['/dapur', '/printer']);
    expect(computeSlots(emptyUsage(), DRIVER, NOW)).toEqual(['/driver', '/printer']);
  });
});

describe('pemakaian & skor', () => {
  it('mencatat hanya tujuan utama (count, lastUsed, total)', () => {
    let s = recordNavigation(emptyUsage(), '/kasir/meja/3', NOW);
    expect(s.total).toBe(0);
    s = recordNavigation(s, '/kasir/meja', NOW);
    s = recordNavigation(s, '/kasir/meja/', NOW + 5);
    expect(s.usage['/kasir/meja']).toEqual({ count: 2, lastUsed: NOW + 5 });
    expect(s.total).toBe(2);
    expect(entryFor('/admin/menu/12')).toBeNull();
  });

  it('peluruhan: dibagi dua tiap 14 hari sejak terakhir dipakai', () => {
    expect(decayedScore({ count: 8, lastUsed: NOW }, NOW)).toBe(8);
    expect(decayedScore({ count: 8, lastUsed: NOW - 13 * DAY }, NOW)).toBe(8);
    expect(decayedScore({ count: 8, lastUsed: NOW - 14 * DAY }, NOW)).toBe(4);
    expect(decayedScore({ count: 8, lastUsed: NOW - 29 * DAY }, NOW)).toBe(2);
    expect(decayedScore(undefined, NOW)).toBe(0);
  });

  it('≥ 10 navigasi: urut skor tertinggi, kebiasaan lama meluruh', () => {
    let s = visit(emptyUsage(), '/kasir/pengeluaran', 6);
    s = visit(s, '/kasir/riwayat', 4);
    s = visit(s, '/kasir', 3);
    // Online sering dipakai tapi sudah 30 hari lalu → skor 12 / 4 = 3 (kalah dari Kasir yang baru).
    s = visit(s, '/kasir/online', 12, NOW - 30 * DAY);
    s = { ...s, usage: { ...s.usage, '/kasir': { count: 3, lastUsed: NOW } } };
    const slots = computeSlots(s, KASIR, NOW);
    expect(slots.slice(0, 3)).toEqual(['/kasir/pengeluaran', '/kasir/riwayat', '/kasir']);
    expect(slots).toHaveLength(4);
    expect(slots[3]).toBe('/kasir/online');
  });

  it('tidak pernah menampilkan rute terlarang (mis. data lama / pin role lain)', () => {
    let s = visit(emptyUsage(), '/admin/settings', 20);
    s = { ...s, pins: ['/admin/pengguna'] };
    const slots = computeSlots(s, DAPUR, NOW);
    expect(slots).toEqual(['/dapur', '/printer']);
  });
});

describe('pin, slot aktif, visibilitas', () => {
  it('pin selalu di depan, maks 4', () => {
    let s = emptyUsage();
    for (const p of ['/kasir/closing', '/printer', '/kasir/pengeluaran', '/dapur']) s = togglePin(s, p).state;
    expect(s.pins).toHaveLength(MAX_PINS);
    const full = togglePin(s, '/kasir');
    expect(full.full).toBe(true);
    expect(full.state).toBe(s);
    expect(computeSlots(s, KASIR, NOW)).toEqual([
      '/kasir/closing',
      '/printer',
      '/kasir/pengeluaran',
      '/dapur',
    ]);
    // Lepas pin → slot kembali diisi default.
    s = togglePin(s, '/dapur').state;
    expect(computeSlots(s, KASIR, NOW)).toEqual([
      '/kasir/closing',
      '/printer',
      '/kasir/pengeluaran',
      '/kasir',
    ]);
  });

  it('rute aktif di luar 4 besar sementara mengisi slot ke-4; urutan lain tetap', () => {
    const slots = ['/kasir', '/kasir/meja', '/kasir/online', '/kasir/riwayat'];
    expect(withCurrent(slots, '/kasir/pengeluaran', KASIR)).toEqual([
      '/kasir',
      '/kasir/meja',
      '/kasir/online',
      '/kasir/pengeluaran',
    ]);
    expect(withCurrent(slots, '/kasir/meja', KASIR)).toBe(slots);
    expect(withCurrent(slots, '/admin/settings', KASIR)).toBe(slots);
    expect(withCurrent(['/dapur'], '/printer', DAPUR)).toEqual(['/dapur', '/printer']);
  });

  it('disembunyikan di alur fokus, layar detail, dan bila hanya 1 tujuan', () => {
    for (const p of ['/login', '/shift/buka', '/kasir/bayar/abc', '/kasir/bayar', '/kasir/closing'])
      expect(isFocusedFlow(p)).toBe(true);
    expect(navVisible('/kasir', KASIR)).toBe(true);
    expect(navVisible('/kasir/closing', KASIR)).toBe(false);
    expect(navVisible('/kasir/meja/3', KASIR)).toBe(false);
    expect(navVisible('/admin/menu', KASIR)).toBe(false);
    expect(navVisible('/dapur', DAPUR)).toBe(true);
    expect(navVisible('/driver', ['driver.deliver'])).toBe(true);
    expect(navVisible('/printer', [])).toBe(false); // hanya 1 tujuan
  });
});

describe('penyimpanan per user', () => {
  it('simpan & baca ulang di pos.navUsage.<userId>', () => {
    const st = memoryStorage();
    const s = togglePin(visit(emptyUsage(), '/kasir', 3), '/printer').state;
    saveUsage(7, s, st);
    expect([...st.raw.keys()]).toEqual([storageKey(7)]);
    expect(storageKey(7)).toBe('pos.navUsage.7');
    expect(loadUsage(7, st)).toEqual(s);
    expect(loadUsage(8, st)).toEqual(emptyUsage());
  });

  it('data rusak / storage error → kosong, tanpa crash', () => {
    const st = memoryStorage();
    st.setItem(storageKey(1), '{bukan json');
    expect(loadUsage(1, st)).toEqual(emptyUsage());
    st.setItem(storageKey(2), JSON.stringify({ usage: { '/kasir': { count: 'x' } }, pins: [1, '/kasir'] }));
    expect(loadUsage(2, st)).toEqual({ usage: {}, pins: ['/kasir'], total: 0 });
    const broken = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
    };
    expect(loadUsage(3, broken)).toEqual(emptyUsage());
    expect(() => saveUsage(3, emptyUsage(), broken)).not.toThrow();
  });
});
