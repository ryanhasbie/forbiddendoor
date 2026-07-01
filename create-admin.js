const bcrypt = require('bcryptjs');
const db = require('./db');

const username = process.argv[2];
const password = process.argv[3];

if (!username || !password) {
  console.log('Usage: node create-admin.js <username> <password>');
  console.log('Contoh: node create-admin.js admin password123');
  process.exit(1);
}

const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());

if (existing) {
  db.prepare("UPDATE users SET role = 'admin' WHERE id = ?").run(existing.id);
  console.log(`User "${username}" sekarang admin.`);
  process.exit(0);
}

const hashed = bcrypt.hashSync(password, 10);
const result = db
  .prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'admin')")
  .run(username.trim(), hashed);
db.prepare('INSERT INTO wallets (user_id, coins) VALUES (?, 0)').run(result.lastInsertRowid);

console.log(`Admin "${username}" berhasil dibuat.`);
console.log('Login di http://localhost:3000 dengan akun tersebut.');