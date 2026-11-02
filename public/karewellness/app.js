/* KareWellness website: header, phone menu, scroll animations, enquiry form.
   "Book a Service" links (a[data-app-path]) are pointed at the KareIQ app by js/sites.js: the app
   asks the visitor to sign in (or create an account) and then opens the booking for that package. */
(function () {
  var $ = function (s, el) { return (el || document).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || document).querySelectorAll(s)); };
  var reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  var nav = $('#nav'), burger = $('#burger'), bar = $('#progress'), totop = $('#totop');

  /* links from the time KareWellness was one page (…/karewellness#karebalance) open the right page */
  var LEGACY = { karebalance: 'karebalance', 'karebalance-plans': 'karebalance#karebalance-plans', karemind: 'karemind', 'karemind-plans': 'karemind#karemind-plans' };
  var h = location.hash.slice(1);
  if (document.body.dataset.page === 'home' && (LEGACY[h] || /^(kb|km)-/.test(h))) {
    var to = LEGACY[h] || (h.indexOf('kb-') === 0 ? 'karebalance#' + h : 'karemind#' + h);
    location.replace(document.body.dataset.base + to);
    return;
  }

  var year = $('#year'); if (year) year.textContent = new Date().getFullYear();

  /* reveal: only content that starts below the fold waits for the scroll */
  if (!reduce && 'IntersectionObserver' in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.replace('pre', 'in'); io.unobserve(e.target); } });
    }, { rootMargin: '0px 0px 8% 0px' });
    $$('.rv').forEach(function (el) { if (el.getBoundingClientRect().top > innerHeight * 0.92) { el.classList.add('pre'); io.observe(el); } });
  }

  /* header shadow, progress bar, back to top */
  var ticking = false;
  function onScroll() {
    var y = scrollY, max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    nav.classList.toggle('scrolled', y > 20);
    if (bar) bar.style.transform = 'scaleX(' + Math.min(1, y / max).toFixed(4) + ')';
    if (totop) totop.classList.toggle('show', y > 700);
    ticking = false;
  }
  addEventListener('scroll', function () { if (!ticking) { requestAnimationFrame(onScroll); ticking = true; } }, { passive: true });
  onScroll();
  if (totop) totop.addEventListener('click', function () { scrollTo({ top: 0, behavior: reduce ? 'auto' : 'smooth' }); });

  /* phone and tablet menu */
  function setMenu(o) { nav.classList.toggle('open', o); burger.setAttribute('aria-expanded', String(o)); burger.setAttribute('aria-label', o ? 'Close menu' : 'Open menu'); }
  burger.addEventListener('click', function () { setMenu(!nav.classList.contains('open')); });
  $$('.drawer a').forEach(function (a) { a.addEventListener('click', function () { setMenu(false); }); });
  addEventListener('keydown', function (e) { if (e.key === 'Escape' && nav.classList.contains('open')) { setMenu(false); burger.focus(); } });

  /* "Ask a question" buttons choose the programme in the enquiry form */
  $$('[data-ask]').forEach(function (b) {
    b.addEventListener('click', function () {
      var f = $('#enquiry'); if (!f) return;
      var sel = f.elements.interest; if (sel && b.dataset.ask) sel.value = b.dataset.ask;
    });
  });

  /* enquiry form: sent to the KareIQ server (same endpoint as the other KareIQ websites) */
  var form = $('#enquiry');
  if (form) {
    var F = form.elements, done = $('#enquiryDone'), alertBox = $('.form-alert', form), btn = $('button[type="submit"]', form);
    var api = function () { return window.KARE_API || ''; };
    var phoneOk = function (v) { var d = String(v || '').replace(/\D/g, ''); if (d.length === 12 && d.indexOf('91') === 0) d = d.slice(2); else if (d.length === 11 && d[0] === '0') d = d.slice(1); return /^[6-9]\d{9}$/.test(d); };
    var setErr = function (name, msg) { var i = F[name]; if (!i) return; var f = i.closest('.field') || i.closest('.check'); if (f) f.classList.toggle('has-err', !!msg); var e = f && $('.err', f); if (e) e.textContent = msg || ''; };
    form.addEventListener('input', function (e) { if (e.target.name) setErr(e.target.name, ''); });
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      ['name', 'phone', 'email', 'consent'].forEach(function (n) { setErr(n, ''); });
      alertBox.hidden = true;
      var bad = false;
      if (F.name.value.trim().length < 2) { setErr('name', 'Please enter your name.'); bad = true; }
      if (!phoneOk(F.phone.value)) { setErr('phone', 'Enter a 10-digit mobile number, e.g. 98765 43210.'); bad = true; }
      if (F.email.value.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(F.email.value.trim())) { setErr('email', 'This email address looks incomplete.'); bad = true; }
      if (!F.consent.checked) { setErr('consent', 'Please tick this so we can call you back.'); bad = true; }
      if (bad) { var first = $('.has-err input, .has-err select', form); if (first) first.focus(); return; }
      var body = { name: F.name.value.trim(), phone: F.phone.value.trim(), email: F.email.value.trim(), interest: F.interest.value, message: F.message.value.trim(), consent: true, source: 'karewellness', website: F.website.value };
      var label = btn.innerHTML; btn.disabled = true; btn.textContent = 'Sending…';
      fetch(api() + '/api/enquiries', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'kareiq' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (x) { return { ok: r.ok, x: x }; }); })
        .then(function (o) {
          if (!o.ok || !o.x.ok) { var er = o.x.errors || {}; Object.keys(er).forEach(function (k) { setErr(k, er[k]); }); alertBox.textContent = o.x.message || 'Sorry, that did not work. Please try again.'; alertBox.hidden = false; return; }
          $('#doneName', done).textContent = body.name.split(' ')[0];
          $('#doneRef', done).textContent = o.x.reference;
          form.hidden = true; done.hidden = false; done.focus();
          form.reset();
        })
        .catch(function () { alertBox.textContent = 'We could not reach our team just now. Please check your internet and try again, or call +91 81293 45178.'; alertBox.hidden = false; })
        .then(function () { btn.disabled = false; btn.innerHTML = label; });
    });
    var again = $('#enquiryAgain');
    if (again) again.addEventListener('click', function () { done.hidden = true; form.hidden = false; F.name.focus(); });
  }
})();
