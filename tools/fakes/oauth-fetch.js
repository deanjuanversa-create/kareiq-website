// Test helper only (never loaded by the real server): pretends to be Google and Facebook so
// tools/check-oauth.js can run the whole sign-in flow offline.
//   node -r ./tools/fakes/oauth-fetch.js server.js
const real = global.fetch;
const who = () => JSON.parse(process.env.FAKE_OAUTH_PROFILE || '{}');
global.fetch = async (url, opts) => {
  const u = String(url);
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  if (u.startsWith('https://oauth2.googleapis.com/token') || u.startsWith('https://graph.facebook.com/v19.0/oauth/access_token')) {
    const body = String(opts && opts.body || '');
    if (!/code=good/.test(body)) return reply(400, { error: 'invalid_grant' });
    if (u.includes('googleapis') && !/code_verifier=/.test(body)) return reply(400, { error: 'missing verifier' });
    return reply(200, { access_token: 'fake-token', token_type: 'Bearer' });
  }
  if (u.startsWith('https://openidconnect.googleapis.com/v1/userinfo')) {
    const p = who(); return reply(200, { sub: p.sub, email: p.email, email_verified: p.verified !== false, name: p.name });
  }
  if (u.startsWith('https://graph.facebook.com/v19.0/me')) {
    const p = who(); return reply(200, { id: p.sub, name: p.name, ...(p.verified === false ? {} : { email: p.email }) });
  }
  return real(url, opts);
};
