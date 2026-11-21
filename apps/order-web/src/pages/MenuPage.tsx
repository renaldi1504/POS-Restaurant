/**
 * Menu pelanggan — acuan: docs/mockups/Website.dc.html (mode biasa/telegram) & WebsiteMeja.dc.html (mode meja).
 * Mode ditentukan oleh route: `/` (none), `/tg` (telegram), `/m/:qrToken` (table).
 */
import { useId, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { tl, type CustomerMode, type OrderType, type PublicMenuItem } from '@pos/shared';
import { CartBar } from '../components/CartBar';
import { SearchIcon } from '../components/Icons';
import { BestCard, MenuItemCard } from '../components/MenuItemCard';
import { TableBanner, TelegramBanner } from '../components/ModeBanner';
import { OptionSheet } from '../components/OptionSheet';
import {
  BootErrorScreen,
  ErrorBlock,
  LangPicker,
  LoadingBlock,
  Page,
  StoreHeading,
} from '../components/Shell';
import { Card, cn, useToast } from '../components/ui';
import { useCart } from '../lib/cart';
import { useCheckout } from '../lib/checkout';
import { useCustomer } from '../lib/customer';
import {
  CAT_ALL,
  CAT_BEST,
  filterItems,
  formatHour,
  groupsForItem,
  mainCurrency,
  sortSoldOutLast,
  sortedCategories,
  useMenu,
  useSettings,
  type CategoryFilter,
} from '../lib/menu';
import { latestOrderId } from '../lib/recent';

export default function MenuPage({ mode: routeMode }: { mode: CustomerMode }) {
  const c = useCustomer();
  if (c.status === 'error') return <BootErrorScreen />;
  return <MenuScreen routeMode={routeMode} />;
}

function OrderTypePicker() {
  const { t } = useTranslation();
  const { state, update } = useCheckout();
  const types: { value: OrderType; label: string }[] = [
    { value: 'delivery', label: t('web.typeDelivery') },
    { value: 'takeaway', label: t('web.typeTakeaway') },
    { value: 'dine_in', label: t('web.typeDineIn') },
  ];
  return (
    <div
      role="radiogroup"
      aria-label={t('web.orderType')}
      className="grid grid-cols-3 gap-1 rounded-xl bg-[#EEF0F3] p-1"
    >
      {types.map((ty) => {
        const on = state.type === ty.value;
        return (
          <button
            key={ty.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => update({ type: ty.value })}
            className={cn(
              'min-h-11 rounded-[9px] px-1 text-sm leading-tight',
              on
                ? 'bg-white font-extrabold shadow-[0_1px_3px_rgba(0,0,0,0.15)]'
                : 'font-semibold text-[#344054]',
            )}
          >
            {ty.label}
          </button>
        );
      })}
    </div>
  );
}

function MenuScreen({ routeMode }: { routeMode: CustomerMode }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const toast = useToast();
  const customer = useCustomer();
  const menuQ = useMenu();
  const { data: settings } = useSettings();
  const cart = useCart();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState<CategoryFilter>(CAT_ALL);
  const [sheetId, setSheetId] = useState<number | null>(null);
  const searchId = useId();
  const currency = mainCurrency(settings);
  const menu = menuQ.data;
  const sheetItem = (sheetId !== null && menu?.items.find((i) => i.id === sheetId)) || null;
  const recentId = customer.mode !== 'table' ? latestOrderId() : null;

  const cats = useMemo(() => (menu ? sortedCategories(menu) : []), [menu]);
  const filtered = useMemo(() => (menu ? filterItems(menu, q, cat) : []), [menu, q, cat]);
  const showHome = !q.trim() && cat === CAT_ALL;

  const qtyOf = (id: number) => cart.lines.reduce((a, l) => (l.itemId === id ? a + l.qty : a), 0);
  const hasOptions = (it: PublicMenuItem) => !!menu && groupsForItem(menu, it).length > 0;
  const onAdd = (it: PublicMenuItem) => {
    if (!it.available) return;
    if (hasOptions(it)) setSheetId(it.id);
    else cart.add({ itemId: it.id, qty: 1 });
  };
  const actions = (it: PublicMenuItem) => ({
    qty: qtyOf(it.id),
    onAdd: () => onAdd(it),
    onDec: () => cart.decItem(it.id),
  });

  const chips: { key: CategoryFilter; label: string; n: number }[] = menu
    ? [
        { key: CAT_ALL, label: t('order.all'), n: menu.items.length },
        { key: CAT_BEST, label: t('web.bestTag'), n: menu.items.filter((i) => i.bestSeller).length },
        ...cats.map((c) => ({
          key: c.id,
          label: tl(c.name, lang),
          n: menu.items.filter((i) => i.categoryId === c.id).length,
        })),
      ]
    : [];

  return (
    <Page testId="order-menu" mode={routeMode}>
      <header className="sticky top-0 z-20 flex flex-col gap-2.5 border-b border-line bg-white px-4 pb-2.5 pt-3">
        <div className="flex flex-wrap items-center gap-2.5">
          <StoreHeading />
          <LangPicker />
        </div>
        {customer.mode === 'telegram' && customer.status === 'ready' ? <TelegramBanner /> : null}
        {customer.mode === 'table' && customer.status === 'ready' ? <TableBanner /> : null}
        {customer.mode === 'none' ? <OrderTypePicker /> : null}
        <div className="relative">
          <span className="pointer-events-none absolute left-3.5 top-3.5 text-muted">
            <SearchIcon />
          </span>
          <label htmlFor={searchId} className="sr-only">
            {t('web.searchLabel')}
          </label>
          <input
            id={searchId}
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={t('web.searchPlaceholder')}
            enterKeyHint="search"
            className="h-12 w-full rounded-xl border border-line-strong bg-white pl-11 pr-12 shadow-card [&::-webkit-search-cancel-button]:hidden"
          />
          {q ? (
            <button
              type="button"
              onClick={() => setQ('')}
              aria-label={t('web.clearSearch')}
              className="absolute right-1 top-1 flex size-10 items-center justify-center rounded-full bg-[#F2F4F7] text-lg font-bold"
            >
              ×
            </button>
          ) : null}
        </div>
        <nav
          aria-label={t('web.categories')}
          className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none]"
        >
          {chips.map((c) => {
            const on = c.key === cat;
            return (
              <button
                key={String(c.key)}
                type="button"
                aria-pressed={on}
                onClick={() => setCat(c.key)}
                className={cn(
                  'h-11 shrink-0 whitespace-nowrap rounded-full border px-3.5 text-sm font-bold',
                  on ? 'border-ink bg-ink text-white' : 'border-line-strong bg-white text-ink',
                )}
              >
                {c.label} <span className="font-semibold opacity-70">{c.n}</span>
              </button>
            );
          })}
        </nav>
      </header>

      <main className="flex min-h-0 grow flex-col gap-2.5 px-4 pb-28 pt-3">
        {settings && !settings.isOpen ? (
          <Card tone="warn" className="text-[15px] font-semibold text-warn-dark" role="status">
            {t('web.closedBanner', { time: formatHour(settings.hours.open, lang) })}
          </Card>
        ) : null}
        {recentId ? (
          <Link
            to={`/pesanan/${recentId}`}
            className="flex min-h-12 items-center justify-between rounded-xl border border-line-strong bg-white px-4 font-bold shadow-card"
          >
            {t('web.myOrders')} <span aria-hidden>›</span>
          </Link>
        ) : null}

        {menuQ.isPending || customer.status === 'loading' ? (
          <LoadingBlock />
        ) : menuQ.isError || !menu ? (
          <ErrorBlock message={t('web.loadFailed')} onRetry={() => void menuQ.refetch()} />
        ) : showHome ? (
          <>
            {menu.items.some((i) => i.bestSeller) ? (
              <section aria-labelledby="best-title" className="flex flex-col gap-2.5">
                <h2 id="best-title" className="text-[17px] font-extrabold">
                  {t('order.bestSeller')}
                </h2>
                <div
                  className="-mx-4 flex shrink-0 gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none]"
                  data-testid="best-carousel"
                >
                  {sortSoldOutLast(menu.items.filter((i) => i.bestSeller)).map((it) => (
                    <BestCard key={it.id} item={it} currency={currency} {...actions(it)} />
                  ))}
                </div>
              </section>
            ) : null}
            {cats.map((c) => {
              const items = sortSoldOutLast(menu.items.filter((i) => i.categoryId === c.id));
              if (!items.length) return null;
              return (
                <section key={c.id} aria-labelledby={`cat-${c.id}`} className="flex flex-col gap-2.5">
                  <h2 id={`cat-${c.id}`} className="mt-1.5 text-[17px] font-extrabold">
                    {tl(c.name, lang)}
                  </h2>
                  {items.map((it) => (
                    <MenuItemCard key={it.id} item={it} currency={currency} {...actions(it)} />
                  ))}
                </section>
              );
            })}
          </>
        ) : (
          <section
            className="flex flex-col gap-2.5"
            aria-label={t('order.searchPlaceholder')}
            data-testid="results"
          >
            {q.trim() ? (
              <p className="text-sm text-muted" role="status">
                {t('web.resultsFor', { count: filtered.length, q: q.trim() })}
              </p>
            ) : null}
            {filtered.length === 0 ? (
              <div className="flex flex-col gap-1.5 rounded-[14px] bg-white px-4 py-7 text-center shadow-card">
                <b className="text-[17px]">{t('order.noResults')}</b>
                <span className="text-sm text-muted">{t('web.emptyHint')}</span>
              </div>
            ) : (
              filtered.map((it) => (
                <MenuItemCard key={it.id} item={it} currency={currency} {...actions(it)} />
              ))
            )}
          </section>
        )}
      </main>

      {!sheetItem ? <CartBar /> : null}
      {sheetItem && menu ? (
        <OptionSheet
          item={sheetItem}
          groups={groupsForItem(menu, sheetItem)}
          currency={currency}
          onClose={() => setSheetId(null)}
          onSubmit={(v) => {
            cart.add({ itemId: sheetItem.id, qty: v.qty, optionIds: v.optionIds, note: v.note });
            toast.success(`${tl(sheetItem.name, lang)} ×${v.qty}`);
            setSheetId(null);
          }}
        />
      ) : null}
    </Page>
  );
}
