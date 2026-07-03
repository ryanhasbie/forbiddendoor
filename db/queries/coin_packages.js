const db = require('../connection');

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

module.exports = {
  getPackages,
  getPackage,
};