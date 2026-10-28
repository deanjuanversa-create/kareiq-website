/* Where the KareIQ family of websites live. This copy belongs to the KareNest website.
   Change kareiq to KareIQ's own domain when it goes live (e.g. 'https://kareiq.co.in/'). */
/* Where the KareIQ API server lives (Render): the Plan a Visit / Join forms send here.
   When api.karenest.co.in is set up in Render, change only this line. */
window.KARE_API = /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'https://kareiq-api.onrender.com';

window.KARE_SITES = {
  kareiq:   'https://kareiq.co.in/',
  karehome: 'https://karehome.co.in/',
  karenest: '/'
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

/* My KareIQ: the app where families, caregivers and the office team sign in (one sign-in for
   Kare@Home and KareNest). It runs on the API server. If you give it its own address later
   (e.g. https://app.karenest.co.in), change only this line. */
window.KARE_APP = (/^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'https://kareiq-api.onrender.com') + '/app/';
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
