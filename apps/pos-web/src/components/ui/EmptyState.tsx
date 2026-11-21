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
        <span className="flex size-20 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant">
          <Icon name={icon as IconName} size={40} />
        </span>
      ) : (
        icon
      )}
      <p className="text-title-medium">{title}</p>
      {description ? <p className="text-body-medium text-on-surface-variant">{description}</p> : null}
      {action}
    </div>
  );
}
