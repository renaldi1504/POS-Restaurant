/** Kelola menu (tab Menu | Grup pilihan) — acuan: docs/mockups/Menu.dc.html. */
import type { TFunction } from 'i18next';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useSearchParams } from 'react-router';
import {
  effectiveMax,
  formatMoney,
  matchesLocalized,
  tl,
  type AdminOptionGroupDto,
  type CategoryDto,
} from '@pos/shared';
import { AdminBar } from '../../components/admin/AdminBar';
import { ConfirmSheet, ErrorBlock, LoadingBlock, Screen, Tabs, TextField } from '../../components/common';
import { Button, Sheet, cn, useToast } from '../../components/ui';
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
  const qc = useQueryClient();
  const toast = useToast();
  const money = useMoney();
  const [sp, setSp] = useSearchParams();
  const tab = (sp.get('tab') as 'menu' | 'opsi') ?? 'menu';
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
        right={<span className="text-[13px] text-muted">{t('menux.soldOutCount', { count: soldOut })}</span>}
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
          <input
            aria-label={t('common.search')}
            placeholder={tab === 'menu' ? t('cashier.searchMenu') : t('menux.searchGroup')}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="h-11 grow rounded-xl border border-line-strong px-3.5"
          />
          {tab === 'menu' ? (
            <Button variant="outline" size="md" className="h-11 min-h-11" onClick={() => setCatOpen(true)}>
              {t('admin.category')}
            </Button>
          ) : null}
        </div>
      </AdminBar>
      <main className="flex min-h-0 grow flex-col gap-2 overflow-y-auto px-3 pb-24 pt-2.5">
        {tab === 'menu' ? (
          <>
            <span className="text-[13px] text-muted">{t('menux.hint')}</span>
            {items.isLoading ? <LoadingBlock /> : null}
            {items.isError ? <ErrorBlock error={items.error} onRetry={() => void items.refetch()} /> : null}
            <div className="grid gap-2 md:grid-cols-2">
              {list.map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-2.5 rounded-[14px] bg-white p-2.5 shadow-card"
                >
                  <div className="flex size-[52px] shrink-0 items-center justify-center overflow-hidden rounded-[10px] bg-[#EEF1F5] text-[#98A2B3]">
                    {m.photoUrl ? (
                      <img src={m.photoUrl} alt="" className="size-full object-cover" />
                    ) : (
                      <span aria-hidden>🍽</span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => navigate(`/admin/menu/${m.id}`)}
                    className="flex min-w-0 grow flex-col gap-0.5 text-left"
                  >
                    <b className="text-base leading-tight">{tl(m.name, lang)}</b>
                    <span className="text-[13px] text-muted">
                      {catName(m.categoryId)} · {formatMoney(m.prices.store, money.main)}
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-pressed={m.available}
                    aria-label={`${tl(m.name, lang)}: ${m.available ? t('common.available') : t('common.soldOut')}`}
                    onClick={() => toggle.mutate({ id: m.id, available: !m.available })}
                    className={cn(
                      'h-11 w-24 shrink-0 rounded-full text-sm font-extrabold text-white',
                      m.available ? 'bg-primary' : 'bg-danger',
                    )}
                  >
                    {m.available ? t('common.available') : t('common.soldOut')}
                  </button>
                </div>
              ))}
            </div>
          </>
        ) : (
          <>
            <span className="text-[13px] text-muted">{t('menux.groupHint')}</span>
            {groups.isLoading ? <LoadingBlock /> : null}
            {groups.isError ? (
              <ErrorBlock error={groups.error} onRetry={() => void groups.refetch()} />
            ) : null}
            <div className="grid gap-2 md:grid-cols-2">
              {glist.map((g) => (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => navigate(`/admin/opsi/${g.id}`)}
                  className="flex flex-col gap-1.5 rounded-[14px] bg-white p-3 text-left shadow-card"
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <b className="text-base">{tl(g.name, lang)}</b>
                    <span
                      className={cn(
                        'rounded-[7px] px-2 py-[3px] text-xs font-extrabold',
                        g.required ? 'bg-danger-tint text-danger' : 'bg-[#F2F4F7] text-[#475467]',
                      )}
                    >
                      {groupRuleShort(g, t)}
                    </span>
                  </div>
                  <span className="text-[13px] text-[#475467]">
                    {g.options
                      .map(
                        (o) =>
                          `${tl(o.name, lang)}${o.priceDelta ? ` +${formatMoney(o.priceDelta, money.main, { noSymbol: true })}` : ''}${o.available ? '' : ` (${t('common.soldOut').toLowerCase()})`}`,
                      )
                      .join(', ')}
                  </span>
                  <span className="text-xs text-muted">
                    {t('menux.usedIn')}: {g.itemIds.map(itemName).filter(Boolean).join(', ') || '—'}
                  </span>
                </button>
              ))}
            </div>
          </>
        )}
      </main>
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 mx-auto w-full max-w-[960px] px-3">
        <button
          type="button"
          onClick={() => navigate(tab === 'menu' ? '/admin/menu/baru' : '/admin/opsi/baru')}
          className="pointer-events-auto flex h-[60px] w-full items-center justify-center rounded-2xl bg-primary text-lg font-extrabold text-white shadow-[0_4px_14px_rgba(0,0,0,0.18)]"
        >
          {tab === 'menu' ? t('menux.addMenu') : t('menux.addGroup')}
        </button>
      </div>
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
          <div key={c.id} className="flex min-h-12 items-center gap-2 border-b border-[#F2F4F7]">
            <span className="grow font-semibold">{tl(c.name, i18n.language)}</span>
            <Button
              variant="ghost"
              size="md"
              onClick={() => {
                setEditing(c);
                setName(c.name.id);
              }}
            >
              {t('common.edit')}
            </Button>
            <Button variant="ghost" size="md" className="text-danger" onClick={() => setDel(c)}>
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
