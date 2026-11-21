import { useTranslation } from 'react-i18next';
import { formatMoney, tl, type OrderChannel, type OrderDto, type OrderStatus } from '@pos/shared';
import { Badge, type BadgeTone } from '../ui';

export const STATUS_TONE: Record<OrderStatus, BadgeTone> = {
  pending_accept: 'warn',
  accepted: 'warn',
  cooking: 'info',
  ready: 'primary',
  picked_up: 'info',
  delivered: 'primary',
  served: 'primary',
  done: 'neutral',
  rejected: 'danger',
  cancelled: 'danger',
};

export function StatusBadge({ status }: { status: OrderStatus }) {
  const { t } = useTranslation();
  return <Badge tone={STATUS_TONE[status]}>{t(`status.${status}`)}</Badge>;
}

const SOURCE: Record<OrderChannel, { key: string; cls: string }> = {
  kasir: { key: 'sourceKasir', cls: 'bg-[#F2F4F7] text-[#475467]' },
  website: { key: 'cashier.sourceWebsite', cls: 'bg-[#F2F4F7] text-ink' },
  telegram: { key: 'cashier.sourceTelegram', cls: 'bg-info-tint text-info-dark' },
  qr: { key: 'cashier.sourceQr', cls: 'bg-primary-tint text-primary-dark' },
  grab: { key: 'sourceGrab', cls: 'bg-[#DCFAE6] text-[#067647]' },
  foodpanda: { key: 'sourceFoodpanda', cls: 'bg-[#FCE7F6] text-[#C11574]' },
};

export function SourceBadge({ channel, size = 'sm' }: { channel: OrderChannel; size?: 'sm' | 'md' }) {
  const { t } = useTranslation();
  const s = SOURCE[channel];
  const label = s.key.startsWith('cashier.') ? t(s.key) : t(`online.${s.key}`);
  return (
    <span
      className={`${s.cls} rounded-md font-extrabold ${size === 'md' ? 'rounded-lg px-2.5 py-1 text-[13px]' : 'px-[7px] py-0.5 text-[11px]'}`}
    >
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
          <div key={it.id} className={`flex justify-between gap-2 ${compact ? 'py-1' : 'py-[7px]'}`}>
            <span className="flex min-w-0 flex-col">
              <span className="font-semibold">
                {it.qty} × {tl(it.name, lang)}
              </span>
              {opts ? <span className="text-xs text-muted">{opts}</span> : null}
              {it.note ? <span className="text-xs font-bold text-danger">{it.note}</span> : null}
            </span>
            <b className="shrink-0 tabular-nums">{formatMoney(it.lineTotal, order.currency)}</b>
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
