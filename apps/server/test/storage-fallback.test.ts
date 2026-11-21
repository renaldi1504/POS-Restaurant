import { mkdtempSync, readFileSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadConfig } from '../src/config';
import { createStorage } from '../src/lib/storage';

const png = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const silent = { warn: () => undefined, error: () => undefined };

describe('penyimpanan upload', () => {
  it('R2 gagal (key salah / offline) → tetap tersimpan di disk lokal', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'up-'));
    const config = loadConfig({
      UPLOAD_DIR: dir,
      R2_ACCOUNT_ID: 'invalid-account',
      R2_ACCESS_KEY_ID: 'x',
      R2_SECRET_ACCESS_KEY: 'y',
      R2_BUCKET_PUBLIC: 'b',
      R2_PUBLIC_URL: 'https://cdn.invalid',
    });
    const errors: string[] = [];
    const st = createStorage(config, { ...silent, error: (_o, m) => void errors.push(m ?? '') });
    expect(st.driver).toBe('r2');
    const saved = await st.save({ data: png, mimetype: 'image/png', visibility: 'public', folder: 'logo' });
    expect(saved.url).toMatch(/^\/uploads\/public\/logo\/.+\.png$/);
    expect(readFileSync(path.join(dir, 'public', saved.key))).toEqual(png);
    expect(errors[0]).toMatch(/R2 gagal/);
  }, 30_000);

  it('R2 tanpa R2_PUBLIC_URL → foto publik disimpan lokal', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'up-'));
    const config = loadConfig({
      UPLOAD_DIR: dir,
      R2_ACCOUNT_ID: 'a',
      R2_ACCESS_KEY_ID: 'x',
      R2_SECRET_ACCESS_KEY: 'y',
      R2_BUCKET_PUBLIC: 'b',
    });
    const saved = await createStorage(config, silent).save({
      data: png,
      mimetype: 'image/png',
      visibility: 'public',
      folder: 'menu',
    });
    expect(saved.url.startsWith('/uploads/public/menu/')).toBe(true);
  });

  it('folder tidak bisa ditulis → error jelas (bukan crash)', async () => {
    if (process.getuid?.() === 0) return; // root selalu bisa menulis
    const dir = mkdtempSync(path.join(tmpdir(), 'up-'));
    chmodSync(dir, 0o500);
    const st = createStorage(loadConfig({ UPLOAD_DIR: dir }), silent);
    await expect(
      st.save({ data: png, mimetype: 'image/png', visibility: 'public', folder: 'menu' }),
    ).rejects.toMatchObject({ message: 'Gagal menyimpan file di server' });
  });
});
