import { useTranslation } from 'react-i18next';
import { formatMoney, tl, type OrderChannel, type OrderDto, type OrderStatus } from '@pos/shared';
import { Badge, cn, type BadgeTone } from '../ui';

/** Warna status order → peran M3 (SKILL §2): Baru tertiary, Dimasak warning, Siap primary, Diantar secondary. */
export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending_accept: 'info',
  accepted: 'info',
  cooking: 'warn',
  ready: 'primary',
  picked_up: 'secondary',
  delivered: 'secondary',
  served: 'neutral',
  done: 'neutral',
  rejected: 'danger',
  cancelled: 'danger',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}

const SOURCE: Record<OrderChannel, { key: string; cls: string; dot?: string }> = {
  kasir: { key: 'sourceKasir', cls: 'bg-surface-container-highest text-on-surface-variant' },
  website: { key: 'cashier.sourceWebsite', cls: 'bg-surface-container-highest text-on-surface' },
  telegram: { key: 'cashier.sourceTelegram', cls: 'bg-tertiary-container text-on-tertiary-container' },
  qr: { key: 'cashier.sourceQr', cls: 'bg-secondary-container text-on-secondary-container' },
  grab: { key: 'sourceGrab', cls: 'bg-surface-container-highest text-on-surface', dot: 'bg-brand-grab' },
  foodpanda: {
    key: 'sourceFoodpanda',
    cls: 'bg-surface-container-highest text-on-surface',
    dot: 'bg-brand-foodpanda',
  },
};

/** Label sumber order; Grab/foodpanda memakai warna merek hanya sebagai titik kecil di depan. */
export function SourceBadge({ channel, size = 'sm' }: { channel: OrderChannel; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const s = SOURCE[channel];
  const label = s.key.startsWith('cashier.') ? t(s.key) : t(`online.${s.key}`);
  return (
    <span
      className={cn(
        s.cls,
        'inline-flex items-center gap-1.5 rounded-sm text-label-medium',
        size === 'md' ? 'min-h-7 px-2.5' : 'min-h-6 px-2',
      )}
    >
      {s.dot ? <span className={cn('size-2 shrink-0 rounded-full', s.dot)} aria-hidden /> : null}
      {label}
    </span>
  );
}

/** Daftar item order: "2 × Ayam Goreng" + opsi/catatan + harga. */
export function OrderItemsList({
  order,
  lang,
  compact,
}: {
  order: Pick<OrderDto, 'items' | 'currency'>;
  lang: string;
  compact?: boolean;
}) {
  return (
    <div className="flex flex-col">
      {order.items.map((it) => {
        const opts = it.options.map((o) => tl(o.optionName, lang)).join(' · ');
        return (
          <div key={it.id} className={`flex justify-between gap-2 ${compact ? 'py-1' : 'py-2'}`}>
            <span className="flex min-w-0 flex-col">
              <span className="text-body-large">
                {it.qty} × {tl(it.name, lang)}
              </span>
              {opts ? <span className="text-body-medium text-on-surface-variant">{opts}</span> : null}
              {it.note ? <span className="text-body-medium font-medium text-error">{it.note}</span> : null}
            </span>
            <span className="shrink-0 text-body-large font-medium tabular-nums">
              {formatMoney(it.lineTotal, order.currency)}
            </span>
          </div>
        );
      })}
    </div>
  );
}

export function timeHM(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function minutesSince(iso: string | null | undefined, now = Date.now()): number {
  if (!iso) return 0;
  return Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
}
