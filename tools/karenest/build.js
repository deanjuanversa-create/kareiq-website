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

function build(outDir, prefix, mode) {
  const L = make(prefix, mode);
  const pages = buildPages(L);
  pages.push(notFoundPage(L));
  const seen = new Set();
  for (const pg of pages) {
    const rel = pg.key === '404' ? '404.html' : fileFor(pg.path);
    if (seen.has(rel)) throw new Error('Two pages want ' + rel);
    seen.add(rel);
    const html = L.page(pg, pg.body());
    const dest = path.join(outDir, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, html);
  }
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
