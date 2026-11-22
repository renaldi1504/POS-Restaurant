/**
 * Deteksi versi baru setelah server di-update (aplikasi yang lama dibiarkan terbuka).
 * - Cek /version.json saat aplikasi kembali dibuka/difokuskan dan tiap 5 menit.
 * - Bila beda: perbarui service worker lalu muat ulang otomatis kalau aman (tidak sedang mengetik
 *   / di layar bayar & closing); kalau tidak, tampilkan banner "Versi baru".
 * - Respons server tidak sesuai (INVALID_RESPONSE) → cek versi saat itu juga dan muat ulang.
 * Keranjang pelanggan tersimpan di penyimpanan lokal, jadi aman saat dimuat ulang.
 */
import { useSyncExternalStore } from 'react';

const CURRENT = typeof __APP_BUILD__ !== 'undefined' ? __APP_BUILD__ : 'dev';
let available = false;
let checking: Promise<boolean> | null = null;
let lastCheck = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Layar yang tidak boleh dimuat ulang tiba-tiba (sedang input uang / closing). */
const BUSY_PATHS = [/\/checkout/, /\/alamat/];

export function isSafeToReload(path = location.pathname): boolean {
  const el = document.activeElement;
  const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT');
  return !typing && !BUSY_PATHS.some((r) => r.test(path));
}

export async function fetchLatestBuild(fetchFn: typeof fetch = fetch): Promise<string | null> {
  try {
    const res = await fetchFn(`/version.json?ts=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) return null;
    const body = (await res.json()) as { build?: string };
    return typeof body.build === 'string' ? body.build : null;
  } catch {
    return null;
  }
}

export async function applyUpdate(): Promise<void> {
  try {
    const reg = await navigator.serviceWorker?.getRegistration();
    await reg?.update();
  } catch {
    /* abaikan */
  }
  location.reload();
}

/** true bila ada versi baru. `force` = muat ulang walau sedang sibuk (dipakai saat respons rusak). */
export function checkForUpdate(opts: { force?: boolean; minIntervalMs?: number } = {}): Promise<boolean> {
  if (CURRENT === 'dev') return Promise.resolve(false);
  if (checking) return checking;
  if (Date.now() - lastCheck < (opts.minIntervalMs ?? 0)) return Promise.resolve(available);
  checking = (async () => {
    lastCheck = Date.now();
    const latest = await fetchLatestBuild();
    const newer = !!latest && latest !== CURRENT;
    if (newer && !available) {
      available = true;
      emit();
    }
    if (newer && (opts.force || isSafeToReload())) await applyUpdate();
    return newer;
  })().finally(() => {
    checking = null;
  });
  return checking;
}

export function useUpdateAvailable(): boolean {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => available,
    () => false,
  );
}

let started = false;
/** Pasang pemeriksa versi (sekali, di root aplikasi). */
export function startUpdateWatcher(): void {
  if (started || typeof window === 'undefined') return;
  started = true;
  const check = () => void checkForUpdate({ minIntervalMs: 30_000 });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') check();
  });
  window.addEventListener('focus', check);
  window.addEventListener('online', check);
  setInterval(check, 5 * 60_000);
}
