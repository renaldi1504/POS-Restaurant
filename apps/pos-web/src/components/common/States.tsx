import { useTranslation } from 'react-i18next';
import { Button } from '../ui';
import { errorMessage } from '../../lib/api';

export function Spinner({ className = 'size-6' }: { className?: string }) {
  return (
    <span
      role="progressbar"
      aria-label="Memuat"
      className={`inline-block animate-spin rounded-full border-[3px] border-primary border-t-transparent ${className}`}
    />
  );
}

export function LoadingBlock({ label }: { label?: string }) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-3 py-12 text-muted" role="status">
      <Spinner className="size-8" />
      <span className="text-base font-semibold">{label ?? t('common.loading')}</span>
    </div>
  );
}

export function ErrorBlock({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const { t } = useTranslation();
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-card bg-danger-tint px-4 py-6 text-center">
      <p className="text-base font-bold text-danger">{errorMessage(error, t)}</p>
      {onRetry ? (
        <Button variant="outline" size="md" onClick={onRetry}>
          {t('common.retry')}
        </Button>
      ) : null}
    </div>
  );
}
