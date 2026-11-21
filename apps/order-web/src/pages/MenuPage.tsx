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
import { Card, Chip, EmptyState, Icon, cn, useToast } from '../components/ui';
import { useWindowSizeClass } from '../lib/windowSize';
import CartPage from './CartPage';
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

/** Grid menu: 1 kolom (HP) → 2 → 3 → 4 kolom sesuai lebar (SKILL §8b). */
const GRID = 'grid gap-3 medium:grid-cols-[repeat(auto-fill,minmax(300px,1fr))]';

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
      className="grid grid-cols-3 overflow-hidden rounded-full border border-outline"
    >
      {types.map((ty, i) => {
        const on = state.type === ty.value;
        return (
          <button
            key={ty.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => update({ type: ty.value })}
            className={cn(
              'state-layer flex min-h-12 min-w-0 items-center justify-center gap-1 px-1 text-label-large',
              i > 0 && 'border-l border-outline',
              on ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface',
            )}
          >
            {on ? <Icon name="check" size={18} /> : null}
            <span className="truncate">{ty.label}</span>
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
  const expanded = useWindowSizeClass() === 'expanded';
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
    <Page testId="order-menu" mode={routeMode} wide>
      <div className="flex grow">
        <div className="flex min-w-0 grow flex-col">
          <header className="sticky top-0 z-20 flex flex-col gap-3 bg-surface px-4 pb-2 pt-3">
            <div className="flex flex-wrap items-center gap-3">
              <StoreHeading />
              <LangPicker />
            </div>
            {customer.mode === 'telegram' && customer.status === 'ready' ? <TelegramBanner /> : null}
            {customer.mode === 'table' && customer.status === 'ready' ? <TableBanner /> : null}
            {customer.mode === 'none' ? <OrderTypePicker /> : null}
            <div className="relative">
              <span className="pointer-events-none absolute left-4 top-4 text-on-surface-variant">
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
                className="h-14 w-full rounded-full bg-surface-container-high pl-14 pr-14 text-body-large outline-secondary placeholder:text-on-surface-variant focus-visible:outline-3 [&::-webkit-search-cancel-button]:hidden"
              />
              {q ? (
                <button
                  type="button"
                  onClick={() => setQ('')}
                  aria-label={t('web.clearSearch')}
                  className="state-layer absolute right-1 top-1 flex size-12 items-center justify-center rounded-full text-on-surface-variant"
                >
                  <Icon name="close" />
                </button>
              ) : null}
            </div>
            <nav
              aria-label={t('web.categories')}
              className="-mx-4 flex gap-2 overflow-x-auto px-4 py-1 [scrollbar-width:none]"
            >
              {chips.map((c) => (
                <Chip
                  key={String(c.key)}
                  active={c.key === cat}
                  onClick={() => setCat(c.key)}
                  count={c.n}
                  className="whitespace-nowrap"
                >
                  {c.label}
                </Chip>
              ))}
            </nav>
          </header>

          <main className={cn('flex min-h-0 grow flex-col gap-3 px-4 pt-3', expanded ? 'pb-6' : 'pb-28')}>
            {settings && !settings.isOpen ? (
              <Card tone="warn" className="flex items-center gap-2 text-body-medium" role="status">
                <Icon name="schedule" />
                {t('web.closedBanner', { time: formatHour(settings.hours.open, lang) })}
              </Card>
            ) : null}
            {recentId ? (
              <Link
                to={`/pesanan/${recentId}`}
                className="state-layer flex min-h-14 items-center gap-3 rounded-md bg-surface-container-low px-4 text-label-large"
              >
                <Icon name="receipt_long" className="text-on-surface-variant" />
                <span className="grow">{t('web.myOrders')}</span>
                <Icon name="chevron_right" className="text-on-surface-variant" />
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
                    <h2 id="best-title" className="text-title-large">
                      {t('order.bestSeller')}
                    </h2>
                    <div
                      className="-mx-4 flex shrink-0 gap-3 overflow-x-auto px-4 pb-2 pt-0.5 [scrollbar-width:none]"
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
                      <h2 id={`cat-${c.id}`} className="mt-2 text-title-large">
                        {tl(c.name, lang)}
                      </h2>
                      <div className={GRID}>
                        {items.map((it) => (
                          <MenuItemCard key={it.id} item={it} currency={currency} {...actions(it)} />
                        ))}
                      </div>
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
                  <p className="text-label-medium text-on-surface-variant" role="status">
                    {t('web.resultsFor', { count: filtered.length, q: q.trim() })}
                  </p>
                ) : null}
                {filtered.length === 0 ? (
                  <EmptyState icon="search" title={t('order.noResults')} description={t('web.emptyHint')} />
                ) : (
                  <div className={GRID}>
                    {filtered.map((it) => (
                      <MenuItemCard key={it.id} item={it} currency={currency} {...actions(it)} />
                    ))}
                  </div>
                )}
              </section>
            )}
          </main>
        </div>
        {expanded ? (
          <aside
            aria-label={t('web.cartTitle')}
            className="sticky top-0 flex h-dvh w-[400px] shrink-0 flex-col border-l border-outline-variant bg-surface-container-low"
            data-testid="cart-pane"
          >
            <CartPage embedded />
          </aside>
        ) : null}
      </div>

      {!sheetItem && !expanded ? <CartBar /> : null}
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
