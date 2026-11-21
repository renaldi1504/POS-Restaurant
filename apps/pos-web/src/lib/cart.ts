/**
 * Keranjang kasir (store modul + sessionStorage) dan perhitungan total di klien.
 * Server SELALU menghitung ulang harga; angka di sini hanya untuk tampilan.
 */
import { useSyncExternalStore } from 'react';
import {
  percentOf,
  priceChannelFor,
  type ManualDiscount,
  type MenuItemDto,
  type OptionGroupDto,
  type OrderChannel,
  type OrderDto,
  type OrderType,
  type StaffMenuResponse,
  type StaffOrderChannel,
} from '@pos/shared';

/** Tipe order di layar Pesanan (gabungan tipe + channel). */
export const CART_KINDS = ['dine_in', 'takeaway', 'delivery', 'grab', 'foodpanda', 'telegram'] as const;
export type CartKind = (typeof CART_KINDS)[number];

export function kindToChannelType(kind: CartKind): { channel: StaffOrderChannel; type: OrderType } {
  switch (kind) {
    case 'dine_in':
      return { channel: 'kasir', type: 'dine_in' };
    case 'takeaway':
      return { channel: 'kasir', type: 'takeaway' };
    case 'delivery':
      return { channel: 'kasir', type: 'delivery' };
    case 'telegram':
      // Order dari chat Telegram yang diketik kasir: channel telegram, selalu delivery.
      return { channel: 'telegram', type: 'delivery' };
    case 'grab':
      return { channel: 'grab', type: 'takeaway' };
    case 'foodpanda':
      return { channel: 'foodpanda', type: 'takeaway' };
  }
}

export function kindFromOrder(o: Pick<OrderDto, 'channel' | 'type'>): CartKind {
  if (o.channel === 'grab') return 'grab';
  if (o.channel === 'foodpanda') return 'foodpanda';
  if (o.channel === 'telegram') return 'telegram';
  return o.type;
}

export const isDeliveryKind = (k: CartKind) => k === 'delivery' || k === 'telegram';
export const isPlatformKind = (k: CartKind) => k === 'grab' || k === 'foodpanda';

export interface CartLine {
  key: string;
  itemId: number;
  qty: number;
  optionIds: number[];
  note?: string;
}

export interface DeliveryDraft {
  name: string;
  phone: string;
  addressText: string;
  landmark: string;
}

export interface CartState {
  lines: CartLine[];
  kind: CartKind;
  tableId: number | null;
  displayNo: string;
  deliveryFee: number;
  discount: ManualDiscount | null;
  promoId: number | null;
  note: string;
  customerName: string;
  /** No. HP pelanggan bungkus (opsional). */
  customerPhone: string;
  delivery: DeliveryDraft;
  /** Delivery: driver menagih cash saat antar (order dikirim ke dapur tanpa dibayar dulu). */
  payOnDelivery: boolean;
  /** Mengubah order yang sudah ada (PATCH) — null = order baru. */
  editingOrderId: string | null;
  editingDisplayNo: string | null;
}

export const EMPTY_DELIVERY: DeliveryDraft = { name: '', phone: '', addressText: '', landmark: '' };

export function emptyCart(): CartState {
  return {
    lines: [],
    kind: 'takeaway',
    tableId: null,
    displayNo: '',
    deliveryFee: 0,
    discount: null,
    promoId: null,
    note: '',
    customerName: '',
    customerPhone: '',
    delivery: { ...EMPTY_DELIVERY },
    payOnDelivery: false,
    editingOrderId: null,
    editingDisplayNo: null,
  };
}

export function lineKey(itemId: number, optionIds: number[], note?: string): string {
  return `${itemId}|${[...optionIds].sort((a, b) => a - b).join(',')}|${(note ?? '').trim()}`;
}

/** Tambah baris; baris identik (menu + opsi + catatan sama) digabung. */
export function addLine(lines: CartLine[], add: Omit<CartLine, 'key'>): CartLine[] {
  const key = lineKey(add.itemId, add.optionIds, add.note);
  const hit = lines.find((l) => l.key === key);
  if (hit) return lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, l.qty + add.qty) } : l));
  return [...lines, { ...add, key, note: add.note?.trim() || undefined }];
}

export function setLineQty(lines: CartLine[], key: string, qty: number): CartLine[] {
  if (qty <= 0) return lines.filter((l) => l.key !== key);
  return lines.map((l) => (l.key === key ? { ...l, qty: Math.min(99, qty) } : l));
}

// ---------------- Perhitungan ----------------
export interface ComputedLine extends CartLine {
  item: MenuItemDto | undefined;
  /** Harga dasar per channel; null = tidak dijual di channel ini. */
  unitPrice: number | null;
  optionsDelta: number;
  lineTotal: number;
  options: {
    groupId: number;
    optionId: number;
    groupName: OptionGroupDto['name'];
    name: OptionGroupDto['name'];
    priceDelta: number;
  }[];
}

export interface CartTotals {
  lines: ComputedLine[];
  count: number;
  subtotal: number;
  discountAmount: number;
  deliveryFee: number;
  total: number;
  /** Ada item yang tidak dijual di channel/habis. */
  invalid: boolean;
}

export function priceFor(item: MenuItemDto, channel: OrderChannel): number | null {
  const v = item.prices[priceChannelFor(channel)];
  return v ?? null;
}

export function discountAmountOf(subtotal: number, discount: ManualDiscount | null): number {
  if (!discount || discount.value <= 0) return 0;
  const v =
    discount.kind === 'pct' ? percentOf(subtotal, Math.min(100, discount.value)) : Math.round(discount.value);
  return Math.max(0, Math.min(subtotal, v));
}

export function computeCart(
  state: Pick<CartState, 'lines' | 'kind' | 'discount' | 'deliveryFee'>,
  menu: Pick<StaffMenuResponse, 'items' | 'optionGroups'> | undefined,
): CartTotals {
  const { channel } = kindToChannelType(state.kind);
  const items = new Map(menu?.items.map((i) => [i.id, i]) ?? []);
  const optIndex = new Map<number, { group: OptionGroupDto; option: OptionGroupDto['options'][number] }>();
  for (const g of menu?.optionGroups ?? [])
    for (const o of g.options) optIndex.set(o.id, { group: g, option: o });

  let invalid = false;
  const lines: ComputedLine[] = state.lines.map((l) => {
    const item = items.get(l.itemId);
    const unitPrice = item ? priceFor(item, channel) : null;
    const options = l.optionIds.flatMap((id) => {
      const hit = optIndex.get(id);
      return hit
        ? [
            {
              groupId: hit.group.id,
              optionId: id,
              groupName: hit.group.name,
              name: hit.option.name,
              priceDelta: hit.option.priceDelta,
            },
          ]
        : [];
    });
    const optionsDelta = options.reduce((a, o) => a + o.priceDelta, 0);
    if (!item || unitPrice === null || !item.available) invalid = true;
    const lineTotal = ((unitPrice ?? 0) + optionsDelta) * l.qty;
    return { ...l, item, unitPrice, optionsDelta, lineTotal, options };
  });
  const subtotal = lines.reduce((a, l) => a + l.lineTotal, 0);
  const count = lines.reduce((a, l) => a + l.qty, 0);
  const discountAmount = discountAmountOf(subtotal, state.discount);
  const fee = isDeliveryKind(state.kind) ? Math.max(0, state.deliveryFee) : 0;
  return {
    lines,
    count,
    subtotal,
    discountAmount,
    deliveryFee: fee,
    total: subtotal - discountAmount + fee,
    invalid,
  };
}

/** Jumlah per menu di keranjang (badge kartu menu). */
export function qtyByItem(lines: CartLine[]): Map<number, number> {
  const m = new Map<number, number>();
  for (const l of lines) m.set(l.itemId, (m.get(l.itemId) ?? 0) + l.qty);
  return m;
}

// ---------------- Store ----------------
const KEY = 'pos.cart';
function load(): CartState {
  try {
    const raw = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem(KEY) : null;
    return raw ? { ...emptyCart(), ...(JSON.parse(raw) as Partial<CartState>) } : emptyCart();
  } catch {
    return emptyCart();
  }
}
let cart: CartState = load();
const listeners = new Set<() => void>();

export function getCart(): CartState {
  return cart;
}
export function setCart(next: Partial<CartState> | ((c: CartState) => Partial<CartState>)): void {
  const patch = typeof next === 'function' ? next(cart) : next;
  cart = { ...cart, ...patch };
  try {
    sessionStorage.setItem(KEY, JSON.stringify(cart));
  } catch {
    /* abaikan */
  }
  listeners.forEach((l) => l());
}
export function clearCart(keep?: Partial<CartState>): void {
  setCart({ ...emptyCart(), ...keep });
}
export function useCart(): CartState {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => cart,
    () => cart,
  );
}

/** Muat order yang sudah ada ke keranjang untuk diubah (sebelum dibayar). */
export function cartFromOrder(o: OrderDto): CartState {
  const lines = o.items.reduce<CartLine[]>(
    (acc, it) =>
      it.itemId
        ? addLine(acc, {
            itemId: it.itemId,
            qty: it.qty,
            optionIds: it.options.map((x) => x.optionId).filter((x): x is number => x !== null),
            note: it.note ?? undefined,
          })
        : acc,
    [],
  );
  return {
    ...emptyCart(),
    lines,
    kind: kindFromOrder(o),
    tableId: o.table?.id ?? null,
    displayNo: o.channel === 'grab' || o.channel === 'foodpanda' ? o.displayNo : '',
    deliveryFee: o.deliveryFee,
    note: o.note ?? '',
    customerName: o.customerName ?? '',
    customerPhone: !o.address ? (o.customer?.phone ?? '') : '',
    delivery: o.address
      ? {
          name: o.customerName ?? '',
          phone: o.customer?.phone ?? '',
          addressText: o.address.text,
          landmark: o.address.landmark ?? '',
        }
      : { ...EMPTY_DELIVERY },
    promoId: o.promoId,
    discount: o.discount > 0 && !o.promoId ? { kind: 'amount', value: o.discount } : null,
    editingOrderId: o.id,
    editingDisplayNo: o.displayNo,
  };
}
