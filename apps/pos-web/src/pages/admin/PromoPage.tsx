/** Promo & komisi Grab/foodpanda. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  formatMoney,
  hasPermission,
  type CreatePromoRequest,
  type OrderChannel,
  type PromoDto,
  type PromoKind,
} from '@pos/shared';
import { AdminBar } from '../../components/admin/AdminBar';
import {
  ConfirmSheet,
  ErrorBlock,
  LoadingBlock,
  MoneyInput,
  Screen,
  Section,
  SelectField,
  Switch,
  TextField,
} from '../../components/common';
import { Badge, Button, Segmented, Sheet, useToast } from '../../components/ui';
import { api, errorMessage, qk } from '../../lib/api';
import { useMe } from '../../lib/auth';
import { useMoney } from '../../lib/data';

const PQK = ['admin', 'promos'] as const;
interface PromoForm {
  id?: number;
  name: string;
  channel: OrderChannel | '';
  kind: PromoKind;
  value: number;
  minSubtotal: number | null;
  active: boolean;
}

export default function PromoPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const money = useMoney();
  const { data: me } = useMe();
  const canSettings = hasPermission(me?.permissions, 'settings.manage');
  const promos = useQuery({ queryKey: PQK, queryFn: () => api.call('adminPromosList') });
  const settings = useQuery({
    queryKey: qk.adminSettings,
    queryFn: () => api.call('adminSettingsGet'),
    enabled: canSettings,
  });
  const [comm, setComm] = useState<{ grab: number; foodpanda: number } | null>(null);
  const [form, setForm] = useState<PromoForm | null>(null);
  const [del, setDel] = useState<PromoDto | null>(null);
  useEffect(() => {
    if (settings.data) setComm(settings.data.settings.commissions);
  }, [settings.data]);

  const saveComm = useMutation({
    mutationFn: () => api.call('adminSettingsUpdate', { body: { commissions: comm! } }),
    onSuccess: (r) => {
      qc.setQueryData(qk.adminSettings, r);
      toast.success(t('setx.saved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const save = useMutation({
    mutationFn: (f: PromoForm) => {
      const body: CreatePromoRequest = {
        name: f.name.trim(),
        channel: f.channel || null,
        kind: f.kind,
        value: f.value,
        scope: f.minSubtotal ? { minSubtotal: f.minSubtotal } : {},
        active: f.active,
      };
      return f.id
        ? api.call('adminPromoUpdate', { params: { id: f.id }, body })
        : api.call('adminPromoCreate', { body });
    },
    onSuccess: () => {
      setForm(null);
      void qc.invalidateQueries({ queryKey: PQK });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.call('adminPromoDelete', { params: { id } }),
    onSuccess: () => {
      setDel(null);
      setForm(null);
      void qc.invalidateQueries({ queryKey: PQK });
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  return (
    <Screen testId="promo-screen">
      <AdminBar
        title={t('setx.promoLink')}
        back={{ label: t('admin.settings'), onClick: () => navigate('/admin/settings') }}
      />
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto p-3">
        {canSettings && comm ? (
          <Section title={t('admin.commission')}>
            <div className="grid grid-cols-2 gap-2">
              {(['grab', 'foodpanda'] as const).map((k) => (
                <TextField
                  key={k}
                  label={`${k === 'grab' ? 'Grab' : 'foodpanda'} (%)`}
                  inputMode="decimal"
                  value={comm[k]}
                  onChange={(e) =>
                    setComm({
                      ...comm,
                      [k]: Math.min(100, Math.max(0, Number(e.target.value.replace(',', '.')) || 0)),
                    })
                  }
                />
              ))}
            </div>
            <span className="text-xs text-muted">{t('promo.commissionHint')}</span>
            <Button
              size="md"
              loading={saveComm.isPending}
              disabled={JSON.stringify(comm) === JSON.stringify(settings.data?.settings.commissions)}
              onClick={() => saveComm.mutate()}
            >
              {t('common.save')}
            </Button>
          </Section>
        ) : null}
        <Section
          title={t('cashier.promo')}
          right={
            <Button
              size="md"
              className="min-h-10"
              onClick={() =>
                setForm({ name: '', channel: '', kind: 'pct', value: 10, minSubtotal: null, active: true })
              }
            >
              + {t('common.add')}
            </Button>
          }
        >
          {promos.isLoading ? <LoadingBlock /> : null}
          {promos.isError ? <ErrorBlock error={promos.error} onRetry={() => void promos.refetch()} /> : null}
          {promos.data && !promos.data.promos.length ? (
            <span className="text-muted">{t('promo.none')}</span>
          ) : null}
          {promos.data?.promos.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() =>
                setForm({
                  id: p.id,
                  name: p.name,
                  channel: p.channel ?? '',
                  kind: p.kind,
                  value: p.value,
                  minSubtotal: p.scope.minSubtotal ?? null,
                  active: p.active,
                })
              }
              className="flex min-h-14 items-center gap-2 border-b border-[#F2F4F7] text-left"
            >
              <span className="flex grow flex-col">
                <b>{p.name}</b>
                <span className="text-xs text-muted">
                  {p.channel ? t(`channel.${p.channel}`) : t('promo.allChannels')}
                  {p.scope.minSubtotal
                    ? ` · ${t('promo.min', { amount: formatMoney(p.scope.minSubtotal, money.main) })}`
                    : ''}
                </span>
              </span>
              <b className="tabular-nums">
                {p.kind === 'pct' ? `${p.value}%` : formatMoney(p.value, money.main)}
              </b>
              <Badge tone={p.active ? 'primary' : 'neutral'}>
                {p.active ? t('admin.active') : t('userx.inactive')}
              </Badge>
            </button>
          ))}
        </Section>
      </main>
      <Sheet
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t('promo.edit') : t('promo.add')}
        closeLabel={t('common.close')}
        footer={
          <div className="flex gap-2">
            {form?.id ? (
              <Button
                variant="outline"
                className="text-danger"
                onClick={() => setDel(promos.data?.promos.find((x) => x.id === form.id) ?? null)}
              >
                {t('common.delete')}
              </Button>
            ) : null}
            <Button
              className="grow"
              disabled={!form?.name.trim() || !form.value}
              loading={save.isPending}
              onClick={() => form && save.mutate(form)}
            >
              {t('common.save')}
            </Button>
          </div>
        }
      >
        {form ? (
          <div className="flex flex-col gap-3">
            <TextField
              label={t('common.name')}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
            <SelectField
              label={t('cashier.source')}
              value={form.channel}
              onChange={(e) => setForm({ ...form, channel: e.target.value as OrderChannel | '' })}
            >
              <option value="">{t('promo.allChannels')}</option>
              {(['kasir', 'website', 'telegram', 'qr', 'grab', 'foodpanda'] as const).map((c) => (
                <option key={c} value={c}>
                  {t(`channel.${c}`)}
                </option>
              ))}
            </SelectField>
            <Segmented
              label={t('promo.kind')}
              value={form.kind}
              onChange={(k) => setForm({ ...form, kind: k, value: 0 })}
              options={[
                { value: 'pct', label: t('pesanan.percent') },
                { value: 'amount', label: t('promo.amount') },
              ]}
            />
            {form.kind === 'pct' ? (
              <TextField
                label="%"
                inputMode="numeric"
                value={form.value || ''}
                onChange={(e) =>
                  setForm({ ...form, value: Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 0) })
                }
              />
            ) : (
              <MoneyInput
                label={t('promo.amount')}
                currency={money.main}
                value={form.value || null}
                onChange={(v) => setForm({ ...form, value: v ?? 0 })}
              />
            )}
            <MoneyInput
              label={t('promo.minSubtotal')}
              currency={money.main}
              value={form.minSubtotal}
              onChange={(v) => setForm({ ...form, minSubtotal: v })}
              placeholder="—"
            />
            <Switch
              checked={form.active}
              onChange={(v) => setForm({ ...form, active: v })}
              label={t('admin.active')}
            />
          </div>
        ) : null}
      </Sheet>
      <ConfirmSheet
        open={!!del}
        title={t('promo.delete')}
        message={del?.name}
        confirmLabel={t('common.delete')}
        danger
        loading={remove.isPending}
        onClose={() => setDel(null)}
        onConfirm={() => del && remove.mutate(del.id)}
      />
    </Screen>
  );
}
