import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { Lang } from '@pos/shared';
import { useCustomer } from '../lib/customer';
import { setLang } from '../lib/i18n';
import { formatHour, useSettings } from '../lib/menu';
import { Button, Card, cn, LangSwitcher } from './ui';

/** Wadah halaman HP-first (maks 480px, tengah di layar lebar). */
export function Page({ children, testId, mode }: { children: ReactNode; testId?: string; mode?: string }) {
  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-[480px] flex-col overflow-x-hidden bg-bg"
      data-testid={testId}
      data-mode={mode}
    >
      {children}
    </div>
  );
}

export function LangPicker() {
  const { t, i18n } = useTranslation();
  return (
    <LangSwitcher compact value={i18n.language as Lang} onChange={setLang} label={t('common.language')} />
  );
}

/** Logo + nama + status buka (mockup Website header). */
export function StoreHeading() {
  const { t, i18n } = useTranslation();
  const { data: s } = useSettings();
  const name = s?.name ?? '…';
  return (
    <div className="flex min-w-[150px] grow basis-[150px] items-center gap-2.5">
      {s?.logoUrl ? (
        <img src={s.logoUrl} alt="" className="size-10 shrink-0 rounded-[10px] object-cover" />
      ) : (
        <div
          aria-hidden
          className="flex size-10 shrink-0 items-center justify-center rounded-[10px] bg-primary text-lg font-extrabold text-white"
        >
          {name.charAt(0)}
        </div>
      )}
      <div className="flex min-w-0 grow flex-col">
        <h1 className="truncate text-[17px] font-extrabold leading-tight">{name}</h1>
        {s ? (
          <span
            className={cn('truncate text-[13px] font-bold', s.isOpen ? 'text-primary' : 'text-danger')}
            data-testid="open-status"
          >
            {s.isOpen && s.hours.open === s.hours.close
              ? t('web.open24h')
              : s.isOpen
                ? t('web.openUntil', { time: formatHour(s.hours.close, i18n.language) })
                : t('web.closedOpensAt', { time: formatHour(s.hours.open, i18n.language) })}
          </span>
        ) : null}
      </div>
    </div>
  );
}

export function LoadingBlock() {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-2.5 p-4" aria-busy="true" aria-live="polite">
      <span className="sr-only">{t('common.loading')}</span>
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="h-[104px] animate-pulse rounded-[14px] bg-white shadow-card" />
      ))}
    </div>
  );
}

export function ErrorBlock({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <Card className="m-4 flex flex-col items-center gap-3 text-center" role="alert">
      <p className="text-base font-bold">{message}</p>
      {onRetry ? (
        <Button variant="outline" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </Card>
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
      <header className="flex items-center gap-2.5 border-b border-line bg-white px-4 py-3">
        <StoreHeading />
        <LangPicker />
      </header>
      <main className="flex grow flex-col items-center justify-center gap-4 p-6 text-center" role="alert">
        <div
          className="flex size-16 items-center justify-center rounded-full bg-danger-tint text-3xl font-extrabold text-danger"
          aria-hidden
        >
          !
        </div>
        <h2 className="text-xl font-extrabold">
          {qr ? t('web.qrInvalidTitle') : tg ? t('web.tgFailedTitle') : t('web.loadFailed')}
        </h2>
        {qr || tg ? (
          <p className="text-base text-muted">{qr ? t('web.qrInvalidBody') : t('web.tgFailedBody')}</p>
        ) : null}
        <div className="flex w-full flex-col gap-2">
          {!qr ? (
            <Button block onClick={retry}>
              {t('common.retry')}
            </Button>
          ) : null}
          {qr || tg ? (
            <Button block variant="outline" onClick={() => navigate('/')}>
              {t('web.continueWebsite')}
            </Button>
          ) : null}
        </div>
      </main>
    </Page>
  );
}
