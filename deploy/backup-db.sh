#!/usr/bin/env bash
set -euo pipefail

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
BACKUP_DIR="$APP_DIR/backups"
DB_FILE="$APP_DIR/data.db"
STAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "$BACKUP_DIR"

if [[ ! -f "$DB_FILE" ]]; then
  echo "Database tidak ditemukan: $DB_FILE"
  exit 1
fi

cp "$DB_FILE" "$BACKUP_DIR/data-$STAMP.db"
echo "Backup: $BACKUP_DIR/data-$STAMP.db"

# Simpan 14 backup terakhir
ls -1t "$BACKUP_DIR"/data-*.db 2>/dev/null | tail -n +15 | xargs -r rm -f