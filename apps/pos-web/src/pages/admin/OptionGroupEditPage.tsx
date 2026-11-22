/** Atur grup pilihan — acuan: docs/mockups/OpsiEdit.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { tl, type AdminOptionGroupDto, type Lang } from '@pos/shared';
import { Button, Icon, Sheet, cn, useToast } from '../../components/ui';
import {
  ConfirmSheet,
  ErrorBlock,
  LoadingBlock,
  MoneyInput,
  NumberBox,
  Screen,
  ScreenFooter,
  Section,
  Tabs,
  TopBar,
} from '../../components/common';
import { api, errorMessage, qk } from '../../lib/api';
import { useMoney } from '../../lib/data';
import {
  LangInputs,
  cleanLoc,
  fillMissing,
  langSummary,
  mergeTranslation,
  missingLangs,
  useAutoTranslate,
  type Loc,
} from './LangFields';
import { adminQk } from './MenuListPage';

interface OptDraft {
  key: string;
  id?: number;
  name: Loc;
  priceDelta: number;
  available: boolean;
}

export default function OptionGroupEditPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const money = useMoney();
  const param = useParams().groupId ?? 'baru';
  const id = param === 'baru' ? null : Number(param);
  const groups = useQuery({ queryKey: adminQk.groups, queryFn: () => api.call('adminOptionGroupsList') });
  const items = useQuery({ queryKey: adminQk.items, queryFn: () => api.call('adminItemsList') });
  const group: AdminOptionGroupDto | undefined = id
    ? groups.data?.optionGroups.find((g) => g.id === id)
    : undefined;
  const [name, setName] = useState<Loc>({ id: '' });
  const [auto, setAuto] = useState<Lang[]>([]);
  const [showLangs, setShowLangs] = useState(false);
  const [required, setRequired] = useState(false);
  const [minSel, setMinSel] = useState(0);
  const [maxSel, setMaxSel] = useState(1);
  const [opts, setOpts] = useState<OptDraft[]>([]);
  const [itemIds, setItemIds] = useState<number[]>([]);
  const [pickOpen, setPickOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [editOpt, setEditOpt] = useState<string | null>(null);
  const translate = useAutoTranslate();

  useEffect(() => {
    if (!group) return;
    setName({ ...group.name });
    setRequired(group.required);
    setMinSel(group.minSelect);
    setMaxSel(group.maxSelect);
    setOpts(
      group.options.map((o) => ({
        key: `o${o.id}`,
        id: o.id,
        name: { ...o.name },
        priceDelta: o.priceDelta,
        available: o.available,
      })),
    );
    setItemIds(group.itemIds);
  }, [group]);

  const save = useMutation({
    mutationFn: async () => {
      const tr = await fillMissing<string>({
        __group: name,
        ...Object.fromEntries(opts.map((o) => [o.key, o.name])),
      });
      const options = opts
        .filter((o) => o.name.id.trim())
        .map((o, i) => ({
          ...(o.id ? { id: o.id } : {}),
          name: cleanLoc(tr[o.key] ?? o.name),
          priceDelta: o.priceDelta,
          available: o.available,
          sort: i + 1,
        }));
      const base = {
        name: cleanLoc(tr.__group ?? name),
        required,
        minSelect: required ? Math.max(1, minSel) : minSel,
        maxSelect: maxSel,
        options,
      };
      if (!id) return api.call('adminOptionGroupCreate', { body: { ...base, itemIds } });
      await api.call('adminOptionGroupUpdate', { params: { id }, body: base });
      return api.call('adminOptionGroupAttach', { params: { id }, body: { itemIds } });
    },
    onSuccess: () => {
      toast.success(t('opsi.saved'));
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: qk.menu });
      navigate('/admin/menu?tab=opsi');
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const remove = useMutation({
    mutationFn: () => api.call('adminOptionGroupDelete', { params: { id: id! } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: qk.menu });
      navigate('/admin/menu?tab=opsi');
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  if (id && groups.isLoading) return <LoadingBlock />;
  if (id && (groups.isError || !group))
    return (
      <Screen>
        <TopBar
          back={{ label: t('common.menu'), onClick: () => navigate('/admin/menu?tab=opsi') }}
          title={t('admin.optionGroups')}
        />
        <div className="p-4">
          <ErrorBlock error={groups.error ?? new Error('not found')} onRetry={() => void groups.refetch()} />
        </div>
      </Screen>
    );

  const others = (['en', 'kh', 'zh'] as const)
    .map((l) => `${l === 'en' ? 'EN' : l === 'kh' ? 'ខ្មែរ' : '中文'}: ${name[l] || '—'}`)
    .join(' · ');
  const editing = opts.find((o) => o.key === editOpt);
  const valid = !!name.id.trim() && (maxSel === 0 || maxSel >= (required ? Math.max(1, minSel) : minSel));

  return (
    <Screen testId="option-edit-screen">
      <TopBar
        back={{ label: t('common.menu'), onClick: () => navigate('/admin/menu?tab=opsi') }}
        title={t('admin.optionGroups')}
      />
      <main className="flex min-h-0 grow flex-col gap-2.5 overflow-y-auto p-3">
        <Section
          title={<label htmlFor="ng-id">{t('opsi.groupName')}</label>}
          right={
            <Button
              size="md"
              className="min-h-9 bg-tertiary px-2.5 text-label-medium hover:bg-tertiary"
              loading={translate.isPending}
              disabled={!name.id.trim()}
              onClick={() =>
                translate.mutate(
                  [{ key: 'g', text: name }, ...opts.map((o) => ({ key: o.key, text: o.name }))],
                  {
                    onSuccess: (r) => {
                      const g = mergeTranslation(name, r.map.get('g'));
                      setName(g.text);
                      setAuto(g.auto);
                      setOpts((xs) =>
                        xs.map((o) => ({ ...o, name: mergeTranslation(o.name, r.map.get(o.key)).text })),
                      );
                    },
                  },
                )
              }
            >
              {t('admin.translateAuto')}
            </Button>
          }
        >
          {showLangs ? (
            <LangInputs idPrefix="ng" big value={name} auto={auto} onChange={(v) => setName(v)} />
          ) : (
            <>
              <input
                id="ng-id"
                value={name.id}
                onChange={(e) => setName({ ...name, id: e.target.value })}
                className="h-12 rounded-md border border-outline-variant px-3 text-body-large font-medium"
              />
              <button
                type="button"
                onClick={() => setShowLangs(true)}
                className="text-left text-label-medium text-on-surface-variant underline"
              >
                {others}
              </button>
            </>
          )}
        </Section>
        <Section title={t('opsi.rules')}>
          <Tabs
            label={t('opsi.rules')}
            value={required ? 'req' : 'opt'}
            onChange={(v) => {
              setRequired(v === 'req');
              if (v === 'req') setMinSel((m) => Math.max(1, m));
            }}
            tabs={[
              { value: 'req', label: t('admin.required') },
              { value: 'opt', label: t('common.optional') },
            ]}
          />
          <div className="grid grid-cols-2 gap-2.5">
            <NumberBox
              label={t('opsi.minPick')}
              value={minSel}
              min={required ? 1 : 0}
              max={20}
              onChange={setMinSel}
            />
            <NumberBox label={t('opsi.maxPick')} value={maxSel} min={0} max={20} onChange={setMaxSel} />
          </div>
          <span className="text-label-medium text-on-surface-variant">
            {maxSel === 0
              ? t('opsi.noMax')
              : maxSel === 1
                ? t('opsi.radioHint')
                : t('opsi.multiHint', { count: maxSel })}
          </span>
          {!valid && name.id.trim() ? (
            <span className="text-label-medium font-medium text-error">{t('opsi.maxGteMin')}</span>
          ) : null}
        </Section>
        <Section className="px-3 py-1.5">
          <b className="pb-1 pt-1.5">
            {t('opsi.optionsTitle', { symbol: money.main === 'KHR' ? '៛' : money.main })}
          </b>
          {opts.map((o, i) => (
            <div key={o.key} className="flex flex-col gap-1 border-b border-surface-container-highest py-2">
              <div className="flex items-center gap-2">
                <input
                  aria-label={t('opsi.optionName', { n: i + 1 })}
                  value={o.name.id}
                  placeholder={t('opsi.optionPh')}
                  onChange={(e) =>
                    setOpts((xs) =>
                      xs.map((x) =>
                        x.key === o.key ? { ...x, name: { ...x.name, id: e.target.value } } : x,
                      ),
                    )
                  }
                  className="h-[42px] min-w-0 grow rounded-sm border border-outline-variant px-2 font-medium"
                />
                <MoneyInput
                  ariaLabel={t('opsi.priceOf', { name: o.name.id || i + 1 })}
                  className="w-[84px] shrink-0"
                  currency={money.main}
                  value={o.priceDelta}
                  onChange={(v) =>
                    setOpts((xs) => xs.map((x) => (x.key === o.key ? { ...x, priceDelta: v ?? 0 } : x)))
                  }
                />
                <button
                  type="button"
                  aria-pressed={o.available}
                  aria-label={`${o.name.id}: ${o.available ? t('common.available') : t('common.soldOut')}`}
                  onClick={() => {
                    const next = !o.available;
                    const flip = (v: boolean) =>
                      setOpts((xs) => xs.map((x) => (x.key === o.key ? { ...x, available: v } : x)));
                    flip(next);
                    // Pilihan yang sudah tersimpan: langsung berlaku di kasir & website (tanpa tekan Simpan).
                    if (o.id)
                      api
                        .call('menuOptionAvailability', { params: { id: o.id }, body: { available: next } })
                        .then(() => {
                          void qc.invalidateQueries({ queryKey: qk.menu });
                          toast.success(next ? t('common.available') : t('common.soldOut'));
                        })
                        .catch((e: unknown) => {
                          flip(!next);
                          toast.error(errorMessage(e, t));
                        });
                  }}
                  className={cn(
                    'h-9 w-[72px] shrink-0 rounded-full text-label-medium font-medium text-on-primary',
                    o.available ? 'bg-primary' : 'bg-error',
                  )}
                >
                  {o.available ? t('common.available') : t('common.soldOut')}
                </button>
                <button
                  type="button"
                  aria-label={`${t('common.edit')} ${o.name.id}`}
                  onClick={() => setEditOpt(o.key)}
                  className="state-layer flex size-10 shrink-0 items-center justify-center rounded-full text-on-surface-variant"
                >
                  <Icon name="translate" />
                </button>
              </div>
              {o.name.id.trim() ? (
                <button
                  type="button"
                  onClick={() => setEditOpt(o.key)}
                  className={cn(
                    'truncate text-left text-label-medium',
                    missingLangs(o.name).length ? 'text-warning' : 'text-on-surface-variant',
                  )}
                >
                  {langSummary(o.name) ?? t('menux.autoOnSave')}
                </button>
              ) : null}
            </div>
          ))}
          <button
            type="button"
            onClick={() =>
              setOpts((xs) => [
                ...xs,
                { key: `n${Date.now()}`, name: { id: '' }, priceDelta: 0, available: true },
              ])
            }
            className="state-layer -mx-2 flex min-h-12 items-center gap-2 rounded-full px-3 text-left text-label-large text-primary"
          >
            <Icon name="add" />
            {t('opsi.addOption')}
          </button>
        </Section>
        <Section title={t('admin.attachTo')}>
          <div className="flex flex-wrap gap-1.5">
            {itemIds.map((iid) => (
              <span
                key={iid}
                className="flex h-10 items-center rounded-sm bg-secondary-container px-3 text-label-large text-on-secondary-container"
              >
                {tl(items.data?.items.find((x) => x.id === iid)?.name, lang) || `#${iid}`}
              </span>
            ))}
            <button
              type="button"
              onClick={() => setPickOpen(true)}
              className="state-layer relative flex h-10 items-center gap-1 rounded-sm border border-outline-variant pl-2 pr-3 text-label-large text-on-surface-variant after:absolute after:inset-x-0 after:-inset-y-1 after:content-['']"
            >
              <Icon name="add" size={18} />
              {t('opsi.pickMenu')}
            </button>
          </div>
          <span className="text-label-medium text-on-surface-variant">{t('opsi.sharedHint')}</span>
        </Section>
        {id ? (
          <Button
            variant="outlined"
            className="border-2 border-error text-error"
            onClick={() => setDelOpen(true)}
          >
            {t('opsi.deleteGroup')}
          </Button>
        ) : null}
      </main>
      <ScreenFooter>
        <Button
          size="lg"
          block
          className="h-14 text-title-medium"
          disabled={!valid}
          loading={save.isPending}
          onClick={() => save.mutate()}
        >
          {t('opsi.saveGroup')}
        </Button>
      </ScreenFooter>
      <Sheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title={t('opsi.pickMenu')}
        closeLabel={t('common.close')}
        footer={
          <Button block onClick={() => setPickOpen(false)}>
            {t('common.done')}
          </Button>
        }
      >
        {items.data?.items.map((it) => {
          const on = itemIds.includes(it.id);
          return (
            <label
              key={it.id}
              className="flex min-h-12 items-center gap-3 border-b border-surface-container-highest"
            >
              <input
                type="checkbox"
                className="size-6 accent-primary"
                checked={on}
                onChange={() => setItemIds((xs) => (on ? xs.filter((x) => x !== it.id) : [...xs, it.id]))}
              />
              <span className="font-medium">{tl(it.name, lang)}</span>
            </label>
          );
        })}
      </Sheet>
      <Sheet
        open={!!editing}
        onClose={() => setEditOpt(null)}
        title={editing?.name.id || t('opsi.addOption')}
        closeLabel={t('common.close')}
        footer={
          <div className="flex gap-2">
            <Button
              variant="outlined"
              className="text-error"
              onClick={() => {
                setOpts((xs) => xs.filter((x) => x.key !== editOpt));
                setEditOpt(null);
              }}
            >
              {t('common.delete')}
            </Button>
            <Button className="grow" onClick={() => setEditOpt(null)}>
              {t('common.done')}
            </Button>
          </div>
        }
      >
        {editing ? (
          <div className="flex flex-col gap-2">
            <Button
              variant="tonal"
              size="md"
              icon="translate"
              loading={translate.isPending}
              disabled={!editing.name.id.trim()}
              onClick={() =>
                translate.mutate([{ key: editing.key, text: editing.name }], {
                  onSuccess: (r) =>
                    setOpts((xs) =>
                      xs.map((x) =>
                        x.key === editing.key
                          ? { ...x, name: mergeTranslation(x.name, r.map.get(x.key)).text }
                          : x,
                      ),
                    ),
                })
              }
            >
              {t('admin.translateAuto')}
            </Button>
            <LangInputs
              idPrefix={`opt-${editing.key}`}
              value={editing.name}
              auto={[]}
              onChange={(v) =>
                setOpts((xs) => xs.map((x) => (x.key === editing.key ? { ...x, name: v } : x)))
              }
            />
          </div>
        ) : null}
      </Sheet>
      <ConfirmSheet
        open={delOpen}
        title={t('opsi.deleteGroup')}
        message={name.id}
        confirmLabel={t('common.delete')}
        danger
        loading={remove.isPending}
        onClose={() => setDelOpen(false)}
        onConfirm={() => remove.mutate()}
      />
    </Screen>
  );
}
