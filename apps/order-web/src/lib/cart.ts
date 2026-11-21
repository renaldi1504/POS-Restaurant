/**
 * Keranjang (sessionStorage, per scope: 'online' untuk website/Telegram, 'table:<token>' untuk meja).
 * Harga di sini hanya tampilan — server menghitung ulang.
 *   const cart = useCart();  cart.add({ itemId, qty: 1, optionIds, note });
 */
import { useSyncExternalStore } from 'react';
import type { OrderItemInput } from '@pos/shared';
import { readJson, writeJson } from './storage';

export interface CartLine {
  /** Kunci unik baris (item + opsi + catatan). */
  key: string;
  itemId: number;
  qty: number;
  optionIds: number[];
  note?: string;
}

export interface CartInput {
  itemId: number;
  qty: number;
  optionIds?: number[];
  note?: string;
}

const PREFIX = 'order.cart.';
let scope = 'online';
let lines: CartLine[] = load();
const listeners = new Set<() => void>();

function isLine(x: unknown): x is CartLine {
  const l = x as CartLine;
  return (
    !!l &&
    typeof l.key === 'string' &&
    typeof l.itemId === 'number' &&
    typeof l.qty === 'number' &&
    Array.isArray(l.optionIds)
  );
}

function load(): CartLine[] {
  const raw = readJson<unknown>('session', PREFIX + scope, []);
  return Array.isArray(raw) ? raw.filter(isLine) : [];
}
function emit() {
  listeners.forEach((l) => l());
}
function save(next: CartLine[]) {
  lines = next;
  writeJson('session', PREFIX + scope, next);
  emit();
}
const clampQty = (n: number) => Math.max(0, Math.min(99, Math.floor(n)));

export function lineKey(itemId: number, optionIds: number[], note?: string): string {
  return `${itemId}|${[...optionIds].sort((a, b) => a - b).join(',')}|${note?.trim() ?? ''}`;
}

function merge(base: CartLine[], input: CartInput): CartLine[] {
  const optionIds = [...(input.optionIds ?? [])];
  const note = input.note?.trim() || undefined;
  const key = lineKey(input.itemId, optionIds, note);
  const found = base.find((l) => l.key === key);
  if (found) return base.map((l) => (l.key === key ? { ...l, qty: clampQty(l.qty + input.qty) } : l));
  return [...base, { key, itemId: input.itemId, qty: clampQty(input.qty), optionIds, note }];
}

export const cartStore = {
  get: () => lines,
  scope: () => scope,
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  /** Ganti keranjang aktif (mode meja punya keranjang sendiri). */
  setScope(next: string) {
    if (next === scope) return;
    scope = next;
    lines = load();
    emit();
  },
  /** Muat ulang dari storage (dipakai test). */
  reload() {
    lines = load();
    emit();
  },
  add(input: CartInput) {
    if (input.qty <= 0) return;
    save(merge(lines, input));
  },
  /** Ganti satu baris (edit opsi/catatan/jumlah). */
  replace(key: string, input: CartInput) {
    const idx = lines.findIndex((l) => l.key === key);
    const without = lines.filter((l) => l.key !== key);
    const merged = merge(without, input);
    // pertahankan posisi baris yang diedit
    if (idx >= 0 && merged.length === without.length + 1) {
      const last = merged[merged.length - 1]!;
      merged.splice(merged.length - 1, 1);
      merged.splice(idx, 0, last);
    }
    save(merged);
  },
  setQty(key: string, qty: number) {
    const q = clampQty(qty);
    save(
      q <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, qty: q } : l)),
    );
  },
  remove(key: string) {
    save(lines.filter((l) => l.key !== key));
  },
  /** Kurangi 1 dari baris terakhir milik item (stepper di kartu menu). */
  decItem(itemId: number) {
    const last = [...lines].reverse().find((l) => l.itemId === itemId);
    if (last) cartStore.setQty(last.key, last.qty - 1);
  },
  qtyOfItem(itemId: number): number {
    return lines.reduce((a, l) => (l.itemId === itemId ? a + l.qty : a), 0);
  },
  clear() {
    save([]);
  },
  /** Bentuk siap kirim ke `POST /public/orders`. */
  toOrderItems(): OrderItemInput[] {
    return lines.map(({ itemId, qty, optionIds, note }) =>
      note ? { itemId, qty, optionIds, note } : { itemId, qty, optionIds },
    );
  },
};

export function useCart() {
  const current = useSyncExternalStore(cartStore.subscribe, cartStore.get, cartStore.get);
  return { lines: current, count: current.reduce((a, l) => a + l.qty, 0), ...cartStore };
}
