// The client's address and whether the request came over HTTPS, behind trusted proxies only.
//
// X-Forwarded-For is a list: "client, proxy1, proxy2". Each proxy APPENDS the address it saw, so
// only the entries added by our own proxies can be believed; anything to their left was sent by the
// client and can be made up. With TRUST_PROXY=true (or on Vercel) the server trusts
// TRUST_PROXY_HOPS proxies (default 1: the platform's load balancer) and takes the entry that the
// outermost trusted proxy appended, counted from the right. Without TRUST_PROXY the forwarded
// headers are ignored and the connection's own address is used (local development, direct access).
//
//   TRUST_PROXY_HOPS=1   Render / Vercel (one load balancer in front of the app)
//   TRUST_PROXY_HOPS=2   e.g. a CDN in front of the platform's load balancer

function settings(env = process.env) {
  const trust = Boolean(env.VERCEL) || String(env.TRUST_PROXY || 'false') === 'true';
  const n = Math.floor(Number(env.TRUST_PROXY_HOPS || 1));
  return { trust, hops: Number.isFinite(n) && n >= 1 && n <= 10 ? n : 1 };
}

const list = (h) => String(h || '').split(',').map((s) => s.trim()).filter(Boolean);

// the entry appended by the outermost trusted proxy (or the leftmost one if the list is shorter)
function trustedEntry(header, hops) {
  const xs = list(header);
  if (!xs.length) return null;
  return xs[Math.max(0, xs.length - hops)];
}

function clientIp(req, env = process.env) {
  const { trust, hops } = settings(env);
  const direct = (req.socket && req.socket.remoteAddress) || 'unknown';
  if (!trust) return direct;
  return trustedEntry(req.headers['x-forwarded-for'], hops) || direct;
}

function isHttps(req, env = process.env) {
  if (req.socket && req.socket.encrypted) return true;
  const { trust, hops } = settings(env);
  if (!trust) return false;
  return String(trustedEntry(req.headers['x-forwarded-proto'], hops) || '').toLowerCase() === 'https';
}

module.exports = { clientIp, isHttps, settings, trustedEntry };
