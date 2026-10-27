/* KareNest intro animation.
   Loaded in <head> (not deferred) so it decides before the first paint whether to show.
   Like KareIQ's intro it plays on a fresh visit or a reload, and is skipped when moving
   between pages of the site, for links to a section (#contact) and for reduced motion. */
(function () {
  var root = document.documentElement;
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var reload = nav && nav.type === 'reload';
    var internal = document.referrer && new URL(document.referrer).origin === location.origin;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && !location.hash && (!internal || reload)) root.classList.add('kn-intro');
  } catch (e) { /* no intro */ }

  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('knLoader');
    if (!el) return;
    if (!root.classList.contains('kn-intro') || !el.animate) { finish(true); return; }

    var q = function (s) { return el.querySelector(s); };
    var ring = q('.kn-ring'), stem = q('.kn-stem'), sprig = q('.kn-sprig'), mark = q('.kn-mark'), tag = q('.kn-tag'), skip = q('.kn-skip');
    var leaves = [].slice.call(el.querySelectorAll('.kn-leaf'));
    var letters = [].slice.call(el.querySelectorAll('.kn-word span'));
    var done = false;
    var ease = 'cubic-bezier(.22,.8,.24,1)', spring = 'cubic-bezier(.2,.9,.25,1.25)';
    var anim = function (node, frames, opts) { return node.animate(frames, Object.assign({ fill: 'forwards', easing: ease }, opts)).finished; };
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var pageLoaded = new Promise(function (r) { if (document.readyState === 'complete') r(); else addEventListener('load', r, { once: true }); });

    // one gradient across the whole word
    var word = q('.kn-word');
    function paint() { var w = word.offsetWidth; letters.forEach(function (s) { s.style.setProperty('--w', w + 'px'); s.style.setProperty('--x', (-s.offsetLeft) + 'px'); }); }
    paint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);

    function finish(instant) {
      if (done) return;
      done = true;
      var clear = function () { root.classList.remove('kn-intro'); if (el.parentNode) el.parentNode.removeChild(el); };
      if (instant || !el.animate) { clear(); return; }
      root.classList.remove('kn-intro'); // let the hero start as the screen lifts
      el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(calc(-100% - 100px))' }],
        { duration: 900, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' }).finished.then(clear, clear);
    }

    skip.addEventListener('click', function () { finish(false); });
    setTimeout(function () { skip.classList.add('show'); }, 1000);
    setTimeout(function () { finish(false); }, 7500); // never trap the visitor

    (async function run() {
      try {
        // 1. the ring draws and the sprig grows from the bottom
        anim(ring, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1300 });
        await wait(120);
        anim(stem, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 750 });
        // 2. four leaves unfurl, one after another
        leaves.forEach(function (lf, i) {
          setTimeout(function () { anim(lf, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 650, easing: spring }); }, 380 + i * 140);
        });
        await wait(1150);
        // 3. the sprig settles into the KareNest mark
        anim(sprig, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 0, transform: 'scale(.7)' }], { duration: 380 });
        await wait(160);
        anim(mark, [{ opacity: 0, transform: 'scale(.5)' }, { opacity: 1, transform: 'scale(1.08)', offset: .7 }, { opacity: 1, transform: 'scale(1)' }], { duration: 700, easing: ease });
        // 4. the wordmark rises letter by letter, then the promise
        letters.forEach(function (s, i) {
          setTimeout(function () { anim(s, [{ opacity: 0, transform: 'translateY(60%)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 520 }); }, 200 + i * 55);
        });
        await wait(200 + letters.length * 55 + 300);
        anim(tag, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 500 });
        // 5. hold a moment (and wait for the page, at most 1.5 s more), then lift away
        await Promise.all([wait(750), Promise.race([pageLoaded, wait(1500)])]);
        finish(false);
      } catch (e) { finish(true); }
    })();
  });
})();
