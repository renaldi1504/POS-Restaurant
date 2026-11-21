/** Pilih alamat pengantaran — acuan: docs/mockups/Alamat.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useId, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { AddressDto, Lang } from '@pos/shared';
import { LocateIcon } from '../components/Icons';
import { PlaceholderMap } from '../components/PlaceholderMap';
import { Page } from '../components/Shell';
import { BottomBar, Button, cn, HeaderBar, useToast } from '../components/ui';
import { api, errorMessage, qk } from '../lib/api';
import { useCart } from '../lib/cart';
import { useCheckout } from '../lib/checkout';
import { useCustomer } from '../lib/customer';
import { cartTotals, mainCurrency, minOrderGap, money, useMenu, useSettings } from '../lib/menu';
import { getCurrentLocation, requestTelegramPhone } from '../lib/telegram';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const GoogleMapPicker = lazy(() => import('../components/GoogleMapPicker'));

const LABELS = [
  { value: 'Rumah', key: 'web.labelHome' },
  { value: 'Kantor', key: 'web.labelOffice' },
  { value: 'Hotel', key: 'web.labelHotel' },
  { value: 'Lainnya', key: 'web.labelOther' },
] as const;

const inputCls = 'h-12 w-full rounded-xl border border-line-strong bg-white px-3';

export default function AddressPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const qc = useQueryClient();
  const customer = useCustomer();
  const { state: co, update, updateAddress } = useCheckout();
  const { lines } = useCart();
  const { data: menu } = useMenu();
  const { data: settings } = useSettings();
  const currency = mainCurrency(settings);
  const { subtotal, count } = cartTotals(menu, lines);
  const gap = minOrderGap(subtotal, settings?.delivery.minOrder, true);
  const isTg = customer.mode === 'telegram';
  const canSave = isTg && customer.status === 'ready';
  const ids = { text: useId(), landmark: useId(), lat: useId(), lng: useId(), name: useId(), phone: useId() };

  const [dirty, setDirty] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locMsg, setLocMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);
  const [tried, setTried] = useState(false);
  const [phoneInput, setPhoneInput] = useState(false);
  const [latStr, setLatStr] = useState(co.address.lat?.toString() ?? '');
  const [lngStr, setLngStr] = useState(co.address.lng?.toString() ?? '');

  useEffect(() => {
    if (customer.mode === 'table') navigate(customer.homePath, { replace: true });
  }, [customer.mode, customer.homePath, navigate]);

  const addresses = useQuery({
    queryKey: qk.addresses,
    queryFn: () => api.call('publicAddressesList'),
    enabled: canSave,
  });

  const a = co.address;
  const point = a.lat !== null && a.lng !== null ? { lat: a.lat, lng: a.lng } : null;
  const center = point ?? { lat: settings?.lat ?? 10.6278, lng: settings?.lng ?? 103.5221 };

  const edit = (patch: Partial<typeof a>) => {
    updateAddress(patch);
    setDirty(true);
  };
  const setPoint = (p: { lat: number; lng: number }, text?: string) => {
    edit({ lat: p.lat, lng: p.lng, ...(text ? { text } : {}) });
    setLatStr(p.lat.toFixed(6));
    setLngStr(p.lng.toFixed(6));
  };
  const pickSaved = (s: AddressDto) => {
    updateAddress({
      addressId: s.id,
      label: s.label,
      text: s.text,
      landmark: s.landmark ?? '',
      lat: s.lat,
      lng: s.lng,
    });
    setLatStr(s.lat?.toString() ?? '');
    setLngStr(s.lng?.toString() ?? '');
    setDirty(false);
  };

  // Telegram: pakai alamat tersimpan pertama bila belum ada yang diisi.
  const saved = addresses.data?.addresses ?? [];
  useEffect(() => {
    if (saved.length && !a.addressId && !a.text && a.lat === null) pickSaved(saved[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved.length]);

  const locateMe = async () => {
    setLocating(true);
    setLocMsg(null);
    const r = await getCurrentLocation(customer.tg);
    setLocating(false);
    if (r.ok) {
      setPoint({ lat: r.lat, lng: r.lng });
      setLocMsg({ tone: 'ok', text: t('web.locationFound') });
    } else {
      setLocMsg({
        tone: 'err',
        text: r.reason === 'denied' ? t('web.locationDenied') : t('web.locationUnavailable'),
      });
    }
  };

  const sharePhone = async () => {
    const phone = await requestTelegramPhone(customer.tg);
    if (phone) {
      update({ phone });
      api.call('publicSessionUpdate', { body: { phone } }).catch(() => undefined);
    } else if (phone === '') {
      toast.success(t('web.phoneSentTg'));
    } else setPhoneInput(true);
  };

  const errors: string[] = [];
  if (!a.text.trim()) errors.push(t('web.needAddress'));
  if (isTg && !point) errors.push(t('web.needPoint'));
  if (!isTg && !co.name.trim()) errors.push(t('web.needName'));
  if (!isTg && !co.phone.trim()) errors.push(t('web.needPhone'));

  const save = useMutation({
    mutationFn: async () => {
      if (!canSave || !point) return;
      const body = {
        label: a.label || 'Rumah',
        text: a.text.trim(),
        landmark: a.landmark.trim() || undefined,
        lat: point.lat,
        lng: point.lng,
      };
      const res = a.addressId
        ? dirty
          ? await api.call('publicAddressUpdate', {
              params: { id: a.addressId },
              body: { ...body, landmark: body.landmark ?? null },
            })
          : null
        : await api.call('publicAddressCreate', { body });
      if (res) {
        updateAddress({ addressId: res.address.id });
        setDirty(false);
        void qc.invalidateQueries({ queryKey: qk.addresses });
      }
      const sessPhone = customer.session?.customer?.phone ?? '';
      if (co.phone.trim() && co.phone.trim() !== sessPhone) {
        await api.call('publicSessionUpdate', { body: { phone: co.phone.trim() } }).catch(() => undefined);
      }
    },
  });

  const onContinue = () => {
    setTried(true);
    if (errors.length || gap > 0) return;
    save.mutate(undefined, {
      onSuccess: () => navigate('/checkout'),
      onError: (e) => toast.error(errorMessage(e, t)),
    });
  };

  const locationButton = (
    <div className="flex flex-col gap-1.5">
      <button
        type="button"
        onClick={() => void locateMe()}
        disabled={locating}
        className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] border-2 border-info bg-info-tint text-base font-extrabold text-info-dark disabled:opacity-70"
      >
        <LocateIcon />
        {locating ? t('web.locating') : t('order.useMyLocation')}
      </button>
      {locMsg ? (
        <p
          role={locMsg.tone === 'err' ? 'alert' : 'status'}
          className={cn('text-sm font-semibold', locMsg.tone === 'err' ? 'text-danger' : 'text-primary-dark')}
        >
          {locMsg.text}
        </p>
      ) : null}
    </div>
  );

  return (
    <Page testId="address-page">
      <HeaderBar
        title={t('web.addressTitle')}
        onBack={() => navigate('/keranjang')}
        backLabel={t('common.back')}
        right={
          <span className="shrink-0 rounded-[7px] bg-info-tint px-2 py-1 text-xs font-extrabold text-info-dark">
            {t('web.typeDelivery')}
          </span>
        }
      />

      {MAPS_KEY ? (
        <Suspense fallback={<div className="h-[250px] animate-pulse bg-[#E8EDE4]" />}>
          <GoogleMapPicker
            apiKey={MAPS_KEY}
            lang={i18n.language as Lang}
            center={center}
            point={point}
            onPick={setPoint}
            mapLabel={t('web.mapLabel')}
            pinLabel={t('web.pinHere')}
            dragHint={t('web.dragHint')}
            searchLabel={t('web.searchPlace')}
          >
            {locationButton}
          </GoogleMapPicker>
        </Suspense>
      ) : (
        <>
          <PlaceholderMap
            label={t('web.mapLabel')}
            pinLabel={t('web.pinHere')}
            note={t('web.mapPlaceholder')}
            point={point}
          />
          <div className="px-3.5 pt-3">{locationButton}</div>
        </>
      )}

      <main className="flex grow flex-col gap-2.5 px-3.5 pb-4 pt-2.5">
        {saved.length ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] text-muted">{t('web.savedShort')}</span>
            {saved.map((s) => {
              const on = s.id === a.addressId;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickSaved(s)}
                  className={cn(
                    'h-11 rounded-full px-3.5 text-sm',
                    on
                      ? 'border-[1.5px] border-primary bg-primary-tint font-extrabold text-primary-dark'
                      : 'border border-line-strong bg-white font-semibold shadow-card',
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-1 rounded-xl bg-white px-3 py-2.5 shadow-card">
          <label htmlFor={ids.text} className="text-[13px] font-bold">
            {t('web.addressText')}
          </label>
          <textarea
            id={ids.text}
            rows={2}
            maxLength={300}
            value={a.text}
            onChange={(e) => edit({ text: e.target.value })}
            placeholder={t('web.addressTextPlaceholder')}
            className="rounded-lg border border-line-strong p-2.5"
          />
          <span className="text-xs text-muted">{point ? t('web.pointHint') : t('web.noPoint')}</span>
        </div>

        {!MAPS_KEY ? (
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 text-[13px] font-bold">{t('order.manualLatLng')}</legend>
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.lat} className="text-xs text-muted">
                {t('web.lat')}
              </label>
              <input
                id={ids.lat}
                inputMode="decimal"
                value={latStr}
                onChange={(e) => {
                  setLatStr(e.target.value);
                  const v = Number(e.target.value);
                  edit({ lat: e.target.value.trim() && Number.isFinite(v) && Math.abs(v) <= 90 ? v : null });
                }}
                placeholder="10.6278"
                className={inputCls}
              />
            </div>
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.lng} className="text-xs text-muted">
                {t('web.lng')}
              </label>
              <input
                id={ids.lng}
                inputMode="decimal"
                value={lngStr}
                onChange={(e) => {
                  setLngStr(e.target.value);
                  const v = Number(e.target.value);
                  edit({ lng: e.target.value.trim() && Number.isFinite(v) && Math.abs(v) <= 180 ? v : null });
                }}
                placeholder="103.5221"
                className={inputCls}
              />
            </div>
          </fieldset>
        ) : null}

        <label htmlFor={ids.landmark} className="text-[13px] font-bold">
          {t('web.landmark')}
        </label>
        <input
          id={ids.landmark}
          value={a.landmark}
          maxLength={200}
          onChange={(e) => edit({ landmark: e.target.value })}
          placeholder={t('web.landmarkPlaceholder')}
          className={cn(inputCls, '-mt-1.5')}
        />

        {canSave ? (
          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-bold" id="label-title">
              {t('web.saveAs')}
            </span>
            <div role="radiogroup" aria-labelledby="label-title" className="flex flex-wrap gap-1.5">
              {LABELS.map((l) => (
                <button
                  key={l.value}
                  type="button"
                  role="radio"
                  aria-checked={a.label === l.value}
                  onClick={() => edit({ label: l.value })}
                  className={cn(
                    'h-11 rounded-full px-3.5 text-sm',
                    a.label === l.value
                      ? 'bg-ink font-bold text-white'
                      : 'border border-line-strong bg-white font-semibold',
                  )}
                >
                  {t(l.key)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {isTg ? (
          <>
            <div className="flex items-center gap-2.5 rounded-xl bg-info-tint px-3 py-2.5">
              <span
                aria-hidden
                className="flex size-8 shrink-0 items-center justify-center rounded-full bg-info text-xs font-extrabold text-white"
              >
                TG
              </span>
              <span className="flex flex-col">
                <b className="text-sm text-info-dark">
                  {t('web.tgContact', {
                    user: customer.tgUser?.username
                      ? `@${customer.tgUser.username}`
                      : customer.session?.customer?.username
                        ? `@${customer.session.customer.username}`
                        : (customer.tgUser?.first_name ?? ''),
                  })}
                </b>
                <span className="text-xs text-info-dark">{t('web.tgContactNote')}</span>
              </span>
            </div>
            {co.phone ? (
              <p className="text-sm font-semibold">{t('web.phoneShared', { phone: co.phone })}</p>
            ) : null}
            {phoneInput ? (
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.phone} className="text-[13px] font-bold">
                  {t('order.phoneOptional')}
                </label>
                <input
                  id={ids.phone}
                  type="tel"
                  autoComplete="tel"
                  value={co.phone}
                  onChange={(e) => update({ phone: e.target.value })}
                  placeholder={t('web.phonePlaceholder')}
                  className={inputCls}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void sharePhone()}
                className="min-h-11 rounded-[10px] border border-dashed border-[#98A2B3] text-sm font-bold text-[#475467]"
              >
                {t('web.sharePhone')}
              </button>
            )}
          </>
        ) : (
          <fieldset className="flex flex-col gap-2 rounded-xl bg-white p-3 shadow-card">
            <legend className="sr-only">{t('web.contact')}</legend>
            <b className="text-[15px]">{t('web.contact')}</b>
            <label htmlFor={ids.name} className="text-[13px] font-bold">
              {t('web.yourName')}
            </label>
            <input
              id={ids.name}
              autoComplete="name"
              value={co.name}
              maxLength={100}
              onChange={(e) => update({ name: e.target.value })}
              className={inputCls}
            />
            <label htmlFor={ids.phone} className="text-[13px] font-bold">
              {t('order.phone')}
            </label>
            <input
              id={ids.phone}
              type="tel"
              autoComplete="tel"
              value={co.phone}
              maxLength={50}
              onChange={(e) => update({ phone: e.target.value })}
              placeholder={t('web.phonePlaceholder')}
              className={inputCls}
            />
          </fieldset>
        )}

        {tried && errors.length ? (
          <ul
            role="alert"
            className="flex flex-col gap-1 rounded-xl bg-danger-tint p-3 text-sm font-bold text-danger"
          >
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
      </main>

      <BottomBar>
        <div className="flex justify-between gap-2 text-sm">
          <span>
            {t('web.itemsCount', { count })} ·{' '}
            {settings?.delivery.defaultFee
              ? `${t('common.deliveryFee')} ${money(settings.delivery.defaultFee, currency)}`
              : t('web.feeNote')}
          </span>
          <b className="shrink-0 tabular-nums">{money(subtotal, currency)}</b>
        </div>
        {gap > 0 ? (
          <p className="text-center text-sm font-bold text-danger" role="alert" data-testid="min-order">
            {t('web.minOrderShort', {
              amount: money(settings!.delivery.minOrder, currency),
              diff: money(gap, currency),
            })}
          </p>
        ) : null}
        <Button
          size="lg"
          block
          onClick={onContinue}
          loading={save.isPending}
          disabled={gap > 0 || count === 0}
        >
          {t('web.toPayment')} ›
        </Button>
      </BottomBar>
    </Page>
  );
}
