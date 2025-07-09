const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/data/donors.db');

// 🧱 Ensure donors table exists
db.serialize(() => {
  db.run(`
    CREATE TABLE IF NOT EXISTS donors (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      email TEXT NOT NULL,
      code TEXT NOT NULL,
      isAdmin BOOLEAN DEFAULT 0,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // 🛠 Add isAdmin column if missing
  db.all("PRAGMA table_info(donors);", (err, columns) => {
    if (err) {
      console.error("Error checking schema:", err);
      return;
    }

    const hasIsAdmin = columns.some(col => col.name === 'isAdmin');
    if (!hasIsAdmin) {
      console.log("🛠 Adding 'isAdmin' column...");
      db.run(`ALTER TABLE donors ADD COLUMN isAdmin BOOLEAN DEFAULT 0`, (err) => {
        if (err) console.error("❌ Failed to add 'isAdmin':", err);
        else console.log("✅ 'isAdmin' column added.");
      });
    } else {
      console.log("✅ 'isAdmin' column already exists.");
    }
  });
});

// ✅ Add a new donor
function addDonor({ name, email, code, isAdmin = false }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO donors (name, email, code, isAdmin) VALUES (?, ?, ?, ?)`,
      [name, email, code, isAdmin ? 1 : 0],
      function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
}

// 🔍 Get latest code for an email
function getCodeByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT code FROM donors WHERE email = ? ORDER BY timestamp DESC LIMIT 1`,
      [email],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.code || null);
      }
    );
  });
}

// 🧾 Check if a code exists
function isCodeValid(code) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM donors WHERE code = ?`,
      [code],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

// ✅ Check code AND email match
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

// 🛂 Check if a donor is an admin
function isAdmin(email, code) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT isAdmin FROM donors WHERE email = ? AND code = ?`,
      [email, code],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row?.isAdmin);
      }
    );
  });
}

// 🧪 Get all donors
function getAllDonors() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM donors ORDER BY timestamp DESC`, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

module.exports = {
  addDonor,
  getCodeByEmail,
  isCodeValid,
  isCodeValidForEmail,
  isAdmin,
  getAllDonors,
};
