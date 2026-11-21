/** Tagihan meja — acuan: docs/mockups/MejaDetail.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { formatMoney, tl, type OrderDto, type TableBillDto } from '@pos/shared';
import { Badge, Button, EmptyState, Icon, Sheet, cn, useToast } from '../../components/ui';
import {
  ChoiceButton,
  ErrorBlock,
  LoadingBlock,
  OrderItemsList,
  ReasonSheet,
  RoundStepper,
  Screen,
  ScreenFooter,
  SourceBadge,
  StatusBadge,
  Tabs,
  TopBar,
  minutesSince,
  timeHM,
} from '../../components/common';
import { api, errorMessage, qk } from '../../lib/api';
import { setCart } from '../../lib/cart';
import { useMoney } from '../../lib/data';
import { evenShares } from '../../lib/payment';
import { TABLE_STYLE } from './TablesPage';

const TABLE_ACTION_ICON = { move: 'swap_horiz', merge: 'call_merge', split: 'call_split' } as const;

export default function TableBillPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const money = useMoney();
  const tableId = Number(useParams().tableId);
  const q = useQuery({
    queryKey: qk.tableBill(tableId),
    queryFn: () => api.call('tableSession', { params: { id: tableId } }),
  });
  const tables = useQuery({ queryKey: qk.tables, queryFn: () => api.call('tablesList') });
  const [sheet, setSheet] = useState<'move' | 'merge' | 'split' | null>(null);
  const [rejecting, setRejecting] = useState<OrderDto | null>(null);
  const bill = q.data;
  const status =
    tables.data?.tables.find((x) => x.id === tableId)?.status ?? (bill?.session ? 'eating' : 'empty');

  const refresh = () => {
    void qc.invalidateQueries({ queryKey: qk.tableBill(tableId) });
    void qc.invalidateQueries({ queryKey: qk.tables });
    void qc.invalidateQueries({ queryKey: ['orders'] });
  };
  const accept = useMutation({
    mutationFn: (id: string) => api.call('orderAccept', { params: { id }, body: {} }),
    onSuccess: refresh,
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const reject = useMutation({
    mutationFn: (v: { id: string; reason: string }) =>
      api.call('orderReject', { params: { id: v.id }, body: { reason: v.reason } }),
    onSuccess: () => {
      setRejecting(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const move = useMutation({
    mutationFn: (to: number) => api.call('tableMove', { params: { id: tableId }, body: { toTableId: to } }),
    onSuccess: (_r, to) => {
      refresh();
      setSheet(null);
      toast.success(t('meja.moved'));
      navigate(`/kasir/meja/${to}`, { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const merge = useMutation({
    mutationFn: (from: number) =>
      api.call('tablesMerge', { body: { fromTableId: from, toTableId: tableId } }),
    onSuccess: () => {
      refresh();
      setSheet(null);
      toast.success(t('meja.merged'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  if (q.isLoading) return <LoadingBlock />;
  if (q.isError || !bill)
    return (
      <Screen>
        <TopBar
          back={{ label: t('tables.title'), onClick: () => navigate('/kasir/meja') }}
          title={t('tables.bill')}
        />
        <div className="p-4">
          <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
        </div>
      </Screen>
    );

  const live = bill.orders.filter((o) => o.status !== 'cancelled' && o.status !== 'rejected');
  const itemCount = live.reduce((a, o) => a + o.items.reduce((b, i) => b + i.qty, 0), 0);
  const mins = bill.session ? minutesSince(bill.session.openedAt) : 0;
  const st = TABLE_STYLE[status];
  const addOrder = () => {
    setCart({ kind: 'dine_in', tableId, editingOrderId: null, editingDisplayNo: null });
    navigate('/kasir');
  };
  const others = tables.data?.tables.filter((x) => x.id !== tableId && x.active) ?? [];

  return (
    <Screen testId="table-bill-screen">
      <TopBar
        back={{ label: t('tables.title'), onClick: () => navigate('/kasir/meja') }}
        title={bill.table.name}
        subtitle={`${bill.session ? `${t('tables.seated', { count: mins })} · ` : ''}${t('meja.seats', { count: bill.table.seats })}`}
        right={
          <span
            className={cn(
              'flex min-h-8 items-center gap-1 rounded-sm px-2.5 text-label-medium',
              st.card.replace(/border\S*/g, ''),
            )}
          >
            <Icon name={st.icon} size={16} />
            {t(st.key)}
          </span>
        }
      />
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-4 py-3">
        {!bill.orders.length ? (
          <EmptyState icon="table_restaurant" title={t('tables.empty')} description={t('meja.emptyHint')} />
        ) : null}
        {bill.orders.map((o) => (
          <section
            key={o.id}
            className={cn(
              'flex shrink-0 flex-col rounded-md border border-outline-variant bg-surface-container-lowest px-4 py-3',
              (o.status === 'cancelled' || o.status === 'rejected') && 'opacity-50',
            )}
          >
            <div className="flex items-center justify-between gap-2 border-b border-surface-container-highest pb-2">
              <button
                type="button"
                className="state-layer -ml-2 flex min-h-12 flex-wrap items-center gap-1.5 rounded-sm px-2 text-left"
                onClick={() => navigate(`/kasir/pesanan/${o.id}`)}
              >
                <b className="text-title-medium">
                  {t('cashier.orderNo', { no: o.displayNo })} · {timeHM(o.createdAt)}
                </b>
                <SourceBadge channel={o.channel} />
              </button>
              <StatusBadge status={o.status} />
            </div>
            <OrderItemsList order={o} lang={lang} />
            {o.status === 'pending_accept' ? (
              <div className="flex gap-2 pt-1">
                <Button
                  variant="outlined"
                  size="md"
                  className="border-error text-error"
                  onClick={() => setRejecting(o)}
                >
                  {t('cashier.reject')}
                </Button>
                <Button
                  className="grow"
                  size="md"
                  loading={accept.isPending && accept.variables === o.id}
                  onClick={() => accept.mutate(o.id)}
                >
                  {t('cashier.accept')}
                </Button>
              </div>
            ) : null}
          </section>
        ))}
        <button
          type="button"
          onClick={addOrder}
          className="state-layer flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-full bg-secondary-container px-4 text-label-large text-on-secondary-container"
        >
          <Icon name="add" />
          {t('meja.addOrderTo', { name: bill.table.name })}
        </button>
        {bill.session ? (
          <div className="grid shrink-0 grid-cols-3 gap-2">
            {(['move', 'merge', 'split'] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setSheet(k)}
                className="state-layer flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-md border border-outline px-1 py-1 text-label-medium text-primary"
              >
                <Icon name={TABLE_ACTION_ICON[k]} size={20} />
                {t(k === 'move' ? 'tables.move' : k === 'merge' ? 'tables.merge' : 'tables.splitBill')}
              </button>
            ))}
          </div>
        ) : null}
      </main>
      {bill.session ? (
        <ScreenFooter>
          <div className="flex justify-between text-label-medium text-on-surface-variant">
            <span>{t('meja.subtotalRounds', { rounds: live.length, items: itemCount })}</span>
            <span className="tabular-nums">{formatMoney(bill.subtotal, bill.currency)}</span>
          </div>
          {bill.discount ? (
            <div className="flex justify-between text-label-medium text-on-surface-variant">
              <span>{t('common.discount')}</span>
              <span className="tabular-nums">-{formatMoney(bill.discount, bill.currency)}</span>
            </div>
          ) : null}
          {bill.paid > 0 ? (
            <div className="flex justify-between text-label-medium text-primary">
              <span>{t('payment.paid')}</span>
              <span className="tabular-nums">{formatMoney(bill.paid, bill.currency)}</span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between">
            <span className="text-body-large font-medium">
              {bill.paid > 0 ? t('payment.remaining') : t('meja.totalBill')}
            </span>
            <b className="text-headline-medium font-medium tabular-nums" data-testid="bill-total">
              {formatMoney(bill.paid > 0 ? bill.remaining : bill.total, bill.currency)}
            </b>
          </div>
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => navigate(`/kasir/meja/${tableId}/nota`)}
              className="state-layer flex h-14 shrink-0 items-center justify-center gap-1.5 rounded-full border border-outline px-4 text-label-large text-primary"
            >
              <Icon name="print" size={20} />
              {t('meja.printNote')}
            </button>
            <Button
              size="lg"
              icon="payments"
              className="grow"
              disabled={bill.remaining <= 0}
              onClick={() => navigate(`/kasir/bayar?tableId=${tableId}`)}
            >
              {t('tables.pay')}
            </Button>
          </div>
        </ScreenFooter>
      ) : null}

      <Sheet
        open={sheet === 'move'}
        onClose={() => setSheet(null)}
        title={t('tables.move')}
        closeLabel={t('common.close')}
      >
        <p className="mb-2 text-label-medium text-on-surface-variant">{t('meja.moveHint')}</p>
        <div className="grid grid-cols-3 gap-2">
          {others
            .filter((x) => x.status === 'empty')
            .map((x) => (
              <ChoiceButton key={x.id} disabled={move.isPending} onClick={() => move.mutate(x.id)}>
                {x.name}
              </ChoiceButton>
            ))}
        </div>
      </Sheet>
      <Sheet
        open={sheet === 'merge'}
        onClose={() => setSheet(null)}
        title={t('tables.merge')}
        closeLabel={t('common.close')}
      >
        <p className="mb-2 text-label-medium text-on-surface-variant">
          {t('meja.mergeHint', { name: bill.table.name })}
        </p>
        <div className="grid grid-cols-2 gap-2">
          {others
            .filter((x) => x.status !== 'empty')
            .map((x) => (
              <ChoiceButton
                key={x.id}
                disabled={merge.isPending}
                onClick={() => merge.mutate(x.id)}
                className="flex flex-col py-2"
              >
                <span>{x.name}</span>
                <span className="text-label-medium text-on-surface-variant tabular-nums">
                  {formatMoney(x.runningTotal, money.main)}
                </span>
              </ChoiceButton>
            ))}
        </div>
        {!others.some((x) => x.status !== 'empty') ? <EmptyState title={t('meja.noOtherTables')} /> : null}
      </Sheet>
      <SplitBillSheet open={sheet === 'split'} onClose={() => setSheet(null)} bill={bill} tableId={tableId} />
      <ReasonSheet
        open={!!rejecting}
        title={`${t('cashier.reject')} ${rejecting?.displayNo ?? ''}`}
        label={t('cashier.rejectReason')}
        confirmLabel={t('cashier.reject')}
        quick={[t('online.reasonSoldOut'), t('online.reasonDuplicate')]}
        loading={reject.isPending}
        onClose={() => setRejecting(null)}
        onConfirm={(reason) => rejecting && reject.mutate({ id: rejecting.id, reason })}
      />
    </Screen>
  );
}

/** Split bill: bagi rata (n orang) atau per item → bayar sebagian (partial). */
export function SplitBillSheet({
  open,
  onClose,
  bill,
  tableId,
}: {
  open: boolean;
  onClose: () => void;
  bill: TableBillDto;
  tableId: number;
}) {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [mode, setMode] = useState<'even' | 'items'>('even');
  const [people, setPeople] = useState(2);
  const [picked, setPicked] = useState<Record<number, number>>({});
  const shares = useMemo(
    () => evenShares(bill.total, people, bill.currency),
    [bill.total, people, bill.currency],
  );
  let acc = 0;
  let paidCount = 0;
  for (const s of shares) {
    acc += s;
    if (acc <= bill.paid) paidCount++;
  }
  const lines = bill.orders
    .filter((o) => o.status !== 'cancelled' && o.status !== 'rejected')
    .flatMap((o) => o.items);
  const itemsAmount = lines.reduce(
    (a, it) => a + Math.round((it.lineTotal / it.qty) * (picked[it.id] ?? 0)),
    0,
  );
  const pay = (amount: number, label: string) => {
    onClose();
    navigate(
      `/kasir/bayar?tableId=${tableId}&amount=${Math.min(amount, bill.remaining)}&label=${encodeURIComponent(label)}`,
    );
  };
  return (
    <Sheet open={open} onClose={onClose} title={t('tables.splitBill')} closeLabel={t('common.close')}>
      <div className="flex flex-col gap-3">
        <Tabs
          label={t('tables.splitBill')}
          value={mode}
          onChange={setMode}
          tabs={[
            { value: 'even', label: t('tables.splitEven') },
            { value: 'items', label: t('tables.splitItems') },
          ]}
        />
        {mode === 'even' ? (
          <>
            <div className="flex items-center justify-between">
              <b>{t('meja.people')}</b>
              <RoundStepper
                label={t('meja.people')}
                value={people}
                min={2}
                onChange={(v) => setPeople(Math.max(2, Math.min(20, v)))}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              {shares.map((s, i) => (
                <div
                  key={i}
                  className="flex min-h-12 items-center justify-between rounded-md bg-surface-container-lowest px-4 py-2"
                >
                  <span>{t('meja.person', { n: i + 1 })}</span>
                  <span className="flex items-center gap-2">
                    <b className="tabular-nums">{formatMoney(s, bill.currency)}</b>
                    {i < paidCount ? <Badge tone="primary">{t('payment.paid')}</Badge> : null}
                  </span>
                </div>
              ))}
            </div>
            {paidCount < shares.length ? (
              <Button
                block
                onClick={() =>
                  pay(shares[paidCount]!, t('meja.shareLabel', { n: paidCount + 1, total: people }))
                }
              >
                {t('meja.payShare', {
                  n: paidCount + 1,
                  amount: formatMoney(Math.min(shares[paidCount]!, bill.remaining), bill.currency),
                })}
              </Button>
            ) : null}
          </>
        ) : (
          <>
            <p className="text-label-medium text-on-surface-variant">{t('meja.pickItems')}</p>
            {lines.map((it) => (
              <div
                key={it.id}
                className="flex items-center gap-2 border-b border-surface-container-highest py-1.5"
              >
                <span className="flex grow flex-col">
                  <span className="font-medium">
                    {it.qty} × {tl(it.name, i18n.language)}
                  </span>
                  <span className="text-label-medium text-on-surface-variant tabular-nums">
                    {formatMoney(it.lineTotal, bill.currency)}
                  </span>
                </span>
                <RoundStepper
                  label={tl(it.name, i18n.language)}
                  value={picked[it.id] ?? 0}
                  onChange={(v) => setPicked((p) => ({ ...p, [it.id]: Math.max(0, Math.min(it.qty, v)) }))}
                />
              </div>
            ))}
            <Button block disabled={itemsAmount <= 0} onClick={() => pay(itemsAmount, t('meja.itemsLabel'))}>
              {t('meja.payItems', {
                amount: formatMoney(Math.min(itemsAmount, bill.remaining), bill.currency),
              })}
            </Button>
          </>
        )}
      </div>
    </Sheet>
  );
}
