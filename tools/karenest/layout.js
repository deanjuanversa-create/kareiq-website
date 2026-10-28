// Shared page parts for the KareNest website: <head>, header + navigation, footer, the
// corner widgets (reading comfort, Nestu) and the Plan a Visit dialog. Every page is built
// from these, so a change here shows up on every page after `node tools/karenest/build.js`.

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// small line icons (24x24, stroked)
const ICONS = {
  arr: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  ppl: '<circle cx="9" cy="8" r="3.2"/><path d="M3.5 19c.6-3.2 2.8-5 5.5-5s4.9 1.8 5.5 5"/><circle cx="17" cy="9" r="2.4"/><path d="M16 14.2c2.4-.3 4.2 1.2 4.6 4"/>',
  chk: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  clk: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11z"/><circle cx="12" cy="10" r="2.3"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
  home: '<path d="M4 11 12 4l8 7"/><path d="M6 10v10h12V10"/><path d="M10 20v-5h4v5"/>',
  yoga: '<circle cx="12" cy="4.5" r="2"/><path d="M5 9l7 2 7-2M12 11v5l-4 5M12 16l4 5"/>',
  book: '<path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5z"/><path d="M4 20.5A2.5 2.5 0 0 0 6.5 23H20v-5"/><path d="M8 7h8M8 11h6"/>',
  cup: '<path d="M4 9h13v5a5 5 0 0 1-5 5H9a5 5 0 0 1-5-5z"/><path d="M17 10h1.5a2.5 2.5 0 0 1 0 5H17M8 3c0 1.5 1 1.5 1 3M12 3c0 1.5 1 1.5 1 3"/>',
  meal: '<circle cx="12" cy="13" r="6.5"/><circle cx="12" cy="13" r="3"/><path d="M3 4v6M5 4v6M3 7h2M4 10v10M21 4c-1.5 1-2 3-2 5h2v11"/>',
  mail: '<path d="M4 6.5h16v11H4z"/><path d="m4 7 8 6 8-6"/>',
  phone: '<path d="M6.5 3.5h3l1.5 4-2 1.2a10 10 0 0 0 6.3 6.3l1.2-2 4 1.5v3a2 2 0 0 1-2 2A16 16 0 0 1 4.5 5.5a2 2 0 0 1 2-2z"/>',
  shield: '<path d="M12 3l8 3v6c0 4.9-3.4 8.1-8 9-4.6-.9-8-4.1-8-9V6l8-3Z"/><path d="M8.8 12.2l2.2 2.2 4.2-4.4"/>',
  user: '<circle cx="12" cy="8.5" r="3.8"/><path d="M4.5 20c.9-3.8 3.8-6 7.5-6s6.6 2.2 7.5 6"/>',
  leaf: '<path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15Z"/><path d="M5 19 15 9"/>',
  chart: '<path d="M4 19h16"/><path d="M6 15l4-4 3 3 5-6"/>',
  mind: '<path d="M9.5 20v-3.2A6.5 6.5 0 1 1 18 11c0 1 .8 1.6.8 2.4 0 .6-.8.8-.8 1.4V16a2 2 0 0 1-2 2h-1.5v2"/><path d="M10 9.5a2 2 0 0 1 3.6-1.2 2 2 0 0 1 1.4 3.4c-.4.5-1 .8-1.6.8H11"/>',
  balance: '<circle cx="12" cy="4.2" r="2"/><path d="M12 6.8v7.4M12 14.2 8.6 21M12 14.2l3.6 2.6M5.5 10h13"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  chat: '<path d="M4 6h16v10H9l-5 4z"/>',
  chev: '<path d="m6 9 6 6 6-6"/>',
  right: '<path d="m9 6 6 6-6 6"/>',
  back: '<path d="M19 12H5M11 6l-6 6 6 6"/>',
  star: '<path d="m12 4 2.4 5 5.4.6-4 3.7 1.1 5.3L12 16l-4.9 2.6 1.1-5.3-4-3.7 5.4-.6z"/>'
};
const ico = (name, cls = 'ico', extra = '') => `<svg class="${cls}" viewBox="0 0 24 24" aria-hidden="true"${extra}>${ICONS[name]}</svg>`;
const SPRITE = `<svg width="0" height="0" style="position:absolute" aria-hidden="true" focusable="false"><defs>${Object.keys(ICONS).map((k) => `<symbol id="${k}" viewBox="0 0 24 24">${ICONS[k]}</symbol>`).join('')}</defs></svg>`;

const VER = '20261027b';
const SITE_HOST = 'https://karenest.co.in';
const KAREIQ_URL = { embedded: '/', standalone: 'https://kareiq.co.in/' };

// The main navigation. `x` parts are dropped between 1220px and 1500px so the full menu fits
// on one line on laptops; links carry an aria-label with the full name.
const NAV = [
  { key: 'home', href: '/', label: 'Home' },
  { key: 'about', href: '/about', label: 'About KareNest', parts: [['About'], [' KareNest', 'x']] },
  { key: 'life', href: '/life', label: 'Life at KareNest', parts: [['Life'], [' at KareNest', 'x']] },
  { key: 'packages', label: 'Our Packages', parts: [['Our ', 'x'], ['Packages']], dropdown: true },
  { key: 'families', href: '/families', label: 'For Families', parts: [['For ', 'x'], ['Families']] },
  { key: 'contact', href: '/contact', label: 'Contact Us', parts: [['Contact'], [' Us', 'x']] }
];

function make(P, mode) {
  const u = (path) => (P + path).replace(/\/+$/, '') || '/';
  const home = P ? P + '/' : '/';
  const img = (f) => `${P}/images/${f}`;
  const kareiq = KAREIQ_URL[mode];

  function head(pg) {
    const canonical = mode === 'standalone' ? SITE_HOST + (pg.path === '/' ? '/' : pg.path) : '';
    const title = pg.path === '/' ? 'KareNest | Live Well. Stay Connected. Keep Growing.' : `${pg.title} | KareNest`;
    return `<!doctype html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(pg.description)}">
${canonical ? `<link rel="canonical" href="${canonical}">\n` : ''}<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(pg.description)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#0B5446">
<link rel="icon" type="image/webp" href="${img('mark.webp')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..700,30&family=Figtree:wght@400;500;600;700&display=swap">
<link rel="stylesheet" href="${P}/loader.css?v=${VER}">
<script src="${P}/loader.js?v=${VER}"></script>
<link rel="stylesheet" href="${P}/site.css?v=${VER}">
${pg.kb ? `<link rel="stylesheet" href="${P}/karebalance.css?v=${VER}">\n` : ''}${pg.preload ? `<link rel="preload" as="image" href="${img(pg.preload)}">\n` : ''}</head>`;
  }

  const LOADER = `<div class="kn-loader" id="knLoader" role="status" aria-label="Loading KareNest">
  <div class="kn-stage">
    <div class="kn-emblem" aria-hidden="true">
      <svg viewBox="0 0 200 200">
        <defs><linearGradient id="knGrad" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#12917A"/><stop offset=".4" stop-color="#2E8FB5"/><stop offset=".72" stop-color="#7A4CBF"/><stop offset="1" stop-color="#D6568C"/></linearGradient></defs>
        <circle class="kn-ring2" cx="100" cy="100" r="86"/>
        <circle class="kn-ring" cx="100" cy="100" r="86" pathLength="1" transform="rotate(-90 100 100)"/>
        <g class="kn-sprig" style="transform-origin:100px 150px">
          <path class="kn-stem" pathLength="1" d="M100 156C98 132 96 112 104 64"/>
          <path class="kn-leaf l1" d="M99 134c-17-1-29-10-31-24 14 0 28 9 31 24z"/>
          <path class="kn-leaf l2" d="M99 117c3-16 16-25 31-25-1 14-13 24-31 25z"/>
          <path class="kn-leaf l3" d="M101 97c-15-4-23-16-22-29 13 3 23 14 22 29z"/>
          <path class="kn-leaf l4" d="M103 77c3-13 14-20 26-20-2 12-12 19-26 20z"/>
        </g>
      </svg>
      <img class="kn-mark" src="${img('mark.webp')}" alt="">
    </div>
    <div class="kn-word" aria-hidden="true"><span>K</span><span>a</span><span>r</span><span>e</span><span>N</span><span>e</span><span>s</span><span>t</span></div>
    <div class="kn-tag">Welcome home</div>
  </div>
  <button class="kn-skip" type="button">Skip intro</button>
  <svg class="kn-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0H1440V30C1200 80 960 90 720 60S240 10 0 50Z"/></svg>
</div>`;

  const current = (pg, key) => (pg.nav === key ? ' aria-current="page"' : '');
  const subCurrent = (pg, key) => (pg.sub === key ? ' aria-current="page"' : '');
  const linkText = (n) => (n.parts ? n.parts.map(([t, x]) => (x ? `<span class="x-l">${esc(t)}</span>` : esc(t))).join('') : esc(n.label));

  function packagesMenu(pg) {
    return `<div class="dd" id="dd-packages">
        <ul>
          <li><a href="${u('/packages')}"${subCurrent(pg, 'packages')}>All packages<small>Compare every option and price</small></a></li>
          <li class="sep" role="presentation"></li>
          <li><a href="${u('/live-with-us')}"${subCurrent(pg, 'live')}>Live With Us<small>KarePlus · KarePremium</small></a></li>
          <li><a href="${u('/visit-and-participate')}"${subCurrent(pg, 'visit')}>Visit &amp; Participate<small>Bloom · Flourish · Thrive</small></a></li>
          <li class="has-dd2">
            <div class="dd-row"><a href="${u('/wellness')}"${subCurrent(pg, 'wellness')}>Wellness<small>KareBalance · KareMind</small></a><button class="dd2-btn" type="button" aria-expanded="false" aria-controls="dd-wellness" aria-label="Show wellness packages">${ico('right', '')}</button></div>
            <div class="dd2" id="dd-wellness">
              <ul>
                <li><a href="${u('/karebalance')}"${subCurrent(pg, 'karebalance')}>KareBalance<small>Fall prevention &amp; mobility</small></a></li>
                <li><a href="${u('/karemind')}"${subCurrent(pg, 'karemind')}>KareMind<small>Mental wellness program</small></a></li>
              </ul>
            </div>
          </li>
        </ul>
      </div>`;
  }

  function header(pg) {
    const links = NAV.map((n) => {
      if (n.dropdown) {
        return `<li class="has-dd"><button class="dd-btn${pg.nav === 'packages' ? ' active' : ''}" type="button" aria-expanded="false" aria-controls="dd-packages" aria-label="Our Packages">${linkText(n)}${ico('chev', 'chev')}</button>
      ${packagesMenu(pg)}</li>`;
      }
      const label = n.parts ? ` aria-label="${esc(n.label)}"` : '';
      return `<li><a href="${n.key === 'home' ? home : u(n.href)}"${current(pg, n.key)}${label}>${linkText(n)}</a></li>`;
    }).join('\n      ');
    const d = (key, href, label) => `<a href="${href}"${current(pg, key)}>${label}</a>`;
    const ds = (key, href, label) => `<a href="${href}"${subCurrent(pg, key)}>${label}</a>`;
    const pkgOpen = pg.nav === 'packages';
    const wellOpen = ['wellness', 'karebalance', 'karemind'].includes(pg.sub);
    return `<a class="skip" href="#main">Skip to main content</a>
${SPRITE}
<div class="progress" id="progress" aria-hidden="true"></div>
<div class="topbar">
  <div class="wrap topbar-in">
    <a class="back-kiq" href="${kareiq}" data-site="kareiq">${ico('back', '')}Back to KareIQ</a>
    <div class="meta"><span>${ico('clk', '')}Mon to Sat · 9:30 AM – 6:00 PM</span><span>${ico('pin', '')}Kochi, Kerala</span><span>${ico('mail', '')}<a href="mailto:hello@karenest.in">hello@karenest.in</a></span></div>
  </div>
</div>
<header class="nav" id="nav">
  <div class="wrap nav-in">
    <a class="brand" href="${home}" aria-label="KareNest home"${pg.nav === 'home' ? ' aria-current="page"' : ''}>
      <img src="${img('mark.webp')}" alt="" width="52" height="52">
      <span class="wm"><b>KareNest</b><small>Live healthy. Live happy. Live with dignity.</small></span>
    </a>
    <nav class="nav-main" aria-label="Main">
      <ul class="links">
      ${links}
      </ul>
    </nav>
    <div class="nav-cta">
      <a class="btn btn-primary btn-sm mag" href="${u('/community')}#join" data-open="join"${current(pg, 'community')}>${ico('ppl')}Join Our Community</a>
      <a class="btn btn-ghost btn-sm mag" href="${u('/contact')}?type=karenest-visit#enquiry" data-open="visit">${ico('cal')}Plan a Visit</a>
    </div>
    <a class="app-in" href="${u('/sign-in')}" data-auth${current(pg, 'signin')}>${ico('user', '')}<span>Sign In</span></a>
    <button class="burger" id="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><span></span><span></span><span></span></button>
  </div>
</header>

<nav class="drawer" id="drawer" aria-label="Menu">
  ${d('home', home, 'Home')}
  ${d('about', u('/about'), 'About KareNest')}
  ${d('life', u('/life'), 'Life at KareNest')}
  <button class="acc-btn" type="button" aria-expanded="${pkgOpen}" aria-controls="m-packages">Our Packages${ico('chev', '')}</button>
  <div class="acc-panel" id="m-packages"${pkgOpen ? '' : ' hidden'}>
    ${ds('packages', u('/packages'), 'All packages')}
    ${ds('live', u('/live-with-us'), 'Live With Us')}
    ${ds('visit', u('/visit-and-participate'), 'Visit &amp; Participate')}
    <button class="acc-btn" type="button" aria-expanded="${wellOpen}" aria-controls="m-wellness">Wellness${ico('chev', '')}</button>
    <div class="acc-panel" id="m-wellness"${wellOpen ? '' : ' hidden'}>
      ${ds('wellness', u('/wellness'), 'Wellness overview')}
      ${ds('karebalance', u('/karebalance'), 'KareBalance')}
      ${ds('karemind', u('/karemind'), 'KareMind')}
    </div>
  </div>
  ${d('families', u('/families'), 'For Families')}
  ${d('contact', u('/contact'), 'Contact Us')}
  ${d('signin', u('/sign-in'), 'Sign In').replace('<a ', '<a data-auth ')}
  <div class="row"><a class="btn btn-primary" href="${u('/community')}#join" data-open="join">${ico('ppl')}Join Our Community</a><a class="btn btn-ghost" href="${u('/contact')}?type=karenest-visit#enquiry" data-open="visit">${ico('cal')}Plan a Visit</a></div>
  <a class="d-back" href="${kareiq}" data-site="kareiq">← Back to KareIQ</a>
  <div class="d-meta"><span>Mon to Sat · 9:30 AM – 6:00 PM</span><span>Kochi, Kerala · hello@karenest.in</span></div>
</nav>`;
  }

  function footer(pg) {
    const f = (key, href, label, sub) => `<li><a href="${href}"${sub ? subCurrent(pg, key) : current(pg, key)}>${label}</a></li>`;
    return `<footer>
  <div class="wrap">
    <div class="foot">
      <div>
        <a class="brand" href="${home}" aria-label="KareNest home"><img src="${img('mark.webp')}" alt="" width="52" height="52" loading="lazy"><span class="wm"><b>KareNest</b><small>Live healthy. Live happy. Live with dignity.</small></span></a>
        <p class="tag">A community where ageing is embraced with health, dignity and happiness.</p>
        <div class="socials"><span class="socials-h">Follow us</span><div class="socials-row"><a class="soc ig" href="https://www.instagram.com/karenestbykareiq/" target="_blank" rel="noopener" aria-label="KareNest on Instagram (opens in a new tab)"><svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><rect x="3.2" y="3.2" width="17.6" height="17.6" rx="5" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="12" cy="12" r="4.1" fill="none" stroke="currentColor" stroke-width="1.9"/><circle cx="17.4" cy="6.6" r="1.25" fill="currentColor"/></svg></a><a class="soc fb" href="https://www.facebook.com/profile.php?id=61590756755250" target="_blank" rel="noopener" aria-label="KareNest on Facebook (opens in a new tab)"><svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path fill="currentColor" d="M13.6 21v-7.6h2.6l.4-3h-3V8.5c0-.9.3-1.5 1.5-1.5h1.6V4.3c-.3 0-1.2-.1-2.3-.1-2.3 0-3.9 1.4-3.9 4v2.2H7.9v3h2.6V21h3.1Z"/></svg></a><a class="soc li" href="https://www.linkedin.com/company/109885415/" target="_blank" rel="noopener" aria-label="KareNest on LinkedIn (opens in a new tab)"><svg viewBox="0 0 24 24" aria-hidden="true" width="20" height="20"><path fill="currentColor" d="M6.9 8.9H3.8V20h3.1V8.9ZM5.35 4a1.8 1.8 0 1 0 0 3.6 1.8 1.8 0 0 0 0-3.6ZM20.2 13.6c0-3-1.6-4.9-4.2-4.9-1.5 0-2.5.8-2.9 1.6V8.9h-3V20h3.1v-5.8c0-1.5.6-2.6 2-2.6 1.3 0 1.9.9 1.9 2.6V20h3.1v-6.4Z"/></svg></a></div></div>
      </div>
      <div><h2 class="h5">Explore</h2><ul>${f('about', u('/about'), 'About KareNest')}${f('life', u('/life'), 'Life at KareNest')}${f('activities', u('/activities'), 'Activities &amp; Wellness')}${f('families', u('/families'), 'For Families')}</ul></div>
      <div><h2 class="h5">Packages</h2><ul>${f('packages', u('/packages'), 'Our Packages', 1)}${f('live', u('/live-with-us'), 'Live With Us', 1)}${f('visit', u('/visit-and-participate'), 'Visit &amp; Participate', 1)}${f('wellness', u('/wellness'), 'Wellness', 1)}${f('karebalance', u('/karebalance'), 'KareBalance', 1)}${f('karemind', u('/karemind'), 'KareMind', 1)}</ul></div>
      <div><h2 class="h5">Get involved</h2><ul>${f('community', u('/community'), 'Join Our Community')}<li><a href="${u('/contact')}?type=karenest-visit#enquiry" data-open="visit">Plan a Visit</a></li>${f('contact', u('/contact'), 'Contact Us')}${f('signin', u('/sign-in'), 'Sign In').replace('<a ', '<a data-auth ')}</ul></div>
      <div><h2 class="h5">Visit us</h2><div class="contact"><span>Kochi, Kerala</span><a href="mailto:hello@karenest.in">hello@karenest.in</a><span>Mon to Sat · 9:30 AM – 6:00 PM</span></div></div>
    </div>
    <div class="foot-bot">
      <span>© 2026 KareNest. All rights reserved.</span>
      <div class="fb-tools" aria-label="Page tools"><button type="button" class="fb-tool" data-tool="comfort"><span class="aa" aria-hidden="true">Aa</span>Reading comfort</button><button type="button" class="fb-tool" data-tool="nestu"><img src="${img('head.webp')}" alt="" width="26" height="26" loading="lazy">Chat with Nestu</button></div>
      <a class="byline" href="${kareiq}" data-site="kareiq" aria-label="A brand by KareIQ: visit KareIQ">A brand by <img loading="lazy" decoding="async" src="${img('kareiq.webp')}" alt="KareIQ" width="96" height="30"></a>
    </div>
  </div>
</footer>`;
  }

  const WIDGETS = `<div class="comfort" id="comfort">
  <div class="c-panel hide" id="cPanel" role="dialog" aria-label="Reading comfort">
    <h2 class="h4">Reading comfort</h2>
    <div class="c-row"><span class="lbl" id="fsLbl">Text size</span><div class="seg2" id="fsSeg" role="group" aria-labelledby="fsLbl"><button type="button" data-fs="1" aria-pressed="true" style="font-size:.9rem">A</button><button type="button" data-fs="1.12" aria-pressed="false" style="font-size:1.05rem">A+</button><button type="button" data-fs="1.25" aria-pressed="false" style="font-size:1.2rem">A++</button></div></div>
    <div class="tog">Higher contrast<button type="button" id="tgContrast" aria-pressed="false" aria-label="Higher contrast"></button></div>
    <div class="tog">Calm motion<button type="button" id="tgCalm" aria-pressed="false" aria-label="Calm motion"></button></div>
  </div>
  <button class="c-btn" id="cBtn" type="button" aria-expanded="false" aria-controls="cPanel" aria-label="Reading comfort"><span class="aa" aria-hidden="true">Aa</span><span class="l">Reading comfort</span></button>
</div>

<div class="guide" id="guide">
  <div class="g-panel hide" id="gPanel" role="dialog" aria-label="Nestu, your KareNest guide">
    <div class="g-top"><img loading="lazy" decoding="async" src="${img('head.webp')}" alt="" width="48" height="48"><div><b>Nestu</b><span id="gStatus">Here to help you find your way</span></div><button class="x" type="button" id="gClose" aria-label="Close">×</button></div>
    <div class="g-msgs" id="gMsgs" aria-live="polite"></div>
    <div class="g-quick" id="gQuick">
      <button type="button" data-q="visit">Plan a visit</button><button type="button" data-q="packages">Our packages</button><button type="button" data-q="activities">Activities</button><button type="button" data-q="events">Upcoming events</button><button type="button" data-q="families">For families</button><button type="button" data-q="join">Join the community</button><button type="button" data-q="contact">Contact us</button>
    </div>
  </div>
  <div class="g-tease hide" id="gTease">Hi, I'm Nestu! Need a hand finding your way around KareNest?</div>
  <button class="g-btn" id="gBtn" type="button" aria-label="Chat with Nestu" aria-expanded="false" aria-controls="gPanel"><img loading="lazy" decoding="async" src="${img('head.webp')}" alt="" width="70" height="70"><span class="dot" id="gDot"></span></button>
</div>

<dialog id="authDlg" class="auth" aria-labelledby="authTitle">
  <button class="auth-x" type="button" data-auth-close aria-label="Close">×</button>
  <p class="auth-eyebrow">Welcome</p>
  <h2 id="authTitle">Sign in to KareNest</h2>
  <p class="auth-sub" id="authSub">One sign-in for KareNest and Kare@Home.</p>
  <p class="auth-plan" id="authPlan" hidden></p>
  <div class="auth-prov" id="authProv" hidden></div>
  <form class="auth-form" id="authSignin" novalidate>
    <label class="sr-only" for="aId">Mobile number or email</label>
    <input id="aId" name="id" autocomplete="username" placeholder="Mobile number or email" required>
    <div class="auth-pw"><label class="sr-only" for="aPw">Password</label><input id="aPw" name="password" type="password" autocomplete="current-password" placeholder="Password" required><button type="button" class="auth-peek" data-peek aria-label="Show password">Show</button></div>
    <p class="auth-err" role="alert" data-auth-err></p>
    <button class="auth-go" type="submit">Sign in</button>
    <p class="auth-alt"><a href="/app/#/forgot" data-app-path="#/forgot">Forgot password?</a></p>
  </form>
  <form class="auth-form" id="authSignup" novalidate hidden>
    <label class="sr-only" for="sName">Your name</label>
    <input id="sName" name="name" autocomplete="name" placeholder="Your name" required>
    <label class="sr-only" for="sPhone">Mobile number</label>
    <input id="sPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Mobile number" required>
    <label class="sr-only" for="sEmail">Email address (optional)</label>
    <input id="sEmail" name="email" type="email" autocomplete="email" placeholder="Email address (optional)">
    <div class="auth-pw"><label class="sr-only" for="sPw">Choose a password</label><input id="sPw" name="password" type="password" autocomplete="new-password" placeholder="Choose a password (8+ characters)" required><button type="button" class="auth-peek" data-peek aria-label="Show password">Show</button></div>
    <p class="auth-err" role="alert" data-auth-err></p>
    <button class="auth-go" type="submit">Create account</button>
  </form>
  <p class="auth-switch"><span id="authSwitchText">New to KareNest?</span> <button type="button" id="authSwitch">Create an account</button></p>
</dialog>

<dialog id="dlg" aria-labelledby="dlgTitle">
  <img loading="lazy" decoding="async" class="dlg-mascot" src="${img('head.webp')}" alt="" width="90" height="90" style="border-radius:50%;background:#fff;border:4px solid #fff;box-shadow:var(--shadow-sm)">
  <div id="dlgForm">
    <div class="dlg-head"><div><h2 class="h3" id="dlgTitle">Plan a day visit</h2><p id="dlgSub">Spend a day with us, Monday to Saturday, 9:30 AM to 6:00 PM. Tell us when suits you and our team will call to confirm.</p></div><button class="x" type="button" id="dlgX" aria-label="Close">×</button></div>
    <form class="visit cform" id="visitForm" novalidate data-enquiry data-interest="karenest-visit" data-what="day visit">
      <p class="dlg-note">Looking at a visitor pass, living with us or a wellness programme? <a href="${u('/packages')}">See our packages</a> or <a href="${u('/contact')}#enquiry">send us an enquiry</a>.</p>
      <div class="field"><label for="fName">Your name</label><input id="fName" name="name" autocomplete="name" placeholder="e.g. Meera Nair" required aria-describedby="fNameErr"><span class="err" id="fNameErr" data-err="name"></span></div>
      <div class="row2">
        <div class="field"><label for="fPhone">Phone</label><input id="fPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="+91 98xxx xxxxx" required aria-describedby="fPhoneErr"><span class="err" id="fPhoneErr" data-err="phone"></span></div>
        <div class="field"><label for="fDate">Preferred date <span class="opt-l">(optional)</span></label><input id="fDate" name="date" type="date" data-msg="Preferred date"></div>
      </div>
      <div class="field"><label for="fFor">Visiting for</label><select id="fFor" name="for" data-msg="Visiting for"><option>Myself</option><option>A parent</option><option>A relative or friend</option></select></div>
      <input type="text" name="website" tabindex="-1" autocomplete="off" aria-hidden="true" class="hp-field">
      <div class="err" data-err="form" role="alert"></div>
      <p class="consent">By sending this, you agree that the KareNest team may call you about your request.</p>
      <button class="btn btn-primary" type="submit">Send my request${ico('arr', 'ico arr')}</button>
    </form>
  </div>
  <div class="done cdone" id="dlgDone" hidden tabindex="-1">
    <div class="tick"><svg viewBox="0 0 48 48" aria-hidden="true"><path d="M12 25l8 8 16-17"/></svg></div>
    <h2 class="h3">See you soon!</h2>
    <p data-done-msg>We'll call you to confirm.</p>
    <div class="row"><a class="btn btn-primary" data-done-app href="/app/#/start" data-app-path="#/start" hidden>Create your account</a><button class="btn btn-ghost" type="button" id="doneClose">Close</button></div>
  </div>
</dialog>`;

  const LIGHTBOX = `<div class="lb" id="lb" role="dialog" aria-modal="true" aria-label="Photo viewer" hidden>
  <button class="lb-x" type="button" id="lbX" aria-label="Close photo viewer">×</button>
  <button class="lb-nav lb-prev" type="button" id="lbPrev" aria-label="Previous photo">${ico('arr')}</button>
  <div class="lb-box">
    <div class="lb-img" id="lbImg"></div>
    <div class="lb-info">
      <span class="eyebrow" id="lbKick"></span>
      <h2 class="h3" id="lbTitle"></h2>
      <span class="lb-meta" id="lbMeta"></span>
      <p id="lbText"></p>
      <span class="lb-count" id="lbCount"></span>
      <a class="btn btn-primary" id="lbCta" href="${u('/contact')}?type=karenest-visit#enquiry" data-open="visit">${ico('cal')}Plan a Visit</a>
    </div>
  </div>
  <button class="lb-nav lb-next" type="button" id="lbNext" aria-label="Next photo">${ico('arr')}</button>
</div>`;

  function page(pg, body) {
    const sitesSrc = mode === 'standalone' ? `${P}/js/sites.js?v=${VER}` : `/js/sites.js?v=${VER}`;
    return `${head(pg)}
<body data-page="${pg.key}" data-base="${P}">
${LOADER}
${header(pg)}

<main id="main" tabindex="-1">
${body}
</main>

${footer(pg)}

${pg.lightbox ? LIGHTBOX + '\n' : ''}${WIDGETS}

<script src="${sitesSrc}"></script>
<script src="${P}/app.js?v=${VER}"></script>
</body>
</html>
`;
  }

  return { u, home, img, ico, esc, page, kareiq };
}

module.exports = { make, esc, ico, ICONS, VER };
