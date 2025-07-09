require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const { addDonor, getCodeByEmail, isCodeValid, isCodeValidForEmail } = require('./db');

const app = express();
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
app.get('/api/verify-code', async (req, res) => {
  const { email, code } = req.query;

  if (!email || !code) {
    return res.status(400).json({
      valid: false,
      error: "Missing email or code parameter."
    });
  }

  try {
    const isValid = await isCodeValidForEmail(email, code);
    res.json({ valid: isValid });
  } catch (err) {
    console.error("❌ Error verifying code and email:", err);
    res.status(500).json({ valid: false, error: "Server error while verifying." });
  }
});



// Start server
app.listen(process.env.PORT || 3000, () => {
  console.log('✅ Snippy backend running on port 3000');
});
