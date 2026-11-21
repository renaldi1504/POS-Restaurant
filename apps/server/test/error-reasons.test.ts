/**
 * Setiap pesan error literal yang dilempar server harus terdaftar di ERROR_REASONS (@pos/shared),
 * supaya klien bisa menampilkannya dalam bahasa staf/pelanggan (id/en/kh/zh) — bukan teks Indonesia mentah.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { errorReasonOf } from '@pos/shared';
import { dictionaries } from '@pos/shared/i18n';

function files(dir: string): string[] {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? files(p) : /\.ts$/.test(f) ? [p] : [];
  });
}

/** Pesan teknis yang tidak pernah tampil ke staf/pelanggan (kode error saja sudah cukup). */
const INTERNAL = [
  /^Secret salah$/,
  /^Sesi gagal dibuat$/,
  /^Handler .* harus mengirim binary/,
  /^Respons .* tidak sesuai kontrak$/,
  /^Kirim sebagai multipart/,
  /^Route .* tidak ditemukan$/,
  // pesan default helper → sama dengan errors.<CODE>
  /^Permintaan tidak valid$/,
  /^Data tidak valid$/,
  /^Silakan masuk dulu$/,
  /^Tidak punya akses$/,
  /^Data tidak ditemukan$/,
  /^Data bentrok$/,
  /^Terlalu banyak permintaan, tunggu sebentar$/,
  /^Terjadi kesalahan server$/,
];

describe('alasan error server terdaftar & diterjemahkan', () => {
  const root = join(__dirname, '../src');
  const messages = new Set<string>();
  for (const f of files(root)) {
    const src = readFileSync(f, 'utf8');
    const re =
      /\b(?:unprocessable|conflict|badRequest|notFound|forbidden|unauthorized|validationError|AppError)\(([^;]*?)['`]([^'`]+)['`]/g;
    for (const m of src.matchAll(re)) {
      // argumen pesan: ambil literal string pertama yang bukan kode error (UPPER_CASE)
      const lit = m[2]!;
      if (/^[A-Z_]+$/.test(lit)) {
        const rest = src.slice(m.index! + m[0].length).match(/^\s*,\s*['`]([^'`]+)['`]/);
        if (rest) messages.add(rest[1]!);
      } else messages.add(lit);
    }
  }
  // pesan Telegram yang dipilih lewat variabel
  messages.add('Sesi Telegram kedaluwarsa, buka ulang Mini App');
  messages.add('Data Telegram tidak valid');

  it('menemukan pesan error di kode server', () => expect(messages.size).toBeGreaterThan(80));

  it('setiap pesan cocok dengan ERROR_REASONS', () => {
    const unknown = [...messages].filter(
      (msg) => !INTERNAL.some((r) => r.test(msg)) && !errorReasonOf(msg.replace(/\$\{[^}]+\}/g, 'X')),
    );
    expect(unknown).toEqual([]);
  });

  it('pesan dinamis mengekstrak parameter', () => {
    expect(errorReasonOf('Mata uang USD tidak aktif')).toEqual({
      reason: 'currencyInactive',
      params: { currency: 'USD' },
    });
    expect(errorReasonOf('Shift "Pagi" masih terbuka, closing dulu')?.params).toEqual({ name: 'Pagi' });
    expect(errorReasonOf('pesan lain')).toBeNull();
  });

  it('setiap alasan punya terjemahan di 4 bahasa', () => {
    for (const lang of ['id', 'en', 'kh', 'zh'] as const) {
      const d = dictionaries[lang].errorReason as Record<string, string>;
      for (const msg of messages) {
        const hit = errorReasonOf(msg.replace(/\$\{[^}]+\}/g, 'X'));
        if (hit) expect(d[hit.reason], `${lang}.${hit.reason}`).toBeTruthy();
      }
    }
  });
});
