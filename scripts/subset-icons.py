#!/usr/bin/env python3
"""
Buat subset font Material Symbols Rounded (hanya ikon di packages/shared/src/icons.ts) untuk kedua web app.

- Sumber: node_modules/material-symbols/material-symbols-rounded.woff2 (paket npm `material-symbols`, ±5 MB).
- Sumbu variabel dipatok ke SKILL §6: wght 500, opsz 24, GRAD 0; sumbu FILL (0→1, ikon terpilih) dipertahankan.
- Ligatur hanya untuk ikon terdaftar → hasil ±puluhan KB, ikut di-precache PWA (offline).

Pakai:  pnpm icons:font      (butuh: pip install fonttools brotli)
"""
import pathlib
import re
import sys

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC = ROOT / 'node_modules/material-symbols/material-symbols-rounded.woff2'
LIST = ROOT / 'packages/shared/src/icons.ts'
OUTS = [ROOT / 'apps/pos-web/public/fonts/material-symbols-rounded.woff2',
        ROOT / 'apps/order-web/public/fonts/material-symbols-rounded.woff2']


def icon_names() -> list[str]:
    body = LIST.read_text(encoding='utf8')
    block = body[body.index('ICON_NAMES = [') : body.index('] as const')]
    return re.findall(r"'([a-z0-9_]+)'", block)


def ligature_map(font: TTFont) -> dict[str, str]:
    """Nama ikon (teks ligatur) → nama glyph (bisa berbeda, mis. alias)."""
    rev = {g: chr(c) for c, g in font.getBestCmap().items()}
    out: dict[str, str] = {}
    for lookup in font['GSUB'].table.LookupList.Lookup:
        for st in lookup.SubTable:
            if st.LookupType == 7:
                st = st.ExtSubTable
            if getattr(st, 'LookupType', None) != 4:
                continue
            for first, ligset in st.ligatures.items():
                for lig in ligset:
                    text = ''.join(rev.get(g, '?') for g in [first, *lig.Component])
                    out.setdefault(text, lig.LigGlyph)
    return out


def main() -> int:
    names = icon_names()
    font = TTFont(str(SRC))
    order = set(font.getGlyphOrder())
    ligs = ligature_map(font)
    missing = [n for n in names if n not in ligs]
    if missing:
        print('Ikon tidak ada di Material Symbols:', ', '.join(missing), file=sys.stderr)
        return 1
    base = sorted({ligs[n] for n in names})
    glyphs = base + [f'{g}.fill' for g in base if f'{g}.fill' in order]
    chars = sorted(set(''.join(names)))

    opts = subset.Options()
    opts.layout_features = ['*']
    opts.layout_closure = False  # jangan tarik ikon lain lewat ligatur
    opts.notdef_outline = True
    opts.name_IDs = ['*']
    opts.glyph_names = False
    sub = subset.Subsetter(opts)
    sub.populate(glyphs=glyphs, text=''.join(chars))
    sub.subset(font)

    font = instancer.instantiateVariableFont(font, {'wght': 500, 'opsz': 24, 'GRAD': 0})
    font.flavor = 'woff2'
    for out in OUTS:
        out.parent.mkdir(parents=True, exist_ok=True)
        font.save(str(out))
        print(f'{out.relative_to(ROOT)}: {out.stat().st_size // 1024} KB, {len(names)} ikon')
    return 0


if __name__ == '__main__':
    sys.exit(main())
