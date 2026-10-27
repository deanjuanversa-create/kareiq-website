// Runs the Google / Facebook sign-in flow end to end against a local server with fake providers.
//   node tools/check-oauth.js            (starts its own server on port 3998, file storage)
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const PORT = 3998, BASE = `http://localhost:${PORT}`;
let failed = 0;
const ok = (c, m) => { console.log((c ? 'PASS ' : 'FAIL ') + m); if (!c) failed++; };
const cookieOf = (res, name) => { const all = res.headers.getSetCookie ? res.headers.getSetCookie() : [res.headers.get('set-cookie') || '']; const c = all.find((x) => x.startsWith(name + '=')); return c ? c.split(';')[0] : ''; };

async function run(profile) {
  process.env.FAKE_OAUTH_PROFILE = JSON.stringify(profile);
}
(async () => {
  const dataDir = fs.mkdtempSync(path.join(require('os').tmpdir(), 'kq-oauth-'));
  const env = { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, GOOGLE_CLIENT_ID: 'gid', GOOGLE_CLIENT_SECRET: 'gsecret', FACEBOOK_APP_ID: 'fid', FACEBOOK_APP_SECRET: 'fsecret', ALLOWED_ORIGINS: 'https://karenest.co.in' };
  let profile = {};
  const start = () => spawn(process.execPath, ['-r', path.join(__dirname, 'fakes', 'oauth-fetch.js'), 'server.js'], { cwd: path.join(__dirname, '..'), env: { ...env, FAKE_OAUTH_PROFILE: JSON.stringify(profile) }, stdio: 'ignore' });
  let srv = start();
  const restart = async (p) => { profile = p; srv.kill(); await new Promise((r) => setTimeout(r, 300)); srv = start(); await wait(); };
  const wait = async () => { for (let i = 0; i < 50; i++) { try { await fetch(BASE + '/api/health'); return; } catch { await new Promise((r) => setTimeout(r, 150)); } } };
  await wait();
  try {
    const pr = await (await fetch(BASE + '/api/app/auth/providers', { headers: { Origin: 'https://karenest.co.in' } }));
    const prj = await pr.json();
    ok(prj.providers.google && prj.providers.facebook, 'providers report Google and Facebook as available');
    ok(pr.headers.get('access-control-allow-origin') === 'https://karenest.co.in', 'providers endpoint allows the KareNest website (CORS)');

    async function flow(k, back, code = 'good') {
      const s = await fetch(`${BASE}/api/app/auth/${k}/start?brand=karenest&back=${encodeURIComponent(back)}`, { redirect: 'manual' });
      const loc = new URL(s.headers.get('location'));
      const state = loc.searchParams.get('state');
      const cookie = cookieOf(s, 'kq_oauth');
      const cb = await fetch(`${BASE}/api/app/auth/${k}/callback?state=${state}&code=${code}`, { redirect: 'manual', headers: { Cookie: cookie } });
      return { s, loc, state, cookie, cb, to: cb.headers.get('location') || '', app: cookieOf(cb, 'kq_app') };
    }
    // 1. Google, new person
    await restart({ sub: 'g-1', email: 'new.person@example.com', name: 'New Person' });
    let f = await flow('google', 'https://karenest.co.in/sign-in');
    ok(f.loc.origin === 'https://accounts.google.com' && f.loc.searchParams.get('code_challenge_method') === 'S256' && f.loc.searchParams.get('redirect_uri') === BASE + '/api/app/auth/google/callback', 'start redirects to Google with PKCE and our callback');
    ok(/HttpOnly/.test(f.s.headers.get('set-cookie')) && /SameSite=Lax/.test(f.s.headers.get('set-cookie')), 'state cookie is HttpOnly and SameSite=Lax');
    ok(f.to === '/app/#/karenest' && f.app, 'callback signs in and opens the KareNest app: ' + f.to);
    let me = await (await fetch(BASE + '/api/app/session', { headers: { Cookie: f.app } })).json();
    ok(me.signedIn && me.user.email === 'new.person@example.com' && me.user.role === 'family', 'session belongs to the new family account');
    // 2. replaying the same state fails (one-time)
    const replay = await fetch(`${BASE}/api/app/auth/google/callback?state=${f.state}&code=good`, { redirect: 'manual', headers: { Cookie: f.cookie } });
    ok(/error=/.test(replay.headers.get('location')) && !cookieOf(replay, 'kq_app'), 'a used state cannot be replayed (error, no sign-in)');
    // 3. wrong cookie
    const s2 = await fetch(`${BASE}/api/app/auth/google/start?back=https://karenest.co.in/sign-in`, { redirect: 'manual' });
    const st2 = new URL(s2.headers.get('location')).searchParams.get('state');
    const bad = await fetch(`${BASE}/api/app/auth/google/callback?state=${st2}&code=good`, { redirect: 'manual', headers: { Cookie: 'kq_oauth=somethingelse-somethingelse' } });
    ok(/error=/.test(bad.headers.get('location')) && !cookieOf(bad, 'kq_app'), 'state from another browser is rejected');
    // 4. a back address that is not ours is ignored
    f = await flow('google', 'https://evil.example/steal', 'bad');
    ok(f.to.startsWith('/app/#/signin?error='), 'unknown back address is ignored; errors go to the app sign-in page');
    // 5. provider refuses the code
    f = await flow('google', 'https://karenest.co.in/sign-in', 'bad');
    ok(/sign-in\?error=/.test(f.to) && !f.app, 'a refused code shows an error and does not sign in');
    // 6. existing account with the same email is linked, not duplicated
    await restart({ sub: 'fb-9', email: 'family@demo.kareiq', name: 'Demo Family' });
    f = await flow('facebook', 'https://karenest.co.in/sign-in');
    me = await (await fetch(BASE + '/api/app/session', { headers: { Cookie: f.app } })).json();
    ok(me.signedIn && me.user.email === 'family@demo.kareiq' && me.products.length >= 1, 'Facebook login links to the existing account with that email');
    // 7. no confirmed email -> refused
    await restart({ sub: 'fb-10', email: 'x@example.com', name: 'No Email', verified: false });
    f = await flow('facebook', 'https://karenest.co.in/sign-in');
    ok(/error=/.test(f.to) && !f.app, 'an account without a confirmed email is refused');
    // 8. switched off when keys are missing
    srv.kill(); await new Promise((r) => setTimeout(r, 300));
    srv = spawn(process.execPath, ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT), DATA_DIR: dataDir, ALLOWED_ORIGINS: 'https://karenest.co.in' }, stdio: 'ignore' }); await wait();
    const off = await (await fetch(BASE + '/api/app/auth/providers')).json();
    ok(!off.providers.google && !off.providers.facebook, 'without keys both providers report unavailable');
    const st = await fetch(`${BASE}/api/app/auth/google/start?back=https://karenest.co.in/sign-in`, { redirect: 'manual' });
    ok(/sign-in\?error=Google/.test(st.headers.get('location')), 'start without keys goes back with "not set up" instead of a fake login');
  } finally { srv.kill(); fs.rmSync(dataDir, { recursive: true, force: true }); }
  console.log(failed ? `${failed} failed` : 'all OAuth checks passed');
  process.exit(failed ? 1 : 0);
})();
