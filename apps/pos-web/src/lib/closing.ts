/** Hitungan closing di klien (tampilan); server menghitung ulang saat POST /closing. */
import { CURRENCIES, convertMoney, type ClosingPreview, type Currency, type Rates } from '@pos/shared';

export interface ClosingCalc {
  cashActualMain: number;
  cashExpectedMain: number;
  cashDiff: number;
  abaActualMain: number;
  abaExpectedMain: number;
  abaDiff: number;
  /** Selisih ≠ 0 → catatan wajib. */
  needsNote: boolean;
  /** Komponen penjelasan "Modal + jual cash − keluar cash". */
  openingMain: number;
  cashSalesMain: number;
  cashExpensesMain: number;
}

export function closingCalc(
  preview: Pick<ClosingPreview, 'expected' | 'openingCashMain' | 'byMethod' | 'expenses'>,
  actualCash: Record<Currency, number>,
  abaActualMain: number,
  main: Currency,
  rates: Rates,
): ClosingCalc {
  const cashActualMain = CURRENCIES.reduce((a, c) => a + convertMoney(actualCash[c] ?? 0, c, main, rates), 0);
  const cashDiff = cashActualMain - preview.expected.cashMain;
  const abaDiff = abaActualMain - preview.expected.abaMain;
  return {
    cashActualMain,
    cashExpectedMain: preview.expected.cashMain,
    cashDiff,
    abaActualMain,
    abaExpectedMain: preview.expected.abaMain,
    abaDiff,
    needsNote: cashDiff !== 0 || abaDiff !== 0,
    openingMain: preview.openingCashMain,
    cashSalesMain: preview.byMethod.find((m) => m.method === 'cash')?.totalMain ?? 0,
    cashExpensesMain: preview.expenses.cashMain,
  };
}

/** Label selisih: "Kurang 5.000 ៛" / "Lebih 2.000 ៛" / "Cocok". */
export function diffKind(diff: number): 'short' | 'over' | 'match' {
  return diff < 0 ? 'short' : diff > 0 ? 'over' : 'match';
}

export interface PocketResult {
  method: 'cash' | 'aba';
  currency: Currency;
  opening: number;
  sales: number;
  change: number;
  expenses: number;
  expected: number;
  actual: number;
  diff: number;
}

/** Selisih per kantong (cash/ABA × mata uang) — sama persis dengan hitungan server, tanpa kurs. */
export function pocketResults(
  preview: Pick<ClosingPreview, 'pockets'>,
  cash: Partial<Record<Currency, number>>,
  aba: Partial<Record<Currency, number | null>>,
): PocketResult[] {
  return preview.pockets.map((p) => {
    const actual = (p.method === 'cash' ? cash[p.currency] : aba[p.currency]) ?? 0;
    return { ...p, actual, diff: actual - p.expected };
  });
}

/** Kantong yang perlu ditampilkan: ada transaksi/modal, atau mata uang aktif. */
export function visiblePockets(results: PocketResult[], enabled: readonly Currency[]): PocketResult[] {
  return results.filter(
    (r) => enabled.includes(r.currency) || r.expected !== 0 || r.actual !== 0 || r.sales !== 0,
  );
}

/** Usulan uang ditinggal di laci = modal tetap, dibatasi uang fisik. */
export function defaultKeep(
  suggested: Partial<Record<Currency, number>>,
  counted: Partial<Record<Currency, number>>,
): Record<Currency, number> {
  const out = { KHR: 0, USD: 0, IDR: 0 } as Record<Currency, number>;
  for (const c of CURRENCIES) out[c] = Math.min(suggested[c] ?? 0, counted[c] ?? 0);
  return out;
}
