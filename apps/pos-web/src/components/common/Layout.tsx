import { createContext, useContext, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon, IconButton, cn } from '../ui';
import { useWindowSizeClass } from '../../lib/windowSize';
import { NavigationBar, NavigationRail } from './NavigationBar';

/**
 * Peran layar di dalam tata letak list-detail (tablet): 'list' = panel kiri, 'detail' = panel kanan,
 * 'pinned' = panel kanan yang selalu tampil (keranjang kasir). null = layar penuh biasa.
 */
export type PaneRole = 'list' | 'detail' | 'pinned' | null;
const PaneCtx = createContext<PaneRole>(null);
export const usePane = () => useContext(PaneCtx);

/**
 * Bingkai aplikasi: navigation rail di kiri (medium/expanded) atau navigation bar di bawah (compact) —
 * tidak pernah keduanya (SKILL §8b). `activePath` = tujuan yang disorot (untuk layar list-detail).
 */
export function AppFrame({
  children,
  activePath,
  lang,
}: {
  children: ReactNode;
  activePath?: string;
  lang?: string;
}) {
  const size = useWindowSizeClass();
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-surface">
      {size !== 'compact' ? <NavigationRail activePath={activePath} lang={lang} /> : null}
      <div className="flex min-h-0 min-w-0 grow flex-col">
        <div className="flex min-h-0 grow flex-col">{children}</div>
        {size === 'compact' ? <NavigationBar activePath={activePath} lang={lang} /> : null}
      </div>
    </div>
  );
}

/**
 * Kerangka layar: tinggi penuh, top app bar & footer tetap, isi bisa digulir. HP-first; di tablet lebar isi
 * dibatasi (form 640px, layar daftar `wide` 1200px) dan navigasi pindah ke rail kiri.
 */
export function Screen({
  children,
  className,
  wide,
  testId,
  lang,
}: {
  children: ReactNode;
  className?: string;
  /** Layar berisi grid/daftar: lebar maksimal 1200px (selain itu 640px, enak dibaca). */
  wide?: boolean;
  testId?: string;
  lang?: string;
}) {
  const pane = usePane();
  const [scrolled, setScrolled] = useState(false);
  const body = (
    <div
      data-testid={testId}
      lang={lang}
      data-scrolled={scrolled || undefined}
      onScrollCapture={(e) => {
        const el = e.target as HTMLElement;
        if (el.tagName === 'MAIN') setScrolled(el.scrollTop > 4);
      }}
      className={cn(
        'group/screen relative mx-auto flex h-full min-h-0 w-full flex-col overflow-hidden bg-surface',
        pane ? '' : wide ? 'max-w-[1200px]' : 'max-w-[640px]',
        className,
      )}
    >
      {children}
    </div>
  );
  return pane ? body : <AppFrame lang={lang}>{body}</AppFrame>;
}

/**
 * Tata letak list-detail (SKILL §8b): di layar expanded daftar & detail tampil berdampingan; di HP hanya
 * salah satu (detail bila ada). `pinned` = panel detail selalu tampil (keranjang kasir).
 */
export function ListDetail({
  list,
  detail,
  placeholder,
  activePath,
  pinned,
  detailWidth = 'w-[400px]',
}: {
  list: ReactNode;
  detail?: ReactNode | null;
  placeholder?: ReactNode;
  activePath: string;
  pinned?: boolean;
  detailWidth?: string;
}) {
  const size = useWindowSizeClass();
  if (size !== 'expanded') return <>{detail && !pinned ? detail : list}</>;
  return (
    <AppFrame activePath={activePath}>
      <div className="mx-auto flex h-full min-h-0 w-full max-w-[1600px]">
        <div className="flex min-h-0 min-w-0 grow flex-col" data-pane="list">
          <PaneCtx.Provider value="list">{list}</PaneCtx.Provider>
        </div>
        <div
          className={cn(
            'flex min-h-0 shrink-0 flex-col border-l border-outline-variant bg-surface-container-low',
            detail ? detailWidth : 'w-[400px]',
          )}
          data-pane="detail"
        >
          <PaneCtx.Provider value={pinned ? 'pinned' : 'detail'}>
            {detail ?? (
              <div className="flex h-full flex-col items-center justify-center gap-3 p-8 text-center text-on-surface-variant">
                {placeholder}
              </div>
            )}
          </PaneCtx.Provider>
        </div>
      </div>
    </AppFrame>
  );
}

/** Isi layar yang bisa digulir (padding layar 16px, jarak antarkartu 12px). */
export function ScreenBody({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <main className={cn('flex min-h-0 grow flex-col gap-3 overflow-y-auto px-4 py-3', className)}>
      {children}
    </main>
  );
}

/** Area aksi bawah (surface-container) dengan tombol utama (safe-area). */
export function ScreenFooter({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <footer
      className={cn(
        'flex shrink-0 flex-col gap-2 bg-surface-container px-4 pt-3',
        'pb-[max(16px,env(safe-area-inset-bottom))]',
        className,
      )}
    >
      {children}
    </footer>
  );
}

/** Tombol kembali top app bar (ikon arrow_back 48px, aria-label "Kembali ke …"). */
export function BackButton({ label, onClick }: { label: string; onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <IconButton
      icon="arrow_back"
      label={t('bnav.backTo', { label })}
      onClick={onClick}
      className="text-on-surface"
    />
  );
}

/** Top app bar kecil M3 (64px, title-large): tombol kembali + judul + aksi kanan; tonal saat isi digulir. */
export function TopBar({
  back,
  title,
  subtitle,
  right,
  children,
}: {
  back?: { label: string; onClick: () => void };
  title: ReactNode;
  subtitle?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
}) {
  const pinned = usePane() === 'pinned';
  return (
    <header
      className={cn(
        'flex shrink-0 flex-col bg-surface transition-colors duration-200 ease-standard',
        'group-data-[scrolled]/screen:bg-surface-container',
        children ? 'pb-2' : '',
      )}
    >
      <div className="flex min-h-16 items-center gap-1 px-1">
        {back && !pinned ? (
          <BackButton label={back.label} onClick={back.onClick} />
        ) : (
          <span className="w-3 shrink-0" />
        )}
        <div className="flex min-w-0 grow flex-col px-1">
          <h1 className="truncate text-title-large">{title}</h1>
          {subtitle ? (
            <span className="truncate text-label-medium font-normal text-on-surface-variant">{subtitle}</span>
          ) : null}
        </div>
        {right ? <div className="flex shrink-0 items-center gap-0.5 pr-1">{right}</div> : null}
      </div>
      {children ? <div className="flex flex-col gap-2 px-4">{children}</div> : null}
    </header>
  );
}

/** Tab utama M3: label-large, indikator 3px di bawah tab aktif, garis pemisah. */
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
      className="grid border-b border-surface-container-highest"
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
              'state-layer relative flex items-center justify-center px-1',
              dense ? 'h-12 text-label-medium' : 'h-12 text-label-large',
              active ? 'text-primary' : 'text-on-surface-variant',
            )}
          >
            <span className="truncate">{tb.label}</span>
            {active ? (
              <span className="absolute inset-x-3 bottom-0 h-[3px] rounded-t-full bg-primary" aria-hidden />
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

/** Bagian berisi (surface-container-low, radius 12) dengan judul title-medium. */
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
    <section
      className={cn('flex shrink-0 flex-col gap-3 rounded-md bg-surface-container-low p-4', className)}
    >
      {title || right ? (
        <div className="flex min-h-6 items-center justify-between gap-2">
          {title ? <h2 className="text-title-medium">{title}</h2> : <span />}
          {right}
        </div>
      ) : null}
      {children}
    </section>
  );
}

/** Baris daftar M3 (56px) yang bisa diketuk: ikon depan opsional, label, chevron. */
export function ListRow({
  label,
  supporting,
  icon,
  onClick,
  trailing,
}: {
  label: ReactNode;
  supporting?: ReactNode;
  icon?: Parameters<typeof Icon>[0]['name'];
  onClick: () => void;
  trailing?: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="state-layer flex min-h-14 w-full items-center gap-4 px-4 py-2 text-left"
    >
      {icon ? <Icon name={icon} className="text-on-surface-variant" /> : null}
      <span className="flex min-w-0 grow flex-col">
        <span className="text-body-large">{label}</span>
        {supporting ? <span className="text-body-medium text-on-surface-variant">{supporting}</span> : null}
      </span>
      {trailing ?? <Icon name="chevron_right" className="text-on-surface-variant" />}
    </button>
  );
}

/** Extended FAB M3 (aksi buat satu-satunya di layar): kanan bawah, di atas navigation bar. */
export function ExtendedFab({
  icon = 'add',
  label,
  onClick,
}: {
  icon?: Parameters<typeof Icon>[0]['name'];
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="state-layer absolute bottom-4 right-4 z-20 flex h-14 items-center gap-3 rounded-lg bg-primary-container pl-4 pr-5 text-label-large text-on-primary-container shadow-e3"
    >
      <Icon name={icon} />
      {label}
    </button>
  );
}

/** Tombol pilihan besar (grid) — terpilih: secondary-container + garis primary + centang. */
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
        'state-layer min-h-12 rounded-md px-2 text-label-large disabled:text-on-surface/38',
        selected
          ? 'border-2 border-primary bg-secondary-container text-on-secondary-container'
          : 'border border-outline-variant bg-surface-container-lowest text-on-surface',
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}
