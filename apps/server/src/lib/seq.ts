/**
 * Jalankan query satu per satu (aman di dalam transaksi: satu koneksi pg tidak boleh
 * menjalankan query paralel). Pakai sebagai pengganti `Promise.all` untuk thunk query.
 */
export async function seq<T extends readonly (() => Promise<unknown>)[]>(
  ...thunks: T
): Promise<{ -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> }> {
  const out: unknown[] = [];
  for (const t of thunks) out.push(await t());
  return out as { -readonly [K in keyof T]: Awaited<ReturnType<T[K]>> };
}
