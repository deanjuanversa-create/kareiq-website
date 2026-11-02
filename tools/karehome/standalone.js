#!/usr/bin/env node
/* Writes the Kare@Home website on its own, at the root of its domain (karehome.co.in),
   ready to deploy as a separate Vercel project.
     node tools/karehome/build.js                  (first, if source.html changed)
     node tools/karehome/standalone.js ../karehome-only
   - Pages: /  (home), /packages, /bystander, /faq  (from public/kare-at-home*.html)
   - KareBalance and KareMind are on the KareWellness website (KAREWELLNESS); /karebalance redirects there.
   - KareIQ links go to KAREIQ, KareNest links to KARENEST, sign-in to the app on Render.
   - Privacy Policy and Terms are KareIQ's pages on KAREIQ.
   - Old addresses (/kare-at-home/...) typed on this domain redirect to the new ones. */
const fs = require('fs');
const path = require('path');

const KAREIQ = 'https://kareiq.co.in/';
const KARENEST = 'https://karenest.co.in/';
const KAREWELLNESS = 'https://karewellness.co.in/';
const API = 'https://kareiq-api.onrender.com';
const SELF = 'https://karehome.co.in';

const out = process.argv[2];
if (!out) { console.error('Usage: node tools/karehome/standalone.js <output folder>'); process.exit(1); }
const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.resolve(out);
if (OUT === ROOT || OUT.startsWith(ROOT + path.sep)) { console.error('Choose a folder outside the project, e.g. ../karehome-only'); process.exit(1); }

fs.rmSync(OUT, { recursive: true, force: true });
const write = (rel, text) => { const to = path.join(OUT, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.writeFileSync(to, text); };
const copy = (rel) => { const to = path.join(OUT, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(PUB, rel), to); };
const read = (rel) => fs.readFileSync(path.join(PUB, rel), 'utf8');
const edit = (name, s, from, to) => { const r = s.split(from).join(to); if (r === s) throw new Error(name + ': "' + from + '" not found (the file changed; update tools/karehome/standalone.js)'); return r; };

// ---------------------------------------------------------------- pages
const PAGES = { 'index.html': 'kare-at-home.html', 'packages.html': 'kare-at-home/packages.html', 'bystander.html': 'kare-at-home/bystander.html', 'faq.html': 'kare-at-home/faq.html' };
const rootLinks = (html) => html
  .replace(/href="\/kare-at-home"/g, 'href="/"')
  .replace(/href="\/kare-at-home#/g, 'href="/#')
  .replace(/href="\/kare-at-home\//g, 'href="/')
  .replace(/href="\/" data-site="kareiq"/g, `href="${KAREIQ}" data-site="kareiq"`)
  .replace(/href="\/karewellness\//g, `href="${KAREWELLNESS}`)
  .replace(/href="\/(privacy|terms)"/g, `href="${KAREIQ}$1" target="_blank" rel="noopener"`)
  .replace(/href="\/app\//g, `href="${API}/app/`)
  .replace(/content="\/img\//g, `content="${SELF}/img/`);
for (const [to, from] of Object.entries(PAGES)) {
  const html = rootLinks(read(from));
  if (/\/kare-at-home/.test(html.replace(/<script[\s\S]*?<\/script>/g, ''))) throw new Error(to + ': a /kare-at-home link is left');
  write(to, html);
}

// ---------------------------------------------------------------- scripts and styles
const ASSETS = ['css/karehome.css', 'css/faq.css', 'css/karehome-loader.css', 'css/auth-popup.css', 'css/page.css', 'css/pkg-menu.css', 'css/bystander.css',
  'js/api.js', 'js/content.js', 'js/forms.js', 'js/auth-popup.js', 'js/pkg-menu.js', 'js/bystander.js', 'js/faq-page.js'];
ASSETS.forEach(copy);

let sites = read('js/sites.js');
sites = sites.replace(/window\.KARE_SITES = \{[^}]*\}/, `window.KARE_SITES = {\n  kareiq:   '${KAREIQ}',\n  karehome: '/',\n  karenest: '${KARENEST}',\n  karewellness: '${KAREWELLNESS}'\n}`);
if (!sites.includes("karehome: '/'")) throw new Error('sites.js: could not set the addresses');
write('js/sites.js', sites);

let kh = read('js/karehome.js');
kh = edit('karehome.js', kh, "location.replace('/kare-at-home' + m[h])", 'location.replace(m[h])');
kh = edit('karehome.js', kh, "a.getAttribute('href') === '/kare-at-home'", "a.getAttribute('href') === '/'");
write('js/karehome.js', kh);

let loader = read('js/karehome-loader.js');
loader = edit('karehome-loader.js', loader, ' && /\\/kare-at-home/.test(new URL(document.referrer).pathname)', '');
write('js/karehome-loader.js', loader);

// ---------------------------------------------------------------- 404
write('404.html', `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>Page not found | Kare@Home</title>
<link rel="icon" type="image/png" href="/img/favicon-karehome.png">
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Libre+Caslon+Text&family=Outfit:wght@400;500;600&display=swap">
<link rel="stylesheet" href="/css/page.css?v=20261028a">
</head>
<body>
<header class="top"><div class="wrap"><a href="/"><img src="/img/karehome-logo.png" alt="Kare@Home" width="1407" height="395"></a><a class="back" href="${KAREIQ}">KareIQ →</a></div></header>
<main class="wrap center">
  <h1>This page isn't here</h1>
  <p>The link may be old or mistyped. Head back to the home page to find what you need.</p>
  <a class="btn" href="/">Go to the home page</a>
</main>
</body>
</html>
`);

// ---------------------------------------------------------------- images the pages and styles use
const used = new Set();
fs.readdirSync(OUT, { recursive: true }).filter((f) => /\.(html|css|js)$/.test(f)).forEach((f) => {
  const s = fs.readFileSync(path.join(OUT, f), 'utf8');
  for (const m of s.matchAll(/\/img\/([\w.\-\/]+\.(?:png|jpe?g|webp|svg|gif|ico))/g)) used.add('img/' + m[1]);
});
used.forEach((rel) => { if (fs.existsSync(path.join(PUB, rel))) copy(rel); });

// ---------------------------------------------------------------- vercel.json
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
delete vj.outputDirectory;
vj.redirects = [
  { source: '/kare-at-home', destination: '/', permanent: true },
  { source: '/kare-at-home/about', destination: '/#about-us', permanent: true },
  { source: '/kare-at-home/services', destination: '/#services', permanent: true },
  { source: '/kare-at-home/contact', destination: '/#contact', permanent: true },
  { source: '/kare-at-home/:path*', destination: '/:path*', permanent: true },
  { source: '/about', destination: '/#about-us', permanent: false },
  { source: '/services', destination: '/#services', permanent: false },
  { source: '/contact', destination: '/#contact', permanent: false },
  { source: '/index', destination: '/', permanent: false },
  { source: '/karebalance', destination: KAREWELLNESS + 'karebalance', permanent: false },
  { source: '/karewellness', destination: KAREWELLNESS, permanent: false },
  { source: '/karewellness/:path*', destination: KAREWELLNESS + ':path*', permanent: false },
  { source: '/privacy', destination: KAREIQ + 'privacy', permanent: false },
  { source: '/terms', destination: KAREIQ + 'terms', permanent: false },
  { source: '/karenest', destination: KARENEST, permanent: false },
  { source: '/karenest/:path*', destination: KARENEST + ':path*', permanent: false },
  { source: '/app', destination: API + '/app/', permanent: false },
  { source: '/app/:path*', destination: API + '/app/:path*', permanent: false },
  { source: '/admin', destination: API + '/admin/', permanent: false },
  { source: '/admin/:path*', destination: API + '/admin/:path*', permanent: false }
];
write('vercel.json', JSON.stringify(vj, null, 2) + '\n');

// ---------------------------------------------------------------- every local file the pages ask for is there
const missing = [];
fs.readdirSync(OUT).filter((f) => f.endsWith('.html')).forEach((f) => {
  const html = fs.readFileSync(path.join(OUT, f), 'utf8');
  for (const m of html.matchAll(/(?:src|href|srcset)="(\/(?:css|js|img)\/[^"?#\s]+)/g)) if (!fs.existsSync(path.join(OUT, m[1]))) missing.push(f + ' -> ' + m[1]);
});
if (missing.length) { console.error('Missing files:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log('Kare@Home website written to ' + OUT + ' (' + used.size + ' images)');
