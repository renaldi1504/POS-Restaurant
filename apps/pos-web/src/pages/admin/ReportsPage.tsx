/** Laporan owner: penjualan, pengeluaran, laba kotor & menu terlaris untuk periode pilihan. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney, tl, type Lang, type RangeReport } from '@pos/shared';
import { AdminBar } from '../../components/admin/AdminBar';
import { ErrorBlock, LoadingBlock, Screen } from '../../components/common';
import { EmptyState, Icon, cn } from '../../components/ui';
import { api } from '../../lib/api';
import { usePublicSettings } from '../../lib/data';
import { formatDayLabel } from '../../lib/format';
import { PERIODS, groupSeries, pctChange, periodRange, type Period } from '../../lib/reportRange';
import { useLang } from '../../lib/useLang';

export default function ReportsPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const settings = usePublicSettings();
  const today = settings.data?.businessDate ?? '';
  const [period, setPeriod] = useState<Period>('today');
  const [custom, setCustom] = useState<{ from: string; to: string }>({ from: '', to: '' });
  const range =
    period === 'custom'
      ? { from: custom.from || today, to: custom.to || today }
      : today
        ? periodRange(period, today)
        : null;
  const validRange = !!range && !!range.from && !!range.to && range.from <= range.to;
  const q = useQuery({
    queryKey: ['reports', 'range', range?.from, range?.to],
    queryFn: () => api.call('reportsRange', { query: range! }),
    enabled: validRange,
  });

  return (
    <Screen wide testId="reports-screen">
      <AdminBar title={t('rpt.title')} />
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto p-3">
        <nav
          aria-label={t('rpt.period')}
          className="-mx-3 flex shrink-0 gap-2 overflow-x-auto px-3 py-1 [scrollbar-width:none]"
        >
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              aria-pressed={period === p}
              onClick={() => {
                setPeriod(p);
                if (p === 'custom' && !custom.from && range) setCustom(range);
              }}
              className={cn(
                'state-layer flex h-10 shrink-0 items-center gap-1 rounded-full px-4 text-label-large whitespace-nowrap',
                period === p
                  ? 'bg-secondary-container font-semibold text-on-secondary-container'
                  : 'border border-outline-variant bg-surface-container-lowest text-on-surface-variant',
              )}
            >
              {p === 'custom' ? <Icon name="calendar_month" size={18} /> : null}
              {t(`rpt.p.${p}`)}
            </button>
          ))}
        </nav>
        {period === 'custom' ? (
          <div className="grid shrink-0 grid-cols-2 gap-2">
            {(['from', 'to'] as const).map((k) => (
              <label key={k} className="flex flex-col gap-1 text-label-medium text-on-surface-variant">
                {t(`rpt.${k}`)}
                <input
                  type="date"
                  value={custom[k]}
                  max={today || undefined}
                  onChange={(e) => setCustom({ ...custom, [k]: e.target.value })}
                  className="h-12 rounded-xs border border-outline bg-surface-container-lowest px-3 text-body-large text-on-surface"
                />
              </label>
            ))}
            {!validRange ? (
              <span className="col-span-2 text-label-medium text-error">{t('rpt.badRange')}</span>
            ) : null}
          </div>
        ) : null}
        {range && validRange ? (
          <span className="text-label-medium text-on-surface-variant" data-testid="report-range">
            {range.from === range.to
              ? formatDayLabel(range.from, lang)
              : `${formatDayLabel(range.from, lang)} – ${formatDayLabel(range.to, lang)}`}
          </span>
        ) : null}
        {q.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        {q.data ? <ReportBody r={q.data} lang={lang} /> : null}
      </main>
    </Screen>
  );
}

function Delta({ now, before, invert = false }: { now: number; before: number; invert?: boolean }) {
  const { t } = useTranslation();
  const p = pctChange(now, before);
  if (p === null) return null;
  const up = p > 0;
  const good = p === 0 ? null : invert ? !up : up;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-0.5 text-label-medium font-medium tabular-nums',
        good === null ? 'text-on-surface-variant' : good ? 'text-primary' : 'text-error',
      )}
      title={t('rpt.vsPrev')}
    >
      <Icon name={up ? 'trending_up' : p < 0 ? 'trending_down' : 'trending_flat'} size={16} />
      {p > 0 ? '+' : ''}
      {p}%
    </span>
  );
}

export function ReportBody({ r, lang }: { r: RangeReport; lang: Lang }) {
  const { t } = useTranslation();
  const fmt = (v: number) => formatMoney(v, r.currency);
  const series = groupSeries(r.byDay);
  const max = Math.max(1, ...series.map((s) => Math.max(s.sales, s.expenses)));
  const topMax = Math.max(1, ...r.topItems.map((i) => i.qty));
  const expMax = Math.max(1, ...r.expensesByCategory.map((c) => c.total));
  const kpi = (
    label: string,
    value: string,
    now: number,
    before: number,
    opts: { invert?: boolean; tone?: 'good' | 'bad'; testId?: string } = {},
  ) => (
    <div
      className="flex flex-col gap-0.5 rounded-md bg-surface-container-lowest p-3"
      data-testid={opts.testId}
    >
      <span className="text-label-medium text-on-surface-variant">{label}</span>
      <b
        className={cn(
          'text-title-large tabular-nums',
          opts.tone === 'bad' && 'text-error',
          opts.tone === 'good' && 'text-primary',
        )}
      >
        {value}
      </b>
      <Delta now={now} before={before} invert={opts.invert} />
    </div>
  );
  const label = (key: string, monthly: boolean) =>
    monthly
      ? new Intl.DateTimeFormat(lang === 'kh' ? 'km' : lang === 'zh' ? 'zh-CN' : lang, {
          month: 'short',
          timeZone: 'UTC',
        }).format(new Date(`${key}-01T00:00:00Z`))
      : key.slice(8);

  return (
    <>
      <div
        className="grid grid-cols-2 gap-2 medium:grid-cols-3 expanded:grid-cols-6"
        data-testid="report-kpis"
      >
        {kpi(t('rpt.sales'), fmt(r.totalSales), r.totalSales, r.previous.totalSales, { testId: 'kpi-sales' })}
        {kpi(t('rpt.net'), fmt(r.netSales), r.netSales, r.previous.netSales)}
        {kpi(t('rpt.expenses'), fmt(r.expensesTotal), r.expensesTotal, r.previous.expensesTotal, {
          invert: true,
          testId: 'kpi-expenses',
        })}
        {kpi(t('rpt.profit'), fmt(r.grossProfit), r.grossProfit, r.previous.grossProfit, {
          tone: r.grossProfit < 0 ? 'bad' : 'good',
          testId: 'kpi-profit',
        })}
        {kpi(t('rpt.orders'), String(r.orderCount), r.orderCount, r.previous.orderCount)}
        <div className="flex flex-col gap-0.5 rounded-md bg-surface-container-lowest p-3">
          <span className="text-label-medium text-on-surface-variant">{t('rpt.average')}</span>
          <b className="text-title-large tabular-nums">{fmt(r.averageOrder)}</b>
          <span className="text-label-medium text-on-surface-variant">
            {t('rpt.cancelled', { count: r.cancelledCount })}
          </span>
        </div>
      </div>
      {r.unpaid.count > 0 ? (
        <div
          data-testid="rpt-unpaid"
          className="flex items-center gap-3 rounded-md bg-warning-container p-3 text-on-warning-container"
        >
          <Icon name="schedule" size={22} className="shrink-0" />
          <span className="grow text-body-medium">{t('rpt.unpaid', { count: r.unpaid.count })}</span>
          <b className="tabular-nums">{fmt(r.unpaid.total)}</b>
        </div>
      ) : null}
      <span className="text-label-medium text-on-surface-variant">
        {t('rpt.prevNote', {
          from: formatDayLabel(r.previous.from, lang),
          to: formatDayLabel(r.previous.to, lang),
        })}
      </span>

      {series.length > 1 ? (
        <section className="flex flex-col gap-2 rounded-md bg-surface-container-lowest p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-body-medium font-medium">
              {series[0]?.monthly ? t('rpt.perMonth') : t('rpt.perDay')}
            </h2>
            <div className="flex gap-3 text-label-medium text-on-surface-variant">
              <span className="flex items-center gap-1">
                <i className="size-3 rounded-xs bg-primary" />
                {t('rpt.sales')}
              </span>
              <span className="flex items-center gap-1">
                <i className="size-3 rounded-xs bg-error" />
                {t('rpt.expenses')}
              </span>
            </div>
          </div>
          <div className="overflow-x-auto">
            <div
              className="flex h-[170px] min-w-full items-end gap-1 border-b border-outline-variant"
              style={{ width: series.length > 31 ? `${series.length * 14}px` : undefined }}
              role="img"
              aria-label={t('rpt.perDay')}
            >
              {series.map((s) => (
                <div
                  key={s.key}
                  className="flex h-full min-w-2 flex-1 items-end justify-center gap-[2px]"
                  title={`${s.key} · ${t('rpt.sales')} ${fmt(s.sales)} · ${t('rpt.expenses')} ${fmt(s.expenses)}`}
                >
                  <div
                    className="w-1/2 max-w-5 rounded-t-xs bg-primary"
                    style={{ height: `${Math.round((s.sales / max) * 160)}px` }}
                  />
                  <div
                    className="w-1/2 max-w-5 rounded-t-xs bg-error/80"
                    style={{ height: `${Math.round((s.expenses / max) * 160)}px` }}
                  />
                </div>
              ))}
            </div>
            <div
              className="flex min-w-full gap-1 pt-1 text-label-medium text-on-surface-variant"
              style={{ width: series.length > 31 ? `${series.length * 14}px` : undefined }}
            >
              {series.map((s, i) => (
                <span key={s.key} className="min-w-2 flex-1 text-center tabular-nums">
                  {series.length <= 14 || i % Math.ceil(series.length / 10) === 0
                    ? label(s.key, s.monthly)
                    : ''}
                </span>
              ))}
            </div>
          </div>
        </section>
      ) : null}

      <div className="grid gap-3 medium:grid-cols-2">
        <section
          className="flex flex-col gap-2 rounded-md bg-surface-container-lowest p-3"
          data-testid="top-items"
        >
          <h2 className="text-body-medium font-medium">{t('rpt.topItems')}</h2>
          {!r.topItems.length ? <EmptyState title={t('common.empty')} /> : null}
          {r.topItems.map((it, i) => (
            <div key={`${it.itemId}-${i}`} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-2">
                <span className="min-w-0 truncate">
                  <b className="mr-1.5 tabular-nums text-on-surface-variant">{i + 1}.</b>
                  {tl(it.name, lang)}
                </span>
                <span className="shrink-0 text-label-medium tabular-nums">
                  <b>{t('rpt.qty', { count: it.qty })}</b>
                  <span className="text-on-surface-variant"> · {fmt(it.total)}</span>
                </span>
              </div>
              <div className="h-1.5 rounded bg-surface-container-high">
                <div
                  className={cn('h-1.5 rounded', i < 3 ? 'bg-primary' : 'bg-primary/50')}
                  style={{ width: `${Math.round((it.qty / topMax) * 100)}%` }}
                />
              </div>
            </div>
          ))}
        </section>

        <div className="flex flex-col gap-3">
          <section
            className="flex flex-col gap-2 rounded-md bg-surface-container-lowest p-3"
            data-testid="expenses-by-category"
          >
            <h2 className="text-body-medium font-medium">{t('rpt.expensesByCategory')}</h2>
            {!r.expensesByCategory.length ? <EmptyState title={t('common.empty')} /> : null}
            {r.expensesByCategory.map((c) => (
              <div key={c.category} className="flex flex-col gap-1">
                <div className="flex justify-between gap-2 text-label-large">
                  <span className="min-w-0 truncate">
                    {c.category} <span className="text-on-surface-variant">({c.count})</span>
                  </span>
                  <b className="tabular-nums">{fmt(c.total)}</b>
                </div>
                <div className="h-1.5 rounded bg-surface-container-high">
                  <div
                    className="h-1.5 rounded bg-error/70"
                    style={{ width: `${Math.round((c.total / expMax) * 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </section>

          <section className="flex flex-col gap-1.5 rounded-md bg-surface-container-lowest p-3">
            <h2 className="text-body-medium font-medium">{t('dash.perChannel')}</h2>
            {!r.byChannel.length ? <EmptyState title={t('common.empty')} /> : null}
            {r.byChannel.map((c) => (
              <div key={c.channel} className="flex justify-between gap-2 text-label-large">
                <span>
                  {t(`channel.${c.channel}`)} <span className="text-on-surface-variant">({c.count})</span>
                </span>
                <b className="tabular-nums">{fmt(c.net)}</b>
              </div>
            ))}
            {r.byMethod.length ? (
              <div className="mt-1 flex flex-col gap-1.5 border-t border-surface-container-highest pt-2">
                {r.byMethod.map((m) => (
                  <div key={m.method} className="flex justify-between gap-2 text-label-large">
                    <span>{t(`paymentMethod.${m.method}`)}</span>
                    <b className="tabular-nums">{fmt(m.totalMain)}</b>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </>
  );
}
