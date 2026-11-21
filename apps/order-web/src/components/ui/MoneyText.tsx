import { convertMoney, formatMoney, type Currency, type Rates } from '@pos/shared';
import { cn } from './cn';

export interface MoneyTextProps {
  amount: number;
  currency: Currency;
  /** Tampilkan perkiraan mata uang lain di bawahnya (≈ $10.24 · Rp 168.000). */
  equivalents?: Currency[];
  rates?: Rates;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  className?: string;
  signed?: boolean;
}

const sizes = {
  sm: 'text-label-large',
  md: 'text-title-medium',
  lg: 'text-headline-small font-medium',
  xl: 'text-display-small font-medium',
};

/** Nominal uang dengan angka tabular & format SPEC (42.000 ៛ / $10.25 / Rp 168.000). */
export function MoneyText({
  amount,
  currency,
  equivalents,
  rates,
  size = 'md',
  className,
  signed,
}: MoneyTextProps) {
  const eq = equivalents && rates ? equivalents.filter((c) => c !== currency) : [];
  return (
    <span className={cn('inline-flex flex-col', className)}>
      <span className={cn('tabular-nums', sizes[size])}>{formatMoney(amount, currency, { signed })}</span>
      {eq.length ? (
        <span className="text-label-medium text-on-surface-variant tabular-nums">
          {eq.map((c) => `≈ ${formatMoney(convertMoney(amount, currency, c, rates!), c)}`).join(' · ')}
        </span>
      ) : null}
    </span>
  );
}
