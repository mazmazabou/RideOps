const nodemailer = require('nodemailer');

let transporter = null;
let emailConfigured = false;

async function initEmail() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.log('[email] SMTP not configured (set SMTP_HOST, SMTP_USER, SMTP_PASS). Emails will be logged to console.');
    return;
  }

  if (pass === 'PLACEHOLDER_REPLACE_ME') {
    console.warn('[email] SMTP_PASS is still set to PLACEHOLDER_REPLACE_ME — emails will be logged to console.');
    return;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: false,
    auth: { user, pass },
    tls: { rejectUnauthorized: true }
  });

  try {
    await transporter.verify();
    emailConfigured = true;
    console.log(`[email] SMTP verified and ready: ${host}:${port}`);
  } catch (err) {
    transporter = null;
    console.error(`[email] SMTP verification failed: ${err.message}`);
    console.log('[email] Emails will be logged to console until SMTP is fixed.');
  }
}

function isConfigured() {
  return emailConfigured;
}

function getFrom() {
  const name = process.env.FROM_NAME || 'RideOps';
  const email = process.env.FROM_EMAIL || process.env.SMTP_USER || 'hello@ride-ops.com';
  return `"${name}" <${email}>`;
}

async function sendEmail(to, subject, html) {
  if (!emailConfigured || !transporter) {
    console.log(`[email] (not sent) To: ${to} | Subject: ${subject}`);
    return false;
  }
  try {
    await transporter.sendMail({
      from: getFrom(),
      to,
      subject,
      html
    });
    console.log(`[email] Sent to ${to}: ${subject}`);
    return true;
  } catch (err) {
    console.error('[email] Failed to send:', err.message);
    return false;
  }
}

async function sendWelcomeEmail(email, name, username, tempPassword, role, orgName) {
  const org = orgName || 'RideOps';
  const roleLabel = role ? role.charAt(0).toUpperCase() + role.slice(1) : 'User';
  const subject = `Welcome to ${org}`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
      <div style="background:#990000;color:#FFCC00;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Welcome to ${org}</h2>
      </div>
      <div style="padding:20px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;">
        <p>Hi ${name},</p>
        <p>Your ${org} account has been created with the role <strong>${roleLabel}</strong>.</p>
        <p><strong>Username:</strong> ${username}<br>
        <strong>Temporary Password:</strong> ${tempPassword}</p>
        <p>You will be asked to change your password on your first login.</p>
        <p style="color:#666;font-size:13px;">${org}</p>
      </div>
    </div>
  `;
  return sendEmail(email, subject, html);
}

async function sendPasswordResetEmail(email, name, tempPassword, orgName) {
  const org = orgName || 'RideOps';
  const subject = `${org} — Password Reset`;
  const html = `
    <div style="font-family:Arial,sans-serif;max-width:500px;margin:0 auto;">
      <div style="background:#990000;color:#FFCC00;padding:16px 20px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;">Password Reset</h2>
      </div>
      <div style="padding:20px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px;">
        <p>Hi ${name},</p>
        <p>Your ${org} password has been reset by an administrator.</p>
        <p><strong>Temporary Password:</strong> ${tempPassword}</p>
        <p>You will be asked to change your password on your next login.</p>
        <p style="color:#666;font-size:13px;">${org}</p>
      </div>
    </div>
  `;
  return sendEmail(email, subject, html);
}

// Auto-initialize on require
initEmail();

module.exports = { isConfigured, sendWelcomeEmail, sendPasswordResetEmail };
