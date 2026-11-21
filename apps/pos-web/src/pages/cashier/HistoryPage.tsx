/** Riwayat order hari ini (aktif / semua) → detail pesanan. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { formatMoney } from '@pos/shared';
import { Badge, EmptyState } from '../../components/ui';
import { ErrorBlock, LoadingBlock, Screen, SourceBadge, StatusBadge, Tabs, TopBar, timeHM } from '../../components/common';
import { api, qk } from '../../lib/api';

export default function HistoryPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'active' | 'all'>('active');
  const filter = tab === 'active' ? ({ active: 'true' } as const) : {};
  const q = useQuery({ queryKey: qk.orders({ history: tab }), queryFn: () => api.call('ordersList', { query: filter }) });
  const orders = [...(q.data?.orders ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Screen wide testId="history-screen">
      <TopBar back={{ label: t('cashier.title'), onClick: () => navigate('/kasir') }} title={t('cashier.history')}>
        <Tabs label={t('cashier.history')} value={tab} onChange={setTab} tabs={[{ value: 'active', label: t('riwayat.active') }, { value: 'all', label: t('riwayat.today') }]} />
      </TopBar>
      <main className="flex min-h-0 grow flex-col gap-2 overflow-y-auto p-3">
        {q.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data && !orders.length ? <EmptyState title={t('common.empty')} /> : null}
        {orders.map((o) => (
          <button key={o.id} type="button" onClick={() => navigate(`/kasir/pesanan/${o.id}`)} className="flex min-h-16 shrink-0 items-center gap-3 rounded-card bg-white px-3 py-2.5 text-left shadow-card">
            <span className="flex w-20 shrink-0 flex-col">
              <b className="text-lg">{o.displayNo}</b>
              <span className="text-xs text-muted">{timeHM(o.createdAt)}</span>
            </span>
            <span className="flex min-w-0 grow flex-col gap-1">
              <span className="truncate font-semibold">
                {o.table?.name ?? o.customerName ?? o.customer?.name ?? t(`orderType.${o.type}`)}
              </span>
              <span className="flex flex-wrap gap-1">
                <SourceBadge channel={o.channel} />
                <Badge tone={o.paymentStatus === 'paid' ? 'primary' : 'danger'} className="text-[11px]">
                  {t(`paymentStatus.${o.paymentStatus}`)}
                </Badge>
              </span>
            </span>
            <span className="flex shrink-0 flex-col items-end gap-1">
              <b className="tabular-nums">{formatMoney(o.total, o.currency)}</b>
              <StatusBadge status={o.status} />
            </span>
          </button>
        ))}
      </main>
    </Screen>
  );
}
