#!/usr/bin/env node
// Builds the KareNest website from tools/karenest/{layout,pages,data}.js.
//
//   node tools/karenest/build.js                       -> public/karenest/  (served at /karenest by server.js)
//   node tools/karenest/build.js --standalone <dir>    -> also a ready-to-deploy copy for karenest.co.in
//
// Pages are plain HTML files with clean URLs (/about -> about.html, /live-with-us/kareplus ->
// live-with-us/kareplus.html), so they open directly, survive a refresh and work on any static host.
const fs = require('fs');
const path = require('path');
const { make } = require('./layout');
const buildPages = require('./pages');

const ROOT = path.join(__dirname, '..', '..');
const EMBED_DIR = path.join(ROOT, 'public', 'karenest');
const ASSETS = ['site.css', 'karebalance.css', 'loader.css', 'loader.js', 'app.js'];

function fileFor(p) { return p === '/' ? 'index.html' : p.replace(/^\//, '') + '.html'; }

function notFoundPage(L) {
  return {
    key: '404', path: '/404', nav: '', title: 'Page not found', description: 'This page could not be found on the KareNest website.',
    body: () => `<section class="phero solo"><div class="wrap phero-in"><div class="phero-copy">
  <div class="eyebrow">Page not found</div>
  <h1>We couldn't find <span class="accent">that page</span></h1>
  <p class="lede">The link may be old, or the page may have moved. These will take you somewhere useful:</p>
  <div class="hero-actions"><a class="btn btn-primary" href="${L.home}">KareNest home</a><a class="btn btn-ghost" href="${L.u('/packages')}">Our Packages</a><a class="btn btn-ghost" href="${L.u('/contact')}">Contact Us</a></div>
</div></div></section>`
  };
}

// About, Life, Activities, For Families, Join Our Community and Contact Us are sections of the
// home page (like the Kare@Home home page). Their content is written in pages.js as before; here
// it is gathered into the home page, and those addresses send visitors to the right section.
const ON_HOME = { about: 'about', life: 'life', activities: 'activities', families: 'families', community: 'community', contact: 'contact' };

// take one <section> (with everything inside it) out of a page, by an attribute inside its tag
function pick(html, attr) {
  const at = html.indexOf(attr); if (at < 0) throw new Error('section not found: ' + attr);
  const i = html.lastIndexOf('<section', at), j = html.indexOf('</section>', at) + '</section>'.length;
  return html.slice(i, j);
}
const setId = (sec, id) => sec.replace(/^<section[^>]*>/, (tag) => tag.replace(/ id="[^"]*"/, '').replace('<section', `<section id="${id}"`));

function composeHome(pages) {
  const body = (k) => pages.find((x) => x.key === k).body();
  const home = body('home'), about = body('about'), life = body('life'), acts = body('activities'), fam = body('families'), comm = body('community'), contact = body('contact');
  const famTeaser = pick(home, 'id="families-teaser"');
  const famCard = famTeaser.match(/<div class="fam rv">[\s\S]*?<\/a>\s*<\/div>\s*<\/div>/)[0]
    .replace(/<a class="btn btn-primary mag" href="[^"]*">Learn How We Keep You Connected[\s\S]*?<\/a>/, '');
  const famApp = pick(fam, 'aria-labelledby="fam-app"');
  const families = `<section class="sec" id="families" aria-labelledby="fam-title">
  <div class="wrap">${famCard.replace('<h2>Peace of Mind, Always.</h2>', '<h2 id="fam-title">Peace of Mind, Always.</h2>')}</div>
</section>
${famApp.replace('<section class="sec"', '<section class="sec" id="families-app"').replace('style="padding-top:30px"', 'style="padding-top:0"')}`;
  const parts = [
    home.slice(0, home.indexOf('<section class="sec" id="experience"')),            // hero
    pick(home, 'id="experience"'),
    setId(pick(about, 'id="focus"'), 'about').replace('id="focus-title"', 'id="about-title"').replace('aria-labelledby="focus-title"', 'aria-labelledby="about-title"'),
    pick(about, 'aria-labelledby="where-title"'),
    setId(pick(life, 'id="day"'), 'life'),
    pick(life, 'id="events"'),
    setId(pick(acts, 'id="all-activities"'), 'activities').replace('<h2 class="h2" id="acts-title" style="color:var(--blue)">Something for every day</h2>', '<h2 class="h2" id="acts-title" style="color:var(--blue)">Activities &amp; Wellness</h2>'),
    pick(home, 'id="glance"'),
    families,
    setId(pick(comm, 'aria-labelledby="comm-t"'), 'community').replace('<h2 class="h2" id="comm-t">For seniors, families and caregivers</h2>', '<h2 class="h2" id="comm-t">Join Our Community</h2><p class="sub" style="margin-top:8px">More Than Activities. A Community.</p>'),
    pick(comm, 'id="join"'),
    pick(home, 'id="fit"'),
    pick(home, 'id="find-your-place"'),
    setId(pick(contact, 'id="enquiry"'), 'contact').replace(/<nav class="crumbs"[\s\S]*?<\/nav>/, '').replace('<h1 class="h2" id="contact-title"', '<h2 class="h2" id="contact-title"').replace(/(id="contact-title"[^>]*>[\s\S]*?)<\/h1>/, '$1</h2>')
  ];
  return parts.join('\n\n');
}

// links to the old separate pages now point at the home-page sections
function relink(html, P) {
  const h = P + '/';
  return html
    .replace(new RegExp(`href="${P}/contact\\?type=([\\w-]+)#enquiry"`, 'g'), `href="${h}?type=$1#contact"`)
    .replace(new RegExp(`href="${P}/contact(#enquiry)?"`, 'g'), `href="${h}#contact"`)
    .replace(new RegExp(`href="${P}/community(#join)?"`, 'g'), (m, j) => `href="${h}#${j ? 'join' : 'community'}"`)
    .replace(new RegExp(`href="${P}/life#events"`, 'g'), `href="${h}#events"`)
    .replace(new RegExp(`href="${P}/(about|life|activities|families)"`, 'g'), `href="${h}#$1"`);
}

function build(outDir, prefix, mode) {
  const L = make(prefix, mode);
  let pages = buildPages(L);
  const homeBody = composeHome(pages);
  pages = pages.filter((x) => !ON_HOME[x.key]);
  const home = pages.find((x) => x.key === 'home');
  home.body = () => homeBody;
  home.lightbox = true;
  pages.push(notFoundPage(L));
  const seen = new Set();
  for (const pg of pages) {
    const rel = pg.key === '404' ? '404.html' : fileFor(pg.path);
    if (seen.has(rel)) throw new Error('Two pages want ' + rel);
    seen.add(rel);
    const html = relink(L.page(pg, pg.body()), prefix);
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
  }
  for (const k of Object.keys(ON_HOME)) fs.rmSync(path.join(outDir, k + '.html'), { force: true });
  return pages;
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const f of fs.readdirSync(src)) {
    const s = path.join(src, f), d = path.join(dest, f);
    if (fs.statSync(s).isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
  }
}

const pages = build(EMBED_DIR, '/karenest', 'embedded');
console.log(`KareNest: ${pages.length} pages written to public/karenest/`);

const i = process.argv.indexOf('--standalone');
if (i > -1) {
  const out = path.resolve(process.argv[i + 1] || 'karenest-website');
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  build(out, '', 'standalone');
  for (const a of ASSETS) fs.copyFileSync(path.join(EMBED_DIR, a), path.join(out, a));
  copyDir(path.join(EMBED_DIR, 'images'), path.join(out, 'images'));
  fs.mkdirSync(path.join(out, 'js'), { recursive: true });
  fs.copyFileSync(path.join(__dirname, 'standalone', 'sites.js'), path.join(out, 'js', 'sites.js'));
  fs.copyFileSync(path.join(__dirname, 'standalone', 'vercel.json'), path.join(out, 'vercel.json'));
  console.log(`KareNest: standalone site written to ${out}`);
}
