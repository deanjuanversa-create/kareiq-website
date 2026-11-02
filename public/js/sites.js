/* Where the websites live. KareIQ is the parent; Kare@Home, KareNest and KareWellness are its brands.
   When the domains are ready, change only these three lines, e.g.
     kareiq:   'https://kareiq.co.in/',
     karehome: 'https://karehome.co.in/',
     karenest: 'https://karenest.co.in/'
   Every link marked data-site="kareiq|karehome|karenest|karewellness" on any page follows these values. */
window.KARE_SITES = {
  kareiq:   /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/' : 'https://kareiq.co.in/',
  karehome: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/kare-at-home' : 'https://karehome.co.in/',
  karenest: 'https://karenest.co.in/',
  // KareWellness is its own website (tools/karewellness/build.js); /karewellness when run locally
  karewellness: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/karewellness/' : 'https://karewellness.co.in/'
};
(function () {
  var S = window.KARE_SITES;
  document.querySelectorAll('a[data-site]').forEach(function (a) {
    var base = S[a.dataset.site];
    if (!base) return;                       // keep the link as written in the HTML
    var path = a.dataset.path || '';
    var href = /\/$/.test(base) ? base + path.replace(/^\//, '') : base + path;
    // links from the KareIQ website to Kare@Home or KareNest say so (their "Back to KareIQ" link shows)
    if (document.body.hasAttribute('data-kareiq') && a.dataset.site !== 'kareiq') {
      var h = href.indexOf('#'), main = h < 0 ? href : href.slice(0, h), hash = h < 0 ? '' : href.slice(h);
      href = main + (main.indexOf('?') < 0 ? '?' : '&') + 'from=kareiq' + hash;
    }
    a.href = href;
    if (/^https?:/.test(base) && base.indexOf(location.host) === -1) { a.target = '_blank'; a.rel = 'noopener'; }
  });
})();

/* The family dashboard (sign-in, choosing a plan) is not part of this website package.
   Every "Sign in", package and "Book a Service" button sends visitors to this address, adding
   #/signin?brand=... or #/plans?brand=...&plan=...&months=... so the dashboard can continue.
   Change only this line to your dashboard's address, e.g. 'https://app.kareiq.co.in/'. */
window.KARE_APP = '/app/';
// Link to "create your account" for a booking reference, used by the booking success screens
window.KareAppStart = function (ref, brand) { return window.KARE_APP + '#/start?ref=' + encodeURIComponent(ref || '') + (brand ? '&brand=' + brand : ''); };
(function () {
  document.querySelectorAll('a[data-app]').forEach(function (a) {
    var b = a.dataset.app;
    a.href = window.KARE_APP + '#/signin' + (b && b !== 'kareiq' ? '?brand=' + b : '');
  });
  // links to a particular app screen, e.g. data-app-path="#/join?brand=karenest"
  document.querySelectorAll('a[data-app-path]').forEach(function (a) {
    a.href = window.KARE_APP + a.dataset.appPath;
  });
})();
