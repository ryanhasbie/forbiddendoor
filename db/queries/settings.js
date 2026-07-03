const db = require('../connection');

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  const parsed = parseInt(row.value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
}

function setSetting(key, value) {
  return db.prepare(
    `INSERT INTO settings (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(key, String(value));
}

function getRegisterBonus() {
  return getSetting('register_bonus', 30);
}

function getMinBet() {
  return getSetting('min_bet', 10);
}

function getMaxUsers() {
  return getSetting('max_users', 10);
}

function getAppTimezone() {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('app_timezone');
  const tz = row?.value || 'Asia/Jakarta';
  return tz; // validation happens in server.js for now
}

module.exports = {
  getSetting,
  setSetting,
  getRegisterBonus,
  getMinBet,
  getMaxUsers,
  getAppTimezone,
};