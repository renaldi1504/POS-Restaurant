#!/usr/bin/env bash
# =============================================================================
#  Reset database produksi — POS Rumah Makan Berkat
#  Pakai (sebagai root):
#    bash /srv/pos/app/deploy/reset-db.sh transaksi   # hapus data transaksi, menu/user/setting tetap
#    bash /srv/pos/app/deploy/reset-db.sh semua       # kosongkan SEMUA, isi ulang data awal (PIN default)
#  Selalu membuat backup dulu di /srv/pos/backups/ (bisa di-restore).
# =============================================================================
set -euo pipefail
APP=/srv/pos/app
BACKUP_DIR=/srv/pos/backups
MODE="${1:-}"
as_pos() { sudo -u pos -H bash -lc "$*"; }

[[ $EUID -eq 0 ]] || { echo "Jalankan sebagai root."; exit 1; }
case "$MODE" in
  transaksi)
    echo "MODE: TRANSAKSI"
    echo "  Dihapus : order, pembayaran, shift, modal, pengeluaran, closing, setoran driver,"
    echo "            sesi meja, pelanggan & alamat, nomor order harian, log, sesi login."
    echo "  Tetap   : menu, harga, opsi, promo, kategori, meja & QR, user & PIN, role, pengaturan, logo."
    ;;
  semua)
    echo "MODE: SEMUA"
    echo "  SEMUA data & foto upload dihapus, lalu diisi ulang data awal:"
    echo "  menu contoh, meja contoh, user PIN default (Owner 1234 dst.), pengaturan default."
    echo "  QR meja lama TIDAK berlaku lagi (harus cetak ulang)."
    ;;
  *)
    echo "Pakai: bash $0 transaksi|semua"; exit 1 ;;
esac

read -r -p "Ketik RESET untuk melanjutkan: " ok </dev/tty
[[ "$ok" == "RESET" ]] || { echo "Dibatalkan."; exit 1; }

set -a; . "$APP/.env"; set +a
mkdir -p "$BACKUP_DIR" && chown pos:pos "$BACKUP_DIR"
FILE="$BACKUP_DIR/sebelum-reset_$(TZ=Asia/Phnom_Penh date +%Y-%m-%d_%H%M).dump"
echo "==> Backup → $FILE"
as_pos "pg_dump --format=custom --no-owner '$DATABASE_URL' -f '$FILE'"

echo "==> Hentikan server"
as_pos "pm2 stop pos-server >/dev/null"

if [[ "$MODE" == "transaksi" ]]; then
  echo "==> Hapus data transaksi"
  as_pos "psql '$DATABASE_URL' -v ON_ERROR_STOP=1 -q" <<'SQL'
BEGIN;
TRUNCATE order_items, payments, orders, table_sessions, expenses, closings,
         driver_settlements, shifts, daily_counters, addresses, customers,
         audit_logs, sessions RESTART IDENTITY CASCADE;
DO $$BEGIN
  IF EXISTS (SELECT FROM information_schema.schemata WHERE schema_name='pgboss') THEN
    EXECUTE 'DELETE FROM pgboss.job';
  END IF;
EXCEPTION WHEN undefined_table THEN NULL; END$$;
COMMIT;
SQL
  # bukti bayar & foto struk pengeluaran ikut dihapus; foto menu & logo tetap
  rm -rf /srv/pos/uploads/private/proofs /srv/pos/uploads/private/expenses 2>/dev/null || true
else
  echo "==> Kosongkan database"
  as_pos "psql '$DATABASE_URL' -v ON_ERROR_STOP=1 -q -c 'DROP SCHEMA IF EXISTS public CASCADE; DROP SCHEMA IF EXISTS drizzle CASCADE; DROP SCHEMA IF EXISTS pgboss CASCADE; CREATE SCHEMA public;'"
  find /srv/pos/uploads -mindepth 1 -delete 2>/dev/null || true
  echo "==> Buat tabel & isi data awal"
  as_pos "cd $APP && node --env-file=.env apps/server/dist/migrate.js && node --env-file=.env apps/server/dist/seed.js"
fi

echo "==> Nyalakan server"
as_pos "pm2 start pos-server >/dev/null"
sleep 2
curl -fsS http://127.0.0.1:3000/api/health >/dev/null && echo "✓ Reset selesai — server OK" || echo "!! Server belum jawab: sudo -iu pos pm2 logs pos-server"
echo "Batalkan reset (kembalikan data): sudo -iu pos pg_restore --clean --if-exists --no-owner -d \"\$DATABASE_URL\" '$FILE'"
[[ "$MODE" == "semua" ]] && echo "Ingat: login Owner PIN 1234, ganti semua PIN, isi ulang Pengaturan & cetak ulang QR meja."
exit 0
