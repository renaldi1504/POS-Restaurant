# POS Rumah Makan Berkat — Spesifikasi Lengkap (sumber kebenaran untuk semua agen)

Bahasa UI default: Bahasa Indonesia. Semua layar HP-first (lebar 360–430 px), dipakai orang tua: tombol besar (≥48px, utama ≥56px), teks ≥16px (angka/total lebih besar), kontras tinggi, maksimal 3 langkah order→bayar, tidak ada gesture tersembunyi. Desain visual: **Material Design 3** (Material You) — sumber kebenaran [`.claude/skills/material-design-pos/SKILL.md`](../.claude/skills/material-design-pos/SKILL.md); konten/alur layar tetap mengikuti mockup di `docs/mockups/*.dc.html`. Ringkas:
- Token warna M3 (seed #047857: primary #006C4E, secondary-container #CFE9DA, surface #F8FAF6, error #BA1A1A, warning kustom #795900, dst.) didefinisikan sekali di `packages/shared/styles/m3.css` (Tailwind 4 `@theme`, nama kelas M3: `bg-primary`, `text-on-surface-variant`, `bg-secondary-container`, …) dan diimpor kedua web app. Tidak ada hex di komponen.
- Font Roboto (+ Noto Sans Khmer / Noto Sans SC), skala teks M3 dinaikkan satu tingkat untuk pengguna lanjut usia (body ≥ 16px, `text-title-large`, `text-body-large`, …), ukuran teks Normal/Besar/Sangat besar tetap berlaku. Bentuk: tombol & chip pil/8px, kartu 12px, sheet & dialog 28px; elevasi hanya untuk kartu menu, FAB, sheet.
- Ikon **Material Symbols Rounded** lewat satu komponen `<Icon name=… />`; font subset di-host sendiri (`public/fonts`, ±13 KB, ikut cache PWA → offline). Daftar ikon: `packages/shared/src/icons.ts`, buat ulang font: `pnpm icons:font`.
- Komponen M3: top app bar, navigation bar / navigation rail, tombol filled/tonal/outlined/text, extended FAB, kartu, list, chip, segmented button, outlined text field, bottom sheet / dialog, snackbar, switch, badge, progress.
- **Navigasi staf adaptif** (SKILL §8): bar bawah berisi 4 fitur yang paling sering dipakai user (dicatat per user di `localStorage`, peluruhan 14 hari, default per peran sebelum 10 navigasi, urutan stabil per login, pin maks 4) + "Lainnya" (semua menu, profil/shift, bunyi, keluar); badge order online / meja / siap diantar; disembunyikan di alur fokus (bayar, closing, buka shift, login). Logika: `apps/pos-web/src/lib/navUsage.ts`.
- **Responsif HP & tablet** (SKILL §8b): compact < 600px bar bawah; medium/expanded ≥ 600px navigation rail kiri (tujuan sama); ≥ 840px tata letak list-detail (Kasir + panel pesanan, Meja + tagihan, Riwayat + detail, Kelola menu + form edit, Driver daftar + peta, Dapur multi-kolom), web pelanggan menu 2→3→4 kolom + panel keranjang. Bottom sheet jadi dialog/side sheet di tablet.

## 0. Konteks bisnis
- Restoran Indonesia (pempek, ayam, kopi) di Sihanoukville, Kamboja. Jam operasional default 08.00–03.00 (lewat tengah malam tetap 1 hari operasional / `business_date`).
- Mata uang: utama KHR (Riel, tanpa desimal), juga USD dan IDR. Kurs di settings (default $1 = 4.100 ៛; Rp1.000 = 250 ៛). Format tampilan: `42.000 ៛`, `$10.25`, `Rp 168.000`.
- 4 bahasa: id, en, kh (Khmer), zh (Mandarin). Nama menu/kategori/grup opsi/pilihan disimpan JSONB `{id,en,kh,zh}`; fallback ke `id` bila kosong.
- Domain: staf `pos.rmberkat.linkedbite.com`, pelanggan `order.rmberkat.linkedbite.com`.

## 1. Arsitektur & stack (wajib)
- Monorepo pnpm workspaces, TypeScript strict di semua paket, Node 22.
- `packages/shared`: skema Zod untuk SEMUA request/response API, enum (status order, channel, tipe order, role permission keys, metode bayar, mata uang), konstanta path API, util uang (format, konversi kurs, minor units), util business_date, kamus i18n UI (id/en/kh/zh).
- `apps/server`: Fastify 5 + Socket.IO (path `/ws`) + Drizzle ORM (PostgreSQL 16) + pg-boss (antrian) + grammY (bot Telegram, webhook `/tg/webhook`) + Gemini (`@google/genai`) + pdfkit & qrcode (PDF QR meja). Satu proses. Konfigurasi via `.env` (lihat `.env.example`). Semua integrasi luar punya mode "disabled/mock" bila key kosong supaya dev & test jalan tanpa key.
- `apps/pos-web`: React 18 + Vite + Tailwind + React Router + TanStack Query + i18next + socket.io-client + vite-plugin-pwa. Untuk staf: kasir, meja, dapur, driver, admin. Routing berdasarkan role.
- `apps/order-web`: React + Vite + Tailwind (bundle kecil). Untuk pelanggan: mode `telegram` (Mini App), `meja` (scan QR), `biasa`.
- Test: Vitest (unit & integrasi server memakai DB `pos_test`), Testing Library untuk komponen penting, Playwright (pakai Chrome sistem `/usr/bin/google-chrome`, channel `chrome`) untuk e2e.
- Dev DB lokal: `postgres://pos:pos@localhost:5432/pos` dan test `postgres://pos:pos@localhost:5432/pos_test`.

## 2. Role & hak akses
Role bawaan (bisa ditambah admin, permissions JSONB berisi daftar key):
| Fitur (permission key) | Admin/Owner | Kasir | Dapur | Driver | Bot Telegram |
|---|---|---|---|---|---|
| `order.create`, `payment.create` | ✓ | ✓ | – | – | (order online saja, status pending_accept) |
| `order.accept` (terima/tolak online & QR) | ✓ | ✓ | – | – | – |
| `order.cancel_paid` | ✓ | perlu PIN admin | – | – | – |
| `kitchen.view`, `kitchen.update` | ✓ | lihat | ✓ | – | – |
| `menu.toggle_available` | ✓ | ✓ | ✓ | – | – |
| `shift.manage` (buka shift, pengeluaran, closing) | ✓ | ✓ | – | – | – |
| `menu.manage` (menu, opsi, harga, promo) | ✓ | – | – | – | – |
| `reports.view` | ✓ | – | – | – | – |
| `settings.manage`, `users.manage`, `tables.manage` | ✓ | – | – | – | – |
| `driver.deliver` | ✓ | – | – | ✓ | – |
Login staf: pilih nama pengguna (kartu dengan role) lalu PIN 4 digit (argon2 hash). Kunci 5 menit setelah 5x salah. Sesi cookie httpOnly. Bot Telegram = user sistem, tidak bisa login.

## 3. Data model (Drizzle, PostgreSQL)
Uang = bigint satuan terkecil + kode mata uang (KHR tanpa desimal; USD sen; IDR rupiah). Simpan snapshot nama/harga/opsi di item order.
- `settings(key text pk, value jsonb)` — profile {name, address, phone, logoUrl}, hours {open:"08:00", close:"03:00", sameEveryDay, holidays[]}, currency {main:"KHR", enabled:["KHR","USD","IDR"], rates:{USD:4100, IDR:0.25}} (rates = berapa KHR per 1 unit), delivery {minOrder, defaultFee:0}, kitchen {lateMinutes:15}, ai {enabled}, qr {requireAccept:true}, commissions {grab:pct, foodpanda:pct}, ui {textSize}.
- `roles(id, name, permissions jsonb, system bool)`
- `users(id, name, role_id, pin_hash, lang, active, failed_attempts, locked_until)`
- `categories(id, name jsonb, sort)`
- `menu_items(id, category_id, name jsonb, description jsonb, ai_info text, photo_url, available bool, best_seller bool, sort)`
- `item_prices(item_id, channel enum store|grab|foodpanda, price bigint)` pk(item_id, channel)
- `option_groups(id, name jsonb, required bool, min_select int, max_select int)`
- `options(id, group_id, name jsonb, price_delta bigint, available bool, sort)`
- `item_option_groups(item_id, group_id, sort)`
- `promos(id, name, channel, kind pct|amount, value, scope jsonb, starts_at, ends_at, active)`
- `dine_tables(id, name, area, seats, qr_token unique, active)`
- `table_sessions(id, table_id, status open|bill_requested|paid, opened_at, closed_at)`
- `customers(id, telegram_id unique null, name, username, phone, lang)`
- `addresses(id, customer_id, label, lat, lng, text, landmark)`
- `shifts(id, business_date, user_id, name e.g. "Pagi", opened_at, closed_at, opening_cash jsonb {KHR,USD,IDR})`
- `daily_counters(business_date pk, last_no)` — nomor order #1.. per hari operasional, reset setelah closing shift terakhir (yaitu per business_date). Ambil via UPDATE…RETURNING dalam transaksi.
- `orders(id, business_date, number, display_no, channel kasir|website|telegram|qr|grab|foodpanda, type dine_in|takeaway|delivery, status, shift_id, table_session_id, customer_id, address_id, driver_id, delivery_fee, subtotal, discount, promo_id, total, currency, note, payment_status unpaid|pending_verification|paid, created_by, timestamps)`
  - status: `pending_accept → accepted → cooking → ready → picked_up → delivered → done`; dine-in/takeaway: `ready → served → done`; plus `rejected`, `cancelled`. Semua transisi lewat satu service `transitionOrder()` yang validasi transisi, tulis audit, emit socket, enqueue notifikasi.
- `order_items(id, order_id, item_id, name_snapshot jsonb, qty, unit_price, options_snapshot jsonb [{groupName, optionName, priceDelta}], line_total, note)`
- `payments(id, order_id null, table_session_id null, method cash|aba|platform, currency, amount, amount_main, change_main, proof_url, verified_by, created_at)` — split = banyak baris.
- `expense_categories(id, name)`, `expenses(id, shift_id, category_id, amount, currency, source cash|aba, note, photo_url, created_by)`
- `closings(shift_id pk, expected jsonb, actual jsonb, diff jsonb, note, created_by, created_at)`
- `driver_settlements(id, shift_id, driver_id, deliveries, cash_collected, settled_at)`
- `audit_logs(id, user_id, action, entity, entity_id, before jsonb, after jsonb, reason, created_at)`
Seed dev: settings default, 5 role, users (Owner PIN 1234, Kasir Pagi 1111, Kasir Malam 2222, Dapur 3333, Driver 4444, Bot Telegram), kategori Ayam/Pempek/Minuman/Tambahan, menu contoh (Ayam Goreng 10.000, Ayam Bakar 12.000, Pempek Kapal Selam 14.000, Pempek Lenjer 10.000 habis, Kopi Susu 6.000, Kopi Hitam 5.000, Es Teh Manis 4.000, Nasi Putih 2.000, Kerupuk 2.000) dengan nama 4 bahasa, harga grab/foodpanda +25%, grup opsi (Bagian ayam wajib pilih1; Level pedas wajib pilih1 dengan Extra pedas +1.000; Tambahan opsional max3 Nasi +2.000, Telur ceplok +3.000, Sambal ekstra +1.000, Tahu +2.000, Tempe +2.000 habis; Gula & es opsional pilih1), meja Meja 1–6 (Dalam) & Teras 1–4.

## 4. Fitur fungsional (ringkas per modul; ikuti mockup)
1. **Menu**: CRUD kategori/menu/harga per channel/foto; toggle Tersedia/Habis cepat (kasir/dapur/admin) → event `menu.availability`; opsional auto-tersedia saat buka shift. Grup pilihan: wajib/opsional, min/max, pilihan + harga, pilihan bisa habis; satu grup dipasang ke banyak menu. Tombol "Terjemahkan otomatis" (Gemini) mengisi en/kh/zh yang kosong/belum diedit manual. Field "Info menu untuk AI".
2. **Order & penomoran**: tipe Makan sini (meja), Bungkus, Delivery, Grab, foodpanda, Telegram. Nomor #n per business_date; order Grab/foodpanda boleh ganti display_no ke kode aplikasi (mis. GF-482). Catatan per item/order. Edit/batal sebelum bayar; batal setelah bayar butuh PIN admin + alasan (audit). Harga Grab/foodpanda dari daftar harga channel; promo tersimpan atau potongan manual; komisi platform di laporan.
3. **Lembar opsi** (kasir, website, Telegram Mini App sama): tombol Tambah aktif setelah semua grup wajib terpenuhi; batas max; pilihan habis disabled; total ikut berubah; server selalu hitung ulang harga dari DB (abaikan harga dari klien).
4. **Dapur**: kartu order aktif (Baru kuning, Dimasak biru, terlambat merah > kitchen.lateMinutes), item + opsi + catatan, tombol besar Mulai masak → Siap; panel "Yang harus dibuat" (rekap per menu); bunyi berulang untuk order baru; bahasa layar dapur bisa dipilih (id/en/kh/zh) per perangkat; nama menu ikut bahasa.
5. **Order online (website/Telegram)**: masuk realtime + bunyi di kasir (bel dengan badge jumlah); kartu dengan sumber (TELEGRAM · MINI APP / WEBSITE / QR MEJA), Terima/Tolak (alasan). Bayar ABA: pelanggan upload bukti → disimpan (R2 atau disk lokal saat dev) → dikirim ke grup admin Telegram → status `pending_verification`; tombol Terima aktif setelah bukti ada.
6. **Pembayaran**: Cash (KHR/USD/IDR, tombol uang cepat Uang pas/50.000/100.000/200.000/500.000 ៛ + input manual, kembalian besar), ABA, Split. Struk thermal.
7. **Meja & QR dine-in**: kelola meja (nama, area, kursi, aktif), qr_token acak 24+ char, buat ulang QR, PDF QR per meja & semua (logo, nama meja, QR ke `https://order.../m/<qr_token>`, "Scan untuk pesan" 4 bahasa). Scan → order-web mode meja (tanpa login), pesanan masuk tagihan meja (open bill) sebagai `channel=qr`, setting `qr.requireAccept`. Denah meja kasir: status Kosong / Sedang makan / Minta bill / Pesanan QR baru + total berjalan + lama duduk. Tagihan meja: ronde-ronde pesanan, Tambah pesanan, Pindah meja, Gabung meja, Split bill (bagi rata / per item), Cetak nota sementara, Bayar → struk, meja Kosong, sesi ditutup. Pelanggan bisa "Minta bill".
8. **Shift & kas**: Buka shift wajib sebelum order (modal awal per pecahan/total per mata uang). Beberapa shift per hari (Pagi/Malam) masing-masing closing sendiri. Pengeluaran (kategori, jumlah, mata uang, sumber cash/ABA, catatan, foto opsional). Closing 3 langkah: hitung cash (per pecahan per mata uang) → saldo ABA → hasil: Cash seharusnya = modal + jual cash − keluar cash (dikonversi ke KHR), ABA seharusnya = jual ABA − keluar ABA, selisih wajib catatan, setoran driver (cash yang dibawa per driver, tandai sudah setor), ringkasan per channel & metode, cetak laporan. Setelah closing transaksi terkunci (kecuali admin + audit).
9. **Driver**: kasir TIDAK memilih driver. Order delivery yang `ready` muncul di tab "Siap diantar" aplikasi driver; driver tekan Ambil (atomic, satu driver) → "Antaran saya": peta titik tujuan, Navigasi (Maps URLs `https://www.google.com/maps/dir/?api=1&destination=LAT,LNG`, beberapa tujuan pakai `waypoints`), Telepon / Chat Telegram, tagih cash, Sudah diambil → Sudah sampai. Jarak lurus (haversine) dari koordinat restoran (settings.profile.lat/lng). Bahasa aplikasi driver dipilih (default dari user.lang, mis. kh). Total cash dibawa untuk setoran. Admin bisa melepas/memindah order.
10. **Website pelanggan (order-web)**: pencarian live (cocokkan nama di semua bahasa + nama kategori), chip kategori dengan jumlah, "Paling laris" carousel, menu habis ke bawah & disabled, tombol + Tambah → stepper − n +, bar keranjang bawah. Mode telegram: login otomatis via `initData` (validasi HMAC di server, max age 24 jam), tipe selalu Delivery, banner "Halo [nama] · Masuk otomatis via Telegram", alamat tersimpan, kontak via Telegram (no HP opsional). Mode meja: banner "Meja X · Makan di sini", tagihan berjalan, tombol Minta bill, tombol bawah "Kirim ke dapur". Halaman alamat: "Pakai lokasi saya sekarang" (Telegram LocationManager bila ada, else navigator.geolocation), cari alamat (Google Places Autocomplete bila key ada), peta dengan pin geser (Google Maps JS bila key ada; jika tidak, tampilkan peta placeholder + input lat/lng manual untuk dev), alamat tersimpan, patokan. Checkout: Bayar ABA (upload bukti) atau Cash saat diantar. Halaman status order (Diterima/Dimasak/Diantar...). Pilih bahasa 4.
11. **Telegram bot**: `/start` dan tombol menu membuka Mini App order-web (`/tg`); semua order Telegram = delivery. Notifikasi status ke chat pelanggan via antrian (retry 3x). AI tanya jawab: Gemini dengan konteks menu (nama, harga, opsi, habis, ai_info, jam buka), dilarang membuat order, tidak mengirim data pribadi; jika ragu/di luar topik/kuota habis(429) → balasan cadangan + teruskan ke grup admin. Rate limit 20 pertanyaan/pelanggan/jam. Tombol "Cara pesan", "Status pesanan".
12. **Dashboard harian**: total penjualan, jumlah order, rata-rata, pengeluaran, per jam (bar), per channel (bersih setelah promo & komisi), menu terlaris, pilih tanggal.
13. **Settings**: profil & logo, jam operasional, mata uang & kurs (pilih utama), min order, driver (users role driver), promo & komisi, pengguna & role (CRUD + permission editor), kategori pengeluaran, printer & suara, ukuran teks (Normal/Besar/Sangat besar), bot Telegram & Gemini key status, meja & QR.
14. **Cetak thermal** (pos-web): modul ESC/POS di browser (encoder sendiri, ASCII, lebar 32 kolom 58mm / 48 kolom 80mm), koneksi Web Serial (Bluetooth SPP UUID 00001101-0000-1000-8000-00805f9b34fb) atau Web Bluetooth (BLE service umum 000018f0-…, e7810a71-…, 49535343-…), simpan preferensi printer, reconnect otomatis via `navigator.serial.getPorts()`. Struk & nota sementara (label "NOTA SEMENTARA · BELUM BAYAR") berisi logo-nama, tanggal, kasir, meja, nomor order, item+opsi, subtotal, diskon, total KHR + ≈USD/IDR, metode, kembalian. Pratinjau di layar.

## 5. API (REST JSON, prefix `/api`) — kontrak di `packages/shared`
Auth staf: `GET /auth/users` (daftar kartu login: id,name,role), `POST /auth/pin`, `POST /auth/logout`, `GET /auth/me`.
Pelanggan: `POST /public/session/telegram {initData}`, `POST /public/session/table {qrToken}`, `GET /public/menu?lang=`, `POST /public/orders`, `GET /public/orders/:id`, `POST /public/orders/:id/proof` (multipart), `GET /public/table/bill`, `POST /public/table/bill-request`, `GET/POST/PATCH/DELETE /public/addresses`, `GET /public/settings` (nama, logo, jam buka, status buka, mata uang).
Staf: `GET /orders?status=&date=&since=`, `GET /orders/:id`, `POST /orders`, `PATCH /orders/:id`, `POST /orders/:id/accept|reject|status|cancel`, `GET /tables`, `GET /tables/:id/session`, `POST /tables/:id/open`, `POST /tables/:id/move {toTableId}`, `POST /tables/merge {fromTableId,toTableId}`, `POST /payments`, `POST /payments/:id/verify`, `GET /driver/available`, `GET /driver/mine`, `POST /driver/orders/:id/take|picked|delivered|release`, `POST /shifts/open`, `GET /shifts/current`, `GET/POST /expenses`, `GET /expense-categories`, `GET /closing/preview`, `POST /closing`, `POST /driver-settlements/:id/settle`, `PATCH /menu/items/:id/availability`, `PATCH /menu/options/:id/availability`, `GET /menu` (staf, semua harga channel).
Admin: CRUD `/admin/categories`, `/admin/items` (+ upload foto), `/admin/option-groups` (+ options, + attach ke item), `/admin/promos`, `POST /admin/translate`, CRUD `/admin/tables`, `POST /admin/tables/:id/regenerate-qr`, `GET /admin/tables/qr.pdf?ids=`, CRUD `/admin/users`, `/admin/roles`, `GET/PATCH /admin/settings`, `GET /reports/daily?date=`, `GET /reports/closing/:shiftId`, `GET /audit-logs`.
Sistem: `GET /health`, `POST /tg/webhook`.
Error format: `{ error: { code, message } }` dengan HTTP status yang benar. Semua input divalidasi Zod. Rate limit endpoint publik.

## 6. Realtime (Socket.IO `/ws`)
Room: `cashier`, `kitchen`, `driver`, `admin`, `customer:<id>`, `table:<sessionId>`. Event: `order.created`, `order.updated`, `order.ready_for_pickup`, `table.updated`, `menu.availability`, `payment.proof_received`. Klien menyimpan `lastEventAt`, saat reconnect memanggil `GET /orders?since=`.

## 7. Non-fungsional
Order online muncul ≤3 detik; tambah item ≤1 detik; RAM server hemat (target Linode 1 GB: tanpa Redis, satu proses); audit log; zona waktu Asia/Phnom_Penh; i18n UI lengkap 4 bahasa (id, en, kh, zh) untuk SEMUA layar staf (termasuk admin) dan seluruh order-web, bahasa dipilih tiap staf & disimpan di akun; aksesibilitas: label pada input, tombol nyata, aria-label untuk ikon.

## 8. Deploy (dokumentasi + file di `deploy/`)
Ubuntu 24.04 tanpa Docker: Caddy (dua subdomain, lihat Caddyfile), PM2 satu proses `--max-old-space-size=256`, PostgreSQL tuning kecil, swap 2GB, backup `pg_dump` harian ke Cloudflare R2 (S3 API) 30 hari, GitHub Actions build+test+deploy rsync. README berbahasa Indonesia berisi cara menjalankan lokal, variabel env, seed, test, deploy.
