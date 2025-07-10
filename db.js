const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/data/donors.db');

// Create table if not exists
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      code TEXT NOT NULL,
      isAdmin BOOLEAN DEFAULT 0,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
});

function addDonor({ name, email, code, isAdmin = false }) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM donors WHERE email = ?`, [email], (err, row) => {
      if (err) return reject(err);

      if (row) {
        // Donor exists
        if (isAdmin && !row.isAdmin) {
          db.run(`UPDATE donors SET isAdmin = 1 WHERE email = ?`, [email], function (err2) {
            if (err2) return reject(err2);
            resolve("updated");
          });
        } else {
          // No update needed
          resolve("exists");
        }
      } else {
        // Donor does not exist – insert new
        const timestamp = new Date().toISOString();
        db.run(
          `INSERT INTO donors (name, email, code, isAdmin, timestamp) VALUES (?, ?, ?, ?, ?)`,
          [name, email, code, isAdmin ? 1 : 0, timestamp],
          function (err3) {
            if (err3) reject(err3);
            else resolve("inserted");
          }
        );
      }
    });
  });
}

function deleteDonorByEmail(email) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM donors WHERE email = ?`, [email], function (err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}

function getCodeByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT code FROM donors WHERE email = ?`, [email], (err, row) => {
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
    db.get(`SELECT * FROM donors WHERE email = ? AND code = ?`, [email, code], (err, row) => {
      if (err) reject(err);
      else resolve(!!row);
    });
  });
}

function isAdmin(email, code) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT isAdmin FROM donors WHERE email = ? AND code = ?`, [email, code], (err, row) => {
      if (err) reject(err);
      else resolve(row?.isAdmin === 1);
    });
  });
}

function getAllDonors() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM donors ORDER BY timestamp DESC`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = {
  addDonor,
  deleteDonorByEmail,
  getCodeByEmail,
  isCodeValid,
  isCodeValidForEmail,
  isAdmin,
  getAllDonors,
};
