const db = require('../connection');

function getOpenMatches() {
  return db.prepare("SELECT * FROM matches WHERE status = 'open' ORDER BY kickoff ASC").all();
}

function getAllMatches() {
  return db.prepare('SELECT * FROM matches ORDER BY kickoff ASC').all();
}

function getMatchById(id) {
  return db.prepare('SELECT * FROM matches WHERE id = ?').get(id);
}

function createMatch(teamA, teamB, kickoff, oddsHome, oddsDraw, oddsAway) {
  return db.prepare(`
    INSERT INTO matches (team_a, team_b, kickoff, odds_home, odds_draw, odds_away)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(teamA, teamB, kickoff, oddsHome, oddsDraw, oddsAway);
}

function deleteMatch(id) {
  return db.prepare('DELETE FROM matches WHERE id = ?').run(id);
}

function updateMatchResult(id, result) {
  return db.prepare("UPDATE matches SET status = 'finished', result = ? WHERE id = ?").run(result, id);
}

function getMatchCount() {
  return db.prepare('SELECT COUNT(*) as count FROM matches').get();
}

module.exports = {
  getOpenMatches,
  getAllMatches,
  getMatchById,
  createMatch,
  deleteMatch,
  updateMatchResult,
  getMatchCount,
};