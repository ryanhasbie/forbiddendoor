const db = require('../connection');

const TX_TYPE_LABELS = {
  bonus: 'Bonus daftar',
  topup: 'Top-up koin',
  bet: 'Pasang tebakan',
  win: 'Menang tebakan',
  redeem: 'Redeem disetujui',
  redeem_hold: 'Redeem (ditahan)',
  redeem_refund: 'Redeem ditolak',
  redeem_cancel: 'Redeem dibatalkan',
  bet_refund: 'Refund tebakan',
  admin_adjust: 'Penyesuaian admin',
};

function addTransaction(userId, type, amount, note, createdAt = null) {
  const timestamp = createdAt || new Date().toISOString();
  return db.prepare(
    'INSERT INTO transactions (user_id, type, amount, note, created_at) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, type, amount, note, timestamp);
}

function getTransactionsByUserId(userId) {
  return db.prepare(
    `SELECT * FROM transactions
     WHERE user_id = ?
     ORDER BY created_at DESC`
  ).all(userId);
}

function getTransactionTypeLabel(type) {
  return TX_TYPE_LABELS[type] || type;
}

function enrichTransactions(transactions) {
  return transactions.map((tx) => ({
    ...tx,
    typeLabel: getTransactionTypeLabel(tx.type),
    isCredit: tx.amount > 0,
    isDebit: tx.amount < 0,
    isNeutral: tx.amount === 0,
    amountDisplay:
      tx.amount === 0
        ? '—'
        : tx.amount > 0
          ? `+${tx.amount}`
          : String(tx.amount),
  }));
}

module.exports = {
  addTransaction,
  getTransactionsByUserId,
  getTransactionTypeLabel,
  enrichTransactions,
};