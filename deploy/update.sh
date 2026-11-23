#!/usr/bin/env bash
# Update aplikasi ke versi terbaru di GitHub (atau rebuild setelah mengubah .env).
# Pakai (sebagai root): bash /srv/pos/app/deploy/update.sh
set -euo pipefail
APP=/srv/pos/app
BRANCH="${BRANCH:-main}"
as_pos() { sudo -u pos -H env COREPACK_ENABLE_DOWNLOAD_PROMPT=0 bash -lc "$*"; }
[[ $EUID -eq 0 ]] || { echo "Jalankan sebagai root."; exit 1; }

echo "==> Ambil kode terbaru"
as_pos "cd $APP && git fetch -q origin $BRANCH && git reset -q --hard origin/$BRANCH"
echo "==> Build"
as_pos "cd $APP && pnpm install --frozen-lockfile && pnpm build"
echo "==> Migrasi database"
as_pos "cd $APP && node --env-file=.env apps/server/dist/migrate.js"
echo "==> Salin web"
rsync -a --delete "$APP/apps/pos-web/dist/" /srv/pos/www/pos/
rsync -a --delete "$APP/apps/order-web/dist/" /srv/pos/www/order/
chown -R pos:pos /srv/pos/www
echo "==> Restart server"
as_pos "cd $APP && pm2 reload deploy/ecosystem.config.cjs --update-env && pm2 save"
sed -e "s/pos\.rmberkat\.linkedbite\.com/${POS_DOMAIN:-pos.rmberkat.linkedbite.com}/" \
  -e "s/order\.rmberkat\.linkedbite\.com/${ORDER_DOMAIN:-order.rmberkat.linkedbite.com}/" \
  "$APP/deploy/Caddyfile" > /etc/caddy/Caddyfile && systemctl reload caddy

# Daftarkan webhook Telegram bila token sudah diisi
set -a; . "$APP/.env"; set +a
if [[ -n "${TELEGRAM_BOT_TOKEN:-}" ]]; then
  echo "==> Set webhook Telegram"
  curl -fsS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
    -d "url=${POS_ORIGIN}/tg/webhook" -d "secret_token=${TELEGRAM_WEBHOOK_SECRET}" \
    --data-urlencode 'allowed_updates=["message","edited_message","callback_query","my_chat_member","business_connection","business_message","edited_business_message"]' && echo
fi
sleep 2
curl -fsS http://127.0.0.1:3000/api/health >/dev/null && echo "✓ Selesai — server OK" || echo "!! Server belum jawab: sudo -iu pos pm2 logs pos-server"
