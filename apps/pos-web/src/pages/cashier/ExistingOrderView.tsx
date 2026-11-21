import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatMoney, hasPermission, nextStatuses, type OrderDto, type OrderStatus } from '@pos/shared';
import { Badge, Button, Sheet, useToast } from '../../components/ui';
import {
  ErrorBlock,
  LoadingBlock,
  OrderItemsList,
  PinPad,
  ReasonSheet,
  Screen,
  ScreenFooter,
  Section,
  SourceBadge,
  StatusBadge,
  TopBar,
  timeHM,
  usePrint,
} from '../../components/common';
import { api, errorMessage, isApiError, qk } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { cartFromOrder, setCart } from '../../lib/cart';
import { useMoney, usePublicSettings } from '../../lib/data';
import { getPrefs } from '../../lib/prefs';
import { receiptFromOrder } from '../../lib/receiptData';
import { kindLabel } from './CartView';
import { kindFromOrder } from '../../lib/cart';

/** Batalkan order: alasan wajib; sudah dibayar & tanpa hak → PIN admin. */
export function CancelOrderSheet({
  order,
  open,
  onClose,
  onDone,
}: {
  order: OrderDto;
  open: boolean;
  onClose: () => void;
  onDone?: (o: OrderDto) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const { data: me } = useMe();
  const needPin = order.paymentStatus === 'paid' && !hasPermission(me?.permissions, 'order.cancel_paid');
  const [pin, setPin] = useState('');
  const [pinNeeded, setPinNeeded] = useState(needPin);
  const cancel = useMutation({
    mutationFn: (reason: string) =>
      api.call('orderCancel', {
        params: { id: order.id },
        body: { reason, ...(pinNeeded && pin.length === 4 ? { adminPin: pin } : {}) },
      }),
    onSuccess: (res) => {
      qc.setQueryData(qk.order(order.id), res);
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: qk.tables });
      toast.success(t('pesanan.cancelled', { no: order.displayNo }));
      onClose();
      onDone?.(res.order);
    },
    onError: (e) => {
      if (isApiError(e) && (e.code === 'ADMIN_PIN_REQUIRED' || e.code === 'PIN_INVALID')) {
        setPinNeeded(true);
        setPin('');
      }
      toast.error(errorMessage(e, t));
    },
  });
  return (
    <ReasonSheet
      open={open}
      title={`${t('cashier.cancelOrder')} ${order.displayNo}`}
      label={t('cashier.cancelReason')}
      confirmLabel={t('cashier.cancelOrder')}
      quick={[t('pesanan.quickCustomer'), t('pesanan.quickWrong'), t('pesanan.quickSoldOut')]}
      loading={cancel.isPending}
      onClose={onClose}
      onConfirm={(r) => {
        if (pinNeeded && pin.length !== 4) return toast.error(t('errors.ADMIN_PIN_REQUIRED'));
        cancel.mutate(r);
      }}
      extra={
        pinNeeded ? (
          <div className="flex flex-col gap-2 rounded-xl bg-warn-tint p-3">
            <b className="text-warn-dark">{t('cashier.adminPin')}</b>
            <span className="text-sm text-warn-dark">{t('pesanan.adminPinHint')}</span>
            <PinPad value={pin} onChange={setPin} />
          </div>
        ) : null
      }
    />
  );
}

export function ExistingOrderView({ orderId }: { orderId: string }) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const money = useMoney();
  const settings = usePublicSettings();
  const { data: me } = useMe();
  const print = usePrint();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [proofOpen, setProofOpen] = useState(false);
  const q = useQuery({
    queryKey: qk.order(orderId),
    queryFn: () => api.call('orderGet', { params: { id: orderId } }),
  });
  const order = q.data?.order;

  const onOrder = (res: { order: OrderDto }) => {
    qc.setQueryData(qk.order(orderId), res);
    void qc.invalidateQueries({ queryKey: ['orders'] });
    void qc.invalidateQueries({ queryKey: qk.tables });
  };
  const status = useMutation({
    mutationFn: (s: OrderStatus) => api.call('orderStatus', { params: { id: orderId }, body: { status: s } }),
    onSuccess: (r) => {
      onOrder(r);
      toast.success(t(`status.${r.order.status}`));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const accept = useMutation({
    mutationFn: () => api.call('orderAccept', { params: { id: orderId }, body: {} }),
    onSuccess: onOrder,
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const reject = useMutation({
    mutationFn: (reason: string) => api.call('orderReject', { params: { id: orderId }, body: { reason } }),
    onSuccess: (r) => {
      onOrder(r);
      setRejectOpen(false);
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !order)
    return (
      <Screen>
        <TopBar
          back={{ label: t('cashier.title'), onClick: () => navigate(-1) }}
          title={t('cashier.orderDetail')}
        />
        <div className="p-4">
          <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
        </div>
      </Screen>
    );

  const terminal = ['done', 'cancelled', 'rejected'].includes(order.status);
  const unpaid = order.paymentStatus !== 'paid';
  const canEdit = unpaid && !terminal && order.status !== 'pending_accept' && order.paidMain === 0;
  const cashierNext = nextStatuses(order.status, order.type).filter((s) => s === 'served' || s === 'done');
  const kind = kindFromOrder(order);
  const lang = i18n.language;

  return (
    <Screen testId="order-detail-screen">
      <TopBar
        back={{ label: t('common.back'), onClick: () => navigate(-1) }}
        title={`${t('cashier.orderNo', { no: order.displayNo })}`}
        subtitle={`${timeHM(order.createdAt)} · ${kindLabel(kind, t)}${order.table ? ` · ${order.table.name}` : ''}`}
        right={<StatusBadge status={order.status} />}
      />
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-3.5 py-3">
        <Section
          title={
            <span className="flex items-center gap-2">
              <SourceBadge channel={order.channel} />
              <Badge
                tone={
                  order.paymentStatus === 'paid'
                    ? 'primary'
                    : order.paymentStatus === 'pending_verification'
                      ? 'warn'
                      : 'danger'
                }
              >
                {t(`paymentStatus.${order.paymentStatus}`)}
              </Badge>
            </span>
          }
        >
          {order.customerName || order.customer?.name ? (
            <div className="text-[15px]">
              <b>{order.customerName ?? order.customer?.name}</b>
              {order.customer?.phone ? <span className="text-muted"> · {order.customer.phone}</span> : null}
            </div>
          ) : null}
          {order.address ? (
            <div className="text-sm text-muted">
              {order.address.text}
              {order.address.landmark ? ` · ${t('order.landmark')}: ${order.address.landmark}` : ''}
            </div>
          ) : null}
          {order.driver ? (
            <div className="text-sm">{t('order.driverName', { name: order.driver.name })}</div>
          ) : null}
          {order.note ? (
            <div className="text-sm font-bold text-danger">
              {t('common.note')}: {order.note}
            </div>
          ) : null}
          {order.rejectReason ? (
            <div className="text-sm font-bold text-danger">
              {t('common.reason')}: {order.rejectReason}
            </div>
          ) : null}
          {order.cancelReason ? (
            <div className="text-sm font-bold text-danger">
              {t('common.reason')}: {order.cancelReason}
            </div>
          ) : null}
        </Section>
        <Section>
          <OrderItemsList order={order} lang={lang} />
          <div className="mt-1 flex flex-col gap-1 border-t border-[#F2F4F7] pt-2 text-[15px]">
            <Row label={t('common.subtotal')} value={formatMoney(order.subtotal, order.currency)} />
            {order.discount ? (
              <Row label={t('common.discount')} value={`-${formatMoney(order.discount, order.currency)}`} />
            ) : null}
            {order.deliveryFee ? (
              <Row label={t('common.deliveryFee')} value={formatMoney(order.deliveryFee, order.currency)} />
            ) : null}
            <div className="flex items-baseline justify-between">
              <b className="text-lg">{t('common.total')}</b>
              <b className="text-2xl tabular-nums">{formatMoney(order.total, order.currency)}</b>
            </div>
            {order.paidMain > 0 && unpaid ? (
              <Row
                label={t('payment.remaining')}
                value={formatMoney(order.total - order.paidMain, order.currency)}
              />
            ) : null}
          </div>
        </Section>
        {order.payments.length ? (
          <Section title={t('payment.title')}>
            {order.payments.map((p) => (
              <div key={p.id} className="flex justify-between text-[15px]">
                <span>
                  {t(`paymentMethod.${p.method}`)} · {timeHM(p.createdAt)}
                  {p.method === 'aba' && p.proofUrl && !p.verifiedAt ? (
                    <span className="ml-1 font-bold text-warn-dark">({t('payment.verify')})</span>
                  ) : null}
                </span>
                <b className="tabular-nums">{formatMoney(p.amount, p.currency)}</b>
              </div>
            ))}
          </Section>
        ) : null}
        {order.proofUrl ? (
          <Button variant="outline" onClick={() => setProofOpen(true)}>
            {t('online.viewProof')}
          </Button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outline"
            size="md"
            onClick={() =>
              void print.printReceipt(
                receiptFromOrder(order, {
                  shop: settings.data,
                  money,
                  lang: getPrefs().receiptLang,
                  cashier: me?.name,
                }),
              )
            }
          >
            {unpaid ? t('tables.printTemp') : t('payment.printReceipt')}
          </Button>
          {canEdit ? (
            <Button
              variant="outline"
              size="md"
              onClick={() => {
                setCart(cartFromOrder(order));
                navigate('/kasir');
              }}
            >
              {t('cashier.editOrder')}
            </Button>
          ) : null}
          {!terminal && hasPermission(me?.permissions, 'order.create') ? (
            <Button
              variant="outline"
              size="md"
              className="border-2 border-[#F04438] text-danger"
              onClick={() => setCancelOpen(true)}
            >
              {t('cashier.cancelOrder')}
            </Button>
          ) : null}
        </div>
      </main>
      {!terminal ? (
        <ScreenFooter>
          {order.status === 'pending_accept' ? (
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setRejectOpen(true)}
                className="h-14 w-[104px] rounded-[14px] border-2 border-[#F04438] bg-white text-base font-extrabold text-danger shadow-card"
              >
                {t('cashier.reject')}
              </button>
              <Button className="grow text-xl" loading={accept.isPending} onClick={() => accept.mutate()}>
                {t('cashier.accept')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {cashierNext.map((s) => (
                <Button
                  key={s}
                  variant="secondary"
                  className="grow"
                  loading={status.isPending}
                  onClick={() => status.mutate(s)}
                >
                  {s === 'served' ? t('cashier.markServed') : t('cashier.markDone')}
                </Button>
              ))}
              {unpaid && hasPermission(me?.permissions, 'payment.create') ? (
                <Button className="grow text-xl" onClick={() => navigate(`/kasir/bayar/${order.id}`)}>
                  {t('cashier.pay')}
                </Button>
              ) : null}
            </div>
          )}
        </ScreenFooter>
      ) : null}
      <CancelOrderSheet order={order} open={cancelOpen} onClose={() => setCancelOpen(false)} />
      <ReasonSheet
        open={rejectOpen}
        title={`${t('cashier.reject')} ${order.displayNo}`}
        label={t('cashier.rejectReason')}
        confirmLabel={t('cashier.reject')}
        quick={[t('online.reasonSoldOut'), t('online.reasonTooFar'), t('online.reasonClosed')]}
        loading={reject.isPending}
        onClose={() => setRejectOpen(false)}
        onConfirm={(r) => reject.mutate(r)}
      />
      <Sheet
        open={proofOpen}
        onClose={() => setProofOpen(false)}
        title={t('payment.proof')}
        closeLabel={t('common.close')}
      >
        {order.proofUrl ? (
          <img src={order.proofUrl} alt={t('payment.proof')} className="w-full rounded-xl" />
        ) : null}
      </Sheet>
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
