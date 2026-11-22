/** Pembayaran — Bayar ABA (upload bukti) atau Cash saat diantar / di kasir, lalu kirim order. */
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { PublicPaymentMethod } from '@pos/shared';
import { AbaAccountInfo } from '../components/AbaAccountInfo';
import { ProofPicker } from '../components/ProofPicker';
import { Page } from '../components/Shell';
import { BottomBar, Button, Card, cn, HeaderBar, Icon, useToast, type IconName } from '../components/ui';
import { errorMessage } from '../lib/api';
import { useCart } from '../lib/cart';
import { useCheckout } from '../lib/checkout';
import { useCustomer } from '../lib/customer';
import {
  cartTotals,
  formatHour,
  reopenTime,
  mainCurrency,
  minOrderGap,
  money,
  typeLabelKey,
  useMenu,
  useSettings,
} from '../lib/menu';
import { useSubmitOrder } from '../lib/order';

const inputCls =
  'h-14 w-full rounded-md border border-outline bg-surface-container-lowest px-4 text-body-large outline-primary focus:border-primary focus:outline-1';
const cardCls = 'rounded-2xl border-0 shadow-card';

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

  const methods: { value: PublicPaymentMethod; title: string; sub: string; icon: IconName }[] = [
    { value: 'aba', title: t('web.payAba'), sub: t('web.payAbaSub'), icon: 'account_balance' },
    {
      value: 'cash',
      icon: 'payments',
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
        <Card className={cn('flex flex-col gap-1.5', cardCls)} aria-label={t('web.summary')}>
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
          <div className="mt-1 flex items-baseline justify-between border-t border-dashed border-outline-variant pt-2.5">
            <span className="font-medium">{t('order.totalToPay')}</span>
            <b className="text-headline-small font-bold tabular-nums">{money(total, currency)}</b>
          </div>
          {isDelivery && co.address.text ? (
            <p className="mt-1 flex items-start gap-2 rounded-md bg-surface-container-low px-3 py-2 text-label-medium text-on-surface-variant">
              <Icon name="location_on" size={18} className="text-primary" />
              <span className="min-w-0">
                <b className="text-on-surface">{t('web.deliverTo')}:</b> {co.address.text}
                {co.address.landmark ? ` · ${co.address.landmark}` : ''}
              </span>
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
          <Card className={cn('flex flex-col gap-2', cardCls)}>
            <b className="flex items-center gap-2 text-title-medium">
              <Icon name="person" className="text-primary" />
              {t('web.contact')}
            </b>
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
          <h2 id="pay-title" className="font-display text-title-large">
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
                    'state-layer flex min-h-[76px] items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-shadow',
                    on
                      ? 'bg-surface-container-lowest shadow-card ring-2 ring-primary'
                      : 'bg-surface-container-lowest ring-1 ring-outline-variant',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-12 shrink-0 items-center justify-center rounded-full transition-colors',
                      on ? 'bg-primary text-on-primary' : 'bg-surface-container-high text-on-surface-variant',
                    )}
                  >
                    <Icon name={m.icon} filled={on} />
                  </span>
                  <span className="flex min-w-0 grow flex-col">
                    <b className="text-title-medium font-semibold">{m.title}</b>
                    <span className="text-body-medium text-on-surface-variant">{m.sub}</span>
                  </span>
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                      on ? 'border-primary bg-primary text-on-primary' : 'border-outline',
                    )}
                  >
                    {on ? <Icon name="check" size={16} /> : null}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {co.payment === 'aba' ? (
          <Card className={cn('flex animate-fade-in flex-col gap-3', cardCls)} data-testid="aba-panel">
            <b className="font-display text-title-large">{t('web.abaTitle')}</b>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 rounded-xl bg-primary-container/45 px-4 py-3 text-on-primary-container">
              <span className="text-body-medium">{t('web.abaAmount')}</span>
              <b className="text-headline-small font-bold tabular-nums">{money(total, currency)}</b>
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
            className="flex flex-col gap-1 rounded-2xl bg-error-container p-3 text-label-medium font-medium text-on-error-container"
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
            {t('web.closedOpensAt', { time: formatHour(reopenTime(settings.hours), i18n.language) })}
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
