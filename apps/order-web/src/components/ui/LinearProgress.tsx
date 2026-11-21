import { cn } from './cn';

/** Progres linear tak tentu M3 (di bawah top app bar saat memuat). */
export function LinearProgress({ className, label = 'Memuat' }: { className?: string; label?: string }) {
  return (
    <div
      role="progressbar"
      aria-label={label}
      className={cn('relative h-1 w-full overflow-hidden bg-secondary-container', className)}
    >
      <span className="absolute inset-y-0 left-0 w-full origin-left animate-progress bg-primary" />
    </div>
  );
}
