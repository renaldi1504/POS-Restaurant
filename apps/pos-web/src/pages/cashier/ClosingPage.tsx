/** Closing shift 3 langkah — acuan: docs/mockups/Closing.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatMoney, type ClosingPreview, type ClosingResult, type Currency } from '@pos/shared';
import { Button, Card, EmptyState, cn, useToast } from '../../components/ui';
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
import { api, errorMessage, qk } from '../../lib/api';
import { useAuthActions } from '../../lib/auth';
import { closingCalc, diffKind } from '../../lib/closing';
import { useMoney, usePublicSettings, type MoneyCtx } from '../../lib/data';
import { buildClosingReport } from '../../lib/printer';
import { paperCols, printDoc } from '../../lib/print';
import { getPrefs } from '../../lib/prefs';

type Step = 1 | 2 | 3;

export function DiffLabel({ diff, currency }: { diff: number; currency: Currency }) {
  const { t } = useTranslation();
  const k = diffKind(diff);
  return (
    <b className={cn('text-xl', k === 'match' ? 'text-primary' : 'text-danger')} data-testid="diff-label">
      {k === 'match' ? t('tutup.match') : k === 'short' ? t('tutup.short', { amount: formatMoney(-diff, currency) }) : t('tutup.over', { amount: formatMoney(diff, currency) })}
    </b>
  );
}

/** Langkah 3: hasil (dipisah agar bisa dites dengan data tiruan). */
export function ClosingResultView({
  preview,
  money,
  actualCash,
  abaMain,
  note,
  onNote,
  noteError,
}: {
  preview: ClosingPreview;
  money: MoneyCtx;
  actualCash: Record<Currency, number>;
  abaMain: number;
  note: string;
  onNote: (v: string) => void;
  noteError: boolean;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const cur = preview.currency;
  const calc = closingCalc(preview, actualCash, abaMain, cur, money.rates);
  const settle = useMutation({
    mutationFn: (id: number) => api.call('driverSettlementSettle', { params: { id } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.closingPreview }),
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const ch = (k: string) => preview.byChannel.find((c) => c.channel === k)?.net ?? 0;
  const me = (k: string) => preview.byMethod.find((m) => m.method === k)?.totalMain ?? 0;
  const fmt = (v: number) => formatMoney(v, cur);
  const plain = (v: number) => formatMoney(v, cur, { noSymbol: true });
  return (
    <>
      {preview.unpaidOrderCount || preview.activeOrderCount ? (
        <Card tone="warn" className="text-[15px] font-bold text-warn-dark">
          {preview.unpaidOrderCount ? <div>{t('closing.unpaidWarning', { count: preview.unpaidOrderCount })}</div> : null}
          {preview.activeOrderCount ? <div>{t('tutup.activeWarning', { count: preview.activeOrderCount })}</div> : null}
        </Card>
      ) : null}
      <section className={cn('flex flex-col gap-1.5 rounded-card border-2 bg-white px-3.5 py-3 shadow-card', calc.cashDiff ? 'border-[#F04438]' : 'border-primary')} data-testid="cash-result">
        <div className="flex items-baseline justify-between">
          <b className="text-xl">{t('common.cash')}</b>
          <DiffLabel diff={calc.cashDiff} currency={cur} />
        </div>
        <div className="flex justify-between text-[15px]">
          <span className="text-muted">{t('tutup.expected')}</span>
          <b className="tabular-nums">{fmt(calc.cashExpectedMain)}</b>
        </div>
        <div className="flex justify-between text-[15px]">
          <span className="text-muted">{t('tutup.counted')}</span>
          <b className="tabular-nums" data-testid="cash-counted">{fmt(calc.cashActualMain)}</b>
        </div>
        <span className="text-xs text-muted">
          {t('tutup.explain', { opening: plain(calc.openingMain), sales: plain(calc.cashSalesMain), expenses: plain(calc.cashExpensesMain) })}
        </span>
      </section>
      <section className={cn('flex flex-col gap-1.5 rounded-card border-2 bg-white px-3.5 py-3 shadow-card', calc.abaDiff ? 'border-[#F04438]' : 'border-primary')} data-testid="aba-result">
        <div className="flex items-baseline justify-between">
          <b className="text-xl">ABA</b>
          <DiffLabel diff={calc.abaDiff} currency={cur} />
        </div>
        {calc.abaDiff ? (
          <>
            <div className="flex justify-between text-[15px]">
              <span className="text-muted">{t('tutup.expected')}</span>
              <b className="tabular-nums">{fmt(calc.abaExpectedMain)}</b>
            </div>
            <div className="flex justify-between text-[15px]">
              <span className="text-muted">{t('tutup.counted')}</span>
              <b className="tabular-nums">{fmt(calc.abaActualMain)}</b>
            </div>
          </>
        ) : (
          <div className="flex justify-between text-[15px]">
            <span className="text-muted">{t('tutup.expectedCounted')}</span>
            <b className="tabular-nums">{fmt(calc.abaExpectedMain)}</b>
          </div>
        )}
      </section>
      <section className="flex flex-col gap-1.5 rounded-card bg-white px-3.5 py-3 shadow-card">
        <TextField
          label={calc.needsNote ? t('tutup.noteRequired') : t('tutup.noteOptional')}
          value={note}
          maxLength={500}
          onChange={(e) => onNote(e.target.value)}
          error={noteError ? t('closing.noteRequired') : null}
          inputClassName="border-[1.5px] border-[#98A2B3]"
        />
      </section>
      {preview.drivers.length ? (
        <section className="flex flex-col gap-2 rounded-card bg-white px-3.5 py-3 shadow-card">
          <b className="text-[17px]">{t('closing.driverSettlement')}</b>
          {preview.drivers.map((d) => (
            <div key={d.id} className="flex items-center gap-2">
              <div className="flex grow flex-col">
                <b>{d.driver.name}</b>
                <span className="text-[13px] text-muted">{t('tutup.driverLine', { count: d.deliveries, amount: fmt(d.cashCollected) })}</span>
              </div>
              {d.settledAt ? (
                <span className="rounded-lg bg-primary-tint px-2.5 py-1.5 text-[13px] font-extrabold text-primary-dark">{t('closing.settled')}</span>
              ) : (
                <button type="button" disabled={settle.isPending} onClick={() => settle.mutate(d.id)} className="h-11 rounded-[10px] border-2 border-warn bg-warn-tint px-3 text-[13px] font-extrabold">
                  {t('tutup.markSettled')}
                </button>
              )}
            </div>
          ))}
        </section>
      ) : null}
      <section className="flex flex-col gap-1.5 rounded-card bg-white px-3.5 py-3 text-[15px] shadow-card">
        <b className="text-[17px]">{t('tutup.summary')}</b>
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
        <div className="flex justify-between text-[17px]">
          <b>{t('admin.salesTotal')}</b>
          <b className="tabular-nums">{fmt(preview.salesTotalMain)}</b>
        </div>
        <div className="flex justify-between text-muted">
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
  const preview = useQuery({ queryKey: qk.closingPreview, queryFn: () => api.call('closingPreview'), retry: false });
  const [step, setStep] = useState<Step>(1);
  const [cur, setCur] = useState<Currency>(money.main);
  const [mode, setMode] = useState<CountMode>('denom');
  const [counts, setCounts] = useState<Counts>({});
  const [manual, setManual] = useState<Partial<Record<Currency, number | null>>>({});
  const [aba, setAba] = useState<number | null>(null);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);
  const [result, setResult] = useState<ClosingResult | null>(null);
  const totals = totalsByCurrency(mode, counts, manual);

  const close = useMutation({
    mutationFn: () =>
      api.call('closingCreate', {
        body: {
          shiftId: preview.data!.shift.id,
          actual: { cashByCurrency: totals, abaMain: aba ?? 0, ...(mode === 'denom' ? { denominations: counts } : {}) },
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
          await printDoc(buildClosingReport(res.preview, res.closing, settings.data?.name ?? 'Rumah Makan Berkat', paperCols()));
        } catch (e) {
          toast.error(`${t('print.failed')}: ${(e as Error).message}`);
        }
      }
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const steps = [t('closing.step1'), t('closing.step2'), t('closing.step3')];
  const header = (
    <header className="flex shrink-0 flex-col gap-2.5 border-b border-line bg-white px-3.5 py-3">
      <div className="flex items-center gap-2">
        <button type="button" onClick={() => navigate('/kasir')} aria-label={t('common.back')} className="flex h-11 items-center rounded-xl border border-line-strong px-3 font-bold">
          ‹
        </button>
        <h1 className="text-xl font-extrabold">{t('tutup.title', { name: preview.data?.shift.name ?? '' })}</h1>
      </div>
      <ol className="grid grid-cols-3 gap-1.5 text-center text-[13px] font-bold">
        {steps.map((s, i) => {
          const n = (i + 1) as Step;
          const doneStep = n < step || !!result;
          return (
            <li key={s} aria-current={n === step && !result ? 'step' : undefined} className={cn('rounded-[10px] px-1 py-2', n === step && !result ? 'bg-ink text-white' : doneStep ? 'bg-primary-tint text-primary-dark' : 'bg-[#F2F4F7] text-muted')}>
              {n}. {s}
              {doneStep ? ' ✓' : ''}
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
          <EmptyState title={t('shift.noShift')} action={<Button onClick={() => navigate('/kasir')}>{t('cashier.title')}</Button>} />
        </div>
      </Screen>
    );
  const p = preview.data;

  if (result) {
    return (
      <Screen testId="closing-done">
        {header}
        <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-3.5 py-3">
          <Card tone="primary" className="text-center">
            <b className="text-xl text-primary-dark">{t('tutup.closed')}</b>
            <p className="mt-1 text-[15px]">{t('closing.locked')}</p>
          </Card>
          <section className="flex flex-col gap-1 rounded-card bg-white p-3.5 text-[15px] shadow-card">
            <div className="flex justify-between">
              <span>{t('tutup.cashDiff')}</span>
              <b className="tabular-nums">{formatMoney(result.closing.diff.cashMain, p.currency, { signed: true })}</b>
            </div>
            <div className="flex justify-between">
              <span>{t('tutup.abaDiff')}</span>
              <b className="tabular-nums">{formatMoney(result.closing.diff.abaMain, p.currency, { signed: true })}</b>
            </div>
          </section>
        </main>
        <ScreenFooter>
          <div className="flex gap-2">
            <Button variant="outline" className="h-16 w-36" onClick={() => void print.printDoc(buildClosingReport(result.preview, result.closing, settings.data?.name ?? '', paperCols()))}>
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
            <p className="text-[15px] text-muted">{t('closing.countCash')}</p>
            <Tabs dense label={t('closing.countCash')} value={mode} onChange={setMode} tabs={[{ value: 'denom', label: t('shift.perDenomination') }, { value: 'total', label: t('shift.totalOnly') }]} />
            <CurrencyTabs currencies={money.enabled} value={cur} onChange={setCur} totals={totals} />
            {mode === 'denom' ? (
              <DenominationList currency={cur} counts={counts[cur] ?? {}} onChange={(next) => setCounts((c) => ({ ...c, [cur]: next }))} />
            ) : (
              <ManualTotal currency={cur} value={manual[cur] ?? null} onChange={(v) => setManual((m) => ({ ...m, [cur]: v }))} />
            )}
          </>
        ) : null}
        {step === 2 ? (
          <section className="flex flex-col gap-2 rounded-card bg-white p-3.5 shadow-card">
            <MoneyInput big autoFocus label={t('closing.abaBalance')} currency={p.currency} value={aba} onChange={setAba} />
            <span className="text-sm text-muted">{t('tutup.abaHint')}</span>
          </section>
        ) : null}
        {step === 3 ? (
          <ClosingResultView
            preview={p}
            money={money}
            actualCash={totals}
            abaMain={aba ?? 0}
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
            <span className="text-[15px] text-muted">{t('closing.actualCash')}</span>
            <b className="text-2xl tabular-nums">{formatMoney(closingCalc(p, totals, 0, p.currency, money.rates).cashActualMain, p.currency)}</b>
          </div>
        ) : null}
        <div className="flex gap-2">
          {step > 1 ? (
            <button type="button" onClick={() => setStep(step === 3 ? 1 : 1)} className="h-16 w-[110px] rounded-2xl border border-line-strong bg-white text-[15px] font-bold shadow-card">
              ‹ {step === 3 ? t('tutup.recount') : t('common.back')}
            </button>
          ) : null}
          {step < 3 ? (
            <Button size="xl" className="grow" onClick={() => setStep((s) => (s + 1) as Step)}>
              {t('common.next')}
            </Button>
          ) : (
            <Button
              size="xl"
              className="grow text-lg"
              loading={close.isPending}
              onClick={() => {
                const calc = closingCalc(p, totals, aba ?? 0, p.currency, money.rates);
                if (calc.needsNote && !note.trim()) {
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
