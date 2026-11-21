/** Daftar order terakhir di perangkat ini (untuk tombol "Pesanan saya"). */
import { readJson, writeJson } from './storage';

const KEY = 'order.recent';
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

interface Recent {
  id: string;
  at: number;
}

export function rememberOrder(id: string): void {
  const list = readJson<Recent[]>('local', KEY, []).filter((r) => r.id !== id);
  writeJson('local', KEY, [{ id, at: Date.now() }, ...list].slice(0, 10));
}

/** Id order terbaru (≤24 jam) atau null. */
export function latestOrderId(): string | null {
  const list = readJson<Recent[]>('local', KEY, []);
  const r = Array.isArray(list) ? list.find((x) => x && Date.now() - x.at < MAX_AGE_MS) : undefined;
  return r?.id ?? null;
}
