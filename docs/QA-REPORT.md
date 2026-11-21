# Laporan QA — POS Rumah Makan Berkat

Tanggal: 21 November 2026 · Cabang: `main` · Lingkungan: Node 22, PostgreSQL 16, Chrome sistem (headless), viewport HP 390×844 (cek tata letak juga 360 px).

## 1. Ringkasan

Seluruh gerbang hijau:

| Gerbang                    | Hasil                                                                     |
| -------------------------- | ------------------------------------------------------------------------- |
| `pnpm install`             | ✅                                                                        |
| `pnpm typecheck`           | ✅ 4 paket + folder e2e                                                   |
| `pnpm lint`                | ✅ 0 error, 0 warning                                                     |
| `pnpm format:check`        | ✅ (awalnya gagal: 65 file belum diformat → diperbaiki)                   |
| `pnpm test`                | ✅ 245 test (lihat tabel di bawah)                                        |
| `pnpm build`               | ✅ + pemeriksa bundel: kedua web memakai React **produksi**               |
| `pnpm test:e2e` (2× run)   | ✅ 20/20 lulus di kedua run (1 setup + 19 test), ±2 menit per run         |

### Jumlah test per paket

| Paket                | File | Test | Sebelum QA |
| -------------------- | ---: | ---: | ---------: |
| `@pos/shared`        |    7 |   69 |         69 |
| `@pos/order-web`     |    9 |   40 |         39 |
| `@pos/pos-web`       |   13 |   55 |         49 |
| `@pos/server`        |   12 |   81 |         73 |
| **Unit/integrasi**   |   41 |  245 |        230 |
| e2e Playwright       |   10 |   19 |          3 |

## 2. Yang dites

### Otomatis (e2e, server API + kedua web asli, DB `pos_e2e` di-seed, jam buka 24 jam)

1. **Kasir** — login PIN 1111 → buka shift (modal per pecahan) → Ayam Goreng (Bagian ayam & Level pedas wajib; tombol Tambah nonaktif sampai lengkap, harga Extra pedas ikut) + Es Teh (Gula & es) → Pesanan → bayar cash KHR dengan uang cepat 20.000 → kembalian 5.000 → order muncul di Dapur (konteks browser kedua, PIN 3333) → Mulai masak → Siap.
2. **Delivery** — kasir membuat order tipe **Telegram** (channel `telegram`, HP, bayar saat diantar) → tersimpan `accepted` + HP pelanggan → dapur Siap → driver 4444 melihat di "Siap diantar" (nama, alamat, tagih cash) → Ambil → tombol Telepon `tel:` → Sudah diambil → Sudah sampai (konfirmasi cash) → cash dibawa bertambah. Driver kedua: kartu hilang secara realtime dan API `take` menolak `409 ALREADY_TAKEN`.
3. **QR meja** — `/m/<token Meja 1>` → item + opsi → Kirim ke dapur → denah kasir "Pesanan QR baru" → Terima → status pelanggan live "Diterima" → ronde 2 → kasir terima → Minta bill → Cetak nota: **NOTA SEMENTARA**, MEJA 1, TOTAL 17.000 KHR → Bayar uang pas → Lunas → meja **Kosong** → scan ulang = tagihan baru.
4. **Telegram Mini App** — `/tg#tgWebAppData=<initData palsu>` → "Halo Sokha · Masuk otomatis via Telegram", tanpa pilihan tipe (delivery terkunci) → alamat manual + lat/lng (tanpa Maps key) → Bayar ABA: rekening dari settings tampil, upload bukti (fixture PNG) → "Menunggu dicek kasir" → bel kasir "Order online, 1 baru" muncul realtime → kartu TELEGRAM · MINI APP, "ABA · bukti diterima", gambar bukti termuat → Terima → status pelanggan berubah live.
5. **Closing** — shift baru modal 100.000 + jual cash 6.000 (dibayar 10.000) + jual ABA 10.000 + pengeluaran cash 3.000 lewat layar Pengeluaran → wizard: cash seharusnya **103.000**, dihitung 100.000 → **Kurang 3.000**, ABA cocok, total penjualan 16.000 → kirim tanpa catatan ditolak → dengan catatan berhasil, shift tertutup.
6. **Admin** — toggle Kopi Hitam Habis → web pelanggan langsung "Habis" (tanpa reload) dan kembali; tambah pilihan "Perkedel +2.500" di grup Tambahan → muncul di lembar opsi web dan total ikut; Meja & QR → Cetak semua QR → `application/pdf` diawali `%PDF-`; tambah user Kasir Sore PIN 5678 → keluar → login dengan PIN baru.
7. **Bahasa** — dapur pilih ខ្មែរ (judul, tombol, nama menu Khmer; tersimpan per perangkat); driver default kh dari user, ganti ID ↔ ខ្មែរ.
8. **Hak akses** — dapur membuka `/admin…`, `/kasir…` → dialihkan ke `/dapur`; kasir ke `/admin…` → `/kasir`; API 403 `FORBIDDEN` untuk dapur/driver/kasir di luar izin, 401 tanpa sesi.
9. **Tata letak 360 px** — 23 layar pos-web (termasuk keranjang delivery & bayar) dan order-web (menu, keranjang, alamat, mode meja, `/tg`): tanpa scroll horizontal, tanpa wadah yang bisa digeser ke samping atau memotong isi. "Makan di sini" di mode biasa jelas meminta scan QR dan tombol lanjut nonaktif.
10. Setiap test e2e juga memastikan **tidak ada error konsol / error halaman** di browser.

### Manual / eksploratif (Chrome headless, 390 px, skrip Playwright)

- Menjelajah semua rute pos-web sebagai Owner (kasir, meja, nota, online, riwayat, pengeluaran, closing, buka shift, dapur, driver, dashboard, menu & edit, grup pilihan & edit, meja & QR, pengguna & role, settings, telegram, promo, printer) + membuka lembar "Menu lainnya", Habis?, kategori; data campuran (dine-in dengan opsi & catatan, bungkus dengan HP, Grab GF-482, delivery diambil driver, order website, pengeluaran). Konsol bersih setelah perbaikan.
- order-web: `/`, keranjang, alamat, checkout, `/tg` tanpa initData (pesan "Login Telegram gagal" + tombol lanjut di website), token QR salah ("QR meja tidak berlaku"), ganti 4 bahasa, pencarian.
- Split bill (bagi rata), Pindah meja, Gabung meja (UI & API).
- **Realtime:** bel order online berbunyi (AudioContext di-spy) dan badge bertambah; server dimatikan (SIGTERM) lalu dinyalakan lagi di tengah sesi → klien menyambung ulang sendiri, order yang masuk saat putus muncul lewat sinkron ulang, pita "Menghubungkan ulang…" tampil saat putus.
- Build produksi server (`dist/index.js`, `NODE_ENV=production`, pg-boss aktif) menyala, `/api/health` OK, initData tanpa bot token ditolak `INTEGRATION_DISABLED`, SIGTERM keluar bersih.

## 3. Bug ditemukan & diperbaiki

| # | Area | Masalah | Perbaikan |
| - | ---- | ------- | --------- |
| 1 | Repo | `pnpm format:check` gagal (65 file) | Prettier dijalankan |
| 2 | Kontrak/pos-web | Kasir tidak bisa membuat order channel **telegram** (disimpan sebagai `kasir` + catatan "Telegram") | `STAFF_ORDER_CHANNELS` + `telegram` (wajib delivery, langsung `accepted`), pos-web mengirim channel telegram, catatan tempelan dihapus |
| 3 | pos-web | Order Telegram buatan kasir akan muncul sebagai "order online" | `OrderDto.createdByStaff` (aditif); `isOnlineOrder` mengecualikan order staf |
| 4 | Server/pos-web | Nama/HP pelanggan bungkus tidak tersimpan; HP yang ditambahkan saat edit order hilang → driver tanpa tombol Telepon | `customerPhone` (aditif) di buat/ubah order; server membuat/memperbarui data pelanggan; field HP di keranjang bungkus; diverifikasi driver melihat Telepon |
| 5 | Settings | Tidak ada info rekening ABA untuk pelanggan | `settings.payment.aba {accountName, accountNumber, qrImageUrl?}`, form di Admin → Settings, `PublicSettings.aba`, panel ABA order-web (salin nomor, QR) di checkout & halaman status |
| 6 | Server | PATCH settings parsial untuk objek bertingkat akan menimpa seluruh objek | merge bertingkat (deep merge) |
| 7 | pos-web | Staf non-admin memakai angka tertanam (terlambat 15 menit, shift Pagi/Malam, ukuran teks) karena settings hanya untuk admin | endpoint `GET /settings/staff`; dapur, buka shift & ukuran teks default memakai settings toko |
| 8 | pos-web | Bundel produksi memakai React development (`.env` root `NODE_ENV=development`) | `vite.config.ts` pos-web diperbaiki seperti order-web + `scripts/check-prod-bundle.mjs` di `pnpm build` |
| 9 | Server | Gabung meja ke meja yang sama → 404 membingungkan | ditolak lebih awal; test memastikan sesi gabungan tidak terhitung sebagai pembayaran di closing/laporan dan denah benar |
| 10 | **Server** | **Shutdown (SIGTERM/PM2 restart) menggantung** selama ada WebSocket terbuka; pg-boss & pool DB tidak pernah ditutup | socket diputus di hook `preClose`; test regresi |
| 11 | **pos-web/order-web** | Setelah server restart/deploy, klien **tidak menyambung ulang** (alasan `io server disconnect`) → realtime mati sampai reload | sambung ulang otomatis + sinkron ulang; pita "Menghubungkan ulang…" |
| 12 | pos-web/order-web | Peringatan "WebSocket is closed before the connection is established" saat sesi berubah | sambung ulang menunggu handshake selesai |
| 13 | pos-web | Peringatan autoplay AudioContext saat layar dibuka tanpa sentuhan | AudioContext dibuat setelah interaksi pertama |
| 14 | pos-web | Bel order online tidak berbunyi langsung untuk order baru bila alarm sudah aktif | bunyi langsung saat `order.created` |
| 15 | pos-web | Nota/struk "MEJA MEJA 1" | label meja tidak dobel + test |
| 16 | pos-web | Label "Menu lainnya" & "Grup pilihan" jatuh ke Inggris di layar dapur/driver Khmer/Mandarin | kamus kh/zh + test kelengkapan kamus layar dapur & driver |
| 17 | pos-web | Label bel tidak konsisten ("Order website, n baru" vs "Order online") | "Order online, n baru" |
| 18 | pos-web/order-web | Jam buka 24 jam tampil "00:00 – 00:00" / "sampai 00.00" | "Buka 24 jam" |
| 19 | pos-web | `/kasir/bayar` tanpa order/meja menampilkan "Terjadi kesalahan" | dialihkan ke `/kasir` |
| 20 | pos-web | Kelola menu 360 px: kolom cari mendorong tombol Kategori keluar layar | `min-w-0` / `shrink-0` |
| 21 | Server test | Test gabung meja bergantung urutan file (flaky) | memilih meja yang sedang kosong |

## 4. Keterbatasan yang tidak bisa dites di sini

- **Klien Telegram asli** (Mini App di aplikasi Telegram, tombol menu bot, webhook nyata, notifikasi chat) dan **validasi HMAC** dengan bot token produksi — dites dengan initData palsu (mode dev) dan unit test tanda tangan di server.
- **Printer thermal asli** (Web Serial / Web Bluetooth) — hanya pratinjau di layar dan unit test encoder ESC/POS.
- **Google Maps / Places** — tanpa API key: peta placeholder + input lat/lng manual.
- **Gemini, Cloudflare R2, backup pg_dump ke R2** — mode mock/disk lokal.
- **Suara** — hanya dipastikan Web Audio dipanggil (spy), bukan terdengar.
- **Font Khmer/Mandarin** tidak terpasang di mesin test (Google Fonts diblokir) sehingga teks Khmer tampil dengan font cadangan di screenshot; di perangkat asli font dimuat dari Google Fonts.
- Uji di perangkat Android/iOS fisik, Safari, dan jaringan lambat belum dilakukan.
- Log dev Vite sesekali mencetak `ws proxy socket error: read ECONNRESET` saat konteks browser test ditutup paksa — hanya proksi dev, tidak memengaruhi hasil test maupun produksi (Caddy).
