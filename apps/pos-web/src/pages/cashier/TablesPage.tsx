/** Denah meja — acuan: docs/mockups/Meja.dc.html. */
import { useQuery } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { formatMoney, type TableStatus, type TableStatusDto } from '@pos/shared';
import { ErrorBlock, LoadingBlock, Screen, Tabs, TopBar, minutesSince } from '../../components/common';
import { Icon, cn, type IconName } from '../../components/ui';
import { api, qk } from '../../lib/api';
import { setCart } from '../../lib/cart';
import { useMoney } from '../../lib/data';

/** Status meja → peran M3 (warna + ikon + teks, tidak hanya warna). */
export const TABLE_STYLE: Record<
  TableStatus,
  { key: string; dot: string; card: string; text: string; icon: IconName }
> = {
  empty: {
    key: 'tables.empty',
    dot: 'bg-outline',
    card: 'bg-surface-container-lowest border border-outline-variant',
    text: 'text-on-surface-variant',
    icon: 'table_restaurant',
  },
  eating: {
    key: 'tables.eating',
    dot: 'bg-tertiary',
    card: 'bg-tertiary-container text-on-tertiary-container',
    text: 'text-on-tertiary-container',
    icon: 'restaurant',
  },
  bill_requested: {
    key: 'tables.billRequested',
    dot: 'bg-warning',
    card: 'bg-warning-container text-on-warning-container border-2 border-warning',
    text: 'text-on-warning-container',
    icon: 'receipt_long',
  },
  qr_new: {
    key: 'tables.qrNew',
    dot: 'bg-primary',
    card: 'bg-primary-container text-on-primary-container border-2 border-primary',
    text: 'text-on-primary-container',
    icon: 'qr_code_2',
  },
};

export default function TablesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const money = useMoney();
  const { tableId } = useParams();
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
        right={
          <span className="text-label-medium text-on-surface-variant">
            {t('meja.filled', { n: filled, total: tables.length })}
          </span>
        }
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
        <div className="flex flex-wrap gap-x-3 gap-y-1 text-label-medium text-on-surface-variant">
          {(Object.keys(TABLE_STYLE) as TableStatus[]).map((s) => (
            <span key={s} className="flex items-center gap-1">
              <span className={cn('size-2.5 rounded-full', TABLE_STYLE[s].dot)} />
              {t(TABLE_STYLE[s].key)}
            </span>
          ))}
        </div>
      </TopBar>
      <main className="min-h-0 grow overflow-y-auto px-4 py-3">
        {q.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        <div className="grid grid-cols-2 gap-3 medium:grid-cols-[repeat(auto-fill,minmax(160px,1fr))]">
          {shown.map((tb) => {
            const st = TABLE_STYLE[tb.status];
            const mins = tb.session ? minutesSince(tb.session.openedAt) : 0;
            return (
              <button
                key={tb.id}
                type="button"
                onClick={() => open(tb)}
                aria-current={String(tb.id) === tableId ? 'true' : undefined}
                className={cn(
                  'state-layer flex min-h-[112px] flex-col gap-1 rounded-md p-3 text-left text-on-surface',
                  st.card,
                  String(tb.id) === tableId && 'outline-3 outline-offset-2 outline-secondary',
                )}
              >
                <div className="flex w-full items-center justify-between gap-1">
                  <b className="truncate text-title-medium">{tb.name}</b>
                  <span className="shrink-0 text-label-medium opacity-80">
                    {t('meja.seats', { count: tb.seats })}
                  </span>
                </div>
                <span className={cn('flex items-center gap-1 text-label-large', st.text)}>
                  <Icon name={st.icon} size={18} />
                  {t(st.key)}
                  {tb.status === 'qr_new' ? ` · ${t('meja.accept')}` : ''}
                </span>
                <span className="grow" />
                <div className="flex w-full items-baseline justify-between">
                  <b className="text-title-medium font-medium tabular-nums">
                    {tb.status !== 'empty' ? formatMoney(tb.runningTotal, money.main) : ''}
                  </b>
                  <span className="text-label-medium opacity-80">
                    {tb.status === 'qr_new' && tb.orderCount <= tb.pendingQrCount
                      ? t('meja.new')
                      : tb.session
                        ? t('common.minutes', { count: mins })
                        : ''}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </main>
    </Screen>
  );
}
