// Keeps personal data out of the server logs (Render / Vercel keep them outside our control).
//
// install() wraps console.log/info/warn/error/debug once: every string, error and object written to
// the log has phone numbers and email addresses masked first, including messages that come from
// other code (e.g. a database "duplicate key" error that quotes the email, or an SMTP error that
// names the recipient). The public demo logins (@demo.kareiq) stay readable.
// Log a reference (KH-3VWJJ9, a record id) instead of personal details; this is the safety net.

const util = require('util');

const EMAIL = /[A-Za-z0-9._%+-]+@([A-Za-z0-9-]+\.)+[A-Za-z]{2,}/g;
// Indian mobile numbers (+91 98765 43210, 09876543210, 9876543210, 98765-43210) and other
// international numbers written with a + and 8 or more digits
const PHONE_IN = /(?<![\w+])(?:\+?91[\s-]?|0)?[6-9]\d{4}[\s-]?\d{5}(?!\d)/g;
const PHONE_INTL = /(?<![\w])\+\d{1,3}[\s-]?\d[\d\s-]{6,14}\d(?!\d)/g;

function redact(text) {
  return String(text)
    .replace(EMAIL, (m) => (/@demo\.kareiq$/i.test(m) ? m : '[email]'))
    .replace(PHONE_INTL, '[phone]')
    .replace(PHONE_IN, '[phone]');
}

function clean(arg) {
  if (typeof arg === 'string') return redact(arg);
  if (arg instanceof Error) return redact(arg.stack || String(arg));
  if (arg && typeof arg === 'object') return redact(util.inspect(arg, { depth: 4, breakLength: Infinity }));
  return arg;
}

let installed = false;
function install(target = console) {
  if (installed && target === console) return;
  for (const k of ['log', 'info', 'warn', 'error', 'debug']) {
    const orig = target[k].bind(target);
    target[k] = (...args) => orig(...args.map(clean));
  }
  if (target === console) installed = true;
}

module.exports = { install, redact };
