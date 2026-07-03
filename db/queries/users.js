const db = require('../connection');

function getUserById(id) {
  return db.prepare('SELECT * FROM users WHERE id = ?').get(id);
}

function getUserByUsername(username) {
  return db.prepare('SELECT * FROM users WHERE username = ?').get(username);
}

function createUser(username, hashedPassword) {
  return db.prepare(
    "INSERT INTO users (username, password, role) VALUES (?, ?, 'user')"
  ).run(username, hashedPassword);
}

function getAllUsers() {
  return db.prepare(
    `SELECT u.id, u.username, u.role, u.created_at, COALESCE(w.coins, 0) as coins
     FROM users u
     LEFT JOIN wallets w ON w.user_id = u.id
     ORDER BY u.created_at DESC`
  ).all();
}

function getRegisteredUserCount() {
  return db.prepare("SELECT COUNT(*) as count FROM users WHERE role != 'admin'").get().count;
}

module.exports = {
  getUserById,
  getUserByUsername,
  createUser,
  getAllUsers,
  getRegisteredUserCount,
};