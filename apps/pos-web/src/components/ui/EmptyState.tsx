import type { ReactNode } from 'react';

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
      {icon ?? (
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#98A2B3"
          strokeWidth="1.6"
          strokeLinecap="round"
          aria-hidden
        >
          <rect x="3" y="4" width="18" height="16" rx="3" />
          <path d="M3 9h18M8 14h8" />
        </svg>
      )}
      <p className="text-lg font-bold">{title}</p>
      {description ? <p className="text-[15px] text-muted">{description}</p> : null}
      {action}
    </div>
  );
}
