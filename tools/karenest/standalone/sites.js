/* Where the KareIQ family of websites live. This copy belongs to the KareNest website.
   Change kareiq to KareIQ's own domain when it goes live (e.g. 'https://kareiq.co.in/'). */
/* Where the KareIQ API server lives (Render): the Plan a Visit / Join forms send here.
   When api.karenest.co.in is set up in Render, change only this line. */
window.KARE_API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'https://kareiq-api.onrender.com';

window.KARE_SITES = {
  kareiq:   'https://kareiq.co.in/',
  karehome: 'https://karehome.co.in/',
  karenest: '/',
  karewellness: 'https://karewellness.co.in/'
};
(function () {
  var S = window.KARE_SITES;
  document.querySelectorAll('a[data-site]').forEach(function (a) {
    var base = S[a.dataset.site];
    if (!base) return;
    var path = a.dataset.path || '';
    a.href = /\/$/.test(base) ? base + path.replace(/^\//, '') : base + path;
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
