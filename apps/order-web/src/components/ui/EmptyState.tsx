import type { ReactNode } from 'react';
import { Icon, type IconName } from './Icon';

export function EmptyState({
  title,
  description,
  action,
  icon = 'receipt_long',
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: IconName | ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {typeof icon === 'string' ? (
        <span className="relative flex size-24 items-center justify-center rounded-full bg-primary-container/50 text-primary ring-8 ring-primary-container/25">
          <Icon name={icon as IconName} size={44} />
        </span>
      ) : (
        icon
      )}
      <p className="mt-2 font-display text-title-large">{title}</p>
      {description ? (
        <p className="max-w-xs text-body-medium text-on-surface-variant">{description}</p>
      ) : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}
