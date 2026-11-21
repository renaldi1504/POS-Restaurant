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
import { CheckIcon, ChevronLeft, FoodIcon } from './Icons';
import { cn } from './ui';

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
      className="fixed inset-0 z-50 flex justify-center bg-ink/50"
      onClick={onClose}
      data-testid="option-sheet"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
        className="flex h-dvh w-full max-w-[480px] flex-col bg-bg text-[15px]"
      >
        <main className="flex min-h-0 grow flex-col overflow-y-auto">
          <div className="relative flex h-[190px] shrink-0 items-center justify-center bg-[#EEF1F5] text-[#98A2B3]">
            {item.photoUrl ? (
              <img src={item.photoUrl} alt="" className="size-full object-cover" />
            ) : (
              <FoodIcon size={40} />
            )}
            <button
              ref={backRef}
              type="button"
              onClick={onClose}
              aria-label={t('web.backToMenu')}
              className="absolute left-3 top-3 flex size-12 items-center justify-center rounded-full bg-white text-ink shadow-[0_1px_3px_rgba(16,24,40,0.15)]"
            >
              <ChevronLeft />
            </button>
          </div>

          <div className="flex flex-col gap-1 bg-white px-4 py-3.5">
            <h2 id={titleId} className="text-[21px] font-extrabold">
              {name}
            </h2>
            {desc ? <p className="text-[13px] text-muted">{desc}</p> : null}
            <b className="mt-0.5 text-[17px] text-primary-dark tabular-nums">
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
                ? { text: t('web.selected'), cls: 'bg-primary-tint text-primary-dark' }
                : { text: t('common.required'), cls: 'bg-danger-tint text-danger' }
              : { text: t('common.optional'), cls: 'bg-[#F2F4F7] text-[#475467]' };
            return (
              <section
                key={g.id}
                className="mt-2 flex flex-col bg-white px-4 pb-1.5 pt-3"
                aria-labelledby={labelId}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <h3 id={labelId} className="text-base font-bold">
                      {gName}
                    </h3>
                    <span className="text-xs text-muted">{ruleText(g, inGroup.length)}</span>
                  </div>
                  <span className={cn('shrink-0 rounded-[7px] px-2 py-1 text-xs font-extrabold', badge.cls)}>
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
                            'flex min-h-[52px] items-center gap-3 border-b border-[#F2F4F7] text-left text-[15px] last:border-b-0',
                            off && !on && 'opacity-45',
                          )}
                        >
                          <span
                            aria-hidden
                            className={cn(
                              'flex size-[22px] shrink-0 items-center justify-center border-2 text-white',
                              single ? 'rounded-full' : 'rounded-md',
                              on ? 'border-primary bg-primary' : 'border-[#98A2B3] bg-white',
                            )}
                          >
                            {on ? (
                              single ? (
                                <span className="size-2 rounded-full bg-white" />
                              ) : (
                                <CheckIcon size={14} />
                              )
                            ) : null}
                          </span>
                          <span className="grow">{tl(o.name, lang)}</span>
                          <span className="text-muted tabular-nums">
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

          <section className="mt-2 flex flex-col gap-1.5 bg-white px-4 pb-4 pt-3">
            <label htmlFor={noteId} className="font-bold">
              {t('order.itemNote')} <span className="font-medium text-muted">{t('web.noteOptional')}</span>
            </label>
            <input
              id={noteId}
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('web.itemNotePlaceholder')}
              className="h-12 rounded-xl border border-line-strong px-3"
            />
          </section>
        </main>

        <footer className="flex shrink-0 flex-col gap-2 border-t border-line bg-white px-3.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5">
          {firstMissing ? (
            <p className="text-center text-[13px] font-bold text-danger" role="status">
              {t('web.chooseFirst', { name: tl(firstMissing.name, lang) })}
            </p>
          ) : null}
          <div className="flex items-center gap-2.5">
            <div
              className="flex h-14 items-center gap-1 rounded-[14px] border border-line-strong px-1"
              role="group"
              aria-label={t('web.qtyOf', { name })}
            >
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                disabled={qty <= 1}
                aria-label={t('web.decItem', { name })}
                className="flex h-12 w-10 items-center justify-center text-2xl font-extrabold disabled:opacity-40"
              >
                −
              </button>
              <b className="min-w-5 text-center text-[17px] tabular-nums" aria-live="polite">
                {qty}
              </b>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                aria-label={t('web.incItem', { name })}
                className="flex h-12 w-10 items-center justify-center text-2xl font-extrabold"
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={!canSubmit}
              onClick={() => onSubmit({ optionIds: selected, qty, note: note.trim() })}
              className="h-14 min-w-0 grow rounded-[14px] bg-primary px-2 text-base font-extrabold text-white disabled:bg-[#E4E7EC] disabled:text-[#475467]"
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
