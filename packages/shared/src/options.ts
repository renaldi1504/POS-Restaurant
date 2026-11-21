/**
 * Validator pilihan opsi menu — dipakai server (validasi order) & kedua frontend (lembar opsi).
 * Aturan grup: required → minimal max(1, minSelect) pilihan; minSelect/maxSelect; pilihan habis tidak boleh dipilih.
 */

export interface OptionLike {
  id: number;
  available: boolean;
  priceDelta: number;
}

export interface OptionGroupLike {
  id: number;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: OptionLike[];
}

export type OptionErrorCode = 'required' | 'min' | 'max' | 'unavailable' | 'unknown_option' | 'duplicate';

export interface OptionSelectionError {
  code: OptionErrorCode;
  groupId: number | null;
  optionId?: number;
  /** Untuk min/max: batas yang dilanggar. */
  limit?: number;
}

export type OptionSelectionResult =
  | { ok: true; priceDelta: number; byGroup: Map<number, number[]> }
  | { ok: false; errors: OptionSelectionError[] };

/** Batas efektif minimal pilihan untuk grup. */
export function effectiveMin(g: Pick<OptionGroupLike, 'required' | 'minSelect'>): number {
  return g.required ? Math.max(1, g.minSelect) : Math.max(0, g.minSelect);
}

/** Batas efektif maksimal (0 / negatif = tanpa batas → jumlah pilihan). */
export function effectiveMax(g: Pick<OptionGroupLike, 'maxSelect' | 'options'>): number {
  return g.maxSelect > 0 ? g.maxSelect : g.options.length;
}

/**
 * Validasi daftar optionId terhadap grup-grup yang terpasang di menu.
 * @param groups grup opsi yang terpasang ke item (beserta pilihannya)
 * @param selectedOptionIds id pilihan yang dipilih pelanggan/kasir
 */
export function validateOptionSelection(
  groups: OptionGroupLike[],
  selectedOptionIds: number[],
): OptionSelectionResult {
  const errors: OptionSelectionError[] = [];
  const optionIndex = new Map<number, { group: OptionGroupLike; option: OptionLike }>();
  for (const g of groups) for (const o of g.options) optionIndex.set(o.id, { group: g, option: o });

  const seen = new Set<number>();
  const byGroup = new Map<number, number[]>();
  let priceDelta = 0;

  for (const id of selectedOptionIds) {
    if (seen.has(id)) {
      errors.push({ code: 'duplicate', groupId: optionIndex.get(id)?.group.id ?? null, optionId: id });
      continue;
    }
    seen.add(id);
    const hit = optionIndex.get(id);
    if (!hit) {
      errors.push({ code: 'unknown_option', groupId: null, optionId: id });
      continue;
    }
    if (!hit.option.available) {
      errors.push({ code: 'unavailable', groupId: hit.group.id, optionId: id });
      continue;
    }
    const list = byGroup.get(hit.group.id) ?? [];
    list.push(id);
    byGroup.set(hit.group.id, list);
    priceDelta += hit.option.priceDelta;
  }

  for (const g of groups) {
    const count = byGroup.get(g.id)?.length ?? 0;
    const min = effectiveMin(g);
    const max = effectiveMax(g);
    if (count === 0 && g.required) errors.push({ code: 'required', groupId: g.id, limit: min });
    else if (count < min) errors.push({ code: 'min', groupId: g.id, limit: min });
    if (count > max) errors.push({ code: 'max', groupId: g.id, limit: max });
  }

  return errors.length ? { ok: false, errors } : { ok: true, priceDelta, byGroup };
}

/** True bila semua grup wajib terpenuhi & tidak ada pelanggaran (untuk mengaktifkan tombol Tambah). */
export function isSelectionComplete(groups: OptionGroupLike[], selectedOptionIds: number[]): boolean {
  return validateOptionSelection(groups, selectedOptionIds).ok;
}

/**
 * Toggle pilihan di UI dengan menghormati aturan grup:
 * - grup pilih-1 (max 1) → ganti pilihan (radio)
 * - grup multi → tambah/hapus, tidak melebihi max
 * - pilihan habis tidak bisa dipilih
 */
export function toggleOption(
  group: OptionGroupLike,
  selectedOptionIds: number[],
  optionId: number,
): number[] {
  const option = group.options.find((o) => o.id === optionId);
  if (!option) return selectedOptionIds;
  const groupOptionIds = new Set(group.options.map((o) => o.id));
  const inGroup = selectedOptionIds.filter((id) => groupOptionIds.has(id));
  const others = selectedOptionIds.filter((id) => !groupOptionIds.has(id));
  if (inGroup.includes(optionId)) return [...others, ...inGroup.filter((id) => id !== optionId)];
  if (!option.available) return selectedOptionIds;
  const max = effectiveMax(group);
  if (max === 1) return [...others, optionId];
  if (inGroup.length >= max) return selectedOptionIds;
  return [...others, ...inGroup, optionId];
}

/** Harga satu baris: (harga dasar + total delta opsi) × qty. */
export function computeLineTotal(unitBasePrice: number, optionsDelta: number, qty: number): number {
  return (unitBasePrice + optionsDelta) * qty;
}
