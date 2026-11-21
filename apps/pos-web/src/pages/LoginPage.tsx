import { useMutation, useQuery } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate } from 'react-router';
import type { LoginUserCard } from '@pos/shared';
import { Badge, cn, type BadgeTone } from '../components/ui';
import { api, ApiError, errorMessage, qk } from '../lib/api';
import { homePathFor, useAuthActions, useMe } from '../lib/auth';

/** Warna kartu per role (mockup Login.dc.html). */
function roleStyle(roleName: string): { avatar: string; tone: BadgeTone } {
  const n = roleName.toLowerCase();
  if (n.includes('owner') || n.includes('admin')) return { avatar: 'bg-ink', tone: 'dark' };
  if (n.includes('kasir')) return { avatar: 'bg-primary', tone: 'primary' };
  if (n.includes('dapur')) return { avatar: 'bg-[#DC6803]', tone: 'warn' };
  if (n.includes('driver')) return { avatar: 'bg-info', tone: 'info' };
  return { avatar: 'bg-muted', tone: 'neutral' };
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9'];

export default function LoginPage() {
  const { t } = useTranslation();
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
        const time = until
          ? new Date(until).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })
          : '';
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

  return (
    <div className="mx-auto flex min-h-dvh max-w-[480px] flex-col items-center gap-4 px-5 pb-6 pt-7">
      <div className="flex items-center gap-3 self-stretch">
        {settings.data?.logoUrl ? (
          <img src={settings.data.logoUrl} alt="" className="size-14 shrink-0 rounded-[14px] object-cover" />
        ) : (
          <div className="flex size-14 shrink-0 items-center justify-center rounded-[14px] border-2 border-dashed border-line-strong bg-[#F2F4F7] text-[11px] font-bold text-muted">
            LOGO
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <b className="text-[21px] leading-tight">{name}</b>
          {hours ? (
            <span className="text-sm text-muted">
              {hours.open === hours.close
                ? t('auth.open24h')
                : t('auth.openToday', { open: hours.open, close: hours.close })}
            </span>
          ) : null}
        </div>
      </div>

      <h1 className="self-start text-[17px] font-bold">{t('auth.whoIsLogging')}</h1>
      <div className="-mt-1.5 grid w-full grid-cols-2 gap-2">
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
                'flex h-[68px] items-center gap-2 rounded-[14px] px-2.5 text-left',
                active ? 'border-2 border-primary bg-primary-tint' : 'border border-line-strong bg-white',
              )}
            >
              <span
                className={cn(
                  'flex size-10 shrink-0 items-center justify-center rounded-full text-[15px] font-extrabold text-white',
                  st.avatar,
                )}
              >
                {u.initials}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className="truncate text-[15px]">{u.name}</b>
                <Badge tone={st.tone} className="self-start text-[11px]">
                  {u.roleName}
                </Badge>
              </span>
            </button>
          );
        })}
      </div>

      <b className="mt-0.5 text-[17px]">
        {selected ? t('auth.pinFor', { name: selected.name }) : t('auth.chooseUser')}
      </b>
      <div
        aria-label={t('auth.pinDots', { count: pin.length })}
        role="status"
        className="flex h-6 items-center gap-4"
      >
        {[0, 1, 2, 3].map((i) => (
          <span
            key={i}
            className={cn(
              'rounded-full',
              i < pin.length ? 'size-[22px] bg-ink' : 'size-[18px] border-[1.5px] border-[#98A2B3]',
            )}
          />
        ))}
      </div>
      {error ? (
        <p role="alert" className="-my-1 text-center text-base font-bold text-danger">
          {error}
        </p>
      ) : null}

      <div className="grid w-full grid-cols-3 gap-2.5">
        {KEYS.map((k) => (
          <button
            key={k}
            type="button"
            onClick={() => press(k)}
            className="h-16 rounded-2xl border border-line-strong bg-white text-[28px] font-bold shadow-card active:bg-bg"
          >
            {k}
          </button>
        ))}
        <button
          type="button"
          onClick={() => setPin((p) => p.slice(0, -1))}
          className="h-16 rounded-2xl border border-line-strong bg-white text-[17px] font-bold text-danger shadow-card"
        >
          {t('auth.clear')}
        </button>
        <button
          type="button"
          onClick={() => press('0')}
          className="h-16 rounded-2xl border border-line-strong bg-white text-[28px] font-bold shadow-card active:bg-bg"
        >
          0
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!selected || pin.length !== 4 || login.isPending}
          className="h-16 rounded-2xl bg-primary text-lg font-extrabold text-white disabled:bg-line-strong"
        >
          {t('auth.login')}
        </button>
      </div>
      <span className="text-center text-xs text-muted">{t('auth.shiftHint')}</span>
    </div>
  );
}
