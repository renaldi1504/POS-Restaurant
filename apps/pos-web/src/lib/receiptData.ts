/** Ubah order / tagihan meja menjadi data struk. */
import type { OrderDto, PublicSettingsResponse, TableBillDto } from '@pos/shared';
import type { MoneyCtx } from './data';
import { paymentLabel, receiptItemsFromOrder, type ReceiptData, type ReceiptLang } from './printer';

const TYPE_LABEL: Record<ReceiptLang, Record<string, string>> = {
  id: { dine_in: 'Makan sini', takeaway: 'Bungkus', delivery: 'Delivery', grab: 'Grab', foodpanda: 'foodpanda' },
  en: { dine_in: 'Dine-in', takeaway: 'Takeaway', delivery: 'Delivery', grab: 'Grab', foodpanda: 'foodpanda' },
};

export interface ReceiptCtx {
  shop: PublicSettingsResponse | undefined;
  money: MoneyCtx;
  lang: ReceiptLang;
  cashier?: string | null;
}

function shopOf(s: PublicSettingsResponse | undefined) {
  return { name: s?.name ?? 'Rumah Makan Berkat', address: s?.address, phone: s?.phone };
}

export function receiptFromOrder(o: OrderDto, ctx: ReceiptCtx, extra: { change?: number } = {}): ReceiptData {
  const typeKey = o.channel === 'grab' || o.channel === 'foodpanda' ? o.channel : o.type;
  const payments = o.payments.map((p) => ({ label: paymentLabel(p, ctx.lang), amount: p.amount, currency: p.currency }));
  const change = extra.change ?? o.payments.reduce((a, p) => a + p.changeMain, 0);
  return {
    kind: o.paymentStatus === 'paid' ? 'receipt' : 'provisional',
    lang: ctx.lang,
    shop: shopOf(ctx.shop),
    date: new Date(),
    cashier: ctx.cashier ?? o.createdBy?.name ?? null,
    table: o.table?.name ?? null,
    orderNo: o.displayNo,
    orderTypeLabel: TYPE_LABEL[ctx.lang][typeKey] ?? null,
    groups: [{ items: receiptItemsFromOrder(o, ctx.lang) }],
    subtotal: o.subtotal,
    discount: o.discount,
    deliveryFee: o.deliveryFee,
    total: o.total,
    currency: o.currency,
    rates: ctx.money.rates,
    equivalents: ctx.money.others,
    payments: payments.length ? payments : undefined,
    change,
    paid: o.paymentStatus !== 'paid' && o.paidMain > 0 ? o.paidMain : undefined,
    remaining: o.paymentStatus !== 'paid' && o.paidMain > 0 ? o.total - o.paidMain : undefined,
  };
}

/** Struk / nota sementara meja: tiap order = satu ronde (#18, #21 …). */
export function receiptFromBill(
  bill: TableBillDto,
  ctx: ReceiptCtx,
  kind: 'receipt' | 'provisional',
  extra: { payments?: ReceiptData['payments']; change?: number } = {},
): ReceiptData {
  const live = bill.orders.filter((o) => o.status !== 'cancelled' && o.status !== 'rejected');
  return {
    kind,
    lang: ctx.lang,
    shop: shopOf(ctx.shop),
    date: new Date(),
    cashier: ctx.cashier ?? null,
    table: bill.table.name,
    orderNo: live.length === 1 ? live[0]!.displayNo : null,
    groups: live.map((o) => ({ title: live.length > 1 ? o.displayNo : undefined, items: receiptItemsFromOrder(o, ctx.lang) })),
    subtotal: bill.subtotal,
    discount: bill.discount,
    deliveryFee: 0,
    total: bill.total,
    currency: bill.currency,
    rates: ctx.money.rates,
    equivalents: ctx.money.others,
    payments: extra.payments,
    change: extra.change,
    paid: kind === 'provisional' && bill.paid > 0 ? bill.paid : undefined,
    remaining: kind === 'provisional' && bill.paid > 0 ? bill.remaining : undefined,
  };
}
