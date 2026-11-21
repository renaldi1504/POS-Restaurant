/**
 * Inventaris i18n: daftar kunci yang ada di `id` tetapi belum ada di en/kh/zh
 * (kamus shared @pos/shared/i18n + kamus tambahan pos-web + teks web pelanggan).
 *
 *   pnpm i18n:missing            # ringkasan + daftar kunci (exit 1 bila ada yang kurang)
 *   pnpm i18n:missing --counts   # hanya jumlah
 */
import { dictionaries } from '../packages/shared/src/i18n/index';
import { extraEn, extraId, extraKh, extraZh } from '../apps/pos-web/src/i18n/extra';
import { webStrings } from '../apps/order-web/src/lib/strings';

export function flatKeys(obj: unknown, prefix = ''): string[] {
  if (typeof obj === 'string') return [prefix];
  if (!obj || typeof obj !== 'object') return [];
  return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) =>
    flatKeys(v, prefix ? `${prefix}.${k}` : k),
  );
}

const groups = {
  shared: { id: dictionaries.id, en: dictionaries.en, kh: dictionaries.kh, zh: dictionaries.zh },
  'pos-web extra': { id: extraId, en: extraEn, kh: extraKh, zh: extraZh },
  'order-web web.*': { id: webStrings.id, en: webStrings.en, kh: webStrings.kh, zh: webStrings.zh },
} as const;

const countsOnly = process.argv.includes('--counts');
let totalMissing = 0;
for (const [name, g] of Object.entries(groups)) {
  const idKeys = flatKeys(g.id);
  console.log(`\n# ${name}: ${idKeys.length} kunci di id`);
  for (const lang of ['en', 'kh', 'zh'] as const) {
    const have = new Set(flatKeys(g[lang]));
    const missing = idKeys.filter((k) => !have.has(k));
    totalMissing += missing.length;
    console.log(`  ${lang}: ${idKeys.length - missing.length}/${idKeys.length} (kurang ${missing.length})`);
    if (!countsOnly) for (const k of missing) console.log(`    - ${k}`);
  }
}
console.log(`\nTotal kunci kurang: ${totalMissing}`);
process.exitCode = totalMissing ? 1 : 0;
