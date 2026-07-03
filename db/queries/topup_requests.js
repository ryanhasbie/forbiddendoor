const db = require('../connection');

function createTopupRequest(userId, packageId, coins, amountLabel, note) {
  return db.prepare(
    `INSERT INTO topup_requests (user_id, package, coins, amount_label, note)
     VALUES (?, ?, ?, ?, ?)`
  ).run(userId, packageId, coins, amountLabel, note);
}

function getTopupRequestsByUserId(userId) {
  return db.prepare(
    `SELECT * FROM topup_requests
     WHERE user_id = ?
     ORDER BY created_at DESC`
  ).all(userId);
}

function getTopupRequestById(id) {
  return db.prepare('SELECT * FROM topup_requests WHERE id = ?').get(id);
}

function getPendingTopupRequests() {
  return db.prepare(
    `SELECT t.*, u.username
     FROM topup_requests t
     JOIN users u ON u.id = t.user_id
     WHERE t.status = 'pending'
     ORDER BY t.created_at DESC`
  ).all();
}

function getAllTopupRequests() {
  return db.prepare(
    `SELECT t.*, u.username
     FROM topup_requests t
     JOIN users u ON u.id = t.user_id
     ORDER BY
       CASE t.status WHEN 'pending' THEN 0 ELSE 1 END,
       t.created_at DESC`
  ).all();
}

function updateTopupStatus(id, status) {
  return db.prepare(
    "UPDATE topup_requests SET status = ?, processed_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(status, id);
}

function deleteTopupRequest(id) {
  return db.prepare('DELETE FROM topup_requests WHERE id = ?').run(id);
}

function deleteTopupRequestsByUserId(userId) {
  return db.prepare('DELETE FROM topup_requests WHERE user_id = ?').run(userId);
}

module.exports = {
  createTopupRequest,
  getTopupRequestsByUserId,
  getTopupRequestById,
  getPendingTopupRequests,
  getAllTopupRequests,
  updateTopupStatus,
  deleteTopupRequest,
  deleteTopupRequestsByUserId,
};