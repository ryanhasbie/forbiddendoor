const Database = require('better-sqlite3');
const path = require('path');

const db = new Database(path.join(__dirname, '..', 'data.db'));

// Kurangi beban disk I/O (WAL = tulis lebih ringan untuk SQLite)
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');
db.pragma('temp_store = MEMORY');
db.pragma('mmap_size = 67108864');  // 64MB cukup untuk 1-10 user, hemat memory

module.exports = db;