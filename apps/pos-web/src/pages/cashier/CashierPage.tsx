/** Kasir – pilih menu (layar utama kasir) — acuan: docs/mockups/Main.dc.html. */
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatMoney, hasPermission, matchesLocalized, tl, type MenuItemDto } from '@pos/shared';
import { Card, Chip, EmptyState, cn } from '../../components/ui';
import { ErrorBlock, LoadingBlock, Screen } from '../../components/common';
import { CashierActions } from '../../components/cashier/CashierHeader';
import { OptionSheet } from '../../components/cashier/OptionSheet';
import { useMe } from '../../lib/auth';
import { addLine, computeCart, kindToChannelType, priceFor, qtyByItem, setCart, useCart } from '../../lib/cart';
import { useCurrentShift, useMoney, usePublicSettings, useStaffMenu } from '../../lib/data';
import { OpenShiftForm } from '../shift/OpenShiftPage';

export default function CashierPage() {
  const { t, i18n } = useTranslation();
  const { data: me } = useMe();
  const shift = useCurrentShift();

  let body: React.ReactNode;
  if (shift.isLoading) body = <LoadingBlock />;
  else if (shift.isError) body = <div className="p-4"><ErrorBlock error={shift.error} onRetry={() => void shift.refetch()} /></div>;
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
      .sort((a, b) => (catById.get(a.categoryId)?.sort ?? 0) - (catById.get(b.categoryId)?.sort ?? 0) || a.sort - b.sort);
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
      <header className="flex shrink-0 flex-col gap-2.5 border-b border-line bg-white px-3.5 py-2.5">
        <div className="flex items-center gap-2.5">
          {settings.data?.logoUrl ? (
            <img src={settings.data.logoUrl} alt="" className="size-10 shrink-0 rounded-[10px] object-cover" />
          ) : (
            <div className="flex size-10 shrink-0 items-center justify-center rounded-[10px] border-2 border-dashed border-line-strong bg-[#F2F4F7] text-[9px] font-bold text-muted">
              LOGO
            </div>
          )}
          <div className="flex min-w-0 grow flex-col">
            <b className="truncate text-xl leading-tight">{title}</b>
            <span className="truncate text-[13px] text-muted">{t('cashier.shiftBy', { shift: shiftName, name: me?.name ?? '' })}</span>
          </div>
          <CashierActions />
        </div>
        <div className="relative">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#667085" strokeWidth="2.2" strokeLinecap="round" aria-hidden className="absolute left-3 top-3">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            type="search"
            aria-label={t('cashier.searchMenu')}
            placeholder={t('cashier.searchMenu')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 w-full rounded-xl border border-line-strong pl-10 pr-3 text-ink"
          />
        </div>
        <nav aria-label={t('admin.category')} className="-mx-3.5 flex gap-1.5 overflow-x-auto px-3.5 pb-0.5">
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

      <main className="min-h-0 grow overflow-y-auto px-3.5 pb-[100px] pt-3">
        {menu.isLoading ? <LoadingBlock /> : null}
        {menu.isError ? <ErrorBlock error={menu.error} onRetry={() => void menu.refetch()} /> : null}
        {menu.data && !items.length ? <EmptyState title={t('order.noResults')} /> : null}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
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
                  'relative flex flex-col overflow-hidden rounded-[14px] p-0 text-left text-ink',
                  qty ? 'border-2 border-primary bg-white' : 'border border-line bg-white',
                  disabled && 'cursor-not-allowed bg-[#F2F4F7] opacity-60',
                )}
              >
                <div className="flex h-[92px] w-full items-center justify-center bg-[#EEF1F5] text-[#98A2B3]">
                  {m.photoUrl ? (
                    <img src={m.photoUrl} alt="" loading="lazy" className="size-full object-cover" />
                  ) : (
                    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                      <path d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
                    </svg>
                  )}
                </div>
                <div className="flex w-full flex-col gap-0.5 px-2.5 pb-2.5 pt-2">
                  <span className="text-base font-bold leading-tight">{tl(m.name, lang)}</span>
                  <span className="text-[17px] font-extrabold">
                    {price !== null ? formatMoney(price, money.main) : <span className="text-sm text-muted">{t('kasir.notOnChannel')}</span>}
                  </span>
                </div>
                {qty ? (
                  <span aria-hidden className="absolute right-2 top-2 flex size-[34px] items-center justify-center rounded-full bg-primary text-[17px] font-extrabold text-white">
                    {qty}
                  </span>
                ) : null}
                {soldOut ? (
                  <span aria-hidden className="absolute inset-x-0 top-[30px] text-center">
                    <span className="rounded-lg bg-danger px-3.5 py-[5px] text-base font-extrabold text-white">{t('common.soldOut')}</span>
                  </span>
                ) : null}
              </button>
            );
          })}
        </div>
      </main>

      {totals.count > 0 ? (
        <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 mx-auto w-full max-w-[960px] px-3">
          <button
            type="button"
            onClick={() => navigate('/kasir/pesanan')}
            className="pointer-events-auto flex h-16 w-full items-center justify-between rounded-2xl bg-primary px-[18px] text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)]"
          >
            <span className="flex flex-col text-left">
              <span className="text-sm opacity-90">{t('common.items', { count: totals.count })}</span>
              <b className="text-xl">{formatMoney(totals.total, money.main)}</b>
            </span>
            <b className="text-lg">{t('kasir.viewOrder')} ›</b>
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
          if (sheetItem) setCart((c) => ({ lines: addLine(c.lines, { itemId: sheetItem.id, qty, optionIds, note }) }));
          setSheetItem(null);
        }}
      />
    </>
  );
}
