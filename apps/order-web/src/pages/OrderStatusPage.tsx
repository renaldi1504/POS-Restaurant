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
import { Badge, Button, Card, HeaderBar, useToast } from '../components/ui';
import { api, errorMessage, isApiError, qk, uploadProof } from '../lib/api';
import { useCustomer } from '../lib/customer';
import { money, typeLabelKey, useSettings } from '../lib/menu';
import { useSocketStatus } from '../lib/socket';
import { useTableBill } from '../lib/table';

function StatusHero({ order }: { order: PublicOrderDto }) {
  const { t } = useTranslation();
  if (order.status === 'rejected') {
    return (
      <Card tone="danger" role="alert" data-testid="status-rejected">
        <b className="text-lg text-danger">{t('order.rejected')}</b>
        {order.rejectReason ? (
          <p className="mt-1 text-base">{t('web.rejectedReason', { reason: order.rejectReason })}</p>
        ) : null}
      </Card>
    );
  }
  if (order.status === 'cancelled') {
    return (
      <Card tone="danger" role="alert">
        <b className="text-lg text-danger">{t('web.cancelled')}</b>
      </Card>
    );
  }
  if (order.status === 'pending_accept') {
    return (
      <Card tone="warn" role="status" data-testid="status-pending">
        <b className="text-lg text-warn-dark">{t('status.pending_accept')}</b>
        <p className="mt-1 text-base text-warn-dark">{t('order.waitingAccept')}</p>
      </Card>
    );
  }
  if (order.status === 'done' || order.status === 'delivered') {
    return (
      <Card tone="primary" role="status">
        <b className="text-lg text-primary-dark">{t('order.thanks')}</b>
        <p className="mt-1 text-base text-primary-dark">{t('web.doneTitle')}</p>
      </Card>
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
      <Card className="flex items-center justify-between">
        <span className="font-bold">ABA</span>
        <Badge tone="primary">{t('web.paid')}</Badge>
      </Card>
    );
  }
  if (order.proofUploaded) {
    return (
      <Card tone="primary" data-testid="proof-done">
        <b className="text-primary-dark">{t('order.proofUploaded')}</b>
        <p className="text-sm text-primary-dark">{t('order.waitingVerification')}</p>
      </Card>
    );
  }
  if (TERMINAL_ORDER_STATUSES.includes(order.status)) return null;
  return (
    <Card tone="warn" className="flex flex-col gap-2.5" data-testid="proof-needed">
      <b className="text-warn-dark">{t('web.proofNeeded')}</b>
      <div className="flex items-baseline justify-between">
        <span className="text-sm">{t('web.abaAmount')}</span>
        <b className="text-xl tabular-nums">{money(order.total, order.currency)}</b>
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
              <Card>
                <StatusSteps order={order} />
              </Card>
            ) : null}
            {!TERMINAL_ORDER_STATUSES.includes(order.status) ? (
              <p className="text-center text-[13px] text-muted" role="status">
                {t('web.statusLive')}
              </p>
            ) : null}
            <ProofSection order={order} />

            {isTable && bill.data ? (
              <TableBill bill={bill.data} />
            ) : (
              <Card className="flex flex-col gap-1.5">
                {order.items.map((it) => (
                  <div key={it.id} className="flex justify-between gap-2 text-[15px]">
                    <span className="min-w-0">
                      {it.qty} × {tl(it.name, lang)}
                      {it.options.length ? (
                        <span className="block text-[13px] text-muted">
                          {it.options.map((op) => tl(op.optionName, lang)).join(', ')}
                        </span>
                      ) : null}
                      {it.note ? (
                        <span className="block text-[13px] italic text-muted">“{it.note}”</span>
                      ) : null}
                    </span>
                    <span className="shrink-0 tabular-nums">{money(it.lineTotal, order.currency)}</span>
                  </div>
                ))}
                {order.deliveryFee ? (
                  <div className="flex justify-between text-[15px] text-muted">
                    <span>{t('common.deliveryFee')}</span>
                    <span className="tabular-nums">{money(order.deliveryFee, order.currency)}</span>
                  </div>
                ) : null}
                {order.discount ? (
                  <div className="flex justify-between text-[15px] text-muted">
                    <span>{t('common.discount')}</span>
                    <span className="tabular-nums">−{money(order.discount, order.currency)}</span>
                  </div>
                ) : null}
                <div className="flex items-baseline justify-between border-t border-line pt-1.5">
                  <span className="font-bold">{t('common.total')}</span>
                  <b className="text-2xl tabular-nums">{money(order.total, order.currency)}</b>
                </div>
                {order.paymentMethod ? (
                  <p className="text-sm text-muted">
                    {t(`paymentMethod.${order.paymentMethod}`)} · {t(`paymentStatus.${order.paymentStatus}`)}
                  </p>
                ) : null}
                {order.address ? (
                  <p className="text-sm text-muted">
                    <b className="text-ink">{t('web.deliverTo')}:</b> {order.address.text}
                    {order.address.landmark ? ` · ${order.address.landmark}` : ''}
                  </p>
                ) : null}
              </Card>
            )}

            <Button variant="outline" block onClick={() => navigate(customer.homePath)}>
              {t('order.orderAgain')}
            </Button>
          </>
        )}
      </main>
    </Page>
  );
}
