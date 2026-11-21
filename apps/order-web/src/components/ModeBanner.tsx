import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCustomer } from '../lib/customer';
import { errorMessage } from '../lib/api';
import { mainCurrency, money, useSettings } from '../lib/menu';
import { useRequestBill, useTableBill } from '../lib/table';
import { Icon, useToast } from './ui';

/** "Halo [nama] · Masuk otomatis via Telegram" + badge Delivery (mockup Website mode telegram). */
export function TelegramBanner() {
  const { t } = useTranslation();
  const { tgUser, session } = useCustomer();
  const name = tgUser?.first_name || session?.customer?.name || session?.customer?.username || '';
  return (
    <div
      className="flex items-center gap-3 rounded-md bg-tertiary-container px-3 py-2 text-on-tertiary-container"
      data-testid="tg-banner"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tertiary text-on-tertiary"
      >
        <Icon name="send" size={20} />
      </span>
      <span className="flex min-w-0 grow flex-col">
        <b className="text-label-large">{t('order.telegramHello', { name })}</b>
        <span className="text-label-medium font-normal">{t('web.tgSub')}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 rounded-sm bg-tertiary px-2.5 py-1 text-label-medium text-on-tertiary">
        <Icon name="delivery_dining" size={16} />
        {t('web.typeDelivery')}
      </span>
    </div>
  );
}

/** "Meja X · Makan di sini" + tagihan berjalan + Minta bill (mockup WebsiteMeja). */
export function TableBanner() {
  const { t } = useTranslation();
  const toast = useToast();
  const { session } = useCustomer();
  const { data: settings } = useSettings();
  const bill = useTableBill();
  const req = useRequestBill();
  const tableName = session?.table?.name ?? bill.data?.table.name ?? '';
  const short = /\d+/.exec(tableName)?.[0] ?? tableName.charAt(0);
  const requested =
    bill.data?.session?.status === 'bill_requested' || session?.tableSession?.status === 'bill_requested';
  const currency = bill.data?.currency ?? mainCurrency(settings);
  const hasOrders = (bill.data?.orders.length ?? 0) > 0;
  return (
    <div
      className="flex items-center gap-3 rounded-md bg-secondary-container px-3 py-2 text-on-secondary-container"
      data-testid="table-banner"
    >
      <span
        aria-hidden
        className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-title-medium text-on-primary"
      >
        {short}
      </span>
      <span className="flex min-w-0 grow flex-col">
        <b className="text-label-large">{t('order.tableBanner', { name: tableName })}</b>
        {hasOrders ? (
          <Link to="/meja/tagihan" className="text-label-medium text-primary underline underline-offset-2">
            {t('web.tableBill', { amount: money(bill.data!.remaining || bill.data!.total, currency) })}
          </Link>
        ) : (
          <span className="text-label-medium font-normal">{t('web.tableNoBill')}</span>
        )}
      </span>
      <button
        type="button"
        disabled={requested || req.isPending || !hasOrders}
        onClick={() =>
          req.mutate(undefined, {
            onSuccess: () => toast.success(t('order.billRequested')),
            onError: (e) => toast.error(errorMessage(e, t)),
          })
        }
        className="state-layer flex h-12 shrink-0 items-center gap-1 rounded-full bg-primary px-4 text-label-large text-on-primary disabled:bg-on-surface/12 disabled:text-on-surface/38"
      >
        {requested ? t('web.billAsked') : t('order.requestBill')}
      </button>
    </div>
  );
}
