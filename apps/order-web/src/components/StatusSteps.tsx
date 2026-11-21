/** Langkah status order: Diterima → Dimasak → Siap/Diantar → Selesai. */
import { useTranslation } from 'react-i18next';
import type { PublicOrderDto } from '@pos/shared';
import { CheckIcon } from './Icons';
import { cn } from './ui';

export function stepIndex(status: PublicOrderDto['status']): number {
  switch (status) {
    case 'accepted':
      return 0;
    case 'cooking':
      return 1;
    case 'ready':
    case 'picked_up':
    case 'served':
      return 2;
    case 'delivered':
    case 'done':
      return 3;
    default:
      return -1;
  }
}

export function StatusSteps({ order }: { order: PublicOrderDto }) {
  const { t } = useTranslation();
  const idx = stepIndex(order.status);
  const isDelivery = order.type === 'delivery';
  const third = isDelivery
    ? order.status === 'ready'
      ? t('web.stepReadyWaitDriver')
      : t('order.stepOnTheWay')
    : order.status === 'served'
      ? t('order.stepServed')
      : t('order.stepReady');
  const steps = [t('order.stepReceived'), t('order.stepCooking'), third, t('web.stepDone')];
  const allDone = order.status === 'done' || order.status === 'delivered';
  return (
    <ol className="flex flex-col" aria-label={t('order.statusTitle')} data-testid="status-steps">
      {steps.map((label, i) => {
        const done = i < idx || (allDone && i <= idx);
        const current = i === idx && !allDone;
        return (
          <li
            key={i}
            className="flex items-start gap-3"
            aria-current={current ? 'step' : undefined}
            data-state={done ? 'done' : current ? 'current' : 'todo'}
          >
            <div className="flex flex-col items-center self-stretch">
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-extrabold',
                  done && 'border-primary bg-primary text-white',
                  current && 'border-primary bg-primary-tint text-primary-dark',
                  !done && !current && 'border-line-strong bg-white text-muted',
                )}
                aria-hidden
              >
                {done ? <CheckIcon size={16} /> : i + 1}
              </span>
              {i < steps.length - 1 ? (
                <span className={cn('my-0.5 w-0.5 grow', done ? 'bg-primary' : 'bg-line-strong')} />
              ) : null}
            </div>
            <div className="flex min-h-12 flex-col pb-2 pt-1">
              <span
                className={cn('text-base', current ? 'font-extrabold' : done ? 'font-bold' : 'text-muted')}
              >
                {label}
              </span>
              {current && i === 2 && order.driverName && isDelivery ? (
                <span className="text-sm font-semibold text-info-dark">
                  {t('web.driverOnWay', { name: order.driverName })}
                </span>
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
