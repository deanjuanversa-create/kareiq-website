#!/usr/bin/env node
// Builds the Kare@Home pages from tools/karehome/source.html (the original one-page site, kept as
// the single source of Kare@Home content). Each section becomes its own page with the shared
// header, footer and booking form:
//   /kare-at-home              home: introduction, About Us, Our Services, how it works, Contact
//   /kare-at-home/packages     care packages and prices (prices still come from the admin panel)
//   /kare-at-home/karebalance  KareBalance programme
// Run: node tools/karehome/build.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public');
const src = fs.readFileSync(path.join(__dirname, 'source.html'), 'utf8');
const VER = '20261028c';
const BASE = '/kare-at-home';

const between = (a, b, from = 0) => {
  const i = src.indexOf(a, from); if (i < 0) throw new Error('missing ' + a);
  const j = src.indexOf(b, i + a.length); if (j < 0) throw new Error('missing end ' + b);
  return src.slice(i, j + b.length);
};
const section = (id) => {
  const start = src.indexOf(`id="${id}"`); if (start < 0) throw new Error('no section ' + id);
  const i = src.lastIndexOf('<section', start);
  const j = src.indexOf('</section>', start) + '</section>'.length;
  return src.slice(i, j);
};

const head = src.slice(0, src.indexOf('<body>'));
const sprite = between('<!-- Icon set', '\n</svg>');
const footer = between('<!-- ============ FOOTER ============ -->', '</footer>');
const floaters = between('<a class="wa-float"', '</button>', src.indexOf('</footer>'));
const modal = between('<!-- ============ BOOKING MODAL ============ -->', '\n</div>\n', src.indexOf('id="modal"') - 200);
const S = { hero: section('about'), services: section('services'), how: section('how'), why: section('why'), packages: section('packages'), kb: section('karebalance') };

// About Us, Our Services and Contact are sections of the home page; Care Packages and
// KareBalance are pages of their own.
const PAGES = [
  { key: 'home', path: '', label: 'Home' },
  { key: 'packages', path: '/packages', label: 'Care Packages' },
  { key: 'karebalance', path: '/karebalance', label: 'KareBalance' }
];
const MENU = [
  { key: 'home', href: BASE, label: 'Home' },
  { key: 'about', href: BASE + '#about-us', label: 'About Us', section: true },
  { key: 'services', href: BASE + '#services', label: 'Our Services', section: true },
  { key: 'packages', href: BASE + '/packages', label: 'Care Packages' },
  { key: 'karebalance', href: BASE + '/karebalance', label: 'KareBalance' },
  { key: 'contact', href: BASE + '#contact', label: 'Contact', section: true }
];

function header(key) {
  const cur = (k) => (k === key ? ' aria-current="page" class="active"' : '');
  const link = (m) => `<li><a href="${m.href}"${cur(m.key)}${m.section ? ` data-section="${m.href.split('#')[1]}"` : ''}>${m.label}</a></li>`;
  const items = MENU.map(link).join('\n      ');
  return `<a class="skip" href="#main">Skip to main content</a>
<div class="kh-top">
  <div class="wrap kh-top-in">
    <a class="back-kiq" href="/" data-site="kareiq"><svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Back to KareIQ</a>
    <span class="kh-meta"><a href="tel:+918129345178" data-c="contact.phoneDisplay">+91 81293 45178</a><span aria-hidden="true">·</span><a href="https://chat.whatsapp.com/GAl7KV4ZxtY5FzKHkRZgyM" target="_blank" rel="noopener">WhatsApp us</a></span>
  </div>
</div>
<header class="nav" id="nav">
  <div class="wrap nav-in">
    <a href="${BASE}" class="logo" aria-label="Kare@Home home"${key === 'home' ? ' aria-current="page"' : ''}><img src="/img/karehome-logo.png" alt="Kare@Home" width="1407" height="395"></a>
    <nav class="menu-wrap" aria-label="Main">
    <ul class="menu" id="menu">
      ${items}
    </ul>
    </nav>
    <button class="btn btn-grad nav-cta" data-book><svg aria-hidden="true" width="24" height="24"><use href="#i-calendar"/></svg>Book a Service</button>
    <a class="app-in" href="/app/#/signin?brand=karehome" data-app="karehome" aria-label="Sign in for families and caregivers" title="Sign in for families and caregivers"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-3.8 3.8-6 7.5-6s6.6 2.2 7.5 6"/></svg><span>Sign in</span></a>
    <button class="burger" id="burger" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><span></span></button>
  </div>
  <nav class="drawer" id="drawer" aria-label="Menu">
    <div class="wrap">
      <ul>
        ${MENU.map(link).join('\n        ')}
        <li><a href="/app/#/signin?brand=karehome" data-app="karehome">Sign in (families and caregivers)</a></li>
        <li><a href="/" data-site="kareiq">← Back to KareIQ</a></li>
      </ul>
      <button class="btn btn-grad" data-book><svg aria-hidden="true" width="24" height="24"><use href="#i-calendar"/></svg>Book a Service</button>
    </div>
  </nav>
</header>`;
}

const crumbs = (label) => `<h1 class="sr">${label} | Kare@Home</h1>\n  <nav class="kh-crumbs wrap" aria-label="Breadcrumb"><ol><li><a href="${BASE}">Kare@Home</a></li><li aria-current="page">${label}</li></ol></nav>`;
// the section's own heading becomes the page heading
const asPage = (html) => html; // sections keep their own h2; each page gets its own h1 below

const arrow = '<svg aria-hidden="true" width="24" height="24"><use href="#i-arrow"/></svg>';
const explore = `<section class="kh-explore" aria-labelledby="explore-title">
    <div class="wrap">
      <div class="sec-intro rv">
        <h2 class="sec-title" id="explore-title">Packages &amp; Programmes</h2>
        <p class="sec-sub dark">Preventive care, at your doorstep.</p>
      </div>
      <ul class="kh-cards two">
        <li class="rv" style="--d:.1s"><a class="kh-card" href="${BASE}/packages"><span class="ic"><svg width="24" height="24"><use href="#i-house-plus"/></svg></span><b>Care Packages</b><small>Preventive care packages to meet your loved one's day-to-day health needs.</small><span class="go">See packages and prices ${arrow}</span></a></li>
        <li class="rv" style="--d:.15s"><a class="kh-card" href="${BASE}/karebalance"><span class="ic"><svg width="24" height="24"><use href="#i-physio"/></svg></span><b>KareBalance</b><small>Better Balance. Stronger Steps. Fewer Falls.</small><span class="go">About KareBalance ${arrow}</span></a></li>
      </ul>
    </div>
  </section>`;

const contact = `<section class="kh-contact" id="contact" aria-labelledby="contact-title">
    <div class="wrap">
      <div class="sec-intro rv">
        <h2 class="sec-title" id="contact-title">Contact Us</h2>
        <p class="sec-sub dark">Book a Service | Enquire Now</p>
        <p class="sec-text">Call or WhatsApp us with your requirements, or send a booking request and a care coordinator will call you to confirm.</p>
      </div>
      <ul class="kh-ways">
        <li class="rv" style="--d:.05s"><span class="ic"><svg width="24" height="24"><use href="#i-phone"/></svg></span><b>Call us</b><a class="big" href="tel:+918129345178" data-c="contact.phoneDisplay">+91 81293 45178</a></li>
        <li class="rv" style="--d:.1s"><span class="ic"><svg width="24" height="24"><use href="#i-hand-heart"/></svg></span><b>WhatsApp</b><a class="big" href="https://chat.whatsapp.com/GAl7KV4ZxtY5FzKHkRZgyM" target="_blank" rel="noopener">Message us on WhatsApp</a></li>
        <li class="rv" style="--d:.15s"><span class="ic"><svg width="24" height="24"><use href="#i-assess"/></svg></span><b>Book a home visit</b><button class="btn btn-grad" data-book><svg aria-hidden="true" width="24" height="24"><use href="#i-calendar"/></svg>Book a Service</button></li>
        <li class="rv" style="--d:.2s"><span class="ic"><svg width="24" height="24"><use href="#i-family"/></svg></span><b>Families and caregivers</b><a class="btn btn-line" href="/app/#/signin?brand=karehome" data-app="karehome">Sign in to My KareIQ</a></li>
      </ul>
      <p class="kh-follow"><a href="https://www.instagram.com/kare_homebykareiq/" target="_blank" rel="noopener"><svg aria-hidden="true" width="24" height="24"><use href="#i-camera"/></svg>Follow us @kare_homebykareiq</a><a href="https://chat.whatsapp.com/GAl7KV4ZxtY5FzKHkRZgyM" target="_blank" rel="noopener"><svg aria-hidden="true" width="24" height="24" viewBox="0 0 24 24"><path fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round" d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.6l-3.9.9Z"/><path fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round" d="M9.2 8.6c.2 2.8 3.4 6 6.2 6.2l1-1.4-1.9-1-.9.8c-1-.4-2.4-1.8-2.8-2.8l.8-.9-1-1.9-1.4 1Z"/></svg>Join our WhatsApp community</a></p>
    </div>
  </section>`;

// links inside sections that pointed at other sections of the old single page
const relink = (html) => html
  .replace(/href="#services"/g, `href="${BASE}#services"`)
  .replace(/href="#top"/g, `href="${BASE}"`)
  .replace(/href="#contact"/g, `href="${BASE}#contact"`);

const BODY = {
  // home: introduction, About Us (why Kare@Home), Our Services, how it works, packages, Contact
  home: relink(S.hero) + '\n\n  ' + S.why.replace('<section class="why" id="why">', '<section class="why" id="about-us">') + '\n\n  ' + S.services + '\n\n  ' + S.how + '\n\n  ' + explore + '\n\n  ' + contact,
  packages: crumbs('Care Packages') + '\n  ' + asPage(S.packages),
  karebalance: crumbs('KareBalance') + '\n  ' + asPage(S.kb)
};
const TITLES = {
  home: null,
  packages: ['Care Packages', 'HomeStart, HomePlus and HomeElite preventive care packages, or a customised plan. Choose a monthly, quarterly, half-yearly or annual payment plan.'],
  karebalance: ['KareBalance', 'KareBalance: a personalised fall prevention and mobility programme that helps older adults stay steady, active and independent.']
};

// old one-page links (/kare-at-home#packages) are sent to the new pages by js/karehome.js

// intro (see js/karehome-loader.js): only the markup lives here
const LOADER = `<div class="kh-loader" id="khLoader" role="status" aria-label="Loading Kare@Home">
  <div class="kh-stage">
    <svg class="kh-emblem" viewBox="0 0 200 170" aria-hidden="true">
      <defs>
        <linearGradient id="khGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#11998e"/><stop offset=".55" stop-color="#4b6fd8"/><stop offset="1" stop-color="#e4609e"/></linearGradient>
        <linearGradient id="khGrad2" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#e4609e"/><stop offset="1" stop-color="#8a63d2"/></linearGradient>
        <radialGradient id="khGlow"><stop offset="0" stop-color="#dff1f4"/><stop offset="1" stop-color="#dff1f4" stop-opacity="0"/></radialGradient>
      </defs>
      <circle class="kh-glow" cx="100" cy="85" r="85"/>
      <path class="kh-house" pathLength="1" d="M30 82 100 26l70 56M48 70v62h104V70"/>
      <path class="kh-heart" d="M100 120s-26-15-26-33a13 13 0 0 1 26-5 13 13 0 0 1 26 5c0 18-26 33-26 33Z"/>
      <path class="kh-pulse" pathLength="1" d="M8 150h52l8-14 10 26 10-34 10 22h94"/>
    </svg>
    <img class="kh-logo" src="/img/karehome-logo.png" alt="" width="1407" height="395">
    <div class="kh-msg">Healthier Lives. Brighter Tomorrows.</div>
  </div>
  <button class="kh-skip" type="button">Skip intro</button>
</div>`;

function page(p) {
  let h = head
    .replace(/<link rel="stylesheet" href="\/css\/karehome\.css\?v=[\w]+">/, `<link rel="stylesheet" href="/css/auth-popup.css?v=${VER}">\n<link rel="stylesheet" href="/css/karehome-loader.css?v=${VER}">\n<script src="/js/karehome-loader.js?v=${VER}"></script>\n<link rel="stylesheet" href="/css/karehome.css?v=${VER}">`)
    .replace(/\/js\/api\.js\?v=[\w]+/, '/js/api.js?v=' + VER);
  const t = TITLES[p.key];
  if (t) {
    h = h.replace(/<title>[^<]*<\/title>/, `<title>${t[0]} | Kare@Home</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${t[1]}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${t[0]} | Kare@Home">`);
  }
  return `${h}<body data-page="${p.key}">
${LOADER}

${sprite}

<div class="progress" id="progress" aria-hidden="true"></div>

${header(p.key)}

<main id="main" tabindex="-1">
  ${BODY[p.key]}
</main>

${relink(footer).replace('<footer class="foot" id="contact">', '<footer class="foot" id="site-footer">')}

${floaters}

${modal}

<script src="/js/forms.js?v=${VER}" defer></script>
<script src="/js/sites.js?v=${VER}" defer></script>
<script src="/js/content.js?v=${VER}" defer></script>
<script src="/js/karehome.js?v=${VER}" defer></script>
<script src="/js/auth-popup.js?v=${VER}" data-brand="karehome" defer></script>
</body>
</html>
`;
}

for (const p of PAGES) {
  const file = p.key === 'home' ? path.join(OUT, 'kare-at-home.html') : path.join(OUT, 'kare-at-home', p.path.slice(1) + '.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, page(p));
}
// pages from the earlier layout that are now sections of the home page
for (const old of ['about', 'services', 'contact']) fs.rmSync(path.join(OUT, 'kare-at-home', old + '.html'), { force: true });
console.log(`Kare@Home: ${PAGES.length} pages written (public/kare-at-home.html and public/kare-at-home/)`);
