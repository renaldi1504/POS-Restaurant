import {
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney, parseMoneyInput, type Currency } from '@pos/shared';
import { Icon, cn } from '../ui';

export { Switch } from '../ui';

/**
 * Kolom teks M3 "outlined" (56px, radius 4px). Label selalu terlihat di dalam kolom (tidak pernah hilang —
 * lebih mudah untuk pengguna lanjut usia), fokus = garis 2px primary, error = garis & teks error + ikon.
 */
const boxCls =
  'group/field relative flex w-full items-stretch rounded-xs border border-outline bg-surface-container-lowest text-on-surface transition-colors focus-within:border-primary focus-within:outline-1 focus-within:outline-primary focus-within:outline-offset-0 has-[:disabled]:border-on-surface/12 has-[:disabled]:text-on-surface/38';
const inputCls =
  'w-full min-w-0 grow bg-transparent px-4 text-body-large text-on-surface outline-none placeholder:text-on-surface-variant/70 focus-visible:outline-none';
const fieldLabelCls =
  'pointer-events-none absolute left-4 right-4 top-1.5 truncate text-label-medium text-on-surface-variant group-focus-within/field:text-primary';

export function Label({
  htmlFor,
  children,
  hint,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: ReactNode;
}) {
  return (
    <label htmlFor={htmlFor} className="text-label-large text-on-surface">
      {children} {hint ? <span className="font-normal text-on-surface-variant">{hint}</span> : null}
    </label>
  );
}

function FieldLabel({
  htmlFor,
  children,
  hint,
  error,
}: {
  htmlFor: string;
  children: ReactNode;
  hint?: ReactNode;
  error?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={cn(fieldLabelCls, error && 'text-error group-focus-within/field:text-error')}
    >
      {children} {hint ? <span className="font-normal">{hint}</span> : null}
    </label>
  );
}

function SupportingText({ error, children }: { error?: boolean; children: ReactNode }) {
  return (
    <span
      className={cn(
        'flex items-center gap-1 px-4 text-label-medium',
        error ? 'text-error' : 'text-on-surface-variant',
      )}
    >
      {error ? <Icon name="error" size={16} /> : null}
      {children}
    </span>
  );
}

export function TextField({
  label,
  hint,
  error,
  supporting,
  className,
  inputClassName,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  /** Teks bantuan di bawah kolom. */
  supporting?: ReactNode;
  inputClassName?: string;
}) {
  const id = useId();
  const inputId = rest.id ?? id;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div
        className={cn(boxCls, error && 'border-error focus-within:border-error focus-within:outline-error')}
      >
        <FieldLabel htmlFor={inputId} hint={hint} error={!!error}>
          {label}
        </FieldLabel>
        <input
          id={inputId}
          className={cn(inputCls, 'h-14 pb-1.5 pt-6', inputClassName)}
          aria-invalid={!!error || undefined}
          {...rest}
        />
      </div>
      {error ? (
        <SupportingText error>{error}</SupportingText>
      ) : supporting ? (
        <SupportingText>{supporting}</SupportingText>
      ) : null}
    </div>
  );
}

export function TextArea({
  label,
  hint,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label: ReactNode; hint?: ReactNode }) {
  const id = useId();
  const inputId = rest.id ?? id;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className={boxCls}>
        <FieldLabel htmlFor={inputId} hint={hint}>
          {label}
        </FieldLabel>
        <textarea id={inputId} rows={3} className={cn(inputCls, 'resize-none pb-2 pt-7')} {...rest} />
      </div>
    </div>
  );
}

export function SelectField({
  label,
  children,
  className,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label: ReactNode }) {
  const id = useId();
  const inputId = rest.id ?? id;
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className={boxCls}>
        <FieldLabel htmlFor={inputId}>{label}</FieldLabel>
        <select id={inputId} className={cn(inputCls, 'h-14 appearance-none pb-1.5 pr-12 pt-6')} {...rest}>
          {children}
        </select>
        <Icon
          name="expand_more"
          className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-on-surface-variant"
        />
      </div>
    </div>
  );
}

const SUFFIX: Record<Currency, string> = { KHR: '៛', USD: '$', IDR: 'Rp' };

/**
 * Input uang: rata kanan, angka tabular, akhiran mata uang; tampil berformat ("35.000"), nilai = minor units.
 * Kosong → null.
 */
export function MoneyInput({
  value,
  onChange,
  currency,
  label,
  big,
  className,
  autoFocus,
  id: idProp,
  placeholder,
  ariaLabel,
  suffix = true,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  currency: Currency;
  label?: ReactNode;
  big?: boolean;
  className?: string;
  autoFocus?: boolean;
  id?: string;
  placeholder?: string;
  ariaLabel?: string;
  /** Tampilkan akhiran mata uang (matikan bila judul sudah menyebut mata uangnya, mis. kolom sempit). */
  suffix?: boolean;
}) {
  const genId = useId();
  const id = idProp ?? genId;
  const fmt = (v: number | null) => (v === null ? '' : formatMoney(v, currency, { noSymbol: true }));
  const [text, setText] = useState(fmt(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(fmt(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, currency, focused]);
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className={cn(boxCls, big && 'rounded-sm border-2')}>
        {label ? <FieldLabel htmlFor={id}>{label}</FieldLabel> : null}
        <input
          id={id}
          aria-label={ariaLabel}
          inputMode={currency === 'USD' ? 'decimal' : 'numeric'}
          autoComplete="off"
          autoFocus={autoFocus}
          placeholder={placeholder ?? '0'}
          value={text}
          onFocus={() => setFocused(true)}
          onBlur={() => {
            setFocused(false);
            setText(fmt(value));
          }}
          onChange={(e) => {
            setText(e.target.value);
            onChange(parseMoneyInput(e.target.value, currency));
          }}
          className={cn(
            inputCls,
            'pl-2 text-right font-medium tabular-nums',
            suffix ? 'pr-1' : 'pr-3',
            label ? 'pb-1.5 pt-6' : '',
            big ? 'h-[72px] text-headline-medium' : label ? 'h-14' : 'h-12',
          )}
        />
        <span
          aria-hidden
          hidden={!suffix}
          className={cn(
            'flex shrink-0 items-center pr-3 text-on-surface-variant',
            label ? 'pt-4' : '',
            big ? 'text-title-large' : 'text-body-large',
          )}
        >
          {SUFFIX[currency]}
        </span>
      </div>
    </div>
  );
}

/** Kotak angka − n + (mockup OpsiEdit). */
export function NumberBox({
  value,
  onChange,
  min = 0,
  max = 99,
  label,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  label: string;
}) {
  const { t } = useTranslation();
  const btn =
    'state-layer flex size-12 shrink-0 items-center justify-center rounded-full text-on-surface-variant disabled:opacity-38';
  return (
    <div className="flex flex-col gap-1">
      <span className="text-label-medium text-on-surface-variant">{label}</span>
      <div className="flex h-14 items-center justify-between rounded-xs border border-outline bg-surface-container-lowest px-1">
        <button
          type="button"
          aria-label={t('formx.dec', { label: label.toLowerCase() })}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className={btn}
        >
          <Icon name="remove" />
        </button>
        <b className="text-title-medium tabular-nums" aria-live="polite">
          {value}
        </b>
        <button
          type="button"
          aria-label={t('formx.inc', { label: label.toLowerCase() })}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className={btn}
        >
          <Icon name="add" />
        </button>
      </div>
    </div>
  );
}

/** Tombol bulat − n + (mockup Pesanan / BukaShift). */
export function RoundStepper({
  value,
  onChange,
  label,
  min = 0,
  size = 44,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  size?: 44 | 48;
}) {
  const { t } = useTranslation();
  const btn = cn(
    'state-layer flex shrink-0 items-center justify-center rounded-full border border-outline text-on-surface-variant disabled:opacity-38',
    size === 48 ? 'size-12' : 'size-11',
  );
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <button
        type="button"
        className={btn}
        aria-label={t('formx.dec', { label })}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        <Icon name="remove" />
      </button>
      <b
        className={cn(
          'text-center font-medium tabular-nums',
          size === 48 ? 'w-[30px] text-title-large' : 'w-[22px] text-title-medium',
        )}
        aria-live="polite"
      >
        {value}
      </b>
      <button
        type="button"
        className={cn(btn, 'border-0 bg-secondary-container text-on-secondary-container')}
        aria-label={t('formx.inc', { label })}
        onClick={() => onChange(value + 1)}
      >
        <Icon name="add" />
      </button>
    </div>
  );
}
