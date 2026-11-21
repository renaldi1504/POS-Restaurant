/** Hitung uang per pecahan per mata uang (Buka shift & Closing). */
import { useTranslation } from 'react-i18next';
import { CURRENCIES, DENOMINATIONS, convertMoney, formatMoney, type Currency, type Rates } from '@pos/shared';
import { cn } from '../ui';
import { MoneyInput, RoundStepper } from './Form';

export type Counts = Partial<Record<Currency, Record<string, number>>>;
export type CountMode = 'denom' | 'total';

export const CURRENCY_LABEL: Record<Currency, string> = { KHR: 'Riel', USD: 'Dollar', IDR: 'Rupiah' };
export const CURRENCY_SHORT: Record<Currency, string> = { KHR: 'Riel ៛', USD: 'Dollar $', IDR: 'Rupiah' };

export function sumCounts(counts: Record<string, number> | undefined): number {
  return Object.entries(counts ?? {}).reduce((a, [den, n]) => a + Number(den) * n, 0);
}

/** Total per mata uang dari mode pecahan atau total manual. */
export function totalsByCurrency(
  mode: CountMode,
  counts: Counts,
  manual: Partial<Record<Currency, number | null>>,
): Record<Currency, number> {
  const out = { KHR: 0, USD: 0, IDR: 0 } as Record<Currency, number>;
  for (const c of CURRENCIES) out[c] = mode === 'denom' ? sumCounts(counts[c]) : Math.max(0, manual[c] ?? 0);
  return out;
}

export function totalInMain(by: Record<Currency, number>, main: Currency, rates: Rates): number {
  return CURRENCIES.reduce((a, c) => a + convertMoney(by[c], c, main, rates), 0);
}

export function CurrencyTabs({
  currencies,
  value,
  onChange,
  totals,
}: {
  currencies: Currency[];
  value: Currency;
  onChange: (c: Currency) => void;
  totals: Record<Currency, number>;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="tablist"
      aria-label={t('payment.currency')}
      className="grid gap-1 rounded-xl bg-[#EEF0F3] p-1"
      style={{ gridTemplateColumns: `repeat(${currencies.length}, minmax(0, 1fr))` }}
    >
      {currencies.map((c) => (
        <button
          key={c}
          type="button"
          role="tab"
          aria-selected={value === c}
          onClick={() => onChange(c)}
          className={cn(
            'min-h-12 rounded-[9px] px-1 py-1 text-sm leading-tight text-ink',
            value === c ? 'bg-white font-extrabold shadow-[0_1px_3px_rgba(0,0,0,0.15)]' : 'font-semibold',
          )}
        >
          {CURRENCY_LABEL[c]}
          <br />
          {formatMoney(totals[c], c, { noSymbol: c === 'KHR' })}
        </button>
      ))}
    </div>
  );
}

export function DenominationList({
  currency,
  counts,
  onChange,
}: {
  currency: Currency;
  counts: Record<string, number>;
  onChange: (next: Record<string, number>) => void;
}) {
  const dens = [...DENOMINATIONS[currency]].sort((a, b) => b - a);
  return (
    <section className="rounded-card bg-white px-3 py-0.5 shadow-card">
      {dens.map((d) => {
        const n = counts[String(d)] ?? 0;
        const label = formatMoney(d, currency);
        return (
          <div key={d} className="flex items-center gap-2 border-b border-[#F2F4F7] py-2 last:border-b-0">
            <div className="flex grow flex-col">
              <b className="text-lg tabular-nums">{label}</b>
              <span className="text-[13px] text-muted">= {formatMoney(d * n, currency)}</span>
            </div>
            <RoundStepper
              size={48}
              label={label}
              value={n}
              onChange={(v) => onChange({ ...counts, [String(d)]: Math.max(0, v) })}
            />
          </div>
        );
      })}
    </section>
  );
}

export function ManualTotal({
  currency,
  value,
  onChange,
}: {
  currency: Currency;
  value: number | null;
  onChange: (v: number | null) => void;
}) {
  const { t } = useTranslation();
  return (
    <section className="rounded-card bg-white p-3 shadow-card">
      <MoneyInput
        big
        currency={currency}
        value={value}
        onChange={onChange}
        label={`${t('shift.totalOnly')} · ${CURRENCY_LABEL[currency]}`}
      />
    </section>
  );
}
