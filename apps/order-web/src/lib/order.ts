/**
 * Kirim order (`POST /public/orders`) sesuai mode:
 * - telegram: delivery + addressId (alamat tersimpan pelanggan)
 * - table:    dine_in, masuk tagihan meja
 * - none:     delivery → contact {name, phone, addressText, landmark, lat, lng}; ambil sendiri / makan di sini → nama di catatan
 */
import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { PublicCreateOrderRequest } from '@pos/shared';
import { api, qk, uploadProof } from './api';
import { cartStore } from './cart';
import { checkoutStore, type CheckoutState } from './checkout';
import type { CustomerContextValue } from './customer';
import { currentLang } from './i18n';
import { rememberOrder } from './recent';
import { reconnectSocket } from './socket';

export function buildOrderBody(
  customer: Pick<CustomerContextValue, 'mode' | 'orderType'>,
  co: CheckoutState,
): PublicCreateOrderRequest {
  const items = cartStore.toOrderItems();
  const lang = currentLang();
  const note = co.note.trim() || undefined;
  if (customer.mode === 'table') return { type: 'dine_in', items, note, lang };
  const paymentMethod = co.payment;
  if (customer.mode === 'telegram') {
    return {
      type: 'delivery',
      items,
      note,
      paymentMethod,
      addressId: co.address.addressId ?? undefined,
      lang,
    };
  }
  const type = customer.orderType;
  if (type === 'delivery') {
    const a = co.address;
    return {
      type,
      items,
      note,
      paymentMethod,
      lang,
      contact: {
        name: co.name.trim(),
        phone: co.phone.trim() || undefined,
        addressText: a.text.trim(),
        landmark: a.landmark.trim() || undefined,
        lat: a.lat ?? undefined,
        lng: a.lng ?? undefined,
      },
    };
  }
  // Ambil sendiri: kontrak hanya punya `contact` (addressText wajib) untuk nama/HP → server memakai nama & HP saja.
  return {
    type,
    items,
    note,
    paymentMethod,
    lang,
    contact: { name: co.name.trim(), phone: co.phone.trim() || undefined, addressText: PICKUP_ADDRESS },
  };
}

/** Teks pengisi addressText untuk ambil sendiri (tidak dipakai server untuk non-delivery). */
export const PICKUP_ADDRESS = 'Ambil sendiri';

export function useSubmitOrder(customer: Pick<CustomerContextValue, 'mode' | 'orderType'>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ proof }: { proof?: File | null }) => {
      const body = buildOrderBody(customer, checkoutStore.get());
      const hadSession = customer.mode !== 'none';
      let { order } = await api.call('publicOrderCreate', { body });
      let proofError: unknown = null;
      if (proof && body.paymentMethod === 'aba') {
        try {
          order = (await uploadProof(order.id, proof, proof.name)).order;
        } catch (e) {
          proofError = e;
        }
      }
      // Website biasa: server membuat sesi tamu (cookie baru) → masuk room customer:<id>.
      if (!hadSession) reconnectSocket();
      return { order, proofError };
    },
    onSuccess: ({ order }) => {
      qc.setQueryData(qk.order(order.id), { order });
      if (order.table) void qc.invalidateQueries({ queryKey: qk.tableBill });
      rememberOrder(order.id);
      cartStore.clear();
      checkoutStore.afterOrder();
    },
  });
}
