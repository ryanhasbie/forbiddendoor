# TebakBola

Aplikasi web prediksi pertandingan sepak bola berbasis koin virtual.

## Stack

- Node.js + Express + EJS
- SQLite (`better-sqlite3`)
- PM2 + Nginx + Let's Encrypt (production)

## Setup lokal

```bash
npm install
cp .env.example .env
npm run create-admin -- admin password123
npm start
```

Buka http://localhost:3000

## Environment

| Variabel | Keterangan |
|----------|------------|
| `PORT` | Port server (default 3000) |
| `SESSION_SECRET` | Secret session (wajib di production) |
| `NODE_ENV` | `production` untuk deploy |
| `SOCIABUZZ_URL` | Link top-up Sociabuzz |

---

## Deploy VPS (Ubuntu/Debian)

### Prasyarat

- VPS Ubuntu 22.04+ / Debian 12+
- Domain mengarah ke IP VPS (A record)
- Port 80 & 443 terbuka

### 1. Setup awal (sekali)

SSH ke VPS, lalu jalankan:

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/ryanhasbie/forbiddendoor.git /var/www/forbiddendoor
cd /var/www/forbiddendoor
sudo DOMAIN=forbiddendoor.com CERTBOT_EMAIL=email@anda.com bash deploy/setup-vps.sh
```

Ganti:
- `forbiddendoor.com` → domain Anda
- `email@anda.com` → email untuk SSL Let's Encrypt

### 2. Buat akun admin

```bash
cd /var/www/forbiddendoor
node create-admin.js admin PasswordKuat123
```

### 3. Edit konfigurasi

```bash
nano /var/www/forbiddendoor/.env
```

Pastikan:
```
NODE_ENV=production
SESSION_SECRET=<sudah di-generate otomatis>
SOCIABUZZ_URL=https://sociabuzz.com/...
```

Reload app:
```bash
pm2 reload deploy/ecosystem.config.cjs --env production
```

### 4. Update app (setelah ada perubahan di GitHub)

```bash
cd /var/www/forbiddendoor
bash deploy/deploy.sh
```

### Perintah berguna

| Perintah | Fungsi |
|----------|--------|
| `pm2 status` | Cek status app |
| `pm2 logs tebakbola` | Lihat log |
| `pm2 restart tebakbola` | Restart app |
| `bash deploy/backup-db.sh` | Backup database manual |
| `sudo nginx -t && sudo systemctl reload nginx` | Reload Nginx |

### Backup otomatis

Setup script mengaktifkan cron backup `data.db` setiap hari jam 03:00 ke folder `backups/` (simpan 14 file terakhir).

---

## Scripts npm

- `npm start` — jalankan server (development)
- `npm run create-admin -- <user> <pass>` — buat akun admin
- `npm run pm2:start` — start via PM2 (production)
- `npm run pm2:reload` — reload PM2