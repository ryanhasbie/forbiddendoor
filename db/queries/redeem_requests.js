const db = require('../connection');

function createRedeemRequest(data) {
  return db.prepare(
    `INSERT INTO redeem_requests
     (user_id, package, coins, amount_idr, amount_label, payment_method, account_number, account_name, username_snapshot)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    data.userId,
    data.packageId,
    data.coins,
    data.amountIdr,
    data.amountLabel,
    data.paymentMethod,
    data.accountNumber,
    data.accountName,
    data.usernameSnapshot
  );
}

function getRedeemRequestsByUserId(userId) {
  return db.prepare(
    `SELECT * FROM redeem_requests
     WHERE user_id = ?
     ORDER BY created_at DESC`
  ).all(userId);
}

function getRedeemRequestById(id) {
  return db.prepare('SELECT * FROM redeem_requests WHERE id = ?').get(id);
}

function getPendingRedeemRequests() {
  return db.prepare(
    `SELECT r.*, u.username
     FROM redeem_requests r
     JOIN users u ON u.id = r.user_id
     WHERE r.status = 'pending'
     ORDER BY r.created_at DESC`
  ).all();
}

function getAllRedeemRequests() {
  return db.prepare(
    `SELECT r.*, u.username
     FROM redeem_requests r
     JOIN users u ON u.id = r.user_id
     ORDER BY
       CASE r.status WHEN 'pending' THEN 0 ELSE 1 END,
       r.created_at DESC`
  ).all();
}

function updateRedeemStatus(id, status) {
  return db.prepare(
    "UPDATE redeem_requests SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(status, id);
}

function deleteRedeemRequest(id) {
  return db.prepare('DELETE FROM redeem_requests WHERE id = ?').run(id);
}

module.exports = {
  createRedeemRequest,
  getRedeemRequestsByUserId,
  getRedeemRequestById,
  getPendingRedeemRequests,
  updateRedeemStatus,
  deleteRedeemRequest,
};