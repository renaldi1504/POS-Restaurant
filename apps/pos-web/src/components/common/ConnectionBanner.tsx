import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { applyUpdate, useUpdateAvailable } from '../../lib/appUpdate';
import { useMe } from '../../lib/auth';
import { useSocketStatus } from '../../lib/socket';

/**
 * Pita kecil di atas layar saat koneksi realtime putus > 3 dtk (server restart / internet putus).
 * Setelah tersambung lagi, data disinkron ulang otomatis (useResync di RealtimeBridge).
 */
export function ConnectionBanner() {
  const { data: me } = useMe();
  const { connected } = useSocketStatus();
  const { t } = useTranslation();
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!me || connected) {
      setShow(false);
      return;
    }
    const id = window.setTimeout(() => setShow(true), 3000);
    return () => window.clearTimeout(id);
  }, [me, connected]);
  if (!show) return null;
  return (
    <div
      role="status"
      data-testid="connection-banner"
      className="fixed inset-x-0 top-0 z-50 bg-warning-container px-3 py-1 text-center text-label-medium font-medium text-on-surface"
    >
      {t('common.reconnecting')}
    </div>
  );
}

/** Versi baru sudah dipasang di server tapi layar ini masih versi lama (sedang sibuk, tidak dimuat ulang otomatis). */
export function UpdateBanner() {
  const { t } = useTranslation();
  const available = useUpdateAvailable();
  if (!available) return null;
  return (
    <div
      role="status"
      data-testid="update-banner"
      className="fixed inset-x-3 bottom-24 z-50 mx-auto flex max-w-md items-center gap-3 rounded-md bg-inverse-surface px-4 py-2 text-inverse-on-surface shadow-e3"
    >
      <span className="grow text-body-medium">{t('common.updateAvailable')}</span>
      <button
        type="button"
        onClick={() => void applyUpdate()}
        className="state-layer h-10 shrink-0 rounded-full px-3 text-label-large font-semibold text-inverse-primary"
      >
        {t('common.reloadNow')}
      </button>
    </div>
  );
}
