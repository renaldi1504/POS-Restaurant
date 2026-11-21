#!/usr/bin/env bash
# Backup harian pg_dump → Cloudflare R2 (S3 API) dengan retensi 30 hari.
# Cron (root/pos): 30 3 * * * /srv/pos/app/deploy/backup.sh >> /var/log/pos/backup.log 2>&1
# Butuh: aws cli v2, variabel di /srv/pos/app/.env (DATABASE_URL, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
# R2_SECRET_ACCESS_KEY) dan R2_BUCKET_BACKUP (default: R2_BUCKET_PRIVATE).
set -euo pipefail

ENV_FILE="${ENV_FILE:-/srv/pos/app/.env}"
set -a; source "$ENV_FILE"; set +a

BUCKET="${R2_BUCKET_BACKUP:-${R2_BUCKET_PRIVATE:?R2_BUCKET_PRIVATE kosong}}"
ENDPOINT="https://${R2_ACCOUNT_ID:?}.r2.cloudflarestorage.com"
export AWS_ACCESS_KEY_ID="${R2_ACCESS_KEY_ID:?}"
export AWS_SECRET_ACCESS_KEY="${R2_SECRET_ACCESS_KEY:?}"
export AWS_DEFAULT_REGION=auto

STAMP="$(TZ=Asia/Phnom_Penh date +%Y-%m-%d_%H%M)"
TMP="$(mktemp -d)"
FILE="$TMP/pos_${STAMP}.dump"
trap 'rm -rf "$TMP"' EXIT

echo "[$(date -Is)] pg_dump…"
pg_dump --format=custom --no-owner --compress=9 "$DATABASE_URL" -f "$FILE"

echo "[$(date -Is)] upload ke r2://$BUCKET/backups/"
aws s3 cp "$FILE" "s3://$BUCKET/backups/$(basename "$FILE")" --endpoint-url "$ENDPOINT" --only-show-errors

echo "[$(date -Is)] hapus backup > 30 hari"
CUTOFF="$(date -d '30 days ago' +%Y-%m-%d)"
aws s3 ls "s3://$BUCKET/backups/" --endpoint-url "$ENDPOINT" | awk '{print $4}' | while read -r name; do
  d="$(echo "$name" | sed -n 's/^pos_\([0-9-]\{10\}\)_.*/\1/p')"
  if [[ -n "$d" && "$d" < "$CUTOFF" ]]; then
    aws s3 rm "s3://$BUCKET/backups/$name" --endpoint-url "$ENDPOINT" --only-show-errors
    echo "  dihapus: $name"
  fi
done
echo "[$(date -Is)] selesai"
