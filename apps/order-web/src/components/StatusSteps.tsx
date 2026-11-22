/** Langkah status order: Diterima → Dimasak → Siap/Diantar → Selesai. */
import { useTranslation } from 'react-i18next';
import type { PublicOrderDto } from '@pos/shared';
import { CheckIcon } from './Icons';
import { Icon, cn, type IconName } from './ui';

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
  const icons: IconName[] = [
    'receipt_long',
    'skillet',
    isDelivery ? 'two_wheeler' : 'restaurant',
    'check_circle',
  ];
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
                  'relative flex size-10 shrink-0 items-center justify-center rounded-full transition-colors',
                  done && 'bg-primary text-on-primary',
                  current &&
                    'bg-primary-container text-on-primary-container ring-4 ring-primary-container/40',
                  !done && !current && 'bg-surface-container-high text-on-surface-variant',
                )}
                aria-hidden
              >
                {done ? <CheckIcon size={20} /> : <Icon name={icons[i]!} size={20} filled={current} />}
                {current ? (
                  <span className="absolute inset-0 animate-ping rounded-full bg-primary-container opacity-40 motion-reduce:hidden" />
                ) : null}
              </span>
              {i < steps.length - 1 ? (
                <span
                  className={cn(
                    'my-1 w-0.5 grow rounded-full',
                    done ? 'bg-primary' : 'bg-surface-container-highest',
                  )}
                />
              ) : null}
            </div>
            <div className="flex min-h-14 flex-col pb-3 pt-2">
              <span
                className={cn(
                  current
                    ? 'text-title-medium font-semibold text-on-surface'
                    : done
                      ? 'text-body-large font-medium'
                      : 'text-body-large text-on-surface-variant',
                )}
              >
                {label}
              </span>
              {current && i === 2 && order.driverName && isDelivery ? (
                <span className="text-label-medium font-medium text-tertiary">
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
