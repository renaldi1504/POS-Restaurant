// Pastikan bundel produksi web memakai React versi produksi (bukan development).
// Dipanggil setelah `pnpm build`. Gagal bila menemukan penanda build development.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const apps = ['apps/pos-web/dist/assets', 'apps/order-web/dist/assets'];
const markers = ['jsxDEV', 'react-dom.development', 'react.development'];
let bad = 0;
for (const dir of apps) {
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js'))) {
    const src = readFileSync(join(dir, f), 'utf8');
    const hit = markers.find((m) => src.includes(m));
    if (hit) {
      console.error(`✗ ${dir}/${f} berisi "${hit}" (React development)`);
      bad++;
    }
  }
}
if (bad) process.exit(1);
console.log('✓ Bundel web memakai React produksi');
