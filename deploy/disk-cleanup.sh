#!/usr/bin/env bash
set -euo pipefail

# Bersihkan log & file lama agar disk tidak penuh.
# Cron contoh: 0 4 * * 0 cd /var/www/forbiddendoor && bash deploy/disk-cleanup.sh

APP_DIR="${APP_DIR:-$(cd "$(dirname "$0")/.." && pwd)}"
cd "$APP_DIR"

echo "=== Disk cleanup $(date -Is) ==="
df -h / | tail -1

# PM2 logs
if command -v pm2 >/dev/null 2>&1; then
  pm2 flush tebakbola 2>/dev/null || true
fi
truncate -s 0 logs/pm2-error.log logs/pm2-out.log 2>/dev/null || true

# Backup log (jangan membesar tanpa batas)
if [[ -f logs/backup.log ]] && [[ $(wc -c < logs/backup.log) -gt 1048576 ]]; then
  truncate -s 0 logs/backup.log
fi

# Backup DB: simpan 7 terakhir
if [[ -d backups ]]; then
  ls -1t backups/data-*.db 2>/dev/null | tail -n +8 | xargs -r rm -f
fi

# SQLite WAL checkpoint (jangan hapus .db-wal manual saat app jalan)
if [[ -f data.db ]]; then
  sqlite3 data.db 'PRAGMA wal_checkpoint(TRUNCATE);' 2>/dev/null || true
fi

# Session expired
if [[ -f data.db ]]; then
  sqlite3 data.db 'DELETE FROM sessions WHERE expired <= strftime("%s","now") * 1000;' 2>/dev/null || true
fi

echo "Selesai."
df -h / | tail -1
du -sh logs backups data.db 2>/dev/null || true