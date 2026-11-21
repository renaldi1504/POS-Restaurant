/** Pengeluaran — acuan: docs/mockups/Pengeluaran.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatMoney, type Currency, type ExpenseSource } from '@pos/shared';
import { Button, useToast } from '../../components/ui';
import {
  CURRENCY_SHORT,
  ChoiceButton,
  ErrorBlock,
  LoadingBlock,
  MoneyInput,
  Screen,
  ScreenFooter,
  TextField,
  TopBar,
  timeHM,
} from '../../components/common';
import { api, errorMessage, qk } from '../../lib/api';
import { useMoney } from '../../lib/data';
import { cn } from '../../components/ui';

export default function ExpensesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const money = useMoney();
  const cats = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.call('expenseCategories'),
    staleTime: 5 * 60_000,
  });
  const list = useQuery({ queryKey: qk.expenses, queryFn: () => api.call('expensesList') });
  const [categoryId, setCategoryId] = useState<number | null>(null);
  const [amount, setAmount] = useState<number | null>(null);
  const [currency, setCurrency] = useState<Currency>(money.main);
  const [source, setSource] = useState<ExpenseSource>('cash');
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<{ url: string; name: string } | null>(null);
  const [showErr, setShowErr] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const upload = useMutation({
    mutationFn: (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      return api.call('expensePhoto', { body: fd });
    },
    onSuccess: (r, file) => setPhoto({ url: r.url, name: file.name }),
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const save = useMutation({
    mutationFn: () =>
      api.call('expenseCreate', {
        body: {
          categoryId: categoryId!,
          amount: amount!,
          currency,
          source,
          ...(note.trim() ? { note: note.trim() } : {}),
          ...(photo ? { photoUrl: photo.url } : {}),
        },
      }),
    onSuccess: () => {
      toast.success(t('keluar.saved'));
      setAmount(null);
      setNote('');
      setPhoto(null);
      setShowErr(false);
      void qc.invalidateQueries({ queryKey: qk.expenses });
      void qc.invalidateQueries({ queryKey: qk.closingPreview });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const valid = !!categoryId && !!amount && amount > 0;
  const totalMain = (list.data?.totalCashMain ?? 0) + (list.data?.totalAbaMain ?? 0);

  return (
    <Screen testId="expenses-screen">
      <TopBar
        back={{ label: t('cashier.title'), onClick: () => navigate('/kasir') }}
        title={t('expense.title')}
        right={
          <span className="text-right text-[13px] text-muted">
            {t('keluar.thisShift')}
            <br />
            <b className="text-[15px] text-ink tabular-nums">{formatMoney(totalMain, money.main)}</b>
          </span>
        }
      />
      <main className="flex min-h-0 grow flex-col gap-3.5 overflow-y-auto px-3.5 py-3">
        <section className="flex flex-col gap-2">
          <b>1. {t('keluar.forWhat')}</b>
          {cats.isLoading ? <LoadingBlock /> : null}
          {cats.isError ? <ErrorBlock error={cats.error} onRetry={() => void cats.refetch()} /> : null}
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('expense.category')}>
            {cats.data?.categories.map((c) => (
              <ChoiceButton
                key={c.id}
                role="radio"
                aria-checked={categoryId === c.id}
                selected={categoryId === c.id}
                onClick={() => setCategoryId(c.id)}
                className="h-[54px]"
              >
                {c.name}
              </ChoiceButton>
            ))}
          </div>
          {showErr && !categoryId ? (
            <span className="text-sm font-bold text-danger">{t('keluar.pickCategory')}</span>
          ) : null}
        </section>
        <section className="flex flex-col gap-2">
          <MoneyInput
            big
            id="jml"
            label={`2. ${t('keluar.howMuch')}`}
            currency={currency}
            value={amount}
            onChange={setAmount}
          />
          {showErr && !amount ? (
            <span className="text-sm font-bold text-danger">{t('keluar.fillAmount')}</span>
          ) : null}
          <div
            role="radiogroup"
            aria-label={t('payment.currency')}
            className="grid gap-1 rounded-xl bg-[#EEF0F3] p-1"
            style={{ gridTemplateColumns: `repeat(${money.enabled.length}, minmax(0,1fr))` }}
          >
            {money.enabled.map((c) => (
              <button
                key={c}
                type="button"
                role="radio"
                aria-checked={currency === c}
                onClick={() => {
                  setCurrency(c);
                  setAmount(null);
                }}
                className={cn(
                  'h-[42px] rounded-[9px] text-[15px]',
                  currency === c
                    ? 'bg-white font-extrabold shadow-[0_1px_3px_rgba(0,0,0,0.15)]'
                    : 'font-semibold',
                )}
              >
                {CURRENCY_SHORT[c]}
              </button>
            ))}
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <b>3. {t('keluar.fromWhere')}</b>
          <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label={t('expense.source')}>
            <ChoiceButton
              role="radio"
              aria-checked={source === 'cash'}
              selected={source === 'cash'}
              onClick={() => setSource('cash')}
              className="h-[54px]"
            >
              {t('keluar.cashDrawer')}
            </ChoiceButton>
            <ChoiceButton
              role="radio"
              aria-checked={source === 'aba'}
              selected={source === 'aba'}
              onClick={() => setSource('aba')}
              className="h-[54px]"
            >
              {t('keluar.abaTransfer')}
            </ChoiceButton>
          </div>
        </section>
        <section className="flex flex-col gap-2">
          <TextField
            label={t('keluar.noteOptional')}
            value={note}
            maxLength={300}
            onChange={(e) => setNote(e.target.value)}
            inputClassName="h-[52px] text-[17px]"
          />
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            aria-label={t('expense.photo')}
            onChange={(e) => e.target.files?.[0] && upload.mutate(e.target.files[0])}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={upload.isPending}
            className="h-12 rounded-[14px] border-[1.5px] border-dashed border-[#98A2B3] text-[15px] font-bold"
          >
            {upload.isPending ? t('common.loading') : photo ? `✓ ${photo.name}` : t('expense.photo')}
          </button>
        </section>
        {list.data?.expenses.length ? (
          <section className="flex flex-col gap-1 rounded-card bg-white p-3 shadow-card">
            <b>{t('expense.list')}</b>
            {list.data.expenses.map((e) => (
              <div
                key={e.id}
                className="flex justify-between gap-2 border-b border-[#F2F4F7] py-1.5 text-[15px] last:border-0"
              >
                <span className="flex flex-col">
                  <span className="font-semibold">
                    {e.category.name} · {e.source === 'cash' ? t('keluar.cashDrawer') : 'ABA'}
                  </span>
                  <span className="text-xs text-muted">
                    {timeHM(e.createdAt)}
                    {e.note ? ` · ${e.note}` : ''}
                  </span>
                </span>
                <b className="tabular-nums">{formatMoney(e.amount, e.currency)}</b>
              </div>
            ))}
          </section>
        ) : null}
      </main>
      <ScreenFooter>
        <Button
          size="xl"
          block
          className="text-[21px]"
          loading={save.isPending}
          onClick={() => {
            if (!valid) {
              setShowErr(true);
              return;
            }
            save.mutate();
          }}
        >
          {t('keluar.save')}
        </Button>
      </ScreenFooter>
    </Screen>
  );
}
