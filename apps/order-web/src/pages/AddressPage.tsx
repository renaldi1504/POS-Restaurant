/** Pilih alamat pengantaran — acuan: docs/mockups/Alamat.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { AddressDto, Lang } from '@pos/shared';
import { LocateIcon } from '../components/Icons';
import { PlaceholderMap } from '../components/PlaceholderMap';
import { Page } from '../components/Shell';
import { BottomBar, Button, cn, HeaderBar, Icon, useToast } from '../components/ui';
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

const inputCls =
  'h-14 w-full rounded-xs border border-outline bg-surface-container-lowest px-4 text-body-large outline-primary focus:border-primary focus:outline-1';

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
  // Alamat yang diisi otomatis dari titik (GPS / geser pin). Teks yang diketik sendiri tidak ditimpa.
  const autoText = useRef<string | null>(null);
  const textRef = useRef(a.text);
  textRef.current = a.text;
  const [geocoding, setGeocoding] = useState(false);
  const canAutofill = () => !textRef.current.trim() || textRef.current === autoText.current;
  const autofill = (text: string) => {
    if (!canAutofill()) return;
    autoText.current = text;
    edit({ text });
  };
  /** Isi alamat lengkap dari titik lewat server (Google Geocoding / OpenStreetMap). */
  const fillFromPoint = async (p: { lat: number; lng: number }) => {
    if (!canAutofill()) return;
    setGeocoding(true);
    const r = await api
      .call('publicReverseGeocode', {
        query: { lat: p.lat, lng: p.lng, lang: i18n.language as Lang },
      })
      .catch(() => null);
    setGeocoding(false);
    autofill(r?.text ?? t('web.gpsPoint', { coords: `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}` }));
  };
  const setPoint = (p: { lat: number; lng: number }, text?: string) => {
    edit({ lat: p.lat, lng: p.lng });
    setLatStr(p.lat.toFixed(6));
    setLngStr(p.lng.toFixed(6));
    if (text) autofill(text);
    else void fillFromPoint(p);
  };
  const pickSaved = (s: AddressDto) => {
    autoText.current = null;
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
        className="state-layer flex h-14 items-center justify-center gap-2 rounded-full bg-tertiary-container text-label-large text-on-tertiary-container disabled:opacity-70"
      >
        <LocateIcon />
        {locating ? t('web.locating') : t('order.useMyLocation')}
      </button>
      {locMsg ? (
        <p
          role={locMsg.tone === 'err' ? 'alert' : 'status'}
          className={cn(
            'text-label-medium font-medium',
            locMsg.tone === 'err' ? 'text-error' : 'text-primary',
          )}
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
          <span className="shrink-0 rounded-[7px] bg-tertiary-container px-2 py-1 text-label-medium font-medium text-on-tertiary-container">
            {t('web.typeDelivery')}
          </span>
        }
      />

      {MAPS_KEY ? (
        <Suspense fallback={<div className="h-[250px] animate-pulse bg-surface-container-highest" />}>
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
            <span className="text-label-medium text-on-surface-variant">{t('web.savedShort')}</span>
            {saved.map((s) => {
              const on = s.id === a.addressId;
              return (
                <button
                  key={s.id}
                  type="button"
                  aria-pressed={on}
                  onClick={() => pickSaved(s)}
                  className={cn(
                    'h-11 rounded-full px-3.5 text-label-medium',
                    on
                      ? 'border-[1.5px] border-primary bg-secondary-container font-medium text-on-secondary-container'
                      : 'border border-outline-variant bg-surface-container-lowest font-medium',
                  )}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="flex flex-col gap-1 rounded-md bg-surface-container-lowest px-3 py-2.5">
          <label htmlFor={ids.text} className="text-label-medium font-medium">
            {t('web.addressText')}
          </label>
          <textarea
            id={ids.text}
            rows={2}
            maxLength={300}
            value={a.text}
            onChange={(e) => edit({ text: e.target.value })}
            placeholder={t('web.addressTextPlaceholder')}
            className="rounded-sm border border-outline-variant p-2.5"
          />
          <span className="text-label-medium text-on-surface-variant" aria-live="polite">
            {geocoding
              ? t('web.fillingAddress')
              : point && a.text && a.text === autoText.current
                ? t('web.addressAuto')
                : point
                  ? t('web.pointHint')
                  : t('web.noPoint')}
          </span>
        </div>

        {!MAPS_KEY ? (
          <fieldset className="grid grid-cols-2 gap-2">
            <legend className="mb-1 text-label-medium font-medium">{t('order.manualLatLng')}</legend>
            <div className="flex flex-col gap-1">
              <label htmlFor={ids.lat} className="text-label-medium text-on-surface-variant">
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
              <label htmlFor={ids.lng} className="text-label-medium text-on-surface-variant">
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

        <label htmlFor={ids.landmark} className="text-label-medium font-medium">
          {t('web.landmark')}{' '}
          <span className="font-normal text-on-surface-variant">({t('common.optional').toLowerCase()})</span>
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
            <span className="text-label-medium font-medium" id="label-title">
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
                    'state-layer flex h-10 items-center gap-1 rounded-sm px-3 text-label-large',
                    a.label === l.value
                      ? 'bg-secondary-container text-on-secondary-container'
                      : 'border border-outline-variant bg-surface-container-lowest text-on-surface-variant',
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
            <div className="flex items-center gap-3 rounded-md bg-tertiary-container px-3 py-2.5 text-on-tertiary-container">
              <span
                aria-hidden
                className="flex size-10 shrink-0 items-center justify-center rounded-full bg-tertiary text-on-tertiary"
              >
                <Icon name="send" size={20} />
              </span>
              <span className="flex flex-col">
                <b className="text-label-large">
                  {t('web.tgContact', {
                    user: customer.tgUser?.username
                      ? `@${customer.tgUser.username}`
                      : customer.session?.customer?.username
                        ? `@${customer.session.customer.username}`
                        : (customer.tgUser?.first_name ?? ''),
                  })}
                </b>
                <span className="text-label-medium font-normal">{t('web.tgContactNote')}</span>
              </span>
            </div>
            {co.phone ? (
              <p className="text-label-medium font-medium">{t('web.phoneShared', { phone: co.phone })}</p>
            ) : null}
            {phoneInput ? (
              <div className="flex flex-col gap-1">
                <label htmlFor={ids.phone} className="text-label-medium font-medium">
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
                className="state-layer flex min-h-12 items-center justify-center gap-2 rounded-full border border-outline text-label-large text-primary"
              >
                {t('web.sharePhone')}
              </button>
            )}
          </>
        ) : (
          <fieldset className="flex flex-col gap-2 rounded-md bg-surface-container-lowest p-3">
            <legend className="sr-only">{t('web.contact')}</legend>
            <b className="text-body-medium">{t('web.contact')}</b>
            <label htmlFor={ids.name} className="text-label-medium font-medium">
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
            <label htmlFor={ids.phone} className="text-label-medium font-medium">
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
            className="flex flex-col gap-1 rounded-md bg-error-container p-3 text-label-medium font-medium text-on-error-container"
          >
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        ) : null}
      </main>

      <BottomBar>
        <div className="flex justify-between gap-2 text-label-medium">
          <span>
            {t('web.itemsCount', { count })} ·{' '}
            {settings?.delivery.defaultFee
              ? `${t('common.deliveryFee')} ${money(settings.delivery.defaultFee, currency)}`
              : t('web.feeNote')}
          </span>
          <b className="shrink-0 tabular-nums">{money(subtotal, currency)}</b>
        </div>
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
        <Button
          size="lg"
          block
          onClick={onContinue}
          loading={save.isPending}
          disabled={gap > 0 || count === 0}
        >
          {t('web.toPayment')}
          <Icon name="arrow_forward" />
        </Button>
      </BottomBar>
    </Page>
  );
}
