#!/usr/bin/env node
/* Writes the KareIQ website on its own, ready to deploy as a separate Vercel project
   (the domain bought for KareIQ points at that project).
     node tools/kareiq/standalone.js ../kareiq-only
   - Copies only the KareIQ pages and the files they use from public/.
   - Kare@Home links go to KAREHOME below; KareNest links go to KARENEST.
   - /kare-at-home and /karenest typed on the KareIQ domain redirect there too.
   When Kare@Home gets its own domain, change KAREHOME and run this again. */
const fs = require('fs');
const path = require('path');

const KAREHOME = 'https://kareiq-website-full.vercel.app/kare-at-home';
const KARENEST = 'https://karenest.co.in/';
const API = 'https://kareiq-api.onrender.com';

const out = process.argv[2];
if (!out) { console.error('Usage: node tools/kareiq/standalone.js <output folder>'); process.exit(1); }
const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'public');
const OUT = path.resolve(out);

const FILES = [
  'index.html', 'privacy.html', 'terms.html', '404.html',
  'css/kareiq.css', 'css/loader.css', 'css/auth-popup.css', 'css/page.css',
  'js/api.js', 'js/content.js', 'js/loader.js', 'js/kareiq.js', 'js/forms.js', 'js/auth-popup.js'
];
const IMAGES = (f) => !/^(karehome-(hero|why|logo|logo-white)|favicon-karehome)\./.test(f);

fs.rmSync(OUT, { recursive: true, force: true });
const copy = (rel) => { const to = path.join(OUT, rel); fs.mkdirSync(path.dirname(to), { recursive: true }); fs.copyFileSync(path.join(PUB, rel), to); };
FILES.forEach(copy);
(function walk(dir) {
  fs.readdirSync(path.join(PUB, dir), { withFileTypes: true }).forEach((d) => {
    const rel = path.join(dir, d.name);
    if (d.isDirectory()) walk(rel); else if (IMAGES(d.name)) copy(rel);
  });
})('img');

// sites.js: same file, with Kare@Home pointing at its own address
let sites = fs.readFileSync(path.join(PUB, 'js/sites.js'), 'utf8');
sites = sites.replace(/window\.KARE_SITES = \{[^}]*\}/, (block) => block
  .replace(/kareiq:\s*[^\n]*,/, "kareiq:   '/',")
  .replace(/karehome:\s*'[^']*'/, `karehome: '${KAREHOME}'`)
  .replace(/karenest:\s*'[^']*'/, `karenest: '${KARENEST}'`));
if (!sites.includes(`karehome: '${KAREHOME}'`)) throw new Error('sites.js: could not set the Kare@Home address');
fs.writeFileSync(path.join(OUT, 'js/sites.js'), sites);

// pages without sites.js (privacy, terms, 404) link to Kare@Home directly
['privacy.html', 'terms.html', '404.html'].forEach((f) => {
  const p = path.join(OUT, f);
  fs.writeFileSync(p, fs.readFileSync(p, 'utf8').replace(/href="\/kare-at-home"/g, `href="${KAREHOME}"`));
});

// vercel.json: the main one, with redirects for this site only
const vj = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'));
delete vj.outputDirectory;
vj.redirects = [
  { source: '/kare-at-home', destination: KAREHOME, permanent: false },
  { source: '/kare-at-home/:path*', destination: KAREHOME + '/:path*', permanent: false },
  { source: '/karenest', destination: KARENEST, permanent: false },
  { source: '/karenest/:path*', destination: KARENEST + ':path*', permanent: false },
  { source: '/app', destination: API + '/app/', permanent: false },
  { source: '/app/:path*', destination: API + '/app/:path*', permanent: false },
  { source: '/admin', destination: API + '/admin/', permanent: false },
  { source: '/admin/:path*', destination: API + '/admin/:path*', permanent: false }
];
fs.writeFileSync(path.join(OUT, 'vercel.json'), JSON.stringify(vj, null, 2) + '\n');

// check every local file the pages ask for is there
const missing = [];
fs.readdirSync(OUT).filter((f) => f.endsWith('.html')).forEach((f) => {
  const html = fs.readFileSync(path.join(OUT, f), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="(\/(?:css|js|img)\/[^"?#]+)/g)) if (!fs.existsSync(path.join(OUT, m[1]))) missing.push(f + ' -> ' + m[1]);
});
if (missing.length) { console.error('Missing files:\n  ' + missing.join('\n  ')); process.exit(1); }
console.log('KareIQ website written to ' + OUT);
