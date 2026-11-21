/** Laporan closing shift untuk printer thermal (ASCII). */
import { formatMoney, type ClosingDto, type ClosingPreview } from '@pos/shared';
import { center, rule, toAscii, twoCol } from './escpos';
import type { DocLine } from './receipt';

const m = (v: number, c: ClosingPreview['currency']) => toAscii(formatMoney(v, c));

export function buildClosingReport(
  p: ClosingPreview,
  closing: ClosingDto | null,
  shopName: string,
  cols: number,
): DocLine[] {
  const out: DocLine[] = [];
  const pre = (lines: string[], bold = false) => lines.forEach((text) => out.push({ text, pre: true, bold }));
  const c = p.currency;
  center(shopName.toUpperCase(), cols).forEach((l) =>
    out.push({ text: l.trim(), align: 'center', bold: true }),
  );
  out.push({ text: `LAPORAN CLOSING - SHIFT ${p.shift.name.toUpperCase()}`, align: 'center', bold: true });
  out.push({ text: `${p.shift.businessDate} - ${p.shift.user.name}`, align: 'center' });
  pre([rule(cols)]);
  pre(twoCol('Order', String(p.orderCount), cols));
  pre(twoCol('Total penjualan', m(p.salesTotalMain, c), cols), true);
  pre([rule(cols)]);
  out.push({ text: 'Per channel (bersih)', bold: true });
  for (const ch of p.byChannel) pre(twoCol(`${ch.channel} (${ch.count})`, m(ch.net, c), cols));
  out.push({ text: 'Per metode', bold: true });
  for (const me of p.byMethod) pre(twoCol(me.method, m(me.totalMain, c), cols));
  pre([rule(cols)]);
  pre(twoCol('Modal awal', m(p.openingCashMain, c), cols));
  pre(twoCol('Pengeluaran cash', m(p.expenses.cashMain, c), cols));
  pre(twoCol('Pengeluaran ABA', m(p.expenses.abaMain, c), cols));
  pre(twoCol('Cash seharusnya', m(p.expected.cashMain, c), cols));
  pre(twoCol('ABA seharusnya', m(p.expected.abaMain, c), cols));
  if (closing) {
    pre(twoCol('Cash dihitung', m(closing.actual.cashMain, c), cols));
    pre(twoCol('ABA dilihat', m(closing.actual.abaMain, c), cols));
    pre(twoCol('Selisih cash', toAscii(formatMoney(closing.diff.cashMain, c, { signed: true })), cols), true);
    pre(twoCol('Selisih ABA', toAscii(formatMoney(closing.diff.abaMain, c, { signed: true })), cols), true);
    if (closing.note) out.push({ text: `Catatan: ${closing.note}` });
  }
  if (p.drivers.length) {
    pre([rule(cols)]);
    out.push({ text: 'Setoran driver', bold: true });
    for (const d of p.drivers)
      pre(
        twoCol(`${d.driver.name} (${d.deliveries})${d.settledAt ? ' v' : ''}`, m(d.cashCollected, c), cols),
      );
  }
  pre([rule(cols)]);
  out.push({ text: new Date().toLocaleString('id-ID'), align: 'center' });
  return out;
}
