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
