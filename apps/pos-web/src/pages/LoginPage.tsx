import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import type { LoginUserCard } from '@pos/shared';
import { Badge, Icon, LangSwitcher, cn, type BadgeTone } from '../components/ui';
import { PinDots } from '../components/common/Dialogs';
import { api, ApiError, errorMessage, qk } from '../lib/api';
import { homePathFor, useAuthActions, useMe } from '../lib/auth';
import { formatTime } from '../lib/format';
import { roleLabel } from '../lib/labels';
import { useChangeLang, useLang } from '../lib/useLang';

/** Warna kartu per role (mockup Login.dc.html). */
function roleStyle(roleName: string): { avatar: string; tone: BadgeTone } {
  const n = roleName.toLowerCase();
  if (n.includes('owner') || n.includes('admin'))
    return { avatar: 'bg-inverse-surface text-inverse-on-surface', tone: 'dark' };
  if (n.includes('kasir')) return { avatar: 'bg-primary text-on-primary', tone: 'primary' };
  if (n.includes('dapur')) return { avatar: 'bg-warning text-on-warning', tone: 'warn' };
  if (n.includes('driver')) return { avatar: 'bg-tertiary text-on-tertiary', tone: 'info' };
  return { avatar: 'bg-on-surface-variant text-surface', tone: 'neutral' };
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function LoginPage() {
  const { t } = useTranslation();
  const lang = useLang();
  const changeLang = useChangeLang();
  const { data: me } = useMe();
  const { onLoggedIn } = useAuthActions();
  const [selected, setSelected] = useState<LoginUserCard | null>(null);
  const [pin, setPin] = useState('');
  const [error, setError] = useState<string | null>(null);

  const users = useQuery({ queryKey: qk.loginUsers, queryFn: () => api.call('authUsers') });
  // Settings publik untuk nama & jam buka (boleh gagal → pakai default).
  const settings = useQuery({
    queryKey: qk.publicSettings,
    queryFn: () => api.call('publicSettings'),
    retry: false,
  });

  const login = useMutation({
    mutationFn: (vars: { userId: number; pin: string }) => api.call('authPin', { body: vars }),
    onSuccess: (res) => onLoggedIn(res.user),
    onError: (err) => {
      setPin('');
      if (err instanceof ApiError && err.code === 'PIN_INVALID') {
        const left = (err.details as { remainingAttempts?: number } | undefined)?.remainingAttempts;
        setError(left !== undefined ? t('auth.wrongPin', { count: left }) : t('errors.PIN_INVALID'));
      } else if (err instanceof ApiError && err.code === 'PIN_LOCKED') {
        const until = (err.details as { lockedUntil?: string } | undefined)?.lockedUntil;
        const time = until ? formatTime(until, lang) : '';
        setError(t('auth.locked', { time }));
      } else setError(errorMessage(err, t));
    },
  });

  const press = (d: string) => {
    setError(null);
    setPin((p) => (p.length < 4 ? p + d : p));
  };
  const submit = () => {
    if (!selected) return setError(t('auth.chooseUser'));
    if (pin.length === 4) login.mutate({ userId: selected.id, pin });
  };

  // Keyboard fisik (desktop/tablet).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (/^\d$/.test(e.key)) press(e.key);
      else if (e.key === 'Backspace') setPin((p) => p.slice(0, -1));
      else if (e.key === 'Enter') submit();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  if (me) return <Navigate to={homePathFor(me.permissions)} replace />;

  const name = settings.data?.name ?? t('common.appName');
  const hours = settings.data?.hours;

  const key =
    'state-layer flex h-16 items-center justify-center rounded-full bg-surface-container-highest text-headline-medium text-on-surface';
  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col gap-4 px-4 pb-6 pt-6 expanded:grid expanded:max-w-[1000px] expanded:grid-cols-2 expanded:content-center expanded:gap-x-12 expanded:px-8">
      <div className="flex flex-col gap-4">
        <div className="flex items-center gap-4 text-center">
          {settings.data?.logoUrl ? (
            <img src={settings.data.logoUrl} alt="" className="size-14 shrink-0 rounded-lg object-cover" />
          ) : (
            <span className="flex size-14 shrink-0 items-center justify-center rounded-lg bg-primary-container text-on-primary-container">
              <Icon name="storefront" size={32} />
            </span>
          )}
          <div className="flex min-w-0 flex-col items-start gap-0.5">
            <b className="text-title-large">{name}</b>
            {hours ? (
              <span className="flex items-center gap-1 text-body-medium text-on-surface-variant">
                <Icon name="schedule" size={18} />
                {hours.open === hours.close
                  ? t('auth.open24h')
                  : t('auth.openToday', { open: hours.open, close: hours.close })}
              </span>
            ) : null}
          </div>
        </div>

        <LangSwitcher
          block
          compact
          label={t('langx.loginHint')}
          value={lang}
          onChange={(l) => void changeLang(l)}
        />

        <h1 className="text-title-medium">{t('auth.whoIsLogging')}</h1>
        <div className="grid w-full grid-cols-2 gap-2">
          {users.data?.users.map((u) => {
            const st = roleStyle(u.roleName);
            const active = selected?.id === u.id;
            return (
              <button
                key={u.id}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  setSelected(u);
                  setPin('');
                  setError(null);
                }}
                className={cn(
                  'state-layer flex min-h-[72px] items-center gap-3 rounded-md px-3 text-left',
                  active
                    ? 'bg-secondary-container text-on-secondary-container outline-2 outline-primary'
                    : 'bg-surface-container-low',
                )}
              >
                <span
                  className={cn(
                    'flex size-10 shrink-0 items-center justify-center rounded-full text-label-large',
                    st.avatar,
                  )}
                >
                  {u.initials}
                </span>
                <span className="flex min-w-0 flex-col gap-1">
                  <b className="truncate text-title-medium">{u.name}</b>
                  <Badge tone={st.tone} className="self-start">
                    {roleLabel(u.roleName, t)}
                  </Badge>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col items-center gap-4">
        <b className="mt-1 text-title-medium">
          {selected ? t('auth.pinFor', { name: selected.name }) : t('auth.chooseUser')}
        </b>
        <PinDots count={pin.length} label={t('auth.pinDots', { count: pin.length })} />
        {error ? (
          <p role="alert" className="-my-1 flex items-center gap-1 text-center text-body-medium text-error">
            <Icon name="error" size={20} />
            {error}
          </p>
        ) : null}

        <div className="grid w-full grid-cols-3 gap-3">
          {KEYS.map((k) => (
            <button key={k} type="button" onClick={() => press(k)} className={key}>
              {k}
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPin((p) => p.slice(0, -1))}
            className="state-layer flex h-16 items-center justify-center rounded-full text-label-large text-error"
          >
            {t('auth.clear')}
          </button>
          <button type="button" onClick={() => press('0')} className={key}>
            0
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={!selected || pin.length !== 4 || login.isPending}
            className="state-layer flex h-16 items-center justify-center rounded-full bg-primary text-title-medium text-on-primary disabled:bg-on-surface/12 disabled:text-on-surface/38"
          >
            {t('auth.login')}
          </button>
        </div>
        <span className="text-center text-body-medium text-on-surface-variant">{t('auth.shiftHint')}</span>
      </div>
    </div>
  );
}
