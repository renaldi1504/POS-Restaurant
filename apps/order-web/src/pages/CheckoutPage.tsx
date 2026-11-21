/** Pembayaran — Bayar ABA (upload bukti) atau Cash saat diantar / di kasir, lalu kirim order. */
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { PublicPaymentMethod } from '@pos/shared';
import { AbaAccountInfo } from '../components/AbaAccountInfo';
import { ProofPicker } from '../components/ProofPicker';
import { Page } from '../components/Shell';
import { BottomBar, Button, Card, cn, HeaderBar, useToast } from '../components/ui';
import { errorMessage } from '../lib/api';
import { useCart } from '../lib/cart';
import { useCheckout } from '../lib/checkout';
import { useCustomer } from '../lib/customer';
import {
  cartTotals,
  formatHour,
  mainCurrency,
  minOrderGap,
  money,
  typeLabelKey,
  useMenu,
  useSettings,
} from '../lib/menu';
import { useSubmitOrder } from '../lib/order';

const inputCls =
  'h-14 w-full rounded-xs border border-outline bg-surface-container-lowest px-4 text-body-large outline-primary focus:border-primary focus:outline-1';

export default function CheckoutPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const customer = useCustomer();
  const { state: co, update } = useCheckout();
  const { lines } = useCart();
  const { data: menu } = useMenu();
  const { data: settings } = useSettings();
  const submit = useSubmitOrder(customer);
  const [proof, setProof] = useState<File | null>(null);
  const [tried, setTried] = useState(false);
  const nameId = useId();
  const phoneId = useId();
  const currency = mainCurrency(settings);
  const type = customer.orderType;
  const isDelivery = type === 'delivery';
  const { subtotal, count, allAvailable } = cartTotals(menu, lines);
  const fee = isDelivery ? (settings?.delivery.defaultFee ?? 0) : 0;
  const total = subtotal + fee;
  const gap = minOrderGap(subtotal, settings?.delivery.minOrder, isDelivery);
  const closed = settings ? !settings.isOpen : false;

  useEffect(() => {
    if (customer.mode === 'table') navigate('/keranjang', { replace: true });
    else if (count === 0 && !submit.isSuccess && !submit.isPending)
      navigate(customer.homePath, { replace: true });
  }, [customer.mode, customer.homePath, count, navigate, submit.isSuccess, submit.isPending]);

  const needName = customer.mode === 'none' && !co.name.trim();
  const needDeliveryInfo =
    isDelivery &&
    (!co.address.text.trim() ||
      (customer.mode === 'telegram' && !co.address.addressId) ||
      (customer.mode === 'none' && !co.phone.trim()));

  const methods: { value: PublicPaymentMethod; title: string; sub: string }[] = [
    { value: 'aba', title: t('web.payAba'), sub: t('web.payAbaSub') },
    {
      value: 'cash',
      title: isDelivery ? t('web.payCashDelivery') : t('web.payCashCounter'),
      sub: t('web.payCashSub'),
    },
  ];

  const onSubmit = () => {
    setTried(true);
    if (needName || needDeliveryInfo || gap > 0 || closed || !allAvailable) return;
    submit.mutate(
      { proof: co.payment === 'aba' ? proof : null },
      {
        onSuccess: ({ order, proofError }) => {
          if (proofError) toast.error(errorMessage(proofError, t));
          navigate(`/pesanan/${order.id}`, { replace: true });
        },
        onError: (e) => toast.error(errorMessage(e, t)),
      },
    );
  };

  return (
    <Page testId="checkout-page">
      <HeaderBar
        title={t('web.paymentTitle')}
        subtitle={t(typeLabelKey(type))}
        onBack={() => navigate(isDelivery ? '/alamat' : '/keranjang')}
        backLabel={t('common.back')}
      />
      <main className="flex grow flex-col gap-3 p-4">
        <Card className="flex flex-col gap-1.5" aria-label={t('web.summary')}>
          <div className="flex justify-between text-body-medium">
            <span>{t('web.itemsCount', { count })}</span>
            <b className="tabular-nums">{money(subtotal, currency)}</b>
          </div>
          {isDelivery ? (
            <div className="flex justify-between text-body-medium text-on-surface-variant">
              <span>{t('common.deliveryFee')}</span>
              <span>{fee ? money(fee, currency) : t('web.feeConfirm')}</span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-outline-variant pt-1.5">
            <span className="font-medium">{t('order.totalToPay')}</span>
            <b className="text-headline-small tabular-nums">{money(total, currency)}</b>
          </div>
          {isDelivery && co.address.text ? (
            <p className="text-label-medium text-on-surface-variant">
              <b className="text-on-surface">{t('web.deliverTo')}:</b> {co.address.text}
              {co.address.landmark ? ` · ${co.address.landmark}` : ''}
            </p>
          ) : null}
          {type === 'takeaway' ? (
            <p className="text-label-medium text-on-surface-variant">{t('web.pickupInfo')}</p>
          ) : null}
          {customer.mode === 'none' && type === 'dine_in' ? (
            <p className="text-label-medium text-on-surface-variant">{t('web.dineInfo')}</p>
          ) : null}
        </Card>

        {customer.mode === 'none' && !isDelivery ? (
          <Card className="flex flex-col gap-2">
            <b className="text-body-medium">{t('web.contact')}</b>
            <label htmlFor={nameId} className="text-label-medium font-medium">
              {t('web.yourName')}
            </label>
            <input
              id={nameId}
              autoComplete="name"
              value={co.name}
              maxLength={100}
              onChange={(e) => update({ name: e.target.value })}
              className={inputCls}
            />
            <label htmlFor={phoneId} className="text-label-medium font-medium">
              {t('order.phoneOptional')}
            </label>
            <input
              id={phoneId}
              type="tel"
              autoComplete="tel"
              value={co.phone}
              maxLength={50}
              onChange={(e) => update({ phone: e.target.value })}
              placeholder={t('web.phonePlaceholder')}
              className={inputCls}
            />
          </Card>
        ) : null}

        <section aria-labelledby="pay-title" className="flex flex-col gap-2">
          <h2 id="pay-title" className="text-title-medium">
            {t('order.payment')}
          </h2>
          <div role="radiogroup" aria-labelledby="pay-title" className="flex flex-col gap-2">
            {methods.map((m) => {
              const on = co.payment === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => update({ payment: m.value })}
                  className={cn(
                    'state-layer flex min-h-[72px] items-center gap-4 rounded-md px-4 py-2.5 text-left',
                    on
                      ? 'bg-secondary-container text-on-secondary-container outline-2 outline-primary'
                      : 'border border-outline-variant bg-surface-container-lowest',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                      on ? 'border-primary' : 'border-on-surface-variant',
                    )}
                  >
                    {on ? <span className="size-3 rounded-full bg-primary" /> : null}
                  </span>
                  <span className="flex flex-col">
                    <b className="text-title-medium">{m.title}</b>
                    <span className="text-body-medium opacity-80">{m.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {co.payment === 'aba' ? (
          <Card className="flex flex-col gap-2.5" data-testid="aba-panel">
            <b className="text-title-medium">{t('web.abaTitle')}</b>
            <div className="flex items-baseline justify-between rounded-md bg-surface-container-highest px-4 py-3">
              <span className="text-body-medium">{t('web.abaAmount')}</span>
              <b className="text-headline-small font-medium tabular-nums">{money(total, currency)}</b>
            </div>
            <AbaAccountInfo settings={settings} />
            <ProofPicker value={proof} onChange={setProof} />
            {!proof ? (
              <p className="text-label-medium text-on-surface-variant">{t('web.proofLater')}</p>
            ) : null}
          </Card>
        ) : null}

        {tried && (needName || needDeliveryInfo) ? (
          <ul
            role="alert"
            className="flex flex-col gap-1 rounded-md bg-error-container p-3 text-label-medium font-medium text-on-error-container"
          >
            {needName ? <li>{t('web.needName')}</li> : null}
            {needDeliveryInfo ? <li>{t('web.needAddress')}</li> : null}
          </ul>
        ) : null}
      </main>

      <BottomBar>
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
            {t('web.closedOpensAt', { time: formatHour(settings.hours.open, i18n.language) })}
          </p>
        ) : null}
        <Button
          size="lg"
          block
          onClick={onSubmit}
          loading={submit.isPending}
          disabled={gap > 0 || closed || !allAvailable || count === 0}
        >
          {t('web.placeOrder', { amount: money(total, currency) })}
        </Button>
      </BottomBar>
    </Page>
  );
}
