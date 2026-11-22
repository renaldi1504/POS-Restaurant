/** Kasir – pilih menu (layar utama kasir) — acuan: docs/mockups/Main.dc.html. */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatMoney, hasPermission, matchesLocalized, tl, type MenuItemDto } from '@pos/shared';
import { Card, Chip, EmptyState, Icon, cn } from '../../components/ui';
import { ErrorBlock, LoadingBlock, Screen, usePane } from '../../components/common';
import { CashierActions, CashierShortcuts } from '../../components/cashier/CashierHeader';
import { OptionSheet } from '../../components/cashier/OptionSheet';
import { useMe } from '../../lib/auth';
import {
  addLine,
  computeCart,
  kindToChannelType,
  priceFor,
  qtyByItem,
  setCart,
  useCart,
} from '../../lib/cart';
import { useCurrentShift, useMoney, usePublicSettings, useStaffMenu } from '../../lib/data';
import { OpenShiftForm } from '../shift/OpenShiftPage';

export default function CashierPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const shift = useCurrentShift();

  let body: React.ReactNode;
  if (shift.isLoading) body = <LoadingBlock />;
  else if (shift.isError)
    body = (
      <div className="p-4">
        <ErrorBlock error={shift.error} onRetry={() => void shift.refetch()} />
      </div>
    );
  else if (!shift.data)
    body = hasPermission(me?.permissions, 'shift.manage') ? (
      <OpenShiftForm embedded />
    ) : (
      <div className="p-4">
        <Card>
          <EmptyState title={t('shift.noShift')} description={t('shiftx.askCashier')} />
        </Card>
      </div>
    );
  else body = <MenuGrid shiftName={shift.data.name} lang={i18n.language} />;

  return (
    <Screen wide testId="cashier-screen">
      <h1 className="sr-only">{t('cashier.title')}</h1>
      {body}
    </Screen>
  );
}

function MenuGrid({ shiftName, lang }: { shiftName: string; lang: string }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const settings = usePublicSettings();
  const money = useMoney();
  const menu = useStaffMenu();
  const cart = useCart();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<number | 'all'>('all');
  const [sheetItem, setSheetItem] = useState<MenuItemDto | null>(null);
  const pane = usePane();
  const { channel } = kindToChannelType(cart.kind);

  const totals = useMemo(() => computeCart(cart, menu.data), [cart, menu.data]);
  const inCart = useMemo(() => qtyByItem(cart.lines), [cart.lines]);
  const categories = useMemo(() => menu.data?.categories ?? [], [menu.data]);
  const catById = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const items = useMemo(() => {
    const list = menu.data?.items ?? [];
    return list
      .filter((i) => (cat === 'all' ? true : i.categoryId === cat))
      .filter((i) => matchesLocalized(q, i.name, catById.get(i.categoryId)?.name))
      .sort(
        (a, b) =>
          (catById.get(a.categoryId)?.sort ?? 0) - (catById.get(b.categoryId)?.sort ?? 0) || a.sort - b.sort,
      );
  }, [menu.data, cat, q, catById]);
  const groupsFor = (item: MenuItemDto) =>
    item.optionGroupIds
      .map((id) => menu.data?.optionGroups.find((g) => g.id === id))
      .filter((g): g is NonNullable<typeof g> => !!g);

  const tap = (item: MenuItemDto) => {
    const groups = groupsFor(item);
    if (groups.length) setSheetItem(item);
    else setCart((c) => ({ lines: addLine(c.lines, { itemId: item.id, qty: 1, optionIds: [] }) }));
  };

  const title = cart.editingDisplayNo
    ? t('kasir.editingOrder', { no: cart.editingDisplayNo })
    : cart.kind === 'dine_in' && cart.tableId
      ? t('kasir.addToTable')
      : t('kasir.newOrder');

  return (
    <>
      <header className="flex shrink-0 flex-col gap-2 bg-surface pb-2 transition-colors group-data-[scrolled]/screen:bg-surface-container">
        <div className="flex min-h-16 items-center gap-3 pl-4 pr-1">
          {settings.data?.logoUrl ? (
            <img src={settings.data.logoUrl} alt="" className="size-10 shrink-0 rounded-full object-cover" />
          ) : (
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-on-primary-container">
              <Icon name="storefront" />
            </span>
          )}
          <div className="flex min-w-0 grow flex-col">
            <b className="truncate text-title-large">{title}</b>
            <span className="truncate text-label-medium font-normal text-on-surface-variant">
              {t('cashier.shiftBy', { shift: shiftName, name: me?.name ?? '' })}
            </span>
          </div>
          <CashierActions />
        </div>
        <CashierShortcuts />
        <div className="px-4">
          <label className="flex h-14 items-center gap-3 rounded-full bg-surface-container-high px-4 text-on-surface-variant focus-within:outline-3 focus-within:outline-secondary">
            <Icon name="search" />
            <input
              type="search"
              aria-label={t('cashier.searchMenu')}
              placeholder={t('cashier.searchMenu')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-full min-w-0 grow bg-transparent text-body-large text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </label>
        </div>
        <nav aria-label={t('admin.category')} className="flex gap-2 overflow-x-auto px-4 py-1">
          <Chip active={cat === 'all'} onClick={() => setCat('all')}>
            {t('order.all')}
          </Chip>
          {categories.map((c) => (
            <Chip key={c.id} active={cat === c.id} onClick={() => setCat(c.id)}>
              {tl(c.name, lang)}
            </Chip>
          ))}
        </nav>
      </header>

      <main className="min-h-0 grow overflow-y-auto px-4 pb-4 pt-2">
        {menu.isLoading ? <LoadingBlock /> : null}
        {menu.isError ? <ErrorBlock error={menu.error} onRetry={() => void menu.refetch()} /> : null}
        {menu.data && !items.length ? <EmptyState icon="search" title={t('order.noResults')} /> : null}
        <div className="grid grid-cols-2 gap-3 medium:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
          {items.map((m) => {
            const price = priceFor(m, channel);
            const soldOut = !m.available;
            const notSold = price === null;
            const qty = inCart.get(m.id) ?? 0;
            const disabled = soldOut || notSold;
            return (
              <button
                key={m.id}
                type="button"
                disabled={disabled}
                onClick={() => tap(m)}
                aria-label={`${tl(m.name, lang)}, ${price !== null ? formatMoney(price, money.main) : t('kasir.notOnChannel')}${soldOut ? `, ${t('common.soldOut')}` : ''}${qty ? `, ${t('kasir.inCart', { count: qty })}` : ''}`}
                className={cn(
                  'state-layer relative flex flex-col overflow-hidden rounded-md text-left text-on-surface',
                  qty
                    ? 'bg-secondary-container text-on-secondary-container outline-2 outline-primary'
                    : 'bg-surface-container-lowest shadow-e1',
                  disabled && 'cursor-not-allowed bg-surface-container-high opacity-60 shadow-none',
                )}
              >
                <div className="flex aspect-[4/3] w-full items-center justify-center bg-surface-container-high text-outline">
                  {m.photoUrl ? (
                    <img src={m.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <Icon name="restaurant" size={32} />
                  )}
                </div>
                <div className="flex w-full flex-col gap-0.5 px-3 pb-3 pt-2">
                  <span className="text-title-medium leading-snug">{tl(m.name, lang)}</span>
                  <span className="text-body-large tabular-nums text-primary">
                    {price !== null ? (
                      formatMoney(price, money.main)
                    ) : (
                      <span className="text-label-medium text-on-surface-variant">
                        {t('kasir.notOnChannel')}
                      </span>
                    )}
                  </span>
                </div>
                {qty ? (
                  <span
                    aria-hidden
                    className="absolute right-2 top-2 flex size-9 items-center justify-center rounded-full bg-primary text-title-medium text-on-primary shadow-e1"
                  >
                    {qty}
                  </span>
                ) : null}
                {soldOut ? (
                  <span aria-hidden className="absolute inset-x-0 top-8 text-center">
                    <span className="rounded-sm bg-error-container px-3 py-1 text-label-large text-on-error-container">
                      {t('common.soldOut')}
                    </span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </main>

      {totals.count > 0 && pane !== 'list' ? (
        <div className="shrink-0 px-4 pb-3 pt-1">
          <button
            type="button"
            onClick={() => navigate('/kasir/pesanan')}
            className="state-layer flex h-16 w-full items-center justify-between rounded-lg bg-primary px-5 text-on-primary shadow-e2"
          >
            <span className="flex flex-col text-left">
              <span className="text-label-medium opacity-90">
                {t('common.items', { count: totals.count })}
              </span>
              <b className="text-title-large tabular-nums">{formatMoney(totals.total, money.main)}</b>
            </span>
            <span className="flex items-center gap-1 text-title-medium">
              {t('kasir.viewOrder')}
              <Icon name="arrow_forward" />
            </span>
          </button>
        </div>
      ) : null}

      <OptionSheet
        item={sheetItem}
        groups={sheetItem ? groupsFor(sheetItem) : []}
        basePrice={sheetItem ? (priceFor(sheetItem, channel) ?? 0) : 0}
        currency={money.main}
        onClose={() => setSheetItem(null)}
        onAdd={({ optionIds, qty, note }) => {
          if (sheetItem)
            setCart((c) => ({ lines: addLine(c.lines, { itemId: sheetItem.id, qty, optionIds, note }) }));
          setSheetItem(null);
        }}
      />
    </>
  );
}
