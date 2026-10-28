// Sign-in for the KareIQ app: passwords, sessions and one-time links.
//
// - Passwords are stored as scrypt hashes, never as text.
// - A session is a random token in an HttpOnly cookie; only its SHA-256 is stored.
//   Sessions end after APP_IDLE_MINUTES without activity (default 15) or APP_MAX_HOURS
//   in total (default 4), as the dashboard spec asks for health data.
// - Every change request must carry the session's CSRF token in the X-CSRF header.
// - "Set your password" and "reset password" links are single-use and expire.

const crypto = require('crypto');
const docs = require('../docs');

const IDLE_MS = Number(process.env.APP_IDLE_MINUTES || 15) * 60 * 1000;
const MAX_MS = Number(process.env.APP_MAX_HOURS || 4) * 3600 * 1000;
const COOKIE = 'kq_app';
const LINK_DAYS = { setup: 7, reset: 1 };

const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const token = () => crypto.randomBytes(32).toString('base64url');

// Stateless sessions (APP_STATELESS=true): for the public demo on Vercel without a database,
// where several short-lived copies of the server each have their own temporary storage.
// The session lives in the signed cookie itself, so any copy can read it.
const STATELESS = String(process.env.APP_STATELESS || '') === 'true';
const KEY = crypto.createHash('sha256').update('kq-stateless:' + (process.env.SESSION_SECRET || 'kareiq-demo')).digest();
const mac = (b) => crypto.createHmac('sha256', KEY).update(b).digest('base64url');
function sign(obj) { const b = Buffer.from(JSON.stringify(obj)).toString('base64url'); return b + '.' + mac(b); }
function unsign(t) {
  const [b, m] = String(t || '').split('.');
  if (!b || !m) return null;
  const want = mac(b);
  if (m.length !== want.length || !crypto.timingSafeEqual(Buffer.from(m), Buffer.from(want))) return null;
  try { return JSON.parse(Buffer.from(b, 'base64url').toString('utf8')); } catch { return null; }
}

// ---------- passwords ----------
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(String(password), salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

function checkPassword(password, stored) {
  const parts = String(stored || '').split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    crypto.scryptSync('x', 'timing-pad', 32); // same work either way
    return false;
  }
  const [, N, r, p, salt, hash] = parts;
  const want = Buffer.from(hash, 'base64');
  const got = crypto.scryptSync(String(password), Buffer.from(salt, 'base64'), want.length, { N: Number(N), r: Number(r), p: Number(p) });
  return crypto.timingSafeEqual(want, got);
}

function passwordProblem(password) {
  const p = String(password || '');
  if (p.length < 8) return 'Use at least 8 characters.';
  if (p.length > 200) return 'That password is too long.';
  if (/^(.)\1+$/.test(p) || ['12345678', '123456789', 'password', 'password1', 'qwertyui', '11111111'].includes(p.toLowerCase())) return 'That password is too easy to guess. Try a short sentence you will remember.';
  return null;
}

// ---------- cookies ----------
function readCookie(req, name) {
  const h = String(req.headers.cookie || '');
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function cookieHeader(value, secure, maxAgeSec) {
  return `${COOKIE}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${secure ? '; Secure' : ''}`;
}

// ---------- sessions ----------
async function startSession(userId) {
  const now = Date.now();
  if (STATELESS) return { token: sign({ u: userId, c: now, x: token() }), maxAgeSec: Math.floor(MAX_MS / 1000) };
  const t = token();
  await docs.insert('app_sessions', { id: sha(t), userId, csrf: token(), createdAt: now, lastSeen: now });
  return { token: t, maxAgeSec: Math.floor(MAX_MS / 1000) };
}

let lastSweep = 0;
async function sweep() {
  if (Date.now() - lastSweep < 10 * 60 * 1000) return;
  lastSweep = Date.now();
  const rows = await docs.find('app_sessions');
  const now = Date.now();
  for (const s of rows) if (now - s.lastSeen > IDLE_MS || now - s.createdAt > MAX_MS) await docs.remove('app_sessions', s.id);
}

// Returns { session, user } or null. Also keeps the session alive.
async function sessionOf(req) {
  const t = readCookie(req, COOKIE);
  if (STATELESS) {
    const d = t && t.length < 600 ? unsign(t) : null;
    if (!d || !d.u) return null;
    if (Date.now() - d.c > MAX_MS) return { expired: true };
    const u = await docs.findOne('app_users', { id: d.u });
    if (!u || !u.active) return null;
    return { session: { id: sha(t), userId: d.u, csrf: d.x, createdAt: d.c, lastSeen: Date.now() }, user: u };
  }
  if (!t || t.length > 100) return null;
  const s = await docs.findOne('app_sessions', { id: sha(t) });
  if (!s) return null;
  const now = Date.now();
  if (now - s.lastSeen > IDLE_MS || now - s.createdAt > MAX_MS) {
    await docs.remove('app_sessions', s.id);
    return { expired: true };
  }
  const user = await docs.findOne('app_users', { id: s.userId });
  if (!user || !user.active) { await docs.remove('app_sessions', s.id); return null; }
  if (now - s.lastSeen > 30 * 1000) { s.lastSeen = now; await docs.update('app_sessions', s.id, { lastSeen: now }); }
  sweep().catch(() => {});
  return { session: s, user };
}

async function endSession(req) {
  if (STATELESS) return; // the cookie is cleared by the caller
  const t = readCookie(req, COOKIE);
  if (t) await docs.remove('app_sessions', sha(t));
}

async function endAllSessions(userId, exceptId) {
  if (STATELESS) return;
  for (const s of await docs.find('app_sessions', { userId })) if (s.id !== exceptId) await docs.remove('app_sessions', s.id);
}

// ---------- one-time links ----------
async function makeLink(userId, purpose) {
  // a new link replaces older unused ones
  for (const old of await docs.find('app_tokens', { userId, purpose })) await docs.remove('app_tokens', old.id);
  const t = token();
  const expiresAt = Date.now() + LINK_DAYS[purpose] * 86400 * 1000;
  await docs.insert('app_tokens', { id: sha(t), userId, purpose, expiresAt, createdAt: Date.now() });
  return { token: t, expiresAt };
}

async function readLink(t) {
  if (!t || typeof t !== 'string' || t.length > 100) return null;
  const row = await docs.findOne('app_tokens', { id: sha(t) });
  if (!row || row.expiresAt < Date.now()) return null;
  const user = await docs.findOne('app_users', { id: row.userId });
  if (!user || !user.active) return null;
  return { row, user };
}

async function useLink(row) { await docs.remove('app_tokens', row.id); }

module.exports = {
  COOKIE, IDLE_MS, MAX_MS, hashPassword, checkPassword, passwordProblem, cookieHeader,
  startSession, sessionOf, endSession, endAllSessions, makeLink, readLink, useLink, sha, sign, unsign, STATELESS
};
