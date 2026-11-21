/** Laporan closing shift untuk printer thermal (ASCII). */
import { formatMoney, type ClosingDto, type ClosingPreview } from '@pos/shared';
import { center, rule, toAscii, twoCol } from './escpos';
import { formatReceiptDate, type DocLine, type ReceiptLang } from './receipt';

const m = (v: number, c: ClosingPreview['currency']) => toAscii(formatMoney(v, c));

/** Label laporan (ASCII, printer thermal tidak bisa aksara Khmer/Han → id/en seperti struk). */
const L = {
  id: {
    title: 'LAPORAN CLOSING - SHIFT',
    orders: 'Order',
    sales: 'Total penjualan',
    byChannel: 'Per channel (bersih)',
    byMethod: 'Per metode',
    opening: 'Modal awal',
    expCash: 'Pengeluaran cash',
    expAba: 'Pengeluaran ABA',
    expCashShould: 'Cash seharusnya',
    expAbaShould: 'ABA seharusnya',
    cashCounted: 'Cash dihitung',
    abaSeen: 'ABA dilihat',
    cashDiff: 'Selisih cash',
    abaDiff: 'Selisih ABA',
    note: 'Catatan',
    drivers: 'Setoran driver',
  },
  en: {
    title: 'CLOSING REPORT - SHIFT',
    orders: 'Orders',
    sales: 'Total sales',
    byChannel: 'By channel (net)',
    byMethod: 'By method',
    opening: 'Opening cash',
    expCash: 'Cash expenses',
    expAba: 'ABA expenses',
    expCashShould: 'Expected cash',
    expAbaShould: 'Expected ABA',
    cashCounted: 'Counted cash',
    abaSeen: 'ABA seen',
    cashDiff: 'Cash difference',
    abaDiff: 'ABA difference',
    note: 'Note',
    drivers: 'Driver settlement',
  },
} as const;

export function buildClosingReport(
  p: ClosingPreview,
  closing: ClosingDto | null,
  shopName: string,
  cols: number,
  lang: ReceiptLang = 'id',
): DocLine[] {
  const l = L[lang];
  const out: DocLine[] = [];
  const pre = (lines: string[], bold = false) => lines.forEach((text) => out.push({ text, pre: true, bold }));
  const c = p.currency;
  center(shopName.toUpperCase(), cols).forEach((l) =>
    out.push({ text: l.trim(), align: 'center', bold: true }),
  );
  out.push({ text: `${l.title} ${p.shift.name.toUpperCase()}`, align: 'center', bold: true });
  out.push({ text: `${p.shift.businessDate} - ${p.shift.user.name}`, align: 'center' });
  pre([rule(cols)]);
  pre(twoCol(l.orders, String(p.orderCount), cols));
  pre(twoCol(l.sales, m(p.salesTotalMain, c), cols), true);
  pre([rule(cols)]);
  out.push({ text: l.byChannel, bold: true });
  for (const ch of p.byChannel) pre(twoCol(`${ch.channel} (${ch.count})`, m(ch.net, c), cols));
  out.push({ text: l.byMethod, bold: true });
  for (const me of p.byMethod) pre(twoCol(me.method, m(me.totalMain, c), cols));
  pre([rule(cols)]);
  pre(twoCol(l.opening, m(p.openingCashMain, c), cols));
  pre(twoCol(l.expCash, m(p.expenses.cashMain, c), cols));
  pre(twoCol(l.expAba, m(p.expenses.abaMain, c), cols));
  pre(twoCol(l.expCashShould, m(p.expected.cashMain, c), cols));
  pre(twoCol(l.expAbaShould, m(p.expected.abaMain, c), cols));
  if (closing) {
    pre(twoCol(l.cashCounted, m(closing.actual.cashMain, c), cols));
    pre(twoCol(l.abaSeen, m(closing.actual.abaMain, c), cols));
    pre(twoCol(l.cashDiff, toAscii(formatMoney(closing.diff.cashMain, c, { signed: true })), cols), true);
    pre(twoCol(l.abaDiff, toAscii(formatMoney(closing.diff.abaMain, c, { signed: true })), cols), true);
    if (closing.note) out.push({ text: `${l.note}: ${toAscii(closing.note)}` });
  }
  if (p.drivers.length) {
    pre([rule(cols)]);
    out.push({ text: l.drivers, bold: true });
    for (const d of p.drivers)
      pre(
        twoCol(`${d.driver.name} (${d.deliveries})${d.settledAt ? ' v' : ''}`, m(d.cashCollected, c), cols),
      );
  }
  pre([rule(cols)]);
  const now = formatReceiptDate(new Date());
  out.push({ text: `${now.date} ${now.time}`, align: 'center' });
  return out;
}
