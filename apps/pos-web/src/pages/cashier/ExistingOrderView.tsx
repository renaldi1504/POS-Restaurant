import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { OrderChat } from '../../components/driver/OrderChat';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatMoney, hasPermission, nextStatuses, type OrderDto, type OrderStatus } from '@pos/shared';
import { Badge, Button, Icon, Sheet, useToast } from '../../components/ui';
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
          <div className="flex flex-col gap-2 rounded-md bg-warning-container p-3 text-on-warning-container">
            <b className="text-title-medium">{t('cashier.adminPin')}</b>
            <span className="text-body-medium">{t('pesanan.adminPinHint')}</span>
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
  const [chatOpen, setChatOpen] = useState(false);
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
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-4 py-3">
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
            <div className="text-body-medium">
              <b>{order.customerName ?? order.customer?.name}</b>
              {order.customer?.phone ? (
                <span className="text-on-surface-variant"> · {order.customer.phone}</span>
              ) : null}
            </div>
          ) : null}
          {order.customer?.telegramId && order.type === 'delivery' ? (
            <button
              type="button"
              data-testid="order-chat-open"
              onClick={() => setChatOpen(true)}
              className="state-layer flex h-11 items-center gap-2 self-start rounded-full border border-outline px-4 text-label-large text-primary"
            >
              <Icon name="chat" size={20} />
              {t('chat.title')}
            </button>
          ) : null}
          {order.address ? (
            <div className="text-label-medium text-on-surface-variant">
              {order.address.text}
              {order.address.landmark ? ` · ${t('order.landmark')}: ${order.address.landmark}` : ''}
            </div>
          ) : null}
          {order.driver ? (
            <div className="text-label-medium">{t('order.driverName', { name: order.driver.name })}</div>
          ) : null}
          {order.note ? (
            <div className="text-label-medium font-medium text-error">
              {t('common.note')}: {order.note}
            </div>
          ) : null}
          {order.rejectReason ? (
            <div className="text-label-medium font-medium text-error">
              {t('common.reason')}: {order.rejectReason}
            </div>
          ) : null}
          {order.cancelReason ? (
            <div className="text-label-medium font-medium text-error">
              {t('common.reason')}: {order.cancelReason}
            </div>
          ) : null}
        </Section>
        <Section>
          <OrderItemsList order={order} lang={lang} />
          <div className="mt-1 flex flex-col gap-1 border-t border-surface-container-highest pt-2 text-body-medium">
            <Row label={t('common.subtotal')} value={formatMoney(order.subtotal, order.currency)} />
            {order.discount ? (
              <Row label={t('common.discount')} value={`-${formatMoney(order.discount, order.currency)}`} />
            ) : null}
            {order.deliveryFee ? (
              <Row label={t('common.deliveryFee')} value={formatMoney(order.deliveryFee, order.currency)} />
            ) : null}
            <div className="flex items-baseline justify-between">
              <b className="text-title-medium">{t('common.total')}</b>
              <b className="text-headline-small font-medium tabular-nums">
                {formatMoney(order.total, order.currency)}
              </b>
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
              <div key={p.id} className="flex justify-between text-body-medium">
                <span>
                  {t(`paymentMethod.${p.method}`)} · {timeHM(p.createdAt)}
                  {p.method === 'aba' && p.proofUrl && !p.verifiedAt ? (
                    <span className="ml-1 font-medium text-warning">({t('payment.verify')})</span>
                  ) : null}
                </span>
                <b className="tabular-nums">{formatMoney(p.amount, p.currency)}</b>
              </div>
            ))}
          </Section>
        ) : null}
        {order.proofUrl ? (
          <Button variant="outlined" onClick={() => setProofOpen(true)}>
            {t('online.viewProof')}
          </Button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <Button
            variant="outlined"
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
              variant="outlined"
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
              variant="outlined"
              size="md"
              className="border-error text-error"
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
                className="state-layer h-14 w-[112px] shrink-0 rounded-full border border-error text-label-large text-error"
              >
                {t('cashier.reject')}
              </button>
              <Button className="grow" loading={accept.isPending} onClick={() => accept.mutate()}>
                {t('cashier.accept')}
              </Button>
            </div>
          ) : (
            <div className="flex gap-2">
              {cashierNext.map((s) => (
                <Button
                  key={s}
                  variant="tonal"
                  className="grow"
                  loading={status.isPending}
                  onClick={() => status.mutate(s)}
                >
                  {s === 'served' ? t('cashier.markServed') : t('cashier.markDone')}
                </Button>
              ))}
              {unpaid && hasPermission(me?.permissions, 'payment.create') ? (
                <Button className="grow" onClick={() => navigate(`/kasir/bayar/${order.id}`)}>
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
          <img src={order.proofUrl} alt={t('payment.proof')} className="w-full rounded-md" />
        ) : null}
      </Sheet>
      {chatOpen ? (
        <OrderChat
          orderId={order.id}
          title={`${order.displayNo} · ${order.customerName ?? order.customer?.name ?? ''}`}
          onClose={() => setChatOpen(false)}
        />
      ) : null}
    </Screen>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-on-surface-variant">
      <span>{label}</span>
      <span className="tabular-nums">{value}</span>
    </div>
  );
}
