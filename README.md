# TebakBola

Aplikasi web prediksi pertandingan sepak bola berbasis koin virtual.

## Stack

- Node.js + Express + EJS
- SQLite (`better-sqlite3`)

## Setup lokal

```bash
npm install
cp .env.example .env
npm run create-admin
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

## Scripts

- `npm start` — jalankan server
- `npm run create-admin` — buat akun admin

## Default admin

Jalankan `npm run create-admin`, lalu login dengan kredensial yang dibuat.