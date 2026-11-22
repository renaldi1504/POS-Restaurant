import { describe, expect, it } from 'vitest';
import { buildOrderBody } from '../pages/cashier/CartView';
import { fx, makeOrder } from '../test/fixtures';
import { isOnlineOrder } from './online';
import {
  addLine,
  computeCart,
  emptyCart,
  discountAmountOf,
  kindToChannelType,
  lineKey,
  qtyByItem,
  setLineQty,
  type CartLine,
} from './cart';

describe('keranjang', () => {
  it('menggabung baris identik (menu + opsi + catatan) dan memisah yang beda', () => {
    let lines: CartLine[] = [];
    lines = addLine(lines, { itemId: 1, qty: 1, optionIds: [12, 21] });
    lines = addLine(lines, { itemId: 1, qty: 2, optionIds: [21, 12] });
    lines = addLine(lines, { itemId: 1, qty: 1, optionIds: [12, 21], note: 'tanpa sambal' });
    expect(lines).toHaveLength(2);
    expect(lines[0]!.qty).toBe(3);
    expect(lineKey(1, [21, 12])).toBe(lineKey(1, [12, 21]));
    expect(qtyByItem(lines).get(1)).toBe(4);
    expect(setLineQty(lines, lines[0]!.key, 0)).toHaveLength(1);
  });

  it('menghitung subtotal dengan harga opsi, diskon, dan ongkir (delivery saja)', () => {
    const lines = [
      ...addLine([], { itemId: 1, qty: 2, optionIds: [12, 22, 31] }), // (10.000 + 1.000 + 2.000) × 2
      ...addLine([], { itemId: 4, qty: 1, optionIds: [] }), // 4.000
    ];
    const t = computeCart(
      { lines, kind: 'delivery', discount: { kind: 'pct', value: 10 }, deliveryFee: 5000 },
      fx.menu,
    );
    expect(t.subtotal).toBe(30000);
    expect(t.count).toBe(3);
    expect(t.discountAmount).toBe(3000);
    expect(t.deliveryFee).toBe(5000);
    expect(t.total).toBe(32000);
    expect(t.invalid).toBe(false);
    // ongkir diabaikan untuk bungkus
    expect(computeCart({ lines, kind: 'takeaway', discount: null, deliveryFee: 5000 }, fx.menu).total).toBe(
      30000,
    );
  });

  it('harga pilihan Grab/foodpanda dipakai bila diisi, kosong = harga toko', () => {
    const menu = {
      ...fx.menu,
      optionGroups: fx.menu.optionGroups.map((g) => ({
        ...g,
        options: g.options.map((o) =>
          o.id === 31 ? { ...o, channelPrices: { grab: 3000, foodpanda: null } } : o,
        ),
      })),
    };
    const lines = addLine([], { itemId: 1, qty: 1, optionIds: [12, 22, 31] });
    const grab = computeCart({ lines, kind: 'grab', discount: null, deliveryFee: 0 }, menu);
    expect(grab.lines[0]!.options.find((o) => o.optionId === 31)?.priceDelta).toBe(3000);
    const fp = computeCart({ lines, kind: 'foodpanda', discount: null, deliveryFee: 0 }, menu);
    expect(fp.lines[0]!.options.find((o) => o.optionId === 31)?.priceDelta).toBe(2000);
    const store = computeCart({ lines, kind: 'takeaway', discount: null, deliveryFee: 0 }, menu);
    expect(store.lines[0]!.options.find((o) => o.optionId === 31)?.priceDelta).toBe(2000);
  });

  it('memakai harga channel Grab (+25%) dan menandai menu habis', () => {
    const lines = addLine([], { itemId: 4, qty: 2, optionIds: [] });
    expect(computeCart({ lines, kind: 'grab', discount: null, deliveryFee: 0 }, fx.menu).subtotal).toBe(
      10000,
    );
    expect(kindToChannelType('grab')).toEqual({ channel: 'grab', type: 'takeaway' });
    expect(kindToChannelType('telegram')).toEqual({ channel: 'telegram', type: 'delivery' });
    const sold = computeCart(
      {
        lines: addLine([], { itemId: 3, qty: 1, optionIds: [] }),
        kind: 'takeaway',
        discount: null,
        deliveryFee: 0,
      },
      fx.menu,
    );
    expect(sold.invalid).toBe(true);
  });

  it('diskon nominal tidak melebihi subtotal', () => {
    expect(discountAmountOf(10000, { kind: 'amount', value: 25000 })).toBe(10000);
    expect(discountAmountOf(10000, { kind: 'pct', value: 150 })).toBe(10000);
    expect(discountAmountOf(10000, null)).toBe(0);
  });
});

describe('body order kasir', () => {
  it('Telegram → channel telegram + delivery dengan HP; tanpa catatan "Telegram" tempelan', () => {
    const body = buildOrderBody({
      ...emptyCart(),
      kind: 'telegram',
      lines: addLine([], { itemId: 4, qty: 1, optionIds: [] }),
      delivery: { name: 'Pak Budi', phone: '012 345 678', addressText: 'Jl. Ekareach', landmark: '' },
    });
    expect(body).toMatchObject({
      channel: 'telegram',
      type: 'delivery',
      customerName: 'Pak Budi',
      delivery: { name: 'Pak Budi', phone: '012 345 678', addressText: 'Jl. Ekareach' },
    });
    expect(body.note).toBeUndefined();
    expect(body.customerPhone).toBeUndefined();
  });

  it('bungkus mengirim nama & HP pelanggan', () => {
    const body = buildOrderBody({
      ...emptyCart(),
      kind: 'takeaway',
      lines: addLine([], { itemId: 4, qty: 1, optionIds: [] }),
      customerName: 'Bu Sari',
      customerPhone: ' 097 111 222 ',
    });
    expect(body).toMatchObject({ channel: 'kasir', customerName: 'Bu Sari', customerPhone: '097 111 222' });
  });

  it('order Telegram buatan kasir bukan "order online"', () => {
    expect(isOnlineOrder(makeOrder({ channel: 'telegram', createdByStaff: true }))).toBe(false);
    expect(isOnlineOrder(makeOrder({ channel: 'telegram', createdByStaff: false }))).toBe(true);
    expect(isOnlineOrder(makeOrder({ channel: 'qr' }))).toBe(true);
    expect(isOnlineOrder(makeOrder({ channel: 'kasir' }))).toBe(false);
  });
});
