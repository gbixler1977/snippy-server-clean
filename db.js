const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('donors.db');

// Create table if not exists
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT,
      email TEXT,
      code TEXT,
      timestamp TEXT
    )
  `);
});

function addDonor({ name, email, code }) {
  const timestamp = new Date().toISOString();
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO donors (name, email, code, timestamp) VALUES (?, ?, ?, ?)`,
      [name, email, code, timestamp],
      function (err) {
        if (err) reject(err);
        else resolve(this.lastID);
      }
    );
  });
}

function getCodeByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT code FROM donors WHERE email = ? ORDER BY id DESC LIMIT 1`, [email], (err, row) => {
      if (err) reject(err);
      else resolve(row?.code || null);
    });
  });
}

function isCodeValid(code) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM donors WHERE code = ?`, [code], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
}


function isCodeValidForEmail(email, code) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM donors WHERE email = ? AND code = ?`,
      [email, code],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}



module.exports = {
  addDonor,
  getCodeByEmail,
  isCodeValid,
	isCodeValidForEmail,
};
