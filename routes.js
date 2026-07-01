const crypto = require('crypto');

function randomSegment(len = 12) {
  return crypto
    .randomBytes(18)
    .toString('base64url')
    .replace(/[^a-zA-Z0-9]/g, '')
    .slice(0, len);
}

function generateSessionRoutes() {
  const authBase = `/${randomSegment()}`;
  const dashBase = `/${randomSegment()}`;
  const adminBase = `/${randomSegment()}`;
  const pubBase = `/${randomSegment()}`;

  return {
    PATH: {
      login: '/',
      register: `${authBase}/r`,
      dashboard: dashBase,
      admin: adminBase,
      leaderboard: `${pubBase}/lb`,
      terms: `${pubBase}/sk`,
    },
    POST: {
      login: `${authBase}/in`,
      register: `${authBase}/up`,
      logout: `${authBase}/out`,
      topup: `${dashBase}/tp`,
      redeem: `${dashBase}/rd`,
      bet: `${dashBase}/bt`,
      timezone: `${dashBase}/tz`,
      adminBonus: `${adminBase}/s/bn`,
      adminMinBet: `${adminBase}/s/mb`,
      adminTimezone: `${adminBase}/s/tz`,
      adminMaxUsers: `${adminBase}/s/mu`,
      adminUserDel: `${adminBase}/u/dl`,
      adminAccount: `${adminBase}/a/up`,
      adminPkg: `${adminBase}/s/pg`,
      adminMatchAdd: `${adminBase}/m/ad`,
      adminMatchDel: `${adminBase}/m/dl`,
      adminTopupOk: `${adminBase}/t/ok`,
      adminTopupNo: `${adminBase}/t/no`,
      adminTopupDel: `${adminBase}/t/dl`,
      adminRedeemOk: `${adminBase}/r/ok`,
      adminRedeemNo: `${adminBase}/r/no`,
      adminRedeemDel: `${adminBase}/r/dl`,
      adminBetDel: `${adminBase}/b/dl`,
      adminSettle: `${adminBase}/m/st`,
    },
  };
}

function ensureGuestRoutes(req) {
  if (!req.session.routes) {
    req.session.routes = generateSessionRoutes();
  }
  return req.session.routes;
}

function rotateSessionRoutes(req) {
  req.session.routes = generateSessionRoutes();
  return req.session.routes;
}

function ensureAuthRoutes(req) {
  if (!req.session.routes) {
    rotateSessionRoutes(req);
  }
  return req.session.routes;
}

function syncRouteLocals(req, res) {
  const routes = req.session.routes;
  if (routes) {
    res.locals.PATH = routes.PATH;
    res.locals.POST = routes.POST;
  } else {
    res.locals.PATH = { login: '/' };
    res.locals.POST = {};
  }
}

function resolveRouteKey(req) {
  const routes = req.session.routes;
  if (!routes) return null;

  if (req.method === 'GET') {
    for (const [key, path] of Object.entries(routes.PATH)) {
      if (req.path === path) return `GET:${key}`;
    }
  } else if (req.method === 'POST') {
    for (const [key, path] of Object.entries(routes.POST)) {
      if (req.path === path) return `POST:${key}`;
    }
  }
  return null;
}

function setFlash(req, data) {
  req.session.flash = data;
}

function pullFlash(req) {
  const data = req.session.flash || {};
  delete req.session.flash;
  return data;
}

function redirectFlash(res, req, path, flash = {}) {
  if (Object.keys(flash).length) setFlash(req, flash);
  res.redirect(path);
}

module.exports = {
  generateSessionRoutes,
  ensureGuestRoutes,
  rotateSessionRoutes,
  ensureAuthRoutes,
  syncRouteLocals,
  resolveRouteKey,
  setFlash,
  pullFlash,
  redirectFlash,
};