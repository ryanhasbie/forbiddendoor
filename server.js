const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const path = require('path');
const db = require('./db');
const SqliteSessionStore = require('./session-store');
const {
  initSecurityTables,
  ensureCsrfToken,
  validateCsrf,
  checkLoginRateLimit,
  recordLoginFailure,
  clearLoginRateLimit,
  checkRegisterRateLimit,
  recordRegisterFailure,
  clearRegisterRateLimit,
  formatRetryMinutes,
  validateUsername,
  validatePassword,
} = require('./security');
const {
  TZ_OPTIONS,
  isValidTimezone,
  getTimezoneMeta,
  wallClockToUtc,
  formatKickoff,
  formatTimestamp,
} = require('./timezone');
const {
  ensureGuestRoutes,
  rotateSessionRoutes,
  ensureAuthRoutes,
  syncRouteLocals,
  resolveRouteKey,
  pullFlash,
  redirectFlash,
} = require('./routes');

const app = express();
app.locals.timezoneOptions = TZ_OPTIONS;
const PORT = process.env.PORT || 3000;
const SOCIABUZZ_URL =
  process.env.SOCIABUZZ_URL || 'https://sociabuzz.com/sophiacalista/tribe';
const BET_LOCK_MINUTES = 5;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

initSecurityTables(db);
const sessionStore = new SqliteSessionStore(db);
sessionStore.prune();
setInterval(() => sessionStore.prune(), 60 * 60 * 1000);

if (IS_PRODUCTION) {
  app.set('trust proxy', 1);
}

app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'hasbie-dev-secret',
    store: sessionStore,
    resave: false,
    saveUninitialized: false,
    cookie: {
      maxAge: 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: 'lax',
      secure: IS_PRODUCTION,
    },
  })
);

app.use((req, res, next) => {
  syncRouteLocals(req, res);
  syncTimezoneLocals(req, res);
  ensureCsrfToken(req);
  res.locals.csrfToken = req.session.csrfToken;
  next();
});

const LEGACY_PATHS = {
  '/dashboard': 'dashboard',
  '/admin': 'admin',
  '/register': 'register',
  '/leaderboard': 'leaderboard',
  '/syarat-ketentuan': 'terms',
  '/u7m3q': 'dashboard',
  '/a4n8r': 'admin',
  '/x9k2p': 'register',
};

function denyAdmin(req, res) {
  return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
    error: 'Akses admin ditolak',
  });
}

function getWallet(userId) {
  return db.prepare('SELECT coins FROM wallets WHERE user_id = ?').get(userId);
}

function addTransaction(userId, type, amount, note) {
  db.prepare(
    'INSERT INTO transactions (user_id, type, amount, note) VALUES (?, ?, ?, ?)'
  ).run(userId, type, amount, note);
}

function formatRp(amount) {
  return `Rp${Number(amount).toLocaleString('id-ID')}`;
}

function getPackages(type) {
  return db
    .prepare(
      'SELECT * FROM coin_packages WHERE type = ? ORDER BY sort_order ASC, amount_idr ASC'
    )
    .all(type);
}

function getPackage(id, type) {
  return db
    .prepare('SELECT * FROM coin_packages WHERE id = ? AND type = ?')
    .get(id, type);
}

function getSetting(key, fallback) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  if (!row) return fallback;
  const parsed = parseInt(row.value, 10);
  return Number.isNaN(parsed) ? fallback : parsed;
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
  return isValidTimezone(tz) ? tz : 'Asia/Jakarta';
}

function getEffectiveTimezone(req) {
  if (req.session.userTimezone && isValidTimezone(req.session.userTimezone)) {
    return req.session.userTimezone;
  }
  return getAppTimezone();
}

function getTimezoneViewData(req) {
  const appTimezone = getAppTimezone();
  const userTimezone = getEffectiveTimezone(req);

  return {
    appTimezone,
    userTimezone,
    appTzLabel: getTimezoneMeta(appTimezone).label,
    tzShort: getTimezoneMeta(userTimezone).short,
    timezoneOptions: TZ_OPTIONS,
    formatKickoff: (kickoff) => formatKickoff(kickoff, userTimezone, appTimezone),
    formatTimestamp: (timestamp) => formatTimestamp(timestamp, userTimezone),
  };
}

function syncTimezoneLocals(req, res) {
  Object.assign(res.locals, getTimezoneViewData(req));
}

function renderView(res, req, view, data = {}) {
  const tzData = getTimezoneViewData(req);
  res.render(view, {
    ...data,
    csrfToken: req.session.csrfToken,
    timezoneOptions: tzData.timezoneOptions,
    userTimezone: tzData.userTimezone,
    appTimezone: tzData.appTimezone,
    appTzLabel: tzData.appTzLabel,
    tzShort: tzData.tzShort,
    formatKickoff: tzData.formatKickoff,
    formatTimestamp: tzData.formatTimestamp,
  });
}

function rejectInvalidCsrf(req, res, routeKey) {
  ensureCsrfToken(req);
  res.locals.csrfToken = req.session.csrfToken;
  syncRouteLocals(req, res);
  syncTimezoneLocals(req, res);

  const message = 'Permintaan tidak valid. Refresh halaman lalu coba lagi.';

  if (routeKey === 'POST:login') {
    return res.render('login', { ...loginPageData('login', message), csrfToken: req.session.csrfToken });
  }
  if (routeKey === 'POST:register') {
    return res.render('login', { ...loginPageData('register', message), csrfToken: req.session.csrfToken });
  }
  if (req.session.userId && req.session.routes) {
    const returnPath =
      routeKey && routeKey.startsWith('POST:admin')
        ? req.session.routes.PATH.admin
        : req.session.routes.PATH.dashboard;
    return redirectFlash(res, req, returnPath, { error: message });
  }
  return res.redirect('/');
}

function getRegisteredUserCount() {
  return db
    .prepare("SELECT COUNT(*) as count FROM users WHERE role != 'admin'")
    .get().count;
}

function getRegistrationQuota() {
  const maxUsers = getMaxUsers();
  const userCount = getRegisteredUserCount();
  return {
    maxUsers,
    userCount,
    remaining: Math.max(0, maxUsers - userCount),
    registrationOpen: userCount < maxUsers,
  };
}

function loginPageData(mode, error = null) {
  return {
    error,
    mode,
    registerBonus: getRegisterBonus(),
    ...getRegistrationQuota(),
  };
}

function deleteUserById(userId) {
  const remove = db.transaction(() => {
    db.prepare('DELETE FROM bets WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM transactions WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM topup_requests WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM redeem_requests WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM wallets WHERE user_id = ?').run(userId);
    db.prepare('DELETE FROM users WHERE id = ?').run(userId);
  });
  remove();
}

function parseKickoff(kickoff) {
  return wallClockToUtc(kickoff, getAppTimezone());
}

function isBettingOpen(match) {
  if (match.status !== 'open') return false;
  const kickoff = parseKickoff(match.kickoff);
  if (Number.isNaN(kickoff.getTime())) return false;
  const lockTime = kickoff.getTime() - BET_LOCK_MINUTES * 60 * 1000;
  return Date.now() < lockTime;
}

function getLeaderboard(limit = 20) {
  return db
    .prepare(
      `SELECT
         u.id,
         u.username,
         COALESCE(w.coins, 0) AS coins,
         COALESCE(SUM(CASE WHEN b.status = 'won' THEN 1 ELSE 0 END), 0) AS wins,
         COALESCE(SUM(CASE WHEN b.status = 'lost' THEN 1 ELSE 0 END), 0) AS losses,
         COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.payout ELSE 0 END), 0) AS total_won
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       LEFT JOIN bets b ON b.user_id = u.id
       WHERE u.role != 'admin'
       GROUP BY u.id
       ORDER BY total_won DESC, wins DESC, coins DESC
       LIMIT ?`
    )
    .all(limit);
}

function getMyLeaderboardRank(userId) {
  const all = db
    .prepare(
      `SELECT
         u.id,
         u.username,
         COALESCE(w.coins, 0) AS coins,
         COALESCE(SUM(CASE WHEN b.status = 'won' THEN 1 ELSE 0 END), 0) AS wins,
         COALESCE(SUM(CASE WHEN b.status = 'lost' THEN 1 ELSE 0 END), 0) AS losses,
         COALESCE(SUM(CASE WHEN b.status = 'won' THEN b.payout ELSE 0 END), 0) AS total_won
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       LEFT JOIN bets b ON b.user_id = u.id
       WHERE u.role != 'admin'
       GROUP BY u.id
       ORDER BY total_won DESC, wins DESC, coins DESC`
    )
    .all();
  const index = all.findIndex((row) => row.id === userId);
  if (index < 0) return null;
  return { rank: index + 1, ...all[index] };
}

function enrichMatches(matches, userId) {
  const userBets = userId
    ? db.prepare('SELECT * FROM bets WHERE user_id = ?').all(userId)
    : [];
  const betByMatch = Object.fromEntries(userBets.map((bet) => [bet.match_id, bet]));

  return matches.map((match) => ({
    ...match,
    bettingOpen: isBettingOpen(match),
    userBet: betByMatch[match.id] || null,
  }));
}

app.use((req, res) => {
  const legacyKey = LEGACY_PATHS[req.path];
  if (legacyKey && req.method === 'GET') {
    if (req.session.routes) {
      return res.redirect(req.session.routes.PATH[legacyKey]);
    }
    if (!req.session.userId) {
      ensureGuestRoutes(req);
      return res.redirect(req.session.routes.PATH[legacyKey]);
    }
    return res.redirect('/');
  }

  if (req.method === 'GET' && req.path === '/') {
    if (req.session.userId) {
      ensureAuthRoutes(req);
      syncRouteLocals(req, res);
      return res.redirect(req.session.routes.PATH.dashboard);
    }
    ensureGuestRoutes(req);
    syncRouteLocals(req, res);
    return res.render('login', loginPageData('login'));
  }

  if (!req.session.routes) {
    if (!req.session.userId) return res.redirect('/');
    ensureAuthRoutes(req);
    syncRouteLocals(req, res);
  }

  const routeKey = resolveRouteKey(req);

  if (req.method === 'POST' && !validateCsrf(req)) {
    return rejectInvalidCsrf(req, res, routeKey);
  }

  if (routeKey === 'GET:register') {
    if (req.session.userId) {
      return res.redirect(req.session.routes.PATH.dashboard);
    }
    return res.render('login', loginPageData('register'));
  }

  if (routeKey === 'GET:leaderboard') {
    const leaders = getLeaderboard();
    const myRank =
      req.session.userId && req.session.role !== 'admin'
        ? getMyLeaderboardRank(req.session.userId)
        : null;
    return res.render('leaderboard', {
      leaders,
      myRank,
      isLoggedIn: !!req.session.userId,
      dashboardPath: req.session.routes.PATH.dashboard,
    });
  }

  if (routeKey === 'GET:terms') {
    return res.render('syarat-ketentuan', {
      isLoggedIn: !!req.session.userId,
      dashboardPath: req.session.routes.PATH.dashboard,
    });
  }

  if (routeKey === 'POST:register') {
    return handleRegisterPost(req, res);
  }
  if (routeKey === 'POST:login') {
    return handleLoginPost(req, res);
  }
  if (routeKey === 'POST:logout') {
    return req.session.destroy(() => res.redirect('/'));
  }
  if (routeKey === 'GET:dashboard') {
    if (!req.session.userId) return res.redirect('/');
    return handleDashboardGet(req, res);
  }
  if (routeKey === 'POST:topup') {
    if (!req.session.userId) return res.redirect('/');
    return handleTopupPost(req, res);
  }
  if (routeKey === 'POST:redeem') {
    if (!req.session.userId) return res.redirect('/');
    return handleRedeemPost(req, res);
  }
  if (routeKey === 'POST:bet') {
    if (!req.session.userId) return res.redirect('/');
    return handleBetPost(req, res);
  }
  if (routeKey === 'POST:timezone') {
    if (!req.session.userId) return res.redirect('/');
    return handleTimezonePost(req, res);
  }
  if (routeKey === 'GET:admin') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminGet(req, res);
  }
  if (routeKey === 'POST:adminBonus') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminBonusPost(req, res);
  }
  if (routeKey === 'POST:adminMinBet') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminMinBetPost(req, res);
  }
  if (routeKey === 'POST:adminTimezone') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminTimezonePost(req, res);
  }
  if (routeKey === 'POST:adminMaxUsers') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminMaxUsersPost(req, res);
  }
  if (routeKey === 'POST:adminUserDel') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminUserDelPost(req, res);
  }
  if (routeKey === 'POST:adminAccount') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminAccountPost(req, res);
  }
  if (routeKey === 'POST:adminPkg') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminPkgPost(req, res);
  }
  if (routeKey === 'POST:adminMatchAdd') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminMatchAddPost(req, res);
  }
  if (routeKey === 'POST:adminMatchDel') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminMatchDelPost(req, res);
  }
  if (routeKey === 'POST:adminTopupOk') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminTopupOkPost(req, res);
  }
  if (routeKey === 'POST:adminTopupNo') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminTopupNoPost(req, res);
  }
  if (routeKey === 'POST:adminTopupDel') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminTopupDelPost(req, res);
  }
  if (routeKey === 'POST:adminRedeemOk') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminRedeemOkPost(req, res);
  }
  if (routeKey === 'POST:adminRedeemNo') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminRedeemNoPost(req, res);
  }
  if (routeKey === 'POST:adminRedeemDel') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminRedeemDelPost(req, res);
  }
  if (routeKey === 'POST:adminBetDel') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminBetDelPost(req, res);
  }
  if (routeKey === 'POST:adminSettle') {
    if (!req.session.userId) return res.redirect('/');
    if (req.session.role !== 'admin') return denyAdmin(req, res);
    return handleAdminSettlePost(req, res);
  }

  if (req.session.userId) {
    return res.redirect(req.session.routes.PATH.dashboard);
  }
  return res.redirect('/');
});

function handleRegisterPost(req, res) {
  const renderRegisterError = (message) => {
    syncRouteLocals(req, res);
    syncTimezoneLocals(req, res);
    return res.render('login', {
      ...loginPageData('register', message),
      csrfToken: req.session.csrfToken,
    });
  };

  const registerLimit = checkRegisterRateLimit(db, req);
  if (registerLimit.limited) {
    return renderRegisterError(
      `Terlalu banyak percobaan daftar. Coba lagi dalam ${formatRetryMinutes(registerLimit.retryAfterMs)} menit.`
    );
  }

  const { username, password } = req.body;
  const usernameError = validateUsername(username);
  if (usernameError) {
    recordRegisterFailure(db, req);
    return renderRegisterError(usernameError);
  }

  const passwordError = validatePassword(password);
  if (passwordError) {
    recordRegisterFailure(db, req);
    return renderRegisterError(passwordError);
  }

  const quota = getRegistrationQuota();
  if (!quota.registrationOpen) {
    return renderRegisterError(
      `Kuota pendaftaran penuh (${quota.maxUsers} user). Hubungi admin.`
    );
  }

  const trimmedUsername = username.trim();
  const hashed = bcrypt.hashSync(password, 10);
  try {
    const result = db
      .prepare("INSERT INTO users (username, password, role) VALUES (?, ?, 'user')")
      .run(trimmedUsername, hashed);
    const bonus = getRegisterBonus();
    db.prepare('INSERT INTO wallets (user_id, coins) VALUES (?, ?)').run(
      result.lastInsertRowid,
      bonus
    );
    addTransaction(result.lastInsertRowid, 'bonus', bonus, 'Bonus daftar');
    clearRegisterRateLimit(db, req);
    req.session.userId = result.lastInsertRowid;
    req.session.username = trimmedUsername;
    req.session.role = 'user';
    rotateSessionRoutes(req);
    res.redirect(req.session.routes.PATH.dashboard);
  } catch {
    recordRegisterFailure(db, req);
    return renderRegisterError('Username sudah dipakai');
  }
}

function handleLoginPost(req, res) {
  const renderLoginError = (message) => {
    syncRouteLocals(req, res);
    syncTimezoneLocals(req, res);
    return res.render('login', {
      ...loginPageData('login', message),
      csrfToken: req.session.csrfToken,
    });
  };

  const loginLimit = checkLoginRateLimit(db, req);
  if (loginLimit.limited) {
    return renderLoginError(
      `Terlalu banyak percobaan login. Coba lagi dalam ${formatRetryMinutes(loginLimit.retryAfterMs)} menit.`
    );
  }

  const { username, password } = req.body;
  if (!username || !password) {
    recordLoginFailure(db, req);
    return renderLoginError('Username dan password wajib diisi');
  }

  const user = db.prepare('SELECT * FROM users WHERE username = ?').get(username.trim());

  if (!user || !bcrypt.compareSync(password, user.password)) {
    recordLoginFailure(db, req);
    return renderLoginError('Login gagal');
  }

  clearLoginRateLimit(db, req);
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role || 'user';
  rotateSessionRoutes(req);
  res.redirect(req.session.routes.PATH.dashboard);
}

function handleDashboardGet(req, res) {
  const flash = pullFlash(req);
  const wallet = getWallet(req.session.userId);
  const matches = enrichMatches(
    db.prepare("SELECT * FROM matches WHERE status = 'open' ORDER BY kickoff ASC").all(),
    req.session.userId
  );
  const bets = db
    .prepare(
      `SELECT b.*, m.team_a, m.team_b
       FROM bets b
       JOIN matches m ON m.id = b.match_id
       WHERE b.user_id = ?
       ORDER BY b.created_at DESC`
    )
    .all(req.session.userId);
  const topupRequests = db
    .prepare(
      `SELECT * FROM topup_requests
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(req.session.userId);
  const redeemRequests = db
    .prepare(
      `SELECT * FROM redeem_requests
       WHERE user_id = ?
       ORDER BY created_at DESC`
    )
    .all(req.session.userId);

  renderView(res, req, 'dashboard', {
    username: req.session.username,
    isAdmin: req.session.role === 'admin',
    coins: wallet.coins,
    matches,
    bets,
    topupRequests,
    redeemRequests,
    sociabuzzUrl: SOCIABUZZ_URL,
    buyPackages: getPackages('buy'),
    redeemPackages: getPackages('redeem'),
    betLockMinutes: BET_LOCK_MINUTES,
    minBet: getMinBet(),
    message: flash.message || null,
    error: flash.error || null,
    initialPanel: flash.panel || 'panel-beli',
  });
}

function handleTimezonePost(req, res) {
  const tz = req.body.timezone;
  const returnPath =
    req.body.return_to === 'admin'
      ? req.session.routes.PATH.admin
      : req.session.routes.PATH.dashboard;

  if (!isValidTimezone(tz)) {
    return redirectFlash(res, req, returnPath, {
      error: 'Zona waktu tidak valid',
    });
  }

  req.session.userTimezone = tz;
  redirectFlash(res, req, returnPath, {
    message: `Zona waktu ditampilkan: ${getTimezoneMeta(tz).label}`,
  });
}

function handleTopupPost(req, res) {
  const packageId = req.body.package;
  const note = (req.body.note || '').trim();
  const selected = getPackage(packageId, 'buy');

  if (!selected) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, { error: 'Paket tidak valid' });
  }
  if (!note) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
      error: 'Isi catatan pembayaran (nama Sociabuzz / nominal / bukti)',
    });
  }

  db.prepare(
    `INSERT INTO topup_requests (user_id, package, coins, amount_label, note)
     VALUES (?, ?, ?, ?, ?)`
  ).run(req.session.userId, packageId, selected.coins, selected.label, note);

  redirectFlash(res, req, req.session.routes.PATH.dashboard, {
    message: 'Permintaan top-up dikirim. Tunggu admin konfirmasi.',
    panel: 'panel-beli',
  });
}

function handleRedeemPost(req, res) {
  const packageId = req.body.package;
  const paymentMethod = (req.body.payment_method || '').trim();
  const accountNumber = (req.body.account_number || '').trim();
  const accountName = (req.body.account_name || '').trim();
  const selected = getPackage(packageId, 'redeem');

  if (!selected) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
      error: 'Paket redeem tidak valid',
      panel: 'panel-redeem',
    });
  }

  const wallet = getWallet(req.session.userId);
  if (!wallet || wallet.coins < selected.coins) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
      error: `Koin tidak cukup. Saldo ${wallet?.coins ?? 0} koin, butuh ${selected.coins} koin.`,
      panel: 'panel-redeem',
    });
  }

  const pending = db
    .prepare("SELECT id FROM redeem_requests WHERE user_id = ? AND status = 'pending'")
    .get(req.session.userId);
  if (pending) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
      error: 'Anda masih punya permintaan redeem yang menunggu',
      panel: 'panel-redeem',
    });
  }

  if (!paymentMethod || !accountNumber || !accountName) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
      error: 'Lengkapi metode pembayaran, nomor akun, dan atas nama',
      panel: 'panel-redeem',
    });
  }

  const submit = db.transaction(() => {
    const deducted = db
      .prepare('UPDATE wallets SET coins = coins - ? WHERE user_id = ? AND coins >= ?')
      .run(selected.coins, req.session.userId, selected.coins);
    if (!deducted.changes) throw new Error('INSUFFICIENT_COINS');

    db.prepare(
      `INSERT INTO redeem_requests
       (user_id, package, coins, amount_idr, amount_label, payment_method, account_number, account_name, username_snapshot)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      req.session.userId,
      packageId,
      selected.coins,
      selected.amount_idr,
      selected.label,
      paymentMethod,
      accountNumber,
      accountName,
      req.session.username
    );
    addTransaction(
      req.session.userId,
      'redeem_hold',
      -selected.coins,
      `Redeem ${selected.label} - menunggu approval`
    );
  });

  try {
    submit();
  } catch (err) {
    if (err.message === 'INSUFFICIENT_COINS') {
      return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
        error: `Koin tidak cukup. Saldo Anda kurang dari ${selected.coins} koin.`,
        panel: 'panel-redeem',
      });
    }
    throw err;
  }

  redirectFlash(res, req, req.session.routes.PATH.dashboard, {
    message: 'Permintaan redeem dikirim. Koin dikunci menunggu konfirmasi admin.',
    panel: 'panel-redeem',
  });
}

function handleBetPost(req, res) {
  const { match_id, choice, coins } = req.body;
  const stake = parseInt(coins, 10);
  const match = db.prepare('SELECT * FROM matches WHERE id = ? AND status = ?').get(match_id, 'open');
  const wallet = getWallet(req.session.userId);

  if (!match) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, { error: 'Pertandingan tidak tersedia' });
  }
  if (!isBettingOpen(match)) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
      error: `Tebakan ditutup ${BET_LOCK_MINUTES} menit sebelum kick-off`,
      panel: 'panel-tebakan',
    });
  }

  const existingBet = db
    .prepare('SELECT id FROM bets WHERE user_id = ? AND match_id = ?')
    .get(req.session.userId, match.id);
  if (existingBet) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
      error: 'Anda sudah pasang tebakan di pertandingan ini. Tebakan terkunci dan tidak bisa diubah.',
      panel: 'panel-tebakan',
    });
  }

  if (!['home', 'draw', 'away'].includes(choice)) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
      error: 'Pilihan tidak valid',
      panel: 'panel-tebakan',
    });
  }
  const minBet = getMinBet();
  if (!stake || stake < minBet) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
      error: `Minimal taruhan ${minBet} koin`,
      panel: 'panel-tebakan',
    });
  }
  if (wallet.coins < stake) {
    return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
      error: 'Koin tidak cukup',
      panel: 'panel-tebakan',
    });
  }

  const oddsMap = { home: match.odds_home, draw: match.odds_draw, away: match.odds_away };
  const odds = oddsMap[choice];

  const placeBet = db.transaction(() => {
    const duplicate = db
      .prepare('SELECT id FROM bets WHERE user_id = ? AND match_id = ?')
      .get(req.session.userId, match.id);
    if (duplicate) throw new Error('ALREADY_BET');

    db.prepare('UPDATE wallets SET coins = coins - ? WHERE user_id = ?').run(
      stake,
      req.session.userId
    );
    db.prepare(
      'INSERT INTO bets (user_id, match_id, choice, coins, odds) VALUES (?, ?, ?, ?, ?)'
    ).run(req.session.userId, match.id, choice, stake, odds);
    addTransaction(req.session.userId, 'bet', -stake, `Tebakan match #${match.id}`);
  });

  try {
    placeBet();
  } catch (err) {
    if (err.message === 'ALREADY_BET' || err.code === 'SQLITE_CONSTRAINT_UNIQUE') {
      return redirectFlash(res, req, req.session.routes.PATH.dashboard, {
        error: 'Anda sudah pasang tebakan di pertandingan ini. Tebakan terkunci dan tidak bisa diubah.',
        panel: 'panel-tebakan',
      });
    }
    throw err;
  }

  redirectFlash(res, req, req.session.routes.PATH.dashboard, {
    message: 'Tebakan berhasil dipasang dan dikunci. Tidak bisa diubah lagi.',
    panel: 'panel-tebakan',
  });
}

function handleAdminGet(req, res) {
  const flash = pullFlash(req);
  const matches = db.prepare('SELECT * FROM matches ORDER BY kickoff ASC').all();
  const topupRequests = db
    .prepare(
      `SELECT t.*, u.username
       FROM topup_requests t
       JOIN users u ON u.id = t.user_id
       ORDER BY
         CASE t.status WHEN 'pending' THEN 0 ELSE 1 END,
         t.created_at DESC`
    )
    .all();
  const redeemRequests = db
    .prepare(
      `SELECT r.*, u.username
       FROM redeem_requests r
       JOIN users u ON u.id = r.user_id
       ORDER BY
         CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
         r.created_at DESC`
    )
    .all();
  const allBets = db
    .prepare(
      `SELECT b.*, u.username, m.team_a, m.team_b
       FROM bets b
       JOIN users u ON u.id = b.user_id
       JOIN matches m ON m.id = b.match_id
       ORDER BY b.created_at DESC`
    )
    .all();

  const pendingTopup = topupRequests.filter((r) => r.status === 'pending').length;
  const pendingRedeem = redeemRequests.filter((r) => r.status === 'pending').length;
  const openMatches = matches.filter((m) => m.status === 'open').length;
  const adminUser = db
    .prepare('SELECT username FROM users WHERE id = ?')
    .get(req.session.userId);
  const username = req.session.username || adminUser?.username || 'Admin';
  const users = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.created_at, COALESCE(w.coins, 0) as coins
       FROM users u
       LEFT JOIN wallets w ON w.user_id = u.id
       ORDER BY u.created_at DESC`
    )
    .all();

  renderView(res, req, 'admin', {
    matches,
    topupRequests,
    redeemRequests,
    allBets,
    buyPackages: getPackages('buy'),
    redeemPackages: getPackages('redeem'),
    registerBonus: getRegisterBonus(),
    minBet: getMinBet(),
    maxUsers: getMaxUsers(),
    userCount: getRegisteredUserCount(),
    users,
    username,
    pendingTopup,
    pendingRedeem,
    openMatches,
    message: flash.message || null,
    error: flash.error || null,
    initialPanel: flash.panel || 'panel-topup',
  });
}

function handleAdminBonusPost(req, res) {
  const bonus = parseInt(req.body.register_bonus, 10);
  if (!bonus || bonus < 0 || bonus > 10000) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Bonus daftar harus antara 0 dan 10000',
      panel: 'panel-koin',
    });
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('register_bonus', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(bonus));
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: `Bonus daftar diubah menjadi ${bonus} koin`,
    panel: 'panel-koin',
  });
}

function handleAdminMinBetPost(req, res) {
  const minBet = parseInt(req.body.min_bet, 10);
  if (!minBet || minBet < 1 || minBet > 100000) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Minimal taruhan harus antara 1 dan 100000 koin',
      panel: 'panel-koin',
    });
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('min_bet', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(minBet));
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: `Minimal taruhan diubah menjadi ${minBet} koin`,
    panel: 'panel-koin',
  });
}

function handleAdminTimezonePost(req, res) {
  const tz = req.body.app_timezone;
  if (!isValidTimezone(tz)) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Zona waktu tidak valid',
      panel: 'panel-koin',
    });
  }

  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('app_timezone', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(tz);
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: `Zona waktu aplikasi: ${getTimezoneMeta(tz).label}`,
    panel: 'panel-koin',
  });
}

function handleAdminMaxUsersPost(req, res) {
  const maxUsers = parseInt(req.body.max_users, 10);
  if (!maxUsers || maxUsers < 1 || maxUsers > 10000) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Kuota pendaftaran harus antara 1 dan 10000',
      panel: 'panel-user',
    });
  }
  db.prepare(
    `INSERT INTO settings (key, value) VALUES ('max_users', ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`
  ).run(String(maxUsers));
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: `Kuota pendaftaran diubah menjadi ${maxUsers} user`,
    panel: 'panel-user',
  });
}

function handleAdminUserDelPost(req, res) {
  const userId = parseInt(req.body.user_id, 10);
  const target = db.prepare('SELECT * FROM users WHERE id = ?').get(userId);

  if (!target) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'User tidak ditemukan',
      panel: 'panel-user',
    });
  }
  if (target.role === 'admin') {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Akun admin tidak bisa dihapus',
      panel: 'panel-user',
    });
  }
  if (target.id === req.session.userId) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Tidak bisa menghapus akun sendiri',
      panel: 'panel-user',
    });
  }

  deleteUserById(userId);
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: `User "${target.username}" berhasil dihapus`,
    panel: 'panel-user',
  });
}

function handleAdminAccountPost(req, res) {
  const currentPassword = req.body.current_password || '';
  const newUsername = (req.body.new_username || '').trim();
  const newPassword = req.body.new_password || '';
  const confirmPassword = req.body.confirm_password || '';

  const admin = db.prepare('SELECT * FROM users WHERE id = ? AND role = ?').get(
    req.session.userId,
    'admin'
  );
  if (!admin) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Akun admin tidak ditemukan',
      panel: 'panel-akun',
    });
  }

  if (!currentPassword || !bcrypt.compareSync(currentPassword, admin.password)) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Password saat ini salah',
      panel: 'panel-akun',
    });
  }

  if (!newUsername && !newPassword) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Isi username baru dan/atau password baru',
      panel: 'panel-akun',
    });
  }

  if (newUsername && newUsername.length < 3) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Username baru minimal 3 karakter',
      panel: 'panel-akun',
    });
  }

  if (newUsername && newUsername.toLowerCase() === admin.username.toLowerCase()) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Username baru sama dengan username saat ini',
      panel: 'panel-akun',
    });
  }

  if (newUsername) {
    const taken = db
      .prepare('SELECT id FROM users WHERE username = ? AND id != ?')
      .get(newUsername, admin.id);
    if (taken) {
      return redirectFlash(res, req, req.session.routes.PATH.admin, {
        error: 'Username sudah dipakai',
        panel: 'panel-akun',
      });
    }
  }

  if (newPassword) {
    if (newPassword.length < 6) {
      return redirectFlash(res, req, req.session.routes.PATH.admin, {
        error: 'Password baru minimal 6 karakter',
        panel: 'panel-akun',
      });
    }
    if (newPassword !== confirmPassword) {
      return redirectFlash(res, req, req.session.routes.PATH.admin, {
        error: 'Konfirmasi password tidak cocok',
        panel: 'panel-akun',
      });
    }
  }

  if (newUsername && newPassword) {
    const hashed = bcrypt.hashSync(newPassword, 10);
    db.prepare('UPDATE users SET username = ?, password = ? WHERE id = ?').run(
      newUsername,
      hashed,
      admin.id
    );
    req.session.username = newUsername;
    redirectFlash(res, req, req.session.routes.PATH.admin, {
      message: 'Username dan password admin berhasil diubah',
      panel: 'panel-akun',
    });
    return;
  }

  if (newUsername) {
    db.prepare('UPDATE users SET username = ? WHERE id = ?').run(newUsername, admin.id);
    req.session.username = newUsername;
    redirectFlash(res, req, req.session.routes.PATH.admin, {
      message: `Username admin diubah menjadi "${newUsername}"`,
      panel: 'panel-akun',
    });
    return;
  }

  const hashed = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password = ? WHERE id = ?').run(hashed, admin.id);
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: 'Password admin berhasil diubah',
    panel: 'panel-akun',
  });
}

function handleAdminPkgPost(req, res) {
  const { id, type, coins, amount_idr } = req.body;
  const coinsNum = parseInt(coins, 10);
  const amountNum = parseInt(amount_idr, 10);

  if (!['buy', 'redeem'].includes(type)) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Tipe paket tidak valid',
      panel: 'panel-koin',
    });
  }
  if (!coinsNum || coinsNum < 1 || !amountNum || amountNum < 1000) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Koin dan nominal harus valid',
      panel: 'panel-koin',
    });
  }

  const existing = getPackage(id, type);
  if (!existing) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Paket tidak ditemukan',
      panel: 'panel-koin',
    });
  }

  db.prepare(
    'UPDATE coin_packages SET coins = ?, amount_idr = ?, label = ? WHERE id = ? AND type = ?'
  ).run(coinsNum, amountNum, formatRp(amountNum), id, type);

  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: `Paket ${type} "${id}" berhasil diperbarui`,
    panel: 'panel-koin',
  });
}

function handleAdminMatchAddPost(req, res) {
  const teamA = (req.body.team_a || '').trim();
  const teamB = (req.body.team_b || '').trim();
  const kickoff = (req.body.kickoff || '').trim();
  const oddsHome = parseFloat(req.body.odds_home);
  const oddsDraw = parseFloat(req.body.odds_draw);
  const oddsAway = parseFloat(req.body.odds_away);

  if (!teamA || !teamB || !kickoff) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Tim dan jadwal wajib diisi',
      panel: 'panel-pertandingan',
    });
  }
  if (teamA.toLowerCase() === teamB.toLowerCase()) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Nama tim tidak boleh sama',
      panel: 'panel-pertandingan',
    });
  }
  if (!oddsHome || !oddsDraw || !oddsAway || oddsHome < 1 || oddsDraw < 1 || oddsAway < 1) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Odds harus angka minimal 1.0',
      panel: 'panel-pertandingan',
    });
  }

  db.prepare(
    `INSERT INTO matches (team_a, team_b, kickoff, odds_home, odds_draw, odds_away)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(teamA, teamB, kickoff.replace('T', ' '), oddsHome, oddsDraw, oddsAway);

  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: `Pertandingan ${teamA} vs ${teamB} ditambahkan`,
    panel: 'panel-pertandingan',
  });
}

function handleAdminMatchDelPost(req, res) {
  const matchId = parseInt(req.body.match_id, 10);
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(matchId);

  if (!match) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Pertandingan tidak ditemukan',
      panel: 'panel-pertandingan',
    });
  }
  if (match.status === 'finished') {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Pertandingan selesai tidak bisa dihapus',
      panel: 'panel-pertandingan',
    });
  }

  const betCount = db
    .prepare('SELECT COUNT(*) as count FROM bets WHERE match_id = ?')
    .get(matchId);
  if (betCount.count > 0) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Tidak bisa hapus, sudah ada tebakan',
      panel: 'panel-pertandingan',
    });
  }

  db.prepare('DELETE FROM matches WHERE id = ?').run(matchId);
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: 'Pertandingan berhasil dihapus',
    panel: 'panel-pertandingan',
  });
}

function handleAdminTopupOkPost(req, res) {
  const requestId = parseInt(req.body.request_id, 10);
  const request = db
    .prepare("SELECT * FROM topup_requests WHERE id = ? AND status = 'pending'")
    .get(requestId);

  if (!request) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      message: 'Permintaan top-up tidak valid',
      panel: 'panel-topup',
    });
  }

  const approve = db.transaction(() => {
    db.prepare(
      "UPDATE topup_requests SET status = 'approved', processed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(requestId);
    db.prepare('UPDATE wallets SET coins = coins + ? WHERE user_id = ?').run(
      request.coins,
      request.user_id
    );
    addTransaction(
      request.user_id,
      'topup',
      request.coins,
      `Top up ${request.amount_label} via Sociabuzz (manual)`
    );
  });

  approve();
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: 'Top-up disetujui, koin sudah ditambahkan',
    panel: 'panel-topup',
  });
}

function handleAdminTopupNoPost(req, res) {
  const requestId = parseInt(req.body.request_id, 10);
  const result = db
    .prepare(
      "UPDATE topup_requests SET status = 'rejected', processed_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'pending'"
    )
    .run(requestId);

  if (!result.changes) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      message: 'Permintaan top-up tidak valid',
      panel: 'panel-topup',
    });
  }

  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: 'Permintaan top-up ditolak',
    panel: 'panel-topup',
  });
}

function handleAdminTopupDelPost(req, res) {
  const requestId = parseInt(req.body.request_id, 10);
  const request = db.prepare('SELECT * FROM topup_requests WHERE id = ?').get(requestId);

  if (!request) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Riwayat top-up tidak ditemukan',
      panel: 'panel-topup',
    });
  }

  if (request.status === 'approved') {
    const wallet = getWallet(request.user_id);
    if (!wallet || wallet.coins < request.coins) {
      return redirectFlash(res, req, req.session.routes.PATH.admin, {
        error: 'Tidak bisa hapus, koin top-up sudah dipakai user',
        panel: 'panel-topup',
      });
    }
    db.prepare('UPDATE wallets SET coins = coins - ? WHERE user_id = ?').run(
      request.coins,
      request.user_id
    );
    addTransaction(
      request.user_id,
      'admin_adjust',
      -request.coins,
      `Riwayat top-up #${requestId} dihapus admin`
    );
  }

  db.prepare('DELETE FROM topup_requests WHERE id = ?').run(requestId);
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: 'Riwayat top-up berhasil dihapus',
    panel: 'panel-topup',
  });
}

function handleAdminRedeemOkPost(req, res) {
  const requestId = parseInt(req.body.request_id, 10);
  const request = db
    .prepare("SELECT * FROM redeem_requests WHERE id = ? AND status = 'pending'")
    .get(requestId);

  if (!request) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      message: 'Permintaan redeem tidak valid',
      panel: 'panel-redeem',
    });
  }

  db.prepare(
    "UPDATE redeem_requests SET status = 'approved', processed_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(requestId);
  addTransaction(
    request.user_id,
    'redeem',
    -request.coins,
    `Redeem ${request.amount_label} disetujui - transfer manual`
  );

  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: `Redeem disetujui. Transfer ${request.amount_label} ke ${request.account_name}.`,
    panel: 'panel-redeem',
  });
}

function handleAdminRedeemNoPost(req, res) {
  const requestId = parseInt(req.body.request_id, 10);
  const request = db
    .prepare("SELECT * FROM redeem_requests WHERE id = ? AND status = 'pending'")
    .get(requestId);

  if (!request) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      message: 'Permintaan redeem tidak valid',
      panel: 'panel-redeem',
    });
  }

  const reject = db.transaction(() => {
    db.prepare(
      "UPDATE redeem_requests SET status = 'rejected', processed_at = CURRENT_TIMESTAMP WHERE id = ?"
    ).run(requestId);
    db.prepare('UPDATE wallets SET coins = coins + ? WHERE user_id = ?').run(
      request.coins,
      request.user_id
    );
    addTransaction(
      request.user_id,
      'redeem_refund',
      request.coins,
      `Redeem ${request.amount_label} ditolak - koin dikembalikan`
    );
  });

  reject();
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: 'Redeem ditolak, koin dikembalikan ke user',
    panel: 'panel-redeem',
  });
}

function handleAdminRedeemDelPost(req, res) {
  const requestId = parseInt(req.body.request_id, 10);
  const request = db.prepare('SELECT * FROM redeem_requests WHERE id = ?').get(requestId);

  if (!request) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Riwayat redeem tidak ditemukan',
      panel: 'panel-redeem',
    });
  }

  if (request.status === 'pending') {
    db.prepare('UPDATE wallets SET coins = coins + ? WHERE user_id = ?').run(
      request.coins,
      request.user_id
    );
    addTransaction(
      request.user_id,
      'redeem_cancel',
      request.coins,
      `Redeem ${request.amount_label} dibatalkan admin`
    );
  }

  db.prepare('DELETE FROM redeem_requests WHERE id = ?').run(requestId);
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: 'Riwayat redeem berhasil dihapus',
    panel: 'panel-redeem',
  });
}

function handleAdminBetDelPost(req, res) {
  const betId = parseInt(req.body.bet_id, 10);
  const bet = db.prepare('SELECT * FROM bets WHERE id = ?').get(betId);

  if (!bet) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      error: 'Riwayat tebakan tidak ditemukan',
      panel: 'panel-riwayat-bet',
    });
  }

  if (bet.status === 'pending') {
    db.prepare('UPDATE wallets SET coins = coins + ? WHERE user_id = ?').run(
      bet.coins,
      bet.user_id
    );
    addTransaction(
      bet.user_id,
      'bet_refund',
      bet.coins,
      `Tebakan #${betId} dihapus admin - koin dikembalikan`
    );
  } else if (bet.status === 'won') {
    const payout = bet.payout || 0;
    if (payout > 0) {
      const wallet = getWallet(bet.user_id);
      if (!wallet || wallet.coins < payout) {
        return redirectFlash(res, req, req.session.routes.PATH.admin, {
          error: 'Tidak bisa hapus, koin kemenangan sudah dipakai user',
          panel: 'panel-riwayat-bet',
        });
      }
      db.prepare('UPDATE wallets SET coins = coins - ? WHERE user_id = ?').run(
        payout,
        bet.user_id
      );
      addTransaction(
        bet.user_id,
        'admin_adjust',
        -payout,
        `Tebakan menang #${betId} dihapus admin`
      );
    }
  }

  db.prepare('DELETE FROM bets WHERE id = ?').run(betId);
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: 'Riwayat tebakan berhasil dihapus',
    panel: 'panel-riwayat-bet',
  });
}

function handleAdminSettlePost(req, res) {
  const { match_id, result } = req.body;
  const match = db.prepare('SELECT * FROM matches WHERE id = ?').get(match_id);

  if (!match || match.status === 'finished') {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      message: 'Match tidak valid',
      panel: 'panel-settle',
    });
  }
  if (!['home', 'draw', 'away'].includes(result)) {
    return redirectFlash(res, req, req.session.routes.PATH.admin, {
      message: 'Hasil tidak valid',
      panel: 'panel-settle',
    });
  }

  const settle = db.transaction(() => {
    db.prepare("UPDATE matches SET status = 'finished', result = ? WHERE id = ?").run(
      result,
      match_id
    );

    const bets = db
      .prepare("SELECT * FROM bets WHERE match_id = ? AND status = 'pending'")
      .all(match_id);

    for (const bet of bets) {
      if (bet.choice === result) {
        const payout = Math.floor(bet.coins * bet.odds);
        db.prepare('UPDATE bets SET status = ?, payout = ? WHERE id = ?').run(
          'won',
          payout,
          bet.id
        );
        db.prepare('UPDATE wallets SET coins = coins + ? WHERE user_id = ?').run(
          payout,
          bet.user_id
        );
        addTransaction(bet.user_id, 'win', payout, `Menang match #${match_id}`);
      } else {
        db.prepare("UPDATE bets SET status = 'lost', payout = 0 WHERE id = ?").run(bet.id);
      }
    }
  });

  settle();
  redirectFlash(res, req, req.session.routes.PATH.admin, {
    message: 'Hasil pertandingan sudah diproses',
    panel: 'panel-settle',
  });
}

app.listen(PORT, () => {
  console.log(`TebakBola jalan di http://localhost:${PORT}`);
});