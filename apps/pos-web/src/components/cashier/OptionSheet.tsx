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
import { Badge, Button, Icon, Stepper, cn } from '../ui';
import { TextField } from '../common/Form';

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
    if (min > 1 && max >= min)
      return `${t('common.chooseAtLeast', { count: min })} · ${t('common.chooseUpTo', { count: max })}`;
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
    return groups
      .flatMap((g) => g.options)
      .filter((o) => ids.has(o.id))
      .reduce((a, o) => a + o.priceDelta, 0);
  }, [groups, selected]);
  const firstMissing = result.ok
    ? null
    : groups.find(
        (g) =>
          !result.ok &&
          result.errors.some((e) => e.groupId === g.id && (e.code === 'required' || e.code === 'min')),
      );

  if (!item) return null;
  const total = (basePrice + delta) * qty;
  const fmt = (n: number) => formatMoney(n, currency);
  const hasPriced = groups.some((g) => g.options.some((o) => o.priceDelta > 0));

  return (
    <div
      className="fixed inset-0 z-50 flex animate-fade-in items-end justify-center bg-scrim medium:items-center medium:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={tl(item.name, lang)}
        onClick={(e) => e.stopPropagation()}
        className="flex h-[94dvh] w-full max-w-[560px] animate-sheet-up flex-col overflow-hidden rounded-t-xl bg-surface-container-low shadow-e3 medium:h-auto medium:max-h-[90dvh] medium:animate-fade-in medium:rounded-xl"
      >
        <main className="flex min-h-0 grow flex-col overflow-y-auto">
          <div className="relative flex h-[160px] shrink-0 items-center justify-center bg-surface-container-high text-outline">
            {item.photoUrl ? (
              <img src={item.photoUrl} alt="" className="size-full object-cover" />
            ) : (
              <Icon name="restaurant" size={48} />
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label={t('opsi.backToMenu')}
              className="state-layer absolute left-3 top-3 flex size-12 items-center justify-center rounded-full bg-surface-container-lowest text-on-surface shadow-e1"
            >
              <Icon name="arrow_back" />
            </button>
          </div>
          <div className="flex flex-col gap-1 px-6 pb-2 pt-4">
            <b className="text-headline-small">{tl(item.name, lang)}</b>
            {tl(item.description, lang) ? (
              <span className="text-body-medium text-on-surface-variant">{tl(item.description, lang)}</span>
            ) : null}
            <b className="mt-0.5 text-title-medium tabular-nums text-primary">
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
              <section
                key={g.id}
                className="mx-4 mt-3 flex flex-col rounded-md bg-surface-container-lowest px-4 pb-1 pt-3"
                aria-labelledby={`grp-${g.id}`}
              >
                <div className="mb-1 flex items-center justify-between gap-2">
                  <div className="flex flex-col gap-0.5">
                    <b id={`grp-${g.id}`} className="text-title-medium">
                      {tl(g.name, lang)}
                    </b>
                    <span className="text-body-medium text-on-surface-variant">
                      {groupRuleLabel(g, inGroup.length, t)}
                    </span>
                  </div>
                  {g.required ? (
                    <Badge tone={satisfied ? 'primary' : 'danger'} className="shrink-0">
                      <Icon name={satisfied ? 'check' : 'error'} size={16} />
                      {satisfied ? t('opsi.chosen') : t('common.required')}
                    </Badge>
                  ) : (
                    <Badge className="shrink-0">{t('common.optional')}</Badge>
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
                          'flex min-h-14 w-full items-center gap-4 border-b border-surface-container-highest text-left text-body-large last:border-b-0',
                          off && 'opacity-38',
                        )}
                      >
                        <SelectMark radio={radio} on={on} />
                        <span className="grow">{tl(o.name, lang)}</span>
                        <span className="text-body-medium tabular-nums text-on-surface-variant">
                          {!o.available ? t('common.soldOut') : o.priceDelta ? `+${fmt(o.priceDelta)}` : ''}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            );
          })}

          <section className="mx-4 my-3 flex flex-col gap-1.5">
            <TextField
              id="opt-note"
              label={t('order.itemNote')}
              hint={`(${t('common.optional').toLowerCase()})`}
              value={note}
              maxLength={200}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t('opsi.notePlaceholder')}
            />
          </section>
        </main>
        <footer className="flex shrink-0 flex-col gap-2 bg-surface-container px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-3 medium:pb-4">
          {firstMissing ? (
            <span
              className="flex items-center justify-center gap-1 text-center text-label-large text-error"
              role="status"
            >
              <Icon name="error" size={18} />
              {t('opsi.missing', { name: tl(firstMissing.name, lang) })}
            </span>
          ) : null}
          <div className="flex items-center gap-3">
            <Stepper
              value={qty}
              onChange={setQty}
              min={1}
              max={99}
              label={tl(item.name, lang)}
              decLabel={t('opsi.decQty')}
              incLabel={t('opsi.incQty')}
            />
            <Button
              size="lg"
              className="min-w-0 grow whitespace-nowrap px-4 text-label-large"
              disabled={!result.ok}
              onClick={() => onAdd({ optionIds: selected, qty, note: note.trim() || undefined })}
            >
              {t('order.addToCart', { price: fmt(total) })}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}

/** Tanda radio / checkbox M3 (24px). */
function SelectMark({ radio, on }: { radio: boolean; on: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        'flex size-6 shrink-0 items-center justify-center border-2',
        radio ? 'rounded-full' : 'rounded-xs',
        on ? 'border-primary' : 'border-on-surface-variant',
        on && !radio && 'bg-primary text-on-primary',
      )}
    >
      {on ? (
        radio ? (
          <span className="size-3 rounded-full bg-primary" />
        ) : (
          <Icon name="check" size={18} />
        )
      ) : null}
    </span>
  );
}
