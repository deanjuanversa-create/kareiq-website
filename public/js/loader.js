/* KareIQ intro animation.
   Loaded in <head> (not deferred) so it can decide before the first paint
   whether to show the intro. It shows on a fresh visit or a reload, and is
   skipped when moving between pages of the site, for deep links (#section),
   and for visitors who prefer reduced motion. */
(function () {
  var root = document.documentElement;
  try {
    var nav = performance.getEntriesByType && performance.getEntriesByType('navigation')[0];
    var reload = nav && nav.type === 'reload';
    var internal = document.referrer && new URL(document.referrer).origin === location.origin;
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!reduce && !location.hash && (!internal || reload)) root.classList.add('kq-intro');
  } catch (e) { /* no intro */ }

  document.addEventListener('DOMContentLoaded', function () {
    var el = document.getElementById('kqLoader');
    if (!el) return;
    if (!root.classList.contains('kq-intro') || !el.animate) { finish(true); return; }

    var group = el.querySelector('.kq-group');
    var mark = el.querySelector('.kq-mark');
    var glow = el.querySelector('.kq-glow');
    var sweep = el.querySelector('.kq-sweep');
    var lines = [].slice.call(el.querySelectorAll('.ln'));
    var L = function (n) { return el.querySelector('.kq-l[data-l="' + n + '"]'); };
    var letters = ['k', 'a', 'r', 'e', 'Q'].map(L);   // these slide in
    var iStem = L('istem'), iDot = L('idot');         // the i arrives on its own
    var all = [L('k'), L('a'), L('r'), L('e'), iStem, iDot, L('Q')];
    var glint = el.querySelector('.kq-glint');
    var bar = el.querySelector('.kq-bar i');
    var skip = el.querySelector('.kq-skip');
    var done = false;
    var ease = 'cubic-bezier(.22,.8,.24,1)';
    var easeIn = 'cubic-bezier(.55,0,.75,.2)';

    var pageLoaded = new Promise(function (r) { if (document.readyState === 'complete') r(); else addEventListener('load', r, { once: true }); });
    var wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var anim = function (node, frames, opts) { return node.animate(frames, Object.assign({ fill: 'forwards', easing: ease }, opts)).finished; };
    var progress = function (v) { bar.style.transform = 'scaleX(' + v + ')'; };

    function finish(instant) {
      if (done) return;
      done = true;
      var clear = function () { root.classList.remove('kq-intro'); if (el.parentNode) el.parentNode.removeChild(el); };
      if (instant || !el.animate) { clear(); return; }
      el.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 380, fill: 'forwards' }).finished.then(clear, clear);
      root.classList.remove('kq-intro'); // let the hero start while the veil fades
    }

    skip.addEventListener('click', function () { finish(false); });
    setTimeout(function () { skip.classList.add('show'); }, 1200);
    setTimeout(function () { finish(false); }, 9000); // never trap the visitor

    (async function run() {
      try {
        // 1. the mark draws itself in
        progress(.15);
        anim(glow, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 900 });
        anim(mark, [{ opacity: 0, transform: 'scale(.86)' }, { opacity: 1, transform: 'scale(1)' }], { duration: 700 });
        await Promise.all(lines.map(function (ln, i) {
          return anim(ln, [{ strokeDashoffset: 1 }, { strokeDashoffset: 0 }], { duration: 820, delay: i * 110, easing: 'cubic-bezier(.65,0,.35,1)' });
        }));
        if (done) return;

        // 2. the logo shines: a light sweeps across the mark, a glint flashes on its corner
        progress(.35);
        await Promise.all([
          anim(sweep, [{ transform: 'translateX(-140px)' }, { transform: 'translateX(330px)' }], { duration: 850, easing: 'cubic-bezier(.5,0,.3,1)', fill: 'none' }),
          anim(mark, [{ filter: 'brightness(1) drop-shadow(0 0 0 rgba(124,92,196,0))' }, { filter: 'brightness(1.18) drop-shadow(0 0 18px rgba(124,92,196,.45))', offset: .45 }, { filter: 'brightness(1) drop-shadow(0 0 0 rgba(124,92,196,0))' }], { duration: 850, fill: 'none' }),
          anim(glint, [{ opacity: 0, transform: 'scale(0) rotate(0deg)' }, { opacity: 1, transform: 'scale(1.25) rotate(90deg)', offset: .55 }, { opacity: 0, transform: 'scale(0) rotate(180deg)' }], { duration: 850, delay: 150, fill: 'none' }),
          anim(glow, [{ opacity: 1, transform: 'scale(1)' }, { opacity: 1, transform: 'scale(1.18)', offset: .5 }, { opacity: .85, transform: 'scale(1)' }], { duration: 850 })
        ]);
        if (done) return;

        // 3. it steps back
        progress(.5);
        await anim(mark, [{ transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' }, { transform: 'scale(.76)', opacity: .5, filter: 'blur(1.5px)' }], { duration: 420, easing: 'cubic-bezier(.45,0,.55,1)' });
        if (done) return;

        // 4. it comes back and the wordmark slides in letter by letter
        var Q = L('Q');
        var shift = (Q.offsetLeft + Q.offsetWidth - mark.offsetWidth) / 2;
        var u = mark.offsetWidth / 100; // scale for distances
        progress(.7);
        anim(mark, [{ transform: 'scale(.76)', opacity: .5, filter: 'blur(1.5px)' }, { transform: 'scale(1.06)', opacity: 1, filter: 'blur(0px)', offset: .65 }, { transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' }], { duration: 620 });
        anim(group, [{ transform: 'translateX(0)' }, { transform: 'translateX(' + (-shift) + 'px)' }], { duration: 760, delay: 120 });
        await Promise.all(letters.map(function (l, i) {
          return anim(l, [{ opacity: 0, transform: 'translateX(' + 40 * u + 'px)', filter: 'blur(6px)' }, { opacity: 1, transform: 'translateX(0)', filter: 'blur(0px)' }], { duration: 560, delay: 200 + i * 90 });
        }));
        if (done) return;
        // ...and the i arrives from elsewhere and takes its place: the stem swings up from below, the dot drops in and bounces
        await Promise.all([
          anim(iStem, [
            { opacity: 0, transform: 'translate(' + 30 * u + 'px,' + 120 * u + 'px) rotate(-70deg)' },
            { opacity: 1, transform: 'translate(' + (-4 * u) + 'px,' + (-8 * u) + 'px) rotate(8deg)', offset: .7 },
            { opacity: 1, transform: 'translate(0,0) rotate(0deg)' }
          ], { duration: 700, easing: 'cubic-bezier(.3,.7,.3,1)' }),
          anim(iDot, [
            { opacity: 0, transform: 'translate(' + (-60 * u) + 'px,' + (-140 * u) + 'px) scale(.6)' },
            { opacity: 1, transform: 'translate(0,' + 4 * u + 'px) scale(1.15,.85)', offset: .62 },
            { opacity: 1, transform: 'translate(0,' + (-7 * u) + 'px) scale(.95,1.05)', offset: .8 },
            { opacity: 1, transform: 'translate(0,0) scale(1)' }
          ], { duration: 820, delay: 260, easing: 'cubic-bezier(.45,0,.4,1)' })
        ]);
        if (done) return;

        // hold until the page has finished loading
        await Promise.all([pageLoaded, wait(350)]);
        progress(1);
        await wait(320);
        if (done) return;

        // 5. the letters slide back into the mark
        var markCenter = mark.offsetWidth / 2;
        var rev = all.slice().reverse();
        anim(group, [{ transform: 'translateX(' + (-shift) + 'px)' }, { transform: 'translateX(0)' }], { duration: 780, delay: 140, easing: 'cubic-bezier(.65,0,.35,1)' });
        await Promise.all(rev.map(function (l, i) {
          var dx = markCenter - (l.offsetLeft + l.offsetWidth / 2);
          var dy = markCenter - (l.offsetTop + l.offsetHeight / 2);
          return anim(l, [{ opacity: 1, transform: 'translate(0,0) scale(1)', filter: 'blur(0px)' }, { opacity: 0, transform: 'translate(' + dx + 'px,' + dy + 'px) scale(.2)', filter: 'blur(2px)' }], { duration: 520, delay: i * 60, easing: easeIn });
        }));
        if (done) return;
        // the mark takes them in: a pulse and one more shine
        anim(sweep, [{ transform: 'translateX(-140px)' }, { transform: 'translateX(330px)' }], { duration: 600, fill: 'none' });
        anim(glint, [{ opacity: 0, transform: 'scale(0) rotate(0deg)' }, { opacity: 1, transform: 'scale(1) rotate(90deg)', offset: .5 }, { opacity: 0, transform: 'scale(0) rotate(180deg)' }], { duration: 600, fill: 'none' });
        await anim(mark, [{ transform: 'scale(1)' }, { transform: 'scale(1.1)', offset: .45 }, { transform: 'scale(1)' }], { duration: 480 });
        if (done) return;

        // 6. the mark steps back and the site opens
        anim(glow, [{ opacity: .85 }, { opacity: 0 }], { duration: 500 });
        anim(el.querySelector('.kq-bar'), [{ opacity: 1 }, { opacity: 0 }], { duration: 300 });
        await anim(mark, [{ transform: 'scale(1)', opacity: 1, filter: 'blur(0px)' }, { transform: 'scale(.55)', opacity: 0, filter: 'blur(4px)' }], { duration: 520, easing: easeIn });
        finish(false);
      } catch (e) {
        finish(true);
      }
    })();
  });
})();
