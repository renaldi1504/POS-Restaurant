/**
 * Semua nama ikon yang dipakai di kedua web app harus ada di daftar subset font
 * (packages/shared/src/icons.ts) — kalau tidak, ligatur tidak dikenal dan tampil sebagai teks.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ICON_NAMES } from '@pos/shared/icons';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    if (statSync(p).isDirectory()) return files(p);
    return /\.tsx?$/.test(f) && !/\.test\./.test(f) ? [p] : [];
  });
}

describe('ikon Material Symbols', () => {
  const roots = [join(__dirname, '../..'), join(__dirname, '../../../../order-web/src')];
  const used = new Set<string>();
  for (const f of roots.flatMap(files)) {
    const src = readFileSync(f, 'utf8');
    const exprs = [
      ...src.matchAll(/\bicon=("[^"]*"|\{[^}]*\})/g),
      ...src.matchAll(/<Icon[^>]*?\bname=("[^"]*"|\{[^}]*\})/g),
      ...src.matchAll(/\bicon: ('[^']*'|"[^"]*")/g),
    ].map((m) => m[1]!);
    for (const e of exprs) for (const m of e.matchAll(/['"]([a-z][a-z0-9_]+)['"]/g)) used.add(m[1]!);
  }
  it('menemukan ikon', () => expect(used.size).toBeGreaterThan(30));
  it('semua ikon ada di subset font', () => {
    const known = new Set<string>(ICON_NAMES);
    expect([...used].filter((n) => !known.has(n))).toEqual([]);
  });
});
