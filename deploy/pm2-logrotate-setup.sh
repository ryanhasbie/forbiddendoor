#!/usr/bin/env bash
set -euo pipefail

# Pasang rotasi log PM2 (jalankan sekali di VPS)
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7
pm2 set pm2-logrotate:compress true
pm2 set pm2-logrotate:workerInterval 60
echo "PM2 logrotate aktif."