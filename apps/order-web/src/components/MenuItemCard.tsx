import { useTranslation } from 'react-i18next';
import { tl, type Currency, type PublicMenuItem } from '@pos/shared';
import { money } from '../lib/menu';
import { FoodIcon } from './Icons';
import { cn } from './ui';

export interface ItemActions {
  qty: number;
  onAdd: () => void;
  onDec: () => void;
}

function Photo({ item, className }: { item: PublicMenuItem; className: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden bg-[#EEF1F5] text-[#98A2B3]',
        className,
      )}
    >
      {item.photoUrl ? (
        <img src={item.photoUrl} alt="" loading="lazy" decoding="async" className="size-full object-cover" />
      ) : (
        <FoodIcon />
      )}
    </div>
  );
}

/** Kartu menu di daftar (mockup Website: foto 84px, nama, Terlaris, harga, + Tambah / stepper / Habis). */
export function MenuItemCard({
  item,
  currency,
  qty,
  onAdd,
  onDec,
}: { item: PublicMenuItem; currency: Currency } & ItemActions) {
  const { t, i18n } = useTranslation();
  const name = tl(item.name, i18n.language);
  const desc = tl(item.description, i18n.language);
  const soldOut = !item.available;
  return (
    <article
      className={cn(
        'flex shrink-0 items-center gap-3 rounded-[14px] bg-white p-2.5 shadow-card',
        soldOut && 'opacity-55',
      )}
      aria-label={name}
      data-testid={`item-${item.id}`}
    >
      <Photo item={item} className="size-[84px] rounded-[10px]" />
      <div className="flex min-w-0 grow flex-col gap-1">
        <h3 className="text-base font-bold leading-snug">{name}</h3>
        {desc ? <p className="line-clamp-1 text-[13px] text-muted">{desc}</p> : null}
        {item.bestSeller ? (
          <span className="self-start rounded-md bg-[#FEF0C7] px-2 py-0.5 text-xs font-bold text-warn-dark">
            {t('web.bestTag')}
          </span>
        ) : null}
        <b className="text-base text-primary-dark tabular-nums">{money(item.price, currency)}</b>
      </div>
      <ItemControl name={name} soldOut={soldOut} qty={qty} onAdd={onAdd} onDec={onDec} variant="pill" />
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
      <span className="shrink-0 rounded-lg bg-danger px-2.5 py-1.5 text-[13px] font-extrabold text-white">
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
          'shrink-0 font-extrabold',
          variant === 'pill'
            ? 'h-12 rounded-full border-[1.5px] border-primary bg-white px-4 text-[15px] text-primary shadow-card'
            : 'h-11 w-full rounded-[10px] bg-primary text-[15px] text-white',
        )}
      >
        + {t('order.add')}
      </button>
    );
  }
  return (
    <div
      role="group"
      aria-label={t('web.qtyOf', { name })}
      className={cn(
        'flex shrink-0 items-center',
        variant === 'pill'
          ? 'h-12 gap-0.5 rounded-full bg-primary text-white'
          : 'h-11 w-full justify-between rounded-[10px] bg-primary-tint text-primary-dark',
      )}
    >
      <button
        type="button"
        onClick={onDec}
        aria-label={t('web.decItem', { name })}
        className="flex h-12 w-11 items-center justify-center text-2xl font-extrabold"
      >
        −
      </button>
      <b className="min-w-4 text-center tabular-nums" aria-live="polite">
        {qty}
      </b>
      <button
        type="button"
        onClick={onAdd}
        aria-label={t('web.incItem', { name })}
        className="flex h-12 w-11 items-center justify-center text-2xl font-extrabold"
      >
        +
      </button>
    </div>
  );
}

/** Kartu kecil carousel "Paling laris". */
export function BestCard({
  item,
  currency,
  qty,
  onAdd,
  onDec,
}: { item: PublicMenuItem; currency: Currency } & ItemActions) {
  const { t, i18n } = useTranslation();
  const name = tl(item.name, i18n.language);
  return (
    <article
      className={cn(
        'flex w-[150px] shrink-0 flex-col overflow-hidden rounded-[14px] bg-white shadow-card',
        !item.available && 'opacity-55',
      )}
      aria-label={name}
    >
      <div className="relative h-[100px]">
        <Photo item={item} className="size-full" />
        <span className="absolute left-2 top-2 rounded-md bg-ink px-2 py-0.5 text-[11px] font-bold text-white">
          {t('web.bestTag')}
        </span>
      </div>
      <div className="flex grow flex-col gap-1.5 px-2.5 pb-2.5 pt-2">
        <h3 className="text-sm font-bold leading-snug">{name}</h3>
        <b className="text-[15px] text-primary-dark tabular-nums">{money(item.price, currency)}</b>
        <div className="grow" />
        <ItemControl
          name={name}
          soldOut={!item.available}
          qty={qty}
          onAdd={onAdd}
          onDec={onDec}
          variant="block"
        />
      </div>
    </article>
  );
}
