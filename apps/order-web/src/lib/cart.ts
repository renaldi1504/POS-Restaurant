/**
 * Keranjang (localStorage, per mode). Harga di sini hanya tampilan — server menghitung ulang.
 *   const cart = useCart();  cart.add({ itemId, qty: 1, optionIds, note });
 */
import { useSyncExternalStore } from 'react';
import type { OrderItemInput } from '@pos/shared';

export interface CartLine extends Required<Pick<OrderItemInput, 'itemId' | 'qty'>> {
  /** Kunci unik baris (item + opsi + catatan). */
  key: string;
  optionIds: number[];
  note?: string;
}

const KEY = 'order.cart';
let lines: CartLine[] = load();
const listeners = new Set<() => void>();

function load(): CartLine[] {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '[]') as CartLine[];
  } catch {
    return [];
  }
}
function save(next: CartLine[]) {
  lines = next;
  localStorage.setItem(KEY, JSON.stringify(next));
  listeners.forEach((l) => l());
}
export function lineKey(itemId: number, optionIds: number[], note?: string): string {
  return `${itemId}|${[...optionIds].sort((a, b) => a - b).join(',')}|${note ?? ''}`;
}

export const cartStore = {
  get: () => lines,
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => listeners.delete(cb);
  },
  add(input: { itemId: number; qty: number; optionIds?: number[]; note?: string }) {
    const optionIds = input.optionIds ?? [];
    const key = lineKey(input.itemId, optionIds, input.note);
    const found = lines.find((l) => l.key === key);
    save(
      found
        ? lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + input.qty) } : l))
        : [...lines, { key, itemId: input.itemId, qty: input.qty, optionIds, note: input.note }],
    );
  },
  setQty(key: string, qty: number) {
    save(
      qty <= 0 ? lines.filter((l) => l.key !== key) : lines.map((l) => (l.key === key ? { ...l, qty } : l)),
    );
  },
  clear() {
    save([]);
  },
  /** Bentuk siap kirim ke `POST /public/orders`. */
  toOrderItems(): OrderItemInput[] {
    return lines.map(({ itemId, qty, optionIds, note }) => ({ itemId, qty, optionIds, note }));
  },
};

export function useCart() {
  const current = useSyncExternalStore(cartStore.subscribe, cartStore.get, cartStore.get);
  return { lines: current, count: current.reduce((a, l) => a + l.qty, 0), ...cartStore };
}
