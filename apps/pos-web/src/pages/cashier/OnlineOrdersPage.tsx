/** Order online masuk (website / Telegram / QR meja) — acuan: docs/mockups/OrderWeb.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatMoney, type OrderDto } from '@pos/shared';
import { Button, EmptyState, Sheet, useToast } from '../../components/ui';
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
          className="flex shrink-0 items-center gap-2.5 bg-[#FDB022] px-3.5 py-2.5 text-base font-extrabold"
        >
          {t('online.banner', { count: list.length })}
        </div>
      ) : null}
      <main className="min-h-0 grow overflow-y-auto p-3">
        {pending.isLoading ? <LoadingBlock /> : null}
        {pending.isError ? <ErrorBlock error={pending.error} onRetry={() => void pending.refetch()} /> : null}
        {pending.data && !list.length ? (
          <EmptyState title={t('online.none')} description={t('online.noneHint')} />
        ) : null}
        <div className="grid gap-3 md:grid-cols-2">
          {list.map((o) => (
            <OnlineCard key={o.id} order={o} />
          ))}
        </div>
        {checking.length ? (
          <>
            <h2 className="mb-2 mt-5 text-base font-extrabold">{t('online.checkingTitle')}</h2>
            <div className="grid gap-3 md:grid-cols-2">
              {checking.map((o) => (
                <OnlineCard key={o.id} order={o} />
              ))}
            </div>
          </>
        ) : null}
        {others.length ? (
          <>
            <h2 className="mb-2 mt-5 text-base font-extrabold">{t('online.inProgress')}</h2>
            <div className="flex flex-col gap-2">
              {others.map((o) => (
                <button
                  key={o.id}
                  type="button"
                  onClick={() => navigate(`/kasir/pesanan/${o.id}`)}
                  className="flex min-h-14 items-center gap-2 rounded-card bg-white px-3 py-2 text-left shadow-card"
                >
                  <b className="w-16 shrink-0">{o.displayNo}</b>
                  <span className="flex min-w-0 grow flex-col">
                    <span className="truncate font-semibold">
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
      className="flex flex-col gap-2.5 rounded-card border-2 border-warn bg-white p-3.5 shadow-card"
      data-testid="online-card"
      data-order-no={o.displayNo}
    >
      <div className="flex items-center justify-between">
        <SourceBadge channel={o.channel} size="md" />
        <span className="text-[13px] text-muted">
          {t('online.becomes', { time: timeHM(o.createdAt), no: o.displayNo })}
        </span>
      </div>
      <div className="flex flex-col gap-0.5">
        <b className="text-[19px]">{who}</b>
        <span className="text-sm text-muted">{how}</span>
        {o.address?.landmark ? (
          <span className="text-sm text-muted">
            {t('order.landmark')}: {o.address.landmark}
          </span>
        ) : null}
      </div>
      {o.items.length <= 4 ? (
        <div className="border-y border-[#F2F4F7] py-1.5 text-[15px]">
          <OrderItemsList order={o} lang={i18n.language} compact />
        </div>
      ) : null}
      <div className="flex items-baseline justify-between">
        <span>
          {o.items.length > 4
            ? `${t('common.items', { count: itemCount })} · ${t('common.total')}`
            : t('common.total')}
        </span>
        <b className="text-2xl tabular-nums">{formatMoney(o.total, o.currency)}</b>
      </div>
      {o.note ? (
        <div className="text-sm font-bold text-danger">
          {t('common.note')}: {o.note}
        </div>
      ) : null}
      {o.paymentMethod === 'aba' ? (
        noProof ? (
          <div className="rounded-[10px] bg-warn-tint px-3 py-2 text-sm text-warn-dark">
            <b>{t('online.abaWaiting')}</b>
            <br />
            {t('online.notSentYet')}
          </div>
        ) : (
          <div className="flex flex-col gap-2 rounded-[10px] bg-primary-tint px-3 py-2 text-sm text-primary-dark">
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
                <Button size="md" variant="outline" className="grow" onClick={() => setProofOpen(true)}>
                  {t('online.viewProof')}
                </Button>
                {pay ? (
                  <Button
                    size="md"
                    variant="outline"
                    className="text-danger"
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
        <div className="rounded-[10px] bg-[#F2F4F7] px-3 py-2 text-sm font-bold">
          {o.type === 'delivery' ? t('order.payCash') : t('online.payAtCashier')}
        </div>
      ) : null}
      {o.type === 'delivery' ? (
        <div className="rounded-[10px] bg-info-tint px-3 py-2 text-[13px] text-info-dark">
          {t('online.driverNote')}
        </div>
      ) : null}
      <div className="flex gap-2">
        {isPending ? (
          <button
            type="button"
            onClick={() => setRejectOpen(true)}
            className="h-14 w-[104px] rounded-[14px] border-2 border-[#F04438] bg-white text-base font-extrabold text-danger shadow-card"
          >
            {t('cashier.reject')}
          </button>
        ) : null}
        {isPending || pay ? (
          noProof ? (
            <button
              type="button"
              disabled
              className="h-14 grow cursor-default rounded-[14px] bg-[#E4E7EC] text-[17px] font-extrabold text-[#475467]"
            >
              {t('online.waitingProofBtn')}
            </button>
          ) : (
            <Button className="h-14 grow text-xl" loading={accept.isPending} onClick={() => accept.mutate()}>
              {isPending ? t('cashier.accept') : t('payment.approve')}
            </Button>
          )
        ) : null}
      </div>
      {o.channel === 'telegram' ? (
        <span className="text-xs text-muted">{t('online.telegramNotify')}</span>
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
        {o.proofUrl ? <img src={o.proofUrl} alt={t('payment.proof')} className="w-full rounded-xl" /> : null}
      </Sheet>
    </article>
  );
}
