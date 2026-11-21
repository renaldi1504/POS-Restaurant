import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useCart } from '../lib/cart';
import { useCustomer } from '../lib/customer';
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
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-30 mx-auto w-full max-w-[480px] px-3 pb-[max(16px,env(safe-area-inset-bottom))]">
      <button
        type="button"
        onClick={() => navigate('/keranjang')}
        className="pointer-events-auto flex h-[60px] w-full items-center justify-between gap-2 rounded-2xl bg-primary px-[18px] text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)]"
        data-testid="cart-bar"
      >
        <span className="truncate text-base font-bold tabular-nums">
          {t('web.cartSummary', { count, amount: money(subtotal, currency) })}
        </span>
        <span className="shrink-0 text-base font-extrabold">
          {mode === 'table' ? t('order.sendToKitchen') : t('web.viewOrder')} ›
        </span>
      </button>
    </div>
  );
}
