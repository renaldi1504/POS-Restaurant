/**
 * Lembar opsi menu untuk kasir — aturan sama dengan website/Mini App (validator @pos/shared):
 * tombol Tambah aktif setelah semua grup wajib terpenuhi; batas maksimal; pilihan habis disabled; total ikut berubah.
 */
import type { TFunction } from 'i18next';
import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  effectiveMax,
  effectiveMin,
  formatMoney,
  tl,
  toggleOption,
  validateOptionSelection,
  type Currency,
  type MenuItemDto,
  type OptionGroupDto,
} from '@pos/shared';
import { cn } from '../ui';

export interface OptionSheetProps {
  item: MenuItemDto | null;
  groups: OptionGroupDto[];
  /** Harga dasar untuk channel aktif. */
  basePrice: number;
  currency: Currency;
  onClose: () => void;
  onAdd: (v: { optionIds: number[]; qty: number; note?: string }) => void;
}

export function groupRuleLabel(g: OptionGroupDto, selected: number, t: TFunction): string {
  const max = effectiveMax(g);
  const min = effectiveMin(g);
  if (g.required) {
    if (max === 1) return t('common.chooseOne');
    if (min > 1 && max >= min) return `${t('common.chooseAtLeast', { count: min })} · ${t('common.chooseUpTo', { count: max })}`;
    return t('common.chooseUpTo', { count: max });
  }
  if (max === 1) return `${t('common.optional')} · ${t('common.chooseOne').toLowerCase()}`;
  return t('opsi.ruleOptionalMax', { max, count: selected });
}

export function OptionSheet({ item, groups, basePrice, currency, onClose, onAdd }: OptionSheetProps) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const [selected, setSelected] = useState<number[]>([]);
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    setSelected([]);
    setQty(1);
    setNote('');
  }, [item?.id]);

  useEffect(() => {
    if (!item) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [item, onClose]);

  const result = useMemo(() => validateOptionSelection(groups, selected), [groups, selected]);
  const delta = useMemo(() => {
    const ids = new Set(selected);
    return groups.flatMap((g) => g.options).filter((o) => ids.has(o.id)).reduce((a, o) => a + o.priceDelta, 0);
  }, [groups, selected]);
  const firstMissing = result.ok ? null : groups.find((g) => !result.ok && result.errors.some((e) => e.groupId === g.id && (e.code === 'required' || e.code === 'min')));

  if (!item) return null;
  const total = (basePrice + delta) * qty;
  const fmt = (n: number) => formatMoney(n, currency);
  const hasPriced = groups.some((g) => g.options.some((o) => o.priceDelta > 0));

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-ink/50" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tl(item.name, lang)}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[94dvh] w-full max-w-[560px] flex-col overflow-hidden rounded-t-[20px] bg-bg"
      >
        <main className="flex min-h-0 grow flex-col overflow-y-auto">
          <div className="relative flex h-[150px] shrink-0 items-center justify-center bg-[#EEF1F5] text-[#98A2B3]">
            {item.photoUrl ? (
              <img src={item.photoUrl} alt="" className="size-full object-cover" />
            ) : (
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
                <path d="M3 2v7c0 1.1.9 2 2 2h2a2 2 0 0 0 2-2V2M7 2v20M21 15V2a5 5 0 0 0-5 5v6c0 1.1.9 2 2 2h3zm0 0v7" />
              </svg>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('opsi.backToMenu')}
              className="absolute left-3 top-3 flex size-11 items-center justify-center rounded-full bg-white text-[22px] font-bold text-ink shadow-[0_1px_3px_rgba(16,24,40,0.15)]"
            >
              ‹
            </button>
          </div>
          <div className="flex flex-col gap-1 bg-white px-4 py-3.5">
            <b className="text-[21px]">{tl(item.name, lang)}</b>
            {tl(item.description, lang) ? <span className="text-[13px] text-muted">{tl(item.description, lang)}</span> : null}
            <b className="mt-0.5 text-[17px] text-primary-dark">
              {hasPriced ? t('opsi.startFrom', { price: fmt(basePrice) }) : fmt(basePrice)}
            </b>
          </div>

          {groups.map((g) => {
            const gIds = new Set(g.options.map((o) => o.id));
            const inGroup = selected.filter((id) => gIds.has(id));
            const max = effectiveMax(g);
            const satisfied = inGroup.length >= effectiveMin(g) && (g.required ? inGroup.length > 0 : true);
            const radio = max === 1;
            return (
              <section key={g.id} className="mt-2 flex flex-col bg-white px-4 pb-1.5 pt-3" aria-labelledby={`grp-${g.id}`}>
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <b id={`grp-${g.id}`} className="text-base">
                      {tl(g.name, lang)}
                    </b>
                    <span className="text-xs text-muted">{groupRuleLabel(g, inGroup.length, t)}</span>
                  </div>
                  {g.required ? (
                    <span
                      className={cn(
                        'shrink-0 rounded-[7px] px-2 py-1 text-xs font-extrabold',
                        satisfied ? 'bg-primary-tint text-primary-dark' : 'bg-danger-tint text-danger',
                      )}
                    >
                      {satisfied ? t('opsi.chosen') : t('common.required')}
                    </span>
                  ) : (
                    <span className="shrink-0 rounded-[7px] bg-[#F2F4F7] px-2 py-1 text-xs font-extrabold text-[#475467]">
                      {t('common.optional')}
                    </span>
                  )}
                </div>
                <div role={radio ? 'radiogroup' : 'group'} aria-labelledby={`grp-${g.id}`}>
                  {g.options.map((o) => {
                    const on = inGroup.includes(o.id);
                    const full = !radio && !on && inGroup.length >= max;
                    const off = !o.available || full;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role={radio ? 'radio' : 'checkbox'}
                        aria-checked={on}
                        aria-disabled={off || undefined}
                        onClick={() => !off && setSelected((s) => toggleOption(g, s, o.id))}
                        className={cn(
                          'flex min-h-[52px] w-full items-center gap-3 border-b border-[#F2F4F7] text-left text-[15px]',
                          off && 'opacity-45',
                        )}
                      >
                        <span
                          className={cn(
                            'flex size-[22px] shrink-0 items-center justify-center border-2 text-[13px] font-extrabold text-white',
                            radio ? 'rounded-full' : 'rounded-md',
                            on ? 'border-primary bg-primary' : 'border-[#98A2B3] bg-white',
                          )}
                          aria-hidden
                        >
                          {on ? (radio ? '•' : '✓') : ''}
                        </span>
                        <span className="grow">{tl(o.name, lang)}</span>
                        <span className="text-muted">
                          {!o.available ? t('common.soldOut') : o.priceDelta ? `+${fmt(o.priceDelta)}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="mt-2 flex flex-col gap-1.5 bg-white px-4 pb-4 pt-3">
            <label htmlFor="opt-note" className="font-bold">
              {t('order.itemNote')} <span className="font-medium text-muted">({t('common.optional').toLowerCase()})</span>
            </label>
            <input
              id="opt-note"
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('opsi.notePlaceholder')}
              className="h-12 rounded-xl border border-line-strong px-3 text-[15px]"
            />
          </section>
        </main>
        <footer className="flex shrink-0 flex-col gap-2 border-t border-line bg-white px-3.5 pb-[max(14px,env(safe-area-inset-bottom))] pt-2.5">
          {firstMissing ? (
            <span className="text-center text-[13px] font-bold text-danger" role="status">
              {t('opsi.missing', { name: tl(firstMissing.name, lang) })}
            </span>
          ) : null}
          <div className="flex items-center gap-2.5">
            <div className="flex h-[54px] items-center gap-1 rounded-[14px] border border-line-strong px-1">
              <button
                type="button"
                aria-label={t('opsi.decQty')}
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                className="h-11 w-10 text-[22px] font-extrabold"
              >
                −
              </button>
              <b className="min-w-[18px] text-center text-[17px]" aria-live="polite">
                {qty}
              </b>
              <button
                type="button"
                aria-label={t('opsi.incQty')}
                onClick={() => setQty((q) => Math.min(99, q + 1))}
                className="h-11 w-10 text-[22px] font-extrabold"
              >
                +
              </button>
            </div>
            <button
              type="button"
              disabled={!result.ok}
              onClick={() => onAdd({ optionIds: selected, qty, note: note.trim() || undefined })}
              className={cn(
                'h-[54px] grow rounded-[14px] text-base font-extrabold',
                result.ok ? 'bg-primary text-white' : 'cursor-not-allowed bg-[#E4E7EC] text-[#475467]',
              )}
            >
              {t('order.addToCart', { price: fmt(total) })}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
