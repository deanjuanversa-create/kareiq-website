// "Continue with Google" and "Continue with Facebook" for the KareIQ app.
//
// A provider is switched on only when its keys are set on the server (Render → Environment):
//   GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET
//   FACEBOOK_APP_ID,  FACEBOOK_APP_SECRET
//   OAUTH_REDIRECT_BASE   the public address of this server, e.g. https://kareiq-api.onrender.com
// The redirect (callback) addresses to register with Google and Facebook are:
//   <OAUTH_REDIRECT_BASE>/api/app/auth/google/callback
//   <OAUTH_REDIRECT_BASE>/api/app/auth/facebook/callback
// Keys never leave the server. The websites only ask /api/app/auth/providers which ones are on.
//
// Flow: /start makes a one-time state (kept hashed in the database, the raw value in a short-lived
// HttpOnly cookie) and sends the browser to the provider. /callback checks the state, swaps the
// code for a token on the server, reads the person's verified email, then signs them in:
//   - an account already linked to this Google/Facebook login, or
//   - an existing account with the same (provider-verified) email, which gets linked, or
//   - a new family account (like "Create an account"; the office confirms details on the welcome call).

const crypto = require('crypto');
const docs = require('../docs');

const STATE_COOKIE = 'kq_oauth';
const STATE_TTL_MS = 10 * 60 * 1000;
const sha = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');
const b64url = (buf) => Buffer.from(buf).toString('base64url');

const PROVIDERS = {
  google: {
    name: 'Google',
    clientId: () => process.env.GOOGLE_CLIENT_ID,
    secret: () => process.env.GOOGLE_CLIENT_SECRET,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
    pkce: true,
    extra: { prompt: 'select_account' },
    async profile(tok) {
      const r = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: 'Bearer ' + tok.access_token } });
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.sub) throw new Error('google profile ' + r.status);
      return { sub: String(d.sub), email: d.email ? String(d.email).toLowerCase() : '', verified: d.email_verified === true || d.email_verified === 'true', name: d.name || '' };
    }
  },
  facebook: {
    name: 'Facebook',
    clientId: () => process.env.FACEBOOK_APP_ID,
    secret: () => process.env.FACEBOOK_APP_SECRET,
    authUrl: 'https://www.facebook.com/v19.0/dialog/oauth',
    tokenUrl: 'https://graph.facebook.com/v19.0/oauth/access_token',
    scope: 'email,public_profile',
    pkce: false,
    extra: {},
    async profile(tok) {
      const proof = crypto.createHmac('sha256', process.env.FACEBOOK_APP_SECRET).update(tok.access_token).digest('hex');
      const q = new URLSearchParams({ fields: 'id,name,email', access_token: tok.access_token, appsecret_proof: proof });
      const r = await fetch('https://graph.facebook.com/v19.0/me?' + q);
      const d = await r.json().catch(() => ({}));
      if (!r.ok || !d.id) throw new Error('facebook profile ' + r.status);
      // Facebook only returns an email address the person has confirmed with Facebook
      return { sub: String(d.id), email: d.email ? String(d.email).toLowerCase() : '', verified: Boolean(d.email), name: d.name || '' };
    }
  }
};

// where to go in the app after signing in, e.g. "#/plans?brand=karenest&plan=kareplus"
function safeNext(v) { const s = String(v || ''); return /^#\/[A-Za-z0-9\-\/?=&._]{0,150}$/.test(s) ? s : ''; }

const configured = (k) => Boolean(PROVIDERS[k] && PROVIDERS[k].clientId() && PROVIDERS[k].secret());
function providers() { const out = {}; for (const k of Object.keys(PROVIDERS)) out[k] = configured(k); return out; }

function readCookie(req, name) {
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=');
    if (i > -1 && part.slice(0, i).trim() === name) return decodeURIComponent(part.slice(i + 1).trim());
  }
  return null;
}

function createOAuth({ json, isHttps, signIn, audit, uid, now }) {
  const allowedOrigins = () => new Set((process.env.ALLOWED_ORIGINS || '').split(',').map((o) => o.trim().replace(/\/+$/, '')).filter(Boolean));
  function base(req) {
    if (process.env.OAUTH_REDIRECT_BASE) return process.env.OAUTH_REDIRECT_BASE.replace(/\/+$/, '');
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
    return `${isHttps(req) ? 'https' : 'http'}://${host}`;
  }
  // only send people back to one of our own websites
  function safeBack(req, v) {
    try {
      const u = new URL(String(v || ''));
      const origin = u.origin;
      if (origin === base(req) || allowedOrigins().has(origin) || /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin)) return u.origin + u.pathname;
    } catch (e) { /* not a URL */ }
    return '';
  }
  const stateCookie = (req, value, maxAge) => `${STATE_COOKIE}=${value}; Path=/api/app/auth; HttpOnly; SameSite=Lax; Max-Age=${maxAge}${isHttps(req) ? '; Secure' : ''}`;
  function redirect(res, location, cookie) {
    const h = { Location: location, 'Cache-Control': 'no-store' };
    if (cookie) h['Set-Cookie'] = cookie;
    res.writeHead(302, h);
    res.end();
  }
  function fail(req, res, back, message) {
    const to = back ? back + '?error=' + encodeURIComponent(message) : '/app/#/signin?error=' + encodeURIComponent(message);
    redirect(res, to, stateCookie(req, '', 0));
  }

  async function start(req, res, k, url) {
    const P = PROVIDERS[k];
    const back = safeBack(req, url.searchParams.get('back'));
    if (!configured(k)) return fail(req, res, back, `${P.name} sign-in isn't set up yet. Please continue with email.`);
    const state = b64url(crypto.randomBytes(32));
    const verifier = P.pkce ? b64url(crypto.randomBytes(48)) : null;
    const brand = /^(karehome|karenest)$/.test(url.searchParams.get('brand') || '') ? url.searchParams.get('brand') : '';
    await docs.removeWhere('app_oauth', { createdAt: { $lt: Date.now() - STATE_TTL_MS } }).catch(() => {});
    const next = safeNext(url.searchParams.get('next'));
    await docs.insert('app_oauth', { id: sha(state), provider: k, verifier, back, brand, next, createdAt: Date.now() });
    const q = new URLSearchParams({
      client_id: P.clientId(), redirect_uri: `${base(req)}/api/app/auth/${k}/callback`, response_type: 'code', scope: P.scope, state, ...P.extra
    });
    if (verifier) { q.set('code_challenge', b64url(crypto.createHash('sha256').update(verifier).digest())); q.set('code_challenge_method', 'S256'); }
    redirect(res, P.authUrl + '?' + q, stateCookie(req, state, STATE_TTL_MS / 1000));
  }

  async function callback(req, res, k, url) {
    const P = PROVIDERS[k];
    const state = url.searchParams.get('state') || '';
    const cookie = readCookie(req, STATE_COOKIE) || '';
    const row = state ? await docs.findOne('app_oauth', { id: sha(state) }) : null;
    if (row) await docs.remove('app_oauth', row.id);
    const back = row ? row.back : '';
    const same = cookie.length === state.length && state.length > 20 && crypto.timingSafeEqual(Buffer.from(cookie), Buffer.from(state));
    if (!row || !same || row.provider !== k || Date.now() - row.createdAt > STATE_TTL_MS) return fail(req, res, back, 'That sign-in took too long or was opened in another browser. Please try again.');
    if (url.searchParams.get('error')) return fail(req, res, back, `${P.name} sign-in was cancelled.`);
    if (!configured(k)) return fail(req, res, back, `${P.name} sign-in isn't set up yet. Please continue with email.`);
    const code = url.searchParams.get('code');
    if (!code) return fail(req, res, back, 'Sign-in did not finish. Please try again.');

    let profile;
    try {
      const form = new URLSearchParams({ client_id: P.clientId(), client_secret: P.secret(), code, redirect_uri: `${base(req)}/api/app/auth/${k}/callback`, grant_type: 'authorization_code' });
      if (row.verifier) form.set('code_verifier', row.verifier);
      const r = await fetch(P.tokenUrl, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: form });
      const tok = await r.json().catch(() => ({}));
      if (!r.ok || !tok.access_token) throw new Error(`${k} token ${r.status}`);
      profile = await P.profile(tok);
    } catch (e) {
      console.error('[oauth]', e.message);
      return fail(req, res, back, `We couldn't finish signing you in with ${P.name}. Please try again, or continue with email.`);
    }
    if (!profile.email || !profile.verified) return fail(req, res, back, `Your ${P.name} account didn't share a confirmed email address. Please continue with email instead.`);

    const field = 'oauth_' + k;
    let user = await docs.findOne('app_users', { [field]: profile.sub });
    let created = false;
    if (!user) {
      user = await docs.findOne('app_users', { email: profile.email });
      if (user) await docs.update('app_users', user.id, { [field]: profile.sub });
    }
    if (!user) {
      user = { id: uid(), name: (profile.name || profile.email.split('@')[0]).slice(0, 80), email: profile.email, phone: null, role: 'family', passwordHash: null, active: true, selfSignup: true, verified: false, [field]: profile.sub, createdAt: now() };
      await docs.insert('app_users', user);
      created = true;
    }
    if (!user.active) return fail(req, res, back, 'This account is switched off. Please contact us and we will help.');
    await signIn(req, res, user);
    await audit(user.id, created ? 'account.signup.' + k : 'signin.' + k);
    const where = row.next || (row.brand ? '#/' + row.brand : '#/');
    // signIn set the session cookie; add the cleared state cookie too
    const prev = res.getHeader('Set-Cookie');
    res.setHeader('Set-Cookie', [].concat(prev || [], stateCookie(req, '', 0)));
    res.writeHead(302, { Location: '/app/' + where, 'Cache-Control': 'no-store' });
    res.end();
  }

  return async function handle(req, res, parts, url) {
    // parts: ['auth', 'providers'] | ['auth', k, 'start'] | ['auth', k, 'callback']
    if (parts[1] === 'providers' && req.method === 'GET') return json(res, 200, { ok: true, providers: providers() });
    const k = parts[1];
    if (!PROVIDERS[k] || req.method !== 'GET') return json(res, 404, { ok: false, message: 'Not found.' });
    if (parts[2] === 'start') return start(req, res, k, url);
    if (parts[2] === 'callback') return callback(req, res, k, url);
    return json(res, 404, { ok: false, message: 'Not found.' });
  };
}

module.exports = { createOAuth, providers, PROVIDERS, safeNext };
