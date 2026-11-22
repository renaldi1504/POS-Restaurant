/**
 * Navigation bar M3 adaptif (SKILL §8): 4 tujuan yang paling sering dipakai user + "Lainnya".
 * Logika murni ada di lib/navUsage.ts; file ini hanya state sesi (urutan stabil), badge, dan tampilan.
 */
import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { hasPermission, type PermissionKey, type StaffUser } from '@pos/shared';
import { Button, CountBadge, Icon, IconButton, Sheet, Switch, cn, useToast } from '../ui';
import { InstallAppButton } from './InstallAppButton';
import { LangPicker } from './LangPicker';
import { api, qk } from '../../lib/api';
import { useAuthActions, useMe } from '../../lib/auth';
import { useCurrentShift } from '../../lib/data';
import { roleLabel } from '../../lib/labels';
import {
  MAX_PINS,
  MENU_ENTRIES,
  allowedEntries,
  computeSlots,
  loadUsage,
  navVisible,
  recordNavigation,
  saveUsage,
  togglePin,
  withCurrent,
  type NavEntry,
} from '../../lib/navUsage';
import { sessionSlotsFor, setSessionSlots, useNavSessionVersion } from '../../lib/navSession';
import { usePendingOnline } from '../../lib/online';
import { setPrefs, usePrefs } from '../../lib/prefs';

let lastRecordedKey: string | null = null;

/** Label navigasi mengikuti bahasa layar (mis. layar dapur/driver dengan bahasa sendiri per perangkat). */
function useNavT(lang?: string) {
  const { t, i18n } = useTranslation();
  return useMemo(() => (lang ? i18n.getFixedT(lang) : t), [lang, i18n, t]);
}

/** Pasang sekali di root: catat setiap navigasi ke tujuan utama (per user, localStorage). */
export function NavUsageTracker() {
  const location = useLocation();
  const { data: me } = useMe();
  useEffect(() => {
    if (!me) {
      lastRecordedKey = null;
      return;
    }
    if (lastRecordedKey === location.key) return;
    lastRecordedKey = location.key;
    saveUsage(me.id, recordNavigation(loadUsage(me.id), location.pathname));
  }, [me, location.key, location.pathname]);
  return null;
}

/** Model navigasi untuk layar saat ini. */
export function useNavModel(activePath?: string) {
  const { data: me } = useMe();
  const location = useLocation();
  useNavSessionVersion();
  const perms = me?.permissions;
  const pathname = activePath ?? location.pathname;
  const visible = !!me && navVisible(pathname, perms);
  const slots = me ? withCurrent(sessionSlotsFor(me), pathname, perms) : [];
  const entries = slots.map((p) => MENU_ENTRIES.find((e) => e.to === p)!).filter(Boolean);
  return { me, visible, entries, pathname };
}

/** Pin / lepas pin dari lembar Lainnya (langsung disimpan & slot dihitung ulang — aksi sadar user). */
function usePins(me: StaffUser | null | undefined) {
  useNavSessionVersion();
  const pins = me ? loadUsage(me.id).pins : [];
  const toggle = (path: string): boolean => {
    if (!me) return false;
    const r = togglePin(loadUsage(me.id), path);
    if (r.full) return false;
    saveUsage(me.id, r.state);
    setSessionSlots(me.id, computeSlots(r.state, me.permissions));
    return true;
  };
  return { pins, toggle };
}

/** Jumlah badge per tujuan: order online baru, meja (pesanan QR / minta bill), siap diantar. */
function useNavBadges(perms: readonly PermissionKey[] | undefined): Record<string, number> {
  const online = usePendingOnline();
  const tables = useQuery({
    queryKey: qk.tables,
    queryFn: () => api.call('tablesList'),
    enabled: hasPermission(perms, 'order.create'),
    refetchInterval: 60_000,
  });
  const driver = useQuery({
    queryKey: qk.driverAvailable,
    queryFn: () => api.call('driverAvailable'),
    enabled: hasPermission(perms, 'driver.deliver'),
    refetchInterval: 30_000,
  });
  return {
    '/kasir/online': online.data?.length ?? 0,
    '/kasir/meja':
      tables.data?.tables.filter((x) => x.active && (x.status === 'qr_new' || x.status === 'bill_requested'))
        .length ?? 0,
    '/driver': driver.data?.orders.length ?? 0,
  };
}

/** Navigation bar bawah (HP, 80px + safe area). Tidak tampil di layar detail / alur fokus. */
export function NavigationBar({ activePath, lang }: { activePath?: string; lang?: string }) {
  const model = useNavModel(activePath);
  if (!model.visible || !model.me) return null;
  return <NavigationBarInner me={model.me} entries={model.entries} pathname={model.pathname} lang={lang} />;
}

/** Navigation rail kiri (tablet, 80px): tujuan, urutan, pin & badge sama dengan bar bawah. */
export function NavigationRail({ activePath, lang }: { activePath?: string; lang?: string }) {
  const model = useNavModel(activePath);
  if (!model.visible || !model.me) return null;
  return <NavigationRailInner me={model.me} entries={model.entries} pathname={model.pathname} lang={lang} />;
}

function NavigationRailInner({
  me,
  entries,
  pathname,
  lang,
}: {
  me: StaffUser;
  entries: NavEntry[];
  pathname: string;
  lang?: string;
}) {
  const t = useNavT(lang);
  const [moreOpen, setMoreOpen] = useState(false);
  const badges = useNavBadges(me.permissions);
  const hiddenBadge = allowedEntries(me.permissions).some(
    (e) => !entries.includes(e) && (badges[e.to] ?? 0) > 0,
  );
  return (
    <>
      <nav
        aria-label={t('bnav.navLabel')}
        data-testid="navigation-rail"
        className="flex w-20 shrink-0 flex-col items-center gap-1 overflow-y-auto bg-surface pb-4 pl-[env(safe-area-inset-left)] pt-6"
      >
        <ul className="flex w-full flex-col gap-3">
          {entries.map((e) => {
            const active = pathname === e.to;
            const count = badges[e.to] ?? 0;
            const full = t(e.key);
            return (
              <li key={e.to}>
                <Link
                  to={e.to}
                  aria-current={active ? 'page' : undefined}
                  aria-label={count ? t('bnav.badge', { label: full, count }) : full}
                  title={full}
                  className="group/nav flex min-h-14 flex-col items-center justify-center gap-1 px-1 outline-none"
                >
                  <NavIcon icon={e.icon} active={active} count={count} rail />
                  <span
                    className={cn(
                      'block max-w-full truncate text-label-medium',
                      active ? 'font-semibold text-on-surface' : 'text-on-surface-variant',
                    )}
                  >
                    {t(e.short)}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="grow" />
        <button
          type="button"
          aria-haspopup="dialog"
          aria-label={t('bnav.more')}
          onClick={() => setMoreOpen(true)}
          className="group/nav flex min-h-14 w-full flex-col items-center justify-center gap-1 px-1 outline-none"
        >
          <NavIcon icon="apps" active={false} dot={hiddenBadge} rail />
          <span className="block max-w-full truncate text-label-medium text-on-surface-variant">
            {t('bnav.more')}
          </span>
        </button>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} badges={badges} lang={lang} />
    </>
  );
}

function NavigationBarInner({
  me,
  entries,
  pathname,
  lang,
}: {
  me: StaffUser;
  entries: NavEntry[];
  pathname: string;
  lang?: string;
}) {
  const t = useNavT(lang);
  const [moreOpen, setMoreOpen] = useState(false);
  const badges = useNavBadges(me.permissions);
  const hiddenBadge = allowedEntries(me.permissions).some(
    (e) => !entries.includes(e) && (badges[e.to] ?? 0) > 0,
  );
  return (
    <>
      <nav
        aria-label={t('bnav.navLabel')}
        data-testid="navigation-bar"
        className="shrink-0 bg-surface-container pb-[env(safe-area-inset-bottom)]"
      >
        <ul
          className="grid h-20"
          style={{ gridTemplateColumns: `repeat(${entries.length + 1}, minmax(0, 1fr))` }}
        >
          {entries.map((e) => {
            const active = pathname === e.to;
            const count = badges[e.to] ?? 0;
            const full = t(e.key);
            return (
              <li key={e.to} className="min-w-0">
                <Link
                  to={e.to}
                  aria-current={active ? 'page' : undefined}
                  aria-label={count ? t('bnav.badge', { label: full, count }) : full}
                  title={full}
                  className="group/nav flex h-full flex-col items-center justify-center gap-1 px-0.5 outline-none"
                >
                  <NavIcon icon={e.icon} active={active} count={count} />
                  <span
                    className={cn(
                      'block max-w-full truncate text-label-medium',
                      active ? 'font-semibold text-on-surface' : 'text-on-surface-variant',
                    )}
                  >
                    {t(e.short)}
                  </span>
                </Link>
              </li>
            );
          })}
          <li className="min-w-0">
            <button
              type="button"
              aria-haspopup="dialog"
              aria-label={t('bnav.more')}
              onClick={() => setMoreOpen(true)}
              className="group/nav flex h-full w-full flex-col items-center justify-center gap-1 px-0.5 outline-none"
            >
              <NavIcon icon="apps" active={false} dot={hiddenBadge} />
              <span className="block max-w-full truncate text-label-medium text-on-surface-variant">
                {t('bnav.more')}
              </span>
            </button>
          </li>
        </ul>
      </nav>
      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} badges={badges} lang={lang} />
    </>
  );
}

function NavIcon({
  icon,
  active,
  count = 0,
  dot,
  rail,
}: {
  icon: NavEntry['icon'];
  active: boolean;
  count?: number;
  dot?: boolean;
  rail?: boolean;
}) {
  return (
    <span
      className={cn(
        rail ? 'w-14' : 'w-16',
        'relative flex h-8 items-center justify-center rounded-lg transition-colors duration-200 ease-standard',
        'group-focus-visible/nav:outline-3 group-focus-visible/nav:outline-offset-2 group-focus-visible/nav:outline-secondary',
        active
          ? 'bg-secondary-container text-on-secondary-container'
          : 'text-on-surface-variant group-hover/nav:bg-on-surface/8 group-active/nav:bg-on-surface/10',
      )}
    >
      <Icon name={icon} filled={active} />
      {count > 0 ? (
        <CountBadge count={count} className={cn('absolute -top-1', rail ? 'left-[32px]' : 'left-[38px]')} />
      ) : null}
      {dot && !count ? (
        <span className="absolute left-[40px] top-0.5 size-2 rounded-full bg-error" aria-hidden />
      ) : null}
    </span>
  );
}

/**
 * Lembar "Lainnya": profil & shift, semua menu yang diizinkan (dengan tombol sematkan), bunyi, keluar.
 * Juga dipakai layar dapur/driver bila bar bawah tidak tampil.
 */
export function MoreSheet({
  open,
  onClose,
  badges = {},
  lang,
}: {
  open: boolean;
  onClose: () => void;
  badges?: Record<string, number>;
  lang?: string;
}) {
  const t = useNavT(lang);
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const toast = useToast();
  const { data: me } = useMe();
  const { logout } = useAuthActions();
  const prefs = usePrefs();
  const shift = useCurrentShift();
  const { pins, toggle } = usePins(me);
  const entries = allowedEntries(me?.permissions);
  const full = pins.length >= MAX_PINS;
  return (
    <Sheet open={open} onClose={onClose} title={t('bnav.more')} closeLabel={t('common.close')}>
      <div className="flex flex-col gap-4 pb-2">
        <div className="flex items-center gap-4 rounded-md bg-surface-container-low px-4 py-3">
          <span
            aria-hidden
            className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary-container text-title-medium text-on-primary-container"
          >
            {me?.name.slice(0, 1).toUpperCase()}
          </span>
          <div className="flex min-w-0 flex-col">
            <span className="truncate text-title-medium">{me?.name}</span>
            <span className="truncate text-body-medium text-on-surface-variant">
              {me ? roleLabel(me.role.name, t) : ''}
              {shift.data ? ` · ${t('bnav.shift')}: ${shift.data.name} · ${shift.data.user.name}` : ''}
            </span>
          </div>
        </div>

        <nav aria-label={t('bnav.allMenu')} className="flex flex-col">
          <h3 className="px-4 pb-1 text-label-large text-on-surface-variant">{t('bnav.allMenu')}</h3>
          {entries.map((e) => {
            const active = pathname === e.to;
            const pinned = pins.includes(e.to);
            const label = t(e.key);
            const count = badges[e.to] ?? 0;
            return (
              <div
                key={e.to}
                className={cn('flex items-center rounded-full', active && 'bg-secondary-container')}
              >
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => {
                    onClose();
                    navigate(e.to);
                  }}
                  className="state-layer flex min-h-14 min-w-0 grow items-center gap-3 rounded-full pl-4 pr-2 text-left"
                >
                  <Icon
                    name={e.icon}
                    filled={active}
                    className={active ? 'text-on-secondary-container' : 'text-on-surface-variant'}
                  />
                  <span className="min-w-0 grow truncate text-label-large">{label}</span>
                  {count > 0 ? <CountBadge count={count} /> : null}
                </button>
                <IconButton
                  icon={pinned ? 'keep_off' : 'keep'}
                  selected={pinned}
                  aria-pressed={pinned}
                  label={pinned ? t('bnav.unpin', { label }) : t('bnav.pin', { label })}
                  disabled={!pinned && full}
                  className={pinned ? 'text-primary' : undefined}
                  onClick={() => {
                    if (toggle(e.to))
                      toast.show(pinned ? t('bnav.unpinned', { label }) : t('bnav.pinned', { label }));
                  }}
                />
              </div>
            );
          })}
          <p className="px-4 pt-1 text-body-medium text-on-surface-variant">
            {full ? t('bnav.pinFull') : t('bnav.pinHint')}
          </p>
        </nav>

        <div className="rounded-md bg-surface-container-low px-4 py-3">
          <LangPicker hint={t('langx.hint')} />
        </div>
        <div className="rounded-md bg-surface-container-low px-4">
          <Switch
            checked={!prefs.muted}
            onChange={(on) => setPrefs({ muted: !on })}
            label={t('kitchen.sound')}
            description={prefs.muted ? t('kitchen.soundOff') : t('kitchen.soundOn')}
          />
        </div>
        <InstallAppButton />
        <Button
          variant="outlined"
          icon="logout"
          className="border-error text-error"
          onClick={() => void logout()}
        >
          {t('common.logout')}
        </Button>
      </div>
    </Sheet>
  );
}

/** Tombol "Lainnya" untuk header layar penuh (dapur/driver) saat bar bawah tidak tampil. */
export function MoreButton({ lang }: { lang?: string }) {
  const t = useNavT(lang);
  const [open, setOpen] = useState(false);
  const { visible } = useNavModel();
  if (visible) return null;
  return (
    <>
      <IconButton icon="apps" label={t('bnav.more')} onClick={() => setOpen(true)} />
      <MoreSheet open={open} onClose={() => setOpen(false)} lang={lang} />
    </>
  );
}
