/* KareWellness intro animation.
   Loaded in <head> (not deferred) so it decides before the first paint whether to show.
   Like the KareIQ, Kare@Home and KareNest intros it plays on a fresh visit or a reload, and is
   skipped when moving between pages of the site, for links to a section (#karebalance-plans)
   and for reduced motion. */
(function () {
  var root = document.documentElement;
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var reload = nav && nav.type === 'reload';
    var internal = document.referrer && new URL(document.referrer).origin === location.origin && /\/karewellness(\/|$)|^\/(karebalance|karemind)?$/.test(new URL(document.referrer).pathname);
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && !location.hash && (!internal || reload)) root.classList.add('kw-intro');
  } catch (e) { /* no intro */ }

  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('kwLoader');
    if (!el) return;
    if (!root.classList.contains('kw-intro') || !el.animate) { finish(true); return; }

    var q = function (s) { return el.querySelector(s); };
    var a1 = q('.kw-arc.a1'), a2 = q('.kw-arc.a2'), mark = q('.kw-mark-in'), tag = q('.kw-tag'), skip = q('.kw-skip');
    var dots = [].slice.call(el.querySelectorAll('.kw-dot'));
    var letters = [].slice.call(el.querySelectorAll('.kw-word span'));
    var done = false;
    var ease = 'cubic-bezier(.22,.8,.24,1)', spring = 'cubic-bezier(.2,.9,.25,1.25)';
    var anim = function (node, frames, opts) { return node.animate(frames, Object.assign({ fill: 'forwards', easing: ease }, opts)).finished; };
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var pageLoaded = new Promise(function (r) { if (document.readyState === 'complete') r(); else addEventListener('load', r, { once: true }); });

    // one gradient across the whole word
    var word = q('.kw-word');
    function paint() { var w = word.offsetWidth; letters.forEach(function (s) { s.style.setProperty('--w', w + 'px'); s.style.setProperty('--x', (-s.offsetLeft) + 'px'); }); }
    paint();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(paint);

    function finish(instant) {
      if (done) return;
      done = true;
      var clear = function () { root.classList.remove('kw-intro'); if (el.parentNode) el.parentNode.removeChild(el); };
      if (instant || !el.animate) { clear(); return; }
      root.classList.remove('kw-intro'); // let the page start as the screen lifts
      el.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(calc(-100% - 100px))' }],
        { duration: 900, easing: 'cubic-bezier(.7,0,.25,1)', fill: 'forwards' }).finished.then(clear, clear);
    }

    skip.addEventListener('click', function () { finish(false); });
    setTimeout(function () { skip.classList.add('show'); }, 1000);
    setTimeout(function () { finish(false); }, 7500); // never trap the visitor

    (async function run() {
      try {
        // 1. body and mind: two arcs draw from opposite sides and meet around the ring
        dots.forEach(function (d) { anim(d, [{ transform: 'scale(0)' }, { transform: 'scale(1)' }], { duration: 420, easing: spring }); });
        await wait(160);
        anim(a1, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1150 });
        anim(a2, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 1150 });
        await wait(980);
        dots.forEach(function (d) { anim(d, [{ transform: 'scale(1)' }, { transform: 'scale(0)' }], { duration: 300 }); });
        // 2. the KareWellness emblem blooms where they meet
        anim(mark, [{ opacity: 0, transform: 'scale(.5) rotate(-12deg)' }, { opacity: 1, transform: 'scale(1.08) rotate(3deg)', offset: .7 }, { opacity: 1, transform: 'scale(1) rotate(0deg)' }], { duration: 760 });
        // 3. the wordmark rises letter by letter, then the promise
        letters.forEach(function (s, i) {
          setTimeout(function () { anim(s, [{ opacity: 0, transform: 'translateY(60%)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 520 }); }, 220 + i * 45);
        });
        await wait(220 + letters.length * 45 + 300);
        anim(tag, [{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 500 });
        // 4. hold a moment (and wait for the page, at most 1.5 s more), then lift away
        await Promise.all([wait(750), Promise.race([pageLoaded, wait(1500)])]);
        finish(false);
      } catch (e) { finish(true); }
    })();
  });
})();
