import {
  useEffect,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { formatMoney, parseMoneyInput, type Currency } from '@pos/shared';
import { cn } from '../ui';

const inputCls =
  'h-12 w-full rounded-xl border border-line-strong bg-white px-3 text-ink placeholder:text-[#98A2B3] focus:border-primary focus:outline-2 focus:outline-primary/30 disabled:bg-bg';

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
    <label htmlFor={htmlFor} className="text-sm font-bold text-ink">
      {children} {hint ? <span className="font-medium text-muted">{hint}</span> : null}
    </label>
  );
}

export function TextField({
  label,
  hint,
  error,
  className,
  inputClassName,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: ReactNode;
  error?: string | null;
  inputClassName?: string;
}) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={rest.id ?? id} hint={hint}>
        {label}
      </Label>
      <input
        id={rest.id ?? id}
        className={cn(inputCls, error && 'border-danger', inputClassName)}
        aria-invalid={!!error || undefined}
        {...rest}
      />
      {error ? <span className="text-sm font-bold text-danger">{error}</span> : null}
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
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={rest.id ?? id} hint={hint}>
        {label}
      </Label>
      <textarea
        id={rest.id ?? id}
        rows={3}
        className="w-full resize-none rounded-xl border border-line-strong bg-white px-3 py-2.5 text-ink focus:border-primary focus:outline-2 focus:outline-primary/30"
        {...rest}
      />
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
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <Label htmlFor={rest.id ?? id}>{label}</Label>
      <select id={rest.id ?? id} className={cn(inputCls, 'shadow-card')} {...rest}>
        {children}
      </select>
    </div>
  );
}

/**
 * Input uang: tampil berformat ("35.000"), nilai = minor units. Kosong → null.
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
      {label ? <Label htmlFor={id}>{label}</Label> : null}
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
          'font-bold tabular-nums',
          big && 'h-16 rounded-[14px] border-[1.5px] border-[#98A2B3] px-4 text-[30px] font-extrabold',
        )}
      />
    </div>
  );
}

/** Saklar on/off besar dengan label. */
export function Switch({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: ReactNode;
  description?: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="flex min-h-12 w-full items-center gap-3 text-left disabled:opacity-50"
    >
      <span className="flex grow flex-col">
        <span className="font-semibold">{label}</span>
        {description ? <span className="text-[13px] text-muted">{description}</span> : null}
      </span>
      <span
        className={cn(
          'flex h-8 w-14 shrink-0 rounded-full p-1 transition-colors',
          checked ? 'justify-end bg-primary' : 'justify-start bg-line-strong',
        )}
      >
        <span className="size-6 rounded-full bg-white shadow-card" />
      </span>
    </button>
  );
}

/** Stepper angka kecil dalam kotak (mockup OpsiEdit). */
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
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[13px] font-bold text-[#475467]">{label}</span>
      <div className="flex h-12 items-center justify-between rounded-xl border border-line-strong px-1">
        <button
          type="button"
          aria-label={`Kurangi ${label.toLowerCase()}`}
          disabled={value <= min}
          onClick={() => onChange(Math.max(min, value - 1))}
          className="size-10 text-xl font-extrabold disabled:opacity-30"
        >
          −
        </button>
        <b className="text-[17px] tabular-nums" aria-live="polite">
          {value}
        </b>
        <button
          type="button"
          aria-label={`Tambah ${label.toLowerCase()}`}
          disabled={value >= max}
          onClick={() => onChange(Math.min(max, value + 1))}
          className="size-10 text-xl font-extrabold disabled:opacity-30"
        >
          +
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
  const btn = cn(
    'flex shrink-0 items-center justify-center rounded-full border border-line-strong bg-white text-[22px] font-bold text-ink shadow-card disabled:opacity-40',
    size === 48 ? 'size-12 text-2xl' : 'size-11',
  );
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={label}>
      <button
        type="button"
        className={btn}
        aria-label={`Kurangi ${label}`}
        disabled={value <= min}
        onClick={() => onChange(value - 1)}
      >
        −
      </button>
      <b
        className={cn(
          'text-center tabular-nums',
          size === 48 ? 'w-[30px] text-[22px]' : 'w-[22px] text-[19px]',
        )}
        aria-live="polite"
      >
        {value}
      </b>
      <button
        type="button"
        className={btn}
        aria-label={`Tambah ${label}`}
        onClick={() => onChange(value + 1)}
      >
        +
      </button>
    </div>
  );
}
