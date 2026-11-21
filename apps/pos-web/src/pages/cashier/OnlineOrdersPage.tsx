/** Order online masuk (website / Telegram / QR meja) — acuan: docs/mockups/OrderWeb.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatMoney, type OrderDto } from '@pos/shared';
import { Button, EmptyState, Icon, Sheet, useToast } from '../../components/ui';
import {
  ErrorBlock,
  LoadingBlock,
  OrderItemsList,
  ReasonSheet,
  Screen,
  SourceBadge,
  StatusBadge,
  TopBar,
  timeHM,
} from '../../components/common';
import { CashierActions } from '../../components/cashier/CashierHeader';
import { api, errorMessage, qk } from '../../lib/api';
import { isOnlineOrder, markOnlineSeen, usePendingOnline } from '../../lib/online';

export function unverifiedAba(o: OrderDto) {
  return o.payments.find((p) => p.method === 'aba' && !p.verifiedAt && !!p.proofUrl) ?? null;
}
export function waitingProof(o: OrderDto): boolean {
  return o.paymentMethod === 'aba' && o.paymentStatus === 'unpaid' && !o.proofUrl;
}

export default function OnlineOrdersPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const pending = usePendingOnline();
  const active = useQuery({
    queryKey: qk.orders({ active: 'true' }),
    queryFn: async () =>
      (await api.call('ordersList', { query: { active: 'true' } })).orders.filter(isOnlineOrder),
  });
  const list = useMemo(() => pending.data ?? [], [pending.data]);
  useEffect(() => {
    markOnlineSeen(list.map((o) => o.id));
  }, [list]);
  const checking = (active.data ?? []).filter(
    (o) => o.status !== 'pending_accept' && o.paymentStatus === 'pending_verification',
  );
  const others = (active.data ?? []).filter(
    (o) => o.status !== 'pending_accept' && o.paymentStatus !== 'pending_verification',
  );

  return (
    <Screen wide testId="online-screen">
      <TopBar
        back={{ label: t('cashier.title'), onClick: () => navigate('/kasir') }}
        title={t('online.title')}
        right={<CashierActions onOnlineScreen />}
      />
      {list.length ? (
        <div
          role="status"
          className="mx-4 flex shrink-0 items-center gap-3 rounded-md bg-warning-container px-4 py-3 text-body-large text-on-warning-container"
        >
          <Icon name="notifications_active" />
          {t('online.banner', { count: list.length })}
        </div>
      ) : null}
      <main className="min-h-0 grow overflow-y-auto px-4 py-3">
        {pending.isLoading ? <LoadingBlock /> : null}
        {pending.isError ? <ErrorBlock error={pending.error} onRetry={() => void pending.refetch()} /> : null}
        {pending.data && !list.length ? (
          <EmptyState icon="notifications" title={t('online.none')} description={t('online.noneHint')} />
        ) : null}
        <div className="grid gap-3 medium:grid-cols-2 large:grid-cols-3">
          {list.map((o) => (
            <OnlineCard key={o.id} order={o} />
          ))}
        </div>
        {checking.length ? (
          <>
            <h2 className="mb-2 mt-5 text-title-medium">{t('online.checkingTitle')}</h2>
            <div className="grid gap-3 medium:grid-cols-2 large:grid-cols-3">
              {checking.map((o) => (
                <OnlineCard key={o.id} order={o} />
              ))}
            </div>
          </>
        ) : null}
        {others.length ? (
          <>
            <h2 className="mb-2 mt-5 text-title-medium">{t('online.inProgress')}</h2>
            <div className="grid gap-2 expanded:grid-cols-2">
              {others.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => navigate(`/kasir/pesanan/${o.id}`)}
                  className="state-layer flex min-h-[72px] items-center gap-3 rounded-md border border-outline-variant bg-surface-container-lowest px-4 py-2 text-left"
                >
                  <b className="w-16 shrink-0 text-title-medium tabular-nums">{o.displayNo}</b>
                  <span className="flex min-w-0 grow flex-col">
                    <span className="truncate font-medium">
                      {o.customerName ?? o.customer?.name ?? o.table?.name ?? '—'}
                    </span>
                    <SourceBadge channel={o.channel} />
                  </span>
                  <StatusBadge status={o.status} />
                </button>
              ))}
            </div>
          </>
        ) : null}
      </main>
    </Screen>
  );
}

export function OnlineCard({ order: o }: { order: OrderDto }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [rejectOpen, setRejectOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const pay = unverifiedAba(o);
  const noProof = waitingProof(o);
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: qk.tables });
  };
  const accept = useMutation({
    mutationFn: async () => {
      if (pay) await api.call('paymentVerify', { params: { id: pay.id }, body: { approved: true } });
      if (o.status === 'pending_accept') return api.call('orderAccept', { params: { id: o.id }, body: {} });
      return null;
    },
    onSuccess: () => {
      toast.success(t('online.accepted', { no: o.displayNo }));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const decline = useMutation({
    mutationFn: () => api.call('paymentVerify', { params: { id: pay!.id }, body: { approved: false } }),
    onSuccess: () => {
      toast.show(t('online.proofDeclined'));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const reject = useMutation({
    mutationFn: (reason: string) => api.call('orderReject', { params: { id: o.id }, body: { reason } }),
    onSuccess: () => {
      setRejectOpen(false);
      toast.show(t('online.rejected', { no: o.displayNo }));
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const who =
    o.customerName ??
    o.customer?.name ??
    (o.customer?.username ? `@${o.customer.username}` : t('online.customer'));
  const how =
    o.type === 'delivery'
      ? [
          t('orderType.delivery'),
          o.address?.text,
          o.channel === 'telegram' ? t('online.viaTelegram') : o.customer?.phone,
        ]
          .filter(Boolean)
          .join(' · ')
      : o.type === 'dine_in'
        ? `${t('orderType.dine_in')}${o.table ? ` · ${o.table.name}` : ''}`
        : t('online.pickup');
  const itemCount = o.items.reduce((a, i) => a + i.qty, 0);
  const isPending = o.status === 'pending_accept';

  return (
    <article
      className="flex flex-col gap-3 rounded-md border-2 border-warning bg-surface-container-lowest p-4 shadow-e1"
      data-testid="online-card"
      data-order-no={o.displayNo}
    >
      <div className="flex items-center justify-between">
        <SourceBadge channel={o.channel} size="md" />
        <span className="text-label-medium text-on-surface-variant">
          {t('online.becomes', { time: timeHM(o.createdAt), no: o.displayNo })}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <b className="text-title-large">{who}</b>
        <span className="text-body-medium text-on-surface-variant">{how}</span>
        {o.address?.landmark ? (
          <span className="text-label-medium text-on-surface-variant">
            {t('order.landmark')}: {o.address.landmark}
          </span>
        ) : null}
      </div>
      {o.items.length <= 4 ? (
        <div className="border-y border-surface-container-highest py-1.5 text-body-medium">
          <OrderItemsList order={o} lang={i18n.language} compact />
        </div>
      ) : null}
      <div className="flex items-baseline justify-between">
        <span>
          {o.items.length > 4
            ? `${t('common.items', { count: itemCount })} · ${t('common.total')}`
            : t('common.total')}
        </span>
        <b className="text-headline-small font-medium tabular-nums">{formatMoney(o.total, o.currency)}</b>
      </div>
      {o.note ? (
        <div className="text-body-medium font-medium text-error">
          {t('common.note')}: {o.note}
        </div>
      ) : null}
      {o.paymentMethod === 'aba' ? (
        noProof ? (
          <div className="rounded-sm bg-warning-container px-3 py-2 text-body-medium text-on-warning-container">
            <b>{t('online.abaWaiting')}</b>
            <br />
            {t('online.notSentYet')}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-sm bg-secondary-container px-3 py-2 text-body-medium text-on-secondary-container">
            <span>
              <b>{o.paymentStatus === 'paid' ? t('online.abaVerified') : t('online.abaProof')}</b>
              {pay ? (
                <>
                  <br />
                  {t('online.proofAmount', { amount: formatMoney(pay.amount, pay.currency) })}
                </>
              ) : null}
            </span>
            {o.proofUrl ? (
              <div className="flex gap-2">
                <Button size="md" variant="outlined" className="grow" onClick={() => setProofOpen(true)}>
                  {t('online.viewProof')}
                </Button>
                {pay ? (
                  <Button
                    size="md"
                    variant="outlined"
                    className="border-error text-error"
                    loading={decline.isPending}
                    onClick={() => decline.mutate()}
                  >
                    {t('payment.decline')}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        )
      ) : o.paymentMethod === 'cash' ? (
        <div className="rounded-sm bg-surface-container-high px-3 py-2 text-body-medium">
          {o.type === 'delivery' ? t('order.payCash') : t('online.payAtCashier')}
        </div>
      ) : null}
      {o.type === 'delivery' ? (
        <div className="flex items-center gap-2 rounded-sm bg-tertiary-container px-3 py-2 text-body-medium text-on-tertiary-container">
          <Icon name="delivery_dining" size={20} />
          {t('online.driverNote')}
        </div>
      ) : null}
      <div className="flex gap-2">
        {isPending ? (
          <button
            type="button"
            onClick={() => setRejectOpen(true)}
            className="state-layer h-14 w-[112px] shrink-0 rounded-full border border-error text-label-large text-error"
          >
            {t('cashier.reject')}
          </button>
        ) : null}
        {isPending || pay ? (
          noProof ? (
            <button
              type="button"
              disabled
              className="h-14 grow cursor-default rounded-full bg-on-surface/12 text-label-large text-on-surface/60"
            >
              {t('online.waitingProofBtn')}
            </button>
          ) : (
            <Button className="grow" loading={accept.isPending} onClick={() => accept.mutate()}>
              {isPending ? t('cashier.accept') : t('payment.approve')}
            </Button>
          )
        ) : null}
      </div>
      {o.channel === 'telegram' ? (
        <span className="text-label-medium text-on-surface-variant">{t('online.telegramNotify')}</span>
      ) : null}
      <ReasonSheet
        open={rejectOpen}
        title={`${t('cashier.reject')} ${o.displayNo}`}
        label={t('cashier.rejectReason')}
        confirmLabel={t('cashier.reject')}
        quick={[
          t('online.reasonSoldOut'),
          t('online.reasonTooFar'),
          t('online.reasonClosed'),
          t('online.reasonProof'),
        ]}
        loading={reject.isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={(r) => reject.mutate(r)}
      />
      <Sheet
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        title={`${t('payment.proof')} · ${o.displayNo}`}
        closeLabel={t('common.close')}
      >
        {o.proofUrl ? <img src={o.proofUrl} alt={t('payment.proof')} className="w-full rounded-md" /> : null}
      </Sheet>
    </article>
  );
}
