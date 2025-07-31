require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const {
  addDonor,
  getCodeByEmail,
  isCodeValid,
  isCodeValidForEmail,
  isAdmin,
  getAllDonors,
  deleteDonorByEmail,
  submitInsult,
  getInsultsByEmail,
  getInsultsByStatus,
  approveInsult,
  rejectInsult,
  deleteInsultById, // NEW
  incrementClick,
  insertApprovedInsult,
  getApprovedInsults,
  deleteAllAnnouncements,
  updateAnnouncement
} = require('./db');

const app = express();

// ✅ Allow requests from Chrome Extensions
app.use((req, res, next) => {
  const origin = req.headers.origin;
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS,DELETE");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, auth");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.use(express.json());

// Health check
app.get('/', (req, res) => {
  res.send('Snippy Server is running!');
});

// POST: Webhook from Zapier after BMAC donation

app.post('/api/bmac-webhook', async (req, res) => {
  const { email, name, message, amount, referrer } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    let code;
let isNew = false;

const existingCode = await getCodeByEmail(email);

if (existingCode) {
  code = existingCode;
} else {
  code = uuidv4();
  await addDonor({ name, email, code });
  isNew = true;
}


    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const subject = isNew
      ? `🎉 Your Snippy Unlock Code`
      : `🔁 You're already awesome – here’s your code again`;

    const text = isNew
      ? `Thanks for donating, ${name}!\n\nHere is your Snippy unlock code:\n\n${code}`
      : `You donated again! Snippy loves you.\n\nHere's your unlock code again just in case:\n\n${code}`;

    await transporter.sendMail({
      from: `"Snippy Bot" <${process.env.SMTP_USER}>`,
      to: email,
      subject,
      text
    });


    res.json({ success: true });

  } catch (err) {
    console.error('❌ Error processing webhook:', err);
    res.status(500).json({ error: 'Failed to process donation.' });
  }
});


// GET: Resend unlock code by email
app.get('/api/resend-code', async (req, res) => {
  const email = req.query.email;
  if (!email) return res.status(400).json({ error: 'Missing email.' });

  try {
    const code = await getCodeByEmail(email);
    if (!code) return res.status(404).json({ error: 'No unlock code found for this email.' });

    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
		port: 465,
  secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: `"Snippy Bot" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `🔁 Your Snippy Unlock Code (Resent)`,
      text: `You asked for your unlock code. Here it is:\n\n${code}\n\nPaste this into Snippy's Settings to unlock premium features.`,
    });

    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Resend email failed:', err);
    res.status(500).json({ error: 'Failed to resend unlock code.' });
  }
});

// DELETE: Remove a donor by email
app.delete('/api/delete-donor', async (req, res) => {
  const { email, auth } = req.body;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!email) {
    return res.status(400).json({ error: "Missing email" });
  }

  try {
    const deleted = await deleteDonorByEmail(email);
    if (deleted) {
      res.json({ success: true, message: `Deleted donor ${email}` });
    } else {
      res.status(404).json({ success: false, message: "No matching donor found" });
    }
  } catch (err) {
    console.error("Delete donor failed:", err);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

// GET: Verify if the provided code matches the email
app.get("/api/verify-code", async (req, res) => {
  const { email, code } = req.query;
  

  if (!email || !code) {
    return res.status(400).json({ valid: false, error: "Missing email or code" });
  }

  try {
    const valid = await isCodeValidForEmail(email, code);
    const admin = valid ? await isAdmin(email, code) : false;
    
    res.json({ valid, isAdmin: admin });
  } catch (err) {
    console.error("❌ verify-code error:", err);
    res.status(500).json({ valid: false, error: "Server error" });
  }
});

// DEV ONLY: Dump all donor rows (for debugging)
app.get('/api/dev-list-donors', async (req, res) => {
  try {
    const donors = await getAllDonors();
    res.json(donors);
  } catch (err) {
    console.error("❌ Error querying donors:", err);
    res.status(500).json({ error: "Database query failed" });
  }
});

// POST: Manually add a donor (admin only)
app.post('/api/manual-add-code', async (req, res) => {
  const { email, name, code, auth, isAdmin } = req.body;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!email || !name) {
    return res.status(400).json({ error: 'Missing name or email' });
  }

  const finalCode = code || uuidv4();

  try {
    await addDonor({ name, email, code: finalCode, isAdmin: isAdmin === true });
    res.json({ success: true, code: finalCode });
  } catch (err) {
    console.error('❌ Failed to add donor manually:', err);
    res.status(500).json({ error: 'Failed to add code' });
  }
});


//--------------Insult Routes-------------


// POST: Submit insult (donor)
app.post('/api/submit-insult', async (req, res) => {
  const { text, submittedByName, submittedByEmail, showName } = req.body;

  if (!text || !submittedByEmail) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  try {
    const result = await submitInsult({ text, submittedByName, submittedByEmail, showName });
    res.json(result);
  } catch (err) {
    console.error("❌ submit-insult failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET: Get all insults submitted by this donor
app.get('/api/my-insults', async (req, res) => {
  const { email } = req.query;
  if (!email) return res.status(400).json({ error: 'Missing email.' });

  try {
    const rows = await getInsultsByEmail(email);
    res.json(rows);
  } catch (err) {
    console.error("❌ my-insults error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET: Admin – fetch insults by status
app.get('/api/admin-insults', async (req, res) => {
  const { status, auth } = req.query;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!status) {
    return res.status(400).json({ error: "Missing status filter." });
  }

  try {
    const rows = await getInsultsByStatus(status);
    res.json(rows);
  } catch (err) {
    console.error("❌ admin-insults error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST: Admin – approve insult
app.post('/api/approve-insult', async (req, res) => {
  const { id, approverEmail, auth } = req.body;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const success = await approveInsult(id, approverEmail);
    res.json({ success });
  } catch (err) {
    console.error("❌ approve-insult error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST: Admin – reject insult
app.post('/api/reject-insult', async (req, res) => {
  const { id, reason, auth } = req.body;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const success = await rejectInsult(id, reason);
    res.json({ success });
  } catch (err)
 {
    console.error("❌ reject-insult error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST: Admin – insert instantly approved insult
app.post('/api/insert-insult', async (req, res) => {
  const { text, auth } = req.body;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!text) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const result = await insertApprovedInsult({ text });
    res.json(result);
  } catch (err) {
    console.error("❌ insert-insult failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * NEW: Admin - delete an insult by its ID.
 */
app.post('/api/delete-insult', async (req, res) => {
    const { id, auth } = req.body;

    if (auth !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ error: "Forbidden" });
    }

    if (!id) {
        return res.status(400).json({ error: "Missing insult ID." });
    }

    try {
        const success = await deleteInsultById(id);
        res.json({ success });
    } catch (err) {
        console.error("❌ delete-insult error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

// GET: Public insult pool (approved only)
app.get('/api/insults', async (req, res) => {
  try {
    const insults = await getApprovedInsults();
    res.json(insults);
  } catch (err) {
    console.error("❌ Failed to get insult pool:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET: Random approved insult
app.get('/api/random-approved-insult', async (req, res) => {
  try {
    const insults = await getApprovedInsults(1);
    if (!insults || insults.length === 0) {
      return res.status(404).json({ error: "No approved insults found." });
    }
    res.json(insults[0]); // Send just one
  } catch (err) {
    console.error("❌ Failed to get random insult:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});




// POST: Log click from "donate from insult"
app.post('/api/track-insult-click', async (req, res) => {
  const { id } = req.body;

  if (!id) return res.status(400).json({ error: 'Missing insult ID.' });

  try {
    await incrementClick(id);
    res.json({ success: true });
  } catch (err) {
    console.error("❌ track-insult-click failed:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// ------------------ ANNOUNCEMENT ROUTES ------------------

const {
  createAnnouncement,
  getActiveAnnouncements,
  getAllAnnouncements,
  deleteAnnouncement
} = require('./db');

// GET: Public – active announcements only
app.get('/api/announcements', async (req, res) => {
  try {
    const list = await getActiveAnnouncements();
	
    res.json(list);
  } catch (err) {
    console.error("❌ Failed to get announcements:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET: Admin – all announcements
app.get('/api/admin/announcements', async (req, res) => {
  if (req.query.auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const all = await getAllAnnouncements();
    res.json(all);
  } catch (err) {
    console.error("❌ Admin: Failed to list announcements:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST: Admin – create a new announcement
app.post('/api/admin/announcements', async (req, res) => {
  const { title, body, category, start, end, createdByEmail, auth } = req.body;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!title || !body || !start || !end) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const result = await createAnnouncement({ title, body, category, start, end, createdByEmail });
    res.json({ success: true, id: result.id });
  } catch (err) {
    console.error("❌ Failed to create announcement:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST: Admin – delete an announcement
app.post('/api/admin/delete-announcement', async (req, res) => {
  const { id, auth } = req.body;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!id) {
    return res.status(400).json({ error: "Missing announcement ID" });
  }

  try {
    const success = await deleteAnnouncement(id);
    res.json({ success });
  } catch (err) {
    console.error("❌ Failed to delete announcement:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST: Admin – update existing announcement
app.post('/api/admin/update-announcement', async (req, res) => {
  const { id, title, body, category, start, end, auth } = req.body;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!id || !title || !body || !start || !end) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const updated = await updateAnnouncement({ id, title, body, category, start, end });
    res.json({ success: updated });
  } catch (err) {
    console.error("❌ Failed to update announcement:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});


// POST: Admin – delete ALL announcements
app.post('/api/admin/delete-all-announcements', async (req, res) => {
  const { auth } = req.body;

  // Re-using your existing security check
  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  try {
    const result = await deleteAllAnnouncements();
   
    res.json({ success: true, message: `Successfully deleted ${result.deletedCount} announcements.` });
  } catch (err) {
    console.error("❌ Failed to delete all announcements:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

app.post('/api/submit-feedback', async (req, res) => {
  const { name, email, message, type, token } = req.body;

  if (!name || !email || !message || !token) {
    return res.status(400).json({ error: 'Missing required fields or CAPTCHA.' });
  }

  // CAPTCHA check
  try {
    const verifyRes = await fetch('https://www.google.com/recaptcha/api/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        secret: process.env.RECAPTCHA_SECRET,
        response: token
      })
    });

    const verifyData = await verifyRes.json();
    if (!verifyData.success) {
      return res.status(403).json({ error: 'CAPTCHA verification failed.' });
    }
  } catch (err) {
    console.error('Captcha error:', err);
    return res.status(500).json({ error: 'CAPTCHA verification error.' });
  }

  const target = type === 'bug' ? 'youbrokeit@snippyforquickbase.com' : 'ideagraveyard@snippyforquickbase.com';

  try {
    const transporter = nodemailer.createTransport({
      host: 'smtp.zoho.com',
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: `"Feedback from ${name}" <${process.env.SMTP_USER}>`,
      to: target,
      replyTo: email,
      subject: `Snippy Feedback from ${name}`,
      text: `Name: ${name}\nEmail: ${email}\nType: ${type}\n\n${message}`
    });

    
    res.json({ success: true });
  } catch (err) {
    console.error('❌ Feedback email error:', err);
    res.status(500).json({ error: 'Failed to send email.' });

  }
});


// Start server
app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Snippy backend running on port 3000');
});
