import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
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
      className="fixed inset-x-0 top-0 z-50 bg-warn px-3 py-1 text-center text-sm font-bold text-ink"
    >
      {t('common.reconnecting')}
    </div>
  );
}
