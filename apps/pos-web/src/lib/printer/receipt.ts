/**
 * Template struk & nota sementara (SPEC §4.14). Satu dokumen → dua keluaran:
 * - `renderText()` untuk pratinjau di layar (monospace, sama persis dengan hasil cetak)
 * - `renderEscPos()` untuk printer thermal
 */
import {
  convertMoney,
  formatMoney,
  tl,
  type Currency,
  type OrderDto,
  type PaymentDto,
  type Rates,
} from '@pos/shared';
import { center, EscPos, rule, toAscii, twoCol, wrap, type Align } from './escpos';

export type ReceiptLang = 'id' | 'en';

export interface DocLine {
  text: string;
  align?: Align;
  bold?: boolean;
  /** true = ukuran ganda (hanya untuk teks pendek). */
  big?: boolean;
  /** Teks sudah diformat lebar penuh (kolom) — jangan dibungkus lagi. */
  pre?: boolean;
}

export interface ReceiptItem {
  qty: number;
  name: string;
  options: string[];
  note?: string | null;
  total: number;
}

export interface ReceiptData {
  kind: 'receipt' | 'provisional';
  lang: ReceiptLang;
  shop: { name: string; address?: string; phone?: string };
  date: Date;
  cashier?: string | null;
  table?: string | null;
  orderNo?: string | null;
  orderTypeLabel?: string | null;
  groups: { title?: string; items: ReceiptItem[] }[];
  subtotal: number;
  discount: number;
  deliveryFee: number;
  total: number;
  currency: Currency;
  rates: Rates;
  equivalents: Currency[];
  payments?: { label: string; amount: number; currency: Currency }[];
  change?: number;
  /** Sudah dibayar sebelumnya (split) dan sisa. */
  paid?: number;
  remaining?: number;
}

const L = {
  id: {
    cashier: 'Kasir',
    table: 'MEJA',
    order: 'Order',
    subtotal: 'Subtotal',
    items: 'item',
    discount: 'Diskon',
    delivery: 'Ongkir',
    total: 'TOTAL',
    change: 'Kembalian',
    paid: 'Sudah bayar',
    remaining: 'Sisa',
    provisional: 'NOTA SEMENTARA - BELUM BAYAR',
    payAt: 'Bayar di kasir - Cash / ABA',
    thanks: 'Terima kasih!',
    note: 'Catatan',
  },
  en: {
    cashier: 'Cashier',
    table: 'TABLE',
    order: 'Order',
    subtotal: 'Subtotal',
    items: 'items',
    discount: 'Discount',
    delivery: 'Delivery',
    total: 'TOTAL',
    change: 'Change',
    paid: 'Paid',
    remaining: 'Remaining',
    provisional: 'PROVISIONAL BILL - UNPAID',
    payAt: 'Pay at cashier - Cash / ABA',
    thanks: 'Thank you!',
    note: 'Note',
  },
} as const;

/** Format uang ASCII untuk struk ("62.000 KHR", "$15.12", "Rp 248.000"). */
export function moneyAscii(amount: number, currency: Currency, noSymbol = false): string {
  return toAscii(formatMoney(amount, currency, { noSymbol }));
}

function pad2(n: number) {
  return String(n).padStart(2, '0');
}
export function formatReceiptDate(d: Date): { date: string; time: string } {
  return {
    date: `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

/** Susun dokumen struk sebagai baris-baris lebar `cols`. */
export function buildReceipt(data: ReceiptData, cols: number): DocLine[] {
  const t = L[data.lang];
  const out: DocLine[] = [];
  const push = (text: string, o: Omit<DocLine, 'text'> = {}) => out.push({ text, ...o });
  const pre = (lines: string[], o: Omit<DocLine, 'text' | 'pre'> = {}) =>
    lines.forEach((l) => push(l, { ...o, pre: true }));
  const cur = data.currency;

  center(data.shop.name.toUpperCase(), cols).forEach((l) => push(l.trim(), { align: 'center', bold: true }));
  if (data.shop.address) wrap(data.shop.address, cols).forEach((l) => push(l, { align: 'center' }));
  if (data.shop.phone) push(data.shop.phone, { align: 'center' });
  push(rule(cols), { pre: true });

  const { date, time } = formatReceiptDate(data.date);
  pre(twoCol(date, time, cols));
  const right = data.table ? `${t.table} ${data.table}`.toUpperCase() : data.orderNo ? `${data.orderNo}` : '';
  if (data.cashier || right)
    pre(twoCol(data.cashier ? `${t.cashier}: ${data.cashier}` : '', right, cols), { bold: false });
  if (data.table && data.orderNo) pre(twoCol(`${t.order} ${data.orderNo}`, data.orderTypeLabel ?? '', cols));
  else if (data.orderTypeLabel) pre(twoCol(data.orderTypeLabel, '', cols));
  if (data.kind === 'provisional') {
    push(rule(cols, '='), { pre: true });
    center(t.provisional, cols).forEach((l) => push(l, { pre: true, bold: true }));
    push(rule(cols, '='), { pre: true });
  } else {
    push(rule(cols), { pre: true });
  }

  let count = 0;
  for (const g of data.groups) {
    if (g.title) push(g.title, { pre: false });
    for (const it of g.items) {
      count += it.qty;
      pre(twoCol(`${it.qty} ${it.name}`, moneyAscii(it.total, cur, true), cols));
      if (it.options.length)
        wrap(it.options.join(', '), cols - 2).forEach((l) => push(`  ${l}`, { pre: true }));
      if (it.note) wrap(`${t.note}: ${it.note}`, cols - 2).forEach((l) => push(`  ${l}`, { pre: true }));
    }
  }
  push(rule(cols), { pre: true });
  pre(twoCol(`${t.subtotal} (${count} ${t.items})`, moneyAscii(data.subtotal, cur, true), cols));
  if (data.discount > 0) pre(twoCol(t.discount, `-${moneyAscii(data.discount, cur, true)}`, cols));
  if (data.deliveryFee > 0) pre(twoCol(t.delivery, moneyAscii(data.deliveryFee, cur, true), cols));
  pre(twoCol(t.total, moneyAscii(data.total, cur), cols), { bold: true });
  for (const c of data.equivalents) {
    if (c === cur) continue;
    pre(twoCol(`~ ${c}`, moneyAscii(convertMoney(data.total, cur, c, data.rates), c), cols));
  }
  if (data.payments?.length) {
    push(rule(cols), { pre: true });
    for (const p of data.payments) pre(twoCol(p.label, moneyAscii(p.amount, p.currency), cols));
    if (data.change && data.change > 0)
      pre(twoCol(t.change, moneyAscii(data.change, cur), cols), { bold: true });
  }
  if (data.paid !== undefined && data.paid > 0) pre(twoCol(t.paid, moneyAscii(data.paid, cur), cols));
  if (data.remaining !== undefined && data.remaining > 0)
    pre(twoCol(t.remaining, moneyAscii(data.remaining, cur), cols), { bold: true });
  push(rule(cols), { pre: true });
  if (data.kind === 'provisional') push(t.payAt, { align: 'center' });
  push(t.thanks, { align: 'center' });
  return out;
}

/** Baris pratinjau (setiap baris ≤ `cols` karakter) beserta gaya tebal/besar. */
export function previewLines(doc: DocLine[], cols: number): { text: string; bold: boolean; big: boolean }[] {
  return doc.flatMap((l) => {
    const lines = l.pre ? [toAscii(l.text)] : wrap(l.text, l.big ? Math.floor(cols / 2) : cols);
    return lines.map((x) => {
      let text = x;
      if (!l.pre && l.align === 'center')
        text = (center(x, l.big ? Math.floor(cols / 2) : cols)[0] ?? x).trimEnd();
      else if (!l.pre && l.align === 'right') text = x.padStart(cols, ' ');
      return { text, bold: !!l.bold, big: !!l.big };
    });
  });
}

/** Teks pratinjau polos. */
export function renderText(doc: DocLine[], cols: number): string[] {
  return previewLines(doc, cols).map((l) => l.text);
}

/** Byte ESC/POS siap kirim. */
export function renderEscPos(doc: DocLine[], cols: number, opts: { cut?: boolean } = {}): Uint8Array {
  const e = new EscPos(cols).init();
  for (const l of doc) {
    e.align(l.pre ? 'left' : (l.align ?? 'left'));
    if (l.bold) e.bold(true);
    if (l.big) e.double(true);
    if (l.pre) e.line(l.text);
    else wrap(l.text, l.big ? Math.floor(cols / 2) : cols).forEach((x) => e.line(x));
    if (l.big) e.double(false);
    if (l.bold) e.bold(false);
  }
  e.align('left');
  if (opts.cut !== false) e.cut(3);
  else e.feed(3);
  return e.encode();
}

// ---------------- Adaptor dari DTO ----------------
export function receiptItemsFromOrder(o: OrderDto, lang: ReceiptLang): ReceiptItem[] {
  return o.items.map((it) => ({
    qty: it.qty,
    name: tl(it.name, lang),
    options: it.options.map((op) => tl(op.optionName, lang)),
    note: it.note,
    total: it.lineTotal,
  }));
}

export function paymentLabel(p: Pick<PaymentDto, 'method' | 'currency'>, lang: ReceiptLang): string {
  const m =
    p.method === 'cash' ? 'Cash' : p.method === 'aba' ? 'ABA' : lang === 'id' ? 'Aplikasi' : 'Platform';
  return `${m} ${p.currency}`;
}
