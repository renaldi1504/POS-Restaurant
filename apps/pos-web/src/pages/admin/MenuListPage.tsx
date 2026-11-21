/** Kelola menu (tab Menu | Grup pilihan) — acuan: docs/mockups/Menu.dc.html. */
import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams, useSearchParams } from 'react-router';
import {
  effectiveMax,
  formatMoney,
  matchesLocalized,
  tl,
  type AdminOptionGroupDto,
  type CategoryDto,
} from '@pos/shared';
import { AdminBar } from '../../components/admin/AdminBar';
import {
  ConfirmSheet,
  ErrorBlock,
  ExtendedFab,
  LoadingBlock,
  Screen,
  Tabs,
  TextField,
} from '../../components/common';
import { Button, Icon, Sheet, cn, useToast } from '../../components/ui';
import { api, errorMessage, qk } from '../../lib/api';
import { useMoney } from '../../lib/data';

export const adminQk = {
  items: ['admin', 'items'] as const,
  groups: ['admin', 'option-groups'] as const,
  categories: ['admin', 'categories'] as const,
};

export function groupRuleShort(
  g: Pick<AdminOptionGroupDto, 'required' | 'minSelect' | 'maxSelect' | 'options'>,
  t: TFunction,
) {
  const max = effectiveMax(g);
  const base = g.required ? t('common.required') : t('common.optional');
  return `${base} · ${max === 1 ? t('common.chooseOne').toLowerCase() : t('menux.maxN', { count: max })}`;
}

export default function MenuListPage() {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const navigate = useNavigate();
  const { itemId, groupId } = useParams();
  const qc = useQueryClient();
  const toast = useToast();
  const money = useMoney();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as 'menu' | 'opsi' | null) ?? (groupId ? 'opsi' : 'menu');
  const [q, setQ] = useState('');
  const [catOpen, setCatOpen] = useState(false);
  const items = useQuery({ queryKey: adminQk.items, queryFn: () => api.call('adminItemsList') });
  const groups = useQuery({ queryKey: adminQk.groups, queryFn: () => api.call('adminOptionGroupsList') });
  const cats = useQuery({ queryKey: adminQk.categories, queryFn: () => api.call('adminCategoriesList') });
  const catName = (id: number) => tl(cats.data?.categories.find((c) => c.id === id)?.name, lang);
  const toggle = useMutation({
    mutationFn: (v: { id: number; available: boolean }) =>
      api.call('menuItemAvailability', { params: { id: v.id }, body: { available: v.available } }),
    onMutate: (v) => {
      qc.setQueryData(adminQk.items, (old: typeof items.data) =>
        old ? { items: old.items.map((i) => (i.id === v.id ? { ...i, available: v.available } : i)) } : old,
      );
    },
    onSuccess: () => void qc.invalidateQueries({ queryKey: qk.menu }),
    onError: (e) => {
      toast.error(errorMessage(e, t));
      void qc.invalidateQueries({ queryKey: adminQk.items });
    },
  });
  const list = (items.data?.items ?? [])
    .filter((i) => matchesLocalized(q, i.name))
    .sort((a, b) => a.categoryId - b.categoryId || a.sort - b.sort);
  const glist = (groups.data?.optionGroups ?? []).filter((g) => matchesLocalized(q, g.name));
  const soldOut = (items.data?.items ?? []).filter((i) => !i.available).length;
  const itemName = (id: number) => tl(items.data?.items.find((i) => i.id === id)?.name, lang);

  return (
    <Screen wide testId="menu-admin-screen">
      <AdminBar
        title={t('admin.menu')}
        right={
          <span className="text-label-medium text-on-surface-variant">
            {t('menux.soldOutCount', { count: soldOut })}
          </span>
        }
      >
        <Tabs
          label={t('admin.menu')}
          value={tab}
          onChange={(v) => setSp({ tab: v }, { replace: true })}
          tabs={[
            { value: 'menu', label: `${t('common.menu')} (${items.data?.items.length ?? 0})` },
            { value: 'opsi', label: `${t('admin.optionGroups')} (${groups.data?.optionGroups.length ?? 0})` },
          ]}
        />
        <div className="flex gap-2">
          <label className="flex h-12 min-w-0 grow items-center gap-2 rounded-full bg-surface-container-high px-4 text-on-surface-variant focus-within:outline-3 focus-within:outline-secondary">
            <Icon name="search" />
            <input
              aria-label={t('common.search')}
              placeholder={tab === 'menu' ? t('cashier.searchMenu') : t('menux.searchGroup')}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              className="h-full min-w-0 grow bg-transparent text-body-large text-on-surface outline-none placeholder:text-on-surface-variant"
            />
          </label>
          {tab === 'menu' ? (
            <Button
              variant="outlined"
              size="md"
              icon="category"
              className="shrink-0 px-4"
              onClick={() => setCatOpen(true)}
            >
              {t('admin.category')}
            </Button>
          ) : null}
        </div>
      </AdminBar>
      <main className="flex min-h-0 grow flex-col gap-3 overflow-y-auto px-4 pb-24 pt-3">
        {tab === 'menu' ? (
          <>
            <span className="text-label-medium text-on-surface-variant">{t('menux.hint')}</span>
            {items.isLoading ? <LoadingBlock /> : null}
            {items.isError ? <ErrorBlock error={items.error} onRetry={() => void items.refetch()} /> : null}
            <div className="grid gap-2 large:grid-cols-2">
              {list.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    'flex min-h-[72px] items-center gap-3 rounded-md border bg-surface-container-lowest py-2 pl-2 pr-3',
                    String(m.id) === itemId
                      ? 'border-primary bg-secondary-container'
                      : 'border-outline-variant',
                  )}
                >
                  <div className="flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-sm bg-surface-container-high text-outline">
                    {m.photoUrl ? (
                      <img src={m.photoUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <Icon name="restaurant" />
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/menu/${m.id}`)}
                    className="flex min-h-12 min-w-0 grow flex-col justify-center gap-0.5 text-left"
                  >
                    <b className="text-title-medium">{tl(m.name, lang)}</b>
                    <span className="text-body-medium text-on-surface-variant">
                      {catName(m.categoryId)} · {formatMoney(m.prices.store, money.main)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={m.available}
                    aria-label={`${tl(m.name, lang)}: ${m.available ? t('common.available') : t('common.soldOut')}`}
                    onClick={() => toggle.mutate({ id: m.id, available: !m.available })}
                    className={cn(
                      'state-layer flex h-10 min-w-[104px] shrink-0 items-center justify-center gap-1 rounded-sm px-2 text-label-large',
                      m.available
                        ? 'bg-secondary-container text-on-secondary-container'
                        : 'bg-error-container text-on-error-container',
                    )}
                  >
                    <Icon name={m.available ? 'check' : 'block'} size={18} />
                    {m.available ? t('common.available') : t('common.soldOut')}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="text-label-medium text-on-surface-variant">{t('menux.groupHint')}</span>
            {groups.isLoading ? <LoadingBlock /> : null}
            {groups.isError ? (
              <ErrorBlock error={groups.error} onRetry={() => void groups.refetch()} />
            ) : null}
            <div className="grid gap-2 large:grid-cols-2">
              {glist.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => navigate(`/admin/opsi/${g.id}`)}
                  className={cn(
                    'state-layer flex flex-col gap-1.5 rounded-md border bg-surface-container-lowest p-4 text-left',
                    String(g.id) === groupId
                      ? 'border-primary bg-secondary-container'
                      : 'border-outline-variant',
                  )}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <b className="text-title-medium">{tl(g.name, lang)}</b>
                    <span
                      className={cn(
                        'shrink-0 rounded-sm px-2 py-0.5 text-label-medium',
                        g.required
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-surface-container-high text-on-surface-variant',
                      )}
                    >
                      {groupRuleShort(g, t)}
                    </span>
                  </div>
                  <span className="text-label-medium text-on-surface-variant">
                    {g.options
                      .map(
                        (o) =>
                          `${tl(o.name, lang)}${o.priceDelta ? ` +${formatMoney(o.priceDelta, money.main, { noSymbol: true })}` : ''}${o.available ? '' : ` (${t('common.soldOut').toLowerCase()})`}`,
                      )
                      .join(', ')}
                  </span>
                  <span className="text-label-medium text-on-surface-variant">
                    {t('menux.usedIn')}: {g.itemIds.map(itemName).filter(Boolean).join(', ') || '—'}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
      <ExtendedFab
        label={tab === 'menu' ? t('menux.addMenu') : t('menux.addGroup')}
        onClick={() => navigate(tab === 'menu' ? '/admin/menu/baru' : '/admin/opsi/baru')}
      />
      <CategoriesSheet
        open={catOpen}
        onClose={() => setCatOpen(false)}
        categories={cats.data?.categories ?? []}
      />
    </Screen>
  );
}

function CategoriesSheet({
  open,
  onClose,
  categories,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryDto[];
}) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const toast = useToast();
  const [name, setName] = useState('');
  const [editing, setEditing] = useState<CategoryDto | null>(null);
  const [del, setDel] = useState<CategoryDto | null>(null);
  const done = () => {
    void qc.invalidateQueries({ queryKey: adminQk.categories });
    void qc.invalidateQueries({ queryKey: qk.menu });
  };
  const save = useMutation({
    mutationFn: async () => {
      const text = { id: name.trim() };
      if (editing)
        return api.call('adminCategoryUpdate', {
          params: { id: editing.id },
          body: { name: { ...editing.name, id: name.trim() } },
        });
      const tr = await api
        .call('adminTranslate', { body: { entries: [{ key: 'c', text }] } })
        .catch(() => null);
      return api.call('adminCategoryCreate', {
        body: { name: tr?.entries[0]?.text ?? text, sort: categories.length + 1 },
      });
    },
    onSuccess: () => {
      setName('');
      setEditing(null);
      done();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  const remove = useMutation({
    mutationFn: (id: number) => api.call('adminCategoryDelete', { params: { id } }),
    onSuccess: () => {
      setDel(null);
      done();
    },
    onError: (e) => toast.error(errorMessage(e, t)),
  });
  return (
    <Sheet open={open} onClose={onClose} title={t('admin.category')} closeLabel={t('common.close')}>
      <div className="flex flex-col gap-2">
        {categories.map((c) => (
          <div
            key={c.id}
            className="flex min-h-12 items-center gap-2 border-b border-surface-container-highest"
          >
            <span className="grow font-medium">{tl(c.name, i18n.language)}</span>
            <Button
              variant="text"
              size="md"
              onClick={() => {
                setEditing(c);
                setName(c.name.id);
              }}
            >
              {t('common.edit')}
            </Button>
            <Button variant="text" size="md" className="text-error" onClick={() => setDel(c)}>
              {t('common.delete')}
            </Button>
          </div>
        ))}
        <div className="flex items-end gap-2 pt-2">
          <TextField
            className="grow"
            label={editing ? t('menux.renameCategory') : t('menux.newCategory')}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Button size="md" disabled={!name.trim()} loading={save.isPending} onClick={() => save.mutate()}>
            {editing ? t('common.save') : t('common.add')}
          </Button>
        </div>
      </div>
      <ConfirmSheet
        open={!!del}
        title={t('menux.deleteCategory')}
        message={del ? tl(del.name, i18n.language) : ''}
        confirmLabel={t('common.delete')}
        danger
        loading={remove.isPending}
        onClose={() => setDel(null)}
        onConfirm={() => del && remove.mutate(del.id)}
      />
    </Sheet>
  );
}
