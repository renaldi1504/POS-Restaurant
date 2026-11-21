/** Tambah / ubah menu — acuan: docs/mockups/MenuEdit.dc.html. */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { effectiveMax, tl, type CreateItemRequest, type Lang, type MenuItemDto } from '@pos/shared';
import { Button, Icon, Sheet, useToast } from '../../components/ui';
import {
  ConfirmSheet,
  MENU_PHOTO_ASPECT,
  usePhotoPicker,
  ErrorBlock,
  LoadingBlock,
  MoneyInput,
  Screen,
  ScreenFooter,
  Section,
  SelectField,
  Switch,
  TextArea,
  TopBar,
} from '../../components/common';
import { api, errorMessage, qk } from '../../lib/api';
import { useMoney } from '../../lib/data';
import { LangInputs, cleanLoc, mergeTranslation, useAutoTranslate, type Loc } from './LangFields';
import { adminQk, groupRuleShort } from './MenuListPage';

interface Draft {
  categoryId: number | null;
  name: Loc;
  desc: Loc;
  aiInfo: string;
  store: number | null;
  grab: number | null;
  foodpanda: number | null;
  optionGroupIds: number[];
  available: boolean;
  bestSeller: boolean;
}

function draftFrom(i: MenuItemDto | undefined): Draft {
  return {
    categoryId: i?.categoryId ?? null,
    name: { id: i?.name.id ?? '', en: i?.name.en, kh: i?.name.kh, zh: i?.name.zh },
    desc: {
      id: i?.description.id ?? '',
      en: i?.description.en,
      kh: i?.description.kh,
      zh: i?.description.zh,
    },
    aiInfo: i?.aiInfo ?? '',
    store: i?.prices.store ?? null,
    grab: i?.prices.grab ?? null,
    foodpanda: i?.prices.foodpanda ?? null,
    optionGroupIds: i?.optionGroupIds ?? [],
    available: i?.available ?? true,
    bestSeller: i?.bestSeller ?? false,
  };
}

export default function MenuEditPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const qc = useQueryClient();
  const toast = useToast();
  const money = useMoney();
  const param = useParams().itemId ?? 'baru';
  const isNew = param === 'baru';
  const id = isNew ? null : Number(param);
  const item = useQuery({
    queryKey: ['admin', 'item', id],
    queryFn: () => api.call('adminItemGet', { params: { id: id! } }),
    enabled: !!id,
  });
  const cats = useQuery({ queryKey: adminQk.categories, queryFn: () => api.call('adminCategoriesList') });
  const groups = useQuery({ queryKey: adminQk.groups, queryFn: () => api.call('adminOptionGroupsList') });
  const [d, setD] = useState<Draft>(draftFrom(undefined));
  const [auto, setAuto] = useState<Lang[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [pickOpen, setPickOpen] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [showErr, setShowErr] = useState(false);
  const translate = useAutoTranslate();
  const picker = usePhotoPicker(MENU_PHOTO_ASPECT, (f, url) => {
    setFile(f);
    setPreview(url);
  });

  useEffect(() => {
    if (item.data) setD(draftFrom(item.data.item));
  }, [item.data]);
  useEffect(() => {
    if (isNew && d.categoryId === null && cats.data?.categories[0])
      setD((x) => ({ ...x, categoryId: cats.data!.categories[0]!.id }));
  }, [isNew, cats.data, d.categoryId]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);

  const save = useMutation({
    mutationFn: async () => {
      const body: CreateItemRequest = {
        categoryId: d.categoryId!,
        name: cleanLoc(d.name),
        description: d.desc.id.trim() ? cleanLoc(d.desc) : {},
        aiInfo: d.aiInfo,
        available: d.available,
        bestSeller: d.bestSeller,
        prices: { store: d.store ?? 0, grab: d.grab, foodpanda: d.foodpanda },
        optionGroupIds: d.optionGroupIds,
      };
      let res = id
        ? await api.call('adminItemUpdate', { params: { id }, body })
        : await api.call('adminItemCreate', { body });
      if (file) {
        const fd = new FormData();
        fd.append('file', file);
        res = await api.call('adminItemPhoto', { params: { id: res.item.id }, body: fd });
      }
      return res;
    },
    onSuccess: () => {
      toast.success(t('menux.saved'));
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: qk.menu });
      navigate('/admin/menu');
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const remove = useMutation({
    mutationFn: () => api.call('adminItemDelete', { params: { id: id! } }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['admin'] });
      void qc.invalidateQueries({ queryKey: qk.menu });
      navigate('/admin/menu');
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const removePhoto = useMutation({
    mutationFn: () => api.call('adminItemUpdate', { params: { id: id! }, body: { photoUrl: null } }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['admin', 'item', id] }),
    onError: (e) => toast.error(errorMessage(e, t)),
  });

  if (id && item.isLoading) return <LoadingBlock />;
  if (id && item.isError)
    return (
      <Screen>
        <TopBar
          back={{ label: t('common.menu'), onClick: () => navigate('/admin/menu') }}
          title={t('admin.menuEdit')}
        />
        <div className="p-4">
          <ErrorBlock error={item.error} onRetry={() => void item.refetch()} />
        </div>
      </Screen>
    );

  const photo = preview ?? item.data?.item.photoUrl ?? null;
  const attached = d.optionGroupIds
    .map((gid) => groups.data?.optionGroups.find((g) => g.id === gid))
    .filter((g): g is NonNullable<typeof g> => !!g);
  const valid = !!d.name.id.trim() && d.categoryId !== null && d.store !== null;

  return (
    <Screen testId="menu-edit-screen">
      <TopBar
        back={{ label: t('common.menu'), onClick: () => navigate('/admin/menu') }}
        title={isNew ? t('menux.newMenu') : t('menux.editTitle', { name: tl(d.name, lang) || '…' })}
      />
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-4 py-3">
        <Section className="flex-row items-center gap-3">
          <div className="flex aspect-[4/3] w-[112px] shrink-0 items-center justify-center overflow-hidden rounded-md bg-surface-container-highest text-outline">
            {photo ? (
              <img src={photo} alt={t('admin.photo')} className="size-full object-cover" />
            ) : (
              <Icon name="add_a_photo" size={32} />
            )}
          </div>
          <div className="flex grow flex-col gap-2">
            {picker.element}
            <div className="flex gap-2">
              <Button
                variant="tonal"
                size="md"
                icon="photo_camera"
                className="grow px-3"
                onClick={picker.open}
              >
                {photo ? t('menux.changePhoto') : t('menux.addPhoto')}
              </Button>
              {item.data?.item.photoUrl && !file ? (
                <Button
                  variant="text"
                  size="md"
                  className="text-error"
                  loading={removePhoto.isPending}
                  onClick={() => removePhoto.mutate()}
                >
                  {t('common.delete')}
                </Button>
              ) : null}
            </div>
            <SelectField
              label={t('admin.category')}
              aria-label={t('admin.category')}
              value={d.categoryId ?? ''}
              onChange={(e) => setD({ ...d, categoryId: Number(e.target.value) })}
            >
              {cats.data?.categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {tl(c.name, lang)}
                </option>
              ))}
            </SelectField>
          </div>
        </Section>
        <Section
          title={t('menux.name4')}
          right={
            <Button
              size="md"
              variant="tonal"
              icon="translate"
              className="px-4"
              loading={translate.isPending}
              disabled={!d.name.id.trim()}
              onClick={() =>
                translate.mutate(
                  [
                    { key: 'name', text: d.name },
                    { key: 'desc', text: d.desc },
                  ],
                  {
                    onSuccess: (r) => {
                      const n = mergeTranslation(d.name, r.map.get('name'));
                      const ds = mergeTranslation(d.desc, r.map.get('desc'));
                      setD((x) => ({ ...x, name: n.text, desc: ds.text }));
                      setAuto((a) => [...new Set([...a, ...n.auto])]);
                    },
                  },
                )
              }
            >
              {t('admin.translateAuto')}
            </Button>
          }
        >
          <span className="-mt-1 text-label-medium text-on-surface-variant">{t('menux.translateHint')}</span>
          <LangInputs
            big
            idPrefix="n"
            value={d.name}
            auto={auto}
            onChange={(v, l) => {
              setD({ ...d, name: v });
              setAuto((a) => a.filter((x) => x !== l));
            }}
          />
          {showErr && !d.name.id.trim() ? (
            <span className="text-label-medium font-medium text-error">{t('menux.nameRequired')}</span>
          ) : null}
          <TextArea
            label={t('menux.description')}
            hint={`(${t('common.optional').toLowerCase()})`}
            rows={2}
            value={d.desc.id}
            onChange={(e) => setD({ ...d, desc: { ...d.desc, id: e.target.value } })}
          />
        </Section>
        <Section title={t('menux.prices', { symbol: money.main === 'KHR' ? '៛' : money.main })}>
          <div className="grid grid-cols-3 gap-2">
            <MoneyInput
              suffix={false}
              label={t('menux.store')}
              currency={money.main}
              value={d.store}
              onChange={(v) => setD({ ...d, store: v })}
            />
            <MoneyInput
              suffix={false}
              label="Grab"
              currency={money.main}
              value={d.grab}
              onChange={(v) => setD({ ...d, grab: v })}
              placeholder="—"
            />
            <MoneyInput
              suffix={false}
              label="foodpanda"
              currency={money.main}
              value={d.foodpanda}
              onChange={(v) => setD({ ...d, foodpanda: v })}
              placeholder="—"
            />
          </div>
          <span className="text-label-medium text-on-surface-variant">{t('menux.platformEmpty')}</span>
          {showErr && d.store === null ? (
            <span className="text-label-medium font-medium text-error">{t('menux.priceRequired')}</span>
          ) : null}
        </Section>
        <Section title={t('menux.groupsTitle')}>
          {attached.map((g, i) => (
            <div
              key={g.id}
              className="flex min-h-12 items-center gap-2 border-b border-surface-container-highest"
            >
              <button
                type="button"
                onClick={() => navigate(`/admin/opsi/${g.id}`)}
                className="flex grow flex-col text-left"
              >
                <b className="text-body-medium">{tl(g.name, lang)}</b>
                <span className="text-label-medium text-on-surface-variant">
                  {groupRuleShort(g, t)} · {t('menux.nOptions', { count: g.options.length })}
                </span>
              </button>
              <button
                type="button"
                aria-label={t('menux.moveUp')}
                disabled={i === 0}
                onClick={() =>
                  setD((x) => {
                    const a = [...x.optionGroupIds];
                    [a[i - 1], a[i]] = [a[i]!, a[i - 1]!];
                    return { ...x, optionGroupIds: a };
                  })
                }
                className="state-layer flex size-12 items-center justify-center rounded-full text-on-surface-variant disabled:opacity-38"
              >
                <Icon name="arrow_back" className="rotate-90" />
              </button>
              <button
                type="button"
                aria-label={`${t('menux.detach')} ${tl(g.name, lang)}`}
                onClick={() =>
                  setD((x) => ({ ...x, optionGroupIds: x.optionGroupIds.filter((y) => y !== g.id) }))
                }
                className="state-layer flex size-12 items-center justify-center rounded-full text-error"
              >
                <Icon name="close" />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setPickOpen(true)}
            className="state-layer flex min-h-12 items-center justify-center gap-2 rounded-full bg-secondary-container text-label-large text-on-secondary-container"
          >
            <Icon name="add" />
            {t('menux.attachGroup')}
          </button>
        </Section>
        <Section>
          <Switch
            checked={d.available}
            onChange={(v) => setD({ ...d, available: v })}
            label={t('common.available')}
          />
          <Switch
            checked={d.bestSeller}
            onChange={(v) => setD({ ...d, bestSeller: v })}
            label={t('admin.bestSeller')}
          />
        </Section>
        <Section>
          <TextArea
            label={t('admin.aiInfo')}
            placeholder={t('menux.aiPlaceholder')}
            value={d.aiInfo}
            maxLength={2000}
            onChange={(e) => setD({ ...d, aiInfo: e.target.value })}
          />
        </Section>
        {id ? (
          <Button
            variant="outlined"
            icon="delete"
            className="border-error text-error"
            onClick={() => setDelOpen(true)}
          >
            {t('menux.deleteMenu')}
          </Button>
        ) : null}
      </main>
      <ScreenFooter>
        <Button
          size="lg"
          block
          loading={save.isPending}
          onClick={() => {
            if (!valid) {
              setShowErr(true);
              return;
            }
            save.mutate();
          }}
        >
          {t('common.save')}
        </Button>
      </ScreenFooter>
      <Sheet
        open={pickOpen}
        onClose={() => setPickOpen(false)}
        title={t('menux.attachGroup')}
        closeLabel={t('common.close')}
        footer={
          <Button block onClick={() => setPickOpen(false)}>
            {t('common.done')}
          </Button>
        }
      >
        {groups.data?.optionGroups.map((g) => {
          const on = d.optionGroupIds.includes(g.id);
          return (
            <label
              key={g.id}
              className="flex min-h-[52px] items-center gap-3 border-b border-surface-container-highest"
            >
              <input
                type="checkbox"
                className="size-6 accent-primary"
                checked={on}
                onChange={() =>
                  setD((x) => ({
                    ...x,
                    optionGroupIds: on
                      ? x.optionGroupIds.filter((y) => y !== g.id)
                      : [...x.optionGroupIds, g.id],
                  }))
                }
              />
              <span className="flex flex-col">
                <b>{tl(g.name, lang)}</b>
                <span className="text-label-medium text-on-surface-variant">
                  {g.required ? t('common.required') : t('common.optional')} ·{' '}
                  {effectiveMax(g) === 1
                    ? t('common.chooseOne')
                    : t('menux.maxN', { count: effectiveMax(g) })}
                </span>
              </span>
            </label>
          );
        })}
      </Sheet>
      <ConfirmSheet
        open={delOpen}
        title={t('menux.deleteMenu')}
        message={tl(d.name, lang)}
        confirmLabel={t('common.delete')}
        danger
        loading={remove.isPending}
        onClose={() => setDelOpen(false)}
        onConfirm={() => remove.mutate()}
      />
    </Screen>
  );
}
