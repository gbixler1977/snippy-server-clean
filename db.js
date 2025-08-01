
const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('/data/donors.db');

// ------------------ INIT ------------------
db.serialize(() => {
  // Donors table
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

  // Insults table
  db.run(`
    CREATE TABLE IF NOT EXISTS insults (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      text TEXT NOT NULL,
      submittedByName TEXT,
      submittedByEmail TEXT,
      showName BOOLEAN DEFAULT 1,
      status TEXT DEFAULT 'pending', -- pending, approved, rejected, Rejected - Duplicate
      rejectionReason TEXT,
      approvedByEmail TEXT,
      clickCount INTEGER DEFAULT 0,
      timestamp TEXT DEFAULT CURRENT_TIMESTAMP
    )
  `);
  // Announcements table
db.run(`
  CREATE TABLE IF NOT EXISTS announcements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    category TEXT DEFAULT 'What''s New',
    start TEXT NOT NULL,
    end TEXT NOT NULL,
    createdByEmail TEXT,
    createdAt TEXT DEFAULT CURRENT_TIMESTAMP
  )
`);

  
  
});

// ------------------ DONOR LOGIC ------------------
function addDonor({ name, email, code, isAdmin = false }) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM donors WHERE email = ?`, [email], (err, row) => {
      if (err) return reject(err);

      if (row) {
        if (isAdmin && !row.isAdmin) {
          db.run(`UPDATE donors SET isAdmin = 1 WHERE email = ?`, [email], function (err2) {
            if (err2) return reject(err2);
            resolve("updated");
          });
        } else {
          resolve("exists");
        }
      } else {
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

// ------------------ INSULT LOGIC ------------------




function sanitizeAnnouncementBody(input) {
  // Allows b, i, u, ul, and li tags. Strips all others.
  return input
    .replace(/<\s*\/?(?!b|i|u|ul|li)[^>]+>/gi, '') 
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/on\w+="[^"]*"/gi, '');
}

function sanitizeRichText(input) {
  return input
    .replace(/<\s*\/?(?!b|i|u)[^>]+>/gi, '') // remove all tags except b/i/u
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '') // remove <script> entirely
    .replace(/on\w+="[^"]*"/gi, ''); // remove inline event handlers like onclick
}


function submitInsult({ text, submittedByName, submittedByEmail, showName }) {
  return new Promise((resolve, reject) => {
    db.get(`SELECT * FROM insults WHERE LOWER(TRIM(text)) = LOWER(TRIM(?))`, [text], (err, row) => {
      if (err) return reject(err);

      const safeHtml = sanitizeRichText(text);
const timestamp = new Date().toISOString();


      if (row) {
        // Exact match already exists → auto reject
        db.run(`
          INSERT INTO insults (text, submittedByName, submittedByEmail, showName, status, rejectionReason, timestamp)
          VALUES (?, ?, ?, ?, ?, ?, ?)
        `, [
          safeHtml,
          submittedByName,
          submittedByEmail,
          showName ? 1 : 0,
          "Rejected - Duplicate",
          "This insult was already submitted.",
          timestamp
        ], function (err2) {
          if (err2) return reject(err2);
          resolve({ status: "duplicate", id: this.lastID });
        });
      } else {
        // Fresh insult
        db.run(`
          INSERT INTO insults (text, submittedByName, submittedByEmail, showName, status, timestamp)
          VALUES (?, ?, ?, ?, 'pending', ?)
        `, [
          text,
          submittedByName,
          submittedByEmail,
          showName ? 1 : 0,
          timestamp
        ], function (err3) {
          if (err3) return reject(err3);
          resolve({ status: "pending", id: this.lastID });
        });
      }
    });
  });
}

function getInsultsByEmail(email) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM insults WHERE submittedByEmail = ? ORDER BY timestamp DESC`, [email], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getInsultsByStatus(status) {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM insults WHERE status = ? ORDER BY timestamp DESC`, [status], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function approveInsult(id, approverEmail) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE insults SET status = 'approved', approvedByEmail = ? WHERE id = ?
    `, [approverEmail, id], function (err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}

function rejectInsult(id, reason = null) {
  return new Promise((resolve, reject) => {
    db.run(`
      UPDATE insults SET status = 'rejected', rejectionReason = ? WHERE id = ?
    `, [reason, id], function (err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}

/**
 * NEW: Deletes an insult from the database by its ID.
 * @param {number} id The ID of the insult to delete.
 * @returns {Promise<boolean>} A promise that resolves to true if a row was deleted.
 */
function deleteInsultById(id) {
    return new Promise((resolve, reject) => {
        db.run(`DELETE FROM insults WHERE id = ?`, [id], function (err) {
            if (err) reject(err);
            else resolve(this.changes > 0);
        });
    });
}


function incrementClick(insultId) {
  return new Promise((resolve, reject) => {
    db.run(`UPDATE insults SET clickCount = clickCount + 1 WHERE id = ?`, [insultId], function (err) {
      if (err) reject(err);
      else resolve(true);
    });
  });
}

function insertApprovedInsult({ text }) {
  return new Promise((resolve, reject) => {
    const safeHtml = sanitizeRichText(text);
const timestamp = new Date().toISOString();

    const submittedByName = "Snippy";
    const botEmail = "snippybot@snippyforquickbase.com";
    const showName = 1; // Always show the name "Snippy"

    db.run(`
      INSERT INTO insults (text, submittedByName, submittedByEmail, showName, status, approvedByEmail, timestamp)
      VALUES (?, ?, ?, ?, 'approved', ?, ?)
    `, [
      safeHtml,
      submittedByName,
      botEmail,
      showName,
      botEmail,
      timestamp
    ], function (err) {
      if (err) {
        console.error("Error inserting approved insult:", err);
        reject(err);
      } else {
        resolve({ status: "approved", id: this.lastID });
      }
    });
  });
}

function getApprovedInsults(limit = 100) {
  return new Promise((resolve, reject) => {
    db.all(
      `SELECT 
         id, 
         text,
		showName,		
		submittedByName,       
         clickCount, 
         timestamp
       FROM insults
       WHERE status = 'approved'
       ORDER BY RANDOM()
       LIMIT ?`,
      [limit],
      (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      }
    );
  });
}

// ------------------ ANNOUNCEMENT LOGIC ------------------

// db.js

function createAnnouncement({ title, body, category, start, end, createdByEmail }) {
  return new Promise((resolve, reject) => {
    const timestamp = new Date().toISOString();
    
    // Sanitize the body before inserting it
    const safeBody = sanitizeAnnouncementBody(body);

    db.run(`
      INSERT INTO announcements (title, body, category, start, end, createdByEmail, createdAt)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `, [title, safeBody, category, start, end, createdByEmail, timestamp], function (err) { // <-- Use safeBody here
      if (err) reject(err);
      else resolve({ id: this.lastID });
    });
  });
}

function getActiveAnnouncements(currentDate = new Date().toISOString()) {
  return new Promise((resolve, reject) => {
    db.all(`
      SELECT * FROM announcements
      WHERE start <= ? AND end >= ?
      ORDER BY start DESC
    `, [currentDate, currentDate], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function getAllAnnouncements() {
  return new Promise((resolve, reject) => {
    db.all(`SELECT * FROM announcements ORDER BY createdAt DESC`, [], (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

function deleteAnnouncement(id) {
  return new Promise((resolve, reject) => {
    db.run(`DELETE FROM announcements WHERE id = ?`, [id], function (err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}


function deleteAllAnnouncements() {
  return new Promise((resolve, reject) => {
    // This command deletes every row from the announcements table
    db.run(`DELETE FROM announcements`, [], function(err) {
      if (err) {
        reject(err);
      } else {
        // 'this.changes' gives you the number of rows that were deleted
        resolve({ deletedCount: this.changes });
      }
    });
  });
}

function updateAnnouncement({ id, title, body, category, start, end }) {
  return new Promise((resolve, reject) => {
    const safeBody = sanitizeAnnouncementBody(body);
    db.run(`
      UPDATE announcements
      SET title = ?, body = ?, category = ?, start = ?, end = ?
      WHERE id = ?
    `, [title, safeBody, category, start, end, id], function (err) {
      if (err) reject(err);
      else resolve(this.changes > 0);
    });
  });
}


// ------------------ EXPORTS ------------------

module.exports = {
  addDonor,
  deleteDonorByEmail,
  getCodeByEmail,
  isCodeValid,
  isCodeValidForEmail,
  isAdmin,
  getAllDonors,
  submitInsult,
  getInsultsByEmail,
  getInsultsByStatus,
  approveInsult,
  rejectInsult,
  deleteInsultById,
  incrementClick,
  insertApprovedInsult,
  getApprovedInsults,
  createAnnouncement,
  getActiveAnnouncements,
  getAllAnnouncements,
  deleteAnnouncement,
  deleteAllAnnouncements,
  updateAnnouncement
};
