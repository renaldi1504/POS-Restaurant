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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[640px] px-4 pb-[max(16px,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={() => navigate('/keranjang')}
        className="state-layer pointer-events-auto flex h-16 w-full items-center justify-between gap-2 rounded-lg bg-primary px-5 text-on-primary shadow-e3"
        data-testid="cart-bar"
      >
        <span className="flex min-w-0 items-center gap-2 truncate text-label-large tabular-nums">
          <Icon name="shopping_bag" />
          {t('web.cartSummary', { count, amount: money(subtotal, currency) })}
        </span>
        <span className="flex shrink-0 items-center gap-1 text-label-large">
          {mode === 'table' ? t('order.sendToKitchen') : t('web.viewOrder')}
          <Icon name="arrow_forward" size={20} />
        </span>
      </button>
    </div>
  );
}
