/** Bayar — acuan: docs/mockups/Bayar.dc.html. Order (`/kasir/bayar/:orderId`) atau sesi meja (`?tableId=&amount=`). */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  convertMoney,
  formatMoney,
  type CreatePaymentResponse,
  type Currency,
  type PaymentLineInput,
} from '@pos/shared';
import { Button, Icon, cn, useToast } from '../../components/ui';
import {
  CURRENCY_SHORT,
  ChoiceButton,
  ErrorBlock,
  LoadingBlock,
  MoneyInput,
  ReceiptPreview,
  Screen,
  ScreenFooter,
  TopBar,
  usePrint,
} from '../../components/common';
import { api, errorMessage, qk } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { useMoney, usePublicSettings, type MoneyCtx } from '../../lib/data';
import {
  computeChange,
  exactAmount,
  quickCashOptions,
  splitRemaining,
  type SplitLine,
} from '../../lib/payment';
import { getPrefs } from '../../lib/prefs';
import { isPrinterConnected, type ReceiptData } from '../../lib/printer';
import { printReceipt } from '../../lib/print';
import { receiptFromBill, receiptFromOrder } from '../../lib/receiptData';

type Method = 'cash' | 'aba' | 'split' | 'platform';

/** Panel tunai: mata uang, uang pas, uang cepat, ketik jumlah, kembalian besar. */
export function CashPanel({
  dueMain,
  money,
  currency,
  onCurrency,
  received,
  onReceived,
}: {
  dueMain: number;
  money: MoneyCtx;
  currency: Currency;
  onCurrency: (c: Currency) => void;
  received: number | null;
  onReceived: (v: number | null) => void;
}) {
  const { t } = useTranslation();
  const [custom, setCustom] = useState(false);
  const exact = exactAmount(dueMain, money.main, currency, money.rates);
  const quick = quickCashOptions(exact, currency, 3);
  const res = computeChange(dueMain, received, currency, money.main, money.rates);
  const changeOther = money.others.find((c) => c !== currency && c === 'USD') ?? money.others[0];
  return (
    <>
      <section className="flex flex-col gap-2">
        <b className="text-title-medium">2. {t('bayar.received')}</b>
        <div
          role="radiogroup"
          aria-label={t('payment.currency')}
          className="grid overflow-hidden rounded-full border border-outline"
          style={{ gridTemplateColumns: `repeat(${money.enabled.length}, minmax(0,1fr))` }}
        >
          {money.enabled.map((c, i) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={currency === c}
              onClick={() => {
                onCurrency(c);
                onReceived(null);
                setCustom(false);
              }}
              className={cn(
                'state-layer flex h-12 items-center justify-center gap-1 text-label-large',
                i > 0 && 'border-l border-outline',
                currency === c ? 'bg-secondary-container text-on-secondary-container' : 'text-on-surface',
              )}
            >
              {currency === c ? <Icon name="check" size={18} /> : null}
              {CURRENCY_SHORT[c]}
            </button>
          ))}
        </div>
        {currency !== money.main ? (
          <span className="text-label-medium text-on-surface-variant">
            {t('bayar.totalIn', { amount: formatMoney(exact, currency) })}
          </span>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <ChoiceButton
            selected={!custom && received === exact}
            onClick={() => {
              setCustom(false);
              onReceived(exact);
            }}
            className="h-16 text-title-large"
          >
            {t('payment.exact')}
          </ChoiceButton>
          {quick.map((v) => (
            <ChoiceButton
              key={v}
              selected={!custom && received === v}
              onClick={() => {
                setCustom(false);
                onReceived(v);
              }}
              className="h-16 text-title-large tabular-nums"
            >
              {formatMoney(v, currency)}
            </ChoiceButton>
          ))}
        </div>
        {custom ? (
          <MoneyInput
            big
            autoFocus
            label={t('bayar.typeAmount')}
            currency={currency}
            value={received}
            onChange={onReceived}
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setCustom(true);
              onReceived(null);
            }}
            className="state-layer flex h-14 items-center justify-center gap-2 rounded-full border border-outline text-label-large text-primary"
          >
            <Icon name="edit" />
            {t('bayar.typeOther')}
          </button>
        )}
      </section>
      {received ? (
        res.enough ? (
          <div
            className="flex flex-col gap-0.5 rounded-lg bg-primary-container px-5 py-4 text-on-primary-container"
            role="status"
            data-testid="change-box"
          >
            <span className="text-body-medium">
              {t('bayar.receivedAmount', { amount: formatMoney(received, currency) })}
            </span>
            <span className="text-title-medium">{t('payment.change')}</span>
            <b className="text-[48px] font-medium leading-[1.1] tabular-nums" data-testid="change-amount">
              {formatMoney(res.changeMain, money.main)}
            </b>
            {res.changeMain > 0 && changeOther ? (
              <span className="text-body-medium">
                {t('bayar.orAbout', {
                  amount: formatMoney(
                    convertMoney(res.changeMain, money.main, changeOther, money.rates),
                    changeOther,
                  ),
                })}
              </span>
            ) : null}
          </div>
        ) : (
          <div
            className="flex items-center gap-3 rounded-lg bg-error-container px-5 py-4 text-on-error-container"
            role="alert"
          >
            <Icon name="error" size={32} />
            <b className="text-headline-small">
              {t('payment.insufficient', { amount: formatMoney(res.shortMain, money.main) })}
            </b>
          </div>
        )
      ) : null}
    </>
  );
}

export default function PaymentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { orderId } = useParams();
  const [sp] = useSearchParams();
  const tableId = sp.get('tableId') ? Number(sp.get('tableId')) : null;
  const shareParam = sp.get('amount') ? Number(sp.get('amount')) : null;
  const shareLabel = sp.get('label');
  const money = useMoney();
  const settings = usePublicSettings();
  const { data: me } = useMe();
  const print = usePrint();

  const orderQ = useQuery({
    queryKey: qk.order(orderId ?? ''),
    queryFn: () => api.call('orderGet', { params: { id: orderId! } }),
    enabled: !!orderId,
  });
  const billQ = useQuery({
    queryKey: qk.tableBill(tableId ?? 0),
    queryFn: () => api.call('tableSession', { params: { id: tableId! } }),
    enabled: !!tableId && !orderId,
  });
  const order = orderQ.data?.order;
  const bill = billQ.data;

  const fullDue = order ? order.total - order.paidMain : bill ? bill.remaining : 0;
  const dueMain = shareParam && shareParam > 0 ? Math.min(shareParam, fullDue) : fullDue;
  const partial = dueMain < fullDue;
  const platform = order?.channel === 'grab' || order?.channel === 'foodpanda';

  const [method, setMethod] = useState<Method>('cash');
  const initMethod = useRef(false);
  useEffect(() => {
    if (order && !initMethod.current) {
      initMethod.current = true;
      if (platform) setMethod('platform');
    }
  }, [order, platform]);
  const [currency, setCurrency] = useState<Currency>(money.main);
  const [received, setReceived] = useState<number | null>(null);
  const [split, setSplit] = useState<SplitLine[]>([
    { id: 1, method: 'cash', currency: money.main, amount: null },
    { id: 2, method: 'aba', currency: money.main, amount: null },
  ]);
  const [done, setDone] = useState<{ res: CreatePaymentResponse; receipt: ReceiptData } | null>(null);

  const cash = computeChange(dueMain, received, currency, money.main, money.rates);
  const splitCalc = splitRemaining(dueMain, split, money.main, money.rates);
  const ready =
    dueMain > 0 &&
    (method === 'cash'
      ? cash.enough
      : method === 'split'
        ? splitCalc.remainingMain === 0 && split.some((l) => l.amount)
        : true);

  const lines = useMemo((): PaymentLineInput[] => {
    if (method === 'cash') return received ? [{ method: 'cash', currency, amount: received }] : [];
    if (method === 'aba') return [{ method: 'aba', currency: money.main, amount: dueMain }];
    if (method === 'platform') return [{ method: 'platform', currency: money.main, amount: dueMain }];
    return split
      .filter((l) => l.amount && l.amount > 0)
      .map((l) => ({ method: l.method, currency: l.currency, amount: l.amount! }));
  }, [method, received, currency, money.main, dueMain, split]);

  const pay = useMutation({
    mutationFn: () =>
      api.call('paymentCreate', {
        body: { ...(order ? { orderId: order.id } : { tableSessionId: bill!.session!.id }), lines, partial },
      }),
    onSuccess: async (res) => {
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: qk.tables });
      if (tableId) void qc.invalidateQueries({ queryKey: qk.tableBill(tableId) });
      if (res.order) qc.setQueryData(qk.order(res.order.id), { order: res.order });
      const ctx = { shop: settings.data, money, lang: getPrefs().receiptLang, cashier: me?.name };
      const receipt = res.order
        ? receiptFromOrder(res.order, ctx, { change: res.changeMain })
        : bill
          ? receiptFromBill(
              { ...bill, paid: bill.paid + res.paidMain - res.changeMain, remaining: res.remainingMain },
              ctx,
              res.remainingMain > 0 ? 'provisional' : 'receipt',
              {
                payments: res.payments.map((p) => ({
                  label: `${t(`paymentMethod.${p.method}`)} ${p.currency}`,
                  amount: p.amount,
                  currency: p.currency,
                })),
                change: res.changeMain,
              },
            )
          : null;
      if (receipt) {
        setDone({ res, receipt });
        if (getPrefs().autoPrint && isPrinterConnected()) {
          try {
            await printReceipt(receipt);
          } catch (e) {
            toast.error(`${t('print.failed')}: ${(e as Error).message}`);
          }
        }
      }
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  // Tanpa order & meja (mis. URL /kasir/bayar dibuka langsung) → kembali ke layar kasir.
  if (!orderId && !tableId) return <Navigate to="/kasir" replace />;
  if (orderQ.isLoading || billQ.isLoading) return <LoadingBlock />;
  const err = orderQ.error ?? billQ.error;
  const title = order
    ? t('bayar.title', { no: order.displayNo })
    : bill
      ? t('bayar.title', { no: bill.table.name })
      : t('payment.title');
  const back = () =>
    tableId
      ? navigate(`/kasir/meja/${tableId}`)
      : order
        ? navigate(`/kasir/pesanan/${order.id}`)
        : navigate('/kasir');

  if (err || (!order && !bill))
    return (
      <Screen>
        <TopBar back={{ label: t('common.back'), onClick: back }} title={title} />
        <div className="p-4">
          <ErrorBlock error={err} />
        </div>
      </Screen>
    );

  if (done) {
    const { res, receipt } = done;
    const finished = res.remainingMain === 0;
    return (
      <Screen testId="payment-done">
        <TopBar title={finished ? t('payment.paid') : t('bayar.partialPaid')} />
        <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-4 py-3">
          <div
            className="flex flex-col gap-0.5 rounded-lg bg-primary-container px-5 py-5 text-on-primary-container"
            role="status"
          >
            <span className="flex items-center gap-2 text-title-medium">
              <Icon name="check_circle" filled />
              {t('payment.change')}
            </span>
            <b className="text-[52px] font-medium leading-[1.1] tabular-nums" data-testid="done-change">
              {formatMoney(res.changeMain, money.main)}
            </b>
            {!finished ? (
              <span className="text-body-medium font-medium text-warning">
                {t('bayar.remainingTable', { amount: formatMoney(res.remainingMain, money.main) })}
              </span>
            ) : null}
          </div>
          <ReceiptPreview data={receipt} />
        </main>
        <ScreenFooter>
          <div className="flex gap-2.5">
            <Button
              variant="outlined"
              icon="print"
              className="h-16 w-36 px-3"
              onClick={() => void print.printReceipt(receipt)}
            >
              {t('payment.printReceipt')}
            </Button>
            {tableId && !finished ? (
              <Button
                size="xl"
                className="grow"
                onClick={() => navigate(`/kasir/meja/${tableId}`, { replace: true })}
              >
                {t('bayar.backToTable')}
              </Button>
            ) : (
              <Button
                size="xl"
                className="grow"
                onClick={() => navigate(tableId ? '/kasir/meja' : '/kasir', { replace: true })}
              >
                {tableId ? t('bayar.backToTables') : t('payment.newOrder')}
              </Button>
            )}
          </div>
        </ScreenFooter>
      </Screen>
    );
  }

  const methods: { value: Method; label: string }[] = [
    { value: 'cash', label: t('payment.cash') },
    { value: 'aba', label: t('payment.aba') },
    { value: 'split', label: t('payment.split') },
    ...(platform ? [{ value: 'platform' as Method, label: t('paymentMethod.platform') }] : []),
  ];

  return (
    <Screen testId="payment-screen">
      <TopBar back={{ label: t('common.back'), onClick: back }} title={title} />
      <main className="flex min-h-0 grow flex-col gap-4 overflow-y-auto px-4 py-3">
        <div className="flex items-baseline justify-between rounded-lg bg-surface-container-highest px-5 py-4">
          <span className="text-title-medium">
            {partial ? (shareLabel ?? t('bayar.share')) : t('common.total')}
          </span>
          <b className="text-display-small font-medium tabular-nums" data-testid="pay-total">
            {formatMoney(dueMain, money.main)}
          </b>
        </div>
        {dueMain <= 0 ? (
          <div className="rounded-md bg-primary-container p-4 text-title-medium text-on-primary-container">
            {t('payment.paid')}
          </div>
        ) : null}
        <section className="flex flex-col gap-2">
          <b className="text-title-medium">1. {t('bayar.how')}</b>
          <div
            role="radiogroup"
            aria-label={t('payment.method')}
            className={cn('grid gap-2', methods.length === 4 ? 'grid-cols-4' : 'grid-cols-3')}
          >
            {methods.map((m) => (
              <ChoiceButton
                key={m.value}
                role="radio"
                aria-checked={method === m.value}
                selected={method === m.value}
                onClick={() => setMethod(m.value)}
                className="h-14 px-1 text-title-medium"
              >
                {m.label}
              </ChoiceButton>
            ))}
          </div>
        </section>
        {method === 'cash' ? (
          <CashPanel
            dueMain={dueMain}
            money={money}
            currency={currency}
            onCurrency={setCurrency}
            received={received}
            onReceived={setReceived}
          />
        ) : null}
        {method === 'aba' ? (
          <div className="rounded-md bg-tertiary-container px-4 py-3.5 text-on-tertiary-container">
            <b className="text-title-medium">
              {t('bayar.abaTitle', { amount: formatMoney(dueMain, money.main) })}
            </b>
            <p className="mt-1 text-body-medium">{t('bayar.abaHint')}</p>
          </div>
        ) : null}
        {method === 'platform' ? (
          <div className="rounded-md bg-surface-container-high px-4 py-3.5">
            <b className="text-title-medium">{t('bayar.platformTitle')}</b>
            <p className="mt-1 text-body-medium text-on-surface-variant">{t('bayar.platformHint')}</p>
          </div>
        ) : null}
        {method === 'split' ? (
          <SplitEditor lines={split} onChange={setSplit} dueMain={dueMain} money={money} />
        ) : null}
      </main>
      <ScreenFooter>
        <Button
          size="xl"
          block
          icon="check_circle"
          disabled={!ready}
          loading={pay.isPending}
          onClick={() => pay.mutate()}
        >
          {t('bayar.finish')}
        </Button>
      </ScreenFooter>
    </Screen>
  );
}

function SplitEditor({
  lines,
  onChange,
  dueMain,
  money,
}: {
  lines: SplitLine[];
  onChange: (l: SplitLine[]) => void;
  dueMain: number;
  money: MoneyCtx;
}) {
  const { t } = useTranslation();
  const calc = splitRemaining(dueMain, lines, money.main, money.rates);
  const update = (id: number, patch: Partial<SplitLine>) =>
    onChange(lines.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  return (
    <section className="flex flex-col gap-2">
      <b className="text-title-medium">2. {t('bayar.splitTitle')}</b>
      {lines.map((l, i) => (
        <div key={l.id} className="flex flex-col gap-3 rounded-md bg-surface-container-low p-4">
          <div className="flex items-center gap-2">
            <b className="grow">{t('bayar.part', { n: i + 1 })}</b>
            {lines.length > 1 ? (
              <button
                type="button"
                className="state-layer min-h-12 rounded-full px-3 text-label-large text-error"
                onClick={() => onChange(lines.filter((x) => x.id !== l.id))}
              >
                {t('common.delete')}
              </button>
            ) : null}
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(['cash', 'aba'] as const).map((m) => (
              <ChoiceButton
                key={m}
                selected={l.method === m}
                onClick={() => update(l.id, { method: m, currency: m === 'aba' ? money.main : l.currency })}
              >
                {t(`payment.${m}`)}
              </ChoiceButton>
            ))}
          </div>
          {l.method === 'cash' && money.enabled.length > 1 ? (
            <div className="flex gap-1.5" role="radiogroup" aria-label={t('payment.currency')}>
              {money.enabled.map((c) => (
                <button
                  key={c}
                  type="button"
                  role="radio"
                  aria-checked={l.currency === c}
                  onClick={() => update(l.id, { currency: c, amount: null })}
                  className={cn(
                    'state-layer min-h-12 grow rounded-sm text-label-large',
                    l.currency === c
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'border border-outline-variant text-on-surface-variant',
                  )}
                >
                  {CURRENCY_SHORT[c]}
                </button>
              ))}
            </div>
          ) : null}
          <div className="flex items-end gap-2">
            <MoneyInput
              className="grow"
              ariaLabel={`${t('bayar.part', { n: i + 1 })} ${t('payment.received')}`}
              currency={l.currency}
              value={l.amount}
              onChange={(v) => update(l.id, { amount: v })}
            />
            <Button
              variant="outlined"
              size="md"
              onClick={() => {
                const others = lines.filter((x) => x.id !== l.id);
                const rem = splitRemaining(dueMain, others, money.main, money.rates).remainingMain;
                update(l.id, { amount: exactAmount(rem, money.main, l.currency, money.rates) });
              }}
            >
              {t('bayar.rest')}
            </Button>
          </div>
        </div>
      ))}
      <button
        type="button"
        onClick={() =>
          onChange([...lines, { id: Date.now(), method: 'cash', currency: money.main, amount: null }])
        }
        className="state-layer flex min-h-12 items-center justify-center gap-2 rounded-full bg-secondary-container text-label-large text-on-secondary-container"
      >
        <Icon name="add" />
        {t('bayar.addPart')}
      </button>
      <div
        className={cn(
          'rounded-md px-4 py-3',
          calc.remainingMain > 0
            ? 'bg-warning-container text-on-warning-container'
            : 'bg-primary-container text-on-primary-container',
        )}
        role="status"
      >
        <div className="flex justify-between text-title-medium font-medium">
          <span>{calc.remainingMain > 0 ? t('payment.remaining') : t('payment.change')}</span>
          <span className="tabular-nums">
            {formatMoney(calc.remainingMain > 0 ? calc.remainingMain : calc.changeMain, money.main)}
          </span>
        </div>
      </div>
    </section>
  );
}
