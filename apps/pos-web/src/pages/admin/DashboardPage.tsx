/** Dashboard harian — acuan: docs/mockups/Dashboard.dc.html. */
import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatMoney, parseHHMM, tl, type DailyReport, type HourlyPoint } from '@pos/shared';
import { AdminBar } from '../../components/admin/AdminBar';
import { ErrorBlock, LoadingBlock, Screen } from '../../components/common';
import { EmptyState, cn } from '../../components/ui';
import { api } from '../../lib/api';
import { usePublicSettings } from '../../lib/data';
import { formatDayLabel } from '../../lib/format';
import { useLang } from '../../lib/useLang';

/** Urutan jam operasional (mis. 08 → 02 untuk buka 08.00 tutup 03.00), nilai 0 bila kosong. */
export function hourSeries(
  byHour: HourlyPoint[],
  open = '08:00',
  close = '03:00',
): { hour: number; total: number }[] {
  const start = Math.floor(parseHHMM(open) / 60);
  const end = Math.ceil(parseHHMM(close) / 60);
  const span = (end - start + 24) % 24 || 24;
  const map = new Map(byHour.map((p) => [p.hour, p.total]));
  // jam di luar jam buka yang tetap ada penjualan ikut ditampilkan
  const hours = Array.from({ length: span }, (_, i) => (start + i) % 24);
  for (const p of byHour) if (!hours.includes(p.hour) && p.total > 0) hours.push(p.hour);
  return hours.map((h) => ({ hour: h, total: map.get(h) ?? 0 }));
}

const pad = (n: number) => String(n).padStart(2, '0');

export default function DashboardPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const settings = usePublicSettings();
  const [date, setDate] = useState<string>('');
  const q = useQuery({
    queryKey: ['reports', 'daily', date || 'today'],
    queryFn: () => api.call('reportsDaily', { query: date ? { date } : {} }),
  });
  const r = q.data;
  const isToday = !date || date === settings.data?.businessDate;
  const shownDate = r?.date ?? settings.data?.businessDate ?? '';
  const dateLabel = shownDate ? formatDayLabel(shownDate, lang) : '';

  return (
    <Screen wide testId="admin-screen">
      <AdminBar
        title={t('dash.title')}
        right={
          <label className="relative flex h-11 items-center rounded-md border border-outline-variant bg-surface-container-lowest px-3 text-label-medium font-medium">
            <span aria-hidden>
              {isToday ? `${t('common.today')} · ` : ''}
              {dateLabel} ▾
            </span>
            <input
              type="date"
              aria-label={t('admin.pickDate')}
              value={date || shownDate}
              max={settings.data?.businessDate}
              onChange={(e) => setDate(e.target.value)}
              className="absolute inset-0 cursor-pointer opacity-0"
            />
          </label>
        }
      />
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto p-3">
        {q.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        {r ? (
          <DashboardBody
            r={r}
            lang={lang}
            open={settings.data?.hours.open}
            close={settings.data?.hours.close}
          />
        ) : null}
      </main>
    </Screen>
  );
}

export function DashboardBody({
  r,
  lang,
  open,
  close,
}: {
  r: DailyReport;
  lang: string;
  open?: string;
  close?: string;
}) {
  const { t } = useTranslation();
  const fmt = (v: number) => formatMoney(v, r.currency);
  const series = hourSeries(r.byHour, open, close);
  const max = Math.max(1, ...series.map((s) => s.total));
  const peak = series.reduce((a, s) => (s.total > a.total ? s : a), { hour: -1, total: 0 });
  const channels = [...r.byChannel].sort((a, b) => b.net - a.net);
  const chMax = Math.max(1, ...channels.map((c) => c.net));
  const labels = series.filter((_, i) => i % 4 === 0 || i === series.length - 1);
  const kpi = (label: string, value: string, sub?: string) => (
    <div className="flex flex-col gap-0.5 rounded-md bg-surface-container-lowest p-3">
      <span className="text-label-medium text-on-surface-variant">{label}</span>
      <b className="text-title-large tabular-nums">{value}</b>
      {sub ? <span className="text-label-medium text-on-surface-variant">{sub}</span> : null}
    </div>
  );
  return (
    <>
      <div className="grid grid-cols-2 gap-2 medium:grid-cols-4" data-testid="kpis">
        {kpi(t('admin.salesTotal'), fmt(r.totalSales), t('dash.shifts', { count: r.shifts.length }))}
        {kpi(t('admin.orderCount'), String(r.orderCount), t('dash.cancelled', { count: r.cancelledCount }))}
        {kpi(t('dash.average'), fmt(r.averageOrder))}
        {kpi(t('admin.expenses'), fmt(r.expensesTotal))}
      </div>
      <section className="flex flex-col gap-1.5 rounded-md bg-surface-container-lowest p-3">
        <h2 className="text-body-medium font-medium">{t('dash.perHour')}</h2>
        <span className="text-label-medium text-on-surface-variant">
          {peak.total > 0
            ? `${t('dash.peak', { from: `${pad(peak.hour)}.00`, to: `${pad((peak.hour + 1) % 24)}.00` })} · `
            : ''}
          {t('dash.thousand', { symbol: r.currency === 'KHR' ? '៛' : r.currency })}
        </span>
        <div
          className="flex h-[150px] items-end gap-[3px] border-b border-outline-variant"
          role="img"
          aria-label={t('dash.perHour')}
        >
          {series.map((s) => (
            <div
              key={s.hour}
              title={`${pad(s.hour)}.00 · ${fmt(s.total)}`}
              className={cn(
                'flex-1 rounded-t-xs',
                s.total >= max * 0.8 && s.total > 0 ? 'bg-primary' : 'bg-primary-container',
              )}
              style={{ height: `${Math.round((s.total / max) * 140)}px` }}
            />
          ))}
        </div>
        <div className="flex justify-between text-label-medium text-on-surface-variant">
          {labels.map((s) => (
            <span key={s.hour}>{pad(s.hour)}</span>
          ))}
        </div>
      </section>
      <div className="grid gap-3 medium:grid-cols-2">
        <section className="flex flex-col gap-2 rounded-md bg-surface-container-lowest p-3">
          <h2 className="text-body-medium font-medium">{t('dash.perChannel')}</h2>
          {!channels.length ? <EmptyState title={t('common.empty')} /> : null}
          {channels.map((c) => (
            <div key={c.channel} className="flex flex-col gap-[3px]">
              <div className="flex justify-between text-label-medium">
                <span>
                  {t(`channel.${c.channel}`)} <span className="text-on-surface-variant">({c.count})</span>
                </span>
                <b className="tabular-nums">{fmt(c.net)}</b>
              </div>
              <div className="h-2 rounded bg-surface-container-high">
                <div
                  className="h-2 rounded bg-primary"
                  style={{ width: `${Math.round((Math.max(0, c.net) / chMax) * 100)}%` }}
                />
              </div>
            </div>
          ))}
          {r.netSales !== r.totalSales ? (
            <div className="flex justify-between border-t border-surface-container-highest pt-2 text-label-medium">
              <span>{t('dash.net')}</span>
              <b className="tabular-nums">{fmt(r.netSales)}</b>
            </div>
          ) : null}
        </section>
        <section className="flex flex-col gap-1 rounded-md bg-surface-container-lowest p-3">
          <h2 className="mb-1 text-body-medium font-medium">{t('admin.topItems')}</h2>
          {!r.topItems.length ? <EmptyState title={t('common.empty')} /> : null}
          {r.topItems.slice(0, 5).map((it, i) => (
            <div key={`${it.itemId}-${i}`} className="flex justify-between py-1">
              <span>
                {i + 1}. {tl(it.name, lang)}
              </span>
              <b>{it.qty}</b>
            </div>
          ))}
        </section>
      </div>
    </>
  );
}
