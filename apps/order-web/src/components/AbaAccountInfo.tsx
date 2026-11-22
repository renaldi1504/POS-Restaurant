/** Rekening ABA restoran (settings.payment.aba) — nama, nomor (bisa disalin), QR opsional. */
import { useTranslation } from 'react-i18next';
import type { PublicSettingsResponse } from '@pos/shared';
import { Icon, useToast } from './ui';

export function AbaAccountInfo({ settings }: { settings: PublicSettingsResponse | undefined }) {
  const { t } = useTranslation();
  const toast = useToast();
  const aba = settings?.aba ?? null;
  if (!aba) {
    return (
      <>
        <p className="text-label-medium text-on-surface-variant">{t('web.abaNoInfo')}</p>
        {settings?.phone ? (
          <p className="text-label-medium font-medium">{t('web.abaPhone', { phone: settings.phone })}</p>
        ) : null}
      </>
    );
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(aba.accountNumber.replace(/\s+/g, ''));
      toast.success(t('web.abaCopied'));
    } catch {
      /* clipboard tidak tersedia (http / izin) — nomor tetap terlihat */
    }
  };
  return (
    <div className="flex flex-col gap-2" data-testid="aba-account">
      <dl className="flex flex-col gap-0.5 rounded-xl bg-surface-container-low px-4 py-2.5 text-label-medium">
        {aba.accountName ? (
          <>
            <dt className="text-on-surface-variant">{t('web.abaAccountName')}</dt>
            <dd className="mb-1.5 text-body-large font-medium">{aba.accountName}</dd>
          </>
        ) : null}
        <dt className="text-on-surface-variant">{t('web.abaAccountNumber')}</dt>
        <dd className="flex items-center justify-between gap-2">
          <b className="text-title-large font-bold whitespace-nowrap tabular-nums">{aba.accountNumber}</b>
          <button
            type="button"
            onClick={() => void copy()}
            className="state-layer flex min-h-12 shrink-0 items-center gap-1.5 rounded-full bg-secondary-container px-4 text-label-large text-on-secondary-container"
          >
            <Icon name="content_copy" size={18} />
            {t('web.abaCopy')}
          </button>
        </dd>
      </dl>
      {aba.qrImageUrl ? (
        <img
          src={aba.qrImageUrl}
          alt={t('web.abaQrAlt')}
          className="mx-auto size-48 rounded-md border border-outline-variant object-contain"
        />
      ) : null}
      <p className="text-label-medium text-on-surface-variant">{t('web.abaAfter')}</p>
    </div>
  );
}
