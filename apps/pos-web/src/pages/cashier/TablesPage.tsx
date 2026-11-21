/** Denah meja — acuan: docs/mockups/Meja.dc.html. */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatMoney, type TableStatus, type TableStatusDto } from '@pos/shared';
import { ErrorBlock, LoadingBlock, Screen, Tabs, TopBar, minutesSince } from '../../components/common';
import { cn } from '../../components/ui';
import { api, qk } from '../../lib/api';
import { setCart } from '../../lib/cart';
import { useMoney } from '../../lib/data';

export const TABLE_STYLE: Record<TableStatus, { key: string; dot: string; card: string; text: string }> = {
  empty: { key: 'tables.empty', dot: 'bg-line-strong', card: 'bg-white border border-line', text: 'text-muted' },
  eating: { key: 'tables.eating', dot: 'bg-info', card: 'bg-info-tint border-[1.5px] border-[#84ADFF]', text: 'text-info-dark' },
  bill_requested: { key: 'tables.billRequested', dot: 'bg-warn', card: 'bg-warn-tint border-2 border-warn', text: 'text-warn-dark' },
  qr_new: { key: 'tables.qrNew', dot: 'bg-primary', card: 'bg-primary-tint border-2 border-primary', text: 'text-primary-dark' },
};

export default function TablesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const money = useMoney();
  const q = useQuery({ queryKey: qk.tables, queryFn: () => api.call('tablesList'), refetchInterval: 60_000 });
  const [area, setArea] = useState('all');
  const tables = useMemo(() => (q.data?.tables ?? []).filter((x) => x.active), [q.data]);
  const areas = useMemo(() => [...new Set(tables.map((x) => x.area))], [tables]);
  const shown = tables.filter((x) => area === 'all' || x.area === area);
  const filled = tables.filter((x) => x.status !== 'empty').length;

  const open = (tb: TableStatusDto) => {
    if (tb.status === 'empty') {
      setCart({ kind: 'dine_in', tableId: tb.id });
      navigate('/kasir');
    } else navigate(`/kasir/meja/${tb.id}`);
  };

  return (
    <Screen wide testId="tables-screen">
      <TopBar
        back={{ label: t('cashier.title'), onClick: () => navigate('/kasir') }}
        title={t('tables.title')}
        right={<span className="text-[13px] text-muted">{t('meja.filled', { n: filled, total: tables.length })}</span>}
      >
        {areas.length > 1 ? (
          <Tabs
            dense
            label={t('tables.area')}
            value={area}
            onChange={setArea}
            tabs={[{ value: 'all', label: t('order.all') }, ...areas.map((a) => ({ value: a, label: a }))]}
          />
        ) : null}
        <div className="flex flex-wrap gap-2.5 text-xs text-[#475467]">
          {(Object.keys(TABLE_STYLE) as TableStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn('size-2.5 rounded-full', TABLE_STYLE[s].dot)} />
              {t(TABLE_STYLE[s].key)}
            </span>
          ))}
        </div>
      </TopBar>
      <main className="min-h-0 grow overflow-y-auto p-3">
        {q.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-4">
          {shown.map((tb) => {
            const st = TABLE_STYLE[tb.status];
            const mins = tb.session ? minutesSince(tb.session.openedAt) : 0;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => open(tb)}
                className={cn('flex min-h-[104px] flex-col gap-1 rounded-card p-3 text-left text-ink shadow-[0_1px_2px_rgba(16,24,40,0.05)]', st.card)}
              >
                <div className="flex w-full items-center justify-between">
                  <b className="text-lg">{tb.name}</b>
                  <span className="text-xs text-muted">{t('meja.seats', { count: tb.seats })}</span>
                </div>
                <span className={cn('text-xs font-extrabold', st.text)}>
                  {t(st.key)}
                  {tb.status === 'qr_new' ? ` · ${t('meja.accept')}` : ''}
                </span>
                <span className="grow" />
                <div className="flex w-full items-baseline justify-between">
                  <b className="text-base tabular-nums">{tb.status !== 'empty' ? formatMoney(tb.runningTotal, money.main) : ''}</b>
                  <span className="text-xs text-muted">{tb.status === 'qr_new' && tb.orderCount <= tb.pendingQrCount ? t('meja.new') : tb.session ? t('common.minutes', { count: mins }) : ''}</span>
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </Screen>
  );
}
