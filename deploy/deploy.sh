#!/usr/bin/env bash
set -euo pipefail

# Update app dari GitHub + clean restart PM2
# Jalankan di VPS:
#   bash deploy/deploy.sh
#
# Catatan: Script ini pakai pm2 delete + start (bukan reload)
# supaya module cache bersih, terutama setelah perubahan besar.
# Ada downtime kecil (beberapa detik).

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"

echo "Pull latest..."
git pull origin main

echo "Install dependencies..."
npm ci --omit=dev

echo "Clean restart PM2..."
pm2 delete tebakbola || true
pm2 start deploy/ecosystem.config.cjs --env production
pm2 save

echo "Deploy selesai: $(date -Is)"
pm2 status tebakbola