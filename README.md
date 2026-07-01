# TebakBola

Aplikasi web prediksi pertandingan sepak bola berbasis koin virtual.

**Production:** https://hasbie.xyz

## Stack

- Node.js + Express + EJS
- SQLite (`better-sqlite3`)
- PM2 + Nginx + Let's Encrypt

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

## Deploy VPS — hasbie.xyz

| Item | Nilai |
|------|-------|
| IPv4 | `202.155.18.36` |
| Domain | `hasbie.xyz` |
| Repo | `https://github.com/ryanhasbie/forbiddendoor.git` |
| Path app | `/var/www/forbiddendoor` |

DNS `hasbie.xyz` dan `www.hasbie.xyz` harus A record ke `202.155.18.36`.

### 1. Setup awal (sekali, di VPS)

```bash
ssh root@202.155.18.36

apt-get update && apt-get install -y git
git clone https://github.com/ryanhasbie/forbiddendoor.git /var/www/forbiddendoor
cd /var/www/forbiddendoor
DOMAIN=hasbie.xyz CERTBOT_EMAIL=ryanhasbie7@gmail.com bash deploy/setup-vps.sh
```

### 2. Buat akun admin

```bash
cd /var/www/forbiddendoor
node create-admin.js admin PasswordKuat123
```

### 3. Edit .env (jika perlu)

```bash
nano /var/www/forbiddendoor/.env
```

Pastikan `NODE_ENV=production` dan `SOCIABUZZ_URL` sudah benar.

```bash
pm2 reload deploy/ecosystem.config.cjs --env production
```

### 4. Update app

```bash
cd /var/www/forbiddendoor
bash deploy/deploy.sh
```

### Perintah berguna

| Perintah | Fungsi |
|----------|--------|
| `pm2 status` | Cek status app |
| `pm2 logs tebakbola` | Lihat log |
| `bash deploy/backup-db.sh` | Backup database |
| `nginx -t && systemctl reload nginx` | Reload Nginx |

Backup otomatis: setiap hari jam 03:00 → folder `backups/`

---

## Scripts npm

- `npm start` — development
- `npm run create-admin -- <user> <pass>` — buat admin
- `npm run pm2:start` — start PM2 production
- `npm run pm2:reload` — reload PM2