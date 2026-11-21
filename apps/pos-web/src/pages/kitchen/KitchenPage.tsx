/** Layar dapur — acuan: docs/mockups/Dapur.dc.html. Bahasa layar dipilih per perangkat (id/en/kh/zh). */
import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGS, hasAnyPermission, tl, type Lang, type OrderDto, type OrderStatus } from '@pos/shared';
import { LANG_FONT_CLASS } from '@pos/shared/i18n';
import { Button, EmptyState, Icon, Segmented, Sheet, cn, useToast } from '../../components/ui';
import {
  ErrorBlock,
  LoadingBlock,
  MoreButton,
  Screen,
  Switch,
  Tabs,
  TopBar,
  minutesSince,
} from '../../components/common';
import { api, errorMessage, qk } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { useStaffMenu, useStaffSettings } from '../../lib/data';
import { setPrefs, usePrefs } from '../../lib/prefs';
import { useRepeatingAlarm } from '../../lib/sound';
import { useSocketEvent } from '../../lib/socket';
import { beep } from '../../lib/sound';

export const KITCHEN_FILTER = { status: 'accepted,cooking', active: 'true' } as const;
const LANG_LABEL: Record<Lang, string> = { id: 'ID', en: 'EN', kh: 'ខ្មែរ', zh: '中文' };

export type KitchenTone = 'new' | 'cooking' | 'late';
export function kitchenTone(
  o: Pick<OrderDto, 'status' | 'acceptedAt' | 'createdAt'>,
  lateMinutes: number,
  now = Date.now(),
): KitchenTone {
  if (minutesSince(o.acceptedAt ?? o.createdAt, now) > lateMinutes) return 'late';
  return o.status === 'accepted' ? 'new' : 'cooking';
}
/** Baru = warning, Dimasak = tertiary, Terlambat = error (selalu disertai teks status). */
const TONE = {
  late: {
    border: 'border-2 border-error',
    head: 'bg-error-container text-on-error-container',
    icon: 'warning',
  },
  cooking: {
    border: 'border border-outline-variant',
    head: 'bg-tertiary-container text-on-tertiary-container',
    icon: 'skillet',
  },
  new: {
    border: 'border-2 border-warning',
    head: 'bg-warning-container text-on-warning-container',
    icon: 'notifications_active',
  },
} as const;

/** Rekap "Yang harus dibuat": jumlah per menu dari semua order aktif. */
export function kitchenRecap(orders: OrderDto[], lang: Lang): { name: string; qty: number }[] {
  const m = new Map<string, { name: string; qty: number }>();
  for (const o of orders)
    for (const it of o.items) {
      const key = String(it.itemId ?? it.name.id);
      const cur = m.get(key) ?? { name: tl(it.name, lang), qty: 0 };
      cur.qty += it.qty;
      m.set(key, cur);
    }
  return [...m.values()].sort((a, b) => b.qty - a.qty);
}

export default function KitchenPage() {
  const { i18n } = useTranslation();
  const prefs = usePrefs();
  const lang: Lang =
    prefs.kitchenLang ??
    ((LANGS as readonly string[]).includes(i18n.language) ? (i18n.language as Lang) : 'id');
  const t = useMemo(() => i18n.getFixedT(lang), [i18n, lang]);
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const lateMinutes = useStaffSettings().kitchen.lateMinutes;
  const canUpdate = hasAnyPermission(me?.permissions, ['kitchen.update', 'order.create']);
  const canToggle = hasAnyPermission(me?.permissions, ['menu.toggle_available']);
  const [availOpen, setAvailOpen] = useState(false);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  const q = useQuery({
    queryKey: qk.orders(KITCHEN_FILTER),
    queryFn: () => api.call('ordersList', { query: KITCHEN_FILTER }),
    refetchInterval: 30_000,
  });
  const orders = useMemo(() => {
    const list = (q.data?.orders ?? []).filter((o) => o.status === 'accepted' || o.status === 'cooking');
    return list.sort((a, b) =>
      a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === 'accepted' ? -1 : 1,
    );
  }, [q.data]);
  const newCount = orders.filter((o) => o.status === 'accepted').length;
  useSocketEvent('order.created', (p) => p.order.status === 'accepted' && beep('kitchen'));
  useRepeatingAlarm(newCount > 0, 'kitchen', 8000);

  const status = useMutation({
    mutationFn: (v: { id: string; status: OrderStatus }) =>
      api.call('orderStatus', { params: { id: v.id }, body: { status: v.status } }),
    onMutate: async (v) => {
      // Optimistis: kartu langsung berubah/hilang.
      const key = qk.orders(KITCHEN_FILTER);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ orders: OrderDto[]; serverTime: string }>(key);
      if (prev)
        qc.setQueryData(key, {
          ...prev,
          orders:
            v.status === 'ready'
              ? prev.orders.filter((o) => o.id !== v.id)
              : prev.orders.map((o) => (o.id === v.id ? { ...o, status: v.status } : o)),
        });
      return { prev };
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(qk.orders(KITCHEN_FILTER), ctx.prev);
      toast.error(errorMessage(e, t));
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: ['orders'] }),
  });

  const recap = kitchenRecap(orders, lang);
  const typeLabel = (o: OrderDto) => {
    if (o.channel === 'grab') return 'GRAB';
    if (o.channel === 'foodpanda') return 'FOODPANDA';
    if (o.type === 'dine_in') return t('dapur.dineIn', { table: o.table?.name ?? '' });
    if (o.type === 'delivery') return t('dapur.delivery');
    return t('dapur.takeaway');
  };

  return (
    <Screen wide testId="kitchen-screen" lang={lang} className={LANG_FONT_CLASS[lang]}>
      <TopBar
        title={t('kitchen.title')}
        subtitle={t('dapur.activeCount', { count: orders.length })}
        right={
          <>
            {canToggle ? (
              <Button variant="tonal" size="md" className="px-4" onClick={() => setAvailOpen(true)}>
                {t('dapur.soldOutBtn')}
              </Button>
            ) : null}
            <button
              type="button"
              aria-pressed={!prefs.muted}
              onClick={() => setPrefs({ muted: !prefs.muted })}
              className={cn(
                'state-layer flex h-12 shrink-0 items-center gap-1.5 rounded-full px-3 text-label-large',
                prefs.muted ? 'text-on-surface-variant' : 'text-primary',
              )}
            >
              <Icon name={prefs.muted ? 'volume_off' : 'volume_up'} filled={!prefs.muted} />
              <span className="max-w-24 truncate">
                {prefs.muted ? t('dapur.soundOff') : t('dapur.soundOn')}
              </span>
            </button>
            <MoreButton lang={lang} />
          </>
        }
      >
        <Segmented
          label={t('kitchen.screenLanguage')}
          value={lang}
          onChange={(l) => setPrefs({ kitchenLang: l })}
          options={LANGS.map((l) => ({ value: l, label: LANG_LABEL[l] }))}
        />
      </TopBar>
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-4 pb-6 pt-3">
        {recap.length ? (
          <section
            className="flex shrink-0 flex-col gap-2 rounded-md bg-surface-container-low px-4 py-3"
            data-testid="kitchen-recap"
          >
            <h2 className="text-title-medium">{t('kitchen.toMake')}</h2>
            <div className="flex flex-wrap gap-1.5">
              {recap.map((r) => (
                <span
                  key={r.name}
                  className="rounded-sm border border-outline-variant bg-surface-container-lowest px-3 py-1.5 text-body-large"
                >
                  <b className="text-title-medium font-medium tabular-nums">{r.qty}</b> × {r.name}
                </span>
              ))}
            </div>
          </section>
        ) : null}
        {q.isLoading ? <LoadingBlock label={t('common.loading')} /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data && !orders.length ? <EmptyState icon="skillet" title={t('kitchen.noOrders')} /> : null}
        <div className="grid gap-3 medium:grid-cols-2 expanded:grid-cols-3 large:grid-cols-4">
          {orders.map((o) => {
            const tone = kitchenTone(o, lateMinutes, now);
            const tc = TONE[tone];
            const mins = minutesSince(o.acceptedAt ?? o.createdAt, now);
            const isNew = o.status === 'accepted';
            return (
              <article
                key={o.id}
                className={cn(
                  'flex flex-col overflow-hidden rounded-md bg-surface-container-lowest shadow-e1',
                  tc.border,
                )}
                data-testid="kitchen-card"
                data-order-no={o.displayNo}
                data-tone={tone}
              >
                <div className={cn('flex items-center justify-between gap-2 px-4 py-2.5', tc.head)}>
                  <span className="text-headline-medium font-medium tabular-nums">{o.displayNo}</span>
                  <span className="flex items-center gap-1.5 text-right text-label-large">
                    <Icon name={tc.icon} size={20} />
                    {isNew
                      ? `${t('kitchen.new')} · ${t('dapur.min', { count: mins })}`
                      : `${t('dapur.min', { count: mins })} · ${t('dapur.cooking')}`}
                    {tone === 'late' ? ` · ${t('kitchen.late')}` : ''}
                  </span>
                </div>
                <div className="flex flex-col gap-2 px-4 pb-3 pt-2.5">
                  <span className="text-label-medium uppercase text-on-surface-variant">{typeLabel(o)}</span>
                  {o.items.map((it) => {
                    const opts = it.options.map((x) => tl(x.optionName, lang));
                    return (
                      <div key={it.id} className="flex items-baseline gap-2">
                        <b className="shrink-0 text-title-large font-medium tabular-nums">{it.qty}×</b>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-title-large">{tl(it.name, lang)}</span>
                          {opts.length ? (
                            <span className="text-body-medium font-medium text-error">
                              {opts.join(' · ')}
                            </span>
                          ) : null}
                          {it.note ? (
                            <span className="text-body-medium font-medium text-error">{it.note}</span>
                          ) : null}
                        </div>
                      </div>
                    );
                  })}
                  {o.note ? (
                    <span className="rounded-sm bg-error-container px-2 py-1 text-body-medium font-medium text-on-error-container">
                      {t('kitchen.orderNote')}: {o.note}
                    </span>
                  ) : null}
                </div>
                {canUpdate ? (
                  <button
                    type="button"
                    disabled={status.isPending && status.variables?.id === o.id}
                    onClick={() => status.mutate({ id: o.id, status: isNew ? 'cooking' : 'ready' })}
                    className={cn(
                      'state-layer mx-3 mb-3 mt-auto flex h-14 items-center justify-center gap-2 rounded-full text-title-medium disabled:opacity-60',
                      isNew ? 'bg-tertiary text-on-tertiary' : 'bg-primary text-on-primary',
                    )}
                  >
                    <Icon name={isNew ? 'skillet' : 'check_circle'} />
                    {isNew ? t('kitchen.startCooking') : t('kitchen.markReady')}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </main>
      <AvailabilitySheet open={availOpen} onClose={() => setAvailOpen(false)} lang={lang} t={t} />
    </Screen>
  );
}

/** Pintasan Tersedia/Habis untuk menu & pilihan opsi. */
export function AvailabilitySheet({
  open,
  onClose,
  lang,
  t,
}: {
  open: boolean;
  onClose: () => void;
  lang: Lang;
  t: TFunction;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const menu = useStaffMenu();
  const [tab, setTab] = useState<'items' | 'options'>('items');
  const toggle = useMutation({
    mutationFn: (v: { kind: 'item' | 'option'; id: number; available: boolean }) =>
      v.kind === 'item'
        ? api.call('menuItemAvailability', { params: { id: v.id }, body: { available: v.available } })
        : api.call('menuOptionAvailability', { params: { id: v.id }, body: { available: v.available } }),
    onMutate: (v) => {
      qc.setQueryData(qk.menu, (old: typeof menu.data) =>
        old
          ? v.kind === 'item'
            ? { ...old, items: old.items.map((i) => (i.id === v.id ? { ...i, available: v.available } : i)) }
            : {
                ...old,
                optionGroups: old.optionGroups.map((g) => ({
                  ...g,
                  options: g.options.map((o) => (o.id === v.id ? { ...o, available: v.available } : o)),
                })),
              }
          : old,
      );
    },
    onError: (e) => {
      toast.error(errorMessage(e, t));
      void qc.invalidateQueries({ queryKey: qk.menu });
    },
  });
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('kitchen.toggleAvailability')}
      closeLabel={t('common.close')}
    >
      <div className="flex flex-col gap-2">
        <Tabs
          label={t('kitchen.toggleAvailability')}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'items', label: t('common.menu') },
            { value: 'options', label: t('admin.optionGroups') },
          ]}
        />
        {menu.isLoading ? <LoadingBlock /> : null}
        {tab === 'items'
          ? menu.data?.items.map((i) => (
              <Switch
                key={i.id}
                checked={i.available}
                onChange={(v) => toggle.mutate({ kind: 'item', id: i.id, available: v })}
                label={tl(i.name, lang)}
                description={i.available ? t('common.available') : t('common.soldOut')}
              />
            ))
          : menu.data?.optionGroups.map((g) => (
              <div key={g.id} className="flex flex-col">
                <b className="mt-3 text-label-large text-primary">{tl(g.name, lang)}</b>
                {g.options.map((o) => (
                  <Switch
                    key={o.id}
                    checked={o.available}
                    onChange={(v) => toggle.mutate({ kind: 'option', id: o.id, available: v })}
                    label={tl(o.name, lang)}
                    description={o.available ? t('common.available') : t('common.soldOut')}
                  />
                ))}
              </div>
            ))}
      </div>
    </Sheet>
  );
}
