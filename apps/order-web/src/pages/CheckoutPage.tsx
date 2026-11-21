/** Pembayaran — Bayar ABA (upload bukti) atau Cash saat diantar / di kasir, lalu kirim order. */
import { useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { PublicPaymentMethod } from '@pos/shared';
import { AbaAccountInfo } from '../components/AbaAccountInfo';
import { CheckIcon } from '../components/Icons';
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

const inputCls = 'h-12 w-full rounded-xl border border-line-strong bg-white px-3';

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
          <div className="flex justify-between text-[15px]">
            <span>{t('web.itemsCount', { count })}</span>
            <b className="tabular-nums">{money(subtotal, currency)}</b>
          </div>
          {isDelivery ? (
            <div className="flex justify-between text-[15px] text-muted">
              <span>{t('common.deliveryFee')}</span>
              <span>{fee ? money(fee, currency) : t('web.feeConfirm')}</span>
            </div>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-line pt-1.5">
            <span className="font-bold">{t('order.totalToPay')}</span>
            <b className="text-2xl tabular-nums">{money(total, currency)}</b>
          </div>
          {isDelivery && co.address.text ? (
            <p className="text-sm text-muted">
              <b className="text-ink">{t('web.deliverTo')}:</b> {co.address.text}
              {co.address.landmark ? ` · ${co.address.landmark}` : ''}
            </p>
          ) : null}
          {type === 'takeaway' ? <p className="text-sm text-muted">{t('web.pickupInfo')}</p> : null}
          {customer.mode === 'none' && type === 'dine_in' ? (
            <p className="text-sm text-muted">{t('web.dineInfo')}</p>
          ) : null}
        </Card>

        {customer.mode === 'none' && !isDelivery ? (
          <Card className="flex flex-col gap-2">
            <b className="text-[15px]">{t('web.contact')}</b>
            <label htmlFor={nameId} className="text-[13px] font-bold">
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
            <label htmlFor={phoneId} className="text-[13px] font-bold">
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
          <h2 id="pay-title" className="text-[17px] font-extrabold">
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
                    'flex min-h-16 items-center gap-3 rounded-[14px] border-2 bg-white px-4 py-2.5 text-left shadow-card',
                    on ? 'border-primary bg-primary-tint' : 'border-line',
                  )}
                >
                  <span
                    aria-hidden
                    className={cn(
                      'flex size-6 shrink-0 items-center justify-center rounded-full border-2 text-white',
                      on ? 'border-primary bg-primary' : 'border-[#98A2B3]',
                    )}
                  >
                    {on ? <CheckIcon size={14} /> : null}
                  </span>
                  <span className="flex flex-col">
                    <b className="text-base">{m.title}</b>
                    <span className="text-sm text-muted">{m.sub}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {co.payment === 'aba' ? (
          <Card className="flex flex-col gap-2.5" data-testid="aba-panel">
            <b className="text-base">{t('web.abaTitle')}</b>
            <div className="flex items-baseline justify-between rounded-xl bg-bg px-3 py-2">
              <span className="text-sm">{t('web.abaAmount')}</span>
              <b className="text-xl tabular-nums">{money(total, currency)}</b>
            </div>
            <AbaAccountInfo settings={settings} />
            <ProofPicker value={proof} onChange={setProof} />
            {!proof ? <p className="text-xs text-muted">{t('web.proofLater')}</p> : null}
          </Card>
        ) : null}

        {tried && (needName || needDeliveryInfo) ? (
          <ul
            role="alert"
            className="flex flex-col gap-1 rounded-xl bg-danger-tint p-3 text-sm font-bold text-danger"
          >
            {needName ? <li>{t('web.needName')}</li> : null}
            {needDeliveryInfo ? <li>{t('web.needAddress')}</li> : null}
          </ul>
        ) : null}
      </main>

      <BottomBar>
        {gap > 0 ? (
          <p className="text-center text-sm font-bold text-danger" role="alert" data-testid="min-order">
            {t('web.minOrderShort', {
              amount: money(settings!.delivery.minOrder, currency),
              diff: money(gap, currency),
            })}
          </p>
        ) : null}
        {closed && settings ? (
          <p className="text-center text-sm font-bold text-danger" role="alert">
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
