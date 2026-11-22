/** Status pesanan — realtime (socket room customer/table) + polling cadangan. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { TERMINAL_ORDER_STATUSES, tl, type PublicOrderDto } from '@pos/shared';
import { AbaAccountInfo } from '../components/AbaAccountInfo';
import { ProofPicker } from '../components/ProofPicker';
import { ErrorBlock, LoadingBlock, Page } from '../components/Shell';
import { StatusSteps } from '../components/StatusSteps';
import { TableBill } from '../components/TableBill';
import { Badge, Button, Card, cn, HeaderBar, Icon, useToast, type IconName } from '../components/ui';
import { api, errorMessage, isApiError, qk, uploadProof } from '../lib/api';
import { useCustomer } from '../lib/customer';
import { money, typeLabelKey, useSettings } from '../lib/menu';
import { useSocketStatus } from '../lib/socket';
import { useTableBill } from '../lib/table';

function HeroCard({
  tone,
  icon,
  title,
  body,
  ...rest
}: {
  tone: 'danger' | 'warn' | 'primary';
  icon: IconName;
  title: string;
  body?: string | null;
  role: string;
  'data-testid'?: string;
}) {
  const cls = {
    danger: ['bg-error-container text-on-error-container', 'bg-error text-on-error'],
    warn: ['bg-warning-container text-on-warning-container', 'bg-warning text-on-warning'],
    primary: ['bg-primary-container/70 text-on-primary-container', 'bg-primary text-on-primary'],
  }[tone];
  return (
    <div className={cn('flex animate-fade-in items-center gap-4 rounded-2xl p-4', cls[0])} {...rest}>
      <span
        aria-hidden
        className={cn('flex size-14 shrink-0 items-center justify-center rounded-full', cls[1])}
      >
        <Icon name={icon} size={30} filled />
      </span>
      <div className="flex min-w-0 flex-col gap-0.5">
        <b className="font-display text-title-large">{title}</b>
        {body ? <p className="text-body-medium">{body}</p> : null}
      </div>
    </div>
  );
}

function StatusHero({ order }: { order: PublicOrderDto }) {
  const { t } = useTranslation();
  if (order.status === 'rejected') {
    return (
      <HeroCard
        tone="danger"
        icon="cancel"
        role="alert"
        data-testid="status-rejected"
        title={t('order.rejected')}
        body={order.rejectReason ? t('web.rejectedReason', { reason: order.rejectReason }) : null}
      />
    );
  }
  if (order.status === 'cancelled') {
    return <HeroCard tone="danger" icon="cancel" role="alert" title={t('web.cancelled')} />;
  }
  if (order.status === 'pending_accept') {
    return (
      <HeroCard
        tone="warn"
        icon="hourglass_top"
        role="status"
        data-testid="status-pending"
        title={t('status.pending_accept')}
        body={t('order.waitingAccept')}
      />
    );
  }
  if (order.status === 'done' || order.status === 'delivered') {
    return (
      <HeroCard
        tone="primary"
        icon="check_circle"
        role="status"
        title={t('order.thanks')}
        body={t('web.doneTitle')}
      />
    );
  }
  return null;
}

function ProofSection({ order }: { order: PublicOrderDto }) {
  const { data: settings } = useSettings();
  const { t } = useTranslation();
  const toast = useToast();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const up = useMutation({
    mutationFn: (f: File) => uploadProof(order.id, f, f.name),
    onSuccess: (res) => {
      qc.setQueryData(qk.order(order.id), res);
      setFile(null);
      toast.success(t('order.proofUploaded'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  if (order.paymentMethod !== 'aba') return null;
  if (order.paymentStatus === 'paid') {
    return (
      <Card className="flex items-center justify-between rounded-2xl border-0 shadow-card">
        <span className="flex items-center gap-2 font-medium">
          <Icon name="account_balance" className="text-primary" />
          ABA
        </span>
        <Badge tone="primary">{t('web.paid')}</Badge>
      </Card>
    );
  }
  if (order.proofUploaded) {
    return (
      <Card tone="primary" className="flex items-center gap-3 rounded-2xl" data-testid="proof-done">
        <Icon name="check_circle" filled className="text-primary" />
        <span className="flex flex-col">
          <b>{t('order.proofUploaded')}</b>
          <span className="text-label-medium">{t('order.waitingVerification')}</span>
        </span>
      </Card>
    );
  }
  if (TERMINAL_ORDER_STATUSES.includes(order.status)) return null;
  return (
    <Card tone="warn" className="flex flex-col gap-2.5 rounded-2xl" data-testid="proof-needed">
      <b className="flex items-center gap-2">
        <Icon name="photo_camera" />
        {t('web.proofNeeded')}
      </b>
      <div className="flex items-baseline justify-between">
        <span className="text-label-medium">{t('web.abaAmount')}</span>
        <b className="text-title-large tabular-nums">{money(order.total, order.currency)}</b>
      </div>
      <AbaAccountInfo settings={settings} />
      <ProofPicker value={file} onChange={setFile} />
      {file ? (
        <Button block loading={up.isPending} onClick={() => up.mutate(file)}>
          {t('web.sendProof')}
        </Button>
      ) : null}
    </Card>
  );
}

export default function OrderStatusPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { id = '' } = useParams();
  const customer = useCustomer();
  const { connected } = useSocketStatus();
  const q = useQuery({
    queryKey: qk.order(id),
    queryFn: () => api.call('publicOrderGet', { params: { id } }),
    refetchInterval: (query) => {
      const st = query.state.data?.order.status;
      if (st && TERMINAL_ORDER_STATUSES.includes(st)) return false;
      return connected ? 30_000 : 8_000;
    },
  });
  const order = q.data?.order;
  const isTable = customer.mode === 'table' || order?.channel === 'qr';
  const bill = useTableBill();

  return (
    <Page testId="status-page">
      <HeaderBar
        title={t('order.statusTitle')}
        subtitle={
          order
            ? `${t('order.orderNumber', { no: order.displayNo })} · ${t(typeLabelKey(order.type))}`
            : undefined
        }
        onBack={() => navigate(customer.homePath)}
        backLabel={t('web.backToMenu')}
      />
      <main className="flex grow flex-col gap-3 p-4">
        {q.isPending ? (
          <LoadingBlock />
        ) : q.isError || !order ? (
          <ErrorBlock
            message={
              isApiError(q.error) && q.error.status === 404
                ? t('web.orderNotFound')
                : errorMessage(q.error, t)
            }
            onRetry={() => void q.refetch()}
          />
        ) : (
          <>
            <StatusHero order={order} />
            {order.status !== 'rejected' &&
            order.status !== 'cancelled' &&
            order.status !== 'pending_accept' ? (
              <div className="rounded-2xl bg-surface-container-lowest px-4 pt-4 pb-1 shadow-card">
                <StatusSteps order={order} />
              </div>
            ) : null}
            {!TERMINAL_ORDER_STATUSES.includes(order.status) ? (
              <p
                className="flex items-center justify-center gap-2 text-center text-label-medium text-on-surface-variant"
                role="status"
              >
                <span aria-hidden className="relative flex size-2">
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary opacity-60 motion-reduce:hidden" />
                  <span className="relative size-2 rounded-full bg-primary" />
                </span>
                {t('web.statusLive')}
              </p>
            ) : null}
            <ProofSection order={order} />

            {isTable && bill.data ? (
              <TableBill bill={bill.data} />
            ) : (
              <Card className="flex flex-col gap-2 rounded-2xl border-0 shadow-card">
                {order.items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2 text-body-medium">
                    <span className="min-w-0">
                      <b className="mr-1.5 font-semibold text-primary tabular-nums">{it.qty}×</b>
                      {tl(it.name, lang)}
                      {it.options.length ? (
                        <span className="block text-label-medium text-on-surface-variant">
                          {it.options.map((op) => tl(op.optionName, lang)).join(', ')}
                        </span>
                      ) : null}
                      {it.note ? (
                        <span className="block text-label-medium italic text-on-surface-variant">
                          “{it.note}”
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums">{money(it.lineTotal, order.currency)}</span>
                  </div>
                ))}
                {order.deliveryFee ? (
                  <div className="flex justify-between text-body-medium text-on-surface-variant">
                    <span>{t('common.deliveryFee')}</span>
                    <span className="tabular-nums">{money(order.deliveryFee, order.currency)}</span>
                  </div>
                ) : null}
                {order.discount ? (
                  <div className="flex justify-between text-body-medium text-on-surface-variant">
                    <span>{t('common.discount')}</span>
                    <span className="tabular-nums">−{money(order.discount, order.currency)}</span>
                  </div>
                ) : null}
                <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-outline-variant pt-2.5">
                  <span className="font-medium">{t('common.total')}</span>
                  <b className="text-headline-small font-bold tabular-nums">
                    {money(order.total, order.currency)}
                  </b>
                </div>
                {order.paymentMethod ? (
                  <p className="text-label-medium text-on-surface-variant">
                    {t(`paymentMethod.${order.paymentMethod}`)} · {t(`paymentStatus.${order.paymentStatus}`)}
                  </p>
                ) : null}
                {order.address ? (
                  <p className="text-label-medium text-on-surface-variant">
                    <b className="text-on-surface">{t('web.deliverTo')}:</b> {order.address.text}
                    {order.address.landmark ? ` · ${order.address.landmark}` : ''}
                  </p>
                ) : null}
              </Card>
            )}

            <Button variant="tonal" icon="restaurant_menu" block onClick={() => navigate(customer.homePath)}>
              {t('order.orderAgain')}
            </Button>
          </>
        )}
      </main>
    </Page>
  );
}
