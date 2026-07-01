#!/usr/bin/env bash
set -euo pipefail

# Update app dari GitHub + restart PM2
# Jalankan di VPS setelah setup:
#   bash deploy/deploy.sh

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"

echo "Pull latest..."
git pull origin main

echo "Install dependencies..."
npm ci --omit=dev

echo "Reload PM2..."
pm2 reload deploy/ecosystem.config.cjs --env production

echo "Deploy selesai: $(date -Is)"
pm2 status tebakbola