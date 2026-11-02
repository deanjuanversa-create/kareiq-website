#!/usr/bin/env node
// Builds the KareIQ Bystander page (/bystander) from tools/shared/wellness.js, with the Bystander
// booking form (tools/shared/bystander-form.js; no sign-in needed).
// (KareWellness is a website of its own: tools/karewellness/build.js.)
// The header, footer, enquiry form and scripts are taken from public/index.html, so a change to the
// KareIQ home page header or footer reaches these pages on the next build.
// It also writes the FAQ page (/faq) from tools/shared/faq.js (the FAQs were on the home page until 2 Nov 2026).
// Run: node tools/kareiq/build.js
const fs = require('fs');
const path = require('path');
const W = require('../shared/wellness');
const { bystanderForm } = require('../shared/bystander-form');
const { FAQ, faqPageBody } = require('../shared/faq');

const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'public');
const VER = '20261102b';
const index = fs.readFileSync(path.join(PUB, 'index.html'), 'utf8');

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const cut = (a, b, incl = true) => {
  const i = index.indexOf(a); if (i < 0) throw new Error('index.html: missing ' + a);
  const j = index.indexOf(b, i + a.length); if (j < 0) throw new Error('index.html: missing ' + b);
  return index.slice(i, incl ? j + b.length : j);
};
// links to sections of the home page work from any page
const toHome = (html) => html.replace(/href="#(?!")/g, 'href="/#');

const sprite = cut('<!-- shared SVG symbols -->', '</svg>');
const footer = toHome(cut('<footer>', '</footer>'));
const floaters = cut('<a class="wa-float"', '</button>');
const modal = cut('<div class="modal" id="modal"', '\n<script src="/js/forms.js', false).trimEnd();
const scripts = cut('<script src="/js/forms.js', '</body>', false).trimEnd();
const fonts = cut('<link rel="preconnect" href="https://fonts.googleapis.com">', '&display=swap">');
const cssLinks = cut('<link rel="stylesheet" href="/css/auth-popup.css', '<link rel="stylesheet" href="/css/loader.css', false).trimEnd();
const apiJs = cut('<script src="/js/api.js', '</script>');

function header(current) {
  let h = toHome(cut('<header class="nav" id="nav">', '</header>'))
    .replace('<li><a href="/#top" class="active">Home</a></li>', '<li><a href="/#top">Home</a></li>')
;
  // mark the current page in the menu and the drawer
  if (current) h = h.split(`href="${current}">`).join(`href="${current}" aria-current="page">`);
  return h;
}

// ---------------------------------------------------------------- icons (24px line icons)
const IC = {
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  tick: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  shieldHeart: '<path d="M12 3l8 3v6c0 4.9-3.4 8.1-8 9-4.6-.9-8-4.1-8-9V6l8-3Z"/><path d="M12 15.5s-3.2-1.9-3.2-4.2A1.7 1.7 0 0 1 12 10.4a1.7 1.7 0 0 1 3.2.9c0 2.3-3.2 4.2-3.2 4.2Z"/>',
  sprout: '<path d="M12 21v-8"/><path d="M12 13C12 8.6 9 6 4.5 6 4.5 10.4 7.5 13 12 13Z"/><path d="M12 11c0-4 2.7-6.5 7-6.5 0 4-2.7 6.5-7 6.5Z"/>',
  balance: '<circle cx="12" cy="4.2" r="2"/><path d="M12 6.8v7.4M12 14.2 8.6 21M12 14.2l3.6 2.6M5.5 10h13"/>',
  strength: '<path d="M7 7l10 10M3.8 10.2l6.4-6.4M13.8 20.2l6.4-6.4M2 12l2-2M20 14l2-2M5.4 13.2l7.8-7.8M10.8 18.6l7.8-7.8"/>',
  walk: '<circle cx="13.5" cy="4" r="2"/><path d="M11 21l2.2-6.2-2.6-3 1.1-4.8 3 2.9 3 1.1M10.6 11.8 7.4 14M13.2 14.8 15.6 21"/>',
  shield: '<path d="M12 3l8 3v6c0 4.9-3.4 8.1-8 9-4.6-.9-8-4.1-8-9V6l8-3Z"/><path d="M8.6 12.6 12 9.6l3.4 3V16H8.6v-3.4Z"/>',
  people: '<circle cx="8.5" cy="8" r="3"/><path d="M2.8 20c.5-3.6 2.9-5.6 5.7-5.6s5.2 2 5.7 5.6"/><circle cx="17" cy="9.2" r="2.4"/><path d="M15.6 14.7c2.7.1 4.6 1.9 5.4 5"/>',
  mind: '<path d="M9.5 20v-3.2A6.5 6.5 0 1 1 18 11c0 1 .8 1.6.8 2.4 0 .6-.8.8-.8 1.4V16a2 2 0 0 1-2 2h-1.5v2"/><path d="M10 9.5a2 2 0 0 1 3.6-1.2 2 2 0 0 1 1.4 3.4c-.4.5-1 .8-1.6.8H11"/>',
  heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7a4.3 4.3 0 0 1 7.5 2.8C19.5 15.4 12 20 12 20z"/>',
  leaf: '<path d="M5 19C5 10 11 4 20 4c0 9-6 15-15 15Z"/><path d="M5 19 15 9"/>',
  moon: '<path d="M20 14.5A8 8 0 1 1 9.5 4a6.5 6.5 0 0 0 10.5 10.5Z"/>',
  spark: '<path d="m12 3 1.9 5.4L19.5 10l-5.6 1.6L12 17l-1.9-5.4L4.5 10l5.6-1.6Z"/><path d="M19 17v4M17 19h4"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M5 20c.8-3.6 3.6-5.6 7-5.6s6.2 2 7 5.6"/>',
  loop: '<path d="M4 12a8 8 0 0 1 13.7-5.6L20 8.7"/><path d="M20 4v4.7h-4.7"/><path d="M20 12a8 8 0 0 1-13.7 5.6L4 15.3"/><path d="M4 20v-4.7h4.7"/>',
  chat: '<path d="M4 6h16v10H9l-5 4z"/><path d="M8 10h8M8 13h5"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>'
};
const ico = (n, cls = '') => `<svg${cls ? ` class="${cls}"` : ''} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
const arrowBtn = '<svg viewBox="0 0 16 16" width="16" height="16"><use href="#arrow"/></svg>';
const KW_MARK = (id) => `<svg class="kw-mark" viewBox="0 0 48 48" aria-hidden="true"><defs><linearGradient id="${id}A" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#11998e"/><stop offset="1" stop-color="#3b82c4"/></linearGradient><linearGradient id="${id}B" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7c5cc4"/><stop offset="1" stop-color="#e4609e"/></linearGradient></defs><path d="M23 40C12 33 6 26 6 18.5 6 13 10 9.5 14.6 9.5c3.8 0 6.6 2.2 8.4 5.4Z" fill="url(#${id}A)"/><path d="M25 40c11-7 17-14 17-21.5C42 13 38 9.5 33.4 9.5c-3.8 0-6.6 2.2-8.4 5.4Z" fill="url(#${id}B)"/><path d="M24 39V25M24 31c-3-1-5-3.5-6-7M24 28c3-1 5-3 6-6" stroke="#fff" stroke-width="1.8" fill="none" stroke-linecap="round"/></svg>`;
const ticks = (list) => `<ul class="ticks">${list.map((t) => `<li>${ico('tick')}<span>${esc(t)}</span></li>`).join('')}</ul>`;
const R = W.rupees;

// ---------------------------------------------------------------- page shell
function page({ file, title, description, current, source, body, bystander = true, css = '', js = '' }) {
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="website">
${fonts}
<meta name="theme-color" content="#11998e">
<link rel="icon" type="image/png" href="/img/favicon-kareiq.png">
${cssLinks}
<link rel="stylesheet" href="/css/kareiq-pages.css?v=${VER}">
<link rel="stylesheet" href="/css/bystander.css?v=${VER}">${css}
${apiJs}
</head>
<body data-kareiq data-source="${source}">
<!-- written by tools/kareiq/build.js from tools/shared/wellness.js; edit those, not this file -->
${sprite}

<div class="progress" id="progress"></div>

${header(current)}

<main id="top" class="pg-main">
${body}
</main>

${footer}

${floaters}

${modal}

${bystander ? bystanderForm('kareiq') + '\n\n' : ''}${scripts}
${bystander ? `<script src="/js/bystander.js?v=${VER}" defer></script>` : ''}${js}
</body>
</html>
`;
  fs.writeFileSync(path.join(PUB, file), html);
}

// ---------------------------------------------------------------- Bystander
const B = W.bystander;
page({
  file: 'bystander.html',
  current: '/bystander',
  source: 'kareiq-bystander',
  title: 'Bystander caregiving support | KareIQ',
  description: `${B.title}: Half Day (4 hours) ${R(B.options[0].price)}, Full Day (8 hours) ${R(B.options[1].price)}, Round the Clock (24 hours) ${R(B.options[2].price)}. ${B.longTerm}`,
  body: `  <section class="pg-hero" aria-labelledby="by-title">
    <span class="pg-orb o1" aria-hidden="true"></span><span class="pg-orb o2" aria-hidden="true"></span>
    <div class="wrap pg-hero-in">
      <div>
        <ol class="pg-breadcrumb load" aria-label="Breadcrumb"><li><a href="/">KareIQ</a></li><li aria-current="page">Bystander</li></ol>
        <div class="eyebrow load" style="animation-delay:.1s">${esc(B.kicker)}</div>
        <h1 class="load" id="by-title" style="animation-delay:.2s">Bystander. <em>Someone by their side.</em></h1>
        <p class="pg-lead load" style="animation-delay:.35s">${esc(B.intro)}</p>
        <div class="pg-ctas load" style="animation-delay:.5s">
          <a class="btn btn-grad" href="#durations">See durations &amp; prices ${arrowBtn}</a>
          <button class="btn btn-ghost" type="button" data-bystander="">Book Now</button>
        </div>
      </div>
      <div class="pg-hero-art load" style="animation-delay:.3s">
        <div class="pg-hero-photo"><img src="/img/karehome-hero.jpg" alt="A KareIQ caregiver holding the hands of a smiling elderly woman at home" width="1168" height="850" fetchpriority="high" style="object-position:62% 40%"></div>
        <div class="pg-chip c1"><span class="ic">${ico('clock')}</span><span><b>4, 8 or 24 hours</b>Choose what the day needs</span></div>
      </div>
    </div>
  </section>

  <section class="pg-sec" id="durations" aria-labelledby="dur-t">
    <div class="wrap">
      <div class="pg-head center">
        <div class="eyebrow rv">${esc(B.title)}</div>
        <h2 class="rv" id="dur-t" style="--d:.05s">Choose the <em>length of support</em></h2>
        <p class="rv" style="--d:.1s">${esc(B.short)}</p>
      </div>
      <div class="by-cards">
        ${B.options.map((o, i) => `<article class="plan by-card rv" style="--d:${(i * 0.08).toFixed(2)}s">
          <div class="hours"><i>${o.hours}h</i><span><b>${esc(o.name)}</b>${esc(o.label)}</span></div>
          <div class="price"><b>${R(o.price)}</b><span>for ${esc(o.label)}</span></div>
          <button class="btn btn-grad" type="button" data-bystander="${o.id}" style="margin-top:24px">Book ${esc(o.name)} ${arrowBtn}</button>
        </article>`).join('\n        ')}
      </div>
      <div class="by-long rv">
        <span class="ic">${ico('cal')}</span>
        <div><b>Need support for longer?</b><p>${esc(B.longTerm)}</p></div>
        <button class="btn btn-grad" type="button" data-bystander="by-long">Discuss long-term care ${arrowBtn}</button>
      </div>
    </div>
  </section>

  <section class="pg-sec tint" aria-labelledby="by-where">
    <div class="wrap">
      <div class="pg-head center">
        <div class="eyebrow rv">Across the KareIQ family</div>
        <h2 class="rv" id="by-where" style="--d:.05s">Also bookable through <em>Kare@Home</em></h2>
        <p class="rv" style="--d:.1s">The same durations and prices apply on the Kare@Home website, alongside its preventive care at home.</p>
      </div>
      <div class="cont" style="grid-template-columns:minmax(0,1fr);max-width:620px;margin-inline:auto">
        <a class="rv" href="/kare-at-home/bystander" data-site="karehome" data-path="/bystander"><img src="/img/karehome-logo.png" alt="" width="1407" height="395"><span><b>Bystander at Kare@Home</b><small>Book a Bystander for care at home.</small></span>${ico('arrow')}</a>
      </div>
    </div>
  </section>`
});

// ---------------------------------------------------------------- FAQ page (/faq)
{
  const F = FAQ.kareiq;
  page({
    file: 'faq.html',
    current: '/faq',
    source: 'kareiq-faq',
    bystander: false,
    css: `\n<link rel="stylesheet" href="/css/faq.css?v=${VER}">`,
    js: `\n<script src="/js/faq-page.js?v=${VER}" defer></script>`,
    title: 'Frequently Asked Questions | KareIQ',
    description: 'Answers to common questions about KareIQ: who we are, Kare@Home and KareNest, how to enquire, care and safety, families and partnerships, and how to reach us.',
    body: `  <section class="pg-hero solo faq-hero" aria-labelledby="faq-title">
    <span class="pg-orb o1" aria-hidden="true"></span><span class="pg-orb o2" aria-hidden="true"></span>
    <div class="wrap pg-hero-in">
      <div>
        <ol class="pg-breadcrumb load" aria-label="Breadcrumb"><li><a href="/">KareIQ</a></li><li aria-current="page">FAQs</li></ol>
        <div class="eyebrow load" style="animation-delay:.1s">Frequently Asked Questions</div>
        <h1 class="load" id="faq-title" style="animation-delay:.2s">${esc(F.subtitle).replace(/KareIQ$/, '<em>KareIQ</em>')}</h1>
        ${F.intro.map((p, i) => `<p class="pg-lead load" style="animation-delay:${(0.3 + i * 0.1).toFixed(1)}s">${esc(p)}</p>`).join('\n        ')}
      </div>
    </div>
  </section>

  <section class="faq-sec faq-page" id="faq">
    <div class="wrap">
      ${faqPageBody('kareiq', '/#contact')}
      ${F.outro.map((p) => `<p class="faq-outro">${esc(p.t)}</p>`).join('')}
    </div>
  </section>`
  });
}

console.log('KareIQ: bystander.html and faq.html written to public/');
