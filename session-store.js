const { Store } = require('express-session');

class SqliteSessionStore extends Store {
  constructor(db) {
    super();
    this.db = db;

    db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        sid TEXT PRIMARY KEY,
        sess TEXT NOT NULL,
        expired INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_expired ON sessions(expired);
    `);

    this.getStmt = db.prepare('SELECT sess FROM sessions WHERE sid = ? AND expired > ?');
    this.setStmt = db.prepare(
      'INSERT OR REPLACE INTO sessions (sid, sess, expired) VALUES (?, ?, ?)'
    );
    this.destroyStmt = db.prepare('DELETE FROM sessions WHERE sid = ?');
    this.touchStmt = db.prepare('UPDATE sessions SET expired = ? WHERE sid = ?');
    this.pruneStmt = db.prepare('DELETE FROM sessions WHERE expired <= ?');
  }

  prune() {
    this.pruneStmt.run(Date.now());
  }

  get(sid, cb) {
    try {
      const row = this.getStmt.get(sid, Date.now());
      cb(null, row ? JSON.parse(row.sess) : null);
    } catch (err) {
      cb(err);
    }
  }

  set(sid, sess, cb) {
    try {
      const maxAge = sess.cookie?.maxAge ?? 24 * 60 * 60 * 1000;
      this.setStmt.run(sid, JSON.stringify(sess), Date.now() + maxAge);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  destroy(sid, cb) {
    try {
      this.destroyStmt.run(sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }

  touch(sid, sess, cb) {
    try {
      const maxAge = sess.cookie?.maxAge ?? 24 * 60 * 60 * 1000;
      this.touchStmt.run(Date.now() + maxAge, sid);
      cb(null);
    } catch (err) {
      cb(err);
    }
  }
}

module.exports = SqliteSessionStore;