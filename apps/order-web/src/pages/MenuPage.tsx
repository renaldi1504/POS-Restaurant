/**
 * Menu pelanggan — acuan: docs/mockups/Website.dc.html (mode biasa/telegram) & WebsiteMeja.dc.html (mode meja).
 * Mode ditentukan oleh route: `/` (none), `/tg` (telegram), `/m/:qrToken` (table).
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { tl, type CustomerMode, type PublicMenuItem } from '@pos/shared';
import { CartBar } from '../components/CartBar';
import { SearchIcon } from '../components/Icons';
import { BestCard, MenuItemCard } from '../components/MenuItemCard';
import { TableBanner, TelegramBanner } from '../components/ModeBanner';
import { OptionSheet } from '../components/OptionSheet';
import { OrderTypeTiles } from '../components/OrderTypeTiles';
import {
  BootErrorScreen,
  ErrorBlock,
  LangPicker,
  LoadingBlock,
  Page,
  StoreHeading,
} from '../components/Shell';
import { Card, EmptyState, Icon, cn, useToast } from '../components/ui';
import { useWindowSizeClass } from '../lib/windowSize';
import CartPage from './CartPage';
import { useCart } from '../lib/cart';
import { useCheckout } from '../lib/checkout';
import { useCustomer } from '../lib/customer';
import {
  CAT_ALL,
  filterItems,
  formatHour,
  groupsForItem,
  mainCurrency,
  sortSoldOutLast,
  sortedCategories,
  useMenu,
  useSettings,
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
  const { state, update } = useCheckout();
  return <OrderTypeTiles value={state.type} onChange={(type) => update({ type })} />;
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
  const [activeSec, setActiveSec] = useState<string>('');
  const navRef = useRef<HTMLElement | null>(null);
  const spyPause = useRef(0);
  const [sheetId, setSheetId] = useState<number | null>(null);
  const searchId = useId();
  const expanded = useWindowSizeClass() === 'expanded';
  const currency = mainCurrency(settings);
  const menu = menuQ.data;
  const sheetItem = (sheetId !== null && menu?.items.find((i) => i.id === sheetId)) || null;
  const recentId = customer.mode !== 'table' ? latestOrderId() : null;

  const cats = useMemo(() => (menu ? sortedCategories(menu) : []), [menu]);
  const filtered = useMemo(() => (menu ? filterItems(menu, q, CAT_ALL) : []), [menu, q]);
  const showHome = !q.trim();

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

  // Bagian menu (untuk lompat & sorot kategori saat menggulir): Terlaris lalu kategori yang berisi menu.
  const sections: { id: string; label: string; n: number }[] = menu
    ? [
        ...(menu.items.some((i) => i.bestSeller)
          ? [{ id: 'sec-best', label: t('web.bestTag'), n: menu.items.filter((i) => i.bestSeller).length }]
          : []),
        ...cats
          .map((c) => ({
            id: `sec-${c.id}`,
            label: tl(c.name, lang),
            n: menu.items.filter((i) => i.categoryId === c.id).length,
          }))
          .filter((c) => c.n > 0),
      ]
    : [];
  const current = activeSec || sections[0]?.id || '';

  const jumpTo = (id: string) => {
    setActiveSec(id);
    spyPause.current = Date.now() + 900;
    document.getElementById(id)?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  // Sorot kategori yang sedang terlihat saat menggulir.
  useEffect(() => {
    if (!showHome || typeof IntersectionObserver === 'undefined') return;
    const els = sections.map((x) => document.getElementById(x.id)).filter((e): e is HTMLElement => !!e);
    if (!els.length) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (Date.now() < spyPause.current) return;
        const top = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) setActiveSec(top.target.id);
      },
      { rootMargin: '-72px 0px -65% 0px' },
    );
    els.forEach((e) => io.observe(e));
    return () => io.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHome, sections.map((x) => x.id).join(',')]);

  // Chip aktif selalu terlihat di bar kategori.
  useEffect(() => {
    const nav = navRef.current;
    const chip = nav?.querySelector<HTMLElement>(`[data-sec="${current}"]`);
    if (!nav || !chip) return;
    if (nav.scrollWidth > nav.clientWidth)
      nav.scrollTo?.({
        left: chip.offsetLeft - nav.clientWidth / 2 + chip.clientWidth / 2,
        behavior: 'smooth',
      });
    else if (nav.scrollHeight > nav.clientHeight)
      nav.scrollTo?.({ top: chip.offsetTop - nav.clientHeight / 2, behavior: 'smooth' });
  }, [current]);

  const catButtons = (vertical: boolean) =>
    sections.map((x) => {
      const on = x.id === current;
      return (
        <button
          key={x.id}
          type="button"
          data-sec={x.id}
          aria-pressed={on}
          onClick={() => jumpTo(x.id)}
          className={cn(
            'state-layer flex shrink-0 items-center gap-1.5 rounded-full text-label-large transition-colors',
            vertical ? 'min-h-12 w-full justify-between px-4 text-left' : 'h-10 px-4 whitespace-nowrap',
            on
              ? 'bg-secondary-container font-semibold text-on-secondary-container'
              : 'text-on-surface-variant',
          )}
        >
          <span className={vertical ? 'min-w-0 truncate' : undefined}>
            {x.id === 'sec-best' ? '🔥 ' : ''}
            {x.label}
          </span>
          <span className="text-label-medium tabular-nums opacity-70">{x.n}</span>
        </button>
      );
    });

  return (
    <Page testId="order-menu" mode={routeMode} wide>
      <div className="flex grow">
        <div className="flex min-w-0 grow flex-col">
          <header className="flex flex-col gap-3 bg-surface px-4 pb-2 pt-3">
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
          </header>

          {showHome && !expanded && sections.length > 1 ? (
            <nav
              ref={navRef}
              aria-label={t('web.categories')}
              className="sticky top-0 z-20 flex gap-1 overflow-x-auto border-b border-outline-variant bg-surface/95 px-3 py-2 backdrop-blur [scrollbar-width:none]"
            >
              {catButtons(false)}
            </nav>
          ) : null}

          <div className={cn('flex min-h-0 grow gap-4', expanded && showHome && 'px-4')}>
            {showHome && expanded && sections.length > 1 ? (
              <nav
                ref={navRef}
                aria-label={t('web.categories')}
                className="sticky top-3 flex max-h-[calc(100dvh-24px)] w-52 shrink-0 flex-col gap-1 self-start overflow-y-auto pt-3"
              >
                {catButtons(true)}
              </nav>
            ) : null}
            <main
              className={cn(
                'flex min-h-0 min-w-0 grow flex-col gap-3 pt-3',
                expanded && showHome ? '' : 'px-4',
                expanded ? 'pb-6' : 'pb-28',
              )}
            >
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
                    <section
                      id="sec-best"
                      aria-labelledby="best-title"
                      className="flex scroll-mt-20 flex-col gap-2.5"
                    >
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
                      <section
                        key={c.id}
                        id={`sec-${c.id}`}
                        aria-labelledby={`cat-${c.id}`}
                        className="flex scroll-mt-20 flex-col gap-2.5"
                      >
                        <div className="mt-3 flex items-baseline gap-2 border-b border-outline-variant pb-1.5">
                          <h2 id={`cat-${c.id}`} className="text-title-large">
                            {tl(c.name, lang)}
                          </h2>
                          <span className="text-label-medium text-on-surface-variant tabular-nums">
                            {t('web.menuCount', { count: items.length })}
                          </span>
                        </div>
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
