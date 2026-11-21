import { useTranslation } from 'react-i18next';
import { Button, Icon } from '../ui';
import { errorMessage } from '../../lib/api';

/** Indikator progres melingkar M3. */
export function Spinner({ className = 'size-6' }: { className?: string }) {
  return (
    <span
      role="progressbar"
      aria-label="Memuat"
      className={`inline-block animate-spin rounded-full border-4 border-secondary-container border-t-primary ${className}`}
    />
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-on-surface-variant" role="status">
      <Spinner className="size-10" />
      <span className="text-body-large">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-md bg-error-container px-4 py-6 text-center text-on-error-container"
    >
      <Icon name="error" size={32} />
      <p className="text-body-large">{errorMessage(error, t)}</p>
      {onRetry ? (
        <Button variant="outlined" size="md" icon="refresh" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
