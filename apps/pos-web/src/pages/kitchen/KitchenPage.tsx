/** Layar dapur — acuan: docs/mockups/Dapur.dc.html. Bahasa layar dipilih per perangkat (id/en/kh/zh). */
import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { LANGS, hasAnyPermission, tl, type Lang, type OrderDto, type OrderStatus } from '@pos/shared';
import { LANG_FONT_CLASS } from '@pos/shared/i18n';
import { EmptyState, Sheet, cn, useToast } from '../../components/ui';
import { AppMenuSheet, ErrorBlock, LoadingBlock, MenuIcon, Screen, Switch, Tabs, minutesSince } from '../../components/common';
import { api, errorMessage, qk } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { useAdminSettingsIfAllowed, useStaffMenu } from '../../lib/data';
import { setPrefs, usePrefs } from '../../lib/prefs';
import { useRepeatingAlarm } from '../../lib/sound';
import { useSocketEvent } from '../../lib/socket';
import { beep } from '../../lib/sound';

export const KITCHEN_FILTER = { status: 'accepted,cooking', active: 'true' } as const;
const LANG_LABEL: Record<Lang, string> = { id: 'ID', en: 'EN', kh: 'ខ្មែរ', zh: '中文' };

export type KitchenTone = 'new' | 'cooking' | 'late';
export function kitchenTone(o: Pick<OrderDto, 'status' | 'acceptedAt' | 'createdAt'>, lateMinutes: number, now = Date.now()): KitchenTone {
  if (minutesSince(o.acceptedAt ?? o.createdAt, now) > lateMinutes) return 'late';
  return o.status === 'accepted' ? 'new' : 'cooking';
}
const TONE = {
  late: { border: 'border-2 border-[#F04438]', head: 'bg-danger-tint', time: 'text-danger' },
  cooking: { border: 'border-2 border-info', head: 'bg-info-tint', time: 'text-info-dark' },
  new: { border: 'border-2 border-warn', head: 'bg-warn-tint', time: 'text-warn-dark' },
};

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
  const lang: Lang = prefs.kitchenLang ?? ((LANGS as readonly string[]).includes(i18n.language) ? (i18n.language as Lang) : 'id');
  const t = useMemo(() => i18n.getFixedT(lang), [i18n, lang]);
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const admin = useAdminSettingsIfAllowed();
  const lateMinutes = admin.data?.settings.kitchen.lateMinutes ?? 15;
  const canUpdate = hasAnyPermission(me?.permissions, ['kitchen.update', 'order.create']);
  const canToggle = hasAnyPermission(me?.permissions, ['menu.toggle_available']);
  const [menuOpen, setMenuOpen] = useState(false);
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
    return list.sort((a, b) => (a.status === b.status ? a.createdAt.localeCompare(b.createdAt) : a.status === 'accepted' ? -1 : 1));
  }, [q.data]);
  const newCount = orders.filter((o) => o.status === 'accepted').length;
  useSocketEvent('order.created', (p) => p.order.status === 'accepted' && beep('kitchen'));
  useRepeatingAlarm(newCount > 0, 'kitchen', 8000);

  const status = useMutation({
    mutationFn: (v: { id: string; status: OrderStatus }) => api.call('orderStatus', { params: { id: v.id }, body: { status: v.status } }),
    onMutate: async (v) => {
      // Optimistis: kartu langsung berubah/hilang.
      const key = qk.orders(KITCHEN_FILTER);
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<{ orders: OrderDto[]; serverTime: string }>(key);
      if (prev)
        qc.setQueryData(key, {
          ...prev,
          orders: v.status === 'ready' ? prev.orders.filter((o) => o.id !== v.id) : prev.orders.map((o) => (o.id === v.id ? { ...o, status: v.status } : o)),
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
      <header className="flex shrink-0 flex-col gap-2.5 bg-ink px-4 py-3 text-white">
        <div className="flex items-center gap-2.5">
          <h1 className="text-2xl font-extrabold">{t('kitchen.title')}</h1>
          <span className="text-base text-[#D0D5DD]">{t('dapur.activeCount', { count: orders.length })}</span>
          <div className="grow" />
          {canToggle ? (
            <button type="button" onClick={() => setAvailOpen(true)} className="h-11 rounded-[10px] border border-[#344054] bg-[#1D2939] px-3 text-sm font-bold">
              {t('dapur.soldOutBtn')}
            </button>
          ) : null}
          <button
            type="button"
            aria-pressed={!prefs.muted}
            onClick={() => setPrefs({ muted: !prefs.muted })}
            className="h-11 rounded-[10px] border border-[#344054] bg-[#1D2939] px-3 text-sm font-bold"
          >
            {prefs.muted ? t('dapur.soundOff') : t('dapur.soundOn')}
          </button>
          <button type="button" aria-label={t('cashier.moreMenu')} onClick={() => setMenuOpen(true)} className="flex size-11 items-center justify-center rounded-[10px] border border-[#344054] bg-[#1D2939]">
            <MenuIcon />
          </button>
        </div>
        <div role="radiogroup" aria-label={t('kitchen.screenLanguage')} className="grid grid-cols-4 gap-1.5">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={l === lang}
              lang={l === 'kh' ? 'km' : l}
              onClick={() => setPrefs({ kitchenLang: l })}
              className={cn(
                'h-11 rounded-[10px] border-2 text-base font-bold',
                LANG_FONT_CLASS[l],
                l === lang ? 'border-white bg-white text-ink' : 'border-muted bg-[#1D2939] text-white',
              )}
            >
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      </header>
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-3 pb-6 pt-3">
        {recap.length ? (
          <section className="flex shrink-0 flex-col gap-2 rounded-card border border-line bg-white px-3.5 py-3 shadow-card" data-testid="kitchen-recap">
            <h2 className="text-lg font-extrabold">{t('kitchen.toMake')}</h2>
            <div className="flex flex-wrap gap-1.5">
              {recap.map((r) => (
                <span key={r.name} className="rounded-[10px] bg-bg px-2.5 py-1.5 text-[15px] font-semibold">
                  <b className="text-lg">{r.qty}</b> × {r.name}
                </span>
              ))}
            </div>
          </section>
        ) : null}
        {q.isLoading ? <LoadingBlock label={t('common.loading')} /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data && !orders.length ? <EmptyState title={t('kitchen.noOrders')} /> : null}
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {orders.map((o) => {
            const tone = kitchenTone(o, lateMinutes, now);
            const tc = TONE[tone];
            const mins = minutesSince(o.acceptedAt ?? o.createdAt, now);
            const isNew = o.status === 'accepted';
            return (
              <article key={o.id} className={cn('flex flex-col overflow-hidden rounded-card bg-white shadow-card', tc.border)} data-testid="kitchen-card" data-tone={tone}>
                <div className={cn('flex items-center justify-between gap-2 px-3.5 py-2.5', tc.head)}>
                  <span className="text-[30px] font-extrabold">{o.displayNo}</span>
                  <span className={cn('text-right text-base font-extrabold', tc.time)}>
                    {isNew ? `${t('kitchen.new')} · ${t('dapur.min', { count: mins })}` : `${t('dapur.min', { count: mins })} · ${t('dapur.cooking')}`}
                    {tone === 'late' ? ` · ${t('kitchen.late')}` : ''}
                  </span>
                </div>
                <div className="flex flex-col gap-2 px-3.5 pb-3 pt-2.5">
                  <span className="text-sm font-bold uppercase text-muted">{typeLabel(o)}</span>
                  {o.items.map((it) => {
                    const opts = it.options.map((x) => tl(x.optionName, lang));
                    return (
                      <div key={it.id} className="flex items-baseline gap-2">
                        <b className="shrink-0 text-[22px]">{it.qty}×</b>
                        <div className="flex flex-col gap-0.5">
                          <span className="text-[19px] font-semibold leading-snug">{tl(it.name, lang)}</span>
                          {opts.length ? <span className="text-[15px] font-bold text-danger">{opts.join(' · ')}</span> : null}
                          {it.note ? <span className="text-[15px] font-bold text-danger">{it.note}</span> : null}
                        </div>
                      </div>
                    );
                  })}
                  {o.note ? (
                    <span className="rounded-lg bg-danger-tint px-2 py-1 text-[15px] font-bold text-danger">
                      {t('kitchen.orderNote')}: {o.note}
                    </span>
                  ) : null}
                </div>
                {canUpdate ? (
                  <button
                    type="button"
                    disabled={status.isPending && status.variables?.id === o.id}
                    onClick={() => status.mutate({ id: o.id, status: isNew ? 'cooking' : 'ready' })}
                    className={cn('mt-auto h-[58px] text-xl font-extrabold disabled:opacity-60', isNew ? 'bg-warn text-ink' : 'bg-primary text-white')}
                  >
                    {isNew ? t('kitchen.startCooking') : t('kitchen.markReady')}
                  </button>
                ) : null}
              </article>
            );
          })}
        </div>
      </main>
      <AvailabilitySheet open={availOpen} onClose={() => setAvailOpen(false)} lang={lang} t={t} />
      <AppMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </Screen>
  );
}

/** Pintasan Tersedia/Habis untuk menu & pilihan opsi. */
export function AvailabilitySheet({ open, onClose, lang, t }: { open: boolean; onClose: () => void; lang: Lang; t: TFunction }) {
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
            : { ...old, optionGroups: old.optionGroups.map((g) => ({ ...g, options: g.options.map((o) => (o.id === v.id ? { ...o, available: v.available } : o)) })) }
          : old,
      );
    },
    onError: (e) => {
      toast.error(errorMessage(e, t));
      void qc.invalidateQueries({ queryKey: qk.menu });
    },
  });
  return (
    <Sheet open={open} onClose={onClose} title={t('kitchen.toggleAvailability')} closeLabel={t('common.close')}>
      <div className="flex flex-col gap-2">
        <Tabs label={t('kitchen.toggleAvailability')} value={tab} onChange={setTab} tabs={[{ value: 'items', label: t('common.menu') }, { value: 'options', label: t('admin.optionGroups') }]} />
        {menu.isLoading ? <LoadingBlock /> : null}
        {tab === 'items'
          ? menu.data?.items.map((i) => (
              <Switch key={i.id} checked={i.available} onChange={(v) => toggle.mutate({ kind: 'item', id: i.id, available: v })} label={tl(i.name, lang)} description={i.available ? t('common.available') : t('common.soldOut')} />
            ))
          : menu.data?.optionGroups.map((g) => (
              <div key={g.id} className="flex flex-col">
                <b className="mt-2 text-sm text-muted">{tl(g.name, lang)}</b>
                {g.options.map((o) => (
                  <Switch key={o.id} checked={o.available} onChange={(v) => toggle.mutate({ kind: 'option', id: o.id, available: v })} label={tl(o.name, lang)} description={o.available ? t('common.available') : t('common.soldOut')} />
                ))}
              </div>
            ))}
      </div>
    </Sheet>
  );
}
