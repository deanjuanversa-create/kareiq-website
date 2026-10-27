// KareIQ + Kare@Home web server — no dependencies, just Node.js 18+
//
//   node server.js
//
// - Serves the websites in /public  (KareIQ at /, Kare@Home at /kare-at-home, KareNest at /karenest)
// - Saves bookings and enquiries      (POST /api/bookings, POST /api/enquiries)
// - Password-protected admin page     (/admin, set ADMIN_PASSWORD in .env)
// - The KareIQ app                     (/app: families, caregivers and the office team sign in here;
//                                       people see Kare@Home and/or KareNest depending on their plan)
//
// Live setup: the websites are static on Vercel, which forwards /api/* and /admin* to this
// server on Render; data is stored in MongoDB Atlas (MONGODB_URI). Set SITE_URL on Render so
// visitors who open the Render address directly are sent to the real website.

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const crypto = require('crypto');

loadEnv(path.join(__dirname, '.env'));

const store = require('./src/store');
const catalog = require('./src/catalog');
const { validateBooking, validateEnquiry } = require('./src/validate');
const { notify, emailEnabled } = require('./src/notify');
const db = require('./src/db');
const content = require('./src/content');
const { createAppApi } = require('./src/app/api');
const appAuth = require('./src/app/auth');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || '';
// Vercel always sits behind its own proxy, so its forwarded headers are trusted there
const ON_VERCEL = Boolean(process.env.VERCEL);
const TRUST_PROXY = ON_VERCEL || String(process.env.TRUST_PROXY || 'false') === 'true';
const PUBLIC_DIR = path.join(__dirname, 'public');
const ADMIN_DIR = path.join(__dirname, 'admin');
const APP_DIR = path.join(__dirname, 'app');
const MAX_BODY = 64 * 1024; // content edits from admin can be larger than form posts
// When set (on Render), plain page visits go to the real website instead of a second copy of it
const SITE_URL = (process.env.SITE_URL || '').replace(/\/+$/, '');
// Websites allowed to call the API from the browser (comma-separated, exact origins)
const ALLOWED_ORIGINS = new Set((process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean));

// ---------- .env loader (KEY=value lines; real environment variables win) ----------
function loadEnv(file) {
  let text;
  try { text = fs.readFileSync(file, 'utf8'); } catch { return; }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (!m || line.trim().startsWith('#')) continue;
    let v = m[2];
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
    else v = v.replace(/\s+#.*$/, '');
    if (process.env[m[1]] === undefined) process.env[m[1]] = v;
  }
}

// ---------- helpers ----------
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.webp': 'image/webp', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8',
  '.woff2': 'font/woff2', '.xml': 'application/xml'
};

const SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Frame-Options': 'SAMEORIGIN',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data:",
    "connect-src 'self'",
    "form-action 'self'",
    "base-uri 'self'",
    "frame-ancestors 'self'"
  ].join('; ')
};

function send(res, status, body, headers = {}) {
  res.writeHead(status, { ...SECURITY_HEADERS, ...headers });
  res.end(body);
}

function json(res, status, data) {
  send(res, status, JSON.stringify(data), { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
}

function clientIp(req) {
  if (TRUST_PROXY && req.headers['x-forwarded-for']) return String(req.headers['x-forwarded-for']).split(',')[0].trim();
  return req.socket.remoteAddress || 'unknown';
}

function readJson(req) {
  // On Vercel the platform may already have read and parsed the body
  if (req.body !== undefined && req.body !== null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    if (JSON.stringify(req.body).length > MAX_BODY) return Promise.reject(Object.assign(new Error('That message is too long.'), { status: 413 }));
    return Promise.resolve(req.body);
  }
  if (typeof req.body === 'string' || Buffer.isBuffer(req.body)) {
    try { return Promise.resolve(JSON.parse(String(req.body) || '{}')); } catch { return Promise.reject(Object.assign(new Error('The form data could not be read.'), { status: 400 })); }
  }
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    if (!type.includes('application/json')) return reject(Object.assign(new Error('Send the form as JSON.'), { status: 415 }));
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > MAX_BODY) {
        reject(Object.assign(new Error('That message is too long.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {}); }
      catch { reject(Object.assign(new Error('The form data could not be read.'), { status: 400 })); }
    });
    req.on('error', reject);
  });
}

// ---------- rate limit for form posts: 8 per 10 minutes per device ----------
const hits = new Map();
const WINDOW_MS = 10 * 60 * 1000;
const MAX_POSTS = Number(process.env.RATE_LIMIT_POSTS) || 8; // form posts per device per 10 minutes
function limited(req, key) {
  const k = `${clientIp(req)}:${key}`;
  const now = Date.now();
  const list = (hits.get(k) || []).filter((t) => now - t < WINDOW_MS);
  if (list.length >= MAX_POSTS) { hits.set(k, list); return true; }
  list.push(now);
  hits.set(k, list);
  return false;
}
setInterval(() => {
  const now = Date.now();
  for (const [k, list] of hits) if (!list.some((t) => now - t < WINDOW_MS)) hits.delete(k);
}, WINDOW_MS).unref();

// ---------- admin auth (HTTP Basic) ----------
function safeEqual(a, b) {
  const ah = crypto.createHash('sha256').update(String(a)).digest();
  const bh = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ah, bh);
}
// Sessions: signing in on /admin/login sets an HttpOnly cookie holding a signed
// expiry time. Nothing is kept in server memory, so it works the same on one
// server or many (Vercel). Changing ADMIN_PASSWORD signs everyone out.
const SESSION_HOURS = 12;
const COOKIE = 'kq_admin';
const SESSION_KEY = crypto.createHash('sha256').update('kareiq-session:' + (process.env.SESSION_SECRET || '') + ':' + ADMIN_PASSWORD).digest();
const sign = (v) => crypto.createHmac('sha256', SESSION_KEY).update(v).digest('base64url');
function makeToken() {
  const payload = `${Date.now() + SESSION_HOURS * 3600 * 1000}.${crypto.randomBytes(9).toString('base64url')}`;
  return `${payload}.${sign(payload)}`;
}

function readCookie(req, name) {
  const h = String(req.headers.cookie || '');
  for (const part of h.split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}
function isHttps(req) {
  return Boolean(req.socket.encrypted) || (TRUST_PROXY && String(req.headers['x-forwarded-proto'] || '').startsWith('https'));
}
function sessionOf(req) {
  const t = readCookie(req, COOKIE);
  if (!t) return null;
  const i = t.lastIndexOf('.');
  if (i < 0) return null;
  const payload = t.slice(0, i);
  if (!safeEqual(t.slice(i + 1), sign(payload))) return null;
  const expires = Number(payload.split('.')[0]);
  if (!expires || expires < Date.now()) return null;
  return { user: ADMIN_USER, expires };
}

// Signed in to the KareIQ app as an office admin? Then the website editor opens too (one sign-in).
async function appAdmin(req) {
  try { const s = await appAuth.sessionOf(req); return Boolean(s && s.user && s.user.role === 'admin'); } catch { return false; }
}

// For pages: redirect to the sign-in page. For the API: a JSON 401 the admin page understands.
async function isAdmin(req, res, { page = false } = {}) {
  if (ADMIN_PASSWORD && sessionOf(req)) return true;
  if (await appAdmin(req)) return true;
  if (page) { send(res, 302, '', { Location: '/admin/login', 'Cache-Control': 'no-store' }); return false; }
  json(res, 401, { ok: false, signedOut: true, message: 'Please sign in again.' });
  return false;
}

async function handleLogin(req, res) {
  if (!ADMIN_PASSWORD) return json(res, 503, { ok: false, message: 'Admin sign-in is turned off. Add ADMIN_PASSWORD=your-password to the .env file and restart the server.' });
  if (limited(req, 'login')) return json(res, 429, { ok: false, message: 'Too many attempts. Wait a few minutes and try again.' });
  const body = await readJson(req);
  const password = typeof body.password === 'string' ? body.password : '';
  if (!password || !safeEqual(password, ADMIN_PASSWORD)) {
    await new Promise((r) => setTimeout(r, 400)); // slow down guessing
    return json(res, 401, { ok: false, message: 'That password is not right. Check ADMIN_PASSWORD in your .env file.' });
  }
  const token = makeToken();
  const cookie = `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}${isHttps(req) ? '; Secure' : ''}`;
  res.setHeader('Set-Cookie', cookie);
  console.log('[admin] signed in');
  return json(res, 200, { ok: true });
}

function handleLogout(req, res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${isHttps(req) ? '; Secure' : ''}`);
  return json(res, 200, { ok: true });
}

// ---------- static files ----------
async function serveFile(req, res, root, urlPath, { cache = true } = {}) {
  let rel;
  try { rel = decodeURIComponent(urlPath); } catch { return false; }
  if (rel.includes('\0')) return false;
  let file = path.normalize(path.join(root, rel));
  if (file !== root && !file.startsWith(root + path.sep)) return false; // no ../ escapes

  const candidates = [];
  if (rel.endsWith('/')) candidates.push(path.join(file, 'index.html'));
  else candidates.push(file, file + '.html', path.join(file, 'index.html'));

  for (const f of candidates) {
    let stat;
    try { stat = await fsp.stat(f); } catch { continue; }
    if (!stat.isFile()) continue;
    const ext = path.extname(f).toLowerCase();
    const type = MIME[ext] || 'application/octet-stream';
    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    const headers = {
      'Content-Type': type,
      'Cache-Control': !cache ? 'no-store' : ['.html', '.css', '.js'].includes(ext) ? 'no-cache' : 'public, max-age=86400',
      ETag: etag
    };
    if (req.headers['if-none-match'] === etag) { send(res, 304, undefined, headers); return true; }
    res.writeHead(200, { ...SECURITY_HEADERS, ...headers, 'Content-Length': stat.size });
    if (req.method === 'HEAD') { res.end(); return true; }
    fs.createReadStream(f).on('error', () => res.destroy()).pipe(res);
    return true;
  }
  return false;
}

async function notFound(req, res) {
  const page = path.join(PUBLIC_DIR, '404.html');
  try {
    const html = await fsp.readFile(page);
    send(res, 404, html, { 'Content-Type': 'text/html; charset=utf-8' });
  } catch {
    send(res, 404, 'Not found', { 'Content-Type': 'text/plain; charset=utf-8' });
  }
}

// ---------- API handlers ----------
const COLLECTIONS = { bookings: 'bookings', enquiries: 'enquiries' };
const STATUSES = ['new', 'contacted', 'scheduled', 'closed'];

async function handleSubmit(req, res, kind) {
  if (limited(req, kind)) {
    return json(res, 429, { ok: false, message: 'Too many requests from this device. Please wait a few minutes, or call us directly.' });
  }
  const body = await readJson(req);
  const isBooking = kind === 'booking';
  if (body.website) return json(res, 201, { ok: true, reference: isBooking ? 'KH-RECEIVED' : 'KQ-RECEIVED' }); // honeypot: only bots fill this
  if (isBooking) await content.get(); // current package names
  const { errors, value } = isBooking ? validateBooking(body) : validateEnquiry(body);
  if (Object.keys(errors).length) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors });
  const row = isBooking
    ? await store.add('bookings', 'KH', { ...value, page: 'kare-at-home' })
    : await store.add('enquiries', 'KQ', value);
  notify(kind, row);
  console.log(`[${kind}] ${row.reference} ${row.name} ${row.phone} ${isBooking ? row.serviceName : row.interestName + (row.planName ? ' / ' + row.planName : '')}`);
  json(res, 201, { ok: true, reference: row.reference });
}

function toCsv(name, rows) {
  const cols = name === 'bookings'
    ? ['reference', 'createdAt', 'status', 'name', 'phone', 'email', 'careForName', 'area', 'serviceName', 'packageName', 'billingName', 'date', 'timeName', 'notes', 'adminNote']
    : ['reference', 'createdAt', 'status', 'name', 'phone', 'email', 'interestName', 'planName', 'message', 'source', 'adminNote'];
  const esc = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+\-@\t\r]/.test(s) && !/^\+\d{6,15}$/.test(s)) s = `'${s}`; // stop spreadsheet formula injection (phone numbers are safe)
    return `"${s.replace(/"/g, '""')}"`;
  };
  return '﻿' + [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n');
}

async function handleAdminApi(req, res, parts) {
  if (!(await isAdmin(req, res))) return;
  if (parts[0] === 'content') {
    if (req.method === 'GET' && parts.length === 1) return json(res, 200, { ok: true, content: await content.get(), defaults: content.DEFAULTS });
    if (req.method === 'PUT' && parts.length === 1) {
      const body = await readJson(req);
      const { errors, value } = content.validate(body);
      if (errors.length) return json(res, 400, { ok: false, message: 'Some fields need fixing before saving.', errors });
      const saved = await content.save(value);
      console.log('[content] website content updated');
      return json(res, 200, { ok: true, content: saved });
    }
    if (req.method === 'POST' && parts[1] === 'reset') {
      const fresh = await content.reset();
      console.log('[content] website content reset to defaults');
      return json(res, 200, { ok: true, content: fresh });
    }
    return json(res, 405, { ok: false, message: 'Not allowed.' });
  }
  const name = COLLECTIONS[parts[0]];
  if (!name) return json(res, 404, { ok: false, message: 'Unknown list.' });

  if (req.method === 'GET' && parts.length === 1) {
    return json(res, 200, { ok: true, rows: await store.readAll(name), statuses: STATUSES });
  }
  if (req.method === 'GET' && parts[1] === 'export.csv') {
    const csv = toCsv(name, await store.readAll(name));
    return send(res, 200, csv, {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${name}-${new Date().toISOString().slice(0, 10)}.csv"`,
      'Cache-Control': 'no-store'
    });
  }
  if (req.method === 'PATCH' && parts.length === 2) {
    const body = await readJson(req);
    const changes = {};
    if ('status' in body) {
      if (!STATUSES.includes(body.status)) return json(res, 400, { ok: false, message: 'Unknown status.' });
      changes.status = body.status;
    }
    if (typeof body.adminNote === 'string') changes.adminNote = body.adminNote.slice(0, 1000);
    const row = await store.update(name, parts[1], changes);
    if (!row) return json(res, 404, { ok: false, message: 'That entry no longer exists.' });
    return json(res, 200, { ok: true, row });
  }
  json(res, 405, { ok: false, message: 'Not allowed.' });
}

const appApi = createAppApi({ json, readJson, limited, isHttps, clientIp });

// ---------- CORS: the websites (Vercel) call this API on its own address ----------
// Only the public form/content endpoints are shared; the admin API stays same-origin.
const PUBLIC_API = new Set(['/api/bookings', '/api/enquiries', '/api/content.js', '/api/content', '/api/catalog', '/api/health', '/api/app/auth/providers']);
function cors(req, res, p) {
  const origin = String(req.headers.origin || '').replace(/\/+$/, '');
  if (!origin || !PUBLIC_API.has(p)) return false;
  res.setHeader('Vary', 'Origin');
  if (!ALLOWED_ORIGINS.has(origin)) return false;
  res.setHeader('Access-Control-Allow-Origin', origin);
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Access-Control-Max-Age': '86400'
    });
    res.end();
    return true;
  }
  return false;
}

// ---------- router ----------
async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  // Vercel sends /api/* and /admin/* to one function and passes the original path as ?__path=
  if (url.searchParams.has('__path')) {
    url.pathname = url.searchParams.get('__path') || '/';
    url.searchParams.delete('__path');
    req.url = url.pathname + url.search;
  }
  const p = url.pathname;

  if (p.startsWith('/api/')) {
    if (cors(req, res, p)) return; // answered a browser permission check
    if (p === '/api/health' && req.method === 'GET') {
      // ?db=1 also checks the database connection (for setup checks; uptime pings should use the plain URL)
      if (url.searchParams.get('db') === '1') {
        try { await db.ping(); } catch (e) { console.error('[db] ping failed:', e.message); return json(res, 503, { ok: false, storage: db.mode, message: 'Database not reachable' }); }
      }
      return json(res, 200, { ok: true, storage: db.mode, time: new Date().toISOString() });
    }
    if (p === '/api/catalog' && req.method === 'GET') return json(res, 200, catalog);
    if (p === '/api/content' && req.method === 'GET') return json(res, 200, await content.get());
    if (p === '/api/content.js' && req.method === 'GET') {
      // loaded by the pages before their own scripts, so edited prices and text apply without a flash
      return send(res, 200, `window.KARE_CONTENT=${JSON.stringify(await content.get()).replace(/</g, '\\u003c')};`, {
        'Content-Type': 'text/javascript; charset=utf-8',
        // pages load this in the background (js/api.js), so always fetch the latest: admin edits show at once
        'Cache-Control': 'no-cache'
      });
    }
    if (p === '/api/bookings' && req.method === 'POST') return handleSubmit(req, res, 'booking');
    if (p === '/api/enquiries' && req.method === 'POST') return handleSubmit(req, res, 'enquiry');
    if (p === '/api/admin/login' && req.method === 'POST') return handleLogin(req, res);
    if (p === '/api/admin/logout' && req.method === 'POST') return handleLogout(req, res);
    if (p === '/api/admin/session' && req.method === 'GET') return json(res, 200, { ok: true, configured: Boolean(ADMIN_PASSWORD), signedIn: Boolean(ADMIN_PASSWORD && sessionOf(req)) || await appAdmin(req), storage: db.mode });
    if (p.startsWith('/api/app/')) return appApi(req, res, p.slice('/api/app/'.length).split('/').filter(Boolean), url);
    if (p.startsWith('/api/admin/')) return handleAdminApi(req, res, p.slice('/api/admin/'.length).split('/').filter(Boolean));
    return json(res, 404, { ok: false, message: 'Not found.' });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, 'Method not allowed', { Allow: 'GET, HEAD' });

  if (p === '/admin' || p.startsWith('/admin/')) {
    // the sign-in page and its files are public
    if (p === '/admin/login' || p === '/admin/login/') {
      if ((ADMIN_PASSWORD && sessionOf(req)) || await appAdmin(req)) return send(res, 302, '', { Location: '/admin/', 'Cache-Control': 'no-store' });
      if (await serveFile(req, res, ADMIN_DIR, '/login.html', { cache: false })) return;
    }
    if (p === '/admin/login.js' || p === '/admin/login.css') {
      if (await serveFile(req, res, ADMIN_DIR, p.slice('/admin'.length), { cache: false })) return;
    }
    if (!(await isAdmin(req, res, { page: true }))) return;
    if (p === '/admin') return send(res, 301, '', { Location: '/admin/' });
    if (await serveFile(req, res, ADMIN_DIR, p.slice('/admin'.length), { cache: false })) return;
    return notFound(req, res);
  }

  // the KareIQ app (one page; the screens are drawn by app/app.js)
  if (p === '/app') return send(res, 301, '', { Location: '/app/' + url.search });
  if (p.startsWith('/app/')) {
    const rel = p.slice('/app'.length);
    if (rel === '/' || !path.extname(rel)) { if (await serveFile(req, res, APP_DIR, '/index.html', { cache: false })) return; }
    if (await serveFile(req, res, APP_DIR, rel)) return;
    return notFound(req, res);
  }
  // app.<your domain> opens the app directly
  if (p === '/' && /^app\./i.test(String(req.headers['x-forwarded-host'] || req.headers.host || ''))) return send(res, 302, '', { Location: '/app/', 'Cache-Control': 'no-store' });

  // page visits go to the real website; files (logos, icons) are still served for the admin panel
  if (SITE_URL && (!path.extname(p) || p.endsWith('.html'))) {
    // KareNest pages live at the root of karenest.co.in, without the /karenest folder
    const to = /karenest/i.test(SITE_URL) && /^\/karenest(\/|$)/.test(p) ? p.replace(/^\/karenest/, '') || '/' : p;
    return send(res, 302, '', { Location: SITE_URL + to + url.search, 'Cache-Control': 'no-store' });
  }

  // tidy URLs: /kare-at-home.html -> /kare-at-home
  if (p.endsWith('.html') && p !== '/404.html') {
    const clean = p === '/index.html' ? '/' : p.slice(0, -5);
    return send(res, 301, '', { Location: clean + url.search });
  }

  if (await serveFile(req, res, PUBLIC_DIR, p)) return;
  // trailing slash on a page that is a file (e.g. /karenest/live-with-us/) -> the clean address
  if (p.length > 1 && p.endsWith('/') && fs.existsSync(path.join(PUBLIC_DIR, path.normalize(p.slice(0, -1)) + '.html'))) {
    return send(res, 301, '', { Location: p.slice(0, -1) + url.search });
  }
  return notFound(req, res);
}

// One request handler, used by `node server.js` below and by Vercel (api/index.js)
function handler(req, res) {
  return route(req, res).catch((err) => {
    if (res.headersSent) return res.destroy();
    if (err.status) return json(res, err.status, { ok: false, message: err.message });
    console.error(err);
    json(res, 500, { ok: false, message: 'Something went wrong on our side. Please call us and we will help right away.' });
  });
}
module.exports = { handler };

if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(PORT, HOST, () => {
    const base = `http://localhost:${PORT}`;
    console.log('\n  KareIQ website is running');
    console.log(`  KareIQ:      ${base}/`);
    console.log(`  Kare@Home:   ${base}/kare-at-home`);
    console.log(`  KareNest:    ${base}/karenest`);
    console.log(`  KareIQ app:  ${base}/app   (families, caregivers and the office team sign in here)`);
    if (db.mode === 'file' && String(process.env.APP_DEMO || 'true') === 'true') console.log('               demo logins (password demo-pass-123): family@demo.kareiq (both)  arjun@demo.kareiq (Kare@Home only)  meena@demo.kareiq (KareNest + included Kare@Home)  nurse@demo.kareiq  admin@demo.kareiq');
    console.log(`  Admin:       ${base}/admin  ${ADMIN_PASSWORD ? '(sign in with ADMIN_PASSWORD from .env)' : '(off: add ADMIN_PASSWORD to .env, then restart)'}`);
    console.log(`  Storage:     ${{ mongo: 'MongoDB Atlas', redis: 'Upstash Redis', temporary: 'temporary (data will be lost)', file: 'files in the data folder' }[db.mode]}`);
    console.log(`  Email alerts: ${emailEnabled ? 'on' : 'off (optional, see README)'}\n`);
  });
  const shutdown = () => { server.close(() => process.exit(0)); setTimeout(() => process.exit(0), 3000).unref(); };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}
