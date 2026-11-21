# Setup server produksi (Ubuntu 24.04, tanpa Docker)

Target: Linode 1 GB (Nanode). Satu proses Node (PM2) + PostgreSQL 16 + Caddy (HTTPS otomatis).

| Subdomain                       | Isi                                                                       |
| ------------------------------- | ------------------------------------------------------------------------- |
| `pos.rmberkat.linkedbite.com`   | PWA staf (kasir, dapur, driver, admin) + `/api`, `/ws`, `/tg`, `/uploads` |
| `order.rmberkat.linkedbite.com` | Website pelanggan / Telegram Mini App / QR meja + `/api`, `/ws`           |

## 1. DNS

Buat record **A** untuk `pos.rmberkat` dan `order.rmberkat` (domain `linkedbite.com`) ke IP server. Bila memakai Cloudflare, set proxy **DNS only** (awan abu-abu) agar Caddy bisa mengambil sertifikat, atau pakai mode Full (strict).

## 2. Paket dasar & swap 2 GB

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y git curl ufw postgresql-16 postgresql-client-16 debian-keyring debian-archive-keyring apt-transport-https unzip
# swap 2 GB
sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile && sudo mkswap /swapfile && sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
echo 'vm.swappiness=10' | sudo tee /etc/sysctl.d/99-swap.conf && sudo sysctl --system
# zona waktu
sudo timedatectl set-timezone Asia/Phnom_Penh
# firewall
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 3. Node 22 + pnpm + PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
sudo corepack enable && corepack prepare pnpm@10 --activate
sudo npm i -g pm2
```

## 4. PostgreSQL

```bash
sudo -u postgres psql -c "CREATE USER pos WITH PASSWORD 'GANTI_PASSWORD_KUAT';"
sudo -u postgres psql -c "CREATE DATABASE pos OWNER pos;"
sudo cp /srv/pos/app/deploy/postgresql-tuning.conf /etc/postgresql/16/main/conf.d/pos-tuning.conf
sudo systemctl restart postgresql
```

## 5. Aplikasi

```bash
sudo useradd -m -s /bin/bash pos || true
sudo mkdir -p /srv/pos/www/pos /srv/pos/www/order /var/log/pos
sudo chown -R pos:pos /srv/pos /var/log/pos
sudo -iu pos
git clone <URL_REPO> /srv/pos/app && cd /srv/pos/app
cp .env.example .env && nano .env      # isi DATABASE_URL, SESSION_SECRET (acak 48+ char), domain, key Telegram/Gemini/R2
pnpm install --frozen-lockfile
pnpm build
node --env-file=.env apps/server/dist/migrate.js
node --env-file=.env apps/server/dist/seed.js   # sekali saja (data awal + user PIN default) — GANTI PIN setelah login!
cp -r apps/pos-web/dist/* /srv/pos/www/pos/ && cp -r apps/order-web/dist/* /srv/pos/www/order/
pm2 start deploy/ecosystem.config.cjs && pm2 save
exit
sudo env PATH=$PATH pm2 startup systemd -u pos --hp /home/pos
```

`.env` produksi minimal:

```
NODE_ENV=production
DATABASE_URL=postgres://pos:GANTI_PASSWORD_KUAT@localhost:5432/pos
SESSION_SECRET=<openssl rand -base64 48>
POS_ORIGIN=https://pos.rmberkat.linkedbite.com
ORDER_ORIGIN=https://order.rmberkat.linkedbite.com
UPLOAD_DIR=/srv/pos/uploads
```

## 6. Caddy

```bash
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' | sudo gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' | sudo tee /etc/apt/sources.list.d/caddy-stable.list
sudo apt update && sudo apt install -y caddy
sudo cp /srv/pos/app/deploy/Caddyfile /etc/caddy/Caddyfile
sudo systemctl reload caddy
```

## 7. Bot Telegram (webhook)

Isi `TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`, `TELEGRAM_ADMIN_CHAT_ID`, `TELEGRAM_WEBHOOK_SECRET` di `.env`, lalu:

```bash
curl "https://api.telegram.org/bot$TELEGRAM_BOT_TOKEN/setWebhook" \
  -d url=https://pos.rmberkat.linkedbite.com/tg/webhook \
  -d secret_token=$TELEGRAM_WEBHOOK_SECRET
```

Di BotFather: set Menu Button / Web App URL ke `https://order.rmberkat.linkedbite.com/tg`.

## 8. Backup harian ke Cloudflare R2 (30 hari)

```bash
sudo apt install -y awscli || (curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o awscliv2.zip && unzip awscliv2.zip && sudo ./aws/install)
sudo -iu pos crontab -e
# 30 3 * * * /srv/pos/app/deploy/backup.sh >> /var/log/pos/backup.log 2>&1
```

Restore: `pg_restore --clean --no-owner -d "$DATABASE_URL" pos_YYYY-MM-DD_HHMM.dump`.

## 9. Deploy otomatis (GitHub Actions)

Workflow `.github/workflows/ci.yml` menjalankan typecheck, lint, test, build, e2e. Di branch `main`, job **deploy** jalan bila secret `DEPLOY_HOST`, `DEPLOY_USER` (= `pos`), `DEPLOY_SSH_KEY` diisi: rsync hasil build ke `/srv/pos/...`, migrasi DB, lalu `pm2 reload`.

## Cek kesehatan

- `curl https://pos.rmberkat.linkedbite.com/api/health` → `{"ok":true,...}`
- `pm2 logs pos-server`, `pm2 monit` (RAM target < 300 MB)
