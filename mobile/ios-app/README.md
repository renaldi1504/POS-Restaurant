# Aplikasi iPad POS (Capacitor) — install sendiri lewat Xcode

Aplikasi ini membungkus POS staf (web) dan menambahkan **Bluetooth native**, sehingga printer
thermal **BLE** bisa tersambung (dan tersambung ulang otomatis) di iPad — Safari tidak punya
Web Bluetooth. Halaman POS dimuat langsung dari server, jadi **update fitur lewat
`deploy/update.sh` langsung masuk ke iPad tanpa build ulang**.

## Yang dibutuhkan

- Mac dengan **Xcode** (versi terbaru dari App Store) dan Node.js 22+
- **Apple ID biasa (gratis)** — tidak perlu Apple Developer Program
- iPad + kabel USB

## Pasang pertama kali

```bash
git clone https://github.com/renaldi1504/POS-Restaurant.git
cd POS-Restaurant/mobile/ios-app
npm install
POS_URL=https://pos.domainanda.com npx cap sync ios   # alamat POS staf (POS_ORIGIN)
npx cap open ios                                       # membuka Xcode
```

Di Xcode:

1. **Settings → Accounts → +** → masuk dengan Apple ID Anda.
2. Pilih project **App** → target **App** → tab **Signing & Capabilities**:
   - centang **Automatically manage signing**
   - **Team** = "(Nama Anda) (Personal Team)"
   - **Bundle Identifier**: ganti jadi unik, mis. `com.namaanda.posberkat`
3. Colok iPad, pilih iPad di daftar perangkat (atas), tekan **▶ Run**.

Di iPad (sekali saja):

- **Settings → Privacy & Security → Developer Mode → On** (iPad restart).
- Saat pertama membuka aplikasi: **Settings → General → VPN & Device Management** →
  pilih Apple ID Anda → **Trust**.

## Printer

Buka **Printer** di aplikasi → **Hubungkan Bluetooth** → pilih printer → izinkan Bluetooth.
Setelah itu printer tersambung otomatis setiap aplikasi dibuka, dan tersambung ulang sendiri
sebelum mencetak bila koneksi terputus (mis. iPad habis layar mati).

## Penting: berlaku 7 hari (Apple ID gratis)

Aplikasi yang dipasang dengan Apple ID gratis **berhenti bisa dibuka setelah 7 hari**.
Perpanjang dengan mencolok iPad ke Mac dan menekan **▶ Run** lagi di Xcode
(data login & printer tetap tersimpan). Batas Apple ID gratis: maks. 3 aplikasi per perangkat.

## Ganti alamat server

```bash
POS_URL=https://alamat-baru.com npx cap sync ios
```

lalu **▶ Run** lagi.
