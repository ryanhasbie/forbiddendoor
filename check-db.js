const db = require('./db');

console.log('=== TABEL ===');
console.log(
  db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()
);

console.log('\n=== MATCHES ===');
console.log(
  db.prepare('SELECT id, team_a, team_b, status FROM matches').all()
);

console.log('\n=== USERS ===');
console.log(
  db.prepare('SELECT id, username FROM users').all()
);

console.log('\n=== WALLETS ===');
console.log(
  db.prepare('SELECT user_id, coins FROM wallets').all()
);

console.log('\n=== TOPUP REQUESTS ===');
console.log(
  db.prepare('SELECT id, user_id, amount_label, coins, status, note FROM topup_requests').all()
);

console.log('\n=== REDEEM REQUESTS ===');
console.log(
  db.prepare(
    'SELECT id, user_id, username_snapshot, coins, amount_label, payment_method, account_number, account_name, status FROM redeem_requests'
  ).all()
);