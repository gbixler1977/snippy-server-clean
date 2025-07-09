require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { addDonor, getCodeByEmail, isCodeValid, isCodeValidForEmail, isAdmin } = require('./db');

const app = express();

// ✅ Allow requests from Chrome Extensions
app.use((req, res, next) => {
  const origin = req.headers.origin;

  // TEMPORARY: allow all origins (for debugging)
  res.setHeader("Access-Control-Allow-Origin", "*");

  // Optional: tighten up later
  // if (origin && origin.startsWith("chrome-extension://")) {
  //   res.setHeader("Access-Control-Allow-Origin", origin);
  // }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

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










// DEBUGGING CODE

const { getAllDonors } = require('./db');

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

// END DEBUGGING CODE


app.post('/api/manual-add-code', async (req, res) => {
  const { email, name, code, auth } = req.body;

  if (auth !== process.env.ADMIN_SECRET) {
    return res.status(403).json({ error: 'Unauthorized' });
  }

  if (!email || !name) {
    return res.status(400).json({ error: 'Missing name or email' });
  }

  const finalCode = code || uuidv4();

  try {
    await addDonor({ name, email, code: finalCode, isAdmin: req.body.admin === true });
    res.json({ success: true, code: finalCode });
  } catch (err) {
    console.error('❌ Failed to add donor manually:', err);
    res.status(500).json({ error: 'Failed to add code' });
  }
});



// Start server
app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Snippy backend running on port 3000');
});
