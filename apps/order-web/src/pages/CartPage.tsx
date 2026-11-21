/** Keranjang — tinjau item (ubah jumlah/opsi/hapus), catatan, lalu lanjut sesuai tipe pesanan. */
import { useId, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { tl } from '@pos/shared';
import { OptionSheet } from '../components/OptionSheet';
import { Page } from '../components/Shell';
import {
  BottomBar,
  Button,
  Card,
  EmptyState,
  HeaderBar,
  Icon,
  Stepper,
  cn,
  useToast,
} from '../components/ui';
import { errorMessage } from '../lib/api';
import { useCart } from '../lib/cart';
import { useCheckout } from '../lib/checkout';
import { useCustomer } from '../lib/customer';
import {
  cartTotals,
  formatHour,
  groupsForItem,
  mainCurrency,
  minOrderGap,
  money,
  typeLabelKey,
  useMenu,
  useSettings,
} from '../lib/menu';
import { useSubmitOrder } from '../lib/order';

/** `embedded` = panel keranjang di samping menu (tablet expanded): tanpa tombol kembali / Tambah lagi. */
export default function CartPage({ embedded }: { embedded?: boolean } = {}) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const toast = useToast();
  const customer = useCustomer();
  const cart = useCart();
  const { state: co, update } = useCheckout();
  const { data: menu } = useMenu();
  const { data: settings } = useSettings();
  const [editKey, setEditKey] = useState<string | null>(null);
  const noteId = useId();
  const submit = useSubmitOrder(customer);
  const currency = mainCurrency(settings);
  const { priced, subtotal, count, allAvailable } = cartTotals(menu, cart.lines);
  const isDelivery = customer.orderType === 'delivery';
  const gap = minOrderGap(subtotal, settings?.delivery.minOrder, isDelivery);
  const closed = settings ? !settings.isOpen : false;
  const fee = settings?.delivery.defaultFee ?? 0;
  const editing = editKey ? priced.find((p) => p.line.key === editKey) : undefined;

  const goNext = () => {
    if (customer.mode === 'table') {
      submit.mutate(
        {},
        {
          onSuccess: ({ order }) => {
            toast.success(t('web.sentToKitchen'));
            navigate(`/pesanan/${order.id}`, { replace: true });
          },
          onError: (e) => toast.error(errorMessage(e, t)),
        },
      );
      return;
    }
    navigate(isDelivery ? '/alamat' : '/checkout');
  };

  // Website biasa tidak bisa order makan di sini tanpa QR meja (server menolak) → arahkan scan QR.
  const dineWithoutTable = customer.mode === 'none' && customer.orderType === 'dine_in';
  const blocked = count === 0 || !allAvailable || closed || gap > 0 || !menu || dineWithoutTable;
  const primaryLabel =
    customer.mode === 'table'
      ? t('order.sendToKitchen')
      : isDelivery
        ? t('web.toAddress')
        : t('web.toPayment');

  const Wrap = embedded ? PaneWrap : Page;
  return (
    <Wrap testId="cart-page">
      <HeaderBar
        title={t('web.cartTitle')}
        subtitle={t(typeLabelKey(customer.orderType))}
        onBack={embedded ? undefined : () => navigate(customer.homePath)}
        backLabel={t('web.backToMenu')}
        className={embedded ? 'bg-surface-container-low' : undefined}
      />
      {count === 0 ? (
        <main className="flex grow flex-col p-4">
          <EmptyState
            icon="shopping_bag"
            title={t('order.emptyCart')}
            description={t('web.emptyCartHint')}
            action={
              embedded ? undefined : (
                <Button onClick={() => navigate(customer.homePath)}>{t('web.seeMenu')}</Button>
              )
            }
          />
        </main>
      ) : (
        <>
          <main className="flex grow flex-col gap-3 p-4">
            {customer.mode === 'none' ? (
              <div
                role="radiogroup"
                aria-label={t('web.orderType')}
                className="grid grid-cols-3 overflow-hidden rounded-full border border-outline"
              >
                {(['delivery', 'takeaway', 'dine_in'] as const).map((ty, i) => (
                  <button
                    key={ty}
                    type="button"
                    role="radio"
                    aria-checked={co.type === ty}
                    onClick={() => update({ type: ty })}
                    className={cn(
                      'state-layer flex min-h-12 min-w-0 items-center justify-center gap-1 px-1 text-label-large',
                      i > 0 && 'border-l border-outline',
                      co.type === ty
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'text-on-surface',
                    )}
                  >
                    {co.type === ty ? <Icon name="check" size={18} /> : null}
                    <span className="truncate">{t(typeLabelKey(ty))}</span>
                  </button>
                ))}
              </div>
            ) : null}

            <ul className="flex flex-col gap-2.5" aria-label={t('web.cartTitle')}>
              {priced.map((p) => {
                const name = p.item ? tl(p.item.name, lang) : `#${p.line.itemId}`;
                const hasGroups = !!(menu && p.item && groupsForItem(menu, p.item).length);
                return (
                  <li key={p.line.key}>
                    <Card
                      padded={false}
                      className={p.available ? 'p-4' : 'border-error bg-error-container p-4'}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex min-w-0 flex-col gap-0.5">
                          <b className="text-title-medium">{name}</b>
                          {p.options.length ? (
                            <span className="text-label-medium text-on-surface-variant">
                              {p.options.map((o) => tl(o.name, lang)).join(', ')}
                            </span>
                          ) : null}
                          {p.line.note ? (
                            <span className="text-label-medium italic text-on-surface-variant">
                              “{p.line.note}”
                            </span>
                          ) : null}
                          <span className="text-label-medium text-on-surface-variant tabular-nums">
                            {money(p.unit, currency)}
                          </span>
                        </div>
                        <b className="shrink-0 text-title-medium font-medium tabular-nums">
                          {money(p.total, currency)}
                        </b>
                      </div>
                      {!p.available ? (
                        <p className="mt-1 text-label-medium font-medium text-error" role="alert">
                          {t('web.itemUnavailable', { name })}
                        </p>
                      ) : null}
                      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                        <Stepper
                          value={p.line.qty}
                          min={1}
                          onChange={(v) => cart.setQty(p.line.key, v)}
                          label={t('web.qtyOf', { name })}
                          decLabel={t('web.decItem', { name })}
                          incLabel={t('web.incItem', { name })}
                        />
                        <div className="flex gap-1.5">
                          {hasGroups && p.item?.available ? (
                            <Button size="md" variant="outlined" onClick={() => setEditKey(p.line.key)}>
                              {t('web.editOptions')}
                            </Button>
                          ) : null}
                          <Button
                            size="md"
                            variant="text"
                            className="text-error"
                            onClick={() => cart.remove(p.line.key)}
                            aria-label={t('web.removeItem', { name })}
                          >
                            {t('common.delete')}
                          </Button>
                        </div>
                      </div>
                    </Card>
                  </li>
                );
              })}
            </ul>

            {embedded ? null : (
              <Button variant="outlined" block onClick={() => navigate(customer.homePath)}>
                {t('web.addMore')}
              </Button>
            )}

            <div className="group/field relative flex rounded-xs border border-outline bg-surface-container-lowest focus-within:border-primary focus-within:outline-1 focus-within:outline-primary">
              <label
                htmlFor={noteId}
                className="pointer-events-none absolute left-4 right-4 top-1.5 truncate text-label-medium text-on-surface-variant group-focus-within/field:text-primary"
              >
                {t('web.orderNote')} <span className="font-normal">{t('web.noteOptional')}</span>
              </label>
              <textarea
                id={noteId}
                rows={2}
                maxLength={250}
                value={co.note}
                onChange={(e) => update({ note: e.target.value })}
                placeholder={t('web.orderNotePlaceholder')}
                className="w-full resize-none bg-transparent px-4 pb-2 pt-7 text-body-large outline-none placeholder:text-on-surface-variant/70"
              />
            </div>

            {customer.orderType === 'takeaway' ? (
              <Card tone="info" className="text-body-medium">
                {t('web.pickupInfo')}
              </Card>
            ) : null}
            {customer.mode === 'none' && customer.orderType === 'dine_in' ? (
              <Card tone="warn" className="text-body-medium" role="alert" data-testid="dine-info">
                {t('web.dineInfo')}
              </Card>
            ) : null}
          </main>

          <BottomBar>
            <div className="flex items-baseline justify-between text-body-large">
              <span>{t('common.subtotal')}</span>
              <b className="text-title-large font-medium tabular-nums">{money(subtotal, currency)}</b>
            </div>
            {isDelivery ? (
              <div className="flex justify-between text-body-medium text-on-surface-variant">
                <span>{t('common.deliveryFee')}</span>
                <span>{fee ? money(fee, currency) : t('web.feeConfirm')}</span>
              </div>
            ) : null}
            {gap > 0 ? (
              <p
                className="text-center text-label-medium font-medium text-error"
                role="alert"
                data-testid="min-order"
              >
                {t('web.minOrderShort', {
                  amount: money(settings!.delivery.minOrder, currency),
                  diff: money(gap, currency),
                })}
              </p>
            ) : null}
            {closed && settings ? (
              <p className="text-center text-label-medium font-medium text-error" role="alert">
                {t('web.closedOpensAt', { time: formatHour(settings.hours.open, lang) })}
              </p>
            ) : null}
            <Button size="lg" block disabled={blocked} loading={submit.isPending} onClick={goNext}>
              {primaryLabel}
              <Icon name="arrow_forward" />
            </Button>
          </BottomBar>
        </>
      )}

      {editing?.item && menu ? (
        <OptionSheet
          mode="edit"
          item={editing.item}
          groups={groupsForItem(menu, editing.item)}
          currency={currency}
          initial={{
            optionIds: editing.line.optionIds,
            qty: editing.line.qty,
            note: editing.line.note ?? '',
          }}
          onClose={() => setEditKey(null)}
          onSubmit={(v) => {
            cart.replace(editing.line.key, { itemId: editing.line.itemId, ...v });
            setEditKey(null);
          }}
        />
      ) : null}
    </Wrap>
  );
}

function PaneWrap({ children, testId }: { children: ReactNode; testId?: string }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto" data-testid={testId}>
      {children}
    </div>
  );
}
