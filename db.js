const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./donor_data.db');

// 🛠 MIGRATION: Add isAdmin column if it's missing
db.serialize(() => {
  db.all("PRAGMA table_info(donor_data);", (err, columns) => {
    if (err) {
      console.error("Error checking table schema:", err);
      return;
    }

    const hasIsAdmin = columns.some(col => col.name === 'isAdmin');
    if (!hasIsAdmin) {
      console.log("🛠 Adding 'isAdmin' column to donor_data table...");
      db.run("ALTER TABLE donor_data ADD COLUMN isAdmin BOOLEAN DEFAULT 0", (alterErr) => {
        if (alterErr) {
          console.error("Failed to add 'isAdmin' column:", alterErr);
        } else {
          console.log("✅ 'isAdmin' column added successfully.");
        }
      });
    } else {
      console.log("✅ 'isAdmin' column already exists.");
    }
  });
});

// 🔧 Insert a new donor_data
function adddonor_data({ name, email, code, isAdmin = false }) {
  return new Promise((resolve, reject) => {
    db.run(
      `INSERT INTO donor_data (name, email, code, isAdmin) VALUES (?, ?, ?, ?)`,
      [name, email, code, isAdmin ? 1 : 0],
      function (err) {
        if (err) reject(err);
        else resolve({ id: this.lastID });
      }
    );
  });
}

// 🔎 Get the latest code by email
function getCodeByEmail(email) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT code FROM donor_data WHERE email = ? ORDER BY timestamp DESC LIMIT 1`,
      [email],
      (err, row) => {
        if (err) reject(err);
        else resolve(row?.code || null);
      }
    );
  });
}

// ✅ Check if a code exists at all
function isCodeValid(code) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM donor_data WHERE code = ?`,
      [code],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

// ✅ Check if code matches a specific email
function isCodeValidForEmail(email, code) {
  return new Promise((resolve, reject) => {
    db.get(
      `SELECT * FROM donor_data WHERE email = ? AND code = ?`,
      [email, code],
      (err, row) => {
        if (err) reject(err);
        else resolve(!!row);
      }
    );
  });
}

module.exports = {
  adddonor_data,
  getCodeByEmail,
  isCodeValid,
  isCodeValidForEmail
};
