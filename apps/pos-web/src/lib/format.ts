/**
 * Format tanggal & waktu mengikuti bahasa staf (nama hari/bulan & urutan lokal; angka tetap Latin).
 * Uang tetap memakai formatMoney (@pos/shared) supaya struk & layar konsisten.
 *
 * Catatan: Chrome desktop/Android tidak selalu membawa data ICU Khmer (`km`) — Intl lalu diam-diam jatuh
 * ke locale perangkat (bahkan saat supportedLocalesOf bilang didukung). Karena itu nama hari/bulan Khmer
 * selalu disediakan sendiri.
 */
import type { Lang } from '@pos/shared';
import { INTL_LOCALE } from '@pos/shared/i18n';

const KH_WEEKDAYS = ['អាទិត្យ', 'ចន្ទ', 'អង្គារ', 'ពុធ', 'ព្រហស្បតិ៍', 'សុក្រ', 'សៅរ៍'];
const KH_MONTHS = [
  'មករា',
  'កុម្ភៈ',
  'មីនា',
  'មេសា',
  'ឧសភា',
  'មិថុនា',
  'កក្កដា',
  'សីហា',
  'កញ្ញា',
  'តុលា',
  'វិច្ឆិកា',
  'ធ្នូ',
];

/** Apakah runtime punya data Intl untuk bahasa ini (bukan fallback ke locale perangkat)? */
export function intlSupports(lang: Lang): boolean {
  try {
    return Intl.DateTimeFormat.supportedLocalesOf([INTL_LOCALE[lang]]).length > 0;
  } catch {
    return false;
  }
}

/** "Sab, 21 Nov" / "Sat 21 Nov" / "សៅរ៍ 21 វិច្ឆិកា" / "11月21日周六" dari 'YYYY-MM-DD'. */
export function formatDayLabel(
  ymd: string,
  lang: Lang,
  opts: { weekday?: boolean; supports?: (l: Lang) => boolean } = {},
): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return ymd;
  const [y, m, d] = ymd.split('-').map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d, 12));
  const weekday = opts.weekday !== false;
  // Khmer: selalu pakai nama bawaan (data ICU `km` tidak bisa diandalkan); `supports` hanya untuk test.
  if (lang === 'kh' && !(opts.supports ?? (() => false))('kh')) {
    const dm = `${d} ${KH_MONTHS[m - 1]}`;
    return weekday ? `${KH_WEEKDAYS[date.getUTCDay()]} ${dm}` : dm;
  }
  return date.toLocaleDateString(INTL_LOCALE[lang], {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'short',
    ...(weekday ? { weekday: 'short' } : {}),
  });
}

/** Jam:menit (24 jam, angka Latin) dari ISO — sama di semua bahasa. */
export function formatTime(iso: string | Date, _lang?: Lang): string {
  const d = typeof iso === 'string' ? new Date(iso) : iso;
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
