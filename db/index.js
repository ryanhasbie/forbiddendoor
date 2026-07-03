const db = require('./connection');
const { initSchema } = require('./schema');

// Jalankan inisialisasi database (tabel, seed, backfill)
initSchema();

// Re-export raw db untuk backward compatibility
// (bisa dipakai sementara sambil memindahkan query ke folder queries)
module.exports = db;

// Juga export query modules agar bisa dipakai secara terpisah
module.exports.queries = {
  users: require('./queries/users'),
  matches: require('./queries/matches'),
  bets: require('./queries/bets'),
  wallets: require('./queries/wallets'),
  transactions: require('./queries/transactions'),
  topup_requests: require('./queries/topup_requests'),
  redeem_requests: require('./queries/redeem_requests'),
  settings: require('./queries/settings'),
  coin_packages: require('./queries/coin_packages'),
};