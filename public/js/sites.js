/* Where the three websites live. KareIQ is the parent; Kare@Home and KareNest are its brands.
   When the domains are ready, change only these three lines, e.g.
     kareiq:   'https://kareiq.co.in/',
     karehome: 'https://kareathome.in/',
     karenest: 'https://karenest.co.in/'
   Every link marked data-site="kareiq|karehome|karenest" on any page follows these values. */
window.KARE_SITES = {
  kareiq:   /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '/' : 'https://kareiq.co.in/',
  karehome: '/kare-at-home',
  karenest: 'https://karenest.co.in/'
};
(function () {
  var S = window.KARE_SITES;
  document.querySelectorAll('a[data-site]').forEach(function (a) {
    var base = S[a.dataset.site];
    if (!base) return;                       // keep the link as written in the HTML
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
