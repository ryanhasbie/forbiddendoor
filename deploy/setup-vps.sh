#!/usr/bin/env bash
set -euo pipefail

# Setup awal VPS Ubuntu/Debian untuk TebakBola
# Jalankan sebagai root atau user dengan sudo:
#   sudo bash deploy/setup-vps.sh

APP_DIR="${APP_DIR:-/var/www/forbiddendoor}"
REPO_URL="${REPO_URL:-https://github.com/ryanhasbie/forbiddendoor.git}"
DOMAIN="${DOMAIN:-}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-}"
NODE_MAJOR="${NODE_MAJOR:-20}"

if [[ $EUID -ne 0 ]]; then
  echo "Jalankan dengan sudo"
  exit 1
fi

if [[ -z "$DOMAIN" ]]; then
  echo "Set domain dulu, contoh:"
  echo "  sudo DOMAIN=forbiddendoor.com CERTBOT_EMAIL=you@email.com bash deploy/setup-vps.sh"
  exit 1
fi

if [[ -z "$CERTBOT_EMAIL" ]]; then
  echo "Set CERTBOT_EMAIL untuk SSL Let's Encrypt"
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive
apt-get update
apt-get install -y curl git nginx certbot python3-certbot-nginx build-essential

if ! command -v node >/dev/null 2>&1 || [[ "$(node -v | sed 's/v//' | cut -d. -f1)" -lt "$NODE_MAJOR" ]]; then
  curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash -
  apt-get install -y nodejs
fi

if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

mkdir -p /var/www/certbot
mkdir -p "$APP_DIR"

if [[ ! -d "$APP_DIR/.git" ]]; then
  git clone "$REPO_URL" "$APP_DIR"
else
  echo "Repo sudah ada di $APP_DIR, skip clone"
fi

cd "$APP_DIR"
mkdir -p logs backups

if [[ ! -f .env ]]; then
  cp .env.example .env
  SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
  sed -i "s|^SESSION_SECRET=.*|SESSION_SECRET=$SECRET|" .env
  sed -i "s|^NODE_ENV=.*|NODE_ENV=production|" .env
  echo ""
  echo "File .env dibuat. Edit SOCIABUZZ_URL jika perlu:"
  echo "  nano $APP_DIR/.env"
fi

npm ci --omit=dev

if [[ ! -f data.db ]]; then
  echo "Buat admin setelah setup:"
  echo "  cd $APP_DIR && node create-admin.js admin PasswordKuat123"
fi

pm2 start deploy/ecosystem.config.cjs --env production
pm2 save
pm2 startup systemd -u "${SUDO_USER:-root}" --hp "/home/${SUDO_USER:-root}" || true

NGINX_SITE="/etc/nginx/sites-available/tebakbola"
sed "s/DOMAIN_ANDA/$DOMAIN/g" deploy/nginx-tebakbola.conf > "$NGINX_SITE"
ln -sf "$NGINX_SITE" /etc/nginx/sites-enabled/tebakbola
rm -f /etc/nginx/sites-enabled/default
nginx -t
systemctl reload nginx

certbot --nginx -d "$DOMAIN" --non-interactive --agree-tos -m "$CERTBOT_EMAIL" --redirect || {
  echo "Certbot gagal. Coba manual: certbot --nginx -d $DOMAIN -m $CERTBOT_EMAIL"
}

(crontab -l 2>/dev/null | grep -v backup-db.sh; echo "0 3 * * * cd $APP_DIR && bash deploy/backup-db.sh >> logs/backup.log 2>&1") | crontab -

echo ""
echo "Setup selesai."
echo "App: https://$DOMAIN"
echo "PM2: pm2 status"
echo "Logs: pm2 logs tebakbola"