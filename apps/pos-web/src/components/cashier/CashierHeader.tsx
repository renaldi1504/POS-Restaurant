import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { hasPermission, type Lang } from '@pos/shared';
import { Icon, IconButton } from '../ui';
import { formatDayLabel } from '../../lib/format';
import { useCurrentShift, usePublicSettings } from '../../lib/data';
import { useMe } from '../../lib/auth';
import { useOnlineAlarm } from '../../lib/online';

/**
 * Pintasan berlabel di layar kasir: Pengeluaran, Closing (tutup shift), Dashboard — sesuai izin role.
 * Ikon + tulisan supaya jelas untuk pengguna lanjut usia.
 */
export function CashierShortcuts() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const items = [
    hasPermission(me?.permissions, 'shift.manage')
      ? { icon: 'payments' as const, label: t('bnav.short.expenses'), to: '/kasir/pengeluaran' }
      : null,
    hasPermission(me?.permissions, 'shift.manage')
      ? { icon: 'lock' as const, label: t('bnav.short.closing'), to: '/kasir/closing' }
      : null,
    hasPermission(me?.permissions, 'reports.view')
      ? { icon: 'bar_chart' as const, label: t('bnav.short.dashboard'), to: '/admin' }
      : null,
  ].filter((x): x is NonNullable<typeof x> => !!x);
  if (!items.length) return null;
  return (
    <nav
      aria-label={t('cashier.shortcuts')}
      className="flex gap-2 overflow-x-auto px-4 [scrollbar-width:none]"
    >
      {items.map((x) => (
        <button
          key={x.to}
          type="button"
          onClick={() => navigate(x.to)}
          className="state-layer flex h-10 shrink-0 items-center gap-1.5 rounded-sm border border-outline-variant bg-surface-container-lowest pl-2.5 pr-4 text-label-large text-on-surface"
        >
          <Icon name={x.icon} size={20} className="text-primary" />
          {x.label}
        </button>
      ))}
    </nav>
  );
}

/**
 * Aksi top app bar kasir: Denah meja + bel order online (badge + bunyi berulang sampai dilihat).
 * Menu lengkap ada di navigation bar bawah ("Lainnya").
 */
export function CashierActions({
  onOnlineScreen = false,
  extra,
}: {
  onOnlineScreen?: boolean;
  extra?: ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const { count } = useOnlineAlarm(onOnlineScreen);
  const canAccept = hasPermission(me?.permissions, 'order.accept');
  return (
    <>
      {extra}
      {hasPermission(me?.permissions, 'order.create') ? (
        <IconButton
          icon="table_restaurant"
          label={t('cashier.tables')}
          onClick={() => navigate('/kasir/meja')}
        />
      ) : null}
      {canAccept ? (
        <IconButton
          icon={count ? 'notifications_active' : 'notifications'}
          label={count ? t('cashier.onlineNew', { count }) : t('cashier.onlineOrders')}
          badge={count || undefined}
          tone={count ? 'warn' : 'default'}
          onClick={() => navigate('/kasir/online')}
        />
      ) : null}
    </>
  );
}

/**
 * Shift yang masih terbuka dari hari operasional sebelumnya (lupa closing): order baru tetap masuk
 * ke tanggal shift itu, sehingga "Riwayat hari ini" & laporan hari ini kosong. Ingatkan untuk closing.
 */
export function StaleShiftBanner() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const shift = useCurrentShift();
  const settings = usePublicSettings();
  const today = settings.data?.businessDate;
  const s = shift.data;
  if (!s || !today || s.businessDate >= today) return null;
  const canClose = hasPermission(me?.permissions, 'shift.manage');
  return (
    <div
      role="alert"
      data-testid="stale-shift-banner"
      className="mx-4 flex flex-col gap-2 rounded-md bg-warning-container p-3 text-on-warning-container"
    >
      <div className="flex items-start gap-2">
        <Icon name="warning" size={22} className="mt-0.5 shrink-0" />
        <span className="text-body-medium">
          {t('cashier.staleShift', { date: formatDayLabel(s.businessDate, i18n.language as Lang) })}
        </span>
      </div>
      {canClose ? (
        <button
          type="button"
          onClick={() => navigate('/kasir/closing')}
          className="state-layer flex h-11 items-center justify-center gap-2 self-start rounded-full bg-warning px-5 text-label-large font-semibold text-on-warning"
        >
          <Icon name="lock" size={20} />
          {t('cashier.closeOldShift')}
        </button>
      ) : null}
    </div>
  );
}
