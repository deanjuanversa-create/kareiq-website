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
        Interest: row.interestName, Message: row.message, Page: row.source, Received: row.createdAt
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

module.exports = { notify, emailEnabled: enabled };
