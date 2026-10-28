/* "Back to KareIQ" is shown only to visitors who came from the KareIQ website: a KareIQ link
   (?from=kareiq), a KareIQ page as the previous page, or earlier in this visit (this tab).
   Someone who types the address or comes from Google sees no back link. */
(function () {
  var root = document.documentElement, KEY = 'kq-from-kareiq', from = false;
  try {
    var q = new URLSearchParams(location.search);
    if (q.get('from') === 'kareiq') from = true;
    if (!from && document.referrer) {
      var r = new URL(document.referrer);
      var kiqHost = /^(www\.)?kareiq\.co\.in$|^kareiq(-website-full)?\.vercel\.app$|^(localhost|127\.0\.0\.1)$/.test(r.hostname);
      if (kiqHost && !/^\/(kare-at-home|karenest|app|admin)(\/|$)/.test(r.pathname)) from = true;
    }
    if (from) sessionStorage.setItem(KEY, '1'); else from = sessionStorage.getItem(KEY) === '1';
    if (q.has('from')) { q.delete('from'); history.replaceState(history.state, '', location.pathname + (q.toString() ? '?' + q : '') + location.hash); }
  } catch (e) { /* no storage: decide from this page only */ }
  if (from) root.classList.add('from-kareiq');
})();

/* Kare@Home intro animation. Loaded in <head> (not deferred) so it decides before the first
   paint. Like the KareIQ and KareNest intros it plays on a fresh visit or a reload, and is
   skipped when moving between Kare@Home pages, for links to a section and for reduced motion. */
(function () {
  var root = document.documentElement;
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var reload = nav && nav.type === 'reload';
    var internal = document.referrer && new URL(document.referrer).origin === location.origin && /\/kare-at-home/.test(new URL(document.referrer).pathname);
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && !location.hash && (!internal || reload)) root.classList.add('kh-intro');
  } catch (e) { /* no intro */ }

  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('khLoader');
    if (!el) return;
    if (!root.classList.contains('kh-intro') || !el.animate) { finish(true); return; }
    var q = function (s) { return el.querySelector(s); };
    var house = q('.kh-house'), heart = q('.kh-heart'), pulse = q('.kh-pulse'), glow = q('.kh-glow'), logo = q('.kh-logo'), msg = q('.kh-msg'), skip = q('.kh-skip');
    var done = false, ease = 'cubic-bezier(.22,.8,.24,1)';
    var anim = function (n, f, o) { return n.animate(f, Object.assign({ fill: 'forwards', easing: ease }, o)).finished; };
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var loaded = new Promise(function (r) { if (document.readyState === 'complete') r(); else addEventListener('load', r, { once: true }); });

    function finish(instant) {
      if (done) return;
      done = true;
      var clear = function () { root.classList.remove('kh-intro'); if (el.parentNode) el.parentNode.removeChild(el); };
      if (instant || !el.animate) { clear(); return; }
      root.classList.remove('kh-intro');
      // the screen closes into a circle around the emblem
      el.animate([{ clipPath: 'circle(150% at 50% 45%)' }, { clipPath: 'circle(0% at 50% 45%)' }], { duration: 750, easing: 'cubic-bezier(.7,0,.3,1)', fill: 'forwards' }).finished.then(clear, clear);
    }
    skip.addEventListener('click', function () { finish(false); });
    setTimeout(function () { skip.classList.add('show'); }, 900);
    setTimeout(function () { finish(false); }, 6500);

    (async function run() {
      try {
        anim(glow, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 900 });
        await anim(house, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 950, easing: 'cubic-bezier(.65,0,.35,1)' });
        anim(heart, [{ transform: 'scale(0)' }, { transform: 'scale(1.18)', offset: .65 }, { transform: 'scale(1)' }], { duration: 520 });
        await wait(260);
        // a pulse line runs underneath while the heart beats twice
        anim(pulse, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 900, easing: 'linear' });
        await wait(250);
        await anim(heart, [{ transform: 'scale(1)' }, { transform: 'scale(1.16)', offset: .25 }, { transform: 'scale(1)', offset: .5 }, { transform: 'scale(1.12)', offset: .7 }, { transform: 'scale(1)' }], { duration: 700, easing: 'ease-in-out' });
        anim(logo, [{ opacity: 0, transform: 'translateY(16px)' }, { opacity: 1, transform: 'none' }], { duration: 600 });
        await wait(250);
        anim(msg, [{ opacity: 0 }, { opacity: 1 }], { duration: 500 });
        await Promise.all([wait(800), Promise.race([loaded, wait(1500)])]);
        finish(false);
      } catch (e) { finish(true); }
    })();
  });
})();
