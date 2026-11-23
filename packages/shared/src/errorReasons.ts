/**
 * Alasan error spesifik dari server. Server mengirim `{ error: { code, message } }` dengan pesan
 * Bahasa Indonesia; klien mencocokkan pesan itu ke kunci di sini lalu menampilkan terjemahan
 * `errorReason.<kunci>` sesuai bahasa staf/pelanggan (kode error dipakai bila pesan tidak dikenal).
 *
 * Nilai = pesan server persis. `{{nama}}` = bagian dinamis (diteruskan ke terjemahan sebagai parameter).
 * Test server (`error-reasons.test.ts`) memastikan setiap pesan error literal di server terdaftar di sini.
 */
export const ERROR_REASONS = {
  // ---- tidak ditemukan ----
  orderNotFound: 'Order tidak ditemukan',
  tableNotFound: 'Meja tidak ditemukan',
  categoryNotFound: 'Kategori tidak ditemukan',
  optionNotFound: 'Pilihan tidak ditemukan',
  optionGroupNotFound: 'Grup pilihan tidak ditemukan',
  shiftNotFound: 'Shift tidak ditemukan',
  promoNotFound: 'Promo tidak ditemukan',
  menuNotFound: 'Menu tidak ditemukan',
  addressNotFound: 'Alamat tidak ditemukan',
  customerNotFound: 'Pelanggan tidak ditemukan',
  linkNotAllowed: 'Link ini bukan link Google Maps',
  linkTooManyRedirects: 'Link dialihkan terlalu banyak kali',
  linkResolveFailed: 'Link lokasi tidak bisa dibuka, coba lagi',
  roleNotFound: 'Role tidak ditemukan',
  userNotFound: 'Pengguna tidak ditemukan',
  paymentNotFound: 'Pembayaran tidak ditemukan',
  settlementNotFound: 'Setoran tidak ditemukan',
  tableSessionNotFound: 'Sesi meja tidak ditemukan',
  fileNotFound: 'File tidak ditemukan',
  qrInvalid: 'QR meja tidak berlaku, minta bantuan kasir',
  customerSessionMissing: 'Sesi pelanggan tidak ditemukan',
  // ---- shift ----
  openShiftFirst: 'Buka shift dulu',
  openShiftBeforeOrder: 'Buka shift dulu sebelum membuat order',
  noOpenShift: 'Tidak ada shift terbuka',
  shiftClosed: 'Shift sudah closing',
  shiftClosedAdminOnly: 'Shift order ini sudah closing; hanya admin yang bisa mengubah',
  shiftStillOpen: 'Shift "{{name}}" masih terbuka, closing dulu',
  closingNoteRequired: 'Ada selisih: wajib isi catatan',
  // ---- order ----
  orderPaid: 'Order sudah lunas',
  orderPaidLocked: 'Order sudah dibayar, tidak bisa diubah',
  orderDoneOrCancelled: 'Order sudah selesai/batal',
  orderCancelledOrRejected: 'Order sudah batal/ditolak',
  orderCancelled: 'Order sudah batal',
  useAcceptButtons: 'Pakai tombol Terima/Tolak/Batal untuk status ini',
  orderAlreadyDelivered: 'Order sudah diantar, tidak bisa dilepas',
  orderNotPending: 'Order ini tidak menunggu diterima',
  orderNotReady: 'Order belum siap diantar',
  onlyPendingReject: 'Hanya order yang menunggu diterima yang bisa ditolak',
  orderNotPickedUp: 'Order belum diambil driver',
  platformCourier: 'Order Grab/foodpanda diantar kurir aplikasi',
  alreadyTaken: 'Order sudah diambil driver lain',
  notYourDelivery: 'Order ini bukan antaran Anda',
  notYourOrder: 'Order ini bukan milik Anda',
  adminOnlyReassign: 'Hanya admin yang bisa memindah order',
  driverDeliveryOnly: 'Driver hanya bisa melihat order delivery',
  chatDriverOnly: 'Hanya driver order ini yang bisa chat',
  chatNoTelegram: 'Pelanggan ini tidak memakai Telegram — hubungi lewat telepon',
  kitchenStartReadyOnly: 'Dapur hanya bisa Mulai masak / Siap',
  transitionNotAllowed: 'Status tidak bisa diubah dari {{from}} ke {{to}}',
  optionsInvalidFor: 'Pilihan untuk {{name}} belum benar',
  adminPinNeeded: 'Order sudah dibayar: perlu PIN admin',
  adminPinWrong: 'PIN admin salah',
  storeClosed: 'Restoran sedang tutup',
  minOrderDelivery: 'Belum mencapai minimal order delivery',
  deliveryAddressRequired: 'Alamat delivery wajib diisi',
  chooseDeliveryAddress: 'Pilih alamat pengantaran',
  fillDeliveryContact: 'Isi nama & alamat pengantaran',
  tableRequired: 'Meja wajib dipilih',
  dineInViaTable: 'Ubah ke makan sini lewat meja',
  tableOrderTypeFixed: 'Order meja tidak bisa diubah tipenya',
  telegramAlwaysDelivery: 'Order Telegram selalu delivery',
  tableModeDineInOnly: 'Mode meja hanya untuk makan di sini',
  dineInScanQr: 'Makan di sini: scan QR di meja',
  notTableMode: 'Bukan mode meja',
  // ---- promo ----
  promoNotForOrder: 'Promo tidak berlaku untuk order ini',
  promoNotForItems: 'Promo tidak berlaku untuk menu yang dipesan',
  promoMinSpend: 'Belum mencapai minimal belanja promo',
  percentMax100: 'Persen maksimal 100',
  // ---- pembayaran ----
  nonCashOverDue: 'Pembayaran non-tunai melebihi tagihan',
  paymentShort: 'Uang kurang',
  waitAbaProof: 'Tunggu bukti bayar ABA dari pelanggan',
  paymentVerified: 'Pembayaran sudah diverifikasi',
  paymentVoided: 'Pembayaran sudah dibatalkan',
  currencyInactive: 'Mata uang {{currency}} tidak aktif',
  mainCurrencyMustBeEnabled: 'Mata uang utama harus aktif',
  // ---- meja ----
  sameTargetTable: 'Meja tujuan sama',
  sourceTableNoBill: 'Meja asal tidak punya tagihan terbuka',
  targetTableInactive: 'Meja tujuan tidak aktif',
  tableInactive: 'Meja tidak ditemukan / tidak aktif',
  tableNoOrders: 'Belum ada pesanan di meja ini',
  targetTableOccupied: 'Meja tujuan sedang dipakai',
  tableBillPaid: 'Tagihan meja sudah lunas',
  noBill: 'Tidak ada tagihan',
  // ---- menu ----
  optionNotInGroup: 'Pilihan {{id}} bukan milik grup ini',
  maxGteMin: 'Maksimal harus ≥ minimal',
  categoryNameTaken: 'Nama kategori sudah dipakai',
  categoryExists: 'Kategori sudah ada',
  categoryHasItems: 'Kategori masih berisi menu',
  reorderDuplicate: 'Urutan berisi id ganda',
  reorderMissing: 'Sebagian data tidak ditemukan',
  storageError: 'Gagal menyimpan file di server',
  rangeTooLong: 'Rentang tanggal maksimal 400 hari',
  // ---- pengguna & role ----
  roleNameTaken: 'Nama role sudah dipakai',
  roleInUse: 'Role masih dipakai pengguna',
  systemRoleDelete: 'Role sistem tidak bisa dihapus',
  systemRoleRename: 'Nama role sistem tidak bisa diubah',
  systemUserEdit: 'User sistem tidak bisa diubah',
  systemUserDelete: 'User sistem tidak bisa dihapus',
  cannotDeactivateSelf: 'Tidak bisa menonaktifkan diri sendiri',
  needOneAdmin: 'Harus ada minimal satu owner/admin aktif',
  needPermission: 'Butuh izin: {{perms}}',
  invalidTargetDriver: 'Driver tujuan tidak valid',
  // ---- login ----
  wrongUserOrPin: 'Pengguna atau PIN salah',
  wrongPin: 'PIN salah',
  lockedTemporarily: 'Terlalu banyak salah, akun terkunci sementara',
  locked5min: 'Terlalu banyak salah, akun terkunci 5 menit',
  // ---- file & integrasi ----
  fileFormat: 'Format file harus JPG, PNG, WEBP, atau HEIC',
  fileTooLarge: 'File terlalu besar (maks 5 MB)',
  fileMissing: 'File tidak ada',
  telegramNotConfigured: 'Bot Telegram belum dikonfigurasi',
  telegramExpired: 'Sesi Telegram kedaluwarsa, buka ulang Mini App',
  telegramInvalid: 'Data Telegram tidak valid',
  invalidData: 'Data {{where}} tidak valid',
} as const;

export type ErrorReason = keyof typeof ERROR_REASONS;

interface Matcher {
  reason: ErrorReason;
  re: RegExp;
  names: string[];
}

let matchers: Matcher[] | null = null;
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function buildMatchers(): Matcher[] {
  return (Object.entries(ERROR_REASONS) as [ErrorReason, string][]).map(([reason, msg]) => {
    const names: string[] = [];
    const src = msg
      .split(/({{\w+}})/)
      .map((part) => {
        const m = /^{{(\w+)}}$/.exec(part);
        if (!m) return escapeRe(part);
        names.push(m[1]!);
        return '(.+?)';
      })
      .join('');
    return { reason, re: new RegExp(`^${src}$`), names };
  });
}

/** Pesan server → alasan + parameter (null bila pesan tidak dikenal). */
export function errorReasonOf(
  message: string | null | undefined,
): { reason: ErrorReason; params: Record<string, string> } | null {
  if (!message) return null;
  matchers ??= buildMatchers();
  for (const m of matchers) {
    const hit = m.re.exec(message);
    if (hit) {
      const params: Record<string, string> = {};
      m.names.forEach((n, i) => (params[n] = hit[i + 1]!));
      return { reason: m.reason, params };
    }
  }
  return null;
}
