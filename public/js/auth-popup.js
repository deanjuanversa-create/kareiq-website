/* Sign in / create account popup for the KareIQ and Kare@Home websites.
   Any "Sign in" link (a[data-app] or [data-auth]) opens it instead of leaving the page.
   The popup talks to the KareIQ server, which answers with a one-time link; opening it signs the
   person in to My KareIQ and lands on "What would you like to set up?". Google and Facebook
   buttons are always shown; until their keys are added on the server they explain that and
   point to the email sign-in. Load after js/api.js and js/sites.js:
     <script src="/js/auth-popup.js" data-brand="karehome" defer></script> */
(function () {
  var me = document.currentScript;
  var BRAND = (me && me.dataset.brand) || 'kareiq';
  var NAMES = { kareiq: 'KareIQ', karehome: 'Kare@Home', karenest: 'KareNest' };
  var api = function () { return window.KARE_API || ''; };
  var NEXT = '#/plans';
  var PLAN_NAMES = { homestart: 'HomeStart', homeplus: 'HomePlus', homeelite: 'HomeElite', customized: 'a customised plan', 'kb-base': 'KareBalance Base', 'kb-plus': 'KareBalance Plus', 'kb-premium': 'KareBalance Premium' };
  var PROV = { google: 'Google', facebook: 'Facebook' };
  var ICON = {
    google: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1A10 10 0 0 0 2 12c0 1.6.4 3.2 1.1 4.6L6.4 14z"/><path fill="#EA4335" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.8-2.8A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z"/></svg>',
    facebook: '<svg viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12a12 12 0 1 0-13.9 11.9v-8.4H7.1V12h3V9.4c0-3 1.8-4.7 4.5-4.7 1.3 0 2.7.2 2.7.2v3h-1.5c-1.5 0-2 .9-2 1.9V12h3.4l-.5 3.5h-2.9v8.4A12 12 0 0 0 24 12z"/></svg>'
  };

  var d = document.createElement('dialog');
  d.className = 'ap';
  d.setAttribute('aria-labelledby', 'apTitle');
  d.innerHTML =
    '<button class="ap-x" type="button" data-ap-close aria-label="Close">×</button>' +
    '<p class="ap-eyebrow">Welcome</p><h2 id="apTitle">Sign in to ' + NAMES[BRAND] + '</h2>' +
    '<p class="ap-sub" id="apSub">One sign-in for Kare@Home and KareNest.</p>' +
    '<div class="ap-prov">' + Object.keys(PROV).map(function (k) { return '<a href="#" data-ap-prov="' + k + '">' + ICON[k] + 'Continue with ' + PROV[k] + '</a>'; }).join('') + '</div>' +
    '<p class="ap-note" role="status" aria-live="polite"></p>' +
    '<p class="ap-or">or use your mobile number or email</p>' +
    '<form class="ap-form" data-ap="signin" novalidate>' +
      '<label class="sr-only" for="apId">Mobile number or email</label><input id="apId" name="id" autocomplete="username" placeholder="Mobile number or email" required>' +
      '<div class="ap-pw"><label class="sr-only" for="apPw">Password</label><input id="apPw" name="password" type="password" autocomplete="current-password" placeholder="Password" required><button type="button" class="ap-peek" data-ap-peek aria-label="Show password">Show</button></div>' +
      '<p class="ap-err" role="alert"></p><button class="ap-go" type="submit">Sign in</button>' +
      '<p class="ap-alt"><a href="/app/#/forgot" data-app-path="#/forgot">Forgot password?</a></p>' +
    '</form>' +
    '<form class="ap-form" data-ap="signup" novalidate hidden>' +
      '<label class="sr-only" for="apName">Your name</label><input id="apName" name="name" autocomplete="name" placeholder="Your name" required>' +
      '<label class="sr-only" for="apPhone">Mobile number</label><input id="apPhone" name="phone" type="tel" inputmode="tel" autocomplete="tel" placeholder="Mobile number" required>' +
      '<label class="sr-only" for="apEmail">Email address (optional)</label><input id="apEmail" name="email" type="email" autocomplete="email" placeholder="Email address (optional)">' +
      '<div class="ap-pw"><label class="sr-only" for="apPw2">Choose a password</label><input id="apPw2" name="password" type="password" autocomplete="new-password" placeholder="Choose a password (8+ characters)" required><button type="button" class="ap-peek" data-ap-peek aria-label="Show password">Show</button></div>' +
      '<p class="ap-err" role="alert"></p><button class="ap-go" type="submit">Create account</button>' +
    '</form>' +
    '<p class="ap-switch"><span data-ap-swtext>New here?</span> <button type="button" data-ap-switch>Create an account</button></p>';
  document.body.appendChild(d);
  var fp = d.querySelector('[data-app-path]'); if (fp && window.KARE_APP) fp.href = window.KARE_APP + fp.dataset.appPath;

  var q = function (s) { return d.querySelector(s); };
  var fIn = q('[data-ap="signin"]'), fUp = q('[data-ap="signup"]'), note = q('.ap-note');
  var mode = 'signin', providers = null;
  var getProviders = function () {
    return providers || (providers = fetch(api() + '/api/app/auth/providers', { credentials: 'omit' })
      .then(function (r) { return r.json(); }).then(function (x) { return (x && x.providers) || {}; }).catch(function () { return {}; }));
  };
  function setMode(m) {
    mode = m;
    fIn.hidden = m !== 'signin'; fUp.hidden = m !== 'signup';
    q('#apTitle').textContent = m === 'signin' ? 'Sign in to ' + NAMES[BRAND] : 'Create your account';
    q('#apSub').textContent = m === 'signin' ? 'One sign-in for Kare@Home and KareNest.' : 'It takes a minute. Our team will call you to confirm the details.';
    q('[data-ap-swtext]').textContent = m === 'signin' ? 'New here?' : 'Already have an account?';
    q('[data-ap-switch]').textContent = m === 'signin' ? 'Create an account' : 'Sign in';
    [].forEach.call(d.querySelectorAll('.ap-err'), function (x) { x.textContent = ''; });
    note.textContent = '';
    setTimeout(function () { var f = (m === 'signin' ? fIn : fUp).querySelector('input'); if (f) f.focus(); }, 30);
  }
  function open(m) {
    setMode(m || 'signin');
    getProviders().then(function (on) {
      [].forEach.call(d.querySelectorAll('[data-ap-prov]'), function (a) {
        var k = a.dataset.apProv;
        a.href = on[k] ? api() + '/api/app/auth/' + k + '/start?brand=' + (BRAND === 'kareiq' ? '' : BRAND) + '&next=' + encodeURIComponent(NEXT) + '&back=' + encodeURIComponent(location.origin + location.pathname) : '#';
        a.dataset.on = on[k] ? '1' : '';
      });
    });
    if (!d.open) { if (d.showModal) d.showModal(); else d.setAttribute('open', ''); }
  }
  var close = function () { if (d.close) d.close(); else d.removeAttribute('open'); };
  q('[data-ap-close]').addEventListener('click', close);
  d.addEventListener('click', function (e) { if (e.target === d) close(); });
  q('[data-ap-switch]').addEventListener('click', function () { setMode(mode === 'signin' ? 'signup' : 'signin'); });
  [].forEach.call(d.querySelectorAll('[data-ap-peek]'), function (b) {
    b.addEventListener('click', function () { var i = b.previousElementSibling, s = i.type === 'password'; i.type = s ? 'text' : 'password'; b.textContent = s ? 'Hide' : 'Show'; b.setAttribute('aria-label', s ? 'Hide password' : 'Show password'); });
  });
  [].forEach.call(d.querySelectorAll('[data-ap-prov]'), function (a) {
    a.addEventListener('click', function (e) {
      if (a.dataset.on) { a.textContent = 'Opening ' + PROV[a.dataset.apProv] + '…'; return; }
      e.preventDefault();
      note.textContent = PROV[a.dataset.apProv] + ' sign-in is being set up. For now, please sign in with your mobile number or email below.';
      var f = (mode === 'signin' ? fIn : fUp).querySelector('input'); if (f) f.focus();
    });
  });

  // every "Sign in" link on the page opens the popup (the link still works without JavaScript)
  document.addEventListener('click', function (e) {
    var t = e.target.closest('a[data-app], [data-auth]');
    if (!t || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    var nav = document.getElementById('nav'); if (nav && nav.classList.contains('open')) nav.classList.remove('open');
    // a package button: after signing in, the app opens that package with the payment plan chosen on the page
    var plan = t.dataset.plan || '';
    if (plan) {
      var m = document.querySelector('.billing [aria-checked="true"]');
      var months = plan.indexOf('kb-') === 0 || plan === 'customized' ? '' : (m ? m.dataset.months : '');
      NEXT = '#/plans?brand=' + (BRAND === 'kareiq' ? 'karehome' : BRAND) + '&plan=' + encodeURIComponent(plan) + (months ? '&months=' + months : '');
    } else {
      NEXT = '#/plans';
    }
    open(t.dataset.auth === 'signup' ? 'signup' : 'signin');
    if (plan) q('#apSub').textContent = 'Sign in or create an account to choose ' + (PLAN_NAMES[plan] || 'this package') + '. One sign-in for Kare@Home and KareNest.';
  });

  function send(form, path, body) {
    var err = form.querySelector('.ap-err'), btn = form.querySelector('.ap-go'), label = btn.textContent;
    err.textContent = ''; btn.disabled = true; btn.textContent = 'Please wait…';
    body.handoff = true; body.next = NEXT;
    fetch(api() + '/api/app/' + path, { method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'kareiq' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (x) { return { r: r, x: x }; }); })
      .then(function (o) {
        if (o.r.ok && o.x.ok && o.x.go) { btn.textContent = 'Opening My KareIQ…'; location.href = o.x.go; return; }
        var er = o.x.errors || {};
        [].forEach.call(form.querySelectorAll('input'), function (i) { if (er[i.name]) i.setAttribute('aria-invalid', 'true'); else i.removeAttribute('aria-invalid'); });
        err.textContent = er.name || er.phone || er.email || er.password || o.x.message || 'Sorry, that did not work. Please try again.';
        btn.disabled = false; btn.textContent = label;
      })
      .catch(function () { err.textContent = 'We could not reach the sign-in service. Please check your internet and try again.'; btn.disabled = false; btn.textContent = label; });
  }
  fIn.addEventListener('submit', function (e) {
    e.preventDefault();
    var id = fIn.elements.id.value.trim(), pw = fIn.elements.password.value;
    if (!id || !pw) { fIn.querySelector('.ap-err').textContent = 'Please enter your mobile number or email, and your password.'; (id ? fIn.elements.password : fIn.elements.id).focus(); return; }
    send(fIn, 'login', { id: id, password: pw });
  });
  fUp.addEventListener('submit', function (e) {
    e.preventDefault();
    var v = function (n) { return fUp.elements[n].value.trim(); }, err = fUp.querySelector('.ap-err');
    var digits = v('phone').replace(/\D/g, '');
    if (v('name').length < 2) { err.textContent = 'Please enter your name.'; fUp.elements.name.focus(); return; }
    if (!(digits.length === 10 || (digits.length === 12 && digits.indexOf('91') === 0))) { err.textContent = 'Please enter a 10-digit mobile number.'; fUp.elements.phone.focus(); return; }
    if (fUp.elements.password.value.length < 8) { err.textContent = 'Please choose a password with at least 8 characters.'; fUp.elements.password.focus(); return; }
    send(fUp, 'signup', { name: v('name'), phone: v('phone'), email: v('email'), password: fUp.elements.password.value });
  });
  window.KareAuthOpen = open;
})();
