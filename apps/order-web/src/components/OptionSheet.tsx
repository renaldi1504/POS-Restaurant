/**
 * Lembar opsi menu — acuan docs/mockups/ItemOpsi.dc.html.
 * Grup wajib/opsional (badge), radio (max 1) / checkbox (batas max), pilihan habis disabled, harga tambahan,
 * jumlah, catatan, total langsung, tombol nonaktif + petunjuk "Pilih … dulu". Validasi pakai validator shared.
 */
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  effectiveMax,
  effectiveMin,
  formatMoney,
  toggleOption,
  tl,
  validateOptionSelection,
  type Currency,
  type OptionGroupDto,
  type PublicMenuItem,
} from '@pos/shared';
import { money } from '../lib/menu';
import { CheckIcon, ChevronLeft } from './Icons';
import { DishTile } from './MenuItemCard';
import { Icon, Stepper, cn } from './ui';

export interface OptionSheetValue {
  optionIds: number[];
  qty: number;
  note: string;
}

export interface OptionSheetProps {
  item: PublicMenuItem;
  groups: OptionGroupDto[];
  currency: Currency;
  initial?: Partial<OptionSheetValue>;
  mode?: 'add' | 'edit';
  onSubmit: (v: OptionSheetValue) => void;
  onClose: () => void;
}

export function OptionSheet({
  item,
  groups,
  currency,
  initial,
  mode = 'add',
  onSubmit,
  onClose,
}: OptionSheetProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [selected, setSelected] = useState<number[]>(initial?.optionIds ?? []);
  const [qty, setQty] = useState(initial?.qty ?? 1);
  const [note, setNote] = useState(initial?.note ?? '');
  const titleId = useId();
  const noteId = useId();
  const backRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    backRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeRef.current();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, []);

  const result = useMemo(() => validateOptionSelection(groups, selected), [groups, selected]);
  const delta = useMemo(() => {
    const all = new Map(groups.flatMap((g) => g.options).map((o) => [o.id, o]));
    return selected.reduce((a, id) => a + (all.get(id)?.available ? all.get(id)!.priceDelta : 0), 0);
  }, [groups, selected]);
  const total = (item.price + delta) * qty;
  const firstMissing = result.ok
    ? null
    : groups.find((g) => !result.ok && result.errors.some((e) => e.groupId === g.id));
  const canSubmit = result.ok && item.available;
  const hasPricedOptions = groups.some((g) => g.options.some((o) => o.priceDelta > 0));
  const name = tl(item.name, lang);
  const desc = tl(item.description, lang);

  const ruleText = (g: OptionGroupDto, count: number) => {
    const min = effectiveMin(g);
    const max = effectiveMax(g);
    if (g.required) {
      if (max === 1) return t('common.chooseOne');
      if (min === max) return t('common.chooseAtLeast', { count: min });
      if (max < g.options.length) return t('web.requiredRange', { min, max });
      return t('common.chooseAtLeast', { count: min });
    }
    if (max === 1) return t('web.optionalOne');
    if (max < g.options.length) return t('web.optionalMax', { max, n: count });
    return t('common.optional');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in justify-center bg-scrim medium:items-center medium:p-6"
      onClick={onClose}
      data-testid="option-sheet"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex h-dvh w-full max-w-[560px] flex-col bg-surface-container-low text-body-large shadow-e3 medium:h-auto medium:max-h-[90dvh] medium:overflow-hidden medium:rounded-xl"
      >
        <main className="flex min-h-0 grow flex-col overflow-y-auto">
          <div className="relative shrink-0">
            {/* Foto utuh 4:3 (tidak terpotong / tertutup panel). */}
            <DishTile item={item} name={name} size="lg" fit="contain" className="aspect-[4/3] w-full" />
            <button
              ref={backRef}
              type="button"
              onClick={onClose}
              aria-label={t('web.backToMenu')}
              className="state-layer absolute left-3 top-3 flex size-12 items-center justify-center rounded-full bg-surface-container-lowest/95 text-on-surface shadow-e2"
            >
              <ChevronLeft />
            </button>
          </div>

          <div className="relative flex flex-col gap-1 bg-surface-container-low px-5 pb-2 pt-4">
            <h2 id={titleId} className="font-display text-headline-small">
              {name}
            </h2>
            {desc ? <p className="text-body-medium text-on-surface-variant">{desc}</p> : null}
            <b className="mt-1 text-title-large font-bold tabular-nums">
              {hasPricedOptions
                ? t('web.priceFrom', { price: money(item.price, currency) })
                : money(item.price, currency)}
            </b>
          </div>

          {groups.map((g) => {
            const inGroup = selected.filter((id) => g.options.some((o) => o.id === id));
            const max = effectiveMax(g);
            const single = max === 1;
            const groupOk = !(!result.ok && result.errors.some((e) => e.groupId === g.id));
            const gName = tl(g.name, lang);
            const labelId = `grp-${g.id}`;
            const badge = g.required
              ? groupOk
                ? { text: t('web.selected'), cls: 'bg-secondary-container text-on-secondary-container' }
                : { text: t('common.required'), cls: 'bg-error-container text-on-error-container' }
              : { text: t('common.optional'), cls: 'bg-surface-container-high text-on-surface-variant' };
            return (
              <section
                key={g.id}
                className="mx-4 mt-3 flex flex-col rounded-2xl bg-surface-container-lowest px-4 pb-1 pt-3 shadow-card"
                aria-labelledby={labelId}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <h3 id={labelId} className="text-title-medium">
                      {gName}
                    </h3>
                    <span className="text-body-medium text-on-surface-variant">
                      {ruleText(g, inGroup.length)}
                    </span>
                  </div>
                  <span
                    className={cn(
                      'flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-label-medium',
                      badge.cls,
                    )}
                  >
                    {g.required ? <Icon name={groupOk ? 'check' : 'error'} size={16} /> : null}
                    {badge.text}
                  </span>
                </div>
                <div
                  role={single ? 'radiogroup' : 'group'}
                  aria-labelledby={labelId}
                  className="flex flex-col"
                >
                  {[...g.options]
                    .sort((a, b) => a.sort - b.sort || a.id - b.id)
                    .map((o) => {
                      const on = inGroup.includes(o.id);
                      const full = !single && !on && inGroup.length >= max;
                      const off = !o.available || full;
                      return (
                        <button
                          key={o.id}
                          type="button"
                          role={single ? 'radio' : 'checkbox'}
                          aria-checked={on}
                          disabled={off && !on}
                          onClick={() => setSelected((s) => toggleOption(g, s, o.id))}
                          className={cn(
                            'flex min-h-14 items-center gap-4 border-b border-surface-container-highest text-left text-body-large last:border-b-0',
                            off && !on && 'opacity-38',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'flex size-6 shrink-0 items-center justify-center border-2',
                              single ? 'rounded-full' : 'rounded-xs',
                              on ? 'border-primary' : 'border-on-surface-variant',
                              on && !single && 'bg-primary text-on-primary',
                            )}
                          >
                            {on ? (
                              single ? (
                                <span className="size-3 rounded-full bg-primary" />
                              ) : (
                                <CheckIcon size={18} />
                              )
                            ) : null}
                          </span>
                          <span className="grow">{tl(o.name, lang)}</span>
                          <span className="text-body-medium text-on-surface-variant tabular-nums">
                            {!o.available
                              ? t('web.unavailableNow')
                              : o.priceDelta
                                ? formatMoney(o.priceDelta, currency, { signed: true })
                                : ''}
                          </span>
                        </button>
                      );
                    })}
                </div>
              </section>
            );
          })}

          <section className="group/field relative mx-4 my-3 flex rounded-2xl border border-outline-variant bg-surface-container-lowest focus-within:border-primary focus-within:outline-1 focus-within:outline-primary">
            <label
              htmlFor={noteId}
              className="pointer-events-none absolute left-4 right-4 top-1.5 truncate text-label-medium text-on-surface-variant group-focus-within/field:text-primary"
            >
              {t('order.itemNote')} <span className="font-normal">{t('web.noteOptional')}</span>
            </label>
            <input
              id={noteId}
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('web.itemNotePlaceholder')}
              className="h-14 w-full bg-transparent px-4 pb-1.5 pt-6 text-body-large outline-none placeholder:text-on-surface-variant/70"
            />
          </section>
        </main>

        <footer className="flex shrink-0 flex-col gap-2 rounded-t-2xl bg-surface-container-lowest px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 shadow-up medium:rounded-none medium:pb-4">
          {firstMissing ? (
            <p
              className="flex items-center justify-center gap-1 text-center text-label-large text-error"
              role="status"
            >
              <Icon name="error" size={18} />
              {t('web.chooseFirst', { name: tl(firstMissing.name, lang) })}
            </p>
          ) : null}
          <div className="flex items-center gap-2.5">
            <Stepper
              value={qty}
              onChange={setQty}
              min={1}
              max={99}
              label={t('web.qtyOf', { name })}
              decLabel={t('web.decItem', { name })}
              incLabel={t('web.incItem', { name })}
            />
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => onSubmit({ optionIds: selected, qty, note: note.trim() })}
              className="state-layer h-14 min-w-0 grow truncate rounded-full bg-primary px-3 text-title-medium font-semibold text-on-primary shadow-e1 transition-[background-color,box-shadow] disabled:bg-on-surface/12 disabled:text-on-surface/38 disabled:shadow-none"
            >
              {mode === 'edit'
                ? t('web.saveItem', { price: money(total, currency) })
                : t('order.addToCart', { price: money(total, currency) })}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
