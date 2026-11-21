import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { hasPermission } from '@pos/shared';
import { IconButton } from '../ui';
import { AppMenuButton, AppMenuSheet } from '../common';
import { useMe } from '../../lib/auth';
import { useOnlineAlarm } from '../../lib/online';

export function TablesIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </svg>
  );
}

export function BellIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

/** Tombol header kasir: Denah meja, bel order online (badge + bunyi), menu ☰. */
export function CashierActions({ onOnlineScreen = false, extra }: { onOnlineScreen?: boolean; extra?: ReactNode }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { data: me } = useMe();
  const [menuOpen, setMenuOpen] = useState(false);
  const { count } = useOnlineAlarm(onOnlineScreen);
  const canAccept = hasPermission(me?.permissions, 'order.accept');
  return (
    <>
      {extra}
      {hasPermission(me?.permissions, 'order.create') ? (
        <IconButton label={t('cashier.tables')} onClick={() => navigate('/kasir/meja')}>
          <TablesIcon />
        </IconButton>
      ) : null}
      {canAccept ? (
        <IconButton
          label={count ? t('cashier.onlineNew', { count }) : t('cashier.onlineOrders')}
          badge={count || undefined}
          tone={count ? 'warn' : 'default'}
          onClick={() => navigate('/kasir/online')}
        >
          <BellIcon />
        </IconButton>
      ) : null}
      <AppMenuButton onClick={() => setMenuOpen(true)} />
      <AppMenuSheet open={menuOpen} onClose={() => setMenuOpen(false)} />
    </>
  );
}
