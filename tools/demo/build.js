#!/usr/bin/env node
/* Writes a DEMO copy of everything (KareIQ, Kare@Home, KareNest websites + My KareIQ app + API)
   that runs as one separate Vercel project, filled with sample people and demo logins.
     node tools/demo/build.js ../kareiq-demo
   Then deploy that folder as a NEW Vercel project. It never talks to the live Render server:
   pages, sign-in and forms all use the demo project's own /api.
   Storage: none needed. Without a database every copy of the server builds the same sample data
   and sign-ins are kept in the browser cookie; changes visitors make are not kept for long.
   Optional: MONGODB_URI + MONGODB_DB=kareiq-demo (a separate database, never the live "kareiq")
   keeps changes too.
   No passwords or .env files are copied. */
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
if (!out) { console.error('Usage: node tools/demo/build.js <output folder>'); process.exit(1); }
const ROOT = path.join(__dirname, '..', '..');
const OUT = path.resolve(out);
if (OUT === ROOT || OUT.startsWith(ROOT + path.sep)) { console.error('Choose a folder outside the project, e.g. ../kareiq-demo'); process.exit(1); }

// ---------------------------------------------------------------- copy
const SKIP = new Set(['.git', 'node_modules', 'data', '.vercel', '.env', '.env.local', 'tools', 'render.yaml', 'vercel.json', 'README.md']);
fs.rmSync(OUT, { recursive: true, force: true });
fs.mkdirSync(OUT, { recursive: true });
(function walk(rel) {
  fs.readdirSync(path.join(ROOT, rel), { withFileTypes: true }).forEach((d) => {
    if (SKIP.has(d.name) || /^\.env/.test(d.name)) return;
    const r = path.join(rel, d.name);
    if (d.isDirectory()) { fs.mkdirSync(path.join(OUT, r), { recursive: true }); walk(r); }
    else fs.copyFileSync(path.join(ROOT, r), path.join(OUT, r));
  });
})('');
// the server reads the KareNest package list (names, wording, prices) from here
fs.mkdirSync(path.join(OUT, 'tools/karenest'), { recursive: true });
fs.copyFileSync(path.join(ROOT, 'tools/karenest/data.js'), path.join(OUT, 'tools/karenest/data.js'));
// the server also reads the KareBalance, KareMind and Bystander prices from tools/shared
fs.mkdirSync(path.join(OUT, 'tools/shared'), { recursive: true });
for (const f of fs.readdirSync(path.join(ROOT, 'tools/shared'))) fs.copyFileSync(path.join(ROOT, 'tools/shared', f), path.join(OUT, 'tools/shared', f));
const edit = (rel, fn) => {
  const f = path.join(OUT, rel), before = fs.readFileSync(f, 'utf8'), after = fn(before);
  if (after === before) throw new Error('Nothing changed in ' + rel + ' (the file was probably edited; update tools/demo/build.js)');
  fs.writeFileSync(f, after);
};

// ---------------------------------------------------------------- everything on this one site
edit('public/js/api.js', (s) => s.replace(/window\.KARE_API = [^;]+;/, "window.KARE_API = ''; // demo: this site's own API"));
edit('public/js/sites.js', (s) => s
  .replace(/window\.KARE_SITES = \{[^}]*\}/, "window.KARE_SITES = {\n  kareiq:   '/',\n  karehome: '/kare-at-home',\n  karenest: '/karenest',\n  karewellness: '/karewellness/'\n}")
  .replace(/window\.KARE_APP = [^;]+;/, "window.KARE_APP = '/app/';"));
edit('app/app.js', (s) => s.replace(/var SITES = \{[^}]*\};/, "var SITES = { kareiq: '/', karehome: '/kare-at-home', karenest: '/karenest', karewellness: '/karewellness/' };"));
// the server turns on the demo logins for this copy
edit('api/index.js', (s) => s.replace("const { handler }", [
  "process.env.APP_DEMO = process.env.APP_DEMO || 'true';",
  "// no database: every copy of the server builds the same sample data and sign-ins live in the cookie",
  "if (!process.env.MONGODB_URI && !process.env.KV_REST_API_URL && !process.env.UPSTASH_REDIS_REST_URL) process.env.APP_STATELESS = 'true';",
  'const { handler }'
].join('\n')));

// ---------------------------------------------------------------- "demo" ribbon on every page
fs.writeFileSync(path.join(OUT, 'public/js/demo-banner.js'), `/* Demo site ribbon: says this is sample data and gives the demo sign-in. */
(function () {
  try { if (sessionStorage.getItem('kq-demo-hide')) return; } catch (e) {}
  var b = document.createElement('div');
  b.setAttribute('role', 'note');
  b.style.cssText = 'position:fixed;left:50%;bottom:14px;transform:translateX(-50%);z-index:2147483000;max-width:calc(100% - 24px);display:flex;gap:10px;align-items:center;padding:9px 10px 9px 16px;border-radius:999px;background:#1d2b3a;color:#fff;font:500 13px/1.35 system-ui,-apple-system,Segoe UI,sans-serif;box-shadow:0 8px 24px rgba(0,0,0,.25)';
  b.innerHTML = '<span><b style="color:#ffd27a">Demo site</b> · sample data only. Sign in with <b>admin@demo.kareiq</b> / <b>demo-pass-123</b></span>' +
    '<button type="button" aria-label="Hide demo note" style="flex:none;width:28px;height:28px;border:0;border-radius:50%;background:rgba(255,255,255,.15);color:#fff;font-size:16px;cursor:pointer">×</button>';
  b.querySelector('button').onclick = function () { b.remove(); try { sessionStorage.setItem('kq-demo-hide', '1'); } catch (e) {} };
  (document.body ? Promise.resolve() : new Promise(function (r) { document.addEventListener('DOMContentLoaded', r); })).then(function () { document.body.appendChild(b); });
})();
`);
const tag = '<script src="/js/demo-banner.js" defer></script>';
const htmlFiles = [];
(function walk(dir) {
  fs.readdirSync(dir, { withFileTypes: true }).forEach((d) => {
    const f = path.join(dir, d.name);
    if (d.isDirectory()) walk(f); else if (d.name.endsWith('.html')) htmlFiles.push(f);
  });
})(path.join(OUT, 'public'));
htmlFiles.push(path.join(OUT, 'app/index.html'));
htmlFiles.forEach((f) => {
  let s = fs.readFileSync(f, 'utf8');
  if (!s.includes('</body>')) return;
  s = s.replace('</body>', tag + '\n</body>');
  if (!/name="robots"/.test(s)) s = s.replace('<head>', '<head>\n<meta name="robots" content="noindex, nofollow">');
  fs.writeFileSync(f, s);
});

// ---------------------------------------------------------------- vercel.json
const to = (p) => '/api/index?__path=' + p;
const headers = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8')).headers || [];
headers.forEach((h) => (h.headers || []).forEach((x) => {
  if (x.key === 'Content-Security-Policy') x.value = x.value.replace(/ https:\/\/kareiq-api\.onrender\.com| https:\/\/api\.karenest\.co\.in/g, '');
}));
(headers.find((h) => h.source === '/(.*)') || headers[headers.push({ source: '/(.*)', headers: [] }) - 1]).headers.push({ key: 'X-Robots-Tag', value: 'noindex, nofollow' });
const vercel = {
  $schema: 'https://openapi.vercel.sh/vercel.json',
  framework: null,
  outputDirectory: 'public',
  cleanUrls: true,
  trailingSlash: false,
  functions: { 'api/index.js': { includeFiles: '{app,admin,public,src,tools}/**', maxDuration: 15 } },
  redirects: [
    { source: '/kare-at-home/', destination: '/kare-at-home', permanent: false },
    { source: '/kare-at-home/about', destination: '/kare-at-home#about-us', permanent: false },
    { source: '/kare-at-home/services', destination: '/kare-at-home#services', permanent: false },
    { source: '/kare-at-home/contact', destination: '/kare-at-home#contact', permanent: false },
    ...['about', 'life', 'activities', 'community', 'contact'].map((x) => ({ source: '/karenest/' + x, destination: '/karenest#' + x, permanent: false }))
  ],
  rewrites: [
    { source: '/karenest', destination: '/karenest/index.html' },
    { source: '/api/:path*', destination: to('/api/:path*') },
    { source: '/app', destination: to('/app/') },
    { source: '/app/:path*', destination: to('/app/:path*') },
    { source: '/admin', destination: to('/admin/') },
    { source: '/admin/:path*', destination: to('/admin/:path*') }
  ],
  headers
};
fs.writeFileSync(path.join(OUT, 'vercel.json'), JSON.stringify(vercel, null, 2) + '\n');
fs.writeFileSync(path.join(OUT, '.vercelignore'), '.env\n.env.*\ndata\nnode_modules\n');
console.log('Demo site written to ' + OUT + ' (' + htmlFiles.length + ' pages marked as demo)');
