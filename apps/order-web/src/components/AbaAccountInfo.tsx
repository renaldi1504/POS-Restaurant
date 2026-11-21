/** Rekening ABA restoran (settings.payment.aba) — nama, nomor (bisa disalin), QR opsional. */
import { useTranslation } from 'react-i18next';
import type { PublicSettingsResponse } from '@pos/shared';
import { useToast } from './ui';

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
      <dl className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-1 text-label-medium">
        {aba.accountName ? (
          <>
            <dt className="text-on-surface-variant">{t('web.abaAccountName')}</dt>
            <dd className="font-medium">{aba.accountName}</dd>
          </>
        ) : null}
        <dt className="text-on-surface-variant">{t('web.abaAccountNumber')}</dt>
        <dd className="flex items-center justify-between gap-2">
          <b className="text-title-medium tabular-nums">{aba.accountNumber}</b>
          <button
            type="button"
            onClick={() => void copy()}
            className="min-h-10 rounded-sm border border-outline-variant px-3 text-label-medium font-medium"
          >
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
