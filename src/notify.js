// Optional email alert to your team when a booking or enquiry arrives.
// Turned on only when SMTP_HOST and NOTIFY_EMAIL are set in .env AND the
// nodemailer package is installed (run: npm install).
// If email fails, the submission is still saved; the error is only logged.

let nodemailer = null;
try { nodemailer = require('nodemailer'); } catch { /* optional */ }

let transporter = null;
const wanted = Boolean(process.env.SMTP_HOST && process.env.NOTIFY_EMAIL);
const enabled = wanted && Boolean(nodemailer);
if (wanted && !nodemailer) console.warn('[notify] SMTP is set in .env but nodemailer is not installed. Run "npm install" to turn on email alerts.');

if (enabled) {
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
}

function lines(obj) {
  return Object.entries(obj)
    .filter(([, v]) => v !== null && v !== undefined && v !== '')
    .map(([k, v]) => `${k}: ${v}`)
    .join('\n');
}

async function notify(kind, row) {
  if (!enabled) return;
  const subject = kind === 'booking'
    ? `New Kare@Home booking ${row.reference}: ${row.serviceName}`
    : `New KareIQ enquiry ${row.reference}: ${row.interestName}`;
  const body = kind === 'booking'
    ? lines({
        Reference: row.reference, Name: row.name, Phone: row.phone, Email: row.email,
        'Care for': row.careFor, Area: row.area, Service: row.serviceName, Package: row.packageName, 'Payment plan': row.billingName,
        'Preferred date': row.date, 'Preferred time': row.timeName, Notes: row.notes, Received: row.createdAt
      })
    : lines({
        Reference: row.reference, Name: row.name, Phone: row.phone, Email: row.email,
        Interest: row.interestName, Package: row.planName || '', Message: row.message, Page: row.source, Received: row.createdAt
      });
  try {
    await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: process.env.NOTIFY_EMAIL,
      subject,
      text: `${body}\n\nOpen the admin page to update its status.`
    });
  } catch (err) {
    console.error(`[notify] Email for ${row.reference} failed: ${err.message}`);
  }
}

// Email to one person (sign-in links from the KareIQ app). Needs SMTP_HOST + nodemailer.
const mailReady = Boolean(process.env.SMTP_HOST) && Boolean(nodemailer);
let personalTransport = null;
async function sendMail(to, subject, text) {
  if (!mailReady || !to) return false;
  personalTransport = personalTransport || transporter || nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: String(process.env.SMTP_SECURE || 'false') === 'true',
    auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined
  });
  try {
    await personalTransport.sendMail({ from: process.env.SMTP_FROM || process.env.SMTP_USER, to, subject, text });
    return true;
  } catch (err) {
    console.error(`[mail] "${subject}" failed: ${err.message}`); // the recipient's address stays out of the logs
    return false;
  }
}

// What is missing or inconsistent in the email settings (variable names only, never values).
// The server prints these at start in production and staging: without SMTP, booking alerts and the
// sign-in / password-reset emails are not sent, and the office has to share those links by hand.
function mailWarnings(env = process.env) {
  const w = [];
  const port = Number(env.SMTP_PORT || 587), secure = String(env.SMTP_SECURE || 'false') === 'true';
  if (!env.SMTP_HOST) { w.push('SMTP_HOST is not set: booking alerts and sign-in / password-reset emails are off.'); return w; }
  if (!nodemailer) w.push('SMTP_HOST is set but the nodemailer package is not installed (npm ci).');
  if (!env.NOTIFY_EMAIL) w.push('NOTIFY_EMAIL is not set: no booking or enquiry alerts are sent to the office.');
  if (!env.SMTP_FROM && !env.SMTP_USER) w.push('Neither SMTP_FROM nor SMTP_USER is set: emails have no sender address.');
  if (env.SMTP_USER && !env.SMTP_PASS) w.push('SMTP_USER is set without SMTP_PASS.');
  if (!Number.isInteger(port) || port < 1 || port > 65535) w.push('SMTP_PORT is not a valid port number.');
  else if (port === 465 && !secure) w.push('SMTP_PORT is 465 but SMTP_SECURE is not true (port 465 expects TLS from the start).');
  else if (port !== 465 && secure) w.push('SMTP_SECURE=true is usually only right with port 465 (587 upgrades with STARTTLS).');
  return w;
}

module.exports = { notify, sendMail, emailEnabled: enabled, mailReady, mailWarnings };
