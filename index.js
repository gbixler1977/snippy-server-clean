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
  incrementClick,
  insertApprovedInsult
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
  const { email, name } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: 'Missing required fields.' });
  }

  const code = uuidv4();

  try {
    await addDonor({ name, email, code });

    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const mailOptions = {
      from: `"Snippy the Extension" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `🎉 Your Snippy Unlock Code`,
      text: `Thanks for donating, ${name}!\n\nHere is your Snippy unlock code:\n\n${code}\n\nPaste this into the Snippy Editor under Settings → Unlock Premium Features.`,
    };

    await transporter.sendMail(mailOptions);
    console.log(`✅ Email sent to ${email}.`);
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
      service: 'gmail',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    await transporter.sendMail({
      from: `"Snippy the Extension" <${process.env.SMTP_USER}>`,
      to: email,
      subject: `🔁 Your Snippy Unlock Code (Resent)`,
      text: `You asked for your unlock code. Here it is:\n\n${code}\n\nPaste this into Snippy's Settings to unlock premium features.`,
    });

    console.log(`📬 Resent unlock code to ${email}`);
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
  console.log("🔍 Incoming /api/verify-code request:", email, code);

  if (!email || !code) {
    return res.status(400).json({ valid: false, error: "Missing email or code" });
  }

  try {
    const valid = await isCodeValidForEmail(email, code);
    const admin = valid ? await isAdmin(email, code) : false;
    console.log("🔐 Code valid:", valid, "| isAdmin:", admin);
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
  } catch (err) {
    console.error("❌ reject-insult error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST: Admin – insert instantly approved insult
app.post('/api/insert-insult', async (req, res) => {
  const { text, submittedByName, submittedByEmail, showName, approvedByEmail, auth } = req.body;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: "Forbidden" });
  }

  if (!text || !submittedByEmail || !approvedByEmail) {
    return res.status(400).json({ error: "Missing required fields." });
  }

  try {
    const result = await insertApprovedInsult({ text, submittedByName, submittedByEmail, showName, approvedByEmail });
    res.json(result);
  } catch (err) {
    console.error("❌ insert-insult failed:", err);
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



// Start server
app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Snippy backend running on port 3000');
});
