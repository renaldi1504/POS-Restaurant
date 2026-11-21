#!/usr/bin/env node
/**
 * Buat ikon PWA placeholder (PNG) tanpa dependency: kotak hijau #047857 dengan piring putih.
 * Pakai: node scripts/gen-icons.mjs <folder-public>
 * Ganti nanti dengan logo asli restoran (ukuran sama: 192, 512, 512-maskable).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { deflateSync } from 'node:zlib';

const CRC_TABLE = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
const crc32 = (buf) => {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
};
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(size, pixel) {
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const [r, g, b, a] = pixel(x, y, size);
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = r;
      raw[o + 1] = g;
      raw[o + 2] = b;
      raw[o + 3] = a;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}
const GREEN = [4, 120, 87, 255];
const WHITE = [255, 255, 255, 255];
const CLEAR = [0, 0, 0, 0];
function icon({ maskable }) {
  return (x, y, s) => {
    const r = maskable ? 0 : s * 0.22; // sudut membulat
    const inCorner = (cx, cy) => Math.hypot(x - cx, y - cy) > r;
    if (!maskable) {
      if (x < r && y < r && inCorner(r, r)) return CLEAR;
      if (x > s - r && y < r && inCorner(s - r, r)) return CLEAR;
      if (x < r && y > s - r && inCorner(r, s - r)) return CLEAR;
      if (x > s - r && y > s - r && inCorner(s - r, s - r)) return CLEAR;
    }
    const d = Math.hypot(x - s / 2, y - s / 2);
    const plate = s * (maskable ? 0.28 : 0.34);
    if (d < plate && d > plate * 0.62) return WHITE;
    if (d < plate * 0.45) return WHITE;
    return GREEN;
  };
}
const out = path.resolve(process.argv[2] ?? 'public', 'icons');
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, 'icon-192.png'), png(192, icon({ maskable: false })));
writeFileSync(path.join(out, 'icon-512.png'), png(512, icon({ maskable: false })));
writeFileSync(path.join(out, 'icon-512-maskable.png'), png(512, icon({ maskable: true })));
console.log(`✓ Ikon dibuat di ${out}`);
