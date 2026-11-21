#!/usr/bin/env bash
# =============================================================================
#  Instalasi sekali jalan — POS Rumah Makan Berkat
#  Target : Ubuntu 24.04 (Linode Nanode 1 GB), dijalankan sebagai root.
#  Pakai  : curl -fsSL https://raw.githubusercontent.com/renaldi1504/POS-Restaurant/main/deploy/install.sh | bash
#  Aman diulang (idempotent): langkah yang sudah selesai akan dilewati.
# =============================================================================
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/renaldi1504/POS-Restaurant.git}"
BRANCH="${BRANCH:-main}"
POS_DOMAIN="${POS_DOMAIN:-pos.rmberkat.linkedbite.com}"
ORDER_DOMAIN="${ORDER_DOMAIN:-order.rmberkat.linkedbite.com}"
APP=/srv/pos/app
ENV_FILE="$APP/.env"

step() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m!!  %s\033[0m\n' "$*"; }
as_pos() { sudo -u pos -H env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -lc "$*"; }

[[ $EUID -eq 0 ]] || { echo "Jalankan sebagai root (sudo -i dulu)."; exit 1; }
. /etc/os-release
[[ "${VERSION_ID:-}" == "24.04" ]] || warn "Diuji di Ubuntu 24.04, server ini: ${PRETTY_NAME:-?}. Lanjut…"
export DEBIAN_FRONTEND=noninteractive

step "1/9 Paket dasar"
apt-get update -y
apt-get install -y git curl rsync ufw unzip ca-certificates gnupg debian-keyring debian-archive-keyring \
  apt-transport-https postgresql postgresql-client openssl

step "2/9 Swap 2 GB, zona waktu, firewall"
if ! swapon --show | grep -q /swapfile; then
  fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '^/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
  echo 'vm.swappiness=10' > /etc/sysctl.d/99-swap.conf && sysctl --system >/dev/null
fi
timedatectl set-timezone Asia/Phnom_Penh
ufw allow OpenSSH >/dev/null && ufw allow 80 >/dev/null && ufw allow 443 >/dev/null
ufw --force enable >/dev/null

step "3/9 Node 22, pnpm, PM2"
if ! command -v node >/dev/null || [[ "$(node -v)" != v22* ]]; then
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
  apt-get install -y nodejs
fi
corepack enable
command -v pm2 >/dev/null || npm i -g pm2

step "4/9 User 'pos' & folder"
id pos >/dev/null 2>&1 || useradd -m -s /bin/bash pos
mkdir -p /srv/pos/www/pos /srv/pos/www/order /srv/pos/uploads /var/log/pos
chown -R pos:pos /srv/pos /var/log/pos

step "5/9 Ambil kode dari GitHub"
if [[ -d "$APP/.git" ]]; then
  as_pos "cd $APP && git fetch -q origin $BRANCH && git reset -q --hard origin/$BRANCH"
else
  as_pos "git clone -q -b $BRANCH $REPO_URL $APP" || {
    echo "Gagal clone. Bila repo private, ulangi dengan: REPO_URL=https://<TOKEN>@github.com/renaldi1504/POS-Restaurant.git bash install.sh"
    exit 1
  }
fi

step "6/9 PostgreSQL + file .env"
PG_CONF_DIR="$(ls -d /etc/postgresql/*/main | sort -V | tail -1)"
cp "$APP/deploy/postgresql-tuning.conf" "$PG_CONF_DIR/conf.d/pos-tuning.conf"
systemctl restart postgresql
if [[ ! -f "$ENV_FILE" ]]; then
  DB_PASS="$(openssl rand -hex 24)"
  sudo -u postgres psql -qc "DO \$\$BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname='pos') THEN CREATE ROLE pos LOGIN; END IF; END\$\$;"
  sudo -u postgres psql -qc "ALTER ROLE pos WITH PASSWORD '$DB_PASS';"
  sudo -u postgres psql -tAc "SELECT 1 FROM pg_database WHERE datname='pos'" | grep -q 1 \
    || sudo -u postgres createdb -O pos pos
  cat > "$ENV_FILE" <<EOF
NODE_ENV=production
PORT=3000
DATABASE_URL=postgres://pos:${DB_PASS}@localhost:5432/pos
SESSION_SECRET=$(openssl rand -base64 48 | tr -d '\n')
SESSION_TTL_HOURS=16
POS_ORIGIN=https://${POS_DOMAIN}
ORDER_ORIGIN=https://${ORDER_DOMAIN}
TZ_BUSINESS=Asia/Phnom_Penh
JOBS_ENABLED=true
UPLOAD_DIR=/srv/pos/uploads

# --- Isi nanti (kosong = fitur berjalan dalam mode mock/placeholder) ---
TELEGRAM_BOT_TOKEN=
TELEGRAM_BOT_USERNAME=
TELEGRAM_ADMIN_CHAT_ID=
TELEGRAM_WEBHOOK_SECRET=$(openssl rand -hex 24)
GEMINI_API_KEY=
GEMINI_MODEL=gemini-2.5-flash
# Opsional: email agar kuota terjemahan gratis (tanpa Gemini) jadi 50.000 karakter/hari
TRANSLATE_EMAIL=
GOOGLE_MAPS_API_KEY=
VITE_GOOGLE_MAPS_API_KEY=
R2_ACCOUNT_ID=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_PUBLIC=
R2_BUCKET_PRIVATE=
R2_PUBLIC_URL=
EOF
  chown pos:pos "$ENV_FILE" && chmod 600 "$ENV_FILE"
  echo "File .env dibuat dengan password DB & secret acak."
else
  echo ".env sudah ada — tidak diubah."
fi

step "7/9 Build aplikasi (±5–10 menit di Nanode)"
as_pos "cd $APP && corepack prepare --activate >/dev/null 2>&1 || true; pnpm install --frozen-lockfile && pnpm build"
as_pos "cd $APP && node --env-file=.env apps/server/dist/migrate.js && node --env-file=.env apps/server/dist/seed.js"
rsync -a --delete "$APP/apps/pos-web/dist/" /srv/pos/www/pos/ 2>/dev/null || { rm -rf /srv/pos/www/pos/*; cp -r "$APP/apps/pos-web/dist/." /srv/pos/www/pos/; }
rsync -a --delete "$APP/apps/order-web/dist/" /srv/pos/www/order/ 2>/dev/null || { rm -rf /srv/pos/www/order/*; cp -r "$APP/apps/order-web/dist/." /srv/pos/www/order/; }
chown -R pos:pos /srv/pos/www

step "8/9 Jalankan server (PM2, otomatis nyala saat reboot)"
as_pos "cd $APP && (pm2 describe pos-server >/dev/null 2>&1 && pm2 reload deploy/ecosystem.config.cjs --update-env || pm2 start deploy/ecosystem.config.cjs) && pm2 save"
env PATH="$PATH" pm2 startup systemd -u pos --hp /home/pos >/dev/null

step "9/9 Caddy (HTTPS otomatis)"
if ! command -v caddy >/dev/null; then
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | gpg --dearmor --yes -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' > /etc/apt/sources.list.d/caddy-stable.list
  apt-get update -y && apt-get install -y caddy
fi
sed -e "s/pos\.rmberkat\.linkedbite\.com/${POS_DOMAIN}/" -e "s/order\.rmberkat\.linkedbite\.com/${ORDER_DOMAIN}/" \
  "$APP/deploy/Caddyfile" > /etc/caddy/Caddyfile
systemctl enable --now caddy >/dev/null && systemctl reload caddy

sleep 3
printf '\n\033[1;36m================ HASIL ================\033[0m\n'
if curl -fsS http://127.0.0.1:3000/api/health >/dev/null; then echo "Server Node   : OK"; else warn "Server Node belum jawab — cek: sudo -iu pos pm2 logs pos-server"; fi
IP="$(curl -fsS4 https://ifconfig.me 2>/dev/null || hostname -I | awk '{print $1}')"
for d in "$POS_DOMAIN" "$ORDER_DOMAIN"; do
  r="$(getent ahostsv4 "$d" | awk '{print $1; exit}')"
  if [[ "$r" == "$IP" ]]; then echo "DNS $d : OK ($IP)"; else warn "DNS $d → '${r:-belum ada}', seharusnya $IP"; fi
done
echo "Buka   : https://${POS_DOMAIN}   (login Owner PIN 1234 — SEGERA ganti semua PIN)"
echo "Pesan  : https://${ORDER_DOMAIN}"
echo "Kunci API (Telegram/Gemini/Maps/R2): nano $ENV_FILE  lalu  bash $APP/deploy/update.sh"
