#!/usr/bin/env node
// Builds the KareWellness website: the wellness home of the KareIQ family, with the complete
// KareBalance and KareMind programmes (tools/shared/wellness.js is the only source of the wording
// and prices). It is a website of its own, like KareNest:
//
//   node tools/karewellness/build.js                       -> public/karewellness/  (served at /karewellness by server.js)
//   node tools/karewellness/build.js --standalone <dir>    -> also a ready-to-deploy copy for its own domain
//
// Pages: /  (home), /karebalance, /karemind, 404. "Book a Service" opens the KareIQ app, which asks the
// visitor to sign in and then continues to the booking for the chosen package.
const fs = require('fs');
const path = require('path');
const W = require('../shared/wellness');

const ROOT = path.join(__dirname, '..', '..');
const PUB = path.join(ROOT, 'public');
const EMBED_DIR = path.join(PUB, 'karewellness');
const VER = '20261102b';
const SITE_HOST = 'https://karewellness.co.in';
const KAREIQ = { embedded: '/', standalone: 'https://kareiq.co.in/' };
const KAREHOME = { embedded: '/kare-at-home', standalone: 'https://karehome.co.in/' };
const KARENEST = { embedded: '/karenest/', standalone: 'https://karenest.co.in/' };
const APP = { embedded: '/app/', standalone: 'https://kareiq-api.onrender.com/app/' };

const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const R = W.rupees;
const IC = {
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  tick: '<path d="M5 12.5l4.2 4.2L19 7"/>',
  cross: '<path d="M7 7l10 10M17 7 7 17"/>',
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
  cal: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17"/>',
  up: '<path d="M12 19V5M6 11l6-6 6 6"/>'
};
const ico = (n) => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${IC[n]}</svg>`;
// the KareWellness emblem, cut from the supplied gradient brand logo (images/kw-emblem.webp, 2 Nov 2026)
const MARK = (src) => `<img class="kw-mark" src="${src}" alt="" width="208" height="192" decoding="async">`;
const ticks = (list, icon = 'tick') => `<ul class="ticks">${list.map((t) => `<li>${ico(icon)}<span>${esc(t)}</span></li>`).join('')}</ul>`;

function make(P, mode) {
  const u = (p) => (P + p).replace(/\/+$/, '') || '/';
  const home = P ? P + '/' : '/';
  const img = (f) => `${P}/images/${f}?v=${VER}`;
  // links to the KareIQ app: href works on its own, data-app-path lets js/sites.js use the app's address
  const book = (p, label, cls = 'btn btn-grad') => `<a class="${cls}" href="${APP[mode]}${W.bookPath(p)}" data-app-path="${W.bookPath(p)}">${label} ${ico('arrow')}</a>`;
  const site = (key, map, pathPart = '') => `href="${map[mode]}${pathPart}" data-site="${key}"${pathPart ? ` data-path="${pathPart}"` : ''}`;

  function head(pg) {
    const title = pg.key === 'home' ? 'KareWellness | KareBalance and KareMind wellness programmes' : `${pg.title} | KareWellness`;
    const canonical = mode === 'standalone' ? `<link rel="canonical" href="${SITE_HOST}${pg.path === '/' ? '/' : pg.path}">\n` : '';
    return `<!DOCTYPE html>
<html lang="en-IN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(pg.description)}">
${canonical}<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(pg.description)}">
<meta property="og:type" content="website">
<meta name="theme-color" content="#11998e">
<link rel="icon" type="image/png" href="${img('favicon.png')}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght,SOFT@9..144,300..700,30&family=Outfit:wght@300;400;500;600;700&display=swap">
<link rel="stylesheet" href="${P}/loader.css?v=${VER}">
<script src="${P}/loader.js?v=${VER}"></script>
<link rel="stylesheet" href="${P}/site.css?v=${VER}">
${pg.preload ? `<link rel="preload" as="image" href="${img(pg.preload)}">\n` : ''}</head>`;
  }

  const NAV = [['home', home, 'Home'], ['about', home + '#about', 'About'], ['karebalance', u('/karebalance'), 'KareBalance'], ['karemind', u('/karemind'), 'KareMind'], ['contact', '#contact', 'Contact']];
  function header(pg) {
    const cur = (k) => (k === pg.key ? ' aria-current="page"' : '');
    const items = NAV.map(([k, h, l]) => `<li><a href="${h}"${cur(k)}>${l}</a></li>`).join('');
    return `<a class="skip" href="#main">Skip to main content</a>
<div class="progress" id="progress" aria-hidden="true"></div>
<header class="nav" id="nav">
  <div class="wrap nav-in">
    <a class="brand" href="${home}" aria-label="KareWellness home"${cur('home')}>${MARK(img('kw-emblem.webp'))}<span><b>KareWellness</b><small>A KareIQ brand</small></span></a>
    <nav aria-label="Main"><ul class="links">${items}</ul></nav>
    <div class="nav-end">
      <a class="signin" href="${APP[mode]}#/signin" data-app="kareiq" aria-label="Sign in for families and caregivers">${ico('user')}<span>Sign in</span></a>
      ${book(null, 'Book a Service')}
    </div>
    <button class="burger" id="burger" type="button" aria-label="Open menu" aria-expanded="false" aria-controls="drawer"><span></span></button>
  </div>
  <nav class="drawer" id="drawer" aria-label="Menu">
    <div class="wrap">
      <ul>${items}</ul>
      ${book(null, 'Book a Service')}
    </div>
  </nav>
</header>`;
  }

  // the intro screen (public/karewellness/loader.js decides whether it plays)
  function loader() {
    const word = 'KareWellness'.split('').map((c) => `<span>${c}</span>`).join('');
    return `<div class="kw-loader" id="kwLoader" role="status" aria-label="Loading KareWellness">
  <div class="kw-stage">
    <div class="kw-emblem" aria-hidden="true">
      <svg viewBox="0 0 200 200">
        <defs>
          <linearGradient id="kwGradA" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#11998e"/><stop offset="1" stop-color="#3b82c4"/></linearGradient>
          <linearGradient id="kwGradB" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c5cc4"/><stop offset="1" stop-color="#e4609e"/></linearGradient>
        </defs>
        <circle class="kw-track" cx="100" cy="100" r="86"/>
        <path class="kw-arc a1" pathLength="1" d="M100 186A86 86 0 0 1 100 14"/>
        <path class="kw-arc a2" pathLength="1" d="M100 14A86 86 0 0 1 100 186"/>
        <circle class="kw-dot d1" cx="100" cy="186" r="5"/>
        <circle class="kw-dot d2" cx="100" cy="14" r="5"/>
      </svg>
      <img class="kw-mark-in" src="${img('kw-emblem.webp')}" alt="" width="208" height="192">
    </div>
    <div class="kw-word" aria-hidden="true">${word}</div>
    <div class="kw-tag">Body and mind, cared for</div>
  </div>
  <button class="kw-skip" type="button">Skip intro</button>
  <svg class="kw-wave" viewBox="0 0 1440 90" preserveAspectRatio="none" aria-hidden="true"><path d="M0 0h1440v34c-180 38-360 56-540 40S540 22 360 26 120 70 0 64Z"/></svg>
</div>
`;
  }

  function footer() {
    return `<footer>
  <div class="wrap">
    <div class="foot">
      <div>
        <a class="brand" href="${home}" aria-label="KareWellness home">${MARK(img('kw-emblem.webp'))}<span><b>KareWellness</b><small>Wellness across the KareIQ family</small></span></a>
        <p>Structured, personal programmes for balance, mobility and mental wellbeing, at home or in community.</p>
        <a class="byk" ${site('kareiq', KAREIQ)}>A brand by <img src="${img('kareiq-logo.png')}" alt="KareIQ" width="984" height="276"></a>
      </div>
      <div><h2>Programmes</h2><ul><li><a href="${u('/karebalance')}">KareBalance</a></li><li><a href="${u('/karebalance')}#karebalance-plans">KareBalance packages</a></li><li><a href="${u('/karemind')}">KareMind</a></li><li><a href="${u('/karemind')}#karemind-plans">KareMind packages</a></li></ul></div>
      <div><h2>KareIQ family</h2><ul><li><a ${site('kareiq', KAREIQ)}>KareIQ</a></li><li><a ${site('karehome', KAREHOME)}>Kare@Home</a></li><li><a ${site('karenest', KARENEST)}>KareNest</a></li></ul></div>
      <div><h2>Talk to us</h2><ul><li><a href="tel:+918129345178">+91 81293 45178</a></li><li><a href="mailto:support@kareiq.co.in">support@kareiq.co.in</a></li><li><a href="https://chat.whatsapp.com/GAl7KV4ZxtY5FzKHkRZgyM" target="_blank" rel="noopener">WhatsApp community</a></li><li><a href="${APP[mode]}#/signin" data-app="kareiq">Sign in</a></li></ul></div>
    </div>
    <div class="foot-bottom"><span>© <span id="year">2026</span> KareIQ. All rights reserved.</span><span><a ${site('kareiq', KAREIQ, 'privacy')}>Privacy Policy</a> · <a ${site('kareiq', KAREIQ, 'terms')}>Terms &amp; Conditions</a></span></div>
  </div>
</footer>
<button class="totop" id="totop" type="button" aria-label="Back to top">${ico('up')}</button>`;
  }

  function contact(interest, title = 'Have a question before you book?') {
    const opt = (v, l) => `<option value="${v}"${v === interest ? ' selected' : ''}>${l}</option>`;
    return `<section class="pg-sec tint" id="contact" aria-labelledby="contact-title">
    <div class="wrap contact-in">
      <div class="rv">
        <div class="eyebrow">Contact</div>
        <h2 class="blk-h" id="contact-title" style="margin-top:14px">${title}</h2>
        <p class="blk-sub">Leave your name and number and our wellness team will call you back, usually the same day. Ready to start? Book a Service and sign in to choose your package.</p>
        <ul class="points">
          <li>${ico('tick')}<span>Help choosing between KareBalance and KareMind packages</span></li>
          <li>${ico('tick')}<span>Available to families of Kare@Home and KareNest</span></li>
          <li>${ico('tick')}<span>Monday to Saturday, 9:30 AM to 6:00 PM · <a href="tel:+918129345178">+91 81293 45178</a></span></li>
        </ul>
        <div class="pg-ctas">${book(null, 'Book a Service')}</div>
      </div>
      <div class="rv" style="--d:.1s">
        <form class="cform" id="enquiry" novalidate>
          <h3>Send an enquiry</h3>
          <div class="form-alert" role="alert" hidden></div>
          <div class="field"><label for="e-name">Your name</label><input id="e-name" name="name" autocomplete="name" placeholder="e.g. Priya Raman" required><span class="err"></span></div>
          <div class="field"><label for="e-phone">Mobile number</label><input id="e-phone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="98765 43210" required><span class="err"></span></div>
          <div class="field"><label for="e-email">Email <span class="opt">(optional)</span></label><input id="e-email" name="email" type="email" autocomplete="email" placeholder="you@example.com"><span class="err"></span></div>
          <div class="field"><label for="e-interest">I'm interested in</label><select id="e-interest" name="interest">${opt('karebalance', 'KareBalance: fall prevention &amp; mobility')}${opt('karemind', 'KareMind: mental wellbeing')}${opt('karewellness', 'Not sure yet, help me choose')}</select></div>
          <div class="field"><label for="e-msg">Anything we should know? <span class="opt">(optional)</span></label><textarea id="e-msg" name="message" rows="3" maxlength="1000" placeholder="Age, health needs, best time to call…"></textarea></div>
          <div class="hp" aria-hidden="true"><label for="e-website">Leave this empty</label><input id="e-website" name="website" tabindex="-1" autocomplete="off"></div>
          <label class="check"><input type="checkbox" name="consent"><span>I agree to be contacted by KareIQ about this enquiry. <span class="err"></span></span></label>
          <button class="btn btn-grad" type="submit">Request a call back ${ico('arrow')}</button>
        </form>
        <div class="cform done" id="enquiryDone" tabindex="-1" hidden>
          <div class="tick">${ico('tick')}</div>
          <h3>Thank you, <span id="doneName"></span></h3>
          <p>We've received your enquiry. Our wellness team will call you soon.</p>
          <p class="ref">Your reference <b id="doneRef"></b></p>
          <button class="btn btn-line" type="button" id="enquiryAgain" style="margin-top:18px">Send another</button>
        </div>
      </div>
    </div>
  </section>`;
  }

  function page(pg) {
    return `${head(pg)}
<body data-page="${pg.key}" data-base="${home}">
<!-- written by tools/karewellness/build.js from tools/shared/wellness.js; edit those, not this file -->
${pg.key === '404' ? '' : loader()}${header(pg)}
<main id="main" tabindex="-1">
${pg.body()}
</main>
${footer()}
<script src="${mode === 'standalone' ? P + '/js/sites.js' : '/js/api.js'}?v=${VER}"></script>
${mode === 'standalone' ? '' : `<script src="/js/sites.js?v=${VER}"></script>\n`}<script src="${P}/app.js?v=${VER}"></script>
</body>
</html>
`;
  }

  return { u, home, img, book, site, page, contact };
}

// ---------------------------------------------------------------- page bodies
function pages(L) {
  const { u, home, img, book, site, contact } = L;
  const kbFrom = Math.min(...W.byGroup('karebalance').map((p) => p.price));
  const kmFrom = Math.min(...W.byGroup('karemind').map((p) => p.price));

  function planCard(p, feature) {
    const tier = p.name.split(' ').pop();
    return `<article class="plan rv${feature ? ' feature' : ''}" id="${p.id}">
          ${p.flag ? `<span class="flag">${esc(p.flag)}</span>` : ''}
          <span class="tier">${esc(tier)}</span>
          <h4>${esc(p.name)}</h4>
          <p class="type">${esc(p.type)}</p>
          <div class="price"><b>${R(p.price)}</b><span>${esc(p.unitText)}</span></div>
          <p class="incl">${esc(W.INCL)}</p>
          ${p.desc ? `<p class="desc">${esc(p.desc)}</p>` : ''}
          <h5>${esc(p.listTitle)}</h5>
          ${ticks(p.includes)}
          <p class="best"><b>Best for:</b> ${esc(p.best)}</p>
          ${book(p, `Book ${esc(tier)}`)}
        </article>`;
  }
  const compare = (c, id) => `<div class="cmp rv" role="region" aria-labelledby="${id}" tabindex="0">
        <table>
          <caption id="${id}">${esc(c.title)}</caption>
          <thead><tr><th scope="col">&nbsp;</th>${c.cols.map((x) => `<th scope="col">${esc(x)}</th>`).join('')}</tr></thead>
          <tbody>${c.rows.map((r) => `<tr${r[0] === 'Price' ? ' class="price-row"' : ''}><th scope="row">${esc(r[0])}</th>${r.slice(1).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`).join('')}</tbody>
        </table>
      </div>`;

  function programme(G, o) {
    const plans = W.byGroup(G.id);
    return `<section class="pg-sec prog ${o.cls}" id="${G.id}" aria-labelledby="${G.id}-title">
    <div class="wrap">
      <ol class="pg-breadcrumb load" aria-label="Breadcrumb"><li><a href="${home}">KareWellness</a></li><li aria-current="page">${esc(G.name)}</li></ol>
      <div class="prog-top">
        <div class="prog-intro">
          <span class="prog-tag load" style="animation-delay:.05s"><i>${ico(o.icon)}</i>${esc(G.kicker)}</span>
          <h1 class="prog-title load" id="${G.id}-title" style="animation-delay:.15s">${G.headline.map((t) => `<span>${esc(t)}</span>`).join('')}<span class="sr"> ${esc(G.name)}</span></h1>
          <span class="prog-name load" style="animation-delay:.25s"><b>${esc(G.name)}</b> · ${esc(G.short)}</span>
          ${G.intro.map((t) => `<p class="load" style="animation-delay:.32s">${esc(t)}</p>`).join('\n          ')}
          ${G.quote ? `<div class="prog-quote rv"><b>${esc(G.quote[0])}</b><p>${esc(G.quote[1])}</p></div>` : ''}
          <div class="pg-ctas load" style="animation-delay:.4s"><a class="btn btn-grad" href="#${G.id}-plans">See packages &amp; pricing ${ico('arrow')}</a><a class="btn btn-ghost" href="#contact" data-ask="${G.id}">Ask a question</a></div>
        </div>
        <figure class="prog-photo load" style="animation-delay:.2s"><img src="${img(o.img)}" alt="${esc(o.alt)}" width="1600" height="${o.h}" fetchpriority="high"><figcaption>${o.caption}</figcaption></figure>
      </div>

      <div class="blk">
        <h2 class="blk-h rv">Objectives &amp; benefits</h2>
        <p class="blk-sub rv">${esc(o.objSub)}</p>
        <ul class="objs">${G.objectives.map((x, i) => `<li class="obj rv" style="--d:${(i * 0.05).toFixed(2)}s"><span class="ic">${ico(x[0])}</span><h3>${esc(x[1])}</h3><p>${esc(x[2])}</p></li>`).join('')}</ul>
      </div>

      <div class="blk two-col">
        <div class="panel rv"><h2>Services &amp; activities</h2>${ticks(G.services)}</div>
        ${G.whoFor
          ? `<div class="panel soft rv" style="--d:.08s"><h2>Who is ${esc(G.name)} for?</h2><p class="blk-sub" style="margin-top:8px">${esc(G.name)} is designed for older adults who:</p>${ticks(G.whoFor)}</div>`
          : `<div class="panel soft rv" style="--d:.08s"><h2>Who is ${esc(G.name)} for?</h2><p class="blk-sub" style="margin-top:8px">Whether you are experiencing everyday stress, adjusting to life changes, feeling socially disconnected, or simply looking to prioritise your mental wellbeing:</p>${ticks(plans.map((p) => `${p.name.replace(G.name + ' ', '')}: ${p.best}`))}</div>`}
      </div>

      <div class="blk">
        <h2 class="blk-h rv">Programme features</h2>
        <ul class="feats">${G.features.map((f, i) => `<li class="feat rv" style="--d:${(i * 0.05).toFixed(2)}s"><h3>${esc(f[0])}</h3><p>${esc(f[1])}</p></li>`).join('')}</ul>
      </div>

      <div class="blk" id="${G.id}-plans">
        <h2 class="blk-h rv">${esc(G.name)} packages &amp; pricing</h2>
        <p class="blk-sub rv">${esc(o.planSub)} Every price is ${esc(W.INCL.replace(/^Inclusive/, 'inclusive'))}. Choose <b>Book</b> to sign in and continue to the booking.</p>
        <div class="plans">
        ${plans.map((p, i) => planCard(p, i === 1)).join('\n        ')}
        </div>
        ${compare(o.compare, G.id + '-cmp')}
        <div class="excl rv"><h4>Not included</h4><ul>${G.excludes.map((t) => `<li>${ico('cross')}<span>${esc(t)}</span></li>`).join('')}</ul></div>
        <div class="help-band rv">
          <span class="ic">${ico('chat')}</span>
          <div><h3>${esc(o.helpTitle)}</h3><p>${esc(o.helpText)}</p></div>
          <a class="btn btn-grad" href="#contact" data-ask="${G.id}">Talk to Our Team ${ico('arrow')}</a>
        </div>
        <div class="terms rv">
          <h4>Terms &amp; conditions</h4>
          <ol>${G.terms.map((t) => `<li>${esc(t)}</li>`).join('')}</ol>
        </div>
        ${G.tagline ? `<p class="prog-tagline rv"><b>${esc(G.name)}</b> — ${esc(G.tagline)}</p>` : ''}
      </div>
    </div>
  </section>`;
  }

  const other = (G, href, imgf, alt, h) => `<section class="pg-sec" aria-labelledby="other-t">
    <div class="wrap">
      <div class="pg-head center"><div class="eyebrow rv">Also from KareWellness</div><h2 class="rv" id="other-t" style="--d:.05s">${esc(G.name)}: <em>${esc(G.kicker.toLowerCase())}</em></h2></div>
      <div class="doors" style="grid-template-columns:minmax(0,1fr);max-width:720px;margin-inline:auto">
        <a class="door ${G.id === 'karebalance' ? 'kb' : 'km'} rv" href="${href}">
          <div class="door-img"><img src="${img(imgf)}" alt="${esc(alt)}" width="1600" height="${h}" loading="lazy" decoding="async"></div>
          <div class="door-body"><span class="kick">${esc(G.kicker)}</span><h3>${esc(G.name)}</h3><p>${esc(G.short)}</p><div class="from"><span>From <b>${R(Math.min(...W.byGroup(G.id).map((p) => p.price)))}</b></span><span class="go">See ${esc(G.name)} ${ico('arrow')}</span></div></div>
        </a>
      </div>
    </div>
  </section>`;

  return [
    {
      key: 'home', path: '/', preload: 'a1.webp',
      title: 'KareWellness',
      description: `KareWellness is the wellness home of the KareIQ family: KareBalance for fall prevention and mobility (from ${R(kbFrom)}) and KareMind for mental wellbeing (from ${R(kmFrom)}), for families of Kare@Home and KareNest.`,
      body: () => `  <section class="pg-hero" aria-labelledby="kw-title">
    <span class="pg-orb o1" aria-hidden="true"></span><span class="pg-orb o2" aria-hidden="true"></span>
    <div class="wrap pg-hero-in">
      <div>
        <div class="kw-lockup load">${MARK(img('kw-emblem.webp'))}<span><b>KareWellness</b><small>Wellness across the KareIQ family</small></span></div>
        <h1 class="load" id="kw-title" style="animation-delay:.15s">Wellness that goes with you, <em>from home to community.</em></h1>
        <p class="pg-lead load" style="animation-delay:.3s">KareWellness brings the KareIQ wellness programmes together in one place. Whether your loved one is cared for at home by Kare@Home or is part of the KareNest community, KareBalance and KareMind offer the same structured, personal support for body and mind.</p>
        <div class="pg-ctas load" style="animation-delay:.45s">
          <a class="btn btn-grad" href="#programmes">Explore programmes ${ico('arrow')}</a>
          ${book(null, 'Book a Service', 'btn btn-ghost')}
        </div>
        <div class="pg-family load" style="animation-delay:.6s"><span>For families of</span>
          <a ${site('karehome', KAREHOME)}><img src="${img('karehome-logo.png')}" alt="Kare@Home" width="1407" height="395"></a>
          <a ${site('karenest', KARENEST)}><img src="${img('karenest-mark.webp')}" alt="" width="360" height="368">KareNest</a>
        </div>
      </div>
      <div class="pg-hero-art load" style="animation-delay:.25s">
        <div class="pg-hero-photo"><img src="${img('a1.webp')}" alt="Older adults doing a guided yoga session together on a garden lawn" width="1600" height="779" fetchpriority="high"></div>
        <a class="pg-chip c1" href="${u('/karebalance')}"><span class="ic">${ico('balance')}</span><span><b>KareBalance</b>Fall prevention &amp; mobility</span></a>
        <a class="pg-chip c2" href="${u('/karemind')}"><span class="ic">${ico('mind')}</span><span><b>KareMind</b>Mental wellbeing</span></a>
      </div>
    </div>
  </section>

  <section class="pg-sec" id="about" aria-labelledby="why-kw">
    <div class="wrap">
      <div class="pg-head center">
        <div class="eyebrow rv">About KareWellness</div>
        <h2 class="rv" id="why-kw" style="--d:.05s">Healthy ageing is more than care. <em>It is staying well.</em></h2>
        <p class="rv" style="--d:.1s">KareWellness is where KareIQ's preventive and wellness programmes come together, so that support for balance, mobility and emotional wellbeing continues wherever care happens: at home or in a residential community.</p>
        <div class="rule rv z" style="--d:.15s"></div>
      </div>
      <ul class="pillars">
        <li class="pillar rv"><span class="ic">${ico('shieldHeart')}</span><h3>Preventive healthcare</h3><p>Assessments that find risks early, before they become problems.</p></li>
        <li class="pillar rv" style="--d:.05s;--t:#eef6ee;--c:#2f8a5b"><span class="ic">${ico('sprout')}</span><h3>Healthy ageing</h3><p>Habits, routines and activity that help older adults stay strong and engaged.</p></li>
        <li class="pillar rv" style="--d:.1s;--t:var(--kb-tint);--c:var(--kb-deep)"><span class="ic">${ico('balance')}</span><h3>Fall prevention &amp; mobility</h3><p>Balance, strength and safer movement with KareBalance.</p></li>
        <li class="pillar rv" style="--t:var(--km-tint);--c:var(--km-deep)"><span class="ic">${ico('mind')}</span><h3>Mental wellness</h3><p>Emotional wellbeing, stress, sleep and connection with KareMind.</p></li>
        <li class="pillar rv" style="--d:.05s;--t:var(--pink-tint);--c:#c0508f"><span class="ic">${ico('user')}</span><h3>Personalised support</h3><p>Every programme starts with an assessment and a plan for the person.</p></li>
        <li class="pillar rv" style="--d:.1s;--t:#eef2fb;--c:#3b6fb0"><span class="ic">${ico('loop')}</span><h3>Continuity of care</h3><p>The same programmes and progress, whether at home or in residential care.</p></li>
      </ul>
    </div>
  </section>

  <section class="pg-sec tint" id="programmes" aria-labelledby="prog-t">
    <div class="wrap">
      <div class="pg-head center">
        <div class="eyebrow rv">Wellness programmes</div>
        <h2 class="rv" id="prog-t" style="--d:.05s">Two programmes. <em>Body and mind.</em></h2>
        <p class="rv" style="--d:.1s">Each programme has its own page with objectives, services, every package and price, what is and isn't included, and the terms.</p>
      </div>
      <div class="doors">
        <a class="door kb rv l" href="${u('/karebalance')}">
          <div class="door-img"><img src="${img('c2.webp')}" alt="An older man practising a slow balance exercise in a garden" width="1600" height="780" loading="lazy" decoding="async"></div>
          <div class="door-body"><span class="kick">${esc(W.karebalance.kicker)}</span><h3>KareBalance</h3><p>${esc(W.karebalance.short)}</p>
            <div class="from"><span>From <b>${R(kbFrom)}</b></span><span class="go">See KareBalance ${ico('arrow')}</span></div></div>
        </a>
        <a class="door km rv r" href="${u('/karemind')}" style="--d:.1s">
          <div class="door-img"><img src="${img('c1.webp')}" alt="Friends chatting and laughing together around a garden table" width="1600" height="730" loading="lazy" decoding="async"></div>
          <div class="door-body"><span class="kick">${esc(W.karemind.kicker)}</span><h3>KareMind</h3><p>${esc(W.karemind.short)}</p>
            <div class="from"><span>From <b>${R(kmFrom)}</b></span><span class="go">See KareMind ${ico('arrow')}</span></div></div>
        </a>
      </div>
    </div>
  </section>

  <section class="pg-sec" aria-labelledby="how-t">
    <div class="wrap">
      <div class="pg-head center">
        <div class="eyebrow rv">How booking works</div>
        <h2 class="rv" id="how-t" style="--d:.05s">From choosing to starting, <em>in three steps.</em></h2>
      </div>
      <ol class="steps">
        <li class="step rv"><h3>Choose a package</h3><p>Compare the KareBalance and KareMind packages, prices and inclusions.</p></li>
        <li class="step rv" style="--d:.08s"><h3>Sign in and book</h3><p>Book a Service takes you to My KareIQ. Sign in, or create an account in a minute, and confirm the package.</p></li>
        <li class="step rv" style="--d:.16s"><h3>Start with an assessment</h3><p>Our team calls to arrange the first assessment and builds the plan around your loved one.</p></li>
      </ol>
      <div class="pg-ctas" style="justify-content:center">${book(null, 'Book a Service')}</div>
    </div>
  </section>

  <section class="pg-sec tint" aria-labelledby="cont-t">
    <div class="wrap">
      <div class="pg-head center">
        <div class="eyebrow rv">One ecosystem</div>
        <h2 class="rv" id="cont-t" style="--d:.05s">Wellness that continues, <em>wherever care happens.</em></h2>
        <p class="rv" style="--d:.1s">KareWellness programmes are available to families of both KareIQ care brands, so progress carries on when needs change.</p>
      </div>
      <div class="cont">
        <a class="rv l" ${site('karehome', KAREHOME)}><img src="${img('karehome-logo.png')}" alt="" width="1407" height="395"><span><b>Kare@Home</b><small>Preventive care and everyday support at your doorstep.</small></span>${ico('arrow')}</a>
        <a class="rv r" ${site('karenest', KARENEST)} style="--d:.1s"><img class="emb" src="${img('karenest-mark.webp')}" alt="" width="360" height="368"><span><b>KareNest</b><small>A community for health, dignity and happiness.</small></span>${ico('arrow')}</a>
      </div>
    </div>
  </section>

  ${contact('karewellness')}`
    },
    {
      key: 'karebalance', path: '/karebalance', preload: 'e1.webp',
      title: 'KareBalance: fall prevention & mobility',
      description: `KareBalance is a personalised fall prevention and mobility programme for older adults. ${W.byGroup('karebalance').map((p) => `${p.name.replace('KareBalance ', '')} ${R(p.price)}`).join(', ')}, ${W.INCL.toLowerCase().replace('gst', 'GST')}.`,
      body: () => `  ${programme(W.karebalance, {
        cls: 'kb', icon: 'balance', img: 'e1.webp', h: 730, alt: 'An older woman stretching on a garden path during a mobility session',
        caption: 'Stay active.<br>Stay independent.',
        objSub: 'How KareBalance helps older adults stay steady, active and independent.',
        planSub: 'Choose the right level of support for your needs and goals.',
        compare: W.balanceCompare,
        helpTitle: 'Not sure which programme is right for your loved one?',
        helpText: 'Our team can help identify the most appropriate level of support based on mobility, fall history and individual goals.'
      })}

  ${other(W.karemind, u('/karemind'), 'c1.webp', 'Friends chatting and laughing together around a garden table', 730)}

  ${contact('karebalance')}`
    },
    {
      key: 'karemind', path: '/karemind', preload: 'a5.webp',
      title: 'KareMind: mental wellness program',
      description: `KareMind is a structured mental wellness program for emotional wellbeing, stress management, sleep and social connection. ${W.byGroup('karemind').map((p) => `${p.name.replace('KareMind ', '')} ${R(p.price)}`).join(', ')}, ${W.INCL.toLowerCase().replace('gst', 'GST')}.`,
      body: () => `  ${programme(W.karemind, {
        cls: 'km', icon: 'mind', img: 'a5.webp', h: 892, alt: 'Older adults sharing tea and conversation at a garden table',
        caption: 'Feel balanced.<br>Stay connected.',
        objSub: 'Support for the parts of mental wellbeing that matter most in later life.',
        planSub: 'Start with an assessment, or choose ongoing support for three or six months.',
        compare: W.mindCompare,
        helpTitle: 'Would you like to talk it through first?',
        helpText: 'KareMind Base is the recommended starting program: an assessment and a clear plan. Our team will call you back in confidence.'
      })}

  ${other(W.karebalance, u('/karebalance'), 'c2.webp', 'An older man practising a slow balance exercise in a garden', 780)}

  ${contact('karemind')}`
    },
    {
      key: '404', path: '/404', title: 'Page not found', description: 'This page could not be found on the KareWellness website.',
      body: () => `  <section class="pg-hero slim" aria-labelledby="nf-t"><div class="wrap pg-hero-in" style="grid-template-columns:1fr">
    <div><div class="eyebrow">Page not found</div><h1 id="nf-t">We couldn't find <em>that page.</em></h1><p class="pg-lead">The link may be old, or the page may have moved.</p>
    <div class="pg-ctas"><a class="btn btn-grad" href="${home}">KareWellness home ${ico('arrow')}</a><a class="btn btn-ghost" href="${u('/karebalance')}">KareBalance</a><a class="btn btn-ghost" href="${u('/karemind')}">KareMind</a></div></div>
  </div></section>`
    }
  ];
}

// ---------------------------------------------------------------- write
function build(outDir, prefix, mode) {
  const L = make(prefix, mode);
  const list = pages(L);
  fs.mkdirSync(outDir, { recursive: true });
  for (const pg of list) {
    const file = pg.key === 'home' ? 'index.html' : pg.key + '.html';
    fs.writeFileSync(path.join(outDir, file), L.page(pg));
  }
  return list;
}

const list = build(EMBED_DIR, '/karewellness', 'embedded');
console.log(`KareWellness: ${list.length} pages written to public/karewellness/`);

const i = process.argv.indexOf('--standalone');
if (i > -1) {
  const out = path.resolve(process.argv[i + 1] || 'karewellness-website');
  if (out === ROOT || out.startsWith(ROOT + path.sep)) { console.error('Choose a folder outside the project, e.g. ../karewellness-only'); process.exit(1); }
  fs.rmSync(out, { recursive: true, force: true });
  build(out, '', 'standalone');
  for (const a of ['site.css', 'app.js', 'loader.css', 'loader.js']) fs.copyFileSync(path.join(EMBED_DIR, a), path.join(out, a));
  fs.cpSync(path.join(EMBED_DIR, 'images'), path.join(out, 'images'), { recursive: true });
  // sites.js for this domain: where the API and the other KareIQ websites live
  let sites = fs.readFileSync(path.join(PUB, 'js', 'sites.js'), 'utf8');
  sites = sites.replace(/window\.KARE_SITES = \{[\s\S]*?\n\};/, `window.KARE_SITES = {\n  kareiq:   '${KAREIQ.standalone}',\n  karehome: '${KAREHOME.standalone}',\n  karenest: '${KARENEST.standalone}',\n  karewellness: '/'\n};`);
  if (!sites.includes("karewellness: '/'")) throw new Error('sites.js: could not set the addresses');
  sites = "/* Where the KareIQ API server lives (Render): the enquiry form sends here. */\nwindow.KARE_API = /^(localhost|127\\.0\\.0\\.1)$/.test(location.hostname) ? '' : 'https://kareiq-api.onrender.com';\n" + sites;
  fs.mkdirSync(path.join(out, 'js'), { recursive: true });
  fs.writeFileSync(path.join(out, 'js', 'sites.js'), sites);
  fs.writeFileSync(path.join(out, 'vercel.json'), JSON.stringify({
    cleanUrls: true, trailingSlash: false,
    headers: [
      { source: '/(.*)', headers: [{ key: 'X-Content-Type-Options', value: 'nosniff' }, { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }, { key: 'X-Frame-Options', value: 'SAMEORIGIN' }, { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' }] },
      { source: '/images/(.*)', headers: [{ key: 'Cache-Control', value: 'public, max-age=604800' }] }
    ],
    redirects: [
      { source: '/index', destination: '/', permanent: true },
      { source: '/app', destination: APP.standalone, permanent: false },
      { source: '/app/:path*', destination: APP.standalone + ':path*', permanent: false }
    ]
  }, null, 2) + '\n');
  console.log(`KareWellness: standalone site written to ${out}`);
}
