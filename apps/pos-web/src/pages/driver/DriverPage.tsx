/** Aplikasi driver — acuan: docs/mockups/Driver.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  LANGS,
  formatDistance,
  formatMoney,
  mapsDirectionsUrl,
  mapsMultiStopUrl,
  type DriverOrderDto,
} from '@pos/shared';
import { HTML_LANG, LANG_FONT_CLASS, LANG_SHORT } from '@pos/shared/i18n';
import { Button, EmptyState, Icon, Segmented, Sheet, cn, useToast } from '../../components/ui';
import { ErrorBlock, LoadingBlock, MoreButton, Screen, Tabs, TopBar } from '../../components/common';
import { api, errorMessage, isApiError, qk } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { usePublicSettings } from '../../lib/data';
import { beep } from '../../lib/sound';
import { useSocketEvent, useSocketStatus } from '../../lib/socket';
import { useChangeLang, useLang } from '../../lib/useLang';
import { DriverMap, type MapPin } from './DriverMap';
import { OrderChat, useUnreadChats } from '../../components/driver/OrderChat';

export function telegramLink(c: DriverOrderDto['customer']): string | null {
  if (!c) return null;
  if (c.username) return `https://t.me/${c.username.replace(/^@/, '')}`;
  if (c.telegramId) return `tg://user?id=${c.telegramId}`;
  return null;
}

export default function DriverPage() {
  const { t } = useTranslation();
  const { data: me } = useMe();
  const lang = useLang();
  const changeLang = useChangeLang();
  const qc = useQueryClient();
  const toast = useToast();
  const settings = usePublicSettings();
  const { connected } = useSocketStatus();
  const [tab, setTab] = useState<'ready' | 'mine'>('ready');
  const [confirm, setConfirm] = useState<DriverOrderDto | null>(null);
  const [chat, setChat] = useState<DriverOrderDto | null>(null);
  const { unread, markRead } = useUnreadChats();

  const available = useQuery({
    queryKey: qk.driverAvailable,
    queryFn: () => api.call('driverAvailable'),
    refetchInterval: 20_000,
  });
  const mine = useQuery({
    queryKey: qk.driverMine,
    queryFn: () => api.call('driverMine'),
    refetchInterval: 30_000,
  });
  useSocketEvent('order.ready_for_pickup', () => beep('driver'));

  const refresh = () => void qc.invalidateQueries({ queryKey: ['driver'] });
  const onErr = (e: unknown) => {
    toast.error(isApiError(e) && e.code === 'ALREADY_TAKEN' ? t('driver.alreadyTaken') : errorMessage(e, t));
    refresh();
  };
  const take = useMutation({
    mutationFn: (id: string) => api.call('driverTake', { params: { id } }),
    onMutate: (id) => {
      // Optimistis: hilang dari "Siap diantar".
      qc.setQueryData(qk.driverAvailable, (old: { orders: DriverOrderDto[] } | undefined) =>
        old ? { orders: old.orders.filter((o) => o.id !== id) } : old,
      );
    },
    onSuccess: (r) => {
      qc.setQueryData(qk.driverMine, (old: typeof mine.data) =>
        old ? { ...old, orders: [...old.orders.filter((o) => o.id !== r.order.id), r.order] } : old,
      );
      setTab('mine');
      refresh();
    },
    onError: onErr,
  });
  const picked = useMutation({
    mutationFn: (id: string) => api.call('driverPicked', { params: { id } }),
    onSuccess: refresh,
    onError: onErr,
  });
  const [proof, setProof] = useState<File | null>(null);
  const proofUrl = useMemo(() => (proof ? URL.createObjectURL(proof) : null), [proof]);
  useEffect(() => () => void (proofUrl && URL.revokeObjectURL(proofUrl)), [proofUrl]);
  const proofInput = useRef<HTMLInputElement>(null);
  const delivered = useMutation({
    mutationFn: async (o: DriverOrderDto) => {
      // Foto bukti sampai (opsional) dikirim dulu → ikut ke pelanggan Telegram bersama status "Sampai".
      if (proof) {
        const fd = new FormData();
        fd.append('file', proof);
        await api.call('driverDeliveryPhoto', { params: { id: o.id }, body: fd });
      }
      return api.call('driverDelivered', {
        params: { id: o.id },
        body: o.cashToCollect > 0 ? { collected: { currency: o.currency, amount: o.cashToCollect } } : {},
      });
    },
    onSuccess: () => {
      setConfirm(null);
      setProof(null);
      toast.success(t('driver.delivered'));
      refresh();
    },
    onError: onErr,
  });
  const release = useMutation({
    mutationFn: (id: string) => api.call('driverRelease', { params: { id }, body: {} }),
    onSuccess: refresh,
    onError: onErr,
  });

  const avail = available.data?.orders ?? [];
  const myOrders = mine.data?.orders ?? [];
  const list = tab === 'ready' ? avail : myOrders;
  const pins: MapPin[] = list.flatMap((o) =>
    o.address?.lat != null && o.address?.lng != null
      ? [{ id: o.id, label: o.displayNo, lat: o.address.lat, lng: o.address.lng, mine: tab === 'mine' }]
      : [],
  );
  const center =
    settings.data?.lat != null && settings.data?.lng != null
      ? { lat: settings.data.lat, lng: settings.data.lng }
      : null;
  const routeUrl =
    mine.data?.navigateAllUrl ??
    mapsMultiStopUrl(
      myOrders.flatMap((o) =>
        o.address?.lat != null && o.address?.lng != null ? [{ lat: o.address.lat, lng: o.address.lng }] : [],
      ),
    );
  const q = tab === 'ready' ? available : mine;

  return (
    <Screen wide testId="driver-screen" lang={HTML_LANG[lang]} className={LANG_FONT_CLASS[lang]}>
      <TopBar
        title={t('antar.title')}
        subtitle={me?.name}
        right={
          <>
            <span
              className={cn(
                'flex min-h-8 items-center gap-1.5 rounded-sm px-2.5 text-label-medium',
                connected
                  ? 'bg-primary-container text-on-primary-container'
                  : 'bg-surface-container-highest text-on-surface-variant',
              )}
            >
              <Icon name={connected ? 'check_circle' : 'wifi_off'} size={18} />
              {connected ? t('antar.online') : t('common.reconnecting')}
            </span>
            <MoreButton />
          </>
        }
      >
        <Segmented
          label={t('common.language')}
          value={lang}
          onChange={(l) => void changeLang(l)}
          options={LANGS.map((l) => ({ value: l, label: LANG_SHORT[l] }))}
        />
      </TopBar>
      <div className="flex min-h-0 grow flex-col expanded:flex-row-reverse expanded:gap-4 expanded:px-4 expanded:pb-4">
        <div className="shrink-0 expanded:min-h-0 expanded:w-1/2 expanded:overflow-hidden expanded:rounded-lg">
          <DriverMap pins={pins} center={center} restoLabel={t('antar.resto')} label={t('antar.mapLabel')} />
        </div>
        <div className="flex min-h-0 grow flex-col expanded:w-1/2">
          <div className="shrink-0 px-4 pt-1 expanded:px-0">
            <Tabs
              label={t('driver.title')}
              value={tab}
              onChange={setTab}
              tabs={[
                { value: 'ready', label: `${t('driver.tabAvailable')} (${avail.length})` },
                { value: 'mine', label: `${t('driver.tabMine')} (${myOrders.length})` },
              ]}
            />
          </div>
          <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-4 pb-4 pt-3 expanded:px-0">
            {q.isLoading ? <LoadingBlock label={t('common.loading')} /> : null}
            {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
            {q.data && !list.length ? (
              <EmptyState
                icon="two_wheeler"
                title={tab === 'ready' ? t('driver.noAvailable') : t('driver.noMine')}
              />
            ) : null}
            {tab === 'mine' && myOrders.length > 1 && routeUrl ? (
              <a
                href={routeUrl}
                target="_blank"
                rel="noreferrer"
                className="state-layer flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-tertiary-container px-4 text-label-large text-on-tertiary-container"
              >
                <Icon name="directions" />
                {t('antar.route')}
              </a>
            ) : null}
            {list.map((o) => {
              const isMine = tab === 'mine';
              const nav =
                o.navigateUrl ??
                (o.address?.lat != null && o.address?.lng != null
                  ? mapsDirectionsUrl({ lat: o.address.lat, lng: o.address.lng })
                  : null);
              const tg = telegramLink(o.customer);
              const phone = o.customer?.phone;
              const pickedUp = o.status === 'picked_up';
              return (
                <article
                  key={o.id}
                  className="flex shrink-0 flex-col overflow-hidden rounded-md border border-outline-variant bg-surface-container-lowest"
                  data-testid="driver-card"
                  data-order-no={o.displayNo}
                >
                  <div className="flex flex-col gap-1.5 px-4 py-3">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-2">
                        <span
                          className={cn(
                            'rounded-sm px-2 py-0.5 text-title-medium tabular-nums',
                            isMine
                              ? 'bg-tertiary-container text-on-tertiary-container'
                              : 'bg-warning-container text-on-warning-container',
                          )}
                        >
                          {o.displayNo}
                        </span>
                        {o.distanceKm != null ? (
                          <b className="text-label-large text-on-surface-variant">
                            {formatDistance(o.distanceKm)}
                          </b>
                        ) : null}
                      </span>
                      <span className={cn('text-label-large', isMine ? 'text-tertiary' : 'text-warning')}>
                        {isMine ? (pickedUp ? t('antar.going') : t('antar.toPickup')) : t('antar.waiting')}
                      </span>
                    </div>
                    <span className="text-title-medium">{o.customerName ?? o.customer?.name ?? ''}</span>
                    <span className="flex items-start gap-1.5 text-body-large">
                      <Icon name="location_on" size={20} className="mt-0.5 text-on-surface-variant" />
                      {o.address?.text ?? '—'}
                    </span>
                    {o.address?.landmark ? (
                      <span className="text-label-medium text-on-surface-variant">
                        {t('driver.landmark')}: {o.address.landmark}
                      </span>
                    ) : null}
                    <div
                      className={cn(
                        'mt-1 flex items-center justify-between rounded-sm px-3 py-2',
                        o.cashToCollect > 0
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-secondary-container text-on-secondary-container',
                      )}
                    >
                      <span className="text-label-large">
                        {o.cashToCollect > 0 ? t('driver.collectCash') : t('driver.alreadyPaid')}
                      </span>
                      <b className="text-title-medium font-medium tabular-nums">
                        {formatMoney(o.cashToCollect, o.currency)}
                      </b>
                    </div>
                    {isMine ? (
                      <div className="mt-1 grid grid-cols-[2fr_1fr] gap-2">
                        {nav ? (
                          <a
                            href={nav}
                            target="_blank"
                            rel="noreferrer"
                            className="state-layer flex h-12 items-center justify-center gap-2 rounded-full bg-tertiary text-label-large text-on-tertiary"
                          >
                            <Icon name="navigation" size={20} />
                            {t('driver.navigate')}
                          </a>
                        ) : (
                          <span className="flex h-12 items-center justify-center rounded-full bg-surface-container-high text-label-medium text-on-surface-variant">
                            {t('antar.noLocation')}
                          </span>
                        )}
                        {phone ? (
                          <a
                            href={`tel:${phone}`}
                            className="state-layer flex h-12 items-center justify-center gap-1.5 rounded-full border border-outline text-label-large text-primary"
                          >
                            <Icon name="call" size={20} />
                            {t('driver.call')}
                          </a>
                        ) : tg && !o.customer?.telegramId ? (
                          <a
                            href={tg}
                            className="state-layer flex h-12 items-center justify-center gap-1.5 rounded-full border border-outline text-label-large text-primary"
                          >
                            <Icon name="send" size={20} />
                            Telegram
                          </a>
                        ) : !o.customer?.telegramId ? (
                          <span className="flex h-12 items-center justify-center rounded-full border border-outline-variant text-label-medium text-on-surface-variant">
                            —
                          </span>
                        ) : null}
                        {o.customer?.telegramId ? (
                          <button
                            type="button"
                            data-testid="driver-chat"
                            onClick={() => {
                              markRead(o.id);
                              setChat(o);
                            }}
                            className={cn(
                              'state-layer relative flex h-12 items-center justify-center gap-1.5 rounded-full border border-outline text-label-large text-primary',
                              phone && 'col-span-2',
                            )}
                          >
                            <Icon name="chat" size={20} />
                            {t('chat.open')}
                            {unread[o.id] ? (
                              <span className="absolute -right-1 -top-1 flex size-6 items-center justify-center rounded-full bg-error text-label-medium text-on-error">
                                {unread[o.id]}
                              </span>
                            ) : null}
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {isMine && !pickedUp ? (
                      <button
                        type="button"
                        onClick={() => release.mutate(o.id)}
                        className="state-layer -ml-3 mt-1 flex min-h-12 items-center self-start rounded-full px-3 text-label-large text-error"
                      >
                        {t('driver.release')}
                      </button>
                    ) : null}
                  </div>
                  {!isMine ? (
                    <button
                      type="button"
                      disabled={take.isPending}
                      onClick={() => take.mutate(o.id)}
                      className="state-layer mx-4 mb-4 flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-title-medium text-on-primary disabled:opacity-60"
                    >
                      <Icon name="two_wheeler" />
                      {t('antar.takeThis')}
                    </button>
                  ) : !pickedUp ? (
                    <button
                      type="button"
                      disabled={picked.isPending}
                      onClick={() => picked.mutate(o.id)}
                      className="state-layer mx-4 mb-4 flex h-14 items-center justify-center gap-2 rounded-full bg-tertiary text-title-medium text-on-tertiary disabled:opacity-60"
                    >
                      <Icon name="shopping_bag" />
                      {t('driver.pickedUp')}
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirm(o)}
                      className="state-layer mx-4 mb-4 flex h-14 items-center justify-center gap-2 rounded-full bg-primary text-title-medium text-on-primary"
                    >
                      <Icon name="check_circle" />
                      {t('driver.delivered')}
                    </button>
                  )}
                </article>
              );
            })}
          </main>
        </div>
      </div>
      <footer className="flex min-h-14 shrink-0 items-center justify-between gap-3 bg-surface-container-low px-4 py-2">
        <span className="text-body-medium text-on-surface-variant">{t('antar.cashOnHand')}</span>
        <b className="text-title-medium font-medium tabular-nums" data-testid="cash-carried">
          {formatMoney(mine.data?.cashCarried ?? 0, settings.data?.currency.main ?? 'KHR')}
        </b>
      </footer>
      <Sheet
        open={!!confirm}
        onClose={() => {
          setConfirm(null);
          setProof(null);
        }}
        title={t('driver.confirmDelivered')}
        variant="center"
        closeLabel={t('common.close')}
        footer={
          <div className="flex gap-2">
            <Button variant="outlined" className="w-28" onClick={() => setConfirm(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              className="grow"
              loading={delivered.isPending}
              onClick={() => confirm && delivered.mutate(confirm)}
            >
              {t('driver.delivered')}
            </Button>
          </div>
        }
      >
        {confirm ? (
          <div className="flex flex-col gap-2 text-body-medium">
            <b className="text-title-medium">{confirm.displayNo}</b>
            {confirm.cashToCollect > 0 ? (
              <div className="rounded-md bg-error-container p-3 text-on-error-container">
                {t('driver.cashReceived')}:{' '}
                <b className="text-headline-small">{formatMoney(confirm.cashToCollect, confirm.currency)}</b>
              </div>
            ) : (
              <div className="rounded-md bg-secondary-container p-3 text-on-secondary-container">
                {t('driver.alreadyPaid')}
              </div>
            )}
            <input
              ref={proofInput}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              data-testid="delivery-photo-input"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) setProof(f);
                e.target.value = '';
              }}
            />
            {proofUrl ? (
              <div className="relative">
                <img
                  src={proofUrl}
                  alt={t('driver.deliveryPhoto')}
                  className="max-h-56 w-full rounded-md object-cover"
                />
                <button
                  type="button"
                  onClick={() => proofInput.current?.click()}
                  className="state-layer absolute bottom-2 right-2 flex h-10 items-center gap-1.5 rounded-full bg-surface-container-lowest/95 px-3 text-label-large text-primary shadow-e1"
                >
                  <Icon name="photo_camera" size={18} />
                  {t('driver.retakePhoto')}
                </button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => proofInput.current?.click()}
                className="state-layer flex h-12 items-center justify-center gap-2 rounded-full border border-outline text-label-large text-primary"
              >
                <Icon name="photo_camera" size={20} />
                {t('driver.deliveryPhoto')}
              </button>
            )}
            {confirm.customer?.telegramId ? (
              <span className="text-label-medium text-on-surface-variant">
                {t('driver.deliveryPhotoHint')}
              </span>
            ) : null}
          </div>
        ) : null}
      </Sheet>
      {!q.data && !q.isLoading && !q.isError ? <EmptyState title={t('common.empty')} /> : null}
      {chat ? (
        <OrderChat
          orderId={chat.id}
          title={`${chat.displayNo} · ${chat.customer?.name ?? chat.customerName ?? ''}`}
          onClose={() => {
            markRead(chat.id);
            setChat(null);
          }}
        />
      ) : null}
    </Screen>
  );
}
