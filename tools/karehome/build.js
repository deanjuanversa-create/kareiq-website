#!/usr/bin/env node
// Builds the Kare@Home pages from tools/karehome/source.html (the original one-page site, kept as
// the single source of Kare@Home content). Each section becomes its own page with the shared
// header, footer and booking form:
//   /kare-at-home              home: introduction, where to go next, how it works
//   /kare-at-home/about        why Kare@Home
//   /kare-at-home/services     our services (each one opens the booking form)
//   /kare-at-home/packages     care packages and prices (prices still come from the admin panel)
//   /kare-at-home/karebalance  KareBalance programme
//   /kare-at-home/contact      phone, WhatsApp, booking and family sign-in
// Run: node tools/karehome/build.js
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public');
const src = fs.readFileSync(path.join(__dirname, 'source.html'), 'utf8');
const VER = '20261027a';
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

const PAGES = [
  { key: 'home', path: '', label: 'Home' },
  { key: 'about', path: '/about', label: 'About Us' },
  { key: 'services', path: '/services', label: 'Our Services' },
  { key: 'packages', path: '/packages', label: 'Care Packages' },
  { key: 'karebalance', path: '/karebalance', label: 'KareBalance' },
  { key: 'contact', path: '/contact', label: 'Contact' }
];
const href = (p) => BASE + p.path;

function header(key) {
  const cur = (k) => (k === key ? ' aria-current="page" class="active"' : '');
  const items = PAGES.map((p) => `<li><a href="${href(p)}"${cur(p.key)}>${p.label}</a></li>`).join('\n      ');
  return `<a class="skip" href="#main">Skip to main content</a>
<div class="kh-top">
  <div class="wrap kh-top-in">
    <a class="back-kiq" href="/" data-site="kareiq"><svg viewBox="0 0 24 24" aria-hidden="true" width="16" height="16"><path d="M19 12H5M11 6l-6 6 6 6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>Back to KareIQ</a>
    <span class="kh-meta"><a href="tel:+918129345178" data-c="contact.phoneDisplay">+91 81293 45178</a><span aria-hidden="true">·</span><a href="https://wa.me/918129345178" target="_blank" rel="noopener">WhatsApp us</a></span>
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
        ${PAGES.map((p) => `<li><a href="${href(p)}"${cur(p.key)}>${p.label}</a></li>`).join('\n        ')}
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
        <h2 class="sec-title" id="explore-title">Explore Kare@Home</h2>
        <p class="sec-sub dark">Preventive care, at your doorstep.</p>
      </div>
      <ul class="kh-cards">
        <li class="rv" style="--d:.05s"><a class="kh-card" href="${BASE}/services"><span class="ic"><svg width="24" height="24"><use href="#i-nurse"/></svg></span><b>Our Services</b><small>Comprehensive, preventive and personalised care, at home.</small><span class="go">See all services ${arrow}</span></a></li>
        <li class="rv" style="--d:.1s"><a class="kh-card" href="${BASE}/packages"><span class="ic"><svg width="24" height="24"><use href="#i-house-plus"/></svg></span><b>Care Packages</b><small>Preventive care packages to meet your loved one's day-to-day health needs.</small><span class="go">See packages and prices ${arrow}</span></a></li>
        <li class="rv" style="--d:.15s"><a class="kh-card" href="${BASE}/karebalance"><span class="ic"><svg width="24" height="24"><use href="#i-physio"/></svg></span><b>KareBalance</b><small>Better Balance. Stronger Steps. Fewer Falls.</small><span class="go">About KareBalance ${arrow}</span></a></li>
        <li class="rv" style="--d:.2s"><a class="kh-card" href="${BASE}/about"><span class="ic"><svg width="24" height="24"><use href="#i-shield"/></svg></span><b>Why Kare@Home</b><small>More than care. It's peace of mind.</small><span class="go">Why families choose us ${arrow}</span></a></li>
      </ul>
    </div>
  </section>`;

const contact = `<section class="kh-contact" aria-labelledby="contact-title">
    <div class="wrap">
      <div class="sec-intro rv">
        <h1 class="sec-title" id="contact-title">Contact Kare@Home</h1>
        <p class="sec-sub dark">Book a Service | Enquire Now</p>
        <p class="sec-text">Call or WhatsApp us with your requirements, or send a booking request and a care coordinator will call you to confirm.</p>
      </div>
      <ul class="kh-ways">
        <li class="rv" style="--d:.05s"><span class="ic"><svg width="24" height="24"><use href="#i-phone"/></svg></span><b>Call us</b><a class="big" href="tel:+918129345178" data-c="contact.phoneDisplay">+91 81293 45178</a></li>
        <li class="rv" style="--d:.1s"><span class="ic"><svg width="24" height="24"><use href="#i-hand-heart"/></svg></span><b>WhatsApp</b><a class="big" href="https://wa.me/918129345178?text=Hi%20Kare%40Home%2C%20I%27d%20like%20to%20know%20more%20about%20home%20care." target="_blank" rel="noopener">Message us on WhatsApp</a></li>
        <li class="rv" style="--d:.15s"><span class="ic"><svg width="24" height="24"><use href="#i-assess"/></svg></span><b>Book a home visit</b><button class="btn btn-grad" data-book><svg aria-hidden="true" width="24" height="24"><use href="#i-calendar"/></svg>Book a Service</button></li>
        <li class="rv" style="--d:.2s"><span class="ic"><svg width="24" height="24"><use href="#i-family"/></svg></span><b>Families and caregivers</b><a class="btn btn-line" href="/app/#/signin?brand=karehome" data-app="karehome">Sign in to My KareIQ</a></li>
      </ul>
      <p class="kh-follow"><a href="https://instagram.com/kareiq" target="_blank" rel="noopener"><svg aria-hidden="true" width="24" height="24"><use href="#i-camera"/></svg>Follow us @kareiQ</a></p>
    </div>
  </section>`;

// links inside sections that pointed at other sections of the old single page
const relink = (html) => html
  .replace(/href="#services"/g, `href="${BASE}/services"`)
  .replace(/href="#top"/g, `href="${BASE}"`)
  .replace(/href="#contact"/g, `href="${BASE}/contact"`);

const BODY = {
  home: relink(S.hero) + '\n\n  ' + explore + '\n\n  ' + S.how,
  about: crumbs('About Us') + '\n  ' + asPage(S.why),
  services: crumbs('Our Services') + '\n  ' + asPage(S.services),
  packages: crumbs('Care Packages') + '\n  ' + asPage(S.packages),
  karebalance: crumbs('KareBalance') + '\n  ' + asPage(S.kb),
  contact: crumbs('Contact').replace(/<h1[^>]*>.*?<\/h1>\n  /, '') + '\n  ' + contact
};
const TITLES = {
  home: null,
  about: ['Why Kare@Home', 'Trusted and trained caregivers, a preventive approach, the comfort of home, dignity and family assurance.'],
  services: ['Our Services', 'Home care support, health monitoring, preventive screenings, nutrition, medication management, physiotherapy, companionship and personal care at home.'],
  packages: ['Care Packages', 'HomeStart, HomePlus and HomeElite preventive care packages, or a customised plan. Choose a monthly, quarterly, half-yearly or annual payment plan.'],
  karebalance: ['KareBalance', 'KareBalance: a personalised fall prevention and mobility programme that helps older adults stay steady, active and independent.'],
  contact: ['Contact', 'Call or WhatsApp Kare@Home on +91 81293 45178, or send a booking request and a care coordinator will call you.']
};

// old one-page links (/kare-at-home#packages) are sent to the new pages by js/karehome.js

function page(p) {
  let h = head
    .replace(/\/css\/karehome\.css\?v=[\w]+/, '/css/karehome.css?v=' + VER)
    .replace(/\/js\/api\.js\?v=[\w]+/, '/js/api.js?v=' + VER);
  const t = TITLES[p.key];
  if (t) {
    h = h.replace(/<title>[^<]*<\/title>/, `<title>${t[0]} | Kare@Home</title>`)
      .replace(/<meta name="description" content="[^"]*">/, `<meta name="description" content="${t[1]}">`)
      .replace(/<meta property="og:title" content="[^"]*">/, `<meta property="og:title" content="${t[0]} | Kare@Home">`);
  }
  return `${h}<body data-page="${p.key}">

${sprite}

<div class="progress" id="progress" aria-hidden="true"></div>

${header(p.key)}

<main id="main" tabindex="-1">
  ${BODY[p.key]}
</main>

${relink(footer).replace('<footer class="foot" id="contact">', '<footer class="foot" id="contact">')}

${floaters}

${modal}

<script src="/js/forms.js?v=${VER}" defer></script>
<script src="/js/sites.js?v=${VER}" defer></script>
<script src="/js/content.js?v=${VER}" defer></script>
<script src="/js/karehome.js?v=${VER}" defer></script>
</body>
</html>
`;
}

for (const p of PAGES) {
  const file = p.key === 'home' ? path.join(OUT, 'kare-at-home.html') : path.join(OUT, 'kare-at-home', p.path.slice(1) + '.html');
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, page(p));
}
console.log(`Kare@Home: ${PAGES.length} pages written (public/kare-at-home.html and public/kare-at-home/)`);
