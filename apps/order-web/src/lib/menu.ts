/**
 * Data menu & settings pelanggan + util tampilan (cari lintas bahasa, harga baris keranjang).
 */
import { useQuery } from '@tanstack/react-query';
import {
  formatMoney,
  openPeriods,
  parseHHMM,
  zonedParts,
  matchesLocalized,
  type Currency,
  type OptionDto,
  type OptionGroupDto,
  type PublicCategory,
  type PublicMenuItem,
  type PublicMenuResponse,
  type PublicSettingsResponse,
} from '@pos/shared';
import { api, qk } from './api';
import type { CartLine } from './cart';

export function useSettings() {
  return useQuery({
    queryKey: qk.settings,
    queryFn: () => api.call('publicSettings'),
    staleTime: 60_000,
    refetchInterval: 5 * 60_000,
  });
}

export function useMenu() {
  return useQuery({
    queryKey: qk.menu('all'),
    queryFn: () => api.call('publicMenu'),
    staleTime: 60_000,
  });
}

export function mainCurrency(settings: PublicSettingsResponse | undefined): Currency {
  return settings?.currency.main ?? 'KHR';
}

export function money(amount: number, currency: Currency): string {
  return formatMoney(amount, currency);
}

/** "03:00" → "03.00" untuk bahasa Indonesia (sesuai mockup). */
export function formatHour(hhmm: string, lang: string): string {
  return lang === 'id' ? hhmm.replace(':', '.') : hhmm;
}

type HoursLike = PublicSettingsResponse['hours'];

/** Jam buka lagi saat tutup: sesi berikutnya (mis. habis istirahat siang), atau jam buka pertama. */
export function reopenTime(hours: HoursLike): string {
  return hours.nextOpen ?? hours.open;
}

/** Jam tutup sesi yang sedang berjalan (sesi berisi `now`); cadangan: jam tutup terakhir hari itu. */
export function currentClose(hours: HoursLike, now: Date = new Date()): string {
  const p = zonedParts(now);
  const m = p.hour * 60 + p.minute;
  const cur = openPeriods(hours).find((x) => {
    const o = parseHHMM(x.open);
    const c = parseHHMM(x.close);
    if (o === c) return true;
    return c > o ? m >= o && m < c : m >= o || m < c;
  });
  return cur?.close ?? hours.close;
}

/** Semua sesi bila ≥ 2 ("08.00–14.00 · 17.00–20.00"), selain itu null. */
export function sessionsText(hours: HoursLike, lang: string): string | null {
  const ps = openPeriods(hours);
  if (ps.length < 2) return null;
  return ps.map((x) => `${formatHour(x.open, lang)}–${formatHour(x.close, lang)}`).join(' · ');
}

export function groupsForItem(menu: PublicMenuResponse, item: PublicMenuItem): OptionGroupDto[] {
  const byId = new Map(menu.optionGroups.map((g) => [g.id, g]));
  return item.optionGroupIds.map((id) => byId.get(id)).filter((g): g is OptionGroupDto => !!g);
}

/** Kategori pseudo untuk chip. */
export const CAT_ALL = 'all';
export const CAT_BEST = 'best';
export type CategoryFilter = typeof CAT_ALL | typeof CAT_BEST | number;

/** Habis ke bawah, sisanya urut `sort`. */
export function sortSoldOutLast(items: PublicMenuItem[]): PublicMenuItem[] {
  return [...items].sort(
    (a, b) => Number(!a.available) - Number(!b.available) || a.sort - b.sort || a.id - b.id,
  );
}

export function filterItems(menu: PublicMenuResponse, query: string, cat: CategoryFilter): PublicMenuItem[] {
  const cats = new Map(menu.categories.map((c) => [c.id, c]));
  const q = query.trim();
  return sortSoldOutLast(
    menu.items.filter((it) => {
      if (cat === CAT_BEST && !it.bestSeller) return false;
      if (typeof cat === 'number' && it.categoryId !== cat) return false;
      if (!q) return true;
      return matchesLocalized(q, it.name, cats.get(it.categoryId)?.name);
    }),
  );
}

export function sortedCategories(menu: PublicMenuResponse): PublicCategory[] {
  return [...menu.categories].sort((a, b) => a.sort - b.sort || a.id - b.id);
}

export interface PricedLine {
  line: CartLine;
  item: PublicMenuItem | undefined;
  options: OptionDto[];
  unit: number;
  total: number;
  /** Item/opsi masih tersedia. */
  available: boolean;
}

export function priceLine(menu: PublicMenuResponse | undefined, line: CartLine): PricedLine {
  const item = menu?.items.find((i) => i.id === line.itemId);
  if (!menu || !item) return { line, item, options: [], unit: 0, total: 0, available: !menu };
  const groups = groupsForItem(menu, item);
  const optIndex = new Map<number, OptionDto>();
  for (const g of groups) for (const o of g.options) optIndex.set(o.id, o);
  const options = line.optionIds.map((id) => optIndex.get(id)).filter((o): o is OptionDto => !!o);
  const unit = item.price + options.reduce((a, o) => a + o.priceDelta, 0);
  const available =
    item.available && options.length === line.optionIds.length && options.every((o) => o.available);
  return { line, item, options, unit, total: unit * line.qty, available };
}

export function cartTotals(menu: PublicMenuResponse | undefined, lines: CartLine[]) {
  const priced = lines.map((l) => priceLine(menu, l));
  return {
    priced,
    subtotal: priced.reduce((a, p) => a + p.total, 0),
    count: lines.reduce((a, l) => a + l.qty, 0),
    allAvailable: priced.every((p) => p.available),
  };
}

export function typeLabelKey(type: string): string {
  return type === 'delivery'
    ? 'web.typeDelivery'
    : type === 'takeaway'
      ? 'web.typeTakeaway'
      : 'web.typeDineIn';
}

/** Kekurangan menuju minimal order delivery (0 = sudah cukup / bukan delivery). */
export function minOrderGap(subtotal: number, minOrder: number | undefined, isDelivery: boolean): number {
  if (!isDelivery || !minOrder) return 0;
  return Math.max(0, minOrder - subtotal);
}
