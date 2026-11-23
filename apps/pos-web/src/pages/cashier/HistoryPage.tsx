/** Riwayat order hari ini (aktif / semua) → detail pesanan. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { addDays, formatMoney, hasPermission, type Lang } from '@pos/shared';
import { Badge, EmptyState, Icon, IconButton } from '../../components/ui';
import { useMe } from '../../lib/auth';
import { usePublicSettings } from '../../lib/data';
import { formatDayLabel } from '../../lib/format';
import {
  ErrorBlock,
  LoadingBlock,
  Screen,
  SourceBadge,
  StatusBadge,
  Tabs,
  TopBar,
  timeHM,
} from '../../components/common';
import { api, qk } from '../../lib/api';

export default function HistoryPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const isOwner = hasPermission(me?.permissions, 'reports.owner');
  const today = usePublicSettings().data?.businessDate ?? '';
  const [tab, setTab] = useState<'active' | 'all'>('active');
  // Owner bisa melihat riwayat tanggal mana pun (null = hari ini).
  const [date, setDate] = useState<string | null>(null);
  const viewDate = isOwner && date && date !== today ? date : null;
  const filter = tab === 'active' ? ({ active: 'true' } as const) : viewDate ? { date: viewDate } : {};
  const q = useQuery({
    queryKey: qk.orders({ history: tab, date: viewDate ?? 'today' }),
    queryFn: () => api.call('ordersList', { query: filter }),
  });
  const orders = [...(q.data?.orders ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return (
    <Screen wide testId="history-screen">
      <TopBar
        back={{ label: t('cashier.title'), onClick: () => navigate('/kasir') }}
        title={t('cashier.history')}
      >
        <Tabs
          label={t('cashier.history')}
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'active', label: t('riwayat.active') },
            { value: 'all', label: isOwner ? t('riwayat.all') : t('riwayat.today') },
          ]}
        />
      </TopBar>
      <main className="flex min-h-0 grow flex-col gap-2 overflow-y-auto p-3">
        {isOwner && tab === 'all' && today ? (
          <div className="flex shrink-0 items-center gap-1" data-testid="history-date">
            <IconButton
              icon="chevron_left"
              label={t('riwayat.prevDay')}
              onClick={() => setDate(addDays(viewDate ?? today, -1))}
            />
            <label className="relative flex h-11 grow items-center justify-center gap-2 rounded-full bg-surface-container-high px-4 text-label-large">
              <Icon name="calendar_month" size={18} />
              {viewDate ? formatDayLabel(viewDate, i18n.language as Lang) : t('riwayat.today')}
              <input
                type="date"
                aria-label={t('riwayat.pickDate')}
                value={viewDate ?? today}
                max={today}
                onChange={(e) => setDate(e.target.value || null)}
                className="absolute inset-0 opacity-0"
              />
            </label>
            <IconButton
              icon="chevron_right"
              label={t('riwayat.nextDay')}
              disabled={!viewDate}
              onClick={() => setDate(viewDate && addDays(viewDate, 1) < today ? addDays(viewDate, 1) : null)}
            />
          </div>
        ) : null}
        {q.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data && !orders.length ? <EmptyState title={t('common.empty')} /> : null}
        {orders.map((o) => (
          <button
            key={o.id}
            type="button"
            onClick={() => navigate(`/kasir/riwayat/${o.id}`)}
            className="flex min-h-16 shrink-0 items-center gap-3 rounded-md bg-surface-container-lowest px-3 py-2.5 text-left"
          >
            <span className="flex w-20 shrink-0 flex-col">
              <b className="text-title-medium">{o.displayNo}</b>
              <span className="text-label-medium text-on-surface-variant">{timeHM(o.createdAt)}</span>
            </span>
            <span className="flex min-w-0 grow flex-col gap-1">
              <span className="truncate font-medium">
                {o.table?.name ?? o.customerName ?? o.customer?.name ?? t(`orderType.${o.type}`)}
              </span>
              <span className="flex flex-wrap gap-1">
                <SourceBadge channel={o.channel} />
                <Badge tone={o.paymentStatus === 'paid' ? 'primary' : 'danger'} className="text-label-medium">
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
