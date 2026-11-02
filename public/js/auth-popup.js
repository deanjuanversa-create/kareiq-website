/* Sign in: hands visitors over to the family dashboard (website-only package).
   Every "Sign in" link (a[data-app]) and every package button ([data-auth], e.g. "Choose HomeStart")
   opens the dashboard at window.KARE_APP (set in js/sites.js):
     Sign in                 ->  KARE_APP + '#/signin?brand=karehome'
     a package (data-plan)   ->  KARE_APP + '#/plans?brand=karehome&plan=homeplus&months=12'
   Your dashboard can read brand, plan and months from the address to continue to the right package.
   Load after js/sites.js:  <script src="/js/auth-popup.js" data-brand="karehome" defer></script> */
(function () {
  var me = document.currentScript;
  var BRAND = (me && me.dataset.brand) || 'kareiq';
  var app = function () { return window.KARE_APP || '/app/'; };
  function target(t) {
    var plan = t && t.dataset ? t.dataset.plan || '' : '';
    if (!plan) return app() + '#/signin' + (BRAND === 'kareiq' ? '' : '?brand=' + BRAND);
    // the payment plan chosen on the page (Kare@Home packages switch); KareBalance and customised plans have none
    var m = document.querySelector('.billing [aria-checked="true"]');
    var months = plan.indexOf('kb-') === 0 || plan === 'customized' ? '' : (t.dataset.months || (m ? m.dataset.months : ''));
    return app() + '#/plans?brand=' + (BRAND === 'kareiq' ? 'karehome' : BRAND) + '&plan=' + encodeURIComponent(plan) + (months ? '&months=' + months : '');
  }
  document.addEventListener('click', function (e) {
    var t = e.target.closest('a[data-app], [data-auth]');
    if (!t || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    location.href = target(t);
  });
  // links that are plain <a data-app> also get the right address (for "open in new tab")
  document.querySelectorAll('a[data-app]').forEach(function (a) { a.href = target(a); });
  window.KareAuthOpen = function () { location.href = target(null); };
})();
