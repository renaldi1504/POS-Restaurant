import type { TFunction } from 'i18next';
/** Hitung uang per pecahan per mata uang (Buka shift & Closing). */
import { useTranslation } from 'react-i18next';
import { CURRENCIES, DENOMINATIONS, convertMoney, formatMoney, type Currency, type Rates } from '@pos/shared';
import { cn } from '../ui';
import { MoneyInput, RoundStepper } from './Form';

export type Counts = Partial<Record<Currency, Record<string, number>>>;
export type CountMode = 'denom' | 'total';

const CURRENCY_SYMBOL: Record<Currency, string> = { KHR: '៛', USD: '$', IDR: 'Rp' };
/** Nama mata uang dalam bahasa UI (Riel / រៀល / 瑞尔 …). */
export const currencyLabel = (c: Currency, t: TFunction): string => t(`currency.${c}`);
/** Nama + simbol (Riel ៛, Dollar $, Rupiah Rp). */
export const currencyShort = (c: Currency, t: TFunction): string =>
  `${t(`currency.${c}`)} ${CURRENCY_SYMBOL[c]}`;

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
      className="grid overflow-hidden rounded-md border border-outline"
      style={{ gridTemplateColumns: `repeat(${currencies.length}, minmax(0, 1fr))` }}
    >
      {currencies.map((c, i) => (
        <button
          key={c}
          type="button"
          role="tab"
          aria-selected={value === c}
          onClick={() => onChange(c)}
          className={cn(
            'state-layer flex min-h-14 flex-col items-center justify-center px-1 py-1 text-label-medium',
            i > 0 && 'border-l border-outline',
            value === c ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface-variant',
          )}
        >
          <span>{currencyLabel(c, t)}</span>
          <span className="text-label-large tabular-nums">
            {formatMoney(totals[c], c, { noSymbol: c === 'KHR' })}
          </span>
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
    <section className="rounded-md bg-surface-container-low px-4 py-1">
      {dens.map((d) => {
        const n = counts[String(d)] ?? 0;
        const label = formatMoney(d, currency);
        return (
          <div
            key={d}
            className="flex items-center gap-2 border-b border-outline-variant/60 py-2 last:border-b-0"
          >
            <div className="flex grow flex-col">
              <b className="text-title-medium tabular-nums">{label}</b>
              <span className="text-label-medium text-on-surface-variant">
                = {formatMoney(d * n, currency)}
              </span>
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
    <section className="rounded-md bg-surface-container-low p-4">
      <MoneyInput
        big
        currency={currency}
        value={value}
        onChange={onChange}
        label={`${t('shift.totalOnly')} · ${currencyLabel(currency, t)}`}
      />
    </section>
  );
}
