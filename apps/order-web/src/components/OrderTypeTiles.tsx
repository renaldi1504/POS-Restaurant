/** Pilih tipe order: ubin ikon + tulisan kecil di dalam satu jalur (segmented); yang aktif terangkat putih. */
import { useTranslation } from 'react-i18next';
import type { OrderType } from '@pos/shared';
import { Icon, cn, type IconName } from './ui';

const TYPES: { value: OrderType; icon: IconName; key: string }[] = [
  { value: 'delivery', icon: 'two_wheeler', key: 'web.typeDelivery' },
  { value: 'takeaway', icon: 'shopping_bag', key: 'web.typeTakeaway' },
  { value: 'dine_in', icon: 'restaurant', key: 'web.typeDineIn' },
];

export function OrderTypeTiles({
  value,
  onChange,
  className,
}: {
  value: OrderType;
  onChange: (v: OrderType) => void;
  className?: string;
}) {
  const { t } = useTranslation();
  return (
    <div
      role="radiogroup"
      aria-label={t('web.orderType')}
      className={cn('grid grid-cols-3 gap-1 rounded-xl bg-surface-container p-1', className)}
    >
      {TYPES.map((ty) => {
        const on = value === ty.value;
        const label = t(ty.key);
        return (
          <button
            key={ty.value}
            type="button"
            role="radio"
            aria-checked={on}
            aria-label={label}
            onClick={() => onChange(ty.value)}
            className={cn(
              'state-layer flex min-h-15 min-w-0 flex-col items-center justify-center gap-0.5 rounded-[22px] px-1 py-1.5 transition-[background-color,box-shadow,color] duration-200',
              on ? 'bg-surface-container-lowest text-primary shadow-card' : 'text-on-surface-variant',
            )}
          >
            <Icon name={ty.icon} size={26} filled={on} />
            <span
              className={cn(
                'w-full truncate text-center text-label-medium',
                on ? 'font-semibold text-on-surface' : '',
              )}
            >
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
