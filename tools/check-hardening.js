// node tools/check-hardening.js
// Regression checks for the 28 Nov 2026 production-readiness findings. Starts its own servers on
// ports 3911-3922 with empty temporary data folders (never ./data), and needs no database:
//   1. environments and demo mode (src/runtime.js): production/staging refuse unsafe setups
//   2. demo logins never work outside demo mode, even if the database already holds them
//   3. client address behind trusted proxies only (src/net.js), HSTS on HTTPS only
//   4. no phone numbers or email addresses in the logs (src/logsafe.js)
//   5. booking de-duplication (same booking twice is one booking; real repeats are kept)
//   6. the shared /admin password is off; individual office logins; no customer becomes admin
//   7. the order lock (src/app/orderlock.js) and email through nodemailer (mocked, nothing sent)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.join(__dirname, '..');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS  ' + m); } else { fail++; console.log('FAIL  ' + m); } };
const tmp = (p) => fs.mkdtempSync(path.join(os.tmpdir(), 'kq-hard-' + p + '-'));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const BASE_ENV = { PATH: process.env.PATH, HOME: os.tmpdir() };

// start server.js with exactly these variables; resolves when it listens, or when it exits
function start(port, env) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ['server.js'], { cwd: ROOT, env: { ...BASE_ENV, PORT: String(port), HOST: '127.0.0.1', ...env } });
    let out = ''; let done = false;
    const finish = (v) => { if (!done) { done = true; resolve({ ...v, dataDir: env.DATA_DIR }); } };
    p.stdout.on('data', (d) => { out += d; if (/website is running/.test(out)) finish({ proc: p, out: () => out, up: true }); });
    p.stderr.on('data', (d) => { out += d; });
    p.on('exit', (code) => finish({ proc: p, out: () => out, up: false, code }));
    setTimeout(() => finish({ proc: p, out: () => out, up: false, code: 'timeout' }), 15000);
  });
}
const stop = async (s) => { if (s && s.proc && s.proc.exitCode === null) { s.proc.kill(); await sleep(300); } };

function client(port) {
  let cookie = '', csrf = '';
  const call = async (method, p, body, headers = {}) => {
    const h = { 'X-Requested-With': 'kareiq', cookie, ...headers };
    if (csrf) h['X-CSRF'] = csrf;
    if (body) h['Content-Type'] = 'application/json';
    const r = await fetch(`http://127.0.0.1:${port}${p}`, { method, headers: h, body: body ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie'); if (sc && /kq_app=/.test(sc)) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, body: j, headers: r.headers };
  };
  call.login = async (id, password = 'demo-pass-123') => { const r = await call('POST', '/api/app/login', { id, password }); if (r.status === 200) csrf = (await call('GET', '/api/app/session')).body.csrf; return r; };
  return call;
}

(async () => {
  // ---------------------------------------------------------------- 1. environments (unit)
  const runtime = require('../src/runtime');
  const v = (env) => runtime.validate(env);
  const SECRET = 'x'.repeat(32);
  ok(v({ APP_ENV: 'production', SESSION_SECRET: SECRET }).problems.some((x) => /needs its database/.test(x)), 'production without MONGODB_URI is refused (no file-mode fallback)');
  ok(v({ NODE_ENV: 'production', SESSION_SECRET: SECRET }).env.name === 'production' && v({ RENDER: 'true' }).env.name === 'production', 'a hosted server without APP_ENV counts as production (NODE_ENV / RENDER)');
  ok(v({ APP_ENV: 'Prod', MONGODB_URI: 'mongodb://h/x', SESSION_SECRET: SECRET }).env.name === 'production' && v({ APP_ENV: 'Prod' }).problems.some((x) => /not one of/.test(x)), 'a malformed APP_ENV is treated as production and reported');
  ok(v({ APP_ENV: 'production', MONGODB_URI: 'mongodb://h/x', SESSION_SECRET: SECRET, APP_DEMO: 'true' }).problems.some((x) => /must not run demo mode/.test(x)), 'production with APP_DEMO=true is refused');
  ok(v({ APP_ENV: 'production', MONGODB_URI: 'mongodb://h/x' }).problems.some((x) => /SESSION_SECRET/.test(x)), 'production without SESSION_SECRET is refused');
  ok(v({ APP_ENV: 'production', MONGODB_URI: 'mongodb://h/x', SESSION_SECRET: SECRET, MONGODB_DB: 'kareiq-demo' }).problems.some((x) => /live database/.test(x)), 'production pointed at a demo/staging database is refused');
  ok(v({ APP_ENV: 'production', MONGODB_URI: 'mongodb://h/x', SESSION_SECRET: SECRET }).problems.length === 0, 'a complete production configuration starts');
  ok(v({ APP_ENV: 'production', SESSION_SECRET: SECRET, FILE_STORAGE_CONFIRMED: 'true', DATA_DIR: '/srv/kareiq-data' }).problems.length === 0, 'a deliberately confirmed data folder on a persistent disk (VPS) is allowed');
  ok(['yes', 'TRUE', ''].every((x) => v({ APP_ENV: 'production', SESSION_SECRET: SECRET, FILE_STORAGE_CONFIRMED: x, DATA_DIR: '/srv/d' }).problems.length > 0) && v({ APP_ENV: 'production', SESSION_SECRET: SECRET, FILE_STORAGE_CONFIRMED: 'true' }).problems.length > 0, 'file storage without exactly FILE_STORAGE_CONFIRMED=true and an explicit DATA_DIR stays refused');
  ok(v({ APP_ENV: 'staging', MONGODB_URI: 'mongodb://h/x', SESSION_SECRET: SECRET }).problems.some((x) => /own database/.test(x)) && v({ APP_ENV: 'staging', MONGODB_URI: 'mongodb://h/x', SESSION_SECRET: SECRET, MONGODB_DB: 'kareiq' }).problems.some((x) => /own database/.test(x)), 'staging without its own database name, or on the live "kareiq", is refused');
  ok(v({ APP_ENV: 'staging', MONGODB_URI: 'mongodb://h/x', SESSION_SECRET: SECRET, MONGODB_DB: 'kareiq-staging' }).problems.length === 0, 'staging with its own database starts');
  ok(v({ APP_ENV: 'demo', MONGODB_URI: 'mongodb://h/x', MONGODB_DB: 'kareiq' }).problems.some((x) => /demo mode needs its own database/i.test(x)), 'a demo on the live database is refused');
  ok(runtime.resolve({ APP_DEMO: 'true' }).demo === true && runtime.resolve({}).demo === false, 'development: demo only with APP_DEMO=true (off by default, also in file mode)');
  ok(['TRUE', 'yes', '1', ' true'].every((x) => runtime.resolve({ APP_DEMO: x }).demo === false), 'a malformed APP_DEMO never turns demo mode on');
  ok(runtime.resolve({ VERCEL: '1', APP_ENV: 'demo' }).demo === true && v({ VERCEL: '1', APP_ENV: 'demo', APP_DEMO: 'true', APP_STATELESS: 'true' }).problems.length === 0, 'the Vercel demo (APP_ENV=demo, stateless) still starts');

  // ---------------------------------------------------------------- 1b. refusals at startup (spawned)
  let s = await start(3911, { APP_ENV: 'production', SESSION_SECRET: SECRET, DATA_DIR: tmp('p1') });
  ok(!s.up && s.code !== 0 && /will not start/.test(s.out()) && /MONGODB_URI/.test(s.out()), 'server: production in file mode exits before listening');
  s = await start(3912, { RENDER: 'true', SESSION_SECRET: SECRET, APP_DEMO: 'true', DATA_DIR: tmp('p2') });
  ok(!s.up && /must not run demo mode/.test(s.out()), 'server: hosted (RENDER) with APP_DEMO=true and no APP_ENV exits');
  ok(!/demo-pass-123|mongodb:\/\//.test(s.out()), 'the refusal message names variables only, never values');

  // ---------------------------------------------------------------- 2. demo logins outside demo mode
  const d = tmp('demo');
  s = await start(3913, { APP_DEMO: 'true', DATA_DIR: d });
  let c = client(3913);
  ok(s.up && (await c.login('admin@demo.kareiq')).status === 200, 'explicit demo mode (development, APP_DEMO=true): demo logins work');
  const demoCookie = c;
  await stop(s);
  // the same data folder (it now holds demo accounts) without demo mode, with a real first admin
  s = await start(3913, { DATA_DIR: d, ADMIN_PASSWORD: 'owner-pass-' + SECRET.slice(0, 8), ADMIN_EMAIL: 'owner@example.com' });
  c = client(3913);
  ok((await c.login('admin@demo.kareiq')).status === 401 && (await c.login('family@demo.kareiq')).status === 401 && (await c.login('+919800000001')).status === 401, 'without demo mode the demo logins are refused, even though the database holds them (by email and phone)');
  ok((await demoCookie('GET', '/api/app/session')).body.signedIn === false, 'a session made in demo mode is no longer valid');
  ok((await c.login('owner@example.com', 'owner-pass-' + SECRET.slice(0, 8))).status === 200, 'ADMIN_PASSWORD still creates the real first office admin (demo admins do not count)');
  await stop(s);
  const d2 = tmp('nodemo');
  s = await start(3914, { DATA_DIR: d2 });
  c = client(3914);
  ok(s.up && (await c.login('admin@demo.kareiq')).status === 401, 'development without demo mode: no demo logins');
  ok(!/demo@|demo\.kareiq/.test(fs.existsSync(path.join(d2, 'app_users.json')) ? fs.readFileSync(path.join(d2, 'app_users.json'), 'utf8') : '') && !/demo logins/.test(s.out()), 'development without demo mode: no demo accounts created, none announced');
  await stop(s);
  ok(await (async () => { process.env.DATA_DIR = tmp('seed'); delete process.env.APP_DEMO; delete process.env.APP_ENV; try { await require('../src/app/demo').seed(); return false; } catch (e) { return /only be created in demo mode/.test(e.message); } })(), 'demo seeding itself refuses to run outside demo mode');

  // ---------------------------------------------------------------- 3. client address and HTTPS (unit)
  const net = require('../src/net');
  const req = (h, addr = '10.1.1.1', enc = false) => ({ headers: h, socket: { remoteAddress: addr, encrypted: enc } });
  ok(net.clientIp(req({ 'x-forwarded-for': '1.2.3.4' }), {}) === '10.1.1.1', 'without TRUST_PROXY forwarded headers are ignored (direct connection)');
  ok(net.clientIp(req({}), { TRUST_PROXY: 'true' }) === '10.1.1.1', 'trusted proxy, no header: the connection address');
  ok(net.clientIp(req({ 'x-forwarded-for': '203.0.113.9' }), { TRUST_PROXY: 'true' }) === '203.0.113.9', 'trusted proxy: the address it reports');
  ok(net.clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }), { TRUST_PROXY: 'true' }) === '203.0.113.9', 'a spoofed leftmost entry is ignored (the entry our proxy appended wins)');
  ok(net.clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9, 198.51.100.2' }), { TRUST_PROXY: 'true', TRUST_PROXY_HOPS: '2' }) === '203.0.113.9', 'two trusted proxies (TRUST_PROXY_HOPS=2)');
  ok(net.clientIp(req({ 'x-forwarded-for': '6.6.6.6, 203.0.113.9' }), { TRUST_PROXY: 'true', TRUST_PROXY_HOPS: 'abc' }) === '203.0.113.9', 'an invalid hop count falls back to 1');
  ok(net.isHttps(req({}, '', true), {}) && !net.isHttps(req({ 'x-forwarded-proto': 'https' }), {}) && net.isHttps(req({ 'x-forwarded-proto': 'https' }), { TRUST_PROXY: 'true' }) && !net.isHttps(req({ 'x-forwarded-proto': 'https, http' }), { TRUST_PROXY: 'true' }), 'HTTPS: TLS socket, or https from the trusted proxy only');

  // ---------------------------------------------------------------- 3b. HSTS and rate limits (spawned, behind a "proxy")
  s = await start(3915, { APP_DEMO: 'true', DATA_DIR: tmp('px'), TRUST_PROXY: 'true' });
  let r = await fetch('http://127.0.0.1:3915/', { headers: { 'X-Forwarded-Proto': 'https' } });
  ok(r.headers.get('strict-transport-security') === 'max-age=86400', 'HSTS on HTTPS through the trusted proxy (max-age=86400, no includeSubDomains/preload)');
  r = await fetch('http://127.0.0.1:3915/api/health', { headers: { 'X-Forwarded-Proto': 'https' } });
  ok(Boolean(r.headers.get('strict-transport-security')), 'HSTS on API answers too');
  r = await fetch('http://127.0.0.1:3915/');
  ok(!r.headers.get('strict-transport-security'), 'no HSTS on plain HTTP');
  const enq = (xff) => fetch('http://127.0.0.1:3915/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': xff }, body: JSON.stringify({ name: 'Rate Test', phone: '9876500000', interest: 'general', consent: true }) }).then((x) => x.status);
  const codes = []; for (let i = 0; i < 10; i++) codes.push(await enq(`10.9.${i}.1, 203.0.113.50`));
  ok(codes.filter((x) => x === 201).length === 8 && codes.slice(8).every((x) => x === 429), 'rotating a spoofed X-Forwarded-For no longer escapes the limit (' + codes.join(',') + ')');
  ok((await enq('203.0.113.51')) === 201, 'another real client is not affected');
  await stop(s);
  s = await start(3916, { APP_DEMO: 'true', DATA_DIR: tmp('np') });
  r = await fetch('http://127.0.0.1:3916/', { headers: { 'X-Forwarded-Proto': 'https' } });
  ok(!r.headers.get('strict-transport-security'), 'without TRUST_PROXY a forged X-Forwarded-Proto gives no HSTS');
  await stop(s);

  // ---------------------------------------------------------------- 4. personal data in logs
  const { redact, install } = require('../src/logsafe');
  ok(['+91 98765 43210', '+919876543210', '09876543210', '9876543210', '98765-43210', '+44 7911 123456'].every((x) => !/\d{5}/.test(redact('call ' + x + ' now'))), 'phone numbers in every common format are masked');
  ok(redact('mail priya.n+care@example.co.in failed') === 'mail [email] failed' && redact('admin@demo.kareiq') === 'admin@demo.kareiq', 'email addresses are masked (the public demo logins stay readable)');
  ok(redact('KH-3VWJJ9 at 1764318000123 took 15000ms, record 7f3a9c2e') === 'KH-3VWJJ9 at 1764318000123 took 15000ms, record 7f3a9c2e', 'references, timestamps and ids are kept for diagnosis');
  const got = []; const fake = { log: (...a) => got.push(a.join(' ')), info() {}, warn() {}, error: (...a) => got.push(a.join(' ')), debug() {} };
  install(fake);
  fake.error(new Error('E11000 duplicate key { phone: "+919876543210", email: "x@example.com" }'));
  fake.log({ name: 'A', phone: '9876543210' });
  ok(got.length === 2 && !/9876543210|x@example\.com/.test(got.join('\n')), 'errors and objects are masked too (e.g. a database duplicate-key error)');
  s = await start(3917, { APP_DEMO: 'true', DATA_DIR: tmp('logs'), SMTP_HOST: '127.0.0.1', SMTP_PORT: '1', NOTIFY_EMAIL: 'office@example.com' });
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() + 5 * 86400000));
  const bk = { name: 'Lakshmi Pillai', phone: '9876543210', email: 'lakshmi.p@example.com', area: 'Kochi', service: 'nursing', package: 'undecided', careFor: 'parent', date, time: 'evening', consent: true };
  const html = fs.readFileSync(path.join(ROOT, 'public', 'kare-at-home.html'), 'utf8');
  const first = (n) => (html.match(new RegExp('<select[^>]*name="' + n + '"[\\s\\S]*?<option value="([^"]+)"')) || [])[1];
  bk.service = first('service') || bk.service; bk.package = first('package') || bk.package;
  bk.careFor = (html.match(/name="careFor"[^>]*value="([^"]+)"/) || html.match(/value="([^"]+)"[^>]*name="careFor"/) || [])[1] || bk.careFor;
  const post = (p, b, h = {}) => fetch('http://127.0.0.1:3917' + p, { method: 'POST', headers: { 'Content-Type': 'application/json', ...h }, body: JSON.stringify(b) });
  r = await post('/api/bookings', bk);
  await post('/api/enquiries', { name: 'Lakshmi Pillai', phone: '+91 98765 43210', email: 'lakshmi.p@example.com', interest: 'general', consent: true });
  await sleep(1500); // the email alert fails (no SMTP server) and logs its error
  ok(r.status === 201 && /\[booking\] KH-/.test(s.out()), 'the booking is logged by its reference');
  ok(!/9876543210|98765 43210|lakshmi\.p@example\.com|office@example\.com|Lakshmi Pillai/.test(s.out()), 'no customer name, phone number or email address anywhere in the server log');

  // ---------------------------------------------------------------- 5. booking de-duplication
  const bk2 = { ...bk, phone: '9876543211', email: '' };
  const same = await Promise.all([1, 2, 3, 4, 5].map(() => post('/api/bookings', bk2).then((x) => x.json())));
  const refs = [...new Set(same.map((x) => x.reference))];
  ok(same.every((x) => x.ok) && refs.length === 1 && same.filter((x) => x.duplicate).length === 4, 'five identical bookings at the same moment: one booking, everyone gets its reference ' + refs.join(','));
  const again = await (await post('/api/bookings', bk2)).json();
  ok(again.ok && again.reference === refs[0] && again.duplicate, 'a retry a moment later returns the same booking');
  const other = await (await post('/api/bookings', { ...bk2, time: 'morning' })).json();
  ok(other.ok && other.reference !== refs[0] && !other.duplicate, 'the same person booking another time is a new booking');
  const bookings = JSON.parse(fs.readFileSync(path.join(s.dataDir, 'bookings.json'), 'utf8')).filter((x) => String(x.phone).replace(/\D/g, '').endsWith('9876543211'));
  ok(bookings.length === 2, 'storage: exactly two bookings for that number (' + bookings.length + ')');
  await stop(s);
  s = await start(3918, { APP_DEMO: 'true', DATA_DIR: tmp('dd'), BOOKING_DEDUP_MINUTES: '0.02' });
  const p18 = (b) => fetch('http://127.0.0.1:3918/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(b) }).then((x) => x.json());
  const a1 = await p18(bk2); await sleep(1600); const a2 = await p18(bk2);
  ok(a1.ok && a2.ok && a1.reference !== a2.reference && !a2.duplicate, 'the same booking again after the de-duplication window is kept as a new booking');
  await stop(s);

  // ---------------------------------------------------------------- 6. /admin: individual logins only
  s = await start(3919, { APP_DEMO: 'true', DATA_DIR: tmp('adm'), ADMIN_PASSWORD: 'shared-pass-1234' });
  c = client(3919);
  r = await c('POST', '/api/admin/login', { password: 'shared-pass-1234' });
  ok(r.status === 403 && r.body.individual && !r.headers.get('set-cookie'), 'the shared ADMIN_PASSWORD no longer signs in to /admin (default)');
  ok((await c('GET', '/api/admin/session')).body.sharedLogin === false, '/admin login page is told to use individual logins');
  ok((await c('GET', '/api/admin/bookings')).status === 401, 'signed out: the admin API refuses');
  await c.login('family@demo.kareiq');
  ok((await c('GET', '/api/admin/bookings')).status === 401 && (await c('GET', '/admin/', null)).status === 302, 'a customer login does not open /admin or its API');
  const a = client(3919); await a.login('admin@demo.kareiq');
  r = await a('GET', '/api/admin/bookings');
  ok(r.status === 200, 'an individual office admin login opens the admin API');
  const firstRow = (r.body.rows || [])[0];
  if (firstRow) { r = await a('PATCH', '/api/admin/bookings/' + firstRow.id, { status: 'contacted' }); ok(r.status === 200 && r.body.row.updatedBy && r.body.row.updatedBy !== 'shared-admin', 'changes in /admin record which admin made them'); }
  const nf = client(3919);
  r = await nf('POST', '/api/app/signup', { name: 'Real Customer', phone: '9876512399', password: 'real-pass-12345' });
  ok(r.status === 201, 'a new customer signs up');
  await nf.login('9876512399', 'real-pass-12345');
  await nf('POST', '/api/app/profile', { name: 'Real Customer', role: 'admin' });
  const me = (await nf('GET', '/api/app/session')).body;
  ok(me.user && me.user.role === 'family' && (await nf('GET', '/api/app/admin/users')).status === 403 && (await nf('GET', '/api/admin/bookings')).status === 401, 'a customer cannot make themselves an office admin (role stays family; office APIs refuse)');
  await stop(s);
  s = await start(3920, { APP_DEMO: 'true', DATA_DIR: tmp('sh'), ADMIN_PASSWORD: 'shared-pass-1234', ADMIN_SHARED_LOGIN: 'true' });
  ok((await client(3920)('POST', '/api/admin/login', { password: 'shared-pass-1234' })).status === 200, 'ADMIN_SHARED_LOGIN=true keeps the shared password for local work only');
  await stop(s);
  ok(v({ APP_ENV: 'production' }).env.shared && v({ APP_ENV: 'staging' }).env.shared, 'production and staging never allow the shared password (src/runtime.js env.shared)');

  // ---------------------------------------------------------------- 7. order lock and email (in-process)
  process.env.DATA_DIR = tmp('lock');
  const orderlock = require('../src/app/orderlock');
  const docs = require('../src/docs');
  let inside = 0, maxInside = 0;
  const lr = await Promise.all([1, 2, 3, 4].map(() => orderlock.withOrderLock('O1', async () => { inside++; maxInside = Math.max(maxInside, inside); await sleep(50); inside--; return 'done'; })));
  ok(lr.filter((x) => x.value === 'done').length === 1 && lr.filter((x) => x.busy).length === 3 && maxInside === 1, 'one change at a time per order: three simultaneous callers are told it is busy');
  await docs.insert('app_order_locks', { id: 'order:O2', at: Date.now() - orderlock.LOCK_MS - 1000 });
  ok((await orderlock.withOrderLock('O2', async () => 'ok')).value === 'ok', 'a lock left behind by a crash expires');
  ok(await orderlock.claimRef('UTR 123', 'O1') && await orderlock.claimRef('utr123', 'O1') && !(await orderlock.claimRef('UTR123', 'O9')), 'a transaction number belongs to one order (spaces and case ignored)');
  await docs.insert('app_orders', { id: 'O3', status: 'paid' });
  ok(!(await docs.updateIf('app_orders', 'O3', { status: { $in: ['awaiting_payment', 'awaiting_approval'] } }, { status: 'cancelled' })) && (await docs.findOne('app_orders', { id: 'O3' })).status === 'paid', 'compare-and-set: a paid order cannot be cancelled');

  // email: nodemailer replaced by a recorder (nothing is sent)
  const Module = require('module');
  const nmPath = require.resolve('nodemailer');
  const sent = [];
  const fakeNm = new Module(nmPath); fakeNm.loaded = true;
  fakeNm.exports = { createTransport: (o) => ({ sendMail: async (m) => { sent.push({ o, m }); if (m.to === 'bounce@example.com') throw new Error('550 mailbox bounce@example.com unavailable'); return { messageId: 'x' }; } }) };
  require.cache[nmPath] = fakeNm;
  Object.assign(process.env, { SMTP_HOST: 'smtp.example.com', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_USER: 'u', SMTP_PASS: 'p', NOTIFY_EMAIL: 'office@example.com', SMTP_FROM: 'KareIQ <no-reply@example.com>' });
  delete require.cache[require.resolve('../src/notify')];
  const notify = require('../src/notify');
  await notify.notify('booking', { reference: 'KH-TEST01', serviceName: 'Nursing', name: 'N', phone: '+919876543210', createdAt: 'now' });
  const okSend = await notify.sendMail('person@example.com', 'Your KareIQ sign-in link', 'link');
  // as in the server: the log goes through src/logsafe.js (server.js installs it at start)
  const logs = []; const origErr = console.error; console.error = (...x) => logs.push(x.join(' ')); require('../src/logsafe').install();
  const bad = await notify.sendMail('bounce@example.com', 'Welcome to KareIQ', 'text');
  console.error = origErr;
  ok(notify.emailEnabled && sent.length === 3 && sent[0].o.host === 'smtp.example.com' && sent[0].o.secure === true && sent[0].m.to === 'office@example.com' && /KH-TEST01/.test(sent[0].m.subject), 'booking alert built for the office (mocked transport)');
  ok(okSend === true && sent[1].m.to === 'person@example.com' && bad === false, 'personal emails sent through the same transport; a failure is reported as not sent');
  ok(logs.length === 1 && !/bounce@example\.com/.test(logs[0]) && /Welcome to KareIQ/.test(logs[0]), 'a failed email is logged by its subject; the recipient appears nowhere, not even inside the SMTP error');
  delete require.cache[nmPath];
  const real = require('nodemailer');
  const info = await real.createTransport({ streamTransport: true, buffer: true }).sendMail({ from: 'KareIQ <no-reply@example.com>', to: 'office@example.com', subject: 'New Kare@Home booking KH-TEST01', text: 'Reference: KH-TEST01' });
  ok(require('nodemailer/package.json').version.split('.')[0] >= 10 && /Subject: New Kare@Home booking KH-TEST01/.test(info.message.toString()), 'nodemailer ' + require('nodemailer/package.json').version + ' builds our message (local stream transport, nothing sent)');

  // ---------------------------------------------------------------- 8. email readiness and headers on every answer
  const nt = require('../src/notify');
  const mw = (env) => nt.mailWarnings(env);
  ok(mw({}).length === 1 && /SMTP_HOST is not set/.test(mw({})[0]), 'email readiness: no SMTP_HOST is reported (alerts and sign-in emails off)');
  ok(mw({ SMTP_HOST: 'h', SMTP_USER: 'u' }).some((x) => /NOTIFY_EMAIL/.test(x)) && mw({ SMTP_HOST: 'h', SMTP_USER: 'u' }).some((x) => /without SMTP_PASS/.test(x)), 'email readiness: missing NOTIFY_EMAIL and a user without a password are reported');
  ok(mw({ SMTP_HOST: 'h', SMTP_PORT: '465', NOTIFY_EMAIL: 'o@x', SMTP_FROM: 'f@x' }).some((x) => /465/.test(x)) && mw({ SMTP_HOST: 'h', SMTP_PORT: 'abc', NOTIFY_EMAIL: 'o@x', SMTP_FROM: 'f@x' }).some((x) => /valid port/.test(x)), 'email readiness: port/TLS mismatches and bad ports are reported');
  ok(mw({ SMTP_HOST: 'h', SMTP_PORT: '587', SMTP_USER: 'u', SMTP_PASS: 'p', NOTIFY_EMAIL: 'o@x' }).length === 0 && mw({ SMTP_HOST: 'h', SMTP_PORT: '465', SMTP_SECURE: 'true', SMTP_FROM: 'f@x', NOTIFY_EMAIL: 'o@x' }).length === 0, 'email readiness: complete settings give no warnings');
  ok(!JSON.stringify(mw({ SMTP_HOST: 'smtp.secret-host.example', SMTP_USER: 'user-x', SMTP_PORT: '465' })).match(/secret-host|user-x/), 'email readiness names variables only, never their values');
  s = await start(3921, { APP_ENV: 'production', SESSION_SECRET: SECRET, MONGODB_URI: 'mongodb://127.0.0.1:1/unused', DATA_DIR: tmp('mailw') });
  await sleep(800); // the warnings follow the first banner line
  ok(s.up && /\[email\] SMTP_HOST is not set/.test(s.out()), 'a production server prints the email readiness warnings at start');
  await stop(s);
  s = await start(3922, { APP_DEMO: 'true', DATA_DIR: tmp('hdr'), TRUST_PROXY: 'true' });
  c = client(3922); await c.login('family@demo.kareiq');
  const pid = ((await c('GET', '/api/app/people')).body.people || [])[0].id;
  let recId = null;
  for (const pp of (await c('GET', '/api/app/people')).body.people) { const x = (await c('GET', '/api/app/people/' + pp.id + '/records')).body; const row = (x.rows || x.records || []).find((y) => y.id); if (row) { recId = row.id; break; } }
  const must = ['content-security-policy', 'x-frame-options', 'referrer-policy', 'x-content-type-options', 'permissions-policy', 'strict-transport-security'];
  const missing = (h) => must.filter((k) => !h.get(k));
  if (recId) {
    for (const q of ['', '?view=1']) { const rr = await c('GET', '/api/app/records/' + recId + '/file' + q, null, { 'X-Forwarded-Proto': 'https' }); ok(rr.status === 200 && !missing(rr.headers).length, 'medical document ' + (q ? 'viewed in the browser' : 'downloaded') + ': every security header present (' + (missing(rr.headers).join(', ') || 'all') + ')'); }
  } else ok(false, 'the demo data has a medical document to download');
  const fx = client(3922); await fx.login('finance@demo.kareiq');
  const inv = ((await fx('GET', '/api/app/admin/finance/invoices?size=50')).body.rows || [])[0];
  if (inv) { const rr = await fx('GET', '/api/app/admin/finance/invoices/' + inv.planId + '/pdf', null, { 'X-Forwarded-Proto': 'https' }); ok(rr.status === 200 && /pdf/.test(rr.headers.get('content-type') || '') && !missing(rr.headers).length, 'invoice PDF: every security header present (' + (missing(rr.headers).join(', ') || 'all') + ')'); }
  const csv = await fx('GET', '/api/app/admin/fin/reports/payments.csv', null, { 'X-Forwarded-Proto': 'https' });
  if (csv.status === 200) ok(!missing(csv.headers).length, 'a CSV export: every security header present');
  ok(pid && (await c('GET', '/api/app/people/' + pid + '/photo')).headers.get('x-frame-options'), 'photos and other direct answers carry them too');
  await stop(s);

  console.log(`check-hardening: PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERROR', e && e.stack || e); process.exit(1); });
