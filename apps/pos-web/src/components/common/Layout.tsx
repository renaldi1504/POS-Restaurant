import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { cn } from '../ui';

/** Kerangka layar: tinggi penuh, header/footer tetap, isi bisa digulir. HP-first, melebar di tablet. */
export function Screen({
  children,
  className,
  wide,
  testId,
  lang,
}: {
  children: ReactNode;
  className?: string;
  /** Lebar maksimal lebih besar (tablet) untuk layar berisi grid/daftar. */
  wide?: boolean;
  testId?: string;
  lang?: string;
}) {
  return (
    <div
      data-testid={testId}
      lang={lang}
      className={cn(
        'mx-auto flex h-dvh w-full flex-col overflow-hidden bg-bg',
        wide ? 'max-w-[960px]' : 'max-w-[560px]',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Isi layar yang bisa digulir. */
export function ScreenBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('flex min-h-0 grow flex-col gap-3 overflow-y-auto px-3.5 py-3', className)}>
      {children}
    </main>
  );
}

/** Footer putih dengan tombol aksi (safe-area). */
export function ScreenFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer
      className={cn(
        'flex shrink-0 flex-col gap-2 border-t border-line bg-white px-3.5 pt-3',
        'pb-[max(16px,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </footer>
  );
}

/** Tombol kembali bertulisan ("‹ Kasir") seperti mockup. */
export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`${t('common.back')}: ${label}`}
      className="flex h-12 shrink-0 items-center rounded-xl border border-line-strong bg-white px-3.5 text-base font-bold text-ink"
    >
      ‹ {label}
    </button>
  );
}

/** Header 64px: tombol kembali + judul + elemen kanan. */
export function TopBar({
  back,
  title,
  subtitle,
  right,
  children,
  dark,
}: {
  back?: { label: string; onClick: () => void };
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  dark?: boolean;
}) {
  return (
    <header
      className={cn(
        'flex shrink-0 flex-col gap-2.5 border-b px-3 py-2',
        dark ? 'border-ink bg-ink text-white' : 'border-line bg-white',
      )}
    >
      <div className="flex min-h-12 items-center gap-2.5">
        {back ? <BackButton label={back.label} onClick={back.onClick} /> : null}
        <div className="flex min-w-0 grow flex-col">
          <h1 className="truncate text-[19px] font-extrabold leading-tight">{title}</h1>
          {subtitle ? (
            <span className={cn('truncate text-[13px]', dark ? 'text-[#D0D5DD]' : 'text-muted')}>{subtitle}</span>
          ) : null}
        </div>
        {right}
      </div>
      {children}
    </header>
  );
}

/** Tab bergaya segmen abu-abu (mockup Meja/Menu/Users/Driver). */
export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  label,
  dense,
}: {
  tabs: { value: T; label: string }[];
  value: T;
  onChange: (v: T) => void;
  label: string;
  dense?: boolean;
}) {
  return (
    <div
      role="tablist"
      aria-label={label}
      className="grid gap-1 rounded-xl bg-[#EEF0F3] p-1"
      style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
    >
      {tabs.map((tb) => {
        const active = tb.value === value;
        return (
          <button
            key={tb.value}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(tb.value)}
            className={cn(
              'truncate rounded-[9px] px-1 text-ink',
              dense ? 'h-10 text-sm' : 'h-[42px] text-[15px]',
              active ? 'bg-white font-extrabold shadow-[0_1px_3px_rgba(16,24,40,0.12)]' : 'font-semibold',
            )}
          >
            {tb.label}
          </button>
        );
      })}
    </div>
  );
}

/** Kartu putih section (radius 16, bayangan halus). */
export function Section({
  title,
  right,
  children,
  className,
}: {
  title?: ReactNode;
  right?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn('flex shrink-0 flex-col gap-2 rounded-card bg-white p-3 shadow-card', className)}>
      {title || right ? (
        <div className="flex items-center justify-between gap-2">
          {title ? <h2 className="text-base font-extrabold">{title}</h2> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Tombol pilihan besar (grid) — terpilih: border hijau + latar tint. */
export function ChoiceButton({
  selected,
  children,
  className,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { selected?: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      className={cn(
        'min-h-12 rounded-[14px] px-2 text-base text-ink disabled:opacity-45',
        selected
          ? 'border-2 border-primary bg-primary-tint font-extrabold'
          : 'border border-line-strong bg-white font-semibold shadow-card',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
