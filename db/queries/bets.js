const db = require('../connection');

function getBetsByUserId(userId) {
  return db.prepare(
    `SELECT b.*, m.team_a, m.team_b
     FROM bets b
     JOIN matches m ON m.id = b.match_id
     WHERE b.user_id = ?
     ORDER BY b.created_at DESC`
  ).all(userId);
}

function getBetByUserAndMatch(userId, matchId) {
  return db.prepare('SELECT id FROM bets WHERE user_id = ? AND match_id = ?').get(userId, matchId);
}

function createBet(userId, matchId, choice, coins, odds) {
  return db.prepare(
    'INSERT INTO bets (user_id, match_id, choice, coins, odds) VALUES (?, ?, ?, ?, ?)'
  ).run(userId, matchId, choice, coins, odds);
}

function getPendingBetsByMatch(matchId) {
  return db.prepare("SELECT * FROM bets WHERE match_id = ? AND status = 'pending'").all(matchId);
}

function updateBetStatus(betId, status, payout = 0) {
  return db.prepare('UPDATE bets SET status = ?, payout = ? WHERE id = ?').run(status, payout, betId);
}

function deleteBet(betId) {
  return db.prepare('DELETE FROM bets WHERE id = ?').run(betId);
}

module.exports = {
  getBetsByUserId,
  getBetByUserAndMatch,
  createBet,
  getPendingBetsByMatch,
  updateBetStatus,
  deleteBet,
};