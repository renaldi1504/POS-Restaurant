import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useCart } from '../lib/cart';
import { useCustomer } from '../lib/customer';
import { Icon } from './ui';
import { cartTotals, mainCurrency, money, useMenu, useSettings } from '../lib/menu';

/** Bar keranjang mengambang di bawah menu: "3 item · 42.000 ៛   Lihat pesanan ›" / "Kirim ke dapur ›". */
export function CartBar() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { lines } = useCart();
  const { data: menu } = useMenu();
  const { data: settings } = useSettings();
  const { mode } = useCustomer();
  const { count, subtotal } = cartTotals(menu, lines);
  if (count === 0) return null;
  const currency = mainCurrency(settings);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[640px] px-3 pb-[max(12px,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={() => navigate('/keranjang')}
        className="state-layer pointer-events-auto flex h-16 w-full animate-rise items-center gap-3 rounded-full bg-primary pl-2.5 pr-2 text-on-primary shadow-float"
        data-testid="cart-bar"
      >
        <span
          aria-hidden
          className="relative flex size-12 shrink-0 items-center justify-center rounded-full bg-on-primary/15"
        >
          <Icon name="shopping_bag" filled />
          <span
            key={count}
            className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 animate-pop items-center justify-center rounded-full bg-warning-container px-1 text-[0.75rem] font-bold leading-none text-on-warning-container tabular-nums"
          >
            {count}
          </span>
        </span>
        <span className="sr-only">{t('web.cartSummary', { count, amount: money(subtotal, currency) })}</span>
        <span aria-hidden className="flex min-w-0 grow flex-col text-left">
          <b className="truncate text-title-medium font-bold tabular-nums">{money(subtotal, currency)}</b>
          <span className="truncate text-label-medium opacity-85">{t('web.itemsCount', { count })}</span>
        </span>
        <span className="flex h-12 shrink-0 items-center gap-1 rounded-full bg-surface-container-lowest pl-4 pr-3 text-label-large font-semibold text-primary">
          {mode === 'table' ? t('order.sendToKitchen') : t('web.viewOrder')}
          <Icon name="arrow_forward" size={20} />
        </span>
      </button>
    </div>
  );
}
