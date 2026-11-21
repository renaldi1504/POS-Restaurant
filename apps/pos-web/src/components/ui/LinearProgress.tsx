import { useTranslation } from 'react-i18next';
import { cn } from './cn';

/** Progres linear tak tentu M3 (di bawah top app bar saat memuat). */
export function LinearProgress({ className, label }: { className?: string; label?: string }) {
  const { t } = useTranslation();
  return (
    <div
      role="progressbar"
      aria-label={label ?? t('common.loading')}
      className={cn('relative h-1 w-full overflow-hidden bg-secondary-container', className)}
    >
      <span className="absolute inset-y-0 left-0 w-full origin-left animate-progress bg-primary" />
    </div>
  );
}
