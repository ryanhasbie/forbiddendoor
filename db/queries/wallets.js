const db = require('../connection');

function getWallet(userId) {
  return db.prepare('SELECT coins FROM wallets WHERE user_id = ?').get(userId);
}

function createWallet(userId, initialCoins = 0) {
  return db.prepare('INSERT INTO wallets (user_id, coins) VALUES (?, ?)').run(userId, initialCoins);
}

function updateWalletCoins(userId, amount) {
  return db.prepare('UPDATE wallets SET coins = coins + ? WHERE user_id = ?').run(amount, userId);
}

module.exports = {
  getWallet,
  createWallet,
  updateWalletCoins,
};