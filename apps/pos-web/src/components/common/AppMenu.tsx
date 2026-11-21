/** Laci menu (☰): tujuan sesuai permission + bunyi + keluar. */
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { hasAnyPermission, type PermissionKey } from '@pos/shared';
import { IconButton, Sheet, cn } from '../ui';
import { useAuthActions, useMe } from '../../lib/auth';
import { useCurrentShift } from '../../lib/data';
import { setPrefs, usePrefs } from '../../lib/prefs';
import { Switch } from './Form';

interface Entry {
  to: string;
  key: string;
  any: PermissionKey[];
}

export const MENU_ENTRIES: Entry[] = [
  { to: '/kasir', key: 'nav.cashier', any: ['order.create'] },
  { to: '/kasir/meja', key: 'nav.tables', any: ['order.create'] },
  { to: '/kasir/online', key: 'nav.online', any: ['order.accept'] },
  { to: '/kasir/riwayat', key: 'nav.history', any: ['order.create', 'order.accept'] },
  { to: '/kasir/pengeluaran', key: 'nav.expenses', any: ['shift.manage'] },
  { to: '/kasir/closing', key: 'nav.closing', any: ['shift.manage'] },
  { to: '/dapur', key: 'nav.kitchen', any: ['kitchen.view'] },
  { to: '/driver', key: 'nav.driver', any: ['driver.deliver'] },
  { to: '/admin', key: 'nav.dashboard', any: ['reports.view'] },
  { to: '/admin/menu', key: 'nav.menu', any: ['menu.manage'] },
  { to: '/admin/promo', key: 'nav.promos', any: ['menu.manage'] },
  { to: '/admin/meja', key: 'nav.tablesQr', any: ['tables.manage'] },
  { to: '/admin/pengguna', key: 'nav.users', any: ['users.manage'] },
  { to: '/admin/settings', key: 'nav.settings', any: ['settings.manage'] },
  { to: '/printer', key: 'nav.printer', any: [] },
];

export function MenuIcon() {
  return (
    <svg
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      aria-hidden
    >
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function AppMenuSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { data: me } = useMe();
  const { logout } = useAuthActions();
  const prefs = usePrefs();
  const shift = useCurrentShift();
  const entries = MENU_ENTRIES.filter((e) => !e.any.length || hasAnyPermission(me?.permissions, e.any));
  return (
    <Sheet open={open} onClose={onClose} title={t('cashier.moreMenu')} closeLabel={t('common.close')}>
      <div className="flex flex-col gap-3 pb-2">
        <div className="rounded-xl bg-bg px-3 py-2 text-sm">
          <b className="text-base">{me?.name}</b> · {me?.role.name}
          {shift.data ? (
            <div className="text-muted">
              {t('shift.current')}: {shift.data.name} · {shift.data.user.name}
            </div>
          ) : null}
        </div>
        <nav aria-label={t('cashier.moreMenu')} className="flex flex-col">
          {entries.map((e) => {
            const active = location.pathname === e.to;
            return (
              <button
                key={e.to}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => {
                  onClose();
                  navigate(e.to);
                }}
                className={cn(
                  'flex min-h-[52px] items-center justify-between border-b border-[#F2F4F7] px-1 text-left text-base font-semibold',
                  active && 'text-primary',
                )}
              >
                <span>{t(e.key)}</span>
                <span aria-hidden>›</span>
              </button>
            );
          })}
        </nav>
        <Switch
          checked={!prefs.muted}
          onChange={(on) => setPrefs({ muted: !on })}
          label={t('kitchen.sound')}
          description={prefs.muted ? t('kitchen.soundOff') : t('kitchen.soundOn')}
        />
        <button
          type="button"
          onClick={() => void logout()}
          className="min-h-12 rounded-xl border-2 border-[#F04438] bg-white text-base font-extrabold text-danger"
        >
          {t('common.logout')}
        </button>
      </div>
    </Sheet>
  );
}

export function AppMenuButton({ onClick }: { onClick: () => void }) {
  const { t } = useTranslation();
  return (
    <IconButton label={t('cashier.moreMenu')} onClick={onClick}>
      <MenuIcon />
    </IconButton>
  );
}
