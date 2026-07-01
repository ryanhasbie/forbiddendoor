const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, 'data.db'));

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

const userColumns = db.prepare('PRAGMA table_info(users)').all();
if (!userColumns.some((col) => col.name === 'role')) {
  db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user'");
}

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

module.exports = db;