/** Aplikasi driver — acuan: docs/mockups/Driver.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LANGS,
  formatDistance,
  formatMoney,
  mapsDirectionsUrl,
  mapsMultiStopUrl,
  type DriverOrderDto,
  type Lang,
} from '@pos/shared';
import { LANG_FONT_CLASS } from '@pos/shared/i18n';
import { Button, EmptyState, Sheet, cn, useToast } from '../../components/ui';
import { AppMenuSheet, ErrorBlock, LoadingBlock, MenuIcon, Screen } from '../../components/common';
import { api, errorMessage, isApiError, qk } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { usePublicSettings } from '../../lib/data';
import { setPrefs, usePrefs } from '../../lib/prefs';
import { beep } from '../../lib/sound';
import { useSocketEvent, useSocketStatus } from '../../lib/socket';
import { DriverMap, type MapPin } from './DriverMap';

const LANG_LABEL: Record<Lang, string> = { id: 'ID', en: 'EN', kh: 'ខ្មែរ', zh: '中文' };

export function telegramLink(c: DriverOrderDto['customer']): string | null {
  if (!c) return null;
  if (c.username) return `https://t.me/${c.username.replace(/^@/, '')}`;
  if (c.telegramId) return `tg://user?id=${c.telegramId}`;
  return null;
}

export default function DriverPage() {
  const { i18n } = useTranslation();
  const { data: me } = useMe();
  const prefs = usePrefs();
  const lang: Lang = prefs.driverLang ?? me?.lang ?? 'id';
  const t = useMemo(() => i18n.getFixedT(lang), [i18n, lang]);
  const qc = useQueryClient();
  const toast = useToast();
  const settings = usePublicSettings();
  const { connected } = useSocketStatus();
  const [tab, setTab] = useState<'ready' | 'mine'>('ready');
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirm, setConfirm] = useState<DriverOrderDto | null>(null);

  const available = useQuery({ queryKey: qk.driverAvailable, queryFn: () => api.call('driverAvailable'), refetchInterval: 20_000 });
  const mine = useQuery({ queryKey: qk.driverMine, queryFn: () => api.call('driverMine'), refetchInterval: 30_000 });
  useSocketEvent('order.ready_for_pickup', () => beep('order'));

  const refresh = () => void qc.invalidateQueries({ queryKey: ['driver'] });
  const onErr = (e: unknown) => {
    toast.error(isApiError(e) && e.code === 'ALREADY_TAKEN' ? t('driver.alreadyTaken') : errorMessage(e, t));
    refresh();
  };
  const take = useMutation({
    mutationFn: (id: string) => api.call('driverTake', { params: { id } }),
    onMutate: (id) => {
      // Optimistis: hilang dari "Siap diantar".
      qc.setQueryData(qk.driverAvailable, (old: { orders: DriverOrderDto[] } | undefined) => (old ? { orders: old.orders.filter((o) => o.id !== id) } : old));
    },
    onSuccess: (r) => {
      qc.setQueryData(qk.driverMine, (old: typeof mine.data) => (old ? { ...old, orders: [...old.orders.filter((o) => o.id !== r.order.id), r.order] } : old));
      setTab('mine');
      refresh();
    },
    onError: onErr,
  });
  const picked = useMutation({ mutationFn: (id: string) => api.call('driverPicked', { params: { id } }), onSuccess: refresh, onError: onErr });
  const delivered = useMutation({
    mutationFn: (o: DriverOrderDto) =>
      api.call('driverDelivered', {
        params: { id: o.id },
        body: o.cashToCollect > 0 ? { collected: { currency: o.currency, amount: o.cashToCollect } } : {},
      }),
    onSuccess: () => {
      setConfirm(null);
      toast.success(t('driver.delivered'));
      refresh();
    },
    onError: onErr,
  });
  const release = useMutation({ mutationFn: (id: string) => api.call('driverRelease', { params: { id }, body: {} }), onSuccess: refresh, onError: onErr });

  const avail = available.data?.orders ?? [];
  const myOrders = mine.data?.orders ?? [];
  const list = tab === 'ready' ? avail : myOrders;
  const pins: MapPin[] = list.flatMap((o) => (o.address?.lat != null && o.address?.lng != null ? [{ id: o.id, label: o.displayNo, lat: o.address.lat, lng: o.address.lng, mine: tab === 'mine' }] : []));
  const center = settings.data?.lat != null && settings.data?.lng != null ? { lat: settings.data.lat, lng: settings.data.lng } : null;
  const routeUrl =
    mine.data?.navigateAllUrl ??
    mapsMultiStopUrl(myOrders.flatMap((o) => (o.address?.lat != null && o.address?.lng != null ? [{ lat: o.address.lat, lng: o.address.lng }] : [])));
  const q = tab === 'ready' ? available : mine;

  return (
    <Screen testId="driver-screen" lang={lang} className={LANG_FONT_CLASS[lang]}>
      <header className="flex shrink-0 flex-col gap-2.5 bg-ink px-3.5 pb-3 pt-2.5 text-white">
        <div className="flex items-center gap-2.5">
          <div className="flex grow flex-col">
            <h1 className="text-[19px] font-extrabold">{t('antar.title')}</h1>
            <span className="text-[13px] text-[#D0D5DD]">{me?.name}</span>
          </div>
          <span className={cn('rounded-2xl px-3 py-1.5 text-[13px] font-extrabold', connected ? 'bg-primary' : 'bg-[#475467]')}>
            {connected ? t('antar.online') : t('common.reconnecting')}
          </span>
          <button type="button" aria-label={t('cashier.moreMenu')} onClick={() => setMenuOpen(true)} className="flex size-11 items-center justify-center rounded-[10px] border border-[#344054] bg-[#1D2939]">
            <MenuIcon />
          </button>
        </div>
        <div role="radiogroup" aria-label={t('common.language')} className="grid grid-cols-4 gap-1.5">
          {LANGS.map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={l === lang}
              onClick={() => setPrefs({ driverLang: l })}
              className={cn('h-[42px] rounded-[10px] border text-[15px] font-bold', LANG_FONT_CLASS[l], l === lang ? 'border-white bg-white text-ink' : 'border-[#344054] bg-[#1D2939] text-white')}
            >
              {LANG_LABEL[l]}
            </button>
          ))}
        </div>
      </header>
      <DriverMap pins={pins} center={center} restoLabel={t('antar.resto')} label={t('antar.mapLabel')} />
      <div role="tablist" aria-label={t('driver.title')} className="mx-3 mt-2.5 grid shrink-0 grid-cols-2 gap-1 rounded-xl bg-[#EEF0F3] p-1">
        {(['ready', 'mine'] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={cn('h-[42px] rounded-[9px] text-sm', tab === k ? 'bg-white font-extrabold shadow-[0_1px_3px_rgba(16,24,40,0.12)]' : 'font-semibold')}
          >
            {k === 'ready' ? `${t('driver.tabAvailable')} (${avail.length})` : `${t('driver.tabMine')} (${myOrders.length})`}
          </button>
        ))}
      </div>
      <main className="flex min-h-0 grow flex-col gap-2.5 overflow-y-auto px-3 pb-4 pt-2.5">
        {q.isLoading ? <LoadingBlock label={t('common.loading')} /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data && !list.length ? (
          <div className="rounded-[14px] bg-white px-4 py-6 text-center text-muted shadow-card">{tab === 'ready' ? t('driver.noAvailable') : t('driver.noMine')}</div>
        ) : null}
        {tab === 'mine' && myOrders.length > 1 && routeUrl ? (
          <a href={routeUrl} target="_blank" rel="noreferrer" className="flex h-12 shrink-0 items-center justify-center rounded-xl border-[1.5px] border-info bg-info-tint text-[15px] font-extrabold text-info-dark">
            {t('antar.route')}
          </a>
        ) : null}
        {list.map((o) => {
          const isMine = tab === 'mine';
          const nav = o.navigateUrl ?? (o.address?.lat != null && o.address?.lng != null ? mapsDirectionsUrl({ lat: o.address.lat, lng: o.address.lng }) : null);
          const tg = telegramLink(o.customer);
          const phone = o.customer?.phone;
          const pickedUp = o.status === 'picked_up';
          return (
            <article key={o.id} className="flex shrink-0 flex-col overflow-hidden rounded-card bg-white shadow-card" data-testid="driver-card">
              <div className="flex flex-col gap-1.5 px-3.5 py-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2">
                    <span className={cn('rounded-lg px-2 py-[3px] text-[13px] font-extrabold text-white', isMine ? 'bg-info' : 'bg-warn')}>{o.displayNo}</span>
                    {o.distanceKm != null ? <b className="text-[15px]">{formatDistance(o.distanceKm)}</b> : null}
                  </span>
                  <span className={cn('text-xs font-bold', isMine ? 'text-info-dark' : 'text-warn-dark')}>
                    {isMine ? (pickedUp ? t('antar.going') : t('antar.toPickup')) : t('antar.waiting')}
                  </span>
                </div>
                <span className="font-semibold">{o.customerName ?? o.customer?.name ?? ''}</span>
                <span className="leading-snug">{o.address?.text ?? '—'}</span>
                {o.address?.landmark ? (
                  <span className="text-[13px] text-muted">
                    {t('driver.landmark')}: {o.address.landmark}
                  </span>
                ) : null}
                <div className={cn('mt-0.5 flex items-center justify-between rounded-[10px] px-3 py-[7px]', o.cashToCollect > 0 ? 'bg-danger-tint text-danger' : 'bg-primary-tint text-primary-dark')}>
                  <span className="font-bold">{o.cashToCollect > 0 ? t('driver.collectCash') : t('driver.alreadyPaid')}</span>
                  <b className="text-lg tabular-nums">{formatMoney(o.cashToCollect, o.currency)}</b>
                </div>
                {isMine ? (
                  <div className="mt-1 grid grid-cols-[2fr_1fr] gap-2">
                    {nav ? (
                      <a href={nav} target="_blank" rel="noreferrer" className="flex h-12 items-center justify-center rounded-xl bg-info text-[15px] font-extrabold text-white">
                        {t('driver.navigate')}
                      </a>
                    ) : (
                      <span className="flex h-12 items-center justify-center rounded-xl bg-[#F2F4F7] text-sm text-muted">{t('antar.noLocation')}</span>
                    )}
                    {phone ? (
                      <a href={`tel:${phone}`} className="flex h-12 items-center justify-center rounded-xl border border-line-strong text-[15px] font-bold">
                        {t('driver.call')}
                      </a>
                    ) : tg ? (
                      <a href={tg} className="flex h-12 items-center justify-center rounded-xl border border-line-strong text-[15px] font-bold">
                        Telegram
                      </a>
                    ) : (
                      <span className="flex h-12 items-center justify-center rounded-xl border border-line text-sm text-muted">—</span>
                    )}
                    {phone && tg ? (
                      <a href={tg} className="col-span-2 flex h-11 items-center justify-center rounded-xl border border-line-strong text-[15px] font-bold">
                        {t('driver.chat')}
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {isMine && !pickedUp ? (
                  <button type="button" onClick={() => release.mutate(o.id)} className="mt-1 self-start text-sm font-bold text-danger underline">
                    {t('driver.release')}
                  </button>
                ) : null}
              </div>
              {!isMine ? (
                <button type="button" disabled={take.isPending} onClick={() => take.mutate(o.id)} className="h-14 bg-ink text-[17px] font-extrabold text-white disabled:opacity-60">
                  {t('antar.takeThis')}
                </button>
              ) : !pickedUp ? (
                <button type="button" disabled={picked.isPending} onClick={() => picked.mutate(o.id)} className="h-14 bg-info text-[17px] font-extrabold text-white disabled:opacity-60">
                  {t('driver.pickedUp')}
                </button>
              ) : (
                <button type="button" onClick={() => setConfirm(o)} className="h-14 bg-primary text-[17px] font-extrabold text-white">
                  {t('driver.delivered')}
                </button>
              )}
            </article>
          );
        })}
      </main>
      <footer className="flex shrink-0 items-center justify-between border-t border-line bg-white px-3.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5">
        <span className="text-[13px] text-muted">{t('antar.cashOnHand')}</span>
        <b className="text-lg tabular-nums" data-testid="cash-carried">
          {formatMoney(mine.data?.cashCarried ?? 0, settings.data?.currency.main ?? 'KHR')}
        </b>
      </footer>
      <Sheet
        open={!!confirm}
        onClose={() => setConfirm(null)}
        title={t('driver.confirmDelivered')}
        variant="center"
        closeLabel={t('common.close')}
        footer={
          <div className="flex gap-2">
            <Button variant="outline" className="w-28" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button className="grow" loading={delivered.isPending} onClick={() => confirm && delivered.mutate(confirm)}>
              {t('driver.delivered')}
            </Button>
          </div>
        }
      >
        {confirm ? (
          <div className="flex flex-col gap-2 text-base">
            <b className="text-lg">{confirm.displayNo}</b>
            {confirm.cashToCollect > 0 ? (
              <div className="rounded-xl bg-danger-tint p-3 text-danger">
                {t('driver.cashReceived')}: <b className="text-2xl">{formatMoney(confirm.cashToCollect, confirm.currency)}</b>
              </div>
            ) : (
              <div className="rounded-xl bg-primary-tint p-3 text-primary-dark">{t('driver.alreadyPaid')}</div>
            )}
          </div>
        ) : null}
      </Sheet>
      <AppMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
      {!q.data && !q.isLoading && !q.isError ? <EmptyState title={t('common.empty')} /> : null}
    </Screen>
  );
}
