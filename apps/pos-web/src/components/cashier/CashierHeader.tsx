import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { hasPermission } from '@pos/shared';
import { IconButton } from '../ui';
import { useMe } from '../../lib/auth';
import { useOnlineAlarm } from '../../lib/online';

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
