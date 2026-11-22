import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { openPeriods, type Lang } from '@pos/shared';
import { useCustomer } from '../lib/customer';
import { setLang } from '../lib/i18n';
import { currentClose, formatHour, reopenTime, sessionsText, useSettings } from '../lib/menu';
import { Button, cn, Icon, LangSwitcher } from './ui';

/**
 * Wadah halaman HP-first. Tablet: alur fokus (keranjang, checkout, status) di tengah maks 640px;
 * `wide` (menu) memakai lebar hingga 1280px (grid 2→3→4 kolom + panel keranjang).
 */
export function Page({
  children,
  testId,
  mode,
  wide,
}: {
  children: ReactNode;
  testId?: string;
  mode?: string;
  wide?: boolean;
}) {
  return (
    <div
      className={cn(
        'mx-auto flex min-h-dvh w-full flex-col overflow-x-clip bg-surface',
        wide ? 'max-w-[1280px]' : 'max-w-[640px]',
      )}
      data-testid={testId}
      data-mode={mode}
    >
      {children}
    </div>
  );
}

export function LangPicker({ onBrand }: { onBrand?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  return (
    <LangSwitcher
      compact
      tone={onBrand ? 'onBrand' : 'default'}
      value={i18n.language as Lang}
      onChange={setLang}
      label={t('common.language')}
    />
  );
}

function useOpenText() {
  const { t, i18n } = useTranslation();
  const { data: s } = useSettings();
  if (!s) return null;
  const single = openPeriods(s.hours).length === 1;
  return s.isOpen && single && s.hours.open === s.hours.close
    ? t('web.open24h')
    : s.isOpen
      ? t('web.openUntil', { time: formatHour(currentClose(s.hours), i18n.language) })
      : t('web.closedOpensAt', { time: formatHour(reopenTime(s.hours), i18n.language) });
}

function StoreLogo({ className }: { className?: string }) {
  const { data: s } = useSettings();
  const name = s?.name ?? '…';
  return s?.logoUrl ? (
    <img src={s.logoUrl} alt="" className={cn('shrink-0 rounded-full object-cover', className)} />
  ) : (
    <div
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center rounded-full bg-primary-container font-display text-on-primary-container',
        className,
      )}
    >
      {name.charAt(0)}
    </div>
  );
}

/** Pil status buka (titik + teks); hijau saat buka, merah saat tutup. */
function OpenPill() {
  const { data: s } = useSettings();
  const text = useOpenText();
  if (!s || !text) return <span className="skeleton h-7 w-28 rounded-full" />;
  return (
    <span
      className={cn(
        'inline-flex min-w-0 items-center gap-1.5 rounded-full py-1 pl-2 pr-3 text-label-medium',
        s.isOpen
          ? 'bg-primary-container/60 text-on-primary-container'
          : 'bg-error-container text-on-error-container',
      )}
      data-testid="open-status"
    >
      <span
        aria-hidden
        className={cn('size-2 shrink-0 rounded-full', s.isOpen ? 'bg-primary' : 'bg-error')}
      />
      <span className="truncate">{text}</span>
    </span>
  );
}

/**
 * Kepala toko di menu: pita sampul hijau tua bermotif kawung (pilih bahasa di kanan atas), logo menumpang
 * di tepi pita, nama toko besar + status buka + alamat singkat.
 */
export function StoreHero() {
  const { t, i18n } = useTranslation();
  const { data: s } = useSettings();
  const name = s?.name ?? '';
  return (
    <div className="relative">
      <div className="relative isolate h-28 overflow-hidden bg-brand-deep text-on-primary">
        <span aria-hidden className="absolute inset-0 -z-10 bg-linear-to-br from-primary to-brand-deep" />
        <span aria-hidden className="motif-kawung absolute inset-0 -z-10 opacity-[0.12]" />
        <div className="flex justify-end px-3 pt-3">
          <LangPicker onBrand />
        </div>
      </div>
      <div className="relative -mt-6 rounded-t-xl bg-surface px-4 pt-3">
        <StoreLogo className="absolute -top-8 left-4 size-16 text-headline-small ring-4 ring-surface" />
        <div className="flex flex-col gap-1.5 pt-7">
          {s ? (
            <h1 className="font-display text-[1.75rem] leading-[2.125rem]">{name}</h1>
          ) : (
            <span className="skeleton h-8 w-56 rounded-md" />
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
            <OpenPill />
            {s && sessionsText(s.hours, i18n.language) ? (
              <span
                className="flex min-w-0 items-center gap-1 text-label-medium text-on-surface-variant"
                data-testid="open-sessions"
              >
                <Icon name="schedule" size={16} />
                <span className="truncate">
                  {t('web.hoursSessions', { sessions: sessionsText(s.hours, i18n.language) })}
                </span>
              </span>
            ) : null}
            {s?.address ? (
              <span className="flex min-w-0 items-center gap-1 text-label-medium text-on-surface-variant">
                <Icon name="location_on" size={16} />
                <span className="truncate">{s.address}</span>
              </span>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** Logo + nama + status buka versi ringkas (layar error sesi). */
export function StoreHeading() {
  const { data: s } = useSettings();
  const name = s?.name ?? '…';
  return (
    <div className="flex min-w-[150px] grow basis-[150px] items-center gap-3">
      <StoreLogo className="size-11 text-title-large" />
      <div className="flex min-w-0 grow flex-col items-start gap-0.5">
        <h1 className="max-w-full truncate font-display text-title-large">{name}</h1>
        <OpenPill />
      </div>
    </div>
  );
}

/** Skeleton kartu menu (menggantikan spinner saat memuat). */
export function MenuSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <span className="skeleton h-7 w-40 rounded-md" />
      <div className="-mx-4 flex gap-3 overflow-hidden px-4">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex w-[172px] shrink-0 flex-col overflow-hidden rounded-2xl bg-surface-container-lowest shadow-card"
          >
            <span className="skeleton aspect-[4/3] w-full" />
            <div className="flex flex-col gap-2 p-3">
              <span className="skeleton h-5 w-28 rounded-sm" />
              <span className="skeleton h-5 w-16 rounded-sm" />
              <span className="skeleton mt-1 h-12 w-full rounded-full" />
            </div>
          </div>
        ))}
      </div>
      <span className="skeleton mt-3 h-7 w-32 rounded-md" />
      {Array.from({ length: rows }, (_, i) => (
        <div
          key={i}
          className="flex flex-col gap-2 rounded-2xl bg-surface-container-lowest p-3 pl-4 shadow-card"
        >
          <div className="flex gap-3">
            <div className="flex grow flex-col gap-2 pt-1">
              <span className="skeleton h-5 w-3/5 rounded-sm" />
              <span className="skeleton h-4 w-4/5 rounded-sm" />
            </div>
            <span className="skeleton size-[92px] rounded-lg" />
          </div>
          <div className="flex items-center justify-between">
            <span className="skeleton h-5 w-20 rounded-sm" />
            <span className="skeleton h-12 w-28 rounded-full" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Pemuatan umum: skeleton kartu (halaman status, tagihan, fallback rute). */
export function LoadingBlock({ variant = 'cards' }: { variant?: 'cards' | 'menu' }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-3 p-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t('common.loading')}</span>
      {variant === 'menu' ? (
        <MenuSkeleton />
      ) : (
        <>
          <span className="skeleton h-28 rounded-2xl" aria-hidden />
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex flex-col gap-2 rounded-2xl bg-surface-container-lowest p-4 shadow-card"
              aria-hidden
            >
              <span className="skeleton h-5 w-1/2 rounded-sm" />
              <span className="skeleton h-4 w-4/5 rounded-sm" />
              <span className="skeleton h-4 w-2/3 rounded-sm" />
            </div>
          ))}
        </>
      )}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      className="m-4 flex flex-col items-center gap-3 rounded-2xl bg-surface-container-lowest p-6 text-center shadow-card"
      role="alert"
    >
      <span
        aria-hidden
        className="flex size-16 items-center justify-center rounded-full bg-error-container text-on-error-container"
      >
        <Icon name="wifi_off" size={32} />
      </span>
      <p className="text-title-medium">{message}</p>
      {onRetry ? (
        <Button variant="tonal" icon="refresh" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}

/** Layar error sesi: QR meja tidak berlaku / login Telegram gagal / jaringan. */
export function BootErrorScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { errorKind, retry } = useCustomer();
  const qr = errorKind === 'qr_invalid';
  const tg = errorKind === 'tg_failed';
  return (
    <Page testId="boot-error">
      <header className="flex flex-wrap items-center gap-3 bg-surface px-4 py-3">
        <StoreHeading />
        <LangPicker />
      </header>
      <main className="flex grow flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
        <div
          className="flex size-20 items-center justify-center rounded-full bg-error-container text-on-error-container"
          aria-hidden
        >
          <Icon name={qr ? 'qr_code_2' : 'error'} size={40} />
        </div>
        <h2 className="text-headline-small">
          {qr ? t('web.qrInvalidTitle') : tg ? t('web.tgFailedTitle') : t('web.loadFailed')}
        </h2>
        {qr || tg ? (
          <p className="text-body-medium text-on-surface-variant">
            {qr ? t('web.qrInvalidBody') : t('web.tgFailedBody')}
          </p>
        ) : null}
        <div className="flex w-full flex-col gap-2">
          {!qr ? (
            <Button block onClick={retry}>
              {t('common.retry')}
            </Button>
          ) : null}
          {qr || tg ? (
            <Button block variant="outlined" onClick={() => navigate('/')}>
              {t('web.continueWebsite')}
            </Button>
          ) : null}
        </div>
      </main>
    </Page>
  );
}
