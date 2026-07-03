const db = require('./connection');

// Buat semua tabel
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS wallets (
    user_id INTEGER PRIMARY KEY,
    coins INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS matches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    team_a TEXT NOT NULL,
    team_b TEXT NOT NULL,
    kickoff TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'open',
    result TEXT,
    odds_home REAL NOT NULL,
    odds_draw REAL NOT NULL,
    odds_away REAL NOT NULL
  );

  CREATE TABLE IF NOT EXISTS bets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    match_id INTEGER NOT NULL,
    choice TEXT NOT NULL,
    coins INTEGER NOT NULL,
    odds REAL NOT NULL,
    payout INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (match_id) REFERENCES matches(id)
  );

  CREATE TABLE IF NOT EXISTS transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    type TEXT NOT NULL,
    amount INTEGER NOT NULL,
    note TEXT,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS topup_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    package TEXT NOT NULL,
    coins INTEGER NOT NULL,
    amount_label TEXT NOT NULL,
    note TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS coin_packages (
    id TEXT NOT NULL,
    type TEXT NOT NULL,
    label TEXT NOT NULL,
    coins INTEGER NOT NULL,
    amount_idr INTEGER NOT NULL,
    sort_order INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (id, type)
  );

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS redeem_requests (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    package TEXT NOT NULL,
    coins INTEGER NOT NULL,
    amount_idr INTEGER NOT NULL,
    amount_label TEXT NOT NULL,
    payment_method TEXT NOT NULL,
    account_number TEXT NOT NULL,
    account_name TEXT NOT NULL,
    username_snapshot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP,
    processed_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE UNIQUE INDEX IF NOT EXISTS idx_bets_user_match ON bets(user_id, match_id);
`);

// Pastikan kolom role ada
const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some((col) => col.name === 'role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}

// Seed coin packages
const packageCount = db.prepare('SELECT COUNT(*) as count FROM coin_packages').get();
if (packageCount.count === 0) {
  const insertPkg = db.prepare(
    'INSERT INTO coin_packages (id, type, label, coins, amount_idr, sort_order) VALUES (?, ?, ?, ?, ?, ?)'
  );
  insertPkg.run('small', 'buy', 'Rp10.000', 100, 10000, 1);
  insertPkg.run('medium', 'buy', 'Rp50.000', 550, 50000, 2);
  insertPkg.run('large', 'buy', 'Rp100.000', 1200, 100000, 3);
  insertPkg.run('small', 'redeem', 'Rp10.000', 120, 10000, 1);
  insertPkg.run('medium', 'redeem', 'Rp50.000', 650, 50000, 2);
  insertPkg.run('large', 'redeem', 'Rp100.000', 1400, 100000, 3);
}

// Default settings
const defaultSettings = [
  ['register_bonus', '30'],
  ['min_bet', '10'],
  ['max_users', '10'],
  ['app_timezone', 'Asia/Jakarta'],
];
const insertSetting = db.prepare(
  'INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)'
);
for (const [key, value] of defaultSettings) {
  insertSetting.run(key, value);
}

// Backfill transaksi (hanya sekali)
const txBackfill = db.prepare("SELECT value FROM settings WHERE key = 'tx_backfill_v1'").get();
if (!txBackfill) {
  const insertTx = db.prepare(
    'INSERT INTO transactions (user_id, type, amount, note, created_at) VALUES (?, ?, ?, ?, ?)'
  );
  const registerBonus = parseInt(
    db.prepare("SELECT value FROM settings WHERE key = 'register_bonus'").get()?.value || '30',
    10
  );

  const usersWithoutBonus = db
    .prepare(
      `SELECT u.id, u.created_at FROM users u
       WHERE NOT EXISTS (
         SELECT 1 FROM transactions t WHERE t.user_id = u.id AND t.type = 'bonus'
       )`
    )
    .all();
  for (const user of usersWithoutBonus) {
    insertTx.run(user.id, 'bonus', registerBonus, 'Bonus daftar', user.created_at);
  }

  const approvedTopups = db
    .prepare(
      `SELECT * FROM topup_requests WHERE status = 'approved'
       AND NOT EXISTS (
         SELECT 1 FROM transactions t
         WHERE t.user_id = topup_requests.user_id AND t.type = 'topup'
         AND t.amount = topup_requests.coins
       )`
    )
    .all();
  for (const req of approvedTopups) {
    insertTx.run(
      req.user_id,
      'topup',
      req.coins,
      `Top up ${req.amount_label} via Sociabuzz (manual)`,
      req.processed_at || req.created_at
    );
  }

  const bets = db
    .prepare(
      `SELECT b.id, b.user_id, b.match_id, b.coins, b.status, b.payout, b.created_at,
              m.team_a, m.team_b
       FROM bets b
       JOIN matches m ON m.id = b.match_id
       WHERE NOT EXISTS (
         SELECT 1 FROM transactions t
         WHERE t.user_id = b.user_id AND t.type = 'bet' AND t.amount = -b.coins
         AND (
           t.note LIKE '%' || m.team_a || '%'
           OR t.note LIKE '%match #' || b.match_id || '%'
         )
       )`
    )
    .all();
  for (const bet of bets) {
    insertTx.run(
      bet.user_id,
      'bet',
      -bet.coins,
      `Tebakan ${bet.team_a} vs ${bet.team_b}`,
      bet.created_at
    );
    if (bet.status === 'won' && bet.payout > 0) {
      insertTx.run(
        bet.user_id,
        'win',
        bet.payout,
        `Menang ${bet.team_a} vs ${bet.team_b}`,
        bet.created_at
      );
    }
  }

  const redeemHolds = db
    .prepare(
      `SELECT * FROM redeem_requests
       WHERE status IN ('pending', 'approved', 'rejected')
       AND NOT EXISTS (
         SELECT 1 FROM transactions t
         WHERE t.user_id = redeem_requests.user_id AND t.type = 'redeem_hold'
         AND t.amount = -redeem_requests.coins
       )`
    )
    .all();
  for (const req of redeemHolds) {
    insertTx.run(
      req.user_id,
      'redeem_hold',
      -req.coins,
      `Redeem ${req.amount_label} - menunggu approval`,
      req.created_at
    );
    if (req.status === 'approved') {
      insertTx.run(
        req.user_id,
        'redeem',
        0,
        `Redeem ${req.amount_label} disetujui - transfer manual`,
        req.processed_at || req.created_at
      );
    } else if (req.status === 'rejected') {
      insertTx.run(
        req.user_id,
        'redeem_refund',
        req.coins,
        `Redeem ${req.amount_label} ditolak - koin dikembalikan`,
        req.processed_at || req.created_at
      );
    }
  }

  db.prepare("INSERT INTO settings (key, value) VALUES ('tx_backfill_v1', '1')").run();
}

// Seed match awal jika belum ada
const matchCount = db.prepare('SELECT COUNT(*) as count FROM matches').get();
if (matchCount.count === 0) {
  const insertMatch = db.prepare(`
    INSERT INTO matches (team_a, team_b, kickoff, odds_home, odds_draw, odds_away)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  insertMatch.run('Brazil', 'Argentina', '2026-07-05 02:00', 2.0, 3.0, 2.5);
  insertMatch.run('Jerman', 'Spanyol', '2026-07-06 23:00', 2.2, 3.1, 2.8);
  insertMatch.run('Prancis', 'Inggris', '2026-07-08 02:00', 2.1, 3.0, 2.6);
}

function initSchema() {
  // Schema sudah dijalankan saat require
  // Fungsi ini bisa dipakai untuk future init tambahan
}

module.exports = { initSchema };