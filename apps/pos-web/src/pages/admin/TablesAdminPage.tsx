/** Meja & QR — acuan: docs/mockups/KelolaMeja.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import QRCode from 'qrcode';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import type { AdminTableDto } from '@pos/shared';
import { AdminBar } from '../../components/admin/AdminBar';
import {
  ConfirmSheet,
  ErrorBlock,
  LoadingBlock,
  NumberBox,
  Screen,
  ScreenFooter,
  Switch,
  TextField,
} from '../../components/common';
import { Button, Sheet, cn, useToast } from '../../components/ui';
import { api, errorMessage, qk } from '../../lib/api';
import { usePublicSettings } from '../../lib/data';

const TQK = ['admin', 'tables'] as const;

export function useQrDataUrl(text: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    if (!text) return setUrl(null);
    QRCode.toDataURL(text, { margin: 1, width: 240, errorCorrectionLevel: 'M' })
      .then((u) => alive && setUrl(u))
      .catch(() => alive && setUrl(null));
    return () => {
      alive = false;
    };
  }, [text]);
  return url;
}

export function qrPdfUrl(ids?: number[]): string {
  return api.url('adminTablesQrPdf', { query: ids?.length ? { ids: ids.join(',') } : {} });
}

interface FormState {
  id?: number;
  name: string;
  area: string;
  seats: number;
  active: boolean;
}

export default function TablesAdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const settings = usePublicSettings();
  const q = useQuery({ queryKey: TQK, queryFn: () => api.call('adminTablesList') });
  const [selId, setSelId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState | null>(null);
  const [regen, setRegen] = useState(false);
  const [del, setDel] = useState<AdminTableDto | null>(null);
  const tables = q.data?.tables ?? [];
  const sel = tables.find((x) => x.id === selId) ?? tables[0] ?? null;
  const qr = useQrDataUrl(sel?.qrUrl);
  const areas = [...new Set(tables.map((x) => x.area))];
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: TQK });
    void qc.invalidateQueries({ queryKey: qk.tables });
  };
  const save = useMutation({
    mutationFn: (f: FormState) =>
      f.id
        ? api.call('adminTableUpdate', {
            params: { id: f.id },
            body: { name: f.name.trim(), area: f.area.trim(), seats: f.seats, active: f.active },
          })
        : api.call('adminTableCreate', {
            body: { name: f.name.trim(), area: f.area.trim() || 'Dalam', seats: f.seats, active: f.active },
          }),
    onSuccess: (r) => {
      setForm(null);
      setSelId(r.table.id);
      refresh();
      toast.success(t('mejaqr.saved'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const regenerate = useMutation({
    mutationFn: (id: number) => api.call('adminTableRegenerateQr', { params: { id } }),
    onSuccess: () => {
      setRegen(false);
      refresh();
      toast.success(t('mejaqr.regenerated'));
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.call('adminTableDelete', { params: { id } }),
    onSuccess: () => {
      setDel(null);
      setForm(null);
      setSelId(null);
      refresh();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const openPdf = (ids?: number[]) => window.open(qrPdfUrl(ids), '_blank', 'noopener');
  const activeCount = tables.filter((x) => x.active).length;

  return (
    <Screen testId="tables-admin-screen">
      <AdminBar
        title={t('admin.tables')}
        back={{ label: t('admin.settings'), onClick: () => navigate('/admin/settings') }}
      />
      <main className="flex min-h-0 grow flex-col gap-2.5 overflow-y-auto p-3">
        {q.isLoading ? <LoadingBlock /> : null}
        {q.isError ? <ErrorBlock error={q.error} onRetry={() => void q.refetch()} /> : null}
        {sel ? (
          <section className="flex shrink-0 items-center gap-3 rounded-card bg-white p-3 shadow-card">
            <div
              aria-label={t('mejaqr.sample', { name: sel.name })}
              className="flex w-[150px] shrink-0 flex-col items-center gap-1.5 rounded-xl border border-line bg-white p-2.5"
            >
              <span className="text-[9px] font-bold uppercase text-muted">{settings.data?.name}</span>
              <b className="text-lg">{sel.name}</b>
              {qr ? (
                <img src={qr} alt={`QR ${sel.name}`} className="size-[110px]" data-testid="qr-preview" />
              ) : (
                <div className="size-[110px] bg-bg" />
              )}
              <span className="text-center text-[9px] leading-snug text-[#475467]">
                Scan untuk pesan · Scan to order
                <br />
                <span className="font-khmer">ស្កេនដើម្បីកម្ម៉ង់</span> · <span className="font-sc">扫码点餐</span>
              </span>
            </div>
            <div className="flex grow flex-col gap-2">
              <b className="text-[15px]">QR {sel.name}</b>
              <span className="text-xs text-muted">{t('mejaqr.scanHint')}</span>
              <Button size="md" className="min-h-11 text-sm" onClick={() => openPdf([sel.id])}>
                {t('admin.printQr')}
              </Button>
              <Button
                variant="outline"
                size="md"
                className="min-h-10 text-[13px]"
                onClick={() => setRegen(true)}
              >
                {t('admin.regenerateQr')}
              </Button>
            </div>
          </section>
        ) : null}
        <section className="flex shrink-0 flex-col rounded-card bg-white px-3 py-1 shadow-card">
          {tables.map((m) => (
            <div
              key={m.id}
              className={cn(
                'flex min-h-[54px] items-center gap-2.5 rounded-lg border-b border-[#F2F4F7] px-1',
                sel?.id === m.id && 'bg-primary-tint',
              )}
            >
              <button
                type="button"
                onClick={() => setSelId(m.id)}
                aria-pressed={sel?.id === m.id}
                className="flex min-h-[54px] grow items-center gap-2.5 text-left"
              >
                <b className={cn('w-[76px] text-[15px]', !m.active && 'text-muted line-through')}>{m.name}</b>
                <span className="grow text-[13px] text-muted">
                  {m.area} · {t('meja.seats', { count: m.seats })}
                </span>
              </button>
              <button
                type="button"
                onClick={() =>
                  setForm({ id: m.id, name: m.name, area: m.area, seats: m.seats, active: m.active })
                }
                className="rounded-lg px-2 py-1.5 text-xs font-bold text-primary"
              >
                {t('common.edit')}
              </button>
              <button
                type="button"
                onClick={() => openPdf([m.id])}
                className="rounded-lg border border-line-strong px-2.5 py-1.5 text-xs font-bold"
              >
                {t('admin.printQr')}
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setForm({ name: '', area: areas[0] ?? 'Dalam', seats: 4, active: true })}
            className="h-12 text-left text-[15px] font-extrabold text-primary"
          >
            + {t('mejaqr.add')}
          </button>
        </section>
      </main>
      <ScreenFooter className="gap-1.5">
        <Button className="h-14 bg-ink text-[17px] hover:bg-ink/90" block onClick={() => openPdf()}>
          {t('mejaqr.printAll', { count: activeCount })}
        </Button>
        <span className="text-center text-xs text-muted">{t('mejaqr.sizeHint')}</span>
      </ScreenFooter>

      <Sheet
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? t('mejaqr.edit') : t('mejaqr.add')}
        closeLabel={t('common.close')}
        footer={
          <div className="flex gap-2">
            {form?.id ? (
              <Button
                variant="outline"
                className="text-danger"
                onClick={() => setDel(tables.find((x) => x.id === form.id) ?? null)}
              >
                {t('common.delete')}
              </Button>
            ) : null}
            <Button
              className="grow"
              disabled={!form?.name.trim()}
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
              maxLength={50}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="Meja 7"
            />
            <TextField
              label={t('tables.area')}
              value={form.area}
              maxLength={50}
              list="areas"
              onChange={(e) => setForm({ ...form, area: e.target.value })}
            />
            <datalist id="areas">
              {areas.map((a) => (
                <option key={a} value={a} />
              ))}
            </datalist>
            <NumberBox
              label={t('tables.seats')}
              value={form.seats}
              min={0}
              max={50}
              onChange={(v) => setForm({ ...form, seats: v })}
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
        open={regen}
        title={t('admin.regenerateQr')}
        message={t('mejaqr.regenWarn')}
        confirmLabel={t('admin.regenerateQr')}
        danger
        loading={regenerate.isPending}
        onClose={() => setRegen(false)}
        onConfirm={() => sel && regenerate.mutate(sel.id)}
      />
      <ConfirmSheet
        open={!!del}
        title={t('mejaqr.delete')}
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
