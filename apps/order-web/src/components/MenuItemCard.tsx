import { useTranslation } from 'react-i18next';
import { tl, type Currency, type PublicMenuItem } from '@pos/shared';
import { money } from '../lib/menu';
import { FoodIcon } from './Icons';
import { Icon, cn } from './ui';

export interface ItemActions {
  qty: number;
  onAdd: () => void;
  onDec: () => void;
}

function Photo({ item, className }: { item: PublicMenuItem; className: string }) {
  return (
    <div
      className={cn(
        'flex shrink-0 items-center justify-center overflow-hidden bg-surface-container-high text-outline',
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
        'flex shrink-0 items-center gap-3 rounded-md bg-surface-container-lowest p-3 shadow-e1',
        soldOut && 'opacity-60 shadow-none',
      )}
      aria-label={name}
      data-testid={`item-${item.id}`}
    >
      <Photo item={item} className="size-[84px] rounded-sm" />
      <div className="flex min-w-0 grow flex-col gap-1">
        <h3 className="text-title-medium">{name}</h3>
        {desc ? <p className="line-clamp-1 text-body-medium text-on-surface-variant">{desc}</p> : null}
        {item.bestSeller ? (
          <span className="flex items-center gap-1 self-start rounded-sm bg-warning-container px-2 py-0.5 text-label-medium text-on-warning-container">
            <Icon name="local_fire_department" size={16} />
            {t('web.bestTag')}
          </span>
        ) : null}
        <b className="text-body-large font-medium text-primary tabular-nums">{money(item.price, currency)}</b>
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
      <span className="shrink-0 rounded-sm bg-error-container px-2.5 py-1.5 text-label-large text-on-error-container">
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
          'state-layer flex shrink-0 items-center justify-center gap-1 rounded-full text-label-large',
          variant === 'pill'
            ? 'h-12 bg-secondary-container pl-3 pr-4 text-on-secondary-container'
            : 'h-12 w-full bg-primary text-on-primary',
        )}
      >
        <Icon name="add" size={20} />
        {t('order.add')}
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
          ? 'h-12 gap-0.5 rounded-full bg-primary text-on-primary'
          : 'h-12 w-full justify-between rounded-full bg-secondary-container text-on-secondary-container',
      )}
    >
      <button
        type="button"
        onClick={onDec}
        aria-label={t('web.decItem', { name })}
        className="state-layer flex h-12 w-12 items-center justify-center rounded-full"
      >
        <Icon name="remove" />
      </button>
      <b className="min-w-4 text-center text-title-medium font-medium tabular-nums" aria-live="polite">
        {qty}
      </b>
      <button
        type="button"
        onClick={onAdd}
        aria-label={t('web.incItem', { name })}
        className="state-layer flex h-12 w-12 items-center justify-center rounded-full"
      >
        <Icon name="add" />
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
        'flex w-[160px] shrink-0 flex-col overflow-hidden rounded-md bg-surface-container-lowest shadow-e1',
        !item.available && 'opacity-60',
      )}
      aria-label={name}
    >
      <div className="relative h-[100px]">
        <Photo item={item} className="size-full" />
        <span className="absolute left-2 top-2 flex items-center gap-1 rounded-sm bg-warning-container px-2 py-0.5 text-label-medium text-on-warning-container">
          <Icon name="local_fire_department" size={16} />
          {t('web.bestTag')}
        </span>
      </div>
      <div className="flex grow flex-col gap-1 px-3 pb-3 pt-2">
        <h3 className="text-title-medium">{name}</h3>
        <b className="text-body-large font-medium text-primary tabular-nums">{money(item.price, currency)}</b>
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
