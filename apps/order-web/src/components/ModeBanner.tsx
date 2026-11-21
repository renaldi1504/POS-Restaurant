import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { useCustomer } from '../lib/customer';
import { errorMessage } from '../lib/api';
import { mainCurrency, money, useSettings } from '../lib/menu';
import { useRequestBill, useTableBill } from '../lib/table';
import { useToast } from './ui';

/** "Halo [nama] · Masuk otomatis via Telegram" + badge Delivery (mockup Website mode telegram). */
export function TelegramBanner() {
  const { t } = useTranslation();
  const { tgUser, session } = useCustomer();
  const name = tgUser?.first_name || session?.customer?.name || session?.customer?.username || '';
  return (
    <div className="flex items-center gap-2.5 rounded-xl bg-info-tint px-3 py-2" data-testid="tg-banner">
      <span
        aria-hidden
        className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info text-xs font-extrabold text-white"
      >
        TG
      </span>
      <span className="flex min-w-0 grow flex-col">
        <b className="text-sm text-info-dark">{t('order.telegramHello', { name })}</b>
        <span className="text-xs text-info-dark">{t('web.tgSub')}</span>
      </span>
      <span className="shrink-0 rounded-lg bg-info px-2.5 py-1 text-xs font-extrabold text-white">
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
      className="flex items-center gap-2.5 rounded-xl bg-primary-tint px-3 py-2"
      data-testid="table-banner"
    >
      <span
        aria-hidden
        className="flex size-9 shrink-0 items-center justify-center rounded-[10px] bg-primary text-[15px] font-extrabold text-white"
      >
        {short}
      </span>
      <span className="flex min-w-0 grow flex-col">
        <b className="text-sm text-primary-dark">{t('order.tableBanner', { name: tableName })}</b>
        {hasOrders ? (
          <Link to="/meja/tagihan" className="text-xs text-primary-dark underline">
            {t('web.tableBill', { amount: money(bill.data!.remaining || bill.data!.total, currency) })}
          </Link>
        ) : (
          <span className="text-xs text-primary-dark">{t('web.tableNoBill')}</span>
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
        className="h-11 shrink-0 rounded-[10px] border-[1.5px] border-primary bg-white px-3 text-[13px] font-extrabold text-primary-dark disabled:opacity-60"
      >
        {requested ? t('web.billAsked') : t('order.requestBill')}
      </button>
    </div>
  );
}
