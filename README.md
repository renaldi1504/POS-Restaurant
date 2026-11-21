# POS Rumah Makan Berkat

Sistem POS restoran (Sihanoukville, Kamboja): kasir, meja & QR, dapur, driver, admin, website pelanggan, Telegram Mini App.
Spesifikasi lengkap: [`docs/SPEC.md`](docs/SPEC.md) · desain: [`docs/mockups/`](docs/mockups) (buka di browser).

## Struktur monorepo (pnpm workspaces)

```
packages/shared   @pos/shared  — kontrak API (Zod), enum, util uang & business_date, validator opsi, kamus i18n (id/en/kh/zh), klien API bertipe
apps/server       @pos/server  — Fastify 5 + Socket.IO (/ws) + Drizzle (PostgreSQL 16) + pg-boss + grammY + Gemini
apps/pos-web      @pos/pos-web — PWA staf (React 18 + Vite + Tailwind 4): kasir, meja, dapur, driver, admin
apps/order-web    @pos/order-web — web pelanggan (mode biasa / telegram / meja)
e2e/              Playwright (Chrome sistem)
deploy/           Caddyfile, PM2, tuning PostgreSQL, backup R2, panduan server
```

## Menjalankan di lokal

Syarat: Node 22, pnpm 10, PostgreSQL 16.

```bash
pnpm install
cp .env.example .env           # default sudah cocok untuk dev lokal
pnpm db:migrate                # buat tabel
pnpm db:seed                   # data contoh (dilewati bila data sudah ada)
pnpm db:reset                  # (opsional) kosongkan + migrasi + seed ulang
pnpm dev                       # server :3000, pos-web :5173, order-web :5174
```

- POS staf: http://localhost:5173 · Web pelanggan: http://localhost:5174 (`/tg` mode Telegram, `/m/<qr_token>` mode meja)
- Vite memproksi `/api`, `/ws`, `/uploads` ke server (`VITE_API_TARGET`).

### Login seed (PIN 4 digit)

| Nama         | Role                           | PIN  |
| ------------ | ------------------------------ | ---- |
| Owner        | Owner (semua akses)            | 1234 |
| Kasir Pagi   | Kasir                          | 1111 |
| Kasir Malam  | Kasir                          | 2222 |
| Dapur        | Dapur                          | 3333 |
| Driver       | Driver (bahasa kh)             | 4444 |
| Bot Telegram | user sistem — tidak bisa login | –    |

5x PIN salah → akun terkunci 5 menit.

## Variabel lingkungan (`.env`)

| Variabel                                                                                                              | Keterangan                                                            |
| --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `DATABASE_URL`, `TEST_DATABASE_URL`                                                                                   | DB dev (`pos`) & test (`pos_test`)                                    |
| `SESSION_SECRET`                                                                                                      | rahasia tanda tangan cookie (≥32 karakter, wajib diganti di produksi) |
| `SESSION_TTL_HOURS`                                                                                                   | lama sesi staf (default 16 jam)                                       |
| `PORT`                                                                                                                | port server (3000)                                                    |
| `POS_ORIGIN`, `ORDER_ORIGIN`                                                                                          | origin web staf & pelanggan (CORS, link QR meja)                      |
| `JOBS_ENABLED`                                                                                                        | antrian pg-boss (false saat test)                                     |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET`                    | bot Telegram (kosong = mode mock)                                     |
| `GEMINI_API_KEY`, `GEMINI_MODEL`                                                                                      | AI tanya-jawab & terjemahan (kosong = mock)                           |
| `GOOGLE_MAPS_API_KEY`, `VITE_GOOGLE_MAPS_API_KEY`                                                                     | peta & Places (kosong = peta placeholder + input lat/lng)             |
| `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET_PUBLIC`, `R2_BUCKET_PRIVATE`, `R2_PUBLIC_URL` | Cloudflare R2 untuk file & backup                                     |
| `UPLOAD_DIR`                                                                                                          | folder upload lokal bila R2 kosong (dev)                              |
| `VITE_API_TARGET`                                                                                                     | target proksi Vite saat dev                                           |

Semua integrasi luar punya mode **mock/disabled** bila key kosong, sehingga dev & test jalan tanpa key.

## Perintah

```bash
pnpm typecheck     # TypeScript strict semua paket
pnpm lint          # ESLint (flat config, typescript-eslint)
pnpm format        # Prettier
pnpm test          # Vitest: shared (unit), server (integrasi, DB pos_test di-reset otomatis), web (Testing Library)
pnpm test:e2e      # Playwright + Chrome sistem; DB pos_e2e dibuat/di-reset otomatis
pnpm build         # build server (tsup → apps/server/dist) + kedua web (Vite → dist/)
pnpm db:generate   # buat file migrasi setelah mengubah apps/server/src/db/schema.ts
```

## Testing & QA

Laporan QA terakhir: [`docs/QA-REPORT.md`](docs/QA-REPORT.md).

### Gerbang lengkap (jalankan sebelum commit/deploy)

```bash
pnpm install
pnpm typecheck      # semua paket + folder e2e
pnpm lint           # ESLint, 0 warning
pnpm format:check   # Prettier
pnpm test           # Vitest semua paket (shared → order-web → pos-web → server)
pnpm build          # build + cek bundel web memakai React produksi (scripts/check-prod-bundle.mjs)
pnpm test:e2e       # Playwright (jalankan 2x untuk memastikan stabil)
```

### Per suite

| Suite                        | Perintah                                               | Catatan                                                               |
| ---------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------- |
| shared (unit)                | `pnpm --filter @pos/shared test`                       | util uang, business_date, validator opsi, kamus i18n                  |
| server (integrasi)           | `pnpm --filter @pos/server test`                       | DB `pos_test` di-reset otomatis; file berjalan berurutan              |
| pos-web (komponen)           | `pnpm --filter @pos/pos-web test`                      | Testing Library + MSW; termasuk cek kunci i18n (kh/zh dapur & driver) |
| order-web (komponen)         | `pnpm --filter @pos/order-web test`                    | Testing Library + MSW                                                 |
| e2e (Playwright)             | `pnpm test:e2e`                                        | Chrome sistem `/usr/bin/google-chrome`, viewport HP 390×844           |
| satu file e2e                | `npx playwright test e2e/03-dine-in-qr.spec.ts`        | project `setup` ikut jalan otomatis                                   |
| laporan/trace e2e yang gagal | `npx playwright show-trace test-results/<…>/trace.zip` | trace disimpan hanya saat gagal                                       |

**Cara kerja e2e:** Playwright menyalakan sendiri server API (`:3101`, DB `pos_e2e` dibuat/di-reset/di-seed
setiap run), pos-web (`:5183`) dan order-web (`:5184`). Port tersebut harus kosong. Project `setup`
(`e2e/global.setup.ts`) menyetel jam buka **24 jam** dan rekening ABA contoh supaya test tidak tergantung jam.
Font Google & SDK Telegram diblokir di test (tidak bisa dijangkau dari CI).

| File e2e                     | Alur                                                                                          |
| ---------------------------- | --------------------------------------------------------------------------------------------- |
| `01-kasir.spec.ts`           | login PIN → buka shift → opsi wajib → bayar cash (uang cepat, kembalian) → dapur masak → siap |
| `02-delivery.spec.ts`        | order Telegram oleh kasir (HP) → dapur → driver ambil/diambil/sampai; driver kedua ditolak    |
| `03-dine-in-qr.spec.ts`      | QR Meja 1 → 2 ronde → kasir terima → minta bill → nota sementara → bayar → meja kosong        |
| `04-telegram-online.spec.ts` | `/tg` + initData palsu → alamat manual → ABA + bukti → kasir terima → status live             |
| `05-closing.spec.ts`         | modal + jual cash/ABA + pengeluaran → closing: cash seharusnya & selisih wajib catatan        |
| `06-admin.spec.ts`           | Habis live di web, tambah pilihan berharga, PDF QR meja, user baru login PIN baru             |
| `07-i18n.spec.ts`            | dapur & driver dalam Khmer                                                                    |
| `08-permissions.spec.ts`     | dapur/kasir dialihkan dari rute terlarang; API 403/401                                        |
| `09-overflow.spec.ts`        | tidak ada scroll horizontal / isi terpotong di 360 px (kedua aplikasi)                        |
| `smoke.spec.ts`              | login, PIN salah, menu web                                                                    |

### Akun e2e / dev (PIN)

Owner `1234` · Kasir Pagi `1111` · Kasir Malam `2222` · Dapur `3333` · Driver `4444` (bahasa kh).
Test e2e membuat sendiri: driver kedua **Rudi Antar** `4545` dan kasir **Kasir Sore** `5678` (DB e2e di-reset tiap run).

### Membuka mode meja & Telegram di lokal

- **Mode meja (QR):** scan QR di POS → Admin → Meja & QR dengan HP (satu jaringan), atau ambil token lewat SQL
  `psql postgres://pos:pos@localhost:5432/pos -c "select name, qr_token from dine_tables"` lalu buka
  `http://localhost:5174/m/<qr_token>`. (Owner juga bisa `GET /api/admin/tables` → field `qrUrl`.)
- **Mode Telegram (tanpa bot token):** di luar produksi server tidak memeriksa tanda tangan initData, hanya bentuk & umur
  (≤ 24 jam). Buat URL di konsol browser lalu buka:
  ```js
  const init = new URLSearchParams({
    auth_date: Math.floor(Date.now() / 1000),
    hash: '0'.repeat(64),
    user: JSON.stringify({ id: 12345, first_name: 'Sokha', username: 'sokha', language_code: 'id' }),
  });
  location.href = 'http://localhost:5174/tg#tgWebAppData=' + encodeURIComponent(init);
  ```
  Di produksi (`NODE_ENV=production`) wajib `TELEGRAM_BOT_TOKEN` dan initData harus valid (HMAC).
- **Mode biasa:** `http://localhost:5174/` (Makan di sini sengaja meminta scan QR meja).
- **Restoran tutup saat dev?** Ubah jam di Admin → Settings → Jam operasional (atau samakan buka = tutup untuk 24 jam).

## Arsitektur singkat

- **Kontrak API** ada di `packages/shared/src/api.ts` (registri `endpoints`: method, path, auth, permission, schema Zod). Server mendaftarkan route dengan `defineRoute(app, 'key', handler)`; frontend memanggil `api.call('key', {...})`. Respons divalidasi di kedua sisi.
- **Sesi**: cookie httpOnly bertanda tangan (`pos_sid` staf, `pos_cust` pelanggan) berisi id acak; data di tabel `sessions` (bisa dicabut saat logout/nonaktif).
- **Realtime**: Socket.IO `/ws`; room ditentukan server dari cookie (cashier/kitchen/driver/admin, `customer:<id>`, `table:<sessionId>`). Klien menyimpan `lastEventAt` dan memanggil `GET /api/orders?since=` setelah reconnect.
- **Uang**: bilangan bulat satuan minor + kode mata uang; format `42.000 ៛`, `$10.25`, `Rp 168.000`.
- **Hari operasional**: 08.00–03.00 → transaksi sebelum jam tutup dihitung hari sebelumnya (`businessDate()`), zona `Asia/Phnom_Penh`.

## Deploy

Ringkas: Ubuntu 24.04 + Caddy (dua subdomain) + PM2 satu proses (`--max-old-space-size=256`) + PostgreSQL 16 (tuning kecil) + swap 2 GB + backup `pg_dump` harian ke Cloudflare R2 (30 hari). GitHub Actions: test → build → rsync.
Langkah lengkap: [`deploy/setup-server.md`](deploy/setup-server.md).

## Panduan pengembang

**Menambah endpoint server**

1. Pastikan endpoint ada di `packages/shared/src/api.ts` (schema di `packages/shared/src/schemas/*`).
2. Implementasi di `apps/server/src/modules/<modul>/routes.ts`:
   ```ts
   defineRoute(app, 'orderGet', async ({ params, staff }) => ({ order: await getOrder(app.db, params.id) }));
   ```
   Guard auth/permission, parse Zod, rate limit & validasi respons otomatis dari kontrak. Error: `throw unprocessable('SHIFT_NOT_OPEN', 'Buka shift dulu')` (lihat `lib/errors.ts`).
3. Realtime: `app.realtime.emitStaff(['cashier','kitchen'], 'order.created', { order, at })`. Audit: `writeAudit(tx, {...})`. Antrian: `app.jobs.enqueue(JOB_NAMES.telegramNotify, {...})`. File: `app.storage.save({...})`. Settings: `getSettings(db)`.
4. Test integrasi: `apps/server/test/*.test.ts` dengan `createTestApp()`, `loginAs(app, 'Kasir Pagi')`, `call(app, 'key', { cookie, body })`.

**Frontend**

- `api.call('ordersList', { query: { active: 'true' } })` — tipe input/output dari kontrak; error = `ApiError` (`errorMessage(err, t)`).
- Realtime: `useSocketEvent('order.created', handler)`, `useResync((since) => ...)`, `useSocketStatus()` di `src/lib/socket.ts`.
- Teks UI dari kamus `@pos/shared/i18n` (`t('kitchen.startCooking')`); nama menu `tl(item.name, lang)`.
- Komponen dasar di `src/components/ui` (Button, Card, Segmented, Chip, Stepper, Badge, HeaderBar, BottomBar, Sheet, MoneyText, LangSwitcher, EmptyState, Toast).
