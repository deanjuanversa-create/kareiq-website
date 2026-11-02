/* Bystander booking form (KareIQ and Kare@Home websites). No sign-in: the request goes straight to
   the KareIQ server (POST /api/bookings, form "bystander"), which checks it again and answers with a
   reference like BY-7F3K2Q. Any [data-bystander="by-half|by-full|by-24|by-long"] opens the form. */
(function () {
  var d = document.getElementById('bystanderForm');
  if (!d) return;
  var form = document.getElementById('bfForm'), F = form.elements;
  var $ = function (s, el) { return (el || d).querySelector(s); };
  var $$ = function (s, el) { return Array.prototype.slice.call((el || d).querySelectorAll(s)); };
  var api = function () { return window.KARE_API || ''; };
  // names and prices come from the form itself (written from tools/shared/wellness.js)
  var info = function (id) { var r = form.querySelector('input[name="package"][value="' + id + '"]'); return r ? [r.dataset.name, r.dataset.label, Number(r.dataset.price) || 0] : null; };
  var rs = function (n) { return '₹' + Number(n).toLocaleString('en-IN'); };
  var today = function () { var t = new Date(); t.setMinutes(t.getMinutes() - t.getTimezoneOffset()); return t.toISOString().slice(0, 10); };
  var last = null;

  function show(view) { $$('[data-bf-view]').forEach(function (v) { v.hidden = v.dataset.bfView !== view; }); }
  function open(trigger) {
    last = trigger || document.activeElement;
    show('form'); clearAll();
    F.date.min = today();
    var pick = trigger && trigger.dataset.bystander;
    if (pick && info(pick)) form.querySelector('input[name="package"][value="' + pick + '"]').checked = true;
    total();
    if (typeof d.showModal === 'function') d.showModal(); else d.setAttribute('open', '');
    document.documentElement.style.overflow = 'hidden';
    setTimeout(function () { (form.querySelector('input[name="package"]:checked') ? F.date : form.querySelector('input[name="package"]')).focus({ preventScroll: true }); }, 60);
  }
  function close() {
    if (typeof d.close === 'function') d.close(); else d.removeAttribute('open');
    document.documentElement.style.overflow = '';
    if (last && last.focus) last.focus({ preventScroll: true });
  }
  d.addEventListener('close', function () { document.documentElement.style.overflow = ''; });
  $$('[data-bf-close]').forEach(function (b) { b.addEventListener('click', close); });
  d.addEventListener('click', function (e) { if (e.target === d) close(); });
  document.addEventListener('click', function (e) {
    var t = e.target.closest && e.target.closest('[data-bystander]');
    if (!t) return;
    e.preventDefault();
    var nav = document.getElementById('nav'); if (nav) nav.classList.remove('open');
    open(t);
  });

  function total() {
    var c = form.querySelector('input[name="package"]:checked'), out = $('[data-bf-total]');
    if (!c) { out.textContent = 'Choose an option to see the price.'; return; }
    var p = info(c.value);
    out.innerHTML = p[2] ? '<b>' + p[0] + ' · ' + p[1] + '</b> ' + rs(p[2]) : '<b>Long-term support</b> Price discussed with you';
  }
  form.addEventListener('change', function (e) { if (e.target.name === 'package') { total(); setErr('package', ''); } });

  /* ---------- validation (the server checks the same things) ---------- */
  function setErr(name, msg) {
    var el = document.getElementById('bf-' + name + '-err');
    if (el) el.textContent = msg || '';
    var input = F[name];
    if (input && input.nodeName && input.nodeName !== 'RADIO') {
      var f = input.closest ? input.closest('.bf-field') : null;
      if (f) f.classList.toggle('bad', !!msg);
      if (input.setAttribute) { if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid'); }
    }
    if (name === 'package') $('.bf-opts').classList.toggle('bad', !!msg);
  }
  function clearAll() { $$('.bf-err').forEach(function (e) { e.textContent = ''; }); $$('.bad').forEach(function (e) { e.classList.remove('bad'); }); $$('[aria-invalid]').forEach(function (e) { e.removeAttribute('aria-invalid'); }); var a = $('.bf-alert'); a.hidden = true; a.textContent = ''; }
  form.addEventListener('input', function (e) { if (e.target.name) setErr(e.target.name, ''); });
  var phoneOk = function (v) { var x = String(v || '').replace(/\D/g, ''); if (x.length === 12 && x.indexOf('91') === 0) x = x.slice(2); else if (x.length === 11 && x[0] === '0') x = x.slice(1); return /^[6-9]\d{9}$/.test(x); };
  function check() {
    var v = function (n) { return String(F[n].value || '').trim(); }, e = {};
    if (!form.querySelector('input[name="package"]:checked')) e.package = 'Choose Half Day, Full Day, Round the Clock or long-term.';
    if (!v('date')) e.date = 'Choose the date you need the Bystander.'; else if (v('date') < today()) e.date = 'Choose today or a later date.';
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v('startTime'))) e.startTime = 'Choose a start time.';
    if (v('name').length < 2) e.name = 'Please enter your name.';
    if (!phoneOk(v('phone'))) e.phone = 'Enter a 10-digit mobile number, e.g. 98765 43210.';
    if (v('altPhone') && !phoneOk(v('altPhone'))) e.altPhone = 'Enter a 10-digit mobile number, or leave this empty.';
    if (v('email') && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v('email'))) e.email = 'This email address looks incomplete.';
    if (!v('careFor')) e.careFor = 'Tell us who the Bystander is for.';
    if (v('patientName').length < 2) e.patientName = "Please enter the patient's name.";
    var age = parseInt(v('patientAge'), 10); if (!(age >= 1 && age <= 120)) e.patientAge = "Please enter the patient's age.";
    if (!v('mobility')) e.mobility = 'Tell us how the patient moves around.';
    if (!v('location')) e.location = 'Tell us where the service is needed.';
    if (v('address').length < 8) e.address = 'Please enter the full address, including house or room number.';
    if (v('area').length < 2) e.area = 'Enter the area or city.';
    if (!/^\d{6}$/.test(v('pincode'))) e.pincode = 'Enter the 6-digit PIN code.';
    if (!F.consent.checked) e.consent = 'Please tick this so we can call you to confirm.';
    return e;
  }
  function showErrors(errs, message) {
    Object.keys(errs).forEach(function (k) { setErr(k, errs[k]); });
    var a = $('.bf-alert'); a.textContent = message || 'Please check the highlighted fields.'; a.hidden = false;
    var first = d.querySelector('.bf-opts.bad input, .bf-field.bad input, .bf-field.bad select, .bf-field.bad textarea') || (errs.consent ? F.consent : null);
    if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'center', behavior: 'smooth' }); }
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearAll();
    var errs = check();
    if (Object.keys(errs).length) return showErrors(errs);
    var body = {}; new FormData(form).forEach(function (val, k) { body[k] = typeof val === 'string' ? val.trim() : val; });
    body.consent = true; body.form = 'bystander'; body.service = 'bystander'; body.page = d.dataset.page;
    var btn = form.querySelector('.bf-go'), label = btn.innerHTML;
    btn.disabled = true; btn.textContent = 'Sending…';
    fetch(api() + '/api/bookings', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'kareiq' }, body: JSON.stringify(body) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (x) { return { ok: r.ok, x: x }; }); })
      .then(function (o) {
        if (!o.ok || !o.x.ok) return showErrors(o.x.errors || {}, o.x.message || 'Sorry, that did not work. Please try again.');
        var p = info(body.package);
        $('[data-bf-name]').textContent = body.name.split(' ')[0];
        $('[data-bf-phone]').textContent = body.phone;
        $('[data-bf-ref]').textContent = o.x.reference;
        var when = new Date(body.date + 'T' + body.startTime);
        var rows = [['Support', p[0] + ' (' + p[1] + ')' + (p[2] ? ' · ' + rs(p[2]) : '')], ['Starts', when.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) + ', ' + when.toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })], ['Patient', body.patientName + ', ' + body.patientAge], ['Where', body.area + ' ' + body.pincode]];
        $('[data-bf-summary]').innerHTML = rows.map(function (r) { var dt = document.createElement('dt'), dd = document.createElement('dd'); dt.textContent = r[0]; dd.textContent = r[1]; return dt.outerHTML + dd.outerHTML; }).join('');
        form.reset(); total();
        show('done'); $('[data-bf-view="done"]').focus();
      })
      .catch(function () { showErrors({}, 'We could not reach our team just now. Please check your internet and try again, or call +91 81293 45178.'); })
      .then(function () { btn.disabled = false; btn.innerHTML = label; });
  });
  window.KareBystanderOpen = open;
})();
