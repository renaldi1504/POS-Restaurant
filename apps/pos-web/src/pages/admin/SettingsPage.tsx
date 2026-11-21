/** Settings — acuan: docs/mockups/Settings.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  CURRENCIES,
  type AdminSettingsResponse,
  type Currency,
  type Settings,
  type SettingsPatch,
  type TextSize,
} from '@pos/shared';
import { AdminBar } from '../../components/admin/AdminBar';
import {
  usePhotoPicker,
  CURRENCY_LABEL,
  ConfirmSheet,
  ErrorBlock,
  LoadingBlock,
  MoneyInput,
  NumberBox,
  Screen,
  ScreenFooter,
  Section,
  Switch,
  TextField,
} from '../../components/common';
import { Badge, Button, Segmented, Sheet, useToast } from '../../components/ui';
import { api, errorMessage, qk } from '../../lib/api';
import { setPrefs } from '../../lib/prefs';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Bagian settings yang berubah (untuk PATCH parsial). */
export function settingsDiff(orig: Settings, draft: Settings): SettingsPatch {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(draft) as (keyof Settings)[])
    if (JSON.stringify(orig[k]) !== JSON.stringify(draft[k])) out[k] = draft[k];
  return out as SettingsPatch;
}

function LinkRow({ label, onClick, last }: { label: ReactNode; onClick: () => void; last?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex h-[52px] w-full items-center justify-between text-left font-semibold ${last ? '' : 'border-b border-[#F2F4F7]'}`}
    >
      <span>{label}</span>
      <span aria-hidden>›</span>
    </button>
  );
}

export default function SettingsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({ queryKey: qk.adminSettings, queryFn: () => api.call('adminSettingsGet') });
  const tables = useQuery({ queryKey: ['admin', 'tables'], queryFn: () => api.call('adminTablesList') });
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api.call('adminUsersList') });
  const [d, setD] = useState<Settings | null>(null);
  const [catsOpen, setCatsOpen] = useState(false);
  useEffect(() => {
    // Isi draft sekali; upload logo/QR hanya mengganti field-nya supaya ubahan lain yang belum disimpan tidak hilang.
    if (q.data) setD((x) => x ?? structuredClone(q.data.settings));
  }, [q.data]);

  const save = useMutation({
    mutationFn: (patch: SettingsPatch) => api.call('adminSettingsUpdate', { body: patch }),
    onSuccess: (r) => {
      qc.setQueryData(qk.adminSettings, r);
      setD(structuredClone(r.settings));
      void qc.invalidateQueries({ queryKey: qk.publicSettings });
      void qc.invalidateQueries({ queryKey: qk.staffSettings });
      toast.success(t('setx.saved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const logo = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      return api.call('adminSettingsLogo', { body: fd });
    },
    onSuccess: (r) => {
      qc.setQueryData(qk.adminSettings, r);
      setD((x) => (x ? { ...x, profile: { ...x.profile, logoUrl: r.settings.profile.logoUrl } } : x));
      void qc.invalidateQueries({ queryKey: qk.publicSettings });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  const logoPicker = usePhotoPicker(1, (f) => logo.mutate(f), { round: false });

  if (q.isLoading || (!d && !q.isError)) return <LoadingBlock />;
  if (q.isError || !d || !q.data)
    return (
      <Screen>
        <AdminBar title={t('admin.settings')} />
        <div className="p-4">
          <ErrorBlock error={q.error} onRetry={() => void q.refetch()} />
        </div>
      </Screen>
    );
  const integ = q.data.integrations;
  const patch = settingsDiff(q.data.settings, d);
  const dirty = Object.keys(patch).length > 0;
  const hoursOk = HHMM.test(d.hours.open) && HHMM.test(d.hours.close);
  const set = <K extends keyof Settings>(k: K, v: Partial<Settings[K]>) =>
    setD({ ...d, [k]: { ...d[k], ...v } });
  const drivers =
    users.data?.users.filter((u) => u.role.name.toLowerCase().includes('driver') && u.active).length ?? 0;
  const textSize = (s: TextSize) => {
    // Default toko untuk semua perangkat staf; perangkat ini ikut default (hapus pilihan lokal).
    setPrefs({ textSize: null });
    set('ui', { textSize: s });
  };

  return (
    <Screen testId="settings-screen">
      <AdminBar
        title={t('admin.settings')}
        right={<span className="text-xs text-muted">{t('setx.adminOnly')}</span>}
      />
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto p-3">
        <Section title={t('setx.profileLogo')}>
          <div className="flex items-center gap-2.5">
            {d.profile.logoUrl ? (
              <img
                src={d.profile.logoUrl}
                alt={t('admin.logo')}
                className="size-16 shrink-0 rounded-[14px] object-cover"
              />
            ) : (
              <div className="flex size-16 shrink-0 items-center justify-center rounded-[14px] border-2 border-dashed border-line-strong bg-[#F2F4F7] text-[10px] font-bold text-muted">
                LOGO
              </div>
            )}
            {logoPicker.element}
            <Button variant="outline" size="md" loading={logo.isPending} onClick={logoPicker.open}>
              {t('setx.uploadLogo')}
            </Button>
          </div>
          <TextField
            label={t('setx.shopName')}
            value={d.profile.name}
            onChange={(e) => set('profile', { name: e.target.value })}
          />
          <TextField
            label={t('common.address')}
            value={d.profile.address}
            onChange={(e) => set('profile', { address: e.target.value })}
          />
          <TextField
            label={t('common.phone')}
            type="tel"
            value={d.profile.phone}
            onChange={(e) => set('profile', { phone: e.target.value })}
          />
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label={t('setx.lat')}
              inputMode="decimal"
              value={d.profile.lat ?? ''}
              onChange={(e) => set('profile', { lat: e.target.value === '' ? null : Number(e.target.value) })}
            />
            <TextField
              label={t('setx.lng')}
              inputMode="decimal"
              value={d.profile.lng ?? ''}
              onChange={(e) => set('profile', { lng: e.target.value === '' ? null : Number(e.target.value) })}
            />
          </div>
          <span className="text-xs text-muted">{t('setx.latLngHint')}</span>
        </Section>

        <Section title={t('admin.hours')}>
          <div className="grid grid-cols-2 gap-2">
            <TextField
              label={t('setx.open')}
              value={d.hours.open}
              inputMode="numeric"
              placeholder="08:00"
              maxLength={5}
              inputClassName="h-[50px] text-[22px] font-extrabold"
              onChange={(e) => set('hours', { open: e.target.value.replace('.', ':') })}
              error={HHMM.test(d.hours.open) ? null : 'HH:MM'}
            />
            <TextField
              label={t('setx.close')}
              value={d.hours.close}
              inputMode="numeric"
              placeholder="03:00"
              maxLength={5}
              inputClassName="h-[50px] text-[22px] font-extrabold"
              onChange={(e) => set('hours', { close: e.target.value.replace('.', ':') })}
              error={HHMM.test(d.hours.close) ? null : 'HH:MM'}
            />
          </div>
          <span className="text-xs text-muted">{t('setx.hoursHint')}</span>
        </Section>

        <Section title={t('admin.currency')}>
          {CURRENCIES.map((c: Currency) => (
            <div key={c} className="flex min-h-11 items-center gap-2 border-b border-[#F2F4F7]">
              <label className="flex grow items-center gap-2 font-bold">
                <input
                  type="checkbox"
                  className="size-5 accent-primary"
                  checked={d.currency.enabled.includes(c)}
                  disabled={c === d.currency.main}
                  onChange={(e) =>
                    set('currency', {
                      enabled: e.target.checked
                        ? [...d.currency.enabled, c]
                        : d.currency.enabled.filter((x) => x !== c),
                    })
                  }
                />
                {CURRENCY_LABEL[c]} {c === 'KHR' ? '៛' : c === 'USD' ? '$' : 'Rp'}
              </label>
              {d.currency.main === c ? (
                <span className="rounded-lg bg-ink px-2.5 py-1 text-xs font-bold text-white">
                  {t('setx.main')}
                </span>
              ) : d.currency.enabled.includes(c) ? (
                <button
                  type="button"
                  className="rounded-lg border border-line-strong px-2.5 py-1 text-xs font-bold"
                  onClick={() => set('currency', { main: c })}
                >
                  {t('setx.makeMain')}
                </button>
              ) : null}
            </div>
          ))}
          <div className="flex h-[52px] items-center gap-2 border-b border-[#F2F4F7]">
            <b className="grow">$1 =</b>
            <MoneyInput
              ariaLabel={t('setx.rateUsd')}
              className="w-28"
              currency="KHR"
              value={d.currency.rates.USD}
              onChange={(v) => v && set('currency', { rates: { ...d.currency.rates, USD: v } })}
            />
            <span>៛</span>
          </div>
          <div className="flex h-[52px] items-center gap-2">
            <b className="grow">Rp1.000 =</b>
            <MoneyInput
              ariaLabel={t('setx.rateIdr')}
              className="w-28"
              currency="KHR"
              value={Math.round(d.currency.rates.IDR * 1000)}
              onChange={(v) => v && set('currency', { rates: { ...d.currency.rates, IDR: v / 1000 } })}
            />
            <span>៛</span>
          </div>
          {d.currency.main !== 'KHR' ? (
            <span className="text-xs text-warn-dark">{t('setx.mainWarn')}</span>
          ) : null}
        </Section>

        <Section title={t('setx.delivery')}>
          <div className="grid grid-cols-2 gap-2">
            <MoneyInput
              label={t('admin.minOrder')}
              currency={d.currency.main}
              value={d.delivery.minOrder}
              onChange={(v) => set('delivery', { minOrder: v ?? 0 })}
            />
            <MoneyInput
              label={t('setx.defaultFee')}
              currency={d.currency.main}
              value={d.delivery.defaultFee}
              onChange={(v) => set('delivery', { defaultFee: v ?? 0 })}
            />
          </div>
          <span className="text-xs text-muted">{t('setx.deliveryHint')}</span>
        </Section>

        <Section title={t('setx.operations')}>
          <NumberBox
            label={t('setx.lateMinutes')}
            value={d.kitchen.lateMinutes}
            min={1}
            max={240}
            onChange={(v) => set('kitchen', { lateMinutes: v })}
          />
          <Switch
            checked={d.qr.requireAccept}
            onChange={(v) => set('qr', { requireAccept: v })}
            label={t('setx.qrAccept')}
            description={t('setx.qrAcceptHint')}
          />
          <Switch
            checked={d.shift.autoAvailableOnOpen}
            onChange={(v) => set('shift', { autoAvailableOnOpen: v })}
            label={t('setx.autoAvailable')}
          />
          <TextField
            label={t('setx.shiftNames')}
            hint={t('setx.shiftNamesHint')}
            defaultValue={d.shift.names.join(', ')}
            onBlur={(e) => {
              const names = e.target.value
                .split(',')
                .map((x) => x.trim().slice(0, 30))
                .filter(Boolean);
              if (names.length) set('shift', { names });
            }}
          />
        </Section>

        <Section title={t('setx.abaTitle')}>
          <TextField
            label={t('setx.abaName')}
            value={d.payment.aba.accountName}
            maxLength={100}
            onChange={(e) => set('payment', { aba: { ...d.payment.aba, accountName: e.target.value } })}
          />
          <TextField
            label={t('setx.abaNumber')}
            value={d.payment.aba.accountNumber}
            maxLength={50}
            inputMode="numeric"
            onChange={(e) => set('payment', { aba: { ...d.payment.aba, accountNumber: e.target.value } })}
          />
          <AbaQrField
            url={d.payment.aba.qrImageUrl ?? null}
            onChange={(url) => {
              // Upload/hapus langsung tersimpan di server → samakan draft & data asli (tidak jadi "belum disimpan").
              setD((x) => (x ? { ...x, payment: { aba: { ...x.payment.aba, qrImageUrl: url } } } : x));
            }}
          />
          <span className="text-xs text-muted">{t('setx.abaHint')}</span>
        </Section>

        <Section title={t('setx.botAi')}>
          <div className="flex items-center justify-between">
            <span>{t('admin.telegramBot')}</span>
            <Badge tone={integ.telegram ? 'primary' : 'warn'}>
              {integ.telegram
                ? `${t('setx.connected')}${integ.telegramBotUsername ? ` · @${integ.telegramBotUsername}` : ''}`
                : t('admin.integrationOff')}
            </Badge>
          </div>
          <Switch
            checked={d.ai.enabled}
            onChange={(v) => set('ai', { enabled: v })}
            label={t('setx.aiAnswers')}
          />
          <div className="flex items-center justify-between">
            <span>{t('admin.gemini')}</span>
            <Badge tone={integ.gemini ? 'primary' : 'warn'}>
              {integ.gemini ? t('admin.integrationOn') : t('admin.integrationOff')}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Google Maps</span>
            <Badge tone={integ.maps ? 'primary' : 'warn'}>
              {integ.maps ? t('admin.integrationOn') : t('admin.integrationOff')}
            </Badge>
          </div>
          <div className="flex items-center justify-between">
            <span>Cloudflare R2</span>
            <Badge tone={integ.r2 ? 'primary' : 'warn'}>
              {integ.r2 ? t('admin.integrationOn') : t('admin.integrationOff')}
            </Badge>
          </div>
          <span className="text-xs text-muted">{t('setx.keysHint')}</span>
        </Section>

        <Section title={t('admin.textSize')}>
          <Segmented
            label={t('admin.textSize')}
            value={d.ui.textSize}
            onChange={textSize}
            options={[
              { value: 'normal', label: t('admin.textNormal') },
              { value: 'large', label: t('admin.textLarge') },
              { value: 'xlarge', label: t('admin.textXLarge') },
            ]}
          />
          <span className="text-xs text-muted">{t('setx.textSizeHint')}</span>
        </Section>

        <section className="shrink-0 rounded-card bg-white px-3 py-1 shadow-card">
          <LinkRow
            label={t('setx.tablesLink', { count: tables.data?.tables.length ?? 0 })}
            onClick={() => navigate('/admin/meja')}
          />
          <LinkRow
            label={t('setx.driversLink', { count: drivers })}
            onClick={() => navigate('/admin/pengguna')}
          />
          <LinkRow label={t('setx.promoLink')} onClick={() => navigate('/admin/promo')} />
          <LinkRow label={t('admin.users')} onClick={() => navigate('/admin/pengguna')} />
          <LinkRow label={t('admin.expenseCategories')} onClick={() => setCatsOpen(true)} />
          <LinkRow label={t('admin.printerSound')} onClick={() => navigate('/printer')} />
          <LinkRow label={t('admin.telegramBot')} onClick={() => navigate('/admin/telegram')} last />
        </section>
      </main>
      {dirty ? (
        <ScreenFooter>
          <Button
            size="lg"
            block
            disabled={!hoursOk}
            loading={save.isPending}
            onClick={() => save.mutate(patch)}
          >
            {t('setx.saveChanges')}
          </Button>
        </ScreenFooter>
      ) : null}
      <ExpenseCategoriesSheet open={catsOpen} onClose={() => setCatsOpen(false)} />
    </Screen>
  );
}

function ExpenseCategoriesSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const cats = useQuery({
    queryKey: ['expense-categories'],
    queryFn: () => api.call('expenseCategories'),
    enabled: open,
  });
  const [name, setName] = useState('');
  const [editId, setEditId] = useState<number | null>(null);
  const [delId, setDelId] = useState<number | null>(null);
  const done = () => void qc.invalidateQueries({ queryKey: ['expense-categories'] });
  const save = useMutation({
    mutationFn: () =>
      editId
        ? api.call('adminExpenseCategoryUpdate', { params: { id: editId }, body: { name: name.trim() } })
        : api.call('adminExpenseCategoryCreate', { body: { name: name.trim() } }),
    onSuccess: () => {
      setName('');
      setEditId(null);
      done();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.call('adminExpenseCategoryDelete', { params: { id } }),
    onSuccess: () => {
      setDelId(null);
      done();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  return (
    <Sheet open={open} onClose={onClose} title={t('admin.expenseCategories')} closeLabel={t('common.close')}>
      {cats.data?.categories.map((c) => (
        <div key={c.id} className="flex min-h-12 items-center gap-2 border-b border-[#F2F4F7]">
          <span className="grow font-semibold">{c.name}</span>
          <Button
            variant="ghost"
            size="md"
            onClick={() => {
              setEditId(c.id);
              setName(c.name);
            }}
          >
            {t('common.edit')}
          </Button>
          <Button variant="ghost" size="md" className="text-danger" onClick={() => setDelId(c.id)}>
            {t('common.delete')}
          </Button>
        </div>
      ))}
      <div className="flex items-end gap-2 pt-3">
        <TextField
          className="grow"
          label={editId ? t('common.edit') : t('common.add')}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Button size="md" disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
          {t('common.save')}
        </Button>
      </div>
      <ConfirmSheet
        open={delId !== null}
        title={t('common.delete')}
        message={cats.data?.categories.find((c) => c.id === delId)?.name}
        confirmLabel={t('common.delete')}
        danger
        loading={remove.isPending}
        onClose={() => setDelId(null)}
        onConfirm={() => delId && remove.mutate(delId)}
      />
    </Sheet>
  );
}

/** Gambar QR ABA: upload (potong 1:1) dengan pratinjau, ganti, hapus — langsung tersimpan di server. */
export function AbaQrField({
  url,
  onChange,
}: {
  url: string | null;
  onChange: (url: string | null) => void;
}) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [confirmRemove, setConfirmRemove] = useState(false);
  const done = (r: AdminSettingsResponse) => {
    qc.setQueryData(qk.adminSettings, r);
    void qc.invalidateQueries({ queryKey: qk.publicSettings });
    onChange(r.settings.payment.aba.qrImageUrl ?? null);
  };
  const upload = useMutation({
    mutationFn: (f: File) => {
      const fd = new FormData();
      fd.append('file', f);
      return api.call('adminSettingsAbaQr', { body: fd });
    },
    onSuccess: (r) => {
      done(r);
      toast.success(t('setx.saved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const remove = useMutation({
    mutationFn: () => api.call('adminSettingsAbaQrDelete'),
    onSuccess: (r) => {
      setConfirmRemove(false);
      done(r);
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const picker = usePhotoPicker(1, (f) => upload.mutate(f));
  return (
    <div className="flex flex-col gap-1" data-testid="aba-qr-field">
      <span className="text-sm font-bold text-ink">
        {t('setx.abaQr')}{' '}
        <span className="font-medium text-muted">({t('common.optional').toLowerCase()})</span>
      </span>
      <div className="flex items-center gap-3">
        {url ? (
          <img
            src={url}
            alt={t('setx.abaQr')}
            className="size-28 shrink-0 rounded-xl border border-line object-contain bg-white"
          />
        ) : (
          <div className="flex size-28 shrink-0 items-center justify-center rounded-xl border-2 border-dashed border-line-strong bg-bg px-2 text-center text-xs text-muted">
            {t('setx.abaQrNone')}
          </div>
        )}
        {picker.element}
        <div className="flex grow flex-col gap-2">
          <Button variant="secondary" size="md" loading={upload.isPending} onClick={picker.open}>
            {url ? t('setx.abaQrReplace') : t('setx.abaQrUpload')}
          </Button>
          {url ? (
            <Button variant="ghost" size="md" className="text-danger" onClick={() => setConfirmRemove(true)}>
              {t('setx.abaQrRemove')}
            </Button>
          ) : null}
        </div>
      </div>
      <ConfirmSheet
        open={confirmRemove}
        title={t('setx.abaQrRemove')}
        message={t('setx.abaQrRemoveConfirm')}
        confirmLabel={t('common.delete')}
        danger
        loading={remove.isPending}
        onClose={() => setConfirmRemove(false)}
        onConfirm={() => remove.mutate()}
      />
    </div>
  );
}
