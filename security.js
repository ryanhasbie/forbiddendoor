const crypto = require('crypto');

const CSRF_FIELD = '_csrf';
const MIN_PASSWORD_LENGTH = 6;
const MAX_PASSWORD_LENGTH = 128;
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const REGISTER_MAX_ATTEMPTS = 3;
const REGISTER_WINDOW_MS = 60 * 60 * 1000;

function initSecurityTables(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS rate_limits (
      key TEXT PRIMARY KEY,
      count INTEGER NOT NULL DEFAULT 0,
      reset_at INTEGER NOT NULL
    );
  `);
}

function ensureCsrfToken(req) {
  if (!req.session.csrfToken) {
    req.session.csrfToken = crypto.randomBytes(32).toString('hex');
  }
  return req.session.csrfToken;
}

function validateCsrf(req) {
  const sessionToken = req.session?.csrfToken;
  const bodyToken = req.body?.[CSRF_FIELD];
  if (!sessionToken || !bodyToken) return false;
  try {
    return crypto.timingSafeEqual(
      Buffer.from(String(sessionToken)),
      Buffer.from(String(bodyToken))
    );
  } catch {
    return false;
  }
}

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (forwarded) {
    return String(forwarded).split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown';
}

function getRateLimitStatus(db, key, maxAttempts) {
  const now = Date.now();
  const row = db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').get(key);
  if (!row || now > row.reset_at) {
    return { limited: false, retryAfterMs: 0 };
  }
  if (row.count >= maxAttempts) {
    return { limited: true, retryAfterMs: row.reset_at - now };
  }
  return { limited: false, retryAfterMs: 0 };
}

function recordRateLimitFailure(db, key, windowMs) {
  const now = Date.now();
  const row = db.prepare('SELECT count, reset_at FROM rate_limits WHERE key = ?').get(key);
  if (!row || now > row.reset_at) {
    db.prepare('INSERT OR REPLACE INTO rate_limits (key, count, reset_at) VALUES (?, 1, ?)').run(
      key,
      now + windowMs
    );
    return;
  }
  db.prepare('UPDATE rate_limits SET count = count + 1 WHERE key = ?').run(key);
}

function clearRateLimit(db, key) {
  db.prepare('DELETE FROM rate_limits WHERE key = ?').run(key);
}

function formatRetryMinutes(retryAfterMs) {
  return Math.max(1, Math.ceil(retryAfterMs / 60000));
}

function checkLoginRateLimit(db, req) {
  const key = `login:${getClientIp(req)}`;
  return getRateLimitStatus(db, key, LOGIN_MAX_ATTEMPTS);
}

function recordLoginFailure(db, req) {
  recordRateLimitFailure(db, `login:${getClientIp(req)}`, LOGIN_WINDOW_MS);
}

function clearLoginRateLimit(db, req) {
  clearRateLimit(db, `login:${getClientIp(req)}`);
}

function checkRegisterRateLimit(db, req) {
  const key = `register:${getClientIp(req)}`;
  return getRateLimitStatus(db, key, REGISTER_MAX_ATTEMPTS);
}

function recordRegisterFailure(db, req) {
  recordRateLimitFailure(db, `register:${getClientIp(req)}`, REGISTER_WINDOW_MS);
}

function clearRegisterRateLimit(db, req) {
  clearRateLimit(db, `register:${getClientIp(req)}`);
}

function validateUsername(username) {
  const value = String(username || '').trim();
  if (!value) return 'Username wajib diisi';
  if (value.length < 3) return 'Username minimal 3 karakter';
  if (value.length > 32) return 'Username maksimal 32 karakter';
  if (!/^[a-zA-Z0-9_]+$/.test(value)) {
    return 'Username hanya boleh huruf, angka, dan underscore';
  }
  return null;
}

function validatePassword(password) {
  const value = String(password || '');
  if (!value) return 'Password wajib diisi';
  if (value.length < MIN_PASSWORD_LENGTH) {
    return `Password minimal ${MIN_PASSWORD_LENGTH} karakter`;
  }
  if (value.length > MAX_PASSWORD_LENGTH) {
    return `Password maksimal ${MAX_PASSWORD_LENGTH} karakter`;
  }
  return null;
}

module.exports = {
  CSRF_FIELD,
  MIN_PASSWORD_LENGTH,
  LOGIN_MAX_ATTEMPTS,
  LOGIN_WINDOW_MS,
  REGISTER_MAX_ATTEMPTS,
  REGISTER_WINDOW_MS,
  initSecurityTables,
  ensureCsrfToken,
  validateCsrf,
  getClientIp,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginRateLimit,
  checkRegisterRateLimit,
  recordRegisterFailure,
  clearRegisterRateLimit,
  formatRetryMinutes,
  validateUsername,
  validatePassword,
};