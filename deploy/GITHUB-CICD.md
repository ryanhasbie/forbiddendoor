# CI/CD GitHub Actions → hasbie.xyz

Setiap **push ke branch `main`**:
1. **CI** — install deps + syntax check
2. **CD** — SSH ke VPS → `git pull` → `npm ci` → `pm2 reload`

Pull request hanya menjalankan CI (tanpa deploy).

---

## 1. Buat SSH key untuk GitHub Actions

Di komputer lokal (PowerShell / terminal):

```bash
ssh-keygen -t ed25519 -C "github-actions-hasbie" -f github_deploy_key -N ""
```

Hasil:
- `github_deploy_key` → private key (untuk GitHub Secret)
- `github_deploy_key.pub` → public key (untuk VPS)

---

## 2. Pasang public key di VPS

```bash
ssh root@202.155.18.36

mkdir -p ~/.ssh
chmod 700 ~/.ssh
nano ~/.ssh/authorized_keys
# Paste isi github_deploy_key.pub di baris baru
chmod 600 ~/.ssh/authorized_keys
```

Tes dari lokal:

```bash
ssh -i github_deploy_key root@202.155.18.36 "echo OK"
```

---

## 3. Tambah Secrets di GitHub

Buka: **https://github.com/ryanhasbie/forbiddendoor/settings/secrets/actions**

Klik **New repository secret** untuk masing-masing:

| Secret | Nilai |
|--------|-------|
| `VPS_HOST` | `202.155.18.36` |
| `VPS_USER` | `root` (atau user deploy Anda) |
| `VPS_SSH_KEY` | Isi **seluruh** file `github_deploy_key` (private key) |
| `VPS_PORT` | `22` (opsional) |

---

## 4. (Opsional) Environment `production`

Buka: **Settings → Environments → New environment** → nama: `production`

Bisa tambah protection rule (mis. require approval sebelum deploy).

Workflow sudah memakai `environment: production`.

---

## 5. Jalankan

```bash
git add .
git commit -m "update fitur"
git push origin main
```

Cek progress: **https://github.com/ryanhasbie/forbiddendoor/actions**

---

## Deploy manual dari GitHub

**Actions** → **CI/CD** → **Run workflow** → **Run workflow**

---

## Troubleshooting

| Error | Solusi |
|-------|--------|
| `Permission denied (publickey)` | Cek `VPS_SSH_KEY` dan `authorized_keys` di VPS |
| `git pull` gagal di VPS | Pastikan `/var/www/forbiddendoor` adalah git repo |
| `pm2: command not found` | Jalankan `npm i -g pm2` di VPS |
| App tidak jalan | `pm2 logs tebakbola` di VPS |

Setelah setup secret, **hapus** file `github_deploy_key` dari komputer lokal jika tidak dipakai lagi.