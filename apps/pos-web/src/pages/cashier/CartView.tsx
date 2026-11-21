import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  convertMoney,
  formatMoney,
  hasPermission,
  tl,
  type CreateOrderRequest,
  type OrderDto,
  type UpdateOrderRequest,
} from '@pos/shared';
import { Button, EmptyState, Segmented, Sheet, cn, useToast } from '../../components/ui';
import {
  ChoiceButton,
  ConfirmSheet,
  MoneyInput,
  RoundStepper,
  Screen,
  ScreenFooter,
  Section,
  Switch,
  TextField,
  TopBar,
} from '../../components/common';
import { api, errorMessage, qk } from '../../lib/api';
import { useMe } from '../../lib/auth';
import {
  CART_KINDS,
  clearCart,
  computeCart,
  isDeliveryKind,
  isPlatformKind,
  kindToChannelType,
  setCart,
  setLineQty,
  useCart,
  type CartKind,
  type CartState,
} from '../../lib/cart';
import { useMoney, useStaffMenu } from '../../lib/data';

export function kindLabel(k: CartKind, t: (k: string) => string): string {
  if (k === 'grab' || k === 'foodpanda' || k === 'telegram') return t(`channel.${k}`);
  return t(`orderType.${k}`);
}

/** Validasi sebelum kirim; mengembalikan kunci pesan error atau null. */
export function cartProblem(c: CartState): string | null {
  if (!c.lines.length) return 'pesanan.errEmpty';
  if (c.kind === 'dine_in' && !c.tableId) return 'pesanan.errTable';
  if (isDeliveryKind(c.kind) && (!c.delivery.name.trim() || !c.delivery.addressText.trim())) return 'pesanan.errDelivery';
  return null;
}

export function buildOrderBody(c: CartState): CreateOrderRequest {
  const { channel, type } = kindToChannelType(c.kind);
  const delivery = isDeliveryKind(c.kind)
    ? {
        name: c.delivery.name.trim(),
        addressText: c.delivery.addressText.trim(),
        ...(c.delivery.phone.trim() ? { phone: c.delivery.phone.trim() } : {}),
        ...(c.delivery.landmark.trim() ? { landmark: c.delivery.landmark.trim() } : {}),
      }
    : undefined;
  const note = [c.kind === 'telegram' ? 'Telegram' : '', c.note.trim()].filter(Boolean).join(' · ');
  return {
    channel,
    type,
    items: c.lines.map((l) => ({ itemId: l.itemId, qty: l.qty, optionIds: l.optionIds, ...(l.note ? { note: l.note } : {}) })),
    ...(type === 'dine_in' && c.tableId ? { tableId: c.tableId } : {}),
    ...(isPlatformKind(c.kind) && c.displayNo.trim() ? { displayNo: c.displayNo.trim() } : {}),
    ...(c.customerName.trim() ? { customerName: c.customerName.trim() } : delivery ? { customerName: delivery.name } : {}),
    ...(delivery ? { delivery, deliveryFee: Math.max(0, c.deliveryFee) } : {}),
    ...(c.promoId ? { promoId: c.promoId } : {}),
    ...(c.discount && c.discount.value > 0 && !c.promoId ? { discount: c.discount } : {}),
    ...(note ? { note } : {}),
  };
}

export function CartView() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const { data: me } = useMe();
  const cart = useCart();
  const menu = useStaffMenu();
  const money = useMoney();
  const [extrasOpen, setExtrasOpen] = useState(!!(cart.note || cart.discount || cart.promoId || cart.customerName));
  const [feeOpen, setFeeOpen] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [showErrors, setShowErrors] = useState(false);
  const totals = useMemo(() => computeCart(cart, menu.data), [cart, menu.data]);
  const tables = useQuery({
    queryKey: qk.tables,
    queryFn: () => api.call('tablesList'),
    enabled: cart.kind === 'dine_in',
  });
  const canPromos = hasPermission(me?.permissions, 'menu.manage');
  const promos = useQuery({
    queryKey: ['admin', 'promos'],
    queryFn: () => api.call('adminPromosList'),
    enabled: canPromos && extrasOpen,
  });
  const problem = cartProblem(cart);
  const sendOnly = cart.kind === 'dine_in' || (isDeliveryKind(cart.kind) && cart.payOnDelivery);

  const submit = useMutation({
    mutationFn: async (): Promise<OrderDto> => {
      const body = buildOrderBody(cart);
      if (cart.editingOrderId) {
        const patch: UpdateOrderRequest = {
          items: body.items,
          type: body.type,
          note: body.note ?? null,
          customerName: body.customerName ?? null,
          displayNo: body.displayNo ?? null,
          promoId: body.promoId ?? null,
          discount: body.discount ?? null,
          ...(body.delivery ? { delivery: body.delivery, deliveryFee: body.deliveryFee } : {}),
        };
        return (await api.call('orderUpdate', { params: { id: cart.editingOrderId }, body: patch })).order;
      }
      return (await api.call('orderCreate', { body })).order;
    },
    onSuccess: (order) => {
      qc.setQueryData(qk.order(order.id), { order });
      void qc.invalidateQueries({ queryKey: ['orders'] });
      void qc.invalidateQueries({ queryKey: qk.tables });
      const keepKind = cart.kind;
      clearCart({ kind: keepKind === 'dine_in' ? 'takeaway' : keepKind });
      if (cart.kind === 'dine_in' && order.table) {
        toast.success(t('pesanan.sentToKitchen', { no: order.displayNo }));
        navigate(`/kasir/meja/${order.table.id}`, { replace: true });
      } else if (sendOnly || order.paymentStatus === 'paid') {
        toast.success(t('pesanan.sentToKitchen', { no: order.displayNo }));
        navigate('/kasir', { replace: true });
      } else navigate(`/kasir/bayar/${order.id}`, { replace: true });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const go = () => {
    if (problem) {
      setShowErrors(true);
      toast.error(t(problem));
      return;
    }
    submit.mutate();
  };

  const title = cart.editingDisplayNo ? t('kasir.editingOrder', { no: cart.editingDisplayNo }) : t('kasir.newOrder');
  const equivalents = money.others.map((c) => `≈ ${formatMoney(convertMoney(totals.total, money.main, c, money.rates), c)}`);

  return (
    <Screen testId="cart-screen">
      <TopBar back={{ label: t('common.menu'), onClick: () => navigate('/kasir') }} title={title} />
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-3.5 py-3">
        <Section title={<span className="text-[15px]">{t('cashier.orderType')}</span>}>
          <div role="radiogroup" aria-label={t('cashier.orderType')} className="grid grid-cols-3 gap-1.5">
            {CART_KINDS.map((k) => {
              const active = cart.kind === k;
              return (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  disabled={!!cart.editingOrderId && (k === 'grab' || k === 'foodpanda') !== isPlatformKind(cart.kind)}
                  onClick={() => setCart({ kind: k })}
                  className={cn(
                    'h-12 rounded-xl text-[15px] disabled:opacity-40',
                    active ? 'bg-primary font-extrabold text-white' : 'border border-line-strong bg-white font-semibold text-ink shadow-card',
                  )}
                >
                  {kindLabel(k, t)}
                </button>
              );
            })}
          </div>
          {isDeliveryKind(cart.kind) ? (
            <div className="mt-1 rounded-xl bg-info-tint px-3 py-2.5 text-sm leading-snug text-info-dark">
              <b>{t('pesanan.noDriverTitle')}</b> {t('pesanan.noDriverBody')}
            </div>
          ) : null}
          {cart.kind === 'dine_in' ? (
            <div className="mt-1 flex flex-col gap-1.5">
              <b className="text-sm">{t('cashier.chooseTable')}</b>
              {tables.isLoading ? <span className="text-sm text-muted">{t('common.loading')}</span> : null}
              <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="radiogroup" aria-label={t('cashier.chooseTable')}>
                {tables.data?.tables
                  .filter((tb) => tb.active)
                  .map((tb) => (
                    <ChoiceButton
                      key={tb.id}
                      role="radio"
                      aria-checked={cart.tableId === tb.id}
                      selected={cart.tableId === tb.id}
                      onClick={() => setCart({ tableId: tb.id })}
                      className="flex min-h-12 flex-col items-center justify-center py-1 text-[15px] leading-tight"
                    >
                      <span>{tb.name}</span>
                      {tb.status !== 'empty' ? <span className="text-[11px] font-bold text-info-dark">{t('tables.eating')}</span> : null}
                    </ChoiceButton>
                  ))}
              </div>
              {showErrors && !cart.tableId ? <span className="text-sm font-bold text-danger">{t('pesanan.errTable')}</span> : null}
            </div>
          ) : null}
          {isPlatformKind(cart.kind) ? (
            <TextField
              label={t('cashier.appCode')}
              hint={t('pesanan.appCodeHint')}
              placeholder={cart.kind === 'grab' ? 'GF-482' : 'FP-123'}
              value={cart.displayNo}
              maxLength={20}
              onChange={(e) => setCart({ displayNo: e.target.value })}
            />
          ) : null}
        </Section>

        {isDeliveryKind(cart.kind) ? (
          <Section title={<span className="text-[15px]">{t('pesanan.deliveryData')}</span>}>
            <TextField
              label={t('common.name')}
              value={cart.delivery.name}
              error={showErrors && !cart.delivery.name.trim() ? t('common.required') : null}
              onChange={(e) => setCart((c) => ({ delivery: { ...c.delivery, name: e.target.value } }))}
            />
            <TextField
              label={t('common.phone')}
              hint={`(${t('common.optional').toLowerCase()})`}
              type="tel"
              inputMode="tel"
              value={cart.delivery.phone}
              onChange={(e) => setCart((c) => ({ delivery: { ...c.delivery, phone: e.target.value } }))}
            />
            <TextField
              label={t('common.address')}
              value={cart.delivery.addressText}
              error={showErrors && !cart.delivery.addressText.trim() ? t('common.required') : null}
              onChange={(e) => setCart((c) => ({ delivery: { ...c.delivery, addressText: e.target.value } }))}
            />
            <TextField
              label={t('order.landmark')}
              placeholder={t('order.landmarkPlaceholder')}
              value={cart.delivery.landmark}
              onChange={(e) => setCart((c) => ({ delivery: { ...c.delivery, landmark: e.target.value } }))}
            />
            <Switch
              checked={cart.payOnDelivery}
              onChange={(v) => setCart({ payOnDelivery: v })}
              label={t('pesanan.payOnDelivery')}
              description={t('pesanan.payOnDeliveryHint')}
            />
          </Section>
        ) : null}

        <section className="shrink-0 rounded-card bg-white px-3 py-1 shadow-card" aria-label={t('cashier.cart')}>
          {!cart.lines.length ? <EmptyState title={t('cashier.emptyCart')} /> : null}
          {totals.lines.map((l) => {
            const name = l.item ? tl(l.item.name, lang) : `#${l.itemId}`;
            const unit = (l.unitPrice ?? 0) + l.optionsDelta;
            const sub = [l.options.map((o) => tl(o.name, lang)).join(' · '), l.note].filter(Boolean).join(' · ');
            return (
              <div key={l.key} className="flex items-center gap-2 border-b border-[#F2F4F7] py-3">
                <div className="flex min-w-0 grow flex-col gap-0.5">
                  <b className="text-base leading-snug">{name}</b>
                  <span className="text-sm text-muted tabular-nums">
                    {l.qty} × {formatMoney(unit, money.main, { noSymbol: true })} = {formatMoney(l.lineTotal, money.main)}
                  </span>
                  {sub ? <span className="text-[13px] font-bold text-danger">{sub}</span> : null}
                  {l.unitPrice === null || (l.item && !l.item.available) ? (
                    <span className="text-[13px] font-bold text-danger">{l.item && !l.item.available ? t('errors.ITEM_UNAVAILABLE') : t('kasir.notOnChannel')}</span>
                  ) : null}
                </div>
                <RoundStepper label={name} value={l.qty} onChange={(v) => setCart((c) => ({ lines: setLineQty(c.lines, l.key, v) }))} />
              </div>
            );
          })}
          <button
            type="button"
            aria-expanded={extrasOpen}
            onClick={() => setExtrasOpen((v) => !v)}
            className="h-12 w-full text-left text-[15px] font-bold text-primary"
          >
            {extrasOpen ? '− ' : '+ '}
            {t('pesanan.extras')}
          </button>
          {extrasOpen ? (
            <div className="flex flex-col gap-3 pb-3">
              {cart.kind !== 'dine_in' && !isDeliveryKind(cart.kind) ? (
                <TextField label={t('pesanan.customerName')} hint={`(${t('common.optional').toLowerCase()})`} value={cart.customerName} onChange={(e) => setCart({ customerName: e.target.value })} />
              ) : null}
              <TextField label={t('pesanan.orderNote')} placeholder={t('common.notePlaceholder')} value={cart.note} maxLength={300} onChange={(e) => setCart({ note: e.target.value })} />
              {canPromos && promos.data?.promos.some((p) => p.active) ? (
                <div className="flex flex-col gap-1">
                  <label htmlFor="promo" className="text-sm font-bold">
                    {t('cashier.promo')}
                  </label>
                  <select
                    id="promo"
                    value={cart.promoId ?? ''}
                    onChange={(e) => setCart({ promoId: e.target.value ? Number(e.target.value) : null, discount: e.target.value ? null : cart.discount })}
                    className="h-12 rounded-xl border border-line-strong bg-white px-3"
                  >
                    <option value="">{t('pesanan.noPromo')}</option>
                    {promos.data.promos
                      .filter((p) => p.active && (!p.channel || p.channel === kindToChannelType(cart.kind).channel))
                      .map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name} · {p.kind === 'pct' ? `${p.value}%` : formatMoney(p.value, money.main)}
                        </option>
                      ))}
                  </select>
                </div>
              ) : null}
              <div className="flex flex-col gap-1.5">
                <span className="text-sm font-bold">{t('cashier.manualDiscount')}</span>
                <Segmented
                  size="md"
                  label={t('cashier.manualDiscount')}
                  value={cart.discount?.kind ?? 'amount'}
                  onChange={(kind) => setCart((c) => ({ discount: { kind, value: c.discount?.kind === kind ? c.discount.value : 0 }, promoId: null }))}
                  options={[
                    { value: 'amount', label: money.main === 'KHR' ? 'Riel ៛' : money.main },
                    { value: 'pct', label: t('pesanan.percent') },
                  ]}
                />
                {cart.discount?.kind === 'pct' ? (
                  <div className="flex items-center gap-2">
                    <input
                      aria-label={t('pesanan.percent')}
                      inputMode="numeric"
                      value={cart.discount.value || ''}
                      onChange={(e) => {
                        const v = Math.min(100, Math.max(0, Number(e.target.value.replace(/\D/g, '')) || 0));
                        setCart({ discount: { kind: 'pct', value: v }, promoId: null });
                      }}
                      className="h-12 w-28 rounded-xl border border-line-strong px-3 text-right font-bold"
                    />
                    <b>%</b>
                    <span className="text-sm text-muted">{[5, 10, 20].map((p) => (
                      <button key={p} type="button" className="ml-1 min-h-10 rounded-lg border border-line-strong px-2 font-bold" onClick={() => setCart({ discount: { kind: 'pct', value: p }, promoId: null })}>
                        {p}%
                      </button>
                    ))}</span>
                  </div>
                ) : (
                  <MoneyInput
                    ariaLabel={t('cashier.manualDiscount')}
                    currency={money.main}
                    value={cart.discount?.value ?? null}
                    onChange={(v) => setCart({ discount: v ? { kind: 'amount', value: v } : null, promoId: null })}
                  />
                )}
              </div>
            </div>
          ) : null}
        </section>
      </main>

      <ScreenFooter>
        {isDeliveryKind(cart.kind) ? (
          <div className="flex items-center justify-between text-[15px] text-muted">
            <span>{t('pesanan.feeManual')}</span>
            <button type="button" onClick={() => setFeeOpen(true)} className="h-9 rounded-[10px] border border-line-strong bg-white px-3 text-sm font-bold text-ink shadow-card">
              {formatMoney(cart.deliveryFee, money.main)} · {t('common.edit')}
            </button>
          </div>
        ) : null}
        {totals.discountAmount > 0 ? (
          <div className="flex justify-between text-[15px] text-muted">
            <span>{t('common.discount')}</span>
            <span className="tabular-nums">-{formatMoney(totals.discountAmount, money.main)}</span>
          </div>
        ) : null}
        <div className="flex items-baseline justify-between">
          <span className="text-lg font-semibold">{t('common.total')}</span>
          <b className="text-[30px] tabular-nums" data-testid="cart-total">
            {formatMoney(totals.total, money.main)}
          </b>
        </div>
        {equivalents.length ? (
          <div className="-mt-1.5 flex justify-end gap-3 text-[13px] text-muted">
            {equivalents.map((e) => (
              <span key={e}>{e}</span>
            ))}
          </div>
        ) : null}
        <div className="flex gap-2.5">
          <button
            type="button"
            onClick={() => (cart.lines.length ? setConfirmCancel(true) : navigate('/kasir'))}
            className="h-[60px] w-24 rounded-[14px] border-2 border-[#F04438] bg-white text-[17px] font-bold text-danger shadow-card"
          >
            {t('common.cancel')}
          </button>
          <Button size="xl" className="h-[60px] grow text-[22px]" loading={submit.isPending} disabled={!cart.lines.length} onClick={go}>
            {sendOnly ? t('cashier.sendKitchen') : cart.editingOrderId ? t('pesanan.saveAndPay') : t('cashier.pay')}
          </Button>
        </div>
      </ScreenFooter>

      <Sheet
        open={feeOpen}
        onClose={() => setFeeOpen(false)}
        title={t('pesanan.feeManual')}
        closeLabel={t('common.close')}
        footer={
          <Button block onClick={() => setFeeOpen(false)}>
            {t('common.done')}
          </Button>
        }
      >
        <MoneyInput big autoFocus label={t('common.deliveryFee')} currency={money.main} value={cart.deliveryFee} onChange={(v) => setCart({ deliveryFee: v ?? 0 })} />
        <div className="mt-3 flex flex-wrap gap-2">
          {[0, 2000, 4000, 6000, 8000].map((v) => (
            <ChoiceButton key={v} selected={cart.deliveryFee === v} onClick={() => setCart({ deliveryFee: v })} className="px-3">
              {formatMoney(v, money.main)}
            </ChoiceButton>
          ))}
        </div>
      </Sheet>
      <ConfirmSheet
        open={confirmCancel}
        title={t('pesanan.cancelTitle')}
        message={t('pesanan.cancelBody')}
        confirmLabel={t('pesanan.cancelConfirm')}
        danger
        onClose={() => setConfirmCancel(false)}
        onConfirm={() => {
          clearCart();
          setConfirmCancel(false);
          navigate('/kasir');
        }}
      />
    </Screen>
  );
}
