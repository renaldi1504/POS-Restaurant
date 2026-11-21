/**
 * Data checkout sementara (tipe pesanan, alamat, kontak, metode bayar) — sessionStorage.
 */
import { useSyncExternalStore } from 'react';
import type { OrderType, PublicPaymentMethod } from '@pos/shared';
import { readJson, writeJson } from './storage';

export interface AddressDraft {
  text: string;
  landmark: string;
  lat: number | null;
  lng: number | null;
  label: string;
  /** Id alamat tersimpan (mode Telegram) yang sedang dipakai. */
  addressId: number | null;
}

export interface CheckoutState {
  type: OrderType;
  note: string;
  name: string;
  phone: string;
  payment: PublicPaymentMethod;
  address: AddressDraft;
}

const KEY = 'order.checkout';
export const EMPTY_ADDRESS: AddressDraft = {
  text: '',
  landmark: '',
  lat: null,
  lng: null,
  label: 'Rumah',
  addressId: null,
};
const INITIAL: CheckoutState = {
  type: 'delivery',
  note: '',
  name: '',
  phone: '',
  payment: 'cash',
  address: EMPTY_ADDRESS,
};

function load(): CheckoutState {
  const raw = readJson<Partial<CheckoutState>>('session', KEY, {});
  return { ...INITIAL, ...raw, address: { ...EMPTY_ADDRESS, ...(raw.address ?? {}) } };
}

let state = load();
const listeners = new Set<() => void>();

export const checkoutStore = {
  get: () => state,
  subscribe(cb: () => void) {
    listeners.add(cb);
    return () => {
      listeners.delete(cb);
    };
  },
  update(patch: Partial<CheckoutState>) {
    state = { ...state, ...patch };
    writeJson('session', KEY, state);
    listeners.forEach((l) => l());
  },
  updateAddress(patch: Partial<AddressDraft>) {
    checkoutStore.update({ address: { ...state.address, ...patch } });
  },
  /** Setelah order terkirim: kosongkan catatan, simpan nama/HP/alamat untuk order berikutnya. */
  afterOrder() {
    checkoutStore.update({ note: '' });
  },
  reset() {
    state = { ...INITIAL, address: { ...EMPTY_ADDRESS } };
    writeJson('session', KEY, state);
    listeners.forEach((l) => l());
  },
};

export function useCheckout() {
  const s = useSyncExternalStore(checkoutStore.subscribe, checkoutStore.get, checkoutStore.get);
  return { state: s, ...checkoutStore };
}
