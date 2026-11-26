import { useTranslation } from 'react-i18next';
import { tl, type Currency, type PublicMenuItem } from '@pos/shared';
import { money } from '../lib/menu';
import { Icon, cn } from './ui';

export interface ItemActions {
  qty: number;
  onAdd: () => void;
  onDec: () => void;
  /** Ketuk kartu (bukan tombol) → buka halaman detail menu. */
  onOpen?: () => void;
}

/**
 * Warna ubin menu tanpa foto — satu nada per kategori (bagian menu terlihat rapi, bukan kotak abu-abu).
 * Kelas ditulis utuh supaya terbaca Tailwind.
 */
const TINTS = [
  'bg-primary-container/60 text-on-primary-container',
  'bg-warning-container/85 text-on-warning-container',
  'bg-tertiary-container/85 text-on-tertiary-container',
  'bg-error-container/75 text-on-error-container',
] as const;

export function tintFor(item: Pick<PublicMenuItem, 'categoryId' | 'id'>): string {
  const k = item.categoryId ?? item.id;
  return TINTS[Math.abs(k) % TINTS.length]!;
}

/**
 * Monogram nama: huruf awal 2 kata pertama ("Ayam Goreng" → "AG"); Khmer / Mandarin (tanpa spasi) → 1 huruf.
 * Per code point supaya aman untuk aksara non-Latin.
 */
export function initialOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  const first = (w: string | undefined) => (w ? (Array.from(w)[0] ?? '') : '');
  const latin = /^[\p{Script=Latin}\d]/u;
  const a = first(words[0]);
  const b = words.length > 1 && latin.test(a) && latin.test(first(words[1])) ? first(words[1]) : '';
  return (a + b).toUpperCase() || '•';
}

/**
 * Foto menu, atau ubin berwarna dengan huruf awal + motif kawung bila belum ada foto.
 * `size` mengatur besar huruf. Habis → foto/ubin dibuat pudar.
 */
export function DishTile({
  item,
  name,
  className,
  size = 'md',
  soldOut,
  fit = 'cover',
}: {
  item: PublicMenuItem;
  name: string;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  soldOut?: boolean;
  /** contain = foto utuh tanpa terpotong (latar foto yang diburamkan mengisi sisa ruang). */
  fit?: 'cover' | 'contain';
}) {
  return (
    <div
      className={cn(
        'relative isolate flex shrink-0 items-center justify-center overflow-hidden',
        item.photoUrl ? 'bg-surface-container-high' : tintFor(item),
        soldOut && 'grayscale',
        className,
      )}
      aria-hidden
    >
      {item.photoUrl && fit === 'contain' ? (
        <>
          <img
            src={item.photoUrl}
            alt=""
            decoding="async"
            className="absolute inset-0 -z-10 size-full scale-110 object-cover opacity-60 blur-xl"
          />
          <img
            src={item.photoUrl}
            alt=""
            decoding="async"
            className={cn('size-full object-contain', soldOut && 'opacity-60')}
          />
        </>
      ) : item.photoUrl ? (
        <img
          src={item.photoUrl}
          alt=""
          loading="lazy"
          decoding="async"
          className={cn('size-full object-cover', soldOut && 'opacity-60')}
        />
      ) : (
        <>
          <span className="motif-kawung absolute inset-0 -z-10 opacity-[0.07]" />
          <span
            className={cn(
              'font-display leading-none opacity-85',
              size === 'sm' && 'text-[22px]',
              size === 'md' && 'text-[34px]',
              size === 'lg' && 'text-[52px]',
            )}
          >
            {initialOf(name)}
          </span>
        </>
      )}
    </div>
  );
}

/** Area kartu yang bisa diketuk untuk membuka detail; tanpa `onOpen` (mis. habis) → div biasa. */
function Tappable({
  onOpen,
  label,
  testId,
  className,
  children,
}: {
  onOpen?: () => void;
  label: string;
  testId?: string;
  className: string;
  children: React.ReactNode;
}) {
  if (!onOpen) return <div className={className}>{children}</div>;
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={label}
      data-testid={testId}
      className={cn(className, 'active:bg-on-surface/5')}
    >
      {children}
    </button>
  );
}

function BestTag({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 rounded-full bg-warning-container py-0.5 pl-1.5 pr-2.5 text-label-medium text-on-warning-container',
        className,
      )}
    >
      <Icon name="local_fire_department" size={16} filled />
      {t('web.bestTag')}
    </span>
  );
}

/**
 * Kartu menu di daftar (gaya aplikasi pesan antar): nama + deskripsi + harga di kiri, foto/ubin di kanan,
 * baris bawah harga ↔ + Tambah / stepper / Habis.
 */
export function MenuItemCard({
  item,
  currency,
  qty,
  onAdd,
  onDec,
  onOpen,
}: { item: PublicMenuItem; currency: Currency } & ItemActions) {
  const { t, i18n } = useTranslation();
  const name = tl(item.name, i18n.language);
  const desc = tl(item.description, i18n.language);
  const soldOut = !item.available;
  return (
    <article
      className={cn(
        'flex shrink-0 flex-col gap-2 rounded-2xl bg-surface-container-lowest p-3 pl-4 transition-shadow',
        soldOut ? 'shadow-none ring-1 ring-outline-variant/60' : 'shadow-card',
        qty > 0 && !soldOut && 'ring-2 ring-primary/70',
      )}
      aria-label={name}
      data-testid={`item-${item.id}`}
    >
      <Tappable
        onOpen={soldOut ? undefined : onOpen}
        label={t('web.openItem', { name })}
        testId={`open-${item.id}`}
        className="-m-1 flex items-start gap-3 rounded-xl p-1 text-left"
      >
        <div className="flex min-w-0 grow flex-col gap-1 pt-1">
          <h3 className={cn('text-title-medium font-semibold', soldOut && 'text-on-surface-variant')}>
            {name}
          </h3>
          {desc ? <p className="line-clamp-2 text-body-medium text-on-surface-variant">{desc}</p> : null}
          {item.bestSeller ? <BestTag className="mt-0.5 self-start" /> : null}
        </div>
        <DishTile item={item} name={name} soldOut={soldOut} className="size-[92px] rounded-lg" />
      </Tappable>
      <div className="flex min-h-12 items-center justify-between gap-2">
        <b
          className={cn(
            'text-title-medium font-bold tabular-nums',
            soldOut ? 'text-on-surface-variant line-through decoration-1' : 'text-on-surface',
          )}
        >
          {money(item.price, currency)}
        </b>
        <ItemControl name={name} soldOut={soldOut} qty={qty} onAdd={onAdd} onDec={onDec} variant="pill" />
      </div>
    </article>
  );
}

export function ItemControl({
  name,
  soldOut,
  qty,
  onAdd,
  onDec,
  variant,
}: {
  name: string;
  soldOut: boolean;
  variant: 'pill' | 'block';
} & ItemActions) {
  const { t } = useTranslation();
  if (soldOut) {
    return (
      <span
        className={cn(
          'inline-flex h-10 shrink-0 items-center justify-center gap-1 rounded-full bg-surface-container-highest px-3.5 text-label-large text-on-surface-variant',
          variant === 'block' && 'h-12 w-full',
        )}
      >
        <Icon name="block" size={18} />
        {t('order.soldOut')}
      </span>
    );
  }
  if (qty === 0) {
    return (
      <button
        type="button"
        onClick={onAdd}
        aria-label={t('web.addItem', { name })}
        className={cn(
          'state-layer flex h-12 shrink-0 items-center justify-center gap-1 rounded-full bg-primary-container pl-3.5 pr-4.5 text-label-large font-semibold text-on-primary-container transition-transform active:scale-95',
          variant === 'block' && 'w-full',
        )}
      >
        <Icon name="add" size={22} />
        {t('order.add')}
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label={t('web.qtyOf', { name })}
      className={cn(
        'flex h-12 shrink-0 animate-fade-in items-center rounded-full bg-primary text-on-primary shadow-e1',
        variant === 'block' ? 'w-full justify-between' : 'gap-0.5',
      )}
    >
      <button
        type="button"
        onClick={onDec}
        aria-label={t('web.decItem', { name })}
        className="state-layer flex size-12 items-center justify-center rounded-full"
      >
        <Icon name="remove" />
      </button>
      <b
        key={qty}
        className="min-w-6 animate-pop text-center text-title-medium font-bold tabular-nums"
        aria-live="polite"
      >
        {qty}
      </b>
      <button
        type="button"
        onClick={onAdd}
        aria-label={t('web.incItem', { name })}
        className="state-layer flex size-12 items-center justify-center rounded-full"
      >
        <Icon name="add" />
      </button>
    </div>
  );
}

/** Kartu carousel "Paling laris": foto/ubin 4:3, nama 2 baris, harga, tombol penuh. */
export function BestCard({
  item,
  currency,
  qty,
  onAdd,
  onDec,
  onOpen,
}: { item: PublicMenuItem; currency: Currency } & ItemActions) {
  const { t, i18n } = useTranslation();
  const name = tl(item.name, i18n.language);
  const soldOut = !item.available;
  return (
    <article
      className={cn(
        'flex w-[172px] shrink-0 snap-start flex-col overflow-hidden rounded-2xl bg-surface-container-lowest',
        soldOut ? 'ring-1 ring-outline-variant/60' : 'shadow-card',
      )}
      aria-label={name}
    >
      <Tappable
        onOpen={soldOut ? undefined : onOpen}
        label={t('web.openItem', { name })}
        className="flex flex-col text-left"
      >
        <div className="relative w-full">
          <DishTile item={item} name={name} soldOut={soldOut} size="lg" className="aspect-[4/3] w-full" />
          <BestTag className="absolute left-2 top-2 shadow-e1" />
        </div>
        <div className="flex w-full flex-col gap-1 px-3 pt-2.5">
          <h3
            className={cn(
              'line-clamp-2 min-h-12 text-title-medium font-semibold',
              soldOut && 'text-on-surface-variant',
            )}
          >
            {name}
          </h3>
          <b className="text-title-medium font-bold tabular-nums">{money(item.price, currency)}</b>
        </div>
      </Tappable>
      <div className="flex grow flex-col gap-1 px-3 pb-3">
        <div className="grow" />
        <div className="mt-1.5">
          <ItemControl name={name} soldOut={soldOut} qty={qty} onAdd={onAdd} onDec={onDec} variant="block" />
        </div>
      </div>
    </article>
  );
}
