/** Closing shift 3 langkah — acuan: docs/mockups/Closing.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { CURRENCIES, formatMoney, type ClosingPreview, type ClosingResult, type Currency } from '@pos/shared';
import { Button, Card, EmptyState, Icon, IconButton, cn, useToast } from '../../components/ui';
import {
  CurrencyTabs,
  DenominationList,
  ErrorBlock,
  LoadingBlock,
  ManualTotal,
  MoneyInput,
  Screen,
  ScreenFooter,
  Tabs,
  TextField,
  totalsByCurrency,
  usePrint,
  type CountMode,
  type Counts,
} from '../../components/common';
import { api, deviceErrorText, errorMessage, qk } from '../../lib/api';
import { useAuthActions } from '../../lib/auth';
import {
  closingCalc,
  defaultKeep,
  diffKind,
  pocketResults,
  visiblePockets,
  type PocketResult,
} from '../../lib/closing';
import { useMoney, usePublicSettings, type MoneyCtx } from '../../lib/data';
import { buildClosingReport } from '../../lib/printer';
import { paperCols, printDoc } from '../../lib/print';
import { getPrefs } from '../../lib/prefs';

type Step = 1 | 2 | 3;

export function DiffLabel({ diff, currency }: { diff: number; currency: Currency }) {
  const { t } = useTranslation();
  const k = diffKind(diff);
  return (
    <b
      className={cn('text-title-large', k === 'match' ? 'text-primary' : 'text-error')}
      data-testid="diff-label"
    >
      {k === 'match'
        ? t('tutup.match')
        : k === 'short'
          ? t('tutup.short', { amount: formatMoney(-diff, currency) })
          : t('tutup.over', { amount: formatMoney(diff, currency) })}
    </b>
  );
}

/** Nama kantong: "Cash Riel", "ABA $". */
export function pocketLabel(t: (k: string) => string, method: 'cash' | 'aba', currency: Currency) {
  return `${method === 'cash' ? t('common.cash') : 'ABA'} ${t(`tutup.cur.${currency}`)}`;
}

/** Satu kantong: seharusnya, dihitung, selisih + rincian hitungan. */
function PocketCard({ r }: { r: PocketResult }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const c = r.currency;
  const plain = (v: number) => formatMoney(v, c, { noSymbol: true });
  return (
    <section
      className={cn(
        'flex flex-col gap-1.5 rounded-md border-2 bg-surface-container-lowest px-3.5 py-3',
        r.diff ? 'border-error' : 'border-primary',
      )}
      data-testid={`pocket-${r.method}-${c}`}
    >
      <div className="flex items-baseline justify-between gap-2">
        <b className="text-title-large">{pocketLabel(t, r.method, c)}</b>
        <DiffLabel diff={r.diff} currency={c} />
      </div>
      <div className="flex justify-between text-body-medium">
        <span className="text-on-surface-variant">{t('tutup.expected')}</span>
        <b className="tabular-nums">{formatMoney(r.expected, c)}</b>
      </div>
      <div className="flex justify-between text-body-medium">
        <span className="text-on-surface-variant">{t('tutup.counted')}</span>
        <b className="tabular-nums">{formatMoney(r.actual, c)}</b>
      </div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="self-start text-label-medium text-primary underline"
        aria-expanded={open}
      >
        {t('tutup.howCalculated')}
      </button>
      {open ? (
        <span className="text-label-medium text-on-surface-variant" data-testid="pocket-explain">
          {r.method === 'cash'
            ? t('tutup.explainCash', {
                opening: plain(r.opening),
                sales: plain(r.sales),
                change: plain(r.change),
                expenses: plain(r.expenses),
              })
            : t('tutup.explainAba', { sales: plain(r.sales), expenses: plain(r.expenses) })}
        </span>
      ) : null}
    </section>
  );
}

/** Langkah 3: hasil (dipisah agar bisa dites dengan data tiruan). */
export function ClosingResultView({
  preview,
  money,
  actualCash,
  actualAba,
  kept,
  onKept,
  note,
  onNote,
  noteError,
}: {
  preview: ClosingPreview;
  money: MoneyCtx;
  actualCash: Record<Currency, number>;
  actualAba: Partial<Record<Currency, number | null>>;
  kept: Record<Currency, number>;
  onKept: (c: Currency, v: number) => void;
  note: string;
  onNote: (v: string) => void;
  noteError: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const cur = preview.currency;
  const results = visiblePockets(pocketResults(preview, actualCash, actualAba), money.enabled);
  const needsNote = results.some((r) => r.diff !== 0);
  const settle = useMutation({
    mutationFn: (id: number) => api.call('driverSettlementSettle', { params: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.closingPreview }),
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const unsettled = preview.drivers.filter((d) => !d.settledAt && d.cashCollected > 0);
  const ch = (k: string) => preview.byChannel.find((c) => c.channel === k)?.net ?? 0;
  const me = (k: string) => preview.byMethod.find((m) => m.method === k)?.totalMain ?? 0;
  const fmt = (v: number) => formatMoney(v, cur);
  const plain = (v: number) => formatMoney(v, cur, { noSymbol: true });
  const cashCurrencies = results.filter((r) => r.method === 'cash').map((r) => r.currency);
  return (
    <>
      {preview.unpaidOrderCount || preview.activeOrderCount ? (
        <Card tone="warn" className="text-body-medium font-medium text-warning">
          {preview.unpaidOrderCount ? (
            <div>{t('closing.unpaidWarning', { count: preview.unpaidOrderCount })}</div>
          ) : null}
          {preview.activeOrderCount ? (
            <div>{t('tutup.activeWarning', { count: preview.activeOrderCount })}</div>
          ) : null}
        </Card>
      ) : null}
      {preview.drivers.length ? (
        <section
          className={cn(
            'flex flex-col gap-2 rounded-md bg-surface-container-lowest px-3.5 py-3',
            unsettled.length > 0 && 'border-2 border-warning',
          )}
        >
          <b className="text-body-large">{t('closing.driverSettlement')}</b>
          {unsettled.length ? (
            <span className="text-label-medium text-warning">{t('tutup.settleFirst')}</span>
          ) : null}
          {preview.drivers.map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <div className="flex grow flex-col">
                <b>{d.driver.name}</b>
                <span className="text-label-medium text-on-surface-variant">
                  {t('tutup.driverLine', { count: d.deliveries, amount: fmt(d.cashCollected) })}
                </span>
              </div>
              {d.settledAt ? (
                <span className="rounded-sm bg-secondary-container px-2.5 py-1.5 text-label-medium font-medium text-on-secondary-container">
                  {t('closing.settled')}
                </span>
              ) : (
                <button
                  type="button"
                  disabled={settle.isPending}
                  onClick={() => settle.mutate(d.id)}
                  className="h-11 rounded-sm border-2 border-warning bg-warning-container px-3 text-label-medium font-medium"
                >
                  {t('tutup.markSettled')}
                </button>
              )}
            </div>
          ))}
        </section>
      ) : null}
      <div className="grid gap-3 medium:grid-cols-2" data-testid="pockets">
        {results.map((r) => (
          <PocketCard key={`${r.method}-${r.currency}`} r={r} />
        ))}
      </div>
      <section className="flex flex-col gap-1.5 rounded-md bg-surface-container-lowest px-3.5 py-3">
        <TextField
          label={needsNote ? t('tutup.noteRequired') : t('tutup.noteOptional')}
          value={note}
          maxLength={500}
          onChange={(e) => onNote(e.target.value)}
          error={noteError ? t('closing.noteRequired') : null}
          inputClassName="border-[1.5px] border-outline"
        />
      </section>
      <section
        className="flex flex-col gap-2.5 rounded-md bg-surface-container-lowest px-3.5 py-3"
        data-testid="keep-deposit"
      >
        <b className="text-body-large">{t('tutup.keepTitle')}</b>
        <span className="text-label-medium text-on-surface-variant">{t('tutup.keepHint')}</span>
        {cashCurrencies.map((c) => {
          const counted = actualCash[c] ?? 0;
          const over = kept[c] > counted;
          return (
            <div key={c} className="flex flex-col gap-1">
              <MoneyInput
                label={t('tutup.keepIn', { currency: t(`tutup.cur.${c}`) })}
                currency={c}
                value={kept[c]}
                onChange={(v) => onKept(c, v ?? 0)}
              />
              <div className="flex justify-between text-body-medium">
                <span className="text-on-surface-variant">{t('tutup.deposit')}</span>
                <b className={cn('tabular-nums', over && 'text-error')} data-testid={`deposit-${c}`}>
                  {over ? t('tutup.keepOver') : formatMoney(counted - kept[c], c)}
                </b>
              </div>
            </div>
          );
        })}
      </section>
      <section className="flex flex-col gap-1.5 rounded-md bg-surface-container-lowest px-3.5 py-3 text-body-medium">
        <b className="text-body-large">{t('tutup.summary')}</b>
        <div className="flex justify-between">
          <span>Cash · ABA</span>
          <span className="tabular-nums">
            {plain(me('cash'))} · {plain(me('aba'))}
          </span>
        </div>
        <div className="flex justify-between">
          <span>{t('tutup.platformNet')}</span>
          <span className="tabular-nums">
            {plain(ch('grab'))} · {plain(ch('foodpanda'))}
          </span>
        </div>
        <div className="flex justify-between text-body-large">
          <b>{t('admin.salesTotal')}</b>
          <b className="tabular-nums">{fmt(preview.salesTotalMain)}</b>
        </div>
        <div className="flex justify-between text-on-surface-variant">
          <span>{t('tutup.orderExpenses')}</span>
          <span className="tabular-nums">
            {preview.orderCount} · {plain(preview.expenses.cashMain + preview.expenses.abaMain)}
          </span>
        </div>
      </section>
    </>
  );
}

export default function ClosingPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const money = useMoney();
  const settings = usePublicSettings();
  const { logout } = useAuthActions();
  const print = usePrint();
  const preview = useQuery({
    queryKey: qk.closingPreview,
    queryFn: () => api.call('closingPreview'),
    retry: false,
  });
  const [step, setStep] = useState<Step>(1);
  const [cur, setCur] = useState<Currency>(money.main);
  const [mode, setMode] = useState<CountMode>('denom');
  const [counts, setCounts] = useState<Counts>({});
  const [manual, setManual] = useState<Partial<Record<Currency, number | null>>>({});
  const [aba, setAba] = useState<Partial<Record<Currency, number | null>>>({});
  const [keptEdit, setKeptEdit] = useState<Partial<Record<Currency, number>>>({});
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);
  const [result, setResult] = useState<ClosingResult | null>(null);
  const totals = totalsByCurrency(mode, counts, manual);
  const kept = {
    ...defaultKeep(preview.data?.suggestedKeep ?? {}, totals),
    ...keptEdit,
  } as Record<Currency, number>;
  const abaByCurrency = { KHR: aba.KHR ?? 0, USD: aba.USD ?? 0, IDR: aba.IDR ?? 0 };

  const close = useMutation({
    mutationFn: () =>
      api.call('closingCreate', {
        body: {
          shiftId: preview.data!.shift.id,
          actual: {
            cashByCurrency: totals,
            abaByCurrency,
            ...(mode === 'denom' ? { denominations: counts } : {}),
          },
          kept: { KHR: kept.KHR, USD: kept.USD, IDR: kept.IDR },
          ...(note.trim() ? { note: note.trim() } : {}),
        },
      }),
    onSuccess: async (res) => {
      setResult(res);
      qc.setQueryData(qk.shift, null);
      void qc.invalidateQueries({ queryKey: qk.shift });
      toast.success(t('tutup.closed'));
      if (getPrefs().printer !== 'none') {
        try {
          await printDoc(
            buildClosingReport(
              res.preview,
              res.closing,
              settings.data?.name ?? 'Rumah Makan Berkat',
              paperCols(),
              getPrefs().receiptLang,
            ),
          );
        } catch (e) {
          toast.error(`${t('print.failed')}: ${deviceErrorText((e as Error).message, t)}`);
        }
      }
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const steps = [t('closing.step1'), t('closing.step2'), t('closing.step3')];
  const header = (
    <header className="flex shrink-0 flex-col gap-2 bg-surface px-1 pb-3">
      <div className="flex min-h-16 items-center gap-1">
        <IconButton
          icon="arrow_back"
          label={t('common.back')}
          onClick={() => navigate('/kasir')}
          className="text-on-surface"
        />
        <h1 className="truncate px-1 text-title-large">
          {t('tutup.title', { name: preview.data?.shift.name ?? '' })}
        </h1>
      </div>
      <ol className="grid grid-cols-3 gap-2 px-3 text-center text-label-medium">
        {steps.map((s, i) => {
          const n = (i + 1) as Step;
          const doneStep = n < step || !!result;
          return (
            <li
              key={s}
              aria-current={n === step && !result ? 'step' : undefined}
              className={cn(
                'flex min-h-10 items-center justify-center gap-1 rounded-full px-1 py-1',
                n === step && !result
                  ? 'bg-primary text-on-primary'
                  : doneStep
                    ? 'bg-secondary-container text-on-secondary-container'
                    : 'bg-surface-container-high text-on-surface-variant',
              )}
            >
              {doneStep ? <Icon name="check" size={16} /> : null}
              {n}. {s}
            </li>
          );
        })}
      </ol>
    </header>
  );

  if (preview.isLoading) return <LoadingBlock />;
  if (preview.isError || !preview.data)
    return (
      <Screen>
        {header}
        <div className="p-4">
          <ErrorBlock error={preview.error} onRetry={() => void preview.refetch()} />
          <EmptyState
            title={t('shift.noShift')}
            action={<Button onClick={() => navigate('/kasir')}>{t('cashier.title')}</Button>}
          />
        </div>
      </Screen>
    );
  const p = preview.data;
  const abaCurrencies = p.pockets
    .filter((x) => x.method === 'aba' && (money.enabled.includes(x.currency) || x.expected !== 0))
    .map((x) => x.currency);
  const results = pocketResults(p, totals, aba);
  const unsettledDrivers = p.drivers.some((d) => !d.settledAt && d.cashCollected > 0);
  const keepOver = CURRENCIES.some((c) => kept[c] > (totals[c] ?? 0));

  if (result) {
    return (
      <Screen testId="closing-done">
        {header}
        <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-3.5 py-3">
          <Card tone="primary" className="text-center">
            <b className="text-title-large text-primary">{t('tutup.closed')}</b>
            <p className="mt-1 text-body-medium">{t('closing.locked')}</p>
          </Card>
          <section className="flex flex-col gap-1 rounded-md bg-surface-container-lowest p-3.5 text-body-medium">
            <b className="text-body-large">{t('tutup.diffPerPocket')}</b>
            {(result.closing.diff.pockets ?? []).map((r) => (
              <div key={`${r.method}-${r.currency}`} className="flex justify-between">
                <span>{pocketLabel(t, r.method, r.currency)}</span>
                <b className={cn('tabular-nums', r.diff ? 'text-error' : 'text-primary')}>
                  {r.diff ? formatMoney(r.diff, r.currency, { signed: true }) : t('tutup.match')}
                </b>
              </div>
            ))}
          </section>
          {result.closing.actual.deposit ? (
            <section
              className="flex flex-col gap-1 rounded-md bg-surface-container-lowest p-3.5 text-body-medium"
              data-testid="deposit-summary"
            >
              <b className="text-body-large">{t('tutup.depositTitle')}</b>
              {CURRENCIES.filter(
                (c) =>
                  (result.closing.actual.deposit?.[c] ?? 0) > 0 || (result.closing.actual.kept?.[c] ?? 0) > 0,
              ).map((c) => (
                <div key={c} className="flex justify-between">
                  <span>{t(`tutup.cur.${c}`)}</span>
                  <span className="tabular-nums">
                    {t('tutup.depositLine', {
                      deposit: formatMoney(result.closing.actual.deposit?.[c] ?? 0, c),
                      kept: formatMoney(result.closing.actual.kept?.[c] ?? 0, c),
                    })}
                  </span>
                </div>
              ))}
            </section>
          ) : null}
        </main>
        <ScreenFooter>
          <div className="flex gap-2">
            <Button
              variant="outlined"
              className="h-16 w-36"
              onClick={() =>
                void print.printDoc(
                  buildClosingReport(
                    result.preview,
                    result.closing,
                    settings.data?.name ?? '',
                    paperCols(),
                    getPrefs().receiptLang,
                  ),
                )
              }
            >
              {t('closing.printReport')}
            </Button>
            <Button size="xl" className="grow" onClick={() => void logout()}>
              {t('common.logout')}
            </Button>
          </div>
        </ScreenFooter>
      </Screen>
    );
  }

  return (
    <Screen testId="closing-screen">
      {header}
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-3.5 py-3">
        {step === 1 ? (
          <>
            <p className="text-body-medium text-on-surface-variant">{t('closing.countCash')}</p>
            <Tabs
              dense
              label={t('closing.countCash')}
              value={mode}
              onChange={setMode}
              tabs={[
                { value: 'denom', label: t('shift.perDenomination') },
                { value: 'total', label: t('shift.totalOnly') },
              ]}
            />
            <CurrencyTabs currencies={money.enabled} value={cur} onChange={setCur} totals={totals} />
            {mode === 'denom' ? (
              <DenominationList
                currency={cur}
                counts={counts[cur] ?? {}}
                onChange={(next) => setCounts((c) => ({ ...c, [cur]: next }))}
              />
            ) : (
              <ManualTotal
                currency={cur}
                value={manual[cur] ?? null}
                onChange={(v) => setManual((m) => ({ ...m, [cur]: v }))}
              />
            )}
          </>
        ) : null}
        {step === 2 ? (
          <section className="flex flex-col gap-3 rounded-md bg-surface-container-lowest p-3.5">
            <span className="text-body-medium text-on-surface-variant">{t('tutup.abaHintPer')}</span>
            {abaCurrencies.map((c, i) => (
              <MoneyInput
                key={c}
                big
                autoFocus={i === 0}
                label={t('tutup.abaIn', { currency: t(`tutup.cur.${c}`) })}
                currency={c}
                value={aba[c] ?? null}
                onChange={(v) => setAba((a) => ({ ...a, [c]: v }))}
              />
            ))}
          </section>
        ) : null}
        {step === 3 ? (
          <ClosingResultView
            preview={p}
            money={money}
            actualCash={totals}
            actualAba={aba}
            kept={kept}
            onKept={(c, v) => setKeptEdit((k) => ({ ...k, [c]: v }))}
            note={note}
            onNote={(v) => {
              setNote(v);
              setNoteError(false);
            }}
            noteError={noteError}
          />
        ) : null}
      </main>
      <ScreenFooter>
        {step === 1 ? (
          <div className="flex items-baseline justify-between">
            <span className="text-body-medium text-on-surface-variant">{t('closing.actualCash')}</span>
            <b className="text-headline-small tabular-nums">
              {formatMoney(closingCalc(p, totals, 0, p.currency, money.rates).cashActualMain, p.currency)}
            </b>
          </div>
        ) : null}
        <div className="flex gap-2">
          {step > 1 ? (
            <button
              type="button"
              onClick={() => setStep(step === 3 ? 1 : 1)}
              className="state-layer flex h-16 w-[120px] shrink-0 items-center justify-center gap-1 rounded-full border border-outline px-2 text-label-large text-primary"
            >
              <Icon name="arrow_back" size={20} />
              <span className="truncate">{step === 3 ? t('tutup.recount') : t('common.back')}</span>
            </button>
          ) : null}
          {step < 3 ? (
            <Button size="xl" className="grow" onClick={() => setStep((s) => (s + 1) as Step)}>
              {t('common.next')}
            </Button>
          ) : (
            <Button
              size="xl"
              className="grow text-title-medium"
              loading={close.isPending}
              disabled={unsettledDrivers || keepOver}
              onClick={() => {
                if (results.some((r) => r.diff !== 0) && !note.trim()) {
                  setNoteError(true);
                  toast.error(t('closing.noteRequired'));
                  return;
                }
                close.mutate();
              }}
            >
              {t('tutup.closeAndPrint')}
            </Button>
          )}
        </div>
      </ScreenFooter>
    </Screen>
  );
}
