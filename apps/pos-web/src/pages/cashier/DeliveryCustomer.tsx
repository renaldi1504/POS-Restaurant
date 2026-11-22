/**
 * "Data pengantaran" di layar Order baru (delivery & Telegram):
 * cari pelanggan lama → alamat tersimpan otomatis terpilih → ganti / alamat baru (Places, tempel link lokasi,
 * atau ketik manual). Alamat baru disimpan ke pelanggan supaya order berikutnya tinggal pilih.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { mapsDirectionsUrl, type CustomerSearchItem, type LatLng, type StaffAddressDto } from '@pos/shared';
import { Button, Icon, Sheet, cn, useToast } from '../../components/ui';
import { Banner, TextField } from '../../components/common';
import { api, errorMessage } from '../../lib/api';
import { setCart, useCart, type CartState, type PickedCustomer } from '../../lib/cart';
import { formatDayLabel } from '../../lib/format';
import { formatPoint, locateFromText, looksLikeLocation } from '../../lib/locationLink';
import { useLang } from '../../lib/useLang';

const MAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
const PlacesSearch = lazy(() => import('./PlacesSearch'));

export const customerKeys = {
  search: (q: string) => ['customers', 'search', q] as const,
  addresses: (id: number) => ['customers', id, 'addresses'] as const,
};

const displayName = (c: { name: string | null; username: string | null; phone: string | null }) =>
  c.name || (c.username ? `@${c.username}` : '') || c.phone || '—';

function toPicked(c: CustomerSearchItem | PickedCustomer): PickedCustomer {
  return { id: c.id, name: c.name, username: c.username, phone: c.phone, telegramId: c.telegramId };
}

/** Pakai alamat tersimpan: isi teks/patokan/titik dari alamat itu. */
export function applySavedAddress(a: StaffAddressDto) {
  setCart((c) => ({
    addressId: a.id,
    delivery: { ...c.delivery, addressText: a.text, landmark: a.landmark ?? '', lat: a.lat, lng: a.lng },
  }));
}

function startNewAddress() {
  setCart((c) => ({
    addressId: null,
    delivery: { ...c.delivery, addressText: '', landmark: '', lat: null, lng: null },
  }));
}

/** Pilih pelanggan dari hasil cari: isi nama/HP + alamat utama (terakhir dipakai). */
export function pickCustomer(c: CustomerSearchItem) {
  setCart((cur) => ({
    customer: toPicked(c),
    delivery: {
      ...cur.delivery,
      name: c.name || (c.username ? `@${c.username}` : '') || cur.delivery.name,
      phone: c.phone ?? '',
    },
  }));
  if (c.lastAddress) applySavedAddress(c.lastAddress);
  else startNewAddress();
}

function clearCustomer() {
  setCart({
    customer: null,
    addressId: null,
    delivery: { name: '', phone: '', addressText: '', landmark: '', lat: null, lng: null },
  });
}

function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setV(value), ms);
    return () => clearTimeout(id);
  }, [value, ms]);
  return v;
}

// ---------------- Cari pelanggan ----------------
function CustomerSearch() {
  const { t } = useTranslation();
  const lang = useLang();
  const [q, setQ] = useState('');
  const dq = useDebounced(q.trim(), 300);
  const search = useQuery({
    queryKey: customerKeys.search(dq),
    queryFn: () => api.call('customersSearch', { query: { q: dq } }),
    enabled: dq.length >= 1,
    staleTime: 10_000,
  });
  const results = dq.length >= 1 ? (search.data?.customers ?? []) : [];
  return (
    <div className="flex flex-col gap-2">
      <TextField
        type="search"
        label={t('pelanggan.searchLabel')}
        placeholder={t('pelanggan.searchPlaceholder')}
        value={q}
        autoComplete="off"
        onChange={(e) => setQ(e.target.value)}
        data-testid="customer-search"
      />
      {dq && search.isFetching && !search.data ? (
        <span className="px-1 text-label-medium text-on-surface-variant">{t('common.loading')}</span>
      ) : null}
      {dq && search.data && !results.length ? (
        <span className="px-1 text-body-medium text-on-surface-variant" role="status">
          {t('pelanggan.notFound')}
        </span>
      ) : null}
      {results.length ? (
        <ul className="flex max-h-[420px] flex-col gap-2 overflow-y-auto" aria-label={t('pelanggan.results')}>
          {results.map((c) => (
            <li key={c.id}>
              <button
                type="button"
                onClick={() => {
                  pickCustomer(c);
                  setQ('');
                }}
                data-testid="customer-result"
                className="state-layer flex min-h-[72px] w-full items-start gap-3 rounded-md border border-outline-variant bg-surface-container-lowest p-3 text-left"
              >
                <span
                  className={cn(
                    'mt-0.5 flex size-10 shrink-0 items-center justify-center rounded-full',
                    c.telegramId
                      ? 'bg-tertiary-container text-on-tertiary-container'
                      : 'bg-secondary-container text-on-secondary-container',
                  )}
                  aria-hidden
                >
                  <Icon name={c.telegramId ? 'send' : 'person'} size={20} />
                </span>
                <span className="flex min-w-0 grow flex-col gap-0.5">
                  <b className="truncate text-title-medium">{displayName(c)}</b>
                  {c.username || c.phone ? (
                    <span className="truncate text-body-medium text-on-surface-variant">
                      {[c.username ? `@${c.username}` : null, c.phone].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                  {c.lastAddress ? (
                    <span className="flex items-center gap-1 text-body-medium text-on-surface-variant">
                      <Icon name="location_on" size={16} className="shrink-0" />
                      <span className="truncate">{c.lastAddress.text}</span>
                    </span>
                  ) : null}
                  {c.orderCount ? (
                    <span className="text-label-medium text-on-surface-variant">
                      {t('pelanggan.orderCount', { count: c.orderCount })}
                      {c.lastOrderAt
                        ? ` · ${t('pelanggan.lastOrder', {
                            date: formatDayLabel(c.lastOrderAt.slice(0, 10), lang, { weekday: false }),
                          })}`
                        : ''}
                    </span>
                  ) : null}
                </span>
                <Icon name="chevron_right" className="mt-2 shrink-0 text-on-surface-variant" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function PickedCustomerCard({ c }: { c: PickedCustomer }) {
  const { t } = useTranslation();
  return (
    <div
      className="flex items-center gap-3 rounded-md border border-outline-variant bg-surface-container-lowest p-3"
      data-testid="picked-customer"
    >
      <span
        className={cn(
          'flex size-10 shrink-0 items-center justify-center rounded-full',
          c.telegramId
            ? 'bg-tertiary-container text-on-tertiary-container'
            : 'bg-secondary-container text-on-secondary-container',
        )}
        aria-hidden
      >
        <Icon name={c.telegramId ? 'send' : 'person'} size={20} />
      </span>
      <span className="flex min-w-0 grow flex-col">
        <b className="truncate text-title-medium">{displayName(c)}</b>
        <span className="truncate text-body-medium text-on-surface-variant">
          {c.telegramId ? t('pelanggan.telegramCustomer') : t('pelanggan.savedCustomer')}
        </span>
        {c.username || c.phone ? (
          <span className="truncate text-body-medium text-on-surface-variant">
            {[c.username ? `@${c.username}` : null, c.phone].filter(Boolean).join(' · ')}
          </span>
        ) : null}
      </span>
      <Button variant="outlined" className="shrink-0 px-4" onClick={clearCustomer}>
        {t('pelanggan.change')}
      </Button>
    </div>
  );
}

// ---------------- Alamat ----------------
function PointBadge({ point }: { point: LatLng | null }) {
  const { t } = useTranslation();
  return point ? (
    <span className="inline-flex items-center gap-1 text-label-large text-primary" data-testid="point-set">
      <Icon name="location_on" size={18} filled />
      {t('pelanggan.pointSet')}
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-label-large text-on-surface-variant">
      <Icon name="location_off" size={18} />
      {t('pelanggan.noPoint')}
    </span>
  );
}

function AddressCard({
  cart,
  canChange,
  onChange,
}: {
  cart: CartState;
  canChange: boolean;
  onChange: () => void;
}) {
  const { t } = useTranslation();
  const d = cart.delivery;
  const point = d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null;
  return (
    <div
      className="flex flex-col gap-2 rounded-md border-2 border-primary bg-surface-container-lowest p-3"
      data-testid="address-card"
    >
      <span className="text-label-medium text-on-surface-variant">{t('pelanggan.savedAddress')}</span>
      <b className="text-title-medium">{d.addressText}</b>
      {d.landmark ? (
        <span className="text-body-medium text-on-surface-variant">
          {t('order.landmark')}: {d.landmark}
        </span>
      ) : null}
      <PointBadge point={point} />
      <div className="mt-1 flex flex-wrap gap-2">
        <Button
          variant="tonal"
          icon="edit_note"
          disabled={!canChange}
          onClick={onChange}
          className="grow whitespace-nowrap px-4"
        >
          {t('pelanggan.changeAddress')}
        </Button>
        <Button
          variant="outlined"
          icon="add_location_alt"
          onClick={startNewAddress}
          className="grow whitespace-nowrap px-4"
        >
          {t('pelanggan.newAddress')}
        </Button>
      </div>
    </div>
  );
}

function AddressPickerSheet({
  open,
  onClose,
  addresses,
  selectedId,
}: {
  open: boolean;
  onClose: () => void;
  addresses: StaffAddressDto[];
  selectedId: number | null;
}) {
  const { t } = useTranslation();
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t('pelanggan.chooseAddress')}
      closeLabel={t('common.close')}
      footer={
        <Button
          variant="outlined"
          block
          icon="add_location_alt"
          onClick={() => {
            startNewAddress();
            onClose();
          }}
        >
          {t('pelanggan.newAddress')}
        </Button>
      }
    >
      <div role="radiogroup" aria-label={t('pelanggan.chooseAddress')} className="flex flex-col gap-2">
        {addresses.map((a) => {
          const sel = a.id === selectedId;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={sel}
              onClick={() => {
                applySavedAddress(a);
                onClose();
              }}
              className={cn(
                'state-layer flex min-h-[72px] w-full items-start gap-3 rounded-md p-3 text-left',
                sel
                  ? 'border-2 border-primary bg-secondary-container text-on-secondary-container'
                  : 'border border-outline-variant bg-surface-container-lowest',
              )}
            >
              <Icon name={sel ? 'check_circle' : 'location_on'} className="mt-0.5 shrink-0" filled={sel} />
              <span className="flex min-w-0 grow flex-col gap-0.5">
                <b className="text-title-medium">{a.text}</b>
                {a.landmark ? <span className="text-body-medium">{a.landmark}</span> : null}
                <PointBadge point={a.lat != null && a.lng != null ? { lat: a.lat, lng: a.lng } : null} />
              </span>
            </button>
          );
        })}
      </div>
    </Sheet>
  );
}

type LinkStatus =
  | { kind: 'idle' }
  | { kind: 'busy' }
  | { kind: 'found'; text: 'filled' | 'notFound' | 'loading' }
  | { kind: 'unknown' }
  | { kind: 'no_point' }
  | { kind: 'error'; message: string };

function NewAddressForm({
  cart,
  showErrors,
  savedCount,
  onPickSaved,
}: {
  cart: CartState;
  showErrors: boolean;
  savedCount: number;
  onPickSaved: () => void;
}) {
  const { t } = useTranslation();
  const lang = useLang();
  const qc = useQueryClient();
  const toast = useToast();
  const d = cart.delivery;
  const point = d.lat != null && d.lng != null ? { lat: d.lat, lng: d.lng } : null;
  const [link, setLink] = useState('');
  const [status, setStatus] = useState<LinkStatus>({ kind: 'idle' });
  const autoText = useRef<string | null>(null);
  const seq = useRef(0);

  const fillFromPoint = async (p: LatLng, knownText?: string) => {
    const mine = ++seq.current;
    setCart((c) => ({ delivery: { ...c.delivery, lat: p.lat, lng: p.lng } }));
    const canOverwrite = (cur: string) => !cur.trim() || cur === autoText.current;
    if (knownText) {
      setCart((c) =>
        canOverwrite(c.delivery.addressText) ? { delivery: { ...c.delivery, addressText: knownText } } : {},
      );
      autoText.current = knownText;
      setStatus({ kind: 'found', text: 'filled' });
      return;
    }
    setStatus({ kind: 'found', text: 'loading' });
    try {
      const r = await api.call('publicReverseGeocode', { query: { lat: p.lat, lng: p.lng, lang } });
      if (mine !== seq.current) return;
      if (r.text) {
        const text = r.text;
        setCart((c) =>
          canOverwrite(c.delivery.addressText) ? { delivery: { ...c.delivery, addressText: text } } : {},
        );
        autoText.current = text;
        setStatus({ kind: 'found', text: 'filled' });
      } else setStatus({ kind: 'found', text: 'notFound' });
    } catch {
      if (mine === seq.current) setStatus({ kind: 'found', text: 'notFound' });
    }
  };

  const processLink = async (text: string) => {
    if (!text.trim()) return setStatus({ kind: 'idle' });
    setStatus({ kind: 'busy' });
    try {
      const r = await locateFromText(text, (url) => api.call('geoResolveLink', { body: { url } }));
      if (r.kind === 'point') await fillFromPoint(r.point);
      else if (r.kind === 'empty') setStatus({ kind: 'idle' });
      else setStatus({ kind: r.kind });
    } catch (e) {
      setStatus({ kind: 'error', message: errorMessage(e, t) });
    }
  };

  // Diproses otomatis setelah ditempel/diketik (jeda singkat).
  const dLink = useDebounced(link, 350);
  useEffect(() => {
    if (looksLikeLocation(dLink)) void processLink(dLink);
    else if (!dLink.trim()) setStatus({ kind: 'idle' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dLink]);

  const pasteFromClipboard = async () => {
    try {
      const text = await navigator.clipboard.readText();
      setLink(text);
      void processLink(text);
    } catch {
      toast.error(t('pelanggan.pasteDenied'));
    }
  };

  const save = useMutation({
    mutationFn: async () => {
      const c = cart.customer!;
      return (
        await api.call('customerAddressCreate', {
          params: { id: c.id },
          body: {
            text: d.addressText.trim(),
            ...(d.landmark.trim() ? { landmark: d.landmark.trim() } : {}),
            ...(point ? { lat: point.lat, lng: point.lng } : {}),
          },
        })
      ).address;
    },
    onSuccess: (a) => {
      void qc.invalidateQueries({ queryKey: ['customers'] });
      applySavedAddress(a);
      setLink('');
      setStatus({ kind: 'idle' });
      toast.success(t('pelanggan.addressSaved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const statusLine = (() => {
    switch (status.kind) {
      case 'busy':
        return <span className="text-body-medium text-on-surface-variant">{t('pelanggan.linkBusy')}</span>;
      case 'found':
        return (
          <span className="flex flex-col gap-0.5 text-body-medium" role="status" data-testid="link-status">
            <span className="flex items-center gap-1 font-medium text-primary">
              <Icon name="check_circle" size={18} filled />
              {t('pelanggan.linkFound')} {point ? `(${formatPoint(point)})` : ''}
            </span>
            <span className="text-on-surface-variant">
              {status.text === 'loading'
                ? t('pelanggan.fillingAddress')
                : status.text === 'filled'
                  ? t('pelanggan.addressFilled')
                  : t('pelanggan.addressNotFound')}
            </span>
          </span>
        );
      case 'unknown':
      case 'no_point':
      case 'error':
        return (
          <span className="flex items-center gap-1 text-body-medium text-error" role="alert">
            <Icon name="error" size={18} />
            {status.kind === 'error'
              ? status.message
              : status.kind === 'unknown'
                ? t('pelanggan.linkUnknown')
                : t('pelanggan.linkNoPoint')}
          </span>
        );
      default:
        return null;
    }
  })();

  return (
    <div className="flex flex-col gap-3" data-testid="new-address">
      <div className="flex flex-wrap items-center justify-between gap-x-2">
        <b className="whitespace-nowrap text-title-medium">{t('pelanggan.newAddress')}</b>
        {savedCount ? (
          <Button variant="text" className="-mx-3 whitespace-nowrap px-3" onClick={onPickSaved}>
            {t('pelanggan.useSaved', { count: savedCount })}
          </Button>
        ) : null}
      </div>

      {MAPS_KEY ? (
        <Suspense fallback={null}>
          <PlacesSearch
            apiKey={MAPS_KEY}
            lang={lang}
            label={t('pelanggan.placesSearch')}
            onPick={(p, text) => {
              setLink('');
              void fillFromPoint(p, text);
            }}
          />
        </Suspense>
      ) : null}

      <div className="flex flex-col gap-1.5 rounded-md bg-surface-container p-3">
        <span className="flex items-center gap-1 text-label-large">
          <Icon name="link" size={18} />
          {t('pelanggan.linkTitle')}
        </span>
        <span className="text-body-medium text-on-surface-variant">{t('pelanggan.linkHint')}</span>
        <div className="flex flex-col gap-2">
          <TextField
            label={t('pelanggan.linkLabel')}
            placeholder="https://maps.app.goo.gl/…"
            value={link}
            autoComplete="off"
            inputMode="url"
            onChange={(e) => setLink(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                void processLink(link);
              }
            }}
            data-testid="location-link"
          />
          <Button
            variant="tonal"
            icon="content_paste"
            className="self-start px-5"
            onClick={() => void pasteFromClipboard()}
          >
            {t('pelanggan.paste')}
          </Button>
        </div>
        {statusLine}
      </div>

      <TextField
        label={t('common.address')}
        value={d.addressText}
        error={showErrors && !d.addressText.trim() ? t('common.required') : null}
        onChange={(e) => setCart((c) => ({ delivery: { ...c.delivery, addressText: e.target.value } }))}
      />
      <TextField
        label={t('order.landmark')}
        placeholder={t('order.landmarkPlaceholder')}
        value={d.landmark}
        onChange={(e) => setCart((c) => ({ delivery: { ...c.delivery, landmark: e.target.value } }))}
      />
      <div className="flex min-h-12 flex-wrap items-center justify-between gap-2">
        <PointBadge point={point} />
        {point ? (
          <span className="flex gap-1">
            <a
              href={mapsDirectionsUrl(point)}
              target="_blank"
              rel="noreferrer"
              className="state-layer inline-flex min-h-12 items-center gap-1 rounded-full px-3 text-label-large text-primary"
            >
              <Icon name="map" size={18} />
              {t('pelanggan.viewMap')}
            </a>
            <button
              type="button"
              className="state-layer inline-flex min-h-12 items-center gap-1 rounded-full px-3 text-label-large text-primary"
              onClick={() => {
                setCart((c) => ({ delivery: { ...c.delivery, lat: null, lng: null } }));
                setStatus({ kind: 'idle' });
              }}
            >
              <Icon name="close" size={18} />
              {t('pelanggan.clearPoint')}
            </button>
          </span>
        ) : null}
      </div>
      {cart.customer ? (
        <Button
          variant="tonal"
          icon="add_location_alt"
          loading={save.isPending}
          disabled={!d.addressText.trim()}
          onClick={() => save.mutate()}
        >
          {t('pelanggan.saveAddress')}
        </Button>
      ) : null}
    </div>
  );
}

// ---------------- Bagian utuh ----------------
export function DeliveryCustomerSection({ showErrors }: { showErrors: boolean }) {
  const { t } = useTranslation();
  const cart = useCart();
  const [sheet, setSheet] = useState(false);
  const customer = cart.customer;
  const addresses = useQuery({
    queryKey: customerKeys.addresses(customer?.id ?? 0),
    queryFn: () => api.call('customerAddresses', { params: { id: customer!.id } }),
    enabled: !!customer,
  });
  const saved = addresses.data?.addresses ?? [];
  const others = saved.filter((a) => a.id !== cart.addressId);

  return (
    <div className="flex flex-col gap-3" data-testid="delivery-customer">
      {customer ? <PickedCustomerCard c={customer} /> : <CustomerSearch />}
      {cart.kind === 'telegram' && !customer?.telegramId ? (
        <Banner tone="info">{t('pelanggan.telegramHint')}</Banner>
      ) : null}
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
      {cart.addressId ? (
        <AddressCard cart={cart} canChange={others.length > 0} onChange={() => setSheet(true)} />
      ) : (
        <NewAddressForm
          cart={cart}
          showErrors={showErrors}
          savedCount={saved.length}
          onPickSaved={() => setSheet(true)}
        />
      )}
      <AddressPickerSheet
        open={sheet}
        onClose={() => setSheet(false)}
        addresses={saved}
        selectedId={cart.addressId}
      />
    </div>
  );
}
