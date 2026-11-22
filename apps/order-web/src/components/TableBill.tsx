/** Tagihan meja: ronde-ronde pesanan + total + Minta bill. */
import { useTranslation } from 'react-i18next';
import { tl, type PublicTableBillResponse } from '@pos/shared';
import { errorMessage } from '../lib/api';
import { money } from '../lib/menu';
import { useRequestBill } from '../lib/table';
import { Badge, Button, Card, useToast } from './ui';

export function TableBill({ bill }: { bill: PublicTableBillResponse }) {
  const { t, i18n } = useTranslation();
  const toast = useToast();
  const req = useRequestBill();
  const lang = i18n.language;
  const c = bill.currency;
  const requested = bill.session?.status === 'bill_requested';
  const orders = [...bill.orders].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  return (
    <section className="flex flex-col gap-2.5" aria-labelledby="bill-title" data-testid="table-bill">
      <h2 id="bill-title" className="font-display text-title-large">
        {t('web.tableBillTitle', { table: bill.table.name })}
      </h2>
      {orders.map((o, i) => (
        <Card
          key={o.id}
          padded={false}
          className="flex flex-col gap-1.5 rounded-2xl border-0 p-4 shadow-card"
        >
          <div className="flex items-center justify-between gap-2">
            <b className="flex items-center gap-2 text-title-medium font-semibold">
              <span
                aria-hidden
                className="flex size-7 items-center justify-center rounded-full bg-primary-container text-label-medium text-on-primary-container"
              >
                {i + 1}
              </span>
              {t('web.round', { n: i + 1 })} · {o.displayNo}
            </b>
            <Badge
              tone={
                o.status === 'rejected' || o.status === 'cancelled'
                  ? 'danger'
                  : o.status === 'pending_accept'
                    ? 'warn'
                    : 'primary'
              }
            >
              {t(`status.${o.status}`)}
            </Badge>
          </div>
          {o.items.map((it) => (
            <div key={it.id} className="flex justify-between gap-2 text-body-medium">
              <span className="min-w-0">
                {it.qty} × {tl(it.name, lang)}
                {it.options.length ? (
                  <span className="block text-label-medium text-on-surface-variant">
                    {it.options.map((op) => tl(op.optionName, lang)).join(', ')}
                  </span>
                ) : null}
              </span>
              <span className="shrink-0 tabular-nums">{money(it.lineTotal, c)}</span>
            </div>
          ))}
        </Card>
      ))}
      <Card className="flex flex-col gap-1 rounded-2xl border-0 bg-primary-container/45 text-on-primary-container">
        <div className="flex items-baseline justify-between">
          <span className="font-medium">{t('common.total')}</span>
          <b className="text-headline-small font-bold tabular-nums">{money(bill.total, c)}</b>
        </div>
        {bill.paid > 0 ? (
          <>
            <div className="flex justify-between text-body-medium">
              <span>{t('web.paidLabel')}</span>
              <span className="tabular-nums">{money(bill.paid, c)}</span>
            </div>
            <div className="flex justify-between text-body-medium font-medium">
              <span>{t('web.remaining')}</span>
              <span className="tabular-nums">{money(bill.remaining, c)}</span>
            </div>
          </>
        ) : null}
        <p className="text-label-medium">{t('web.payAtCashier')}</p>
      </Card>
      <Button
        variant="tonal"
        block
        disabled={requested || orders.length === 0}
        loading={req.isPending}
        onClick={() =>
          req.mutate(undefined, {
            onSuccess: () => toast.success(t('order.billRequested')),
            onError: (e) => toast.error(errorMessage(e, t)),
          })
        }
      >
        {requested ? t('order.billRequested') : t('order.requestBill')}
      </Button>
    </section>
  );
}
