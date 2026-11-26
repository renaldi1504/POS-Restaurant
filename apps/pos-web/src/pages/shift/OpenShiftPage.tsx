/** Buka shift – modal awal — acuan: docs/mockups/BukaShift.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useNavigate } from 'react-router';
import { CURRENCIES, formatMoney, type Currency, type OpenShiftRequest } from '@pos/shared';
import { Button, Chip, cn, useToast } from '../../components/ui';
import {
  CurrencyTabs,
  DenominationList,
  LoadingBlock,
  ManualTotal,
  Screen,
  ScreenFooter,
  Tabs,
  TextField,
  totalInMain,
  totalsByCurrency,
  type CountMode,
  type Counts,
} from '../../components/common';
import { api, errorMessage, isApiError, qk } from '../../lib/api';
import { homePathFor, useMe } from '../../lib/auth';
import { useCurrentShift, useMoney, useStaffSettings } from '../../lib/data';

/** Nama shift default menurut jam (sebelum 15.00 = Pagi). */
export function defaultShiftName(names: string[], now = new Date()): string {
  if (!names.length) return 'Pagi';
  if (names.length === 1) return names[0]!;
  return now.getHours() >= 4 && now.getHours() < 15 ? names[0]! : names[1]!;
}

export function OpenShiftForm({ embedded, onOpened }: { embedded?: boolean; onOpened?: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const money = useMoney();
  const names = useStaffSettings().shift.names;
  const [name, setName] = useState<string | null>(null);
  const shiftName = name ?? defaultShiftName(names);
  const currencies = money.enabled;
  const [cur, setCur] = useState<Currency>(money.main);
  const [mode, setMode] = useState<CountMode>('denom');
  const [counts, setCounts] = useState<Counts>({});
  const [manual, setManual] = useState<Partial<Record<Currency, number | null>>>({});
  const totals = totalsByCurrency(mode, counts, manual);
  const totalMain = totalInMain(totals, money.main, money.rates);
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState(false);
  // Sisa laci dari closing terakhir → modal harus sama (kalau beda, wajib catatan).
  const suggestion = useQuery({
    queryKey: ['shift', 'opening-suggestion'],
    queryFn: () => api.call('shiftOpeningSuggestion'),
  });
  const expected = suggestion.data?.expected ?? null;
  const leftInDrawer = !!expected && CURRENCIES.some((c) => expected[c] > 0);
  const mismatch = leftInDrawer ? CURRENCIES.filter((c) => (totals[c] ?? 0) !== expected[c]) : [];

  const open = useMutation({
    mutationFn: () => {
      const body: OpenShiftRequest = {
        name: shiftName,
        openingCash: { KHR: totals.KHR, USD: totals.USD, IDR: totals.IDR },
        ...(mode === 'denom' ? { denominations: counts } : {}),
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      return api.call('shiftOpen', { body });
    },
    onSuccess: (res) => {
      qc.setQueryData(qk.shift, res.shift);
      toast.success(t('shiftx.opened', { name: res.shift.name }));
      onOpened?.();
    },
    onError: (e) => {
      if (isApiError(e) && e.code === 'SHIFT_ALREADY_OPEN') void qc.invalidateQueries({ queryKey: qk.shift });
      if (isApiError(e) && e.code === 'OPENING_NOTE_REQUIRED') setNoteError(true);
      toast.error(errorMessage(e, t));
    },
  });

  const breakdown = currencies
    .filter((c) => totals[c] > 0)
    .map((c) => formatMoney(totals[c], c))
    .join(' + ');
  const rateNote = currencies
    .filter((c) => c !== money.main && totals[c] > 0)
    .map((c) =>
      c === 'USD'
        ? `$1 = ${formatMoney(money.rates.USD, 'KHR', { noSymbol: true })}`
        : `Rp1.000 = ${formatMoney(Math.round(money.rates.IDR * 1000), 'KHR', { noSymbol: true })}`,
    )
    .join(', ');

  return (
    <>
      <header className="flex shrink-0 flex-col gap-0.5 border-b border-outline-variant bg-surface-container-lowest px-3.5 py-3">
        {embedded ? (
          <span className="text-label-medium font-medium uppercase tracking-wide text-warning">
            {t('shift.noShift')}
          </span>
        ) : null}
        <h2 className="text-title-large font-medium">{t('shiftx.openTitle', { name: shiftName })}</h2>
        <span className="text-label-medium text-on-surface-variant">{t('shiftx.countFirst')}</span>
      </header>
      <main className="flex min-h-0 grow flex-col gap-2.5 overflow-y-auto px-3.5 py-3">
        {names.length > 1 ? (
          <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={t('shift.shiftName')}>
            <span className="mr-1 text-label-medium font-medium">{t('shift.shiftName')}:</span>
            {names.map((n) => (
              <Chip key={n} active={shiftName === n} onClick={() => setName(n)}>
                {n}
              </Chip>
            ))}
          </div>
        ) : null}
        <Tabs
          dense
          label={t('shift.openingCash')}
          value={mode}
          onChange={setMode}
          tabs={[
            { value: 'denom', label: t('shift.perDenomination') },
            { value: 'total', label: t('shift.totalOnly') },
          ]}
        />
        {leftInDrawer ? (
          <section
            className={cn(
              'flex flex-col gap-1 rounded-md border-2 px-3.5 py-2.5 text-body-medium',
              mismatch.length
                ? 'border-warning bg-warning-container/40'
                : 'border-primary bg-primary-container/30',
            )}
            data-testid="opening-expected"
          >
            <b>{t('shiftx.expectedTitle', { name: suggestion.data?.fromShift?.name ?? '' })}</b>
            {CURRENCIES.filter((c) => expected[c] > 0 || (totals[c] ?? 0) > 0).map((c) => (
              <div key={c} className="flex justify-between gap-2">
                <span>{formatMoney(expected[c], c)}</span>
                <span className={cn('tabular-nums', mismatch.includes(c) ? 'text-error' : 'text-primary')}>
                  {mismatch.includes(c)
                    ? t('shiftx.countedNow', { amount: formatMoney(totals[c] ?? 0, c) })
                    : t('tutup.match')}
                </span>
              </div>
            ))}
          </section>
        ) : null}
        <CurrencyTabs currencies={currencies} value={cur} onChange={setCur} totals={totals} />
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
      </main>
      <ScreenFooter className="gap-2.5">
        <div className="flex items-baseline justify-between">
          <span className="text-body-medium text-on-surface-variant">
            {t('shiftx.totalIn', { currency: t(`currency.${money.main}`) })}
          </span>
          <b className="text-headline-medium text-primary tabular-nums" data-testid="opening-total">
            {formatMoney(totalMain, money.main)}
          </b>
        </div>
        {breakdown ? (
          <span className="-mt-2 text-right text-label-medium text-on-surface-variant">
            {breakdown}
            {rateNote ? ` (${t('admin.rate').toLowerCase()} ${rateNote})` : ''}
          </span>
        ) : null}
        {mismatch.length ? (
          <TextField
            label={t('shiftx.diffNote')}
            value={note}
            maxLength={500}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteError(false);
            }}
            error={noteError ? t('shiftx.diffNoteRequired') : null}
          />
        ) : null}
        <Button
          size="xl"
          block
          loading={open.isPending}
          onClick={() => {
            if (mismatch.length && !note.trim()) {
              setNoteError(true);
              toast.error(t('shiftx.diffNoteRequired'));
              return;
            }
            open.mutate();
          }}
        >
          {t('shift.startShift')}
        </Button>
      </ScreenFooter>
    </>
  );
}

export default function OpenShiftPage() {
  const navigate = useNavigate();
  const { data: me } = useMe();
  const shift = useCurrentShift();
  if (shift.isLoading) return <LoadingBlock />;
  if (shift.data && me) return <Navigate to={homePathFor(me.permissions)} replace />;
  return (
    <Screen testId="open-shift-screen">
      <OpenShiftForm onOpened={() => me && navigate(homePathFor(me.permissions), { replace: true })} />
    </Screen>
  );
}
