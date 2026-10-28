/* My KareIQ — one app for Kare@Home and KareNest families, caregivers and the office team.
   No framework: each screen is a function that returns HTML; actions use data-act attributes. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- settings
  var SITES = {
    kareiq: 'https://kareiq.co.in/',
    karehome: 'https://kareiq-website-full.vercel.app/kare-at-home',
    karenest: 'https://karenest.co.in/'
  };
  var WHATSAPP = '918129345178';
  var PHONE = '+91 81293 45178';
  var BRANDS = {
    karehome: { id: 'karehome', name: 'Kare@Home', tag: 'Care at home', logo: '/img/karehome-logo.png', mark: '/img/karehome-emblem.png', photo: '/img/home.jpg', theme: '#16305a',
      words: { visits: 'Recent home visits', visitsEmpty: 'Visit notes from your caregiver will appear here.', extra: 'Book an extra visit', extraKind: 'visit', team: 'Your care team' } },
    karenest: { id: 'karenest', name: 'KareNest', tag: 'Community living', logo: null, mark: '/karenest/images/mark.webp', photo: '/img/nest.jpg', theme: '#0e4a44',
      words: { visits: 'Updates from the care team', visitsEmpty: 'Daily updates from the KareNest care team will appear here.', extra: 'Plan a visit to see them', extraKind: 'family-visit', team: 'KareNest care team' } }
  };
  var METRICS = {
    bp: { label: 'Blood pressure', unit: 'mmHg' }, hr: { label: 'Heart rate', unit: 'bpm' }, glucose: { label: 'Blood sugar', unit: 'mg/dL' },
    spo2: { label: 'Oxygen level', unit: '%' }, pi: { label: 'Perfusion index', unit: '' }, temp: { label: 'Temperature', unit: '°C' },
    weight: { label: 'Weight', unit: 'kg' }, height: { label: 'Height', unit: 'cm' }, bmi: { label: 'BMI', unit: 'kg/m²' }, chol: { label: 'Total cholesterol', unit: 'mg/dL' },
    bodyfat: { label: 'Body fat', unit: '%' }, moisture: { label: 'Body moisture', unit: '%' }, visceral: { label: 'Visceral fat', unit: '' }, bone: { label: 'Bone mass', unit: '%' },
    bmr: { label: 'BMR', unit: 'kcal' }, protein: { label: 'Protein', unit: '%' }, subfat: { label: 'Subcutaneous fat', unit: '%' }, lean: { label: 'Lean body mass', unit: '%' }
  };
  var PERIODS = [['7d', 'Last 7 days', 7], ['1m', 'Month', 30], ['6m', '6 months', 182], ['1y', '1 year', 365]];
  var GLUCOSE = { fasting: 'Fasting', post_meal: 'After meal', random: 'Random' };
  var ACTIONS = {
    'signin': 'Signed in', 'password.set': 'Set their password', 'password.reset': 'Reset their password', 'password.changed': 'Changed their password',
    'password.help': 'Asked for sign-in help', 'account.created-from-booking': 'Created an account from a booking', 'account.signup': 'Created an account', 'plan.requested': 'Asked for a new plan', 'booking.added': 'Added a website booking to their account', 'visit.save': 'Saved a visit',
    'reading.remove': 'Removed a reading', 'request.sent': 'Sent a request', 'plan.activate': 'Activated a plan', 'plan.add': 'Added a plan', 'plan.edit': 'Changed a plan',
    'person.add': 'Added a person', 'person.edit': 'Edited a person', 'user.add': 'Added a login', 'user.edit': 'Edited a login', 'user.link': 'Made a sign-in link',
    'caregiver.assign': 'Assigned a caregiver', 'caregiver.unassign': 'Removed a caregiver', 'family.link': 'Gave family access', 'family.unlink': 'Removed family access', 'demo.seed': 'Created demo data', 'risk.save': 'Saved a risk score', 'record.add': 'Added a medical record', 'record.remove': 'Removed a medical record', 'service.booked': 'Booked a service', 'report.download': 'Downloaded a health report'
  };


  // ---------------------------------------------------------------- tiny helpers
  var root = document.getElementById('root');
  var S = { me: null, csrf: '', catalog: null, filter: 'all', inbox: 'open', flash: null, cache: {} };
  try { S.filter = localStorage.getItem('kq.filter') || 'all'; } catch (e) {}

  function e(v) { return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }
  function initials(name) { return String(name || '?').replace(/\(.*?\)/g, '').trim().split(/\s+/).slice(0, 2).map(function (w) { return w[0]; }).join('').toUpperCase(); }
  function first(name) { return String(name || '').replace(/\(.*?\)/g, '').trim().split(/\s+/)[0]; }
  var fmtD = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
  var fmtDT = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
  var fmtS = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
  function date(iso) { return iso ? fmtD.format(new Date(iso.length === 10 ? iso + 'T12:00:00+05:30' : iso)) : ''; }
  function dt(iso) { return iso ? fmtDT.format(new Date(iso)).replace(' am', ' am').replace(' pm', ' pm') : ''; }
  function ago(iso) {
    var s = (Date.now() - new Date(iso).getTime()) / 1000;
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + ' min ago';
    if (s < 86400) return Math.floor(s / 3600) + ' h ago';
    if (s < 86400 * 7) { var d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : d + ' days ago'; }
    return date(iso);
  }
  function todayIST() { return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date()); }
  function nowHM() { return new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date()); }
  function phoneNice(p) { return p ? p.replace(/^\+91(\d{5})(\d{5})$/, '+91 $1 $2') : ''; }
  function waLink(text) { return 'https://wa.me/' + WHATSAPP + '?text=' + encodeURIComponent(text); }
  function icon(name) {
    var p = {
      grid: '<rect x="3.5" y="3.5" width="7" height="7" rx="2"/><rect x="13.5" y="3.5" width="7" height="7" rx="2"/><rect x="3.5" y="13.5" width="7" height="7" rx="2"/><rect x="13.5" y="13.5" width="7" height="7" rx="2"/>',
      heart: '<path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.3a4.3 4.3 0 0 1 7.5 2.5C19.5 15.4 12 20 12 20Z"/>',
      inbox: '<path d="M4 13.5 6.2 5.6A2 2 0 0 1 8.1 4h7.8a2 2 0 0 1 1.9 1.6L20 13.5V18a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2v-4.5Z"/><path d="M4 13.5h4.5l1.2 2.2h4.6l1.2-2.2H20"/>',
      people: '<circle cx="9" cy="8" r="3.4"/><path d="M2.8 19.5c.6-3.4 3.1-5.3 6.2-5.3s5.6 1.9 6.2 5.3"/><circle cx="17.2" cy="9" r="2.5"/><path d="M16.8 14.3c2.4.1 4 1.6 4.4 4"/>',
      key: '<circle cx="8" cy="15" r="4"/><path d="m11 12 8.5-8.5M16 7l2.5 2.5M14 9l2 2"/>',
      clock: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>',
      globe: '<circle cx="12" cy="12" r="8.5"/><path d="M3.5 12h17M12 3.5c2.4 2.6 3.6 5.4 3.6 8.5s-1.2 5.9-3.6 8.5c-2.4-2.6-3.6-5.4-3.6-8.5S9.6 6.1 12 3.5Z"/>',
      out: '<path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4"/><path d="M10 16.5 5.5 12 10 7.5M5.5 12H16"/>',
      home: '<path d="m3.5 11 8.5-7 8.5 7"/><path d="M5.5 9.5V20h13V9.5"/><path d="M10 20v-5h4v5"/>',
      chat: '<path d="M4 18.5V6.5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H8.5L4 18.5Z"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      pen: '<path d="m14.5 5.5 4 4L8 20H4v-4L14.5 5.5Z"/>',
      phone: '<path d="M5 4h3.5l1.6 4.2-2.2 1.4a11 11 0 0 0 6.5 6.5l1.4-2.2L20 15.5V19a1.5 1.5 0 0 1-1.6 1.5C10.6 20 4 13.4 3.5 5.6A1.5 1.5 0 0 1 5 4Z"/>',
      wa: '<path d="M4.5 19.5 5.6 16A8 8 0 1 1 8.4 18.6l-3.9.9Z"/><path d="M9.2 8.6c.2 2.8 3.4 6 6.2 6.2l1-1.4-1.9-1-.9.8c-1-.4-2.4-1.8-2.8-2.8l.8-.9-1-1.9-1.4 1Z"/>',
      check: '<path d="m5 12.5 4.5 4.5L19 7.5"/>',
      shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>',
      menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
      down: '<path d="m7 10 5 5 5-5"/>',
      file: '<path d="M7 3.5h6.5L18 8v12.5H7z"/><path d="M13 3.5V8h5M9.5 12.5h6M9.5 16h6"/>',
      box: '<path d="m12 3.5 8 4v9l-8 4-8-4v-9z"/><path d="m4 7.5 8 4 8-4M12 11.5v9"/>',
      cal: '<rect x="4" y="5.5" width="16" height="15" rx="2"/><path d="M4 10h16M8.5 3.5v4M15.5 3.5v4"/>',
      receipt: '<path d="M6 3.5h12v17l-2-1.4-2 1.4-2-1.4-2 1.4-2-1.4-2 1.4z"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>',
      gauge: '<path d="M4.5 16a7.5 7.5 0 1 1 15 0"/><path d="m12 16 3.5-4.5"/><circle cx="12" cy="16" r="1.2"/>',
      upload: '<path d="M12 15V4.5M7.5 9 12 4.5 16.5 9"/><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
      download: '<path d="M12 4.5V15M7.5 10.5 12 15l4.5-4.5"/><path d="M4.5 15v3.5a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2V15"/>',
      eye: '<path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/>',
      trash: '<path d="M4.5 6.5h15M9.5 6.5V4h5v2.5M6.5 6.5l1 14h9l1-14"/>',
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>'
    }[name] || '';
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + p + '</svg>';
  }
  function brandMark(id, cls) { var b = BRANDS[id]; return '<img class="' + (cls || '') + '" src="' + b.mark + '" alt="">'; }
  function brandLogo(id) {
    var b = BRANDS[id];
    return b.logo ? '<img src="' + b.logo + '" alt="' + e(b.name) + '">' : '<img src="' + b.mark + '" alt=""><span>' + e(b.name) + '</span>';
  }
  function statusPill(plan) {
    if (!plan) return '';
    return '<span class="pill ' + e(plan.status) + '"><i></i>' + e(plan.statusName) + '</span>';
  }
  function toast(msg) {
    var old = $('.toast'); if (old) old.remove();
    var t = document.createElement('div'); t.className = 'toast'; t.setAttribute('role', 'status'); t.textContent = msg;
    document.body.appendChild(t); setTimeout(function () { t.remove(); }, 3800);
  }
  function setBrand(id) { document.body.setAttribute('data-brand', id || 'kareiq'); }

  // ---------------------------------------------------------------- server calls
  function api(method, path, body) {
    var tok = S.tok;
    var headers = { 'X-Requested-With': 'kareiq' };
    if (S.csrf) headers['X-CSRF'] = S.csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    return fetch('/api/app/' + path, { method: method, headers: headers, credentials: 'same-origin', body: body !== undefined ? JSON.stringify(body) : undefined })
      .then(function (r) {
        return r.json().catch(function () { return { ok: false, message: 'The server sent something unexpected. Please try again.' }; }).then(function (data) {
          data.status = r.status;
          if (r.status === 401 && data.signedOut && !/^(login|link|forgot|start|session)/.test(path)) {
            S.me = null; S.csrf = '';
            S.flash = { kind: 'info', text: data.message };
            go('#/signin', true);
            throw Object.assign(new Error(data.message), { handled: true });
          }
          // the person moved to another page while this was loading: drop the old answer
          if (method === 'GET' && path !== 'session' && tok !== S.tok) return new Promise(function () {});
          return data;
        });
      }, function () {
        return { ok: false, status: 0, message: 'Could not reach KareIQ. Check your internet connection and try again.' };
      });
  }
  function loadSession() {
    return api('GET', 'session').then(function (d) {
      if (d.signedIn) { S.me = d; S.csrf = d.csrf; } else { S.me = null; S.csrf = ''; if (d.expired) S.flash = { kind: 'info', text: 'You were signed out after a while without activity, to keep health information safe. Please sign in again.' }; }
      return d;
    });
  }

  // ---------------------------------------------------------------- routing
  function go(hash, replace) {
    if (replace) { history.replaceState(null, '', hash); render(); }
    else if (location.hash === hash) render();
    else location.hash = hash;
  }
  function route() {
    var h = location.hash.replace(/^#/, '') || '/';
    var q = {};
    var i = h.indexOf('?');
    if (i > -1) { h.slice(i + 1).split('&').forEach(function (kv) { var p = kv.split('='); if (p[0]) q[decodeURIComponent(p[0])] = decodeURIComponent(p[1] || ''); }); h = h.slice(0, i); }
    return { parts: h.split('/').filter(Boolean), q: q };
  }
  window.addEventListener('hashchange', render);
  window.addEventListener('hashchange', render);

  function render() {
    S.tok = (S.tok || 0) + 1;
    var r = route();
    var top = r.parts[0] || '';
    if (S.lastHash !== location.hash) { window.scrollTo(0, 0); closeDialog(); S.lastHash = location.hash; document.body.classList.remove('drawer-open'); }
    if (['signin', 'start', 'link', 'forgot', 'join'].indexOf(top) > -1) {
      // coming from a website "Sign in" link while already signed in: go straight in
      if (top === 'signin' && !S.checked) { S.checked = true; return loadSession().then(render); }
      if (S.me && (top === 'signin' || top === 'join')) return go('#/', true);
      return gateView(top, r);
    }
    if (!S.me) {
      S.checked = true;
      return loadSession().then(function (d) {
        if (!d.signedIn) {
          if (d.status === 0) return showOffline();
          var q = location.search.match(/brand=(karehome|karenest)/);
          return go('#/signin' + (q ? '?brand=' + q[1] : ''), true);
        }
        render();
      });
    }
    var role = S.me.user.role;
    // old addresses (one page per brand) still work
    if (BRANDS[top]) {
      if (r.parts[1] === 'p' && r.parts[2]) return go((r.parts[3] === 'visit' ? '#/visit' : role === 'caregiver' ? '#/people' : '#/dashboard') + '?p=' + encodeURIComponent(r.parts[2]), true);
      return go(r.parts[1] === 'requests' ? '#/services' : '#/', true);
    }
    if (top === '') return go(role === 'caregiver' ? '#/people' : '#/dashboard', true);
    if (top === 'account') return accountView();
    if (top === 'plans') return plansView(r);
    if (top === 'admin') { if (role !== 'admin') return go('#/', true); return adminView(r.parts[1] || 'today', r); }
    if (top === 'people' && role !== 'family') return peopleView();
    if (top === 'visit' && role !== 'family') return visitView(r);
    if (top === 'assess' && role !== 'family') return assessView(r);
    if (top === 'dashboard' && role !== 'caregiver') return dashboardView(r);
    if (top === 'records') return recordsView(r);
    if (top === 'package') return packageView(r);
    if (top === 'services' && role !== 'caregiver') return servicesView(r);
    if (top === 'invoices' && role !== 'caregiver') return invoicesView(r);
    go('#/', true);
  }

  function showOffline() {
    setBrand('kareiq');
    root.innerHTML = '<div class="boot"><div style="text-align:center;max-width:420px;padding:24px"><img src="/img/kareiq-icon.png" alt="" style="margin:0 auto 16px;animation:none">' +
      '<h1 style="font-size:1.4rem">KareIQ is not reachable right now</h1><p class="muted" style="margin:10px 0 18px">Check your internet connection. If you are online, our server may be waking up; this takes under a minute.</p>' +
      '<button class="btn" data-act="reload">Try again</button></div></div>';
  }

  // ================================================================ signed-out screens
  function gateShell(inner, brandHint) {
    setBrand('kareiq');
    var logo = brandHint && BRANDS[brandHint] ? (BRANDS[brandHint].logo ? BRANDS[brandHint].logo : '/img/kareiq-logo.png') : '/img/kareiq-logo.png';
    root.innerHTML =
      '<div class="gate">' +
        '<aside class="gate-art" aria-hidden="true">' +
          '<div class="ph"><img src="/img/home.jpg" alt=""><img src="/img/nest.jpg" alt=""></div>' +
          '<h2>Everything about your family\'s care, in one place.</h2>' +
          '<p>Visit notes, health readings and your plan, for Kare@Home and KareNest. One sign-in for both.</p>' +
          '<div class="gate-brands"><span><img src="/img/karehome-emblem.png" alt="">Kare@Home</span><span><img src="/karenest/images/mark.webp" alt="">KareNest</span></div>' +
        '</aside>' +
        '<main class="gate-main"><div class="gate-box">' +
          '<img class="gate-logo" src="' + logo + '" alt="KareIQ">' + inner +
        '</div></main>' +
      '</div>';
  }
  function flashHtml() {
    if (!S.flash) return '';
    var f = S.flash; S.flash = null;
    return '<div class="alert ' + (f.kind === 'ok' ? 'ok' : f.kind === 'bad' ? 'bad' : 'info') + '" role="status">' + e(f.text) + '</div>';
  }
  function pwField(name, label, hint, auto) {
    return '<label class="field"><span>' + label + '</span><div class="pw"><input class="in" type="password" name="' + name + '" autocomplete="' + (auto || 'current-password') + '" required>' +
      '<button type="button" data-act="peek" aria-label="Show password">Show</button></div>' + (hint ? '<small>' + hint + '</small>' : '') + '<em class="err" data-err="' + name + '"></em></label>';
  }
  function field(name, label, attrs, hint) {
    return '<label class="field"><span>' + label + '</span><input class="in" name="' + name + '" ' + (attrs || '') + '>' + (hint ? '<small>' + hint + '</small>' : '') + '<em class="err" data-err="' + name + '"></em></label>';
  }

  // "Continue with Google / Facebook": shown only for providers the server has keys for
  function showOAuth(brand) {
    fetch('/api/app/auth/providers', { credentials: 'same-origin' }).then(function (x) { return x.json(); }).then(function (d) {
      var box = document.querySelector('[data-oauth]');
      if (!box || !d || !d.providers) return;
      var names = { google: 'Google', facebook: 'Facebook' };
      var on = Object.keys(names).filter(function (k) { return d.providers[k]; });
      if (!on.length) return;
      box.innerHTML = on.map(function (k) {
        return '<a class="btn ghost block oauth-btn" href="/api/app/auth/' + k + '/start' + (brand ? '?brand=' + encodeURIComponent(brand) : '') + '">Continue with ' + names[k] + '</a>';
      }).join('') + '<div class="or"><span>or use your mobile number or email</span></div>';
      box.hidden = false;
    }).catch(function () { /* email sign-in still works */ });
  }

  function gateView(kind, r) {
    if (kind === 'signin') {
      gateShell(
        '<h1>Sign in</h1><p class="lead">For families, caregivers and the KareIQ team.</p>' + flashHtml() +
        (r.q.error ? '<div class="alert bad" role="alert">' + e(r.q.error.slice(0, 200)) + '</div>' : '') +
        '<div class="oauth" data-oauth hidden></div>' +
        '<form data-form="signin" novalidate><div class="alert bad" data-msg hidden></div>' +
          field('id', 'Mobile number or email', 'autocomplete="username" inputmode="email" required autofocus') +
          pwField('password', 'Password') +
          '<button class="btn block" type="submit">Sign in</button>' +
        '</form>' +
        '<div class="or"><span>New to KareIQ?</span></div>' +
        '<a class="btn ghost block" href="#/join' + (r.q.brand ? '?brand=' + e(r.q.brand) : '') + '">Create an account</a>' +
        '<div class="gate-foot">' +
          '<span>Booked with us on the website? <a href="#/start">Set up your account</a> with your booking reference.</span>' +
          '<span><a href="#/forgot">Forgot password?</a></span>' +
          '<span>Need help? <a href="' + waLink('Hello, I need help signing in to My KareIQ.') + '" target="_blank" rel="noopener">WhatsApp us</a> or call <a href="tel:+918129345178">' + PHONE + '</a>.</span>' +
        '</div>', r.q.brand);
      showOAuth(r.q.brand);
      return;
    }
    if (kind === 'forgot') {
      gateShell('<h1>Get a new sign-in link</h1><p class="lead">Enter the mobile number or email you use with KareIQ.</p>' +
        '<form data-form="forgot" novalidate><div class="alert bad" data-msg hidden></div>' + field('id', 'Mobile number or email', 'autocomplete="username" required autofocus') +
        '<button class="btn block" type="submit">Send me a link</button></form><div class="gate-foot"><a href="#/signin">Back to sign in</a></div>');
      return;
    }
    if (kind === 'link') {
      var token = r.parts[1] || '';
      gateShell('<div class="skel" style="height:220px"></div>');
      api('GET', 'link?token=' + encodeURIComponent(token)).then(function (d) {
        if (!d.ok) {
          gateShell('<h1>This link has expired</h1><p class="lead">' + e(d.message) + '</p><a class="btn block" href="#/forgot">Get a new link</a><div class="gate-foot"><a href="#/signin">Back to sign in</a></div>');
          return;
        }
        var reset = d.purpose === 'reset';
        gateShell('<h1>' + (reset ? 'Choose a new password' : 'Welcome, ' + e(first(d.name))) + '</h1>' +
          '<p class="lead">' + (reset ? 'Then you will be signed in.' : 'Choose a password and you are in. Next time, sign in with <b>' + e(phoneNice(d.login)) + '</b>.') + '</p>' +
          '<form data-form="link" data-token="' + e(token) + '" novalidate><div class="alert bad" data-msg hidden></div>' +
          pwField('password', 'Password', 'At least 8 characters. A short sentence is easy to remember.', 'new-password') +
          '<button class="btn block" type="submit">' + (reset ? 'Save and sign in' : 'Save password and continue') + '</button></form>');
      });
      return;
    }
    if (kind === 'start') return startView(r);
    if (kind === 'join') {
      gateShell('<h1>Create your account</h1><p class="lead">For families. After this, choose a Kare@Home or KareNest plan; our team calls you to confirm before anything starts.</p>' +
        '<form data-form="join" data-brand="' + e(r.q.brand || '') + '" novalidate><div class="alert bad" data-msg hidden></div>' +
        field('name', 'Your name', 'autocomplete="name" required autofocus') +
        field('phone', 'Mobile number', 'type="tel" inputmode="tel" autocomplete="tel" placeholder="98765 43210" required', 'You sign in with this number. Our team will call you on it.') +
        field('email', 'Email (optional)', 'type="email" autocomplete="email"', 'Useful if you ever forget your password.') +
        pwField('password', 'Choose a password', 'At least 8 characters. A short sentence is easy to remember.', 'new-password') +
        '<button class="btn block" type="submit">Create account</button>' +
        '<p class="muted small" style="margin-top:12px">By creating an account you agree to our <a href="' + SITES.kareiq + 'terms" target="_blank" rel="noopener">terms</a> and <a href="' + SITES.kareiq + 'privacy" target="_blank" rel="noopener">privacy policy</a>.</p></form>' +
        '<div class="gate-foot"><span>Already have an account? <a href="#/signin">Sign in</a></span><span>Booked on our website? <a href="#/start">Use your booking reference</a> instead.</span></div>', r.q.brand);
    }
  }

  // Set up an account from a website booking: step 1 find it, step 2 details + password.
  function startView(r) {
    var st = S.start || {};
    if (!st.found) {
      gateShell('<div class="steps"><i class="on"></i><i></i></div><h1>Set up your account</h1>' +
        '<p class="lead">Find your booking with the reference from your confirmation and the mobile number you booked with.</p>' +
        '<form data-form="start-find" novalidate><div class="alert bad" data-msg hidden></div>' +
        field('reference', 'Booking reference', 'value="' + e(r.q.ref || '') + '" autocapitalize="characters" placeholder="KH-7F3K2Q" required' + (r.q.ref ? '' : ' autofocus')) +
        field('phone', 'Mobile number', 'type="tel" inputmode="tel" autocomplete="tel" placeholder="98765 43210" required' + (r.q.ref ? ' autofocus' : '')) +
        '<button class="btn block" type="submit">Find my booking</button></form>' +
        '<div class="gate-foot"><span>Already have an account? <a href="#/signin">Sign in</a></span><span>No booking yet? Book on <a href="' + SITES.karehome + '">Kare@Home</a> or <a href="' + SITES.karenest + '">KareNest</a>.</span></div>', r.q.brand);
      return;
    }
    var f = st.found;
    var self = f.careFor === 'self';
    gateShell('<div class="steps"><i class="on"></i><i class="on"></i></div><h1>Almost there</h1>' +
      '<div class="found">' + (f.product ? brandMark(f.product) : '<img src="/img/kareiq-icon.png" alt="">') + '<div><b>' + e(f.productName) + (f.planName ? ', ' + e(f.planName) : '') + '</b><div class="muted small">Booking ' + e(f.reference) + '</div></div></div>' +
      '<form data-form="start" novalidate><div class="alert bad" data-msg hidden></div>' +
      field('name', 'Your name', 'value="' + e(f.name) + '" autocomplete="name" required') +
      field('email', 'Email (optional)', 'type="email" value="' + e(f.email) + '" autocomplete="email"', 'You can sign in with your mobile number or this email.') +
      '<div class="row2">' + field('personName', self ? 'Name on care records' : 'Who is the care for?', 'value="' + (self ? e(f.name) : '') + '" placeholder="' + (self ? '' : 'e.g. Lakshmi Nair') + '" required') +
      (self ? '' : field('relation', 'They are your', 'placeholder="e.g. Mother" list="rels"') + '<datalist id="rels"><option>Mother<option>Father<option>Grandmother<option>Grandfather<option>Spouse<option>Aunt<option>Uncle</datalist>') + '</div>' +
      pwField('password', 'Choose a password', 'At least 8 characters.', 'new-password') +
      '<button class="btn block" type="submit">Create my account</button></form>' +
      '<div class="gate-foot"><button class="link" data-act="start-back">Use a different booking</button></div>', f.product);
  }

  // ================================================================ the shell: top bar + side menu
  // One layout for everyone. Families see their relatives' care; caregivers see the people
  // assigned to them (no health history); the office sees everyone plus the office pages.
  var MENUS = {
    family: [
      ['dashboard', 'Dashboard', 'grid'], ['records', 'Medical records', 'file'], ['package', 'Package information', 'box'],
      ['services', 'Book services', 'cal'], ['invoices', 'Invoices', 'receipt']
    ],
    caregiver: [
      ['people', 'My people', 'people'], ['visit', 'Record a visit', 'plus'], ['assess', 'Risk checks', 'gauge'], ['records', 'Medical records', 'file']
    ],
    admin: [
      ['dashboard', 'Dashboard', 'grid'], ['records', 'Medical records', 'file'], ['package', 'Package information', 'box'],
      ['services', 'Book services', 'cal'], ['invoices', 'Invoices', 'receipt'], ['visit', 'Record a visit', 'plus'], ['assess', 'Risk checks', 'gauge']
    ]
  };
  var OFFICE = [['admin', 'Requests', 'inbox'], ['admin/people', 'People and plans', 'people'], ['admin/logins', 'Logins', 'key'], ['admin/activity', 'Activity', 'clock']];

  function shell(active, inner) {
    setBrand('kareiq');
    var u = S.me.user, role = u.role;
    var items = MENUS[role] || MENUS.family;
    var withP = function (k) { return S.pid && ['dashboard', 'records', 'package', 'services', 'invoices', 'visit', 'assess'].indexOf(k) > -1 ? '?p=' + encodeURIComponent(S.pid) : ''; };
    var link = function (l) {
      return '<a href="#/' + l[0] + withP(l[0]) + '"' + (l[0] === active ? ' aria-current="page"' : '') + '>' + icon(l[2]) + '<span>' + e(l[1]) + '</span>' +
        (l[0] === 'admin' && S.cache.newCount ? '<b class="count">' + S.cache.newCount + '</b>' : '') + '</a>';
    };
    var side = '<nav class="sb" id="sb" aria-label="Main"><div class="sb-in">' + items.map(link).join('') +
      (role === 'admin' ? '<p class="sb-h">Office</p>' + OFFICE.map(link).join('') + '<a href="/admin/" target="_blank" rel="noopener">' + icon('globe') + '<span>Website text and prices</span></a>' : '') +
      '<div class="sb-foot">' +
        (role === 'family' ? '<a href="#/plans"' + (active === 'plans' ? ' aria-current="page"' : '') + '>' + icon('plus') + '<span>Add a plan or booking</span></a>' : '') +
        '<a href="' + waLink('Hello, I am ' + u.name + ', contacting you from My KareIQ.') + '" target="_blank" rel="noopener">' + icon('wa') + '<span>WhatsApp us</span></a>' +
        '<a href="#/account"' + (active === 'account' ? ' aria-current="page"' : '') + '>' + icon('pen') + '<span>Your account</span></a>' +
        '<a href="#" data-act="signout">' + icon('out') + '<span>Sign out</span></a>' +
      '</div></div></nav>';
    var top = '<header class="tb"><button class="tb-menu" data-act="drawer" aria-controls="sb" aria-expanded="false" aria-label="Menu">' + icon('menu') + '</button>' +
      '<a class="tb-logo" href="#/"><img src="/img/kareiq-logo.png" alt="KareIQ" width="984" height="276"></a><span class="sp"></span>' + meMenu() + '</header>';
    root.innerHTML = '<div class="shell">' + top + side + '<div class="sb-scrim" data-act="drawer-close"></div><main class="mn" id="mn">' + inner + '</main></div>';
  }
  function meMenu() {
    var u = S.me.user;
    return '<div class="me"><button data-act="menu" aria-haspopup="true" aria-expanded="false" aria-label="Your account"><span class="av">' + e(initials(u.name)) + '</span><span class="nm">' + e(first(u.name)) + '</span>' + icon('down') + '</button>' +
      '<div class="menu" hidden><div class="who"><b>' + e(u.name) + '</b><span class="muted small">' + e(u.roleName) + '</span></div>' +
      '<a href="#/account">Your account</a>' + (u.role === 'family' ? '<a href="#/plans">Add a plan or booking</a>' : '') +
      (u.role === 'admin' ? '<a href="#/admin">Office</a>' : '') +
      '<button data-act="signout">Sign out</button></div></div>';
  }
  function loading(h) { return '<div class="skel" style="height:' + (h || 260) + 'px"></div>'; }
  function pageError(d) {
    var m = $('#mn') || root;
    m.innerHTML = '<div class="empty"><b>' + (d.status === 404 ? 'This page is not available' : d.status === 403 ? 'Not available for your login' : 'Something went wrong') + '</b>' + e(d.message || '') + '<p style="margin-top:12px"><a class="btn sm" href="#/">Go to start</a></p></div>';
  }

  // ---------------------------------------------------------------- whose page is this?
  function loadPeople(force) {
    if (S.people && !force) return Promise.resolve(S.people);
    return api('GET', 'people').then(function (d) { S.people = d.ok ? d.people : []; return S.people; });
  }
  // Picks the person from ?p=, the last one opened, or the first; then calls fn(person)
  function withPerson(r, active, fn) {
    shell(active, loading(80) + loading(320));
    loadPeople().then(function (people) {
      if (!people.length) return noPeople(active);
      var want = r.q.p, last = null;
      try { last = localStorage.getItem('kq.pid'); } catch (x) {}
      var p = people.filter(function (x) { return x.id === want; })[0] || people.filter(function (x) { return x.id === S.pid || x.id === last; })[0] || people[0];
      S.pid = p.id;
      try { localStorage.setItem('kq.pid', p.id); } catch (x) {}
      if (want !== p.id) { history.replaceState(null, '', '#/' + active + '?p=' + encodeURIComponent(p.id) + extraQuery(r)); }
      shell(active, '<div id="pv"></div>');
      fn(p, people);
    });
  }
  function extraQuery(r) { return Object.keys(r.q).filter(function (k) { return k !== 'p'; }).map(function (k) { return '&' + encodeURIComponent(k) + '=' + encodeURIComponent(r.q[k]); }).join(''); }
  function noPeople(active) {
    var role = S.me.user.role;
    if (role === 'family') return go('#/plans', true);
    shell(active, '<div class="empty"><b>' + (role === 'caregiver' ? 'No one is assigned to you yet' : 'No one has a plan yet') + '</b>' +
      (role === 'caregiver' ? 'The office team will assign the people you care for. They will appear here.' : 'Activate a plan from a website booking, or add a family under People and plans.') +
      (role === 'admin' ? '<p style="margin-top:12px"><a class="btn sm" href="#/admin/people">People and plans</a></p>' : '') + '</div>');
  }
  // "PATIENT NAME ▾" at the top of each page
  function personBar(p, people, right) {
    var label = function (x) { return x.name + (x.relation ? ' (' + x.relation + ')' : ''); };
    var pick = people.length > 1
      ? '<label class="pp"><span class="sr">Showing</span><select data-act="person" aria-label="Choose who to show">' + people.map(function (x) { return '<option value="' + e(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + e(label(x)) + '</option>'; }).join('') + '</select>' + icon('down') + '</label>'
      : '<span class="pp one">' + e(label(p)) + '</span>';
    var tags = (p.plans || []).map(function (pl) { return '<span class="tagb ' + pl.product + '">' + e(pl.included ? pl.productName + ' (included)' : pl.name) + '</span>'; }).join('');
    return '<div class="pbar"><div class="pbar-l">' + pick + '<div class="ptags">' + tags + '</div></div>' + (right ? '<div class="pbar-r">' + right + '</div>' : '') + '</div>';
  }
  function fill(html) { var el = $('#pv'); if (el) el.innerHTML = html; }
  var LV = { good: 'good', ok: 'ok', warn: 'warn', bad: 'bad' };
  function dotHtml(level) { return '<i class="dot ' + (LV[level] || 'none') + '" aria-hidden="true"></i>'; }

  // ================================================================ Dashboard
  function dashboardView(r) {
    withPerson(r, 'dashboard', function (p, people) {
      var role = S.me.user.role;
      if (role === 'caregiver') return go('#/people', true);
      var q = r.q.from && r.q.to ? 'from=' + encodeURIComponent(r.q.from) + '&to=' + encodeURIComponent(r.q.to) : 'period=' + encodeURIComponent(r.q.period || '7d');
      fill(personBar(p, people) + loading(160) + loading(420));
      api('GET', 'people/' + encodeURIComponent(p.id) + '/dashboard?' + q).then(function (d) {
        if (!d.ok) return pageError(d);
        S.cache.dash = d;
        var active = d.plans.filter(function (x) { return x.status !== 'pending'; });
        if (!active.length && d.plans.length && role === 'family') { fill(personBar(p, people) + pendingHtml(p, d)); return; }
        var group = S.cache.sumGroup || 'vitals';
        var actions = (d.canRecord ? '<a class="btn sm" href="#/visit?p=' + e(p.id) + '">' + icon('plus') + 'Record visit</a>' : '') +
          (d.canAssess ? '<a class="btn sm ghost" href="#/assess?p=' + e(p.id) + '">' + icon('gauge') + 'Add a risk check</a>' : '');
        fill(personBar(p, people, actions) +
          riskHtml(d) +
          '<div class="dgrid">' +
            '<section class="sum" aria-labelledby="h-sum"><h2 id="h-sum">Summary</h2>' +
              '<label class="sumsel"><span class="sr">Show</span><select data-act="sumgroup">' + [['vitals', 'Vitals'], ['body', 'Body composition'], ['wellbeing', 'Wellbeing checks']].map(function (o) { return '<option value="' + o[0] + '"' + (o[0] === group ? ' selected' : '') + '>' + o[1].toUpperCase() + '</option>'; }).join('') + '</select>' + icon('down') + '</label>' +
              '<div id="sumlist">' + summaryList(d, group) + '</div>' +
            '</section>' +
            '<section class="trends" aria-label="Trends">' + trendsHead(d) + '<div id="charts">' + chartsHtml(d, group) + '</div></section>' +
          '</div>' + notesHtml(d) +
          '<p class="note">' + icon('shield') + '<span>Colours compare readings with KareIQ\'s standard ranges. They are a guide, not a diagnosis. If something worries you, call us on <a href="tel:+918129345178">' + PHONE + '</a>.</span></p>');
        drawCharts();
      });
    });
  }
  function pendingHtml(p, d) {
    var plan = d.plans[0];
    return '<div class="setup"><section class="panel"><h2>' + e(plan.included ? plan.viaName : plan.productName) + ' is being set up</h2>' +
      '<p class="muted">We have your request' + (plan.bookingRef ? ' <b>' + e(plan.bookingRef) + '</b>' : '') + '. Here is what happens next.</p>' +
      '<ol class="prog">' +
        '<li class="done"><span class="dot2">' + icon('check') + '</span><div><b>Request received</b><span class="muted small">' + e(date(plan.createdAt)) + '</span></div></li>' +
        '<li class="now"><span class="dot2">2</span><div><b>We call you to confirm</b><span class="muted small">Usually within one working day. We agree the start date and payment.</span></div></li>' +
        '<li><span class="dot2">3</span><div><b>Care begins</b><span class="muted small">Health readings, risk scores and records for ' + e(first(p.name)) + ' appear here.</span></div></li>' +
      '</ol></section>' +
      '<section class="panel"><h2>Questions?</h2><p class="muted" style="margin-bottom:14px">We are happy to help before you start.</p><div class="actions">' +
        '<a class="btn wa" href="' + waLink('Hello, about my booking ' + (plan.bookingRef || '') + '.') + '" target="_blank" rel="noopener">' + icon('wa') + 'WhatsApp us</a>' +
        '<a class="btn ghost" href="tel:+918129345178">' + icon('phone') + 'Call ' + PHONE + '</a></div></section></div>';
  }

  function riskHtml(d) {
    var list = d.risks;
    var body = list.length ? '<div class="risks">' + list.map(function (x) {
      return '<article class="risk ' + (LV[x.level] || 'none') + '"><div class="rg">' + e(x.groupName) + '</div><h3>' + e(x.title) + '</h3>' +
        '<div class="rv">' + e(x.display) + '</div><div class="rb">' + dotHtml(x.level) + e(x.band) + '</div>' +
        '<div class="rw">' + e(date(x.at)) + (x.by ? ' · ' + e(x.by) : '') + '</div>' +
        (x.scale || x.note ? '<details><summary>What this means</summary>' + (x.scale ? '<p>' + e(x.scale) + '</p>' : '') + (x.note ? '<p>' + e(x.note) + '</p>' : '') + '</details>' : '') + '</article>';
    }).join('') + '</div>'
      : '<div class="risk-empty">Risk scores for heart, kidney, liver, diabetes, mood, memory, sleep and falls appear here after the care team does the checks.</div>';
    return '<section class="riskbox" aria-labelledby="h-risk"><div class="sec-h"><h2 id="h-risk">Risk score</h2><span class="muted small">A guide to support the doctor\'s review</span></div>' + body + '</section>';
  }

  function summaryList(d, group) {
    if (group === 'wellbeing') {
      var o = d.obs;
      if (!o) return '<div class="empty small">Food, water, toilet, sleep, pain and medicine checks from visits appear here.</div>';
      return '<p class="muted small" style="margin:4px 0 10px">From the visit on ' + e(dt(o.at)) + ' by ' + e(o.by) + '</p>' + o.groups.map(function (g) {
        return '<div class="obsg"><h3>' + e(g.title) + '</h3><dl>' + g.items.map(function (it) {
          return '<dt>' + e(it.label) + '</dt><dd' + (it.flag ? ' class="flag"' : '') + '>' + (it.flag ? dotHtml('warn') : '') + e(it.text) + '</dd>';
        }).join('') + '</dl></div>';
      }).join('');
    }
    var rows = d.latest.filter(function (x) { return group === 'body' ? x.group === 'body' : x.group !== 'body'; });
    if (!rows.length) return '<div class="empty small">' + (group === 'body' ? 'Body composition from the smart scale appears here.' : 'Blood pressure, heart rate, sugar and oxygen appear here after the first visit.') + '</div>';
    var sel = S.cache.metric;
    return rows.map(function (x) {
      return '<button class="vcard' + (x.metric === sel ? ' on' : '') + '" data-act="jump" data-k="' + x.metric + '">' +
        '<span class="vl ' + (LV[x.level] || 'none') + '">' + dotHtml(x.level) + e(x.label) + (x.context ? ' <small>(' + e(GLUCOSE[x.context] || x.context) + ')</small>' : '') + '</span>' +
        '<span class="vv">' + e(x.value) + (x.unit ? '<small>' + e(x.unit) + '</small>' : '') + '</span>' +
        '<span class="vd">Last measured on ' + e(date(x.at)) + '</span>' +
        (x.range ? '<span class="vr">Normal range: ' + e(x.range) + (x.status ? ' · <b class="' + (LV[x.level] || '') + '">' + e(x.status) + '</b>' : '') + '</span>' : '') +
      '</button>';
    }).join('');
  }

  function trendsHead(d) {
    var r = d.range, custom = r.key === 'custom';
    var qp = custom ? 'from=' + r.from + '&to=' + r.to : 'period=' + r.key;
    return '<div class="thead"><div class="chips" role="group" aria-label="Period">' + PERIODS.map(function (x) {
      return '<button data-act="period" data-k="' + x[0] + '" aria-pressed="' + (!custom && x[0] === r.key) + '">' + x[1] + '</button>';
    }).join('') + '<button class="cal" data-act="calendar" aria-pressed="' + custom + '" aria-label="Choose dates" title="Choose dates">' + icon('cal') + '</button></div>' +
      '<a class="dl" href="/api/app/people/' + encodeURIComponent(d.person.id) + '/report.pdf?' + qp + '" download>Download trends' + icon('arrow') + '</a></div>' +
      (custom ? '<p class="muted small" style="margin:-4px 0 10px">Showing ' + e(r.label) + ' · <button class="link" data-act="period" data-k="7d">Back to last 7 days</button></p>' : '');
  }

  function chartsHtml(d, group) {
    var list = d.series.filter(function (m) { return group === 'body' ? m.group === 'body' : m.group !== 'body'; });
    if (group === 'wellbeing') list = d.series.filter(function (m) { return m.group !== 'body'; });
    if (!list.length) return '<div class="empty"><b>No readings in this period</b>Try a longer period, or choose dates with the calendar.</div>';
    return list.map(function (m) {
      var span = date(d.range.from) + ' – ' + date(d.range.to);
      return '<div class="tblock" id="t-' + m.metric + '"><h3>' + e(m.label) + '</h3>' +
        '<div class="avgbar ' + (LV[m.level] || 'none') + '"><div><span>Average ' + e(m.label.toLowerCase()) + (m.averageNote ? ' (' + e(m.averageNote) + ')' : '') + '</span><b>' + e(m.average) + ' ' + e(m.unit) + '</b></div>' +
          (m.status ? '<span class="ast">● ' + e(m.status) + '</span>' : '<span></span>') + '<span class="aspan">' + e(span) + '</span></div>' +
        '<div class="cwrap" data-chart="' + m.metric + '"></div>' +
        (m.keys.length > 1 ? '<div class="legend2"><span><i class="s1"></i>' + e(m.names[0]) + '</span><span><i class="s2"></i>' + e(m.names[1]) + '</span></div>' : '') +
        '<button class="btn ghost block showall" data-act="showall" data-k="' + m.metric + '" aria-expanded="false">Show all data</button><div class="alldata" hidden></div></div>';
    }).join('');
  }
  // draw charts at their real width after the HTML is on the page
  function drawCharts() {
    var d = S.cache.dash; if (!d) return;
    $$('[data-chart]').forEach(function (el) {
      var m = d.series.filter(function (x) { return x.metric === el.getAttribute('data-chart'); })[0];
      if (m) el.innerHTML = chartSvg(m, d.range, el.clientWidth);
    });
  }
  function chartSvg(m, range, width) {
    var W = Math.max(300, Math.round(width || 640)), H = W < 520 ? 220 : 280, L = 44, R = 14, T = 16, B = 34;
    var start = Date.parse(range.from + 'T00:00:00+05:30'), end = Date.parse(range.to + 'T23:59:59+05:30');
    var days = Math.round((end - start) / 86400000);
    var vals = [];
    m.rows.forEach(function (r) { m.keys.forEach(function (k) { if (r[k] != null) vals.push(r[k]); }); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals);
    var stepGuess = niceStep((hi - lo) || Math.abs(hi) * 0.2 || 1);
    lo = Math.floor((lo - stepGuess * 0.5) / stepGuess) * stepGuess; hi = Math.ceil((hi + stepGuess * 0.5) / stepGuess) * stepGuess;
    if (m.metric === 'bp') { lo = Math.min(lo, 40); hi = Math.max(hi, 200); stepGuess = 40; }
    var x = function (ms) { return L + (W - L - R) * (ms - start) / (end - start); };
    var y = function (v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); };
    var out = '<svg class="chart2" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + e(m.label) + ' chart">';
    out += '<line x1="' + L + '" y1="' + T + '" x2="' + L + '" y2="' + (H - B) + '" class="ax"/><line x1="' + L + '" y1="' + (H - B) + '" x2="' + (W - R) + '" y2="' + (H - B) + '" class="ax"/>';
    for (var v = lo; v <= hi + 1e-9; v += stepGuess) {
      var yy = y(v).toFixed(1);
      if (v > lo) out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + yy + '" y2="' + yy + '" class="gl"/>';
      out += '<text x="' + (L - 8) + '" y="' + (Number(yy) + 4) + '" text-anchor="end">' + fmtNum(v) + '</text>';
    }
    // x labels: weekdays for a week, otherwise dates
    var ticks = [];
    if (days <= 8) { for (var t = start + 43200000; t < end; t += 86400000) ticks.push([t, new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', weekday: 'short' }).format(new Date(t))]); }
    else { var n = W < 520 ? 4 : 6; for (var i = 0; i <= n; i++) { var tt = start + (end - start) * i / n; ticks.push([tt, fmtS.format(new Date(tt))]); } }
    ticks.forEach(function (tk, i) { out += '<text x="' + x(tk[0]).toFixed(1) + '" y="' + (H - 10) + '" text-anchor="' + (days > 8 && i === 0 ? 'start' : days > 8 && i === ticks.length - 1 ? 'end' : 'middle') + '">' + e(tk[1]) + '</text>'; });
    m.keys.forEach(function (k, si) {
      var pts = m.rows.filter(function (r) { return r[k] != null; }).map(function (r) { return [x(r.ms), y(r[k]), r]; });
      if (pts.length > 1) out += '<polyline class="ln s' + (si + 1) + '" points="' + pts.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      pts.forEach(function (p) {
        var val = p[2][k];
        out += '<circle class="pt s' + (si + 1) + '" r="' + (pts.length > 60 ? 3 : 6) + '" cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '"><title>' + e(dt(p[2].at)) + ': ' + val + ' ' + e(m.unit) + '</title></circle>';
      });
    });
    return out + '</svg>';
  }
  function niceStep(span) {
    var raw = span / 4, p = Math.pow(10, Math.floor(Math.log(raw) / Math.LN10)), n = raw / p;
    return (n < 1.5 ? 1 : n < 3 ? 2 : n < 7 ? 5 : 10) * p;
  }
  function fmtNum(v) { return Math.abs(v) >= 100 ? String(Math.round(v)) : String(Math.round(v * 10) / 10); }
  function allDataHtml(m) {
    return '<div class="tw"><table><thead><tr><th>When</th>' + m.keys.map(function (k, i) { return '<th>' + e(m.names[i]) + (m.unit ? ' (' + e(m.unit) + ')' : '') + '</th>'; }).join('') + '<th>Status</th></tr></thead><tbody>' +
      m.rows.slice().reverse().map(function (r) {
        return '<tr><td>' + e(dt(r.at)) + '</td>' + m.keys.map(function (k) { return '<td>' + e(r[k]) + (r.context ? ' <span class="muted small">' + e(GLUCOSE[r.context] || '') + '</span>' : '') + '</td>'; }).join('') +
          '<td>' + dotHtml(r.level) + '</td></tr>';
      }).join('') + '</tbody></table></div>';
  }
  function notesHtml(d) {
    if (!d.notes.length) return '';
    return '<section class="panel" style="margin-top:22px"><h2>Notes from the care team</h2><ol class="tl">' + d.notes.map(function (v) {
      return '<li><div class="t">' + e(dt(v.at)) + '</div><div class="m">' + e(v.by) + '</div><p class="n">' + e(v.note) + '</p></li>';
    }).join('') + '</ol></section>';
  }
  function calendarDialog() {
    var d = S.cache.dash; if (!d) return;
    openDialog('Choose dates', '<form data-form="range" novalidate><div class="alert bad" data-msg hidden></div><div class="row2">' +
      field('from', 'From', 'type="date" value="' + e(d.range.from) + '" max="' + todayIST() + '"') + field('to', 'To', 'type="date" value="' + e(d.range.to) + '" max="' + todayIST() + '"') +
      '</div><p class="muted small">Up to 2 years at a time.</p></form>', '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Show</button>');
  }

  // ================================================================ Medical records
  function recordsView(r) {
    withPerson(r, 'records', function (p, people) {
      fill(personBar(p, people) + loading(320));
      api('GET', 'people/' + encodeURIComponent(p.id) + '/records').then(function (d) {
        if (!d.ok) return pageError(d);
        S.cache.records = d;
        var up = '<button class="btn pink" data-act="upload">' + icon('upload') + 'Upload report</button>';
        fill(personBar(p, people, up) + '<div class="rtop"><div class="seg2" role="group" aria-label="Type of record">' +
          [['all', 'All']].concat(Object.keys(d.categories).map(function (k) { return [k, d.categories[k]]; })).map(function (c) {
            return '<button data-act="rcat" data-k="' + c[0] + '" aria-pressed="' + ((S.cache.rcat || 'all') === c[0]) + '">' + e(c[1]) + '</button>';
          }).join('') + '</div></div>' +
          (d.canSeeAll ? '' : '<p class="note">' + icon('shield') + '<span>You can see the records you added. The family and office see all records.</span></p>') +
          '<div class="rtools"><label class="sortby">Sort by: <select data-act="rsort"><option value="new">Newest first</option><option value="old">Oldest first</option><option value="name">Name A–Z</option></select></label>' +
          '<span class="sp"></span><button class="btn sm ghost" data-act="rdownload" disabled>' + icon('download') + 'Download selected</button></div>' +
          '<div id="rlist"></div>');
        var sel = $('[data-act=rsort]'); if (sel) sel.value = S.cache.rsort || 'new';
        drawRecords();
      });
    });
  }
  function drawRecords() {
    var d = S.cache.records, el = $('#rlist'); if (!d || !el) return;
    var cat = S.cache.rcat || 'all', sort = S.cache.rsort || 'new';
    var rows = d.rows.filter(function (x) { return cat === 'all' || x.category === cat; });
    rows.sort(function (a, b) { return sort === 'name' ? a.name.localeCompare(b.name) : sort === 'old' ? (a.date > b.date ? 1 : -1) : (a.date < b.date ? 1 : -1); });
    if (!rows.length) { el.innerHTML = '<div class="empty"><b>No records here yet</b>Upload lab reports, scans and prescriptions as PDF or photos. They stay private to the family and the KareIQ team.</div>'; return; }
    el.innerHTML = '<div class="rec-all"><label><input type="checkbox" data-act="rall"> <b>Select all</b></label></div><ul class="recs">' + rows.map(function (x) {
      return '<li><label class="rc"><input type="checkbox" data-act="rpick" value="' + e(x.id) + '"><span class="sr">Select ' + e(x.name) + '</span></label>' +
        '<div class="ri"><b>' + e(x.name) + '</b><span>' + e(date(x.date)) + ' · ' + e(d.categories[x.category] || x.category) + ' · ' + e(sizeText(x.size)) + ' · added by ' + e(x.by) + '</span></div>' +
        '<div class="ra"><a class="ib" href="/api/app/records/' + e(x.id) + '/file?view=1" target="_blank" rel="noopener" aria-label="Open ' + e(x.name) + '" title="Open">' + icon('eye') + '</a>' +
        '<a class="ib" href="/api/app/records/' + e(x.id) + '/file" download aria-label="Download ' + e(x.name) + '" title="Download">' + icon('download') + '</a>' +
        (x.canRemove ? '<button class="ib" data-act="rremove" data-id="' + e(x.id) + '" data-name="' + e(x.name) + '" aria-label="Remove ' + e(x.name) + '" title="Remove">' + icon('trash') + '</button>' : '') + '</div></li>';
    }).join('') + '</ul>';
    syncPicks();
  }
  function sizeText(n) { return n > 1048576 ? (Math.round(n / 104857.6) / 10) + ' MB' : Math.max(1, Math.round(n / 1024)) + ' KB'; }
  function syncPicks() {
    var picks = $$('[data-act=rpick]'), on = picks.filter(function (x) { return x.checked; });
    var b = $('[data-act=rdownload]'); if (b) { b.disabled = !on.length; b.lastChild.textContent = on.length ? 'Download selected (' + on.length + ')' : 'Download selected'; }
    var all = $('[data-act=rall]'); if (all) { all.checked = picks.length && on.length === picks.length; all.indeterminate = on.length > 0 && on.length < picks.length; }
  }
  function uploadDialog() {
    var d = S.cache.records;
    openDialog('Upload a report', '<form data-form="upload" novalidate><div class="alert bad" data-msg hidden></div>' +
      '<label class="field"><span>File</span><input class="in" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" required><small>PDF or photo, up to 5 MB. On a phone you can take a photo of the report.</small><em class="err" data-err="file"></em></label>' +
      field('name', 'Name of the report', 'placeholder="e.g. Lipid profile" maxlength="80"') +
      '<div class="row2"><label class="field"><span>Type</span><select class="in" name="category">' + Object.keys(d.categories).map(function (k) { return '<option value="' + k + '"' + (k === (S.cache.rcat !== 'all' && S.cache.rcat ? S.cache.rcat : 'general') ? ' selected' : '') + '>' + e(d.categories[k]) + '</option>'; }).join('') + '</select></label>' +
      field('date', 'Date of the report', 'type="date" value="' + todayIST() + '" max="' + todayIST() + '"') + '</div></form>',
      '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Upload</button>');
  }

  // ================================================================ Package information
  function packageView(r) {
    withPerson(r, 'package', function (p, people) {
      fill(personBar(p, people) + loading(100) + loading(300));
      api('GET', 'people/' + encodeURIComponent(p.id) + '/package').then(function (d) {
        if (!d.ok) return pageError(d);
        S.cache.pkg = d;
        var canAsk = S.me.user.role !== 'caregiver';
        var right = canAsk ? '<button class="btn pink" data-act="ask" data-kind="plan">Modify package</button>' : '';
        if (!d.plans.length) { fill(personBar(p, people, right) + '<div class="empty"><b>No package yet</b>Choose a Kare@Home or KareNest package below. Our team will call you to confirm.</div>' + catalogHtml(d, p)); return; }
        var s = d.summary;
        var sumBox = s ? '<div class="pkgsum"><div><span>Package activation date</span><b>' + (s.startDate ? e(date(s.startDate)) : 'After confirmation') + '</b></div>' +
          '<div><span>Package expiry date</span><b>' + (s.endDate ? e(date(s.endDate)) : '–') + '</b></div>' +
          '<div><span>Total amount paid</span><b>' + (s.paidText ? e(s.paidText) : 'Confirmed by our team') + '</b></div></div>' : '';
        var groups = {};
        d.plans.forEach(function (pl) { (groups[pl.group] = groups[pl.group] || []).push(pl); });
        var order = ['Preventive package', 'Focused care package', 'Community living', 'Other'];
        var cards = order.filter(function (g) { return groups[g]; }).map(function (g) {
          return '<h2 class="sec">' + e(g) + '</h2><div class="cards3">' + groups[g].map(function (pl) {
            return '<article class="bcard"><div class="bc-top">' + statusPill(pl) + '<span class="tagb ' + pl.product + '">' + e(pl.productName) + '</span></div><h3>' + e(pl.name) + '</h3>' +
              (pl.startDate ? '<p class="muted small">' + e(date(pl.startDate)) + ' to ' + e(date(pl.endDate)) + '</p>' : '<p class="muted small">Starts after our team confirms</p>') +
              '<button class="arrowlink" data-act="pkgdetails" data-id="' + e(pl.id) + '">View details' + icon('arrow') + '</button></article>';
          }).join('') + '</div>';
        }).join('');
        var incl = d.included.length ? '<h2 class="sec">Included with your plan</h2><div class="cards3">' + d.included.map(function (pl) {
          return '<article class="bcard"><div class="bc-top"><span class="tagb ' + pl.product + '">' + e(pl.productName) + '</span></div><h3>' + e(pl.productName) + '</h3><p class="muted small">Included with ' + e(pl.viaName) + ' (' + e(pl.viaPlan) + '): home visits, readings and services.</p></article>';
        }).join('') + '</div>' : '';
        var tier = d.plans.filter(function (pl) { return pl.freeSessions; })[0];
        var addOns = tier ? '<h2 class="sec">Add on services offered with your package</h2><p class="muted" style="margin:-6px 0 14px">You can book these sessions from the <a href="#/services?p=' + e(p.id) + '">Book services</a> page.</p>' +
          '<div class="cards3">' + [['Bystander', 'Someone to help with daily activities at home or in hospital.'], ['Physiotherapy', 'Sessions at home for strength, balance and pain.']].map(function (s2) {
            return '<article class="bcard"><span class="freepill">' + tier.freeSessions + ' free sessions a year</span><h3>' + s2[0] + '</h3><p class="muted small">' + s2[1] + ' Shared allowance: ' + tier.freeSessions + ' physiotherapy or bystander sessions a year.</p></article>';
          }).join('') + '<article class="bcard"><span class="freepill">' + tier.discount + '% off</span><h3>Other add-on services</h3><p class="muted small">Teleconsultation, sponge bath, blood collection, dressing and more, at ' + tier.discount + '% off with ' + e(tier.name) + '.</p></article></div>' : '';
        var mon = d.plans.filter(function (pl) { return pl.monitoring && pl.monitoring.length; })[0];
        var monHtml = mon ? '<h2 class="sec">What we monitor with ' + e(mon.name) + '</h2><section class="panel tw" style="padding:6px 14px"><table class="mon"><thead><tr><th>What</th><th>How often</th></tr></thead><tbody>' +
          mon.monitoring.map(function (m, i) { var prev = mon.monitoring[i - 1]; return (!prev || prev.category !== m.category ? '<tr class="cat"><td colspan="2">' + e(m.category) + '</td></tr>' : '') + '<tr><td>' + e(m.item) + '</td><td>' + e(m.freq) + '</td></tr>'; }).join('') + '</tbody></table></section>' : '';
        fill(personBar(p, people, right) + sumBox + cards + incl + addOns + monHtml + catalogHtml(d, p));
      });
    });
  }
  function pkgDetails(id) {
    var d = S.cache.pkg, pl = d && d.plans.filter(function (x) { return x.id === id; })[0];
    if (!pl) return;
    openDialog(pl.name, '<dl class="kv"><dt>Brand</dt><dd>' + e(pl.productName) + '</dd><dt>Status</dt><dd>' + statusPill(pl) + '</dd>' +
      (pl.startDate ? '<dt>Runs</dt><dd>' + e(date(pl.startDate)) + ' to ' + e(date(pl.endDate)) + '</dd>' : '') +
      (pl.months ? '<dt>Payment plan</dt><dd>' + e(PERIOD_NAMES[pl.months] || pl.months + ' months') + (pl.months > 1 ? ' (' + pl.months + ' months)' : '') + '</dd>' : '') +
      '<dt>Charge</dt><dd>' + (pl.charge.amount ? '<b>' + rs(pl.charge.amount) + '</b>' + (pl.charge.perMonth && pl.charge.months > 1 ? ' <span class="muted small">(' + rs(pl.charge.perMonth) + ' a month)</span>' : '') + (pl.charge.gst ? '<br><span class="muted small">' + e(pl.charge.gst) + '</span>' : '') : e(pl.charge.text)) + '</dd></dl>' +
      '<div style="margin-top:14px">' + includesHtml(pl) + '</div>' +
      (pl.monitoring.length ? '<h3 class="pk-h">What we monitor</h3><ul class="inc">' + pl.monitoring.map(function (m) { return '<li>' + icon('check') + '<span>' + e(m.item) + ' <span class="muted small">(' + e(m.freq.toLowerCase()) + ')</span></span></li>'; }).join('') + '</ul>' : ''),
      '<button class="btn" data-act="close">Done</button>');
  }
  // every package, grouped, with prices, payment plans and a way to choose it
  function catalogHtml(d, p) {
    var role = S.me.user.role, mine = d.plans.map(function (x) { return x.planId; });
    var by = {};
    d.catalog.forEach(function (pk) { (by[pk.group] = by[pk.group] || []).push(pk); });
    return '<h2 class="sec" id="all-packages">All packages</h2><p class="muted" style="margin:-6px 0 16px">Every Kare@Home and KareNest package, with what is included. ' + (role === 'family' ? 'Choose one and our team will call you to confirm.' : role === 'admin' ? 'Add a package for ' + e(first(p.name)) + ' straight from here.' : '') + '</p>' +
      d.groupOrder.filter(function (g) { return by[g]; }).map(function (g) {
        return '<h3 class="sec2">' + e(g) + '</h3><div class="cards3">' + by[g].map(function (pk) {
          var has = mine.indexOf(pk.id) > -1;
          var act = role === 'family' ? '<button class="btn sm" data-act="choose-pkg" data-id="' + e(pk.id) + '">' + (has ? 'Change or renew' : 'Choose ' + e(pk.name.replace(/^KareNest |^KareBalance |^KareMind /, ''))) + '</button>'
            : role === 'admin' ? '<button class="btn sm" data-act="add-pkg" data-id="' + e(pk.id) + '">' + icon('plus') + 'Add for ' + e(first(p.name)) + '</button>' : '';
          return '<article class="bcard pkc" data-pkcard><div class="bc-top"><span class="tagb ' + pk.product + '">' + e(pk.type) + '</span>' + (has ? '<span class="pill active"><i></i>Has this</span>' : '') + '</div>' +
            '<h3>' + e(pk.name) + '</h3><p class="muted small">' + e(pk.tagline || '') + '</p><div class="pk-price" data-pkprice>' + priceHtml(pk) + '</div>' + durationSelect(pk) +
            '<div class="pk-acts">' + act + '<button class="arrowlink" data-act="cat-details" data-id="' + e(pk.id) + '">View details' + icon('arrow') + '</button></div></article>';
        }).join('') + '</div>';
      }).join('');
  }
  function catalogDetails(id) {
    var d = S.cache.pkg, pk = d && d.catalog.filter(function (x) { return x.id === id; })[0];
    if (!pk) return;
    var role = S.me.user.role;
    openDialog(pk.name, '<div class="pk-head" style="margin-bottom:10px"><span class="tagb ' + pk.product + '">' + e(pk.type) + '</span><div class="pk-price">' + priceHtml(pk) + '</div></div>' + includesHtml(pk) + priceTable(pk),
      '<button class="btn ghost" data-act="close">Close</button>' + (role === 'family' ? '<button class="btn" data-act="choose-pkg" data-id="' + e(pk.id) + '">Choose ' + e(pk.name) + '</button>' : role === 'admin' ? '<button class="btn" data-act="add-pkg" data-id="' + e(pk.id) + '">Add for ' + e(first(d.person.name)) + '</button>' : ''));
  }
  function addPkgDialog(id) {
    var d = S.cache.pkg, pk = d && d.catalog.filter(function (x) { return x.id === id; })[0];
    if (!pk) return;
    openDialog('Add ' + pk.name + ' for ' + d.person.name, '<form data-form="add-pkg" data-id="' + e(pk.id) + '" data-product="' + e(pk.product) + '" novalidate><div class="alert bad" data-msg hidden></div>' +
      '<div class="pk-price" data-pkprice style="margin-bottom:12px">' + priceHtml(pk) + '</div>' +
      (hasDuration(pk) ? durationSelect(pk) : '<label class="field"><span>Runs for</span><select class="in" name="months"><option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12" selected>12 months</option></select></label>') +
      field('startDate', 'Starts on', 'type="date" value="' + todayIST() + '"') +
      '<p class="muted small">The plan becomes active straight away. The family sees it the next time they open the app.</p></form>',
      '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Add package</button>');
    S.cache.dlgPlans = [pk];
  }

  // ================================================================ Book services
  function servicesView(r) {
    withPerson(r, 'services', function (p, people) {
      fill(personBar(p, people) + loading(240) + loading(240));
      api('GET', 'people/' + encodeURIComponent(p.id) + '/services').then(function (d) {
        if (!d.ok) return pageError(d);
        S.cache.svc = d;
        var card = function (s, freeText) {
          return '<article class="bcard">' + (freeText ? '<span class="freepill">' + e(freeText) + '</span>' : '') + '<h3>' + e(s.name) + '</h3><p class="muted small">' + e(s.text) + '</p>' +
            (d.canBook ? '<button class="arrowlink" data-act="book" data-k="' + e(s.id) + '">Book now' + icon('arrow') + '</button>' : '') + '</article>';
        };
        var last = d.last ? '<h2 class="sec">Last ordered service</h2><div class="cards3"><article class="bcard"><span class="freepill ' + (d.last.status === 'closed' ? 'grey' : '') + '">' + e(d.last.statusName) + '</span><h3>' + e(d.last.name) + '</h3>' +
          '<p class="muted small">' + (d.last.date ? 'For ' + e(date(d.last.date)) + (d.last.time ? ', ' + e(d.last.time) : '') + '. ' : '') + (d.last.free ? 'Free session from your package.' : '') + ' Ref ' + e(d.last.reference) + '</p>' +
          (d.canBook ? '<button class="arrowlink" data-act="book" data-k="' + e(d.last.service) + '">Book again' + icon('arrow') + '</button>' : '') + '</article></div>' : '';
        var freeText = d.free ? (d.free.left ? d.free.left + ' free session' + (d.free.left === 1 ? '' : 's') + ' available' : 'Free sessions used this year') : null;
        var incl = d.included.length ? '<h2 class="sec">Included in your package</h2>' + (d.free ? '<p class="muted" style="margin:-6px 0 14px">' + e(d.free.plan) + ' includes ' + d.free.total + ' free physiotherapy or bystander sessions a year (' + d.free.used + ' used' + (d.free.until ? ', renews after ' + e(date(d.free.until)) : '') + ').</p>' : '') +
          '<div class="cards3">' + d.included.map(function (s) { return card(s, freeText); }).join('') + '</div>' : '';
        var add = '<h2 class="sec">Additional services</h2>' + (d.discount ? '<p class="muted" style="margin:-6px 0 14px">' + d.discount + '% off with your package. Our team confirms the price when they call.</p>' : '<p class="muted" style="margin:-6px 0 14px">Our team confirms the price and time when they call.</p>') +
          '<div class="cards3">' + d.additional.map(function (s) { return card(s, null); }).join('') + '</div>';
        var names = { new: 'new', contacted: 'active', scheduled: 'active', closed: 'ended' };
        var list = d.bookings.length ? '<h2 class="sec">Your bookings</h2><section class="panel"><ul class="rlist">' + d.bookings.map(function (b) {
          return '<li><span><b>' + e(b.name) + '</b>' + (b.free ? ' <span class="freepill sm">Free</span>' : '') + '<br><span class="muted small">' + (b.date ? e(date(b.date)) + (b.time ? ', ' + e(b.time) : '') + ' · ' : '') + 'Ref ' + e(b.reference) + ', sent ' + e(ago(b.createdAt)) + '</span></span><span class="pill ' + (names[b.status] || 'new') + '">' + e(b.statusName) + '</span></li>';
        }).join('') + '</ul></section>' : '';
        var ask = S.me.user.role !== 'caregiver' ? '<button class="btn sm ghost" data-act="ask" data-kind="question">' + icon('chat') + 'Ask the care team</button>' : '';
        fill(personBar(p, people, ask) + (d.canBook ? '' : '<p class="note">' + icon('clock') + '<span>Services can be booked once the plan is active.</span></p>') + last + incl + add + list);
      });
    });
  }
  function bookDialog(k) {
    var d = S.cache.svc; if (!d) return;
    var s = d.included.concat(d.additional).filter(function (x) { return x.id === k; })[0]; if (!s) return;
    var free = s.free && d.free && d.free.left > 0;
    openDialog('Book ' + s.name, '<form data-form="book" data-k="' + e(k) + '" novalidate><div class="alert bad" data-msg hidden></div>' +
      (free ? '<div class="alert ok">This uses 1 of your ' + d.free.left + ' free sessions.</div>' : '') +
      '<p class="muted" style="margin-bottom:12px">For ' + e(d.person.name) + '. ' + e(s.text) + '</p>' +
      '<div class="row2">' + field('date', 'Preferred date', 'type="date" min="' + todayIST() + '" required') +
      '<label class="field"><span>Time</span><select class="in" name="time"><option value="morning">Morning (8am to 12pm)</option><option value="afternoon">Afternoon (12pm to 4pm)</option><option value="evening">Evening (4pm to 8pm)</option></select></label></div>' +
      '<label class="field"><span>Anything we should know? (optional)</span><textarea class="in" name="note" maxlength="1000"></textarea></label>' +
      '<p class="muted small">Our team will call or WhatsApp you on ' + e(phoneNice(S.me.user.phone) || 'your number') + ' to confirm.</p></form>',
      '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Send booking</button>');
  }

  // ================================================================ Invoices
  function invoicesView(r) {
    withPerson(r, 'invoices', function (p, people) {
      fill(personBar(p, people) + loading(240));
      api('GET', 'people/' + encodeURIComponent(p.id) + '/invoices').then(function (d) {
        if (!d.ok) return pageError(d);
        var right = d.rows.length ? '<button class="btn sm ghost" data-act="print">' + icon('download') + 'Print or save as PDF</button>' : '';
        fill(personBar(p, people, right) + (d.rows.length ? '<section class="panel tw invoices"><table class="stackable"><thead><tr><th>Number</th><th>Date</th><th>Description</th><th>Period</th><th>Amount</th><th>Status</th></tr></thead><tbody>' +
          d.rows.map(function (x) {
            return '<tr><td data-l="Number"><b>' + e(x.number) + '</b></td><td data-l="Date">' + e(date(x.date)) + '</td><td data-l="Description">' + e(x.productName) + ': ' + e(x.description) + (x.gst ? '<br><span class="muted small">' + e(x.gst) + '</span>' : '') + '</td>' +
              '<td data-l="Period">' + (x.period ? e(date(x.period.from)) + ' to ' + e(date(x.period.to)) : '–') + '</td><td data-l="Amount"><b>' + (x.amountText ? e(x.amountText) : 'Confirmed by our team') + '</b></td>' +
              '<td data-l="Status"><span class="pill ' + e(x.status) + '">' + e(x.statusName) + '</span></td></tr>';
          }).join('') + '</tbody>' + (d.totalText ? '<tfoot><tr><td colspan="4"><b>Total</b></td><td colspan="2"><b>' + e(d.totalText) + '</b></td></tr></tfoot>' : '') + '</table></section>' +
          '<p class="note">' + icon('shield') + '<span>Charges are worked out from your plan and the published prices. Your GST tax invoice comes from the KareIQ office; <a href="' + waLink('Hello, could you send me the invoice for ' + p.name + '?') + '" target="_blank" rel="noopener">ask us on WhatsApp</a> for a copy.</span></p>'
          : '<div class="empty"><b>No invoices yet</b>Invoices appear here once a plan is confirmed.</div>'));
      });
    });
  }

  // ================================================================ caregivers: my people
  function peopleView() {
    shell('people', loading(260));
    loadPeople(true).then(function (people) {
      if (!people.length) return noPeople('people');
      $('#mn').innerHTML = '<div class="head"><div><h1>Good ' + greeting() + ', ' + e(first(S.me.user.name)) + '</h1><p class="sub">The people you care for. Tap "Record visit" when you are with them.</p></div></div>' +
        '<div class="cards">' + people.map(function (x) {
          var active = x.status === 'active';
          return '<div class="pcard"><div class="top"><span class="av lg">' + e(initials(x.name)) + '</span><div><b>' + e(x.name) + '</b>' +
            '<span class="meta">' + x.plans.map(function (pl) { return e(pl.included ? pl.productName + ' (included)' : pl.name); }).join(', ') + '</span></div></div>' +
            '<div class="btns">' + (active ? '<a class="btn sm" href="#/visit?p=' + e(x.id) + '">' + icon('plus') + 'Record visit</a>' : '<span class="pill paused">Paused</span>') +
            '<a class="btn sm ghost" href="#/assess?p=' + e(x.id) + '">' + icon('gauge') + 'Risk check</a><a class="btn sm ghost" href="#/records?p=' + e(x.id) + '">' + icon('upload') + 'Add a record</a></div></div>';
        }).join('') + '</div>' +
        '<p class="note">' + icon('shield') + '<span>For privacy, health history is shared with the family and the office only. You see the readings you entered today, so you can correct a mistake.</span></p>';
    });
  }
  function greeting() { var h = Number(nowHM().slice(0, 2)); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }

  // ================================================================ record a visit (care team)
  function visitView(r) {
    withPerson(r, 'visit', function (p, people) {
      var forms = S.cache.visitForm ? Promise.resolve(S.cache.visitForm) : api('GET', 'forms/visit').then(function (d) { S.cache.visitForm = d; return d; });
      Promise.all([forms, api('GET', 'people/' + encodeURIComponent(p.id) + '/recent')]).then(function (res) {
        var f = res[0], rec = res[1];
        if (!f.ok) return pageError(f);
        if (p.status !== 'active') { fill(personBar(p, people) + '<div class="empty"><b>Visits can be recorded while the plan is active</b>' + e(p.name) + '\'s plan is ' + e(p.status) + '.</div>'); return; }
        function unit(name, label, u, attrs) {
          return '<label class="field"><span>' + label + '</span><div class="unit"><input class="in" name="' + name + '" inputmode="decimal" autocomplete="off" ' + (attrs || '') + '><em>' + u + '</em></div><em class="err" data-err="' + name + '"></em></label>';
        }
        var obsField = function (k) {
          var o = f.obs[k];
          if (o.options) {
            return '<div class="field"><span>' + e(o.label) + '</span><div class="seg wrap">' + Object.keys(o.options).map(function (v) {
              return '<label><input type="' + (o.multi ? 'checkbox' : 'radio') + '" name="obs.' + k + '" value="' + e(v) + '"><span>' + e(o.options[v]) + '</span></label>';
            }).join('') + '</div><em class="err" data-err="obs.' + k + '"></em></div>';
          }
          var attrs = o.number ? 'inputmode="decimal" placeholder="' + o.number[0] + '–' + o.number[1] + '"' : o.time ? 'type="time"' : 'maxlength="' + o.text + '"';
          return '<label class="field"><span>' + e(o.label) + '</span><input class="in" name="obs.' + k + '" ' + attrs + '><em class="err" data-err="obs.' + k + '"></em></label>';
        };
        fill(personBar(p, people) +
          '<div class="head"><div><h1>Visit for ' + e(p.name) + '</h1><p class="sub">Fill in only what you checked. The family and office see these readings and your note.</p></div></div>' +
          '<div class="visit"><form data-form="visit" data-id="' + e(p.id) + '" novalidate><div class="alert bad" data-msg hidden></div>' +
            '<fieldset class="vgroup"><legend>Blood pressure</legend><div class="field"><div class="bp"><input class="in" name="systolic" inputmode="numeric" aria-label="Top number (systolic)"><b>/</b><input class="in" name="diastolic" inputmode="numeric" aria-label="Bottom number (diastolic)"><span class="muted">mmHg</span></div>' +
            '<em class="err" data-err="systolic"></em><em class="err" data-err="diastolic"></em></div></fieldset>' +
            '<fieldset class="vgroup"><legend>Pulse oximeter</legend><div class="row2">' + unit('hr', 'Heart rate', 'bpm') + unit('spo2', 'Oxygen (SpO2)', '%') + unit('pi', 'Perfusion index (PI)', '') + '</div></fieldset>' +
            '<fieldset class="vgroup"><legend>Blood sugar</legend>' + unit('glucose', 'Reading', 'mg/dL') +
              '<div class="field"><span>Measured</span><div class="seg">' + Object.keys(GLUCOSE).map(function (k) { return '<label><input type="radio" name="glucoseContext" value="' + k + '"><span>' + GLUCOSE[k] + '</span></label>'; }).join('') + '</div><em class="err" data-err="glucoseContext"></em></div></fieldset>' +
            '<fieldset class="vgroup"><legend>Temperature</legend><div class="row2">' + unit('temp', 'Body temperature', '°C') + '<span></span></div></fieldset>' +
            '<details class="vgroup"><summary>Weight, height and cholesterol</summary><div class="row2" style="margin-top:12px">' +
              unit('weight', 'Weight', 'kg') + unit('height', 'Height', 'cm', 'placeholder="Once a year"') + unit('chol', 'Total cholesterol', 'mg/dL') + '</div></details>' +
            '<details class="vgroup"><summary>Body composition (smart scale)</summary><div class="row2" style="margin-top:12px">' + f.body.map(function (b) { return unit(b.k, b.label, b.unit); }).join('') + '</div></details>' +
            f.groups.map(function (g) { return '<details class="vgroup"><summary>' + e(g[0]) + '</summary><div style="margin-top:12px">' + g[1].map(obsField).join('') + '</div></details>'; }).join('') +
            '<label class="field"><span>Note for the family</span><textarea class="in" name="note" maxlength="1000" placeholder="How was ' + e(first(p.name)) + ' today? Meals, mood, walking, medicines..."></textarea><em class="err" data-err="note"></em></label>' +
            '<details style="margin-bottom:10px"><summary class="link" style="text-decoration:none">The visit was earlier</summary><div class="row2" style="margin-top:10px">' +
              '<label class="field"><span>Date</span><input class="in" type="date" name="date" max="' + todayIST() + '" value="' + todayIST() + '"></label>' +
              '<label class="field"><span>Time</span><input class="in" type="time" name="time" value="' + nowHM() + '"></label></div><em class="err" data-err="when"></em></details>' +
            '<div class="savebar"><button class="btn" type="submit">' + icon('check') + 'Save visit</button></div>' +
          '</form>' +
          '<aside class="stack"><section class="panel"><h2>' + (S.me.user.role === 'admin' ? 'Recent readings' : 'Your readings today') + '</h2>' + recentHtml(rec.rows || []) + '</section></aside></div>');
      });
    });
  }
  function recentHtml(rows) {
    if (!rows.length) return '<p class="muted">None yet.</p>';
    return '<ul class="rlist">' + rows.slice(0, 12).map(function (r) {
      var m = METRICS[r.metric] || { label: r.metric, unit: '' };
      var v = r.metric === 'bp' ? r.systolic + '/' + r.diastolic : r.value;
      return '<li><span><b>' + e(m.label) + '</b> ' + e(v) + ' ' + e(m.unit) + '<br><span class="muted small">' + e(dt(r.at)) + '</span></span>' +
        (r.mine ? '<button class="btn sm ghost" data-act="remove-reading" data-id="' + e(r.id) + '" data-label="' + e(m.label + ' ' + v + ' ' + m.unit) + '">Remove</button>' : '') + '</li>';
    }).join('') + '</ul>';
  }

  // ================================================================ risk checks (care team)
  function assessView(r) {
    withPerson(r, 'assess', function (p, people) {
      api('GET', 'risk/forms?person=' + encodeURIComponent(p.id)).then(function (d) {
        if (!d.ok) return pageError(d);
        S.cache.riskForms = d;
        var t = d.forms.filter(function (x) { return x.id === r.q.test; })[0];
        if (!t) {
          var groups = {};
          d.forms.forEach(function (x) { if (x.women && d.prefill.sex === 'male') return; (groups[x.groupName] = groups[x.groupName] || []).push(x); });
          fill(personBar(p, people) + '<div class="head"><div><h1>Risk checks for ' + e(p.name) + '</h1><p class="sub">Choose a check, enter the result, and the score is worked out with the KareIQ formulas. The family sees it on their dashboard.</p></div></div>' +
            (!d.prefill.sex || !d.prefill.age ? profileForm(p, d.prefill) : '') +
            '<div class="cards3">' + Object.keys(groups).map(function (g) {
              return groups[g].map(function (x) {
                return '<a class="bcard link-card" href="#/assess?p=' + e(p.id) + '&test=' + x.id + '"><span class="kind">' + e(g) + ' · ' + ({ lab: 'Blood test', questionnaire: 'Questionnaire', home: 'Home test' }[x.kind]) + '</span><h3>' + e(x.title) + '</h3><p class="muted small">' + e(x.help) + '</p><span class="arrowlink">Enter result' + icon('arrow') + '</span></a>';
              }).join('');
            }).join('') + '</div>' + '<p class="note">' + icon('shield') + '<span>Not included yet: the COPD / asthma score. The KareIQ sheet notes its formula still needs to be checked.</span></p>');
          return;
        }
        var input = function (f) {
          var v = f.prefill ? d.prefill[f.prefill] : f.default;
          if (f.type === 'number') return '<label class="field"><span>' + e(f.label) + (f.optional ? ' (if applicable)' : '') + '</span><div class="unit"><input class="in" name="' + f.k + '" inputmode="decimal" value="' + (v != null ? e(v) : '') + '" placeholder="' + f.min + '–' + f.max + '">' + (f.unit ? '<em>' + e(f.unit) + '</em>' : '') + '</div><em class="err" data-err="' + f.k + '"></em></label>';
          var opts = f.type === 'yesno' ? { yes: 'Yes', no: 'No' } : f.type === 'sex' ? { female: 'Female', male: 'Male' } : f.options;
          return '<div class="field"><span>' + e(f.label) + '</span><div class="seg wrap">' + Object.keys(opts).map(function (k) { return '<label><input type="radio" name="' + f.k + '" value="' + e(k) + '"' + (String(v) === k ? ' checked' : '') + '><span>' + e(opts[k]) + '</span></label>'; }).join('') + '</div><em class="err" data-err="' + f.k + '"></em></div>';
        };
        fill(personBar(p, people) + '<div class="head"><div><h1>' + e(t.title) + '</h1><p class="sub">' + e(t.help) + '</p></div><a class="btn ghost" href="#/assess?p=' + e(p.id) + '">All checks</a></div>' +
          '<div class="visit"><form data-form="risk" data-id="' + e(p.id) + '" data-test="' + t.id + '" novalidate><div class="alert bad" data-msg hidden></div>' +
            t.inputs.map(input).join('') + field('date', 'Date of the test', 'type="date" value="' + todayIST() + '" max="' + todayIST() + '"') +
            '<div class="savebar"><button class="btn" type="submit">' + icon('check') + 'Work out and save</button></div></form>' +
          '<aside class="stack"><section class="panel" id="riskres"><h2>Result</h2><p class="muted">The score appears here after you save.</p></section></aside></div>');
      });
    });
  }
  function profileForm(p, pre) {
    return '<section class="panel" style="margin-bottom:18px"><h2>About ' + e(first(p.name)) + '</h2><p class="muted small" style="margin-bottom:12px">Several scores need sex and age. Saved once for all checks.</p>' +
      '<form data-form="profile2" data-id="' + e(p.id) + '" novalidate><div class="alert bad" data-msg hidden></div><div class="row2"><div class="field"><span>Sex</span><div class="seg"><label><input type="radio" name="sex" value="female"' + (pre.sex === 'female' ? ' checked' : '') + '><span>Female</span></label><label><input type="radio" name="sex" value="male"' + (pre.sex === 'male' ? ' checked' : '') + '><span>Male</span></label></div></div>' +
      field('birthYear', 'Year of birth', 'inputmode="numeric" placeholder="e.g. 1950" value="' + (pre.age ? new Date().getFullYear() - pre.age : '') + '"') + '</div><button class="btn sm" type="submit">Save</button></form></section>';
  }

  // ================================================================ asking the team (families)
  function askDialog(kind) {
    var people = S.people || [];
    var pid = S.pid;
    var titles = { question: 'Ask the care team', plan: 'Change or renew the package', visit: 'Book an extra visit' };
    var p = people.filter(function (x) { return x.id === pid; })[0] || people[0];
    if (!p) return;
    openDialog(titles[kind] || 'New request',
      '<form data-form="ask" data-kind="' + kind + '" novalidate><div class="alert bad" data-msg hidden></div>' +
      (people.length > 1 ? '<label class="field"><span>For</span><select class="in" name="personId">' + people.map(function (x) { return '<option value="' + e(x.id) + '"' + (x.id === p.id ? ' selected' : '') + '>' + e(x.name) + '</option>'; }).join('') + '</select></label>' : '<input type="hidden" name="personId" value="' + e(p.id) + '">') +
      '<label class="field"><span>' + (kind === 'plan' ? 'What would you like to change? (upgrade, renew, pause, add a package...)' : 'Your question') + '</span><textarea class="in" name="message" maxlength="1000"></textarea><em class="err" data-err="message"></em></label>' +
      '<p class="muted small">Our team will call or WhatsApp you on ' + e(phoneNice(S.me.user.phone) || 'your number') + '.</p></form>',
      '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Send request</button>');
  }


  // ---------------------------------------------------------------- choosing a plan (families)
  function plansView(r) {
    var u = S.me.user;
    if (u.role !== 'family') return go('#/', true);
    setBrand('kareiq');
    var mine = S.me.products, first = !mine.length;
    var back = '#/';
    root.innerHTML = '<header class="bar"><div class="bar-in"><a class="logo" href="' + back + '"><img src="/img/kareiq-logo.png" alt="KareIQ"></a><span class="sp"></span>' + meMenu() + '</div></header>' +
      '<main class="page plans-page"><div class="head" style="justify-content:center;text-align:center"><div><h1>' + (first ? 'Welcome, ' + e(first_(u.name)) + '. What would you like to set up?' : 'Add a plan') + '</h1>' +
      '<p class="sub" style="justify-content:center">Choose where your loved one will be cared for. Our team calls you to confirm the details and payment before anything starts.</p></div></div>' +
      '<div class="tiles">' + ['karehome', 'karenest'].map(function (id) {
        var b = BRANDS[id], has = mine.filter(function (x) { return x.id === id; })[0];
        return '<button class="tile ' + id + '" data-act="choose-plan" data-id="' + id + '"><img class="bg" src="' + b.photo + '" alt="">' +
          '<span class="mark">' + (b.logo ? '<img src="' + b.logo + '" alt="' + e(b.name) + '">' : '<img src="' + b.mark + '" alt="">' + e(b.name)) + '</span>' +
          (has ? '<span class="state incl">' + (has.includedWith ? 'Included with ' + e(has.includedWith) : 'You have this') + '</span>' : '') +
          '<span class="tbody"><span class="tname">' + e(b.name) + '</span><br><span class="ttag">' + e(id === 'karehome' ? 'Caregivers and nurses visit at home' : 'A caring community to live in. Includes Kare@Home') + '</span>' +
          '<span class="who"><span>Choose a plan</span></span></span></button>';
      }).join('') + '</div>' +
      '<div class="picker-foot"><button class="btn ghost" data-act="claim">Already booked on our website? Add your booking</button></div>' +
      '<div class="picker-foot"><span class="muted">Not sure which is right? <a href="' + waLink('Hello, I would like help choosing between Kare@Home and KareNest.') + '" target="_blank" rel="noopener">WhatsApp us</a> or call <a href="tel:+918129345178">' + PHONE + '</a>.</span></div></main>';
    // coming from a package on the website: open that package's request form once
    if (r && r.q && BRANDS[r.q.brand] && S.autoPlan !== location.hash) { S.autoPlan = location.hash; planDialog(r.q.brand, r.q.plan, r.q.months); }
  }
  function first_(n) { return first(n); }
  // ---------------------------------------------------------------- package prices and details
  var PERIOD_NAMES = { 1: 'Monthly', 3: 'Quarterly', 6: 'Half-yearly', 12: 'Yearly' };
  function rs(n) { return '₹' + Number(n).toLocaleString('en-IN'); }
  function hasDuration(pk) { return pk && (pk.model === 'tiers' || pk.model === 'monthly'); }
  function defaultMonths(pk, want) { return ['1', '3', '6', '12'].indexOf(String(want)) > -1 ? String(want) : (pk.model === 'tiers' ? '12' : '1'); }
  // price for one package and payment plan, as shown on cards and in the buying dialog
  function priceHtml(pk, months) {
    if (!pk) return '';
    if (hasDuration(pk)) {
      var m = defaultMonths(pk, months), pr = pk.prices[m];
      return '<div class="pr"><b>' + rs(pr.perMonth) + '</b><span>/ month</span></div>' +
        '<div class="pr-sub">' + (m === '1' ? 'Billed monthly' : rs(pr.total) + ' billed for ' + m + ' months') + (pr.saving ? ' · <b class="save">save ' + pr.saving + '%</b>' : '') + '</div>';
    }
    if (pk.model === 'fixed') return '<div class="pr"><b>' + rs(pk.price) + '</b><span>' + e(pk.length) + '</span></div>';
    return '<div class="pr"><b class="quote">Price on call</b></div>';
  }
  function durationSelect(pk, months, id) {
    if (!hasDuration(pk)) return '';
    var m = defaultMonths(pk, months);
    return '<label class="dur"><span>Payment plan</span><select class="in" name="months" data-act="dur" data-id="' + e(id || pk.id) + '">' + ['1', '3', '6', '12'].map(function (x) {
      return '<option value="' + x + '"' + (x === m ? ' selected' : '') + '>' + PERIOD_NAMES[x] + (x === '1' ? '' : ' (' + x + ' months)') + (pk.prices[x].saving ? ', save ' + pk.prices[x].saving + '%' : '') + '</option>';
    }).join('') + '</select></label>';
  }
  function includesHtml(pk) {
    if (!pk) return '';
    return (pk.tagline ? '<p class="pk-tag">' + e(pk.tagline) + '</p>' : '') + (pk.desc ? '<p class="muted small" style="margin-bottom:10px">' + e(pk.desc) + '</p>' : '') +
      (pk.includes && pk.includes.length ? '<h3 class="pk-h">' + e(pk.listTitle || "What's included") + '</h3><ul class="inc">' + pk.includes.map(function (x) { return '<li>' + icon('check') + '<span>' + e(x) + '</span></li>'; }).join('') + '</ul>' : '') +
      (pk.best ? '<p class="pk-best"><b>Best for:</b> ' + e(pk.best) + '</p>' : '') +
      (pk.notes && pk.notes.length ? pk.notes.map(function (n) { return '<p class="muted small" style="margin-top:8px">' + e(n) + '</p>'; }).join('') : '');
  }
  function priceTable(pk) {
    if (!hasDuration(pk)) return '';
    return '<h3 class="pk-h">Payment plans</h3><div class="tw"><table class="ptab"><thead><tr><th>Plan</th><th>Per month</th><th>Billed</th><th>Saving</th></tr></thead><tbody>' + ['1', '3', '6', '12'].map(function (m) {
      var pr = pk.prices[m]; return '<tr><td>' + PERIOD_NAMES[m] + '</td><td>' + rs(pr.perMonth) + '</td><td>' + rs(pr.total) + (m === '1' ? '' : ' for ' + m + ' months') + '</td><td>' + (pr.saving ? pr.saving + '%' : '–') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }

  function planDialog(brand, chosen, months) {
    var b = BRANDS[brand];
    var load = S.cache.planOpts ? Promise.resolve(S.cache.planOpts) : api('GET', 'plans/options').then(function (d) { S.cache.planOpts = d; return d; });
    load.then(function (d) {
      if (!d.ok) return toast(d.message);
      var prod = d.products.filter(function (x) { return x.id === brand; })[0];
      var people = d.people || [];
      var pre = S.pid && people.some(function (x) { return x.id === S.pid; }) ? S.pid : null;
      var who = people.length
        ? '<label class="field"><span>Who is it for?</span><select class="in" name="personId" data-act="who">' + people.map(function (x) { return '<option value="' + e(x.id) + '"' + (x.id === pre ? ' selected' : '') + '>' + e(x.name) + (x.relation ? ' (' + e(x.relation) + ')' : '') + '</option>'; }).join('') + '<option value="">Someone else</option></select></label><div data-new hidden>'
        : '<div data-new>';
      who += '<div class="row2">' + field('personName', people.length ? 'Their name' : 'Who is it for?', 'placeholder="e.g. Lakshmi Nair"') + field('relation', 'They are your', 'placeholder="e.g. Mother" list="rels2"') + '</div><datalist id="rels2"><option>Mother<option>Father<option>Grandmother<option>Grandfather<option>Spouse<option>Myself</datalist></div>';
      var first = chosen && prod.plans.some(function (pl) { return pl.id === chosen; }) ? chosen : prod.plans[0].id;
      S.cache.dlgPlans = prod.plans; S.cache.dlgMonths = months;
      openDialog(b.name + ' packages',
        '<form data-form="plan-request" data-brand="' + brand + '" novalidate><div class="alert bad" data-msg hidden></div>' +
        '<label class="field"><span>Package</span><select class="in" name="planId" data-act="plan-pick">' + prod.plans.map(function (pl) {
          return '<option value="' + e(pl.id) + '"' + (pl.id === first ? ' selected' : '') + '>' + e(pl.name) + (pl.price ? ' · ' + e(pl.price) : '') + '</option>';
        }).join('') + '<option value="undecided">Not sure yet: help me choose</option></select><em class="err" data-err="planId"></em></label>' +
        '<div class="pk-box" data-pkbox></div>' +
        who +
        (S.me.user.phone ? '' : field('phone', 'Your mobile number', 'type="tel" inputmode="tel" autocomplete="tel" placeholder="98765 43210" required', 'Our team will call you on this number.')) +
        '<div class="row2">' + field('startDate', 'Would like to start (optional)', 'type="date" min="' + todayIST() + '"') + '<span></span></div>' +
        '<label class="field"><span>Anything we should know? (optional)</span><textarea class="in" name="note" maxlength="1000" placeholder="Health needs, mobility, preferred times..."></textarea></label>' +
        '<p class="muted small">Nothing is charged now. The ' + e(b.name) + ' team will call you' + (S.me.user.phone ? ' on ' + e(phoneNice(S.me.user.phone)) : '') + ' to confirm the package, payment plan and start date.</p></form>',
        '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Send to the ' + e(b.name) + ' team</button>');
      fillPkgBox(first, months);
      var sel = $('dialog[open] [name=personId]'); if (sel) $('[data-new]', sel.closest('form')).hidden = Boolean(sel.value);
    });
  }
  function fillPkgBox(id, months) {
    var box = $('dialog[open] [data-pkbox]'); if (!box) return;
    var pk = (S.cache.dlgPlans || []).filter(function (x) { return x.id === id; })[0];
    if (!pk) { box.innerHTML = '<p class="muted">Our team will help you choose the right package when they call.</p>'; return; }
    box.innerHTML = '<div class="pk-head"><div><b class="pk-name">' + e(pk.name) + '</b>' + (pk.type ? '<span class="tagb">' + e(pk.type) + '</span>' : '') + '</div><div class="pk-price" data-pkprice>' + priceHtml(pk, months) + '</div></div>' +
      durationSelect(pk, months) + '<details class="pk-more" open><summary>Everything included</summary>' + includesHtml(pk) + priceTable(pk) + '</details>';
  }
  function claimDialog() {
    openDialog('Add your website booking',
      '<form data-form="claim" novalidate><div class="alert bad" data-msg hidden></div>' +
      '<p class="muted" style="margin-bottom:14px">Use the reference from your booking confirmation. It must be a booking made with your number ' + e(phoneNice(S.me.user.phone)) + '.</p>' +
      field('reference', 'Booking reference', 'autocapitalize="characters" placeholder="KH-7F3K2Q"') +
      '<div class="row2">' + field('personName', 'Who is the care for?', 'placeholder="e.g. Lakshmi Nair"') + field('relation', 'They are your', 'placeholder="e.g. Mother"') + '</div></form>',
      '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Add booking</button>');
  }

  // ---------------------------------------------------------------- account
  function accountView() {
    var u = S.me.user;
    shell('account', '<div class="head"><div><h1>Your account</h1><p class="sub">' + e(u.roleName) + ', signs in with ' + e([phoneNice(u.phone), u.email].filter(Boolean).join(' or ')) + '</p></div></div>' +
      '<div style="max-width:760px"><section class="panel"><h2>Your details</h2><form data-form="profile" novalidate><div class="alert bad" data-msg hidden></div>' +
        field('name', 'Name', 'value="' + e(u.name) + '" autocomplete="name"') + field('email', 'Email', 'type="email" value="' + e(u.email || '') + '" autocomplete="email"', 'Your mobile number ' + e(phoneNice(u.phone) || '') + ' can be changed by our team.') +
        '<button class="btn" type="submit">Save details</button></form></section>' +
      '<section class="panel"><h2>Change password</h2><form data-form="password" novalidate><div class="alert bad" data-msg hidden></div>' +
        pwField('current', 'Current password') + pwField('next', 'New password', 'At least 8 characters.', 'new-password') +
        '<button class="btn" type="submit">Change password</button></form></section>' +
      '<section class="panel"><h2>Sign out</h2><p class="muted" style="margin-bottom:12px">For your family\'s privacy you are signed out automatically after 15 minutes without activity.</p><button class="btn ghost" data-act="signout">' + icon('out') + 'Sign out</button></section></div>');
  }

  // ================================================================ office (admin)
  function adminShell(tab, inner, title, sub, withFilter) {
    shell(tab === 'today' ? 'admin' : 'admin/' + tab, '<div class="head"><div><h1>' + e(title) + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (withFilter ? brandFilter() : '') + '</div><div id="adm">' + inner + '</div>');
  }
  function brandFilter() {
    return '<div class="brandfilter" role="group" aria-label="Show">' +
      [['all', 'Both', ''], ['karehome', 'Kare@Home', '/img/karehome-emblem.png'], ['karenest', 'KareNest', '/karenest/images/mark.webp']].map(function (f) {
        return '<button class="' + f[0] + '" data-act="filter" data-k="' + f[0] + '" aria-pressed="' + (S.filter === f[0]) + '">' + (f[2] ? '<img src="' + f[2] + '" alt="">' : '') + f[1] + '</button>';
      }).join('') + '</div>';
  }
  function needCatalog() {
    if (S.catalog) return Promise.resolve(S.catalog);
    return api('GET', 'admin/catalog').then(function (d) { S.catalog = d; return d; });
  }
  function fq() { return S.filter === 'all' ? '' : '?product=' + S.filter; }

  function adminView(tab) {
    if (tab === 'today') return adminToday();
    if (tab === 'people') return adminPeople();
    if (tab === 'logins') return adminLogins();
    if (tab === 'activity') return adminActivity();
    go('#/admin', true);
  }

  function adminToday() {
    adminShell('today', '<div class="skel" style="height:150px;margin-bottom:18px"></div><div class="skel" style="height:300px"></div>', 'Requests and bookings', 'New bookings and requests from both websites and from families in the app.', true);
    Promise.all([api('GET', 'admin/overview'), api('GET', 'admin/requests' + fq()), needCatalog()]).then(function (res) {
      var ov = res[0], rq = res[1];
      if (!ov.ok) return pageError(ov);
      S.cache.requests = rq.rows;
      S.cache.newCount = rq.rows.filter(function (r) { return r.status === 'new'; }).length;
      var badge = $('.sb a[href="#/admin"] .count'), link = $('.sb a[href="#/admin"]');
      if (badge && !S.cache.newCount) badge.remove();
      else if (badge) badge.textContent = S.cache.newCount;
      else if (link && S.cache.newCount) link.insertAdjacentHTML('beforeend', '<b class="count">' + S.cache.newCount + '</b>');
      function stat(id) {
        var b = BRANDS[id], n = ov.per[id];
        return '<div class="bstat ' + id + '"><div class="bh">' + brandMark(id) + e(b.name) + '</div><div class="nums">' +
          '<span><b>' + n.active + '</b>active plans</span><span><b>' + n.pending + '</b>to confirm</span><span><b>' + n.newRequests + '</b>new requests</span></div></div>';
      }
      var stats = '<div class="stats">' + (S.filter !== 'karenest' ? stat('karehome') : '') + (S.filter !== 'karehome' ? stat('karenest') : '') +
        '<div class="bstat office"><div class="bh">' + icon('people').replace('<svg', '<svg width="30" height="30"') + 'People</div><div class="nums"><span><b>' + ov.families + '</b>family logins</span><span><b>' + ov.caregivers + '</b>caregivers</span><span><b>' + ov.waitingSetup + '</b>no password yet</span></div></div></div>';
      var open = rq.rows.filter(function (r) { return r.status === 'new' || r.status === 'contacted'; });
      var list = S.inbox === 'open' ? open : rq.rows;
      $('#adm').innerHTML = stats +
        '<div class="panel-h" style="margin-bottom:12px;justify-content:flex-start"><h2 style="margin-right:8px">Inbox</h2><div class="chips"><button data-act="inbox" data-k="open" aria-pressed="' + (S.inbox === 'open') + '">Needs action (' + open.length + ')</button><button data-act="inbox" data-k="all" aria-pressed="' + (S.inbox === 'all') + '">Everything</button></div>' +
        '<span style="flex:1"></span><button class="btn sm" data-act="activate">' + icon('plus') + 'Add a family</button></div>' +
        (list.length ? '<div class="inbox">' + list.map(reqHtml).join('') + '</div>' : '<div class="empty"><b>All caught up</b>New bookings from the websites and requests from families appear here.</div>');
    });
  }
  var KIND = { service: 'Service booking', 'plan-request': 'New plan (app)', booking: 'Website booking', enquiry: 'Website enquiry', visit: 'Extra visit', 'family-visit': 'Family visit', question: 'Question', plan: 'Plan change', 'signin-help': 'Sign-in help' };
  function reqHtml(r) {
    var b = r.product ? BRANDS[r.product] : null;
    var purchase = (r.type === 'booking' || r.kind === 'plan-request' || (r.type === 'enquiry' && r.source !== 'app')) && r.product;
    var act = '';
    if (r.kind === 'signin-help' && r.userId) act = '<button class="btn sm" data-act="relink" data-id="' + e(r.userId) + '">' + icon('key') + 'Send sign-in link</button>';
    else if (purchase && !r.appPlanId) act = '<button class="btn sm" data-act="activate" data-ref="' + e(r.reference) + '">' + icon('check') + 'Activate plan</button>';
    else if (purchase && r.appPlanId && r.status !== 'scheduled' && r.status !== 'closed') act = '<button class="btn sm" data-act="activate" data-ref="' + e(r.reference) + '">' + icon('check') + 'Activate plan</button>';
    if (r.personId) act += '<a class="btn sm ghost" href="#/dashboard?p=' + e(r.personId) + '">Open</a>';
    var meta = [r.reference, phoneNice(r.phone), r.area, ago(r.createdAt)].filter(Boolean).map(e).join(', ');
    return '<article class="req ' + (r.product || '') + '"><span class="stripe"></span><div>' +
      '<div class="rt"><b>' + e(r.name) + '</b>' + (b ? '<span class="tagb ' + r.product + '">' + e(b.name) + '</span>' : '<span class="tagb">KareIQ</span>') + '<span class="pill">' + e(KIND[r.kind] || r.kind) + '</span>' +
        (r.accountUserId && r.type === 'booking' ? '<span class="pill active"><i></i>Has an account</span>' : '') + '</div>' +
      '<div class="rm">' + e(r.title || '') + (r.personName ? ' for ' + e(r.personName) : '') + (r.careFor ? ' (' + e(r.careFor) + ')' : '') + (r.date ? ', from ' + e(date(r.date)) : '') + '</div>' +
      '<div class="rm small muted">' + meta + '</div>' + (r.message ? '<div class="rmsg">' + e(r.message) + '</div>' : '') + '</div>' +
      '<div class="rside"><select class="in" data-act="req-status" data-type="' + r.type + '" data-id="' + e(r.id) + '" aria-label="Status">' +
        [['new', 'New'], ['contacted', 'Contacted'], ['scheduled', 'Arranged'], ['closed', 'Done']].map(function (s) { return '<option value="' + s[0] + '"' + (r.status === s[0] ? ' selected' : '') + '>' + s[1] + '</option>'; }).join('') + '</select>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end">' + act +
        (r.phone ? '<a class="btn sm ghost" href="https://wa.me/' + e(r.phone.replace(/\D/g, '')) + '" target="_blank" rel="noopener" aria-label="WhatsApp ' + e(r.name) + '">' + icon('wa') + '</a><a class="btn sm ghost" href="tel:' + e(r.phone) + '" aria-label="Call ' + e(r.name) + '">' + icon('phone') + '</a>' : '') + '</div>' +
      '</div></article>';
  }

  function activateDialog(ref) {
    var r = ref ? (S.cache.requests || []).filter(function (x) { return x.reference === ref; })[0] : null;
    Promise.all([needCatalog(), api('GET', 'admin/users')]).then(function (res) {
      var cat = res[0], users = res[1].rows || [];
      var product = r && r.product ? r.product : (S.filter !== 'all' ? S.filter : 'karehome');
      var caregivers = users.filter(function (u) { return u.role === 'caregiver' && u.active; });
      var months = r && r.billing ? r.billing : '12';
      openDialog(r ? 'Activate plan for ' + r.name : 'Add a family',
        '<form data-form="activate" novalidate' + (r ? ' data-type="' + r.type + '" data-id="' + e(r.id) + '"' : '') + '><div class="alert bad" data-msg hidden></div>' +
        (r ? '<p class="muted" style="margin-bottom:14px">From ' + e(KIND[r.kind] || r.kind) + ' ' + e(r.reference) + '. ' + (r.accountUserId ? 'They already made an account, so the plan will show up the next time they open the app.' : 'We will make a family login and give you a welcome link to send them.') + '</p>' : '<p class="muted" style="margin-bottom:14px">For a family who booked by phone or walked in. We will make their login and give you a welcome link to send.</p>') +
        '<div class="field"><span>Brand</span><div class="seg">' + cat.products.map(function (p) { return '<label><input type="radio" name="product" value="' + p.id + '"' + (p.id === product ? ' checked' : '') + ' data-act="act-brand"><span>' + e(p.name) + '</span></label>'; }).join('') + '</div><em class="err" data-err="product"></em></div>' +
        '<div class="row2"><label class="field"><span>Plan</span><select class="in" name="planId">' + planOptions(cat, product, r && r.package) + '</select><em class="err" data-err="planId"></em></label>' +
        '<label class="field"><span>Runs for</span><select class="in" name="months">' + [['1', '1 month'], ['3', '3 months'], ['6', '6 months'], ['12', '12 months']].map(function (m) { return '<option value="' + m[0] + '"' + (m[0] === String(months) ? ' selected' : '') + '>' + m[1] + '</option>'; }).join('') + '</select></label></div>' +
        '<div class="row2">' + field('startDate', 'Starts on', 'type="date" value="' + e(r && r.date ? r.date : todayIST()) + '"') + '<label class="field"><span>Caregiver (optional)</span><select class="in" name="caregiverId"><option value="">Assign later</option>' + caregivers.map(function (c) { return '<option value="' + e(c.id) + '">' + e(c.name) + '</option>'; }).join('') + '</select></label></div>' +
        '<h3 style="margin:6px 0 10px">Person receiving care</h3><div class="row2">' + field('personName', 'Name', 'value="' + e(r && r.personName ? r.personName : (r && r.careFor === 'Myself' ? r.name : '')) + '" placeholder="e.g. Lakshmi Nair"') + field('relation', 'Relation to the family member', 'value="' + e(r && r.relation ? r.relation : '') + '" placeholder="e.g. Mother"') + '</div>' +
        '<h3 style="margin:6px 0 10px">Family member who signs in</h3>' + field('familyName', 'Name', 'value="' + e(r ? r.name : '') + '"') +
        '<div class="row2">' + field('familyPhone', 'Mobile number', 'type="tel" value="' + e(r && r.phone ? r.phone.replace(/^\+91/, '') : '') + '"') + field('familyEmail', 'Email (optional)', 'type="email" value="' + e(r && r.email ? r.email : '') + '"') + '</div>' +
        '</form>', '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Activate plan</button>');
    });
  }
  function planOptions(cat, product, selected) {
    var p = cat.products.filter(function (x) { return x.id === product; })[0];
    return p.plans.map(function (pl) { return '<option value="' + pl.id + '"' + (pl.id === selected ? ' selected' : '') + '>' + e(pl.name) + '</option>'; }).join('');
  }

  function linkResult(d, title) {
    var u = d.family || d.user;
    if (!d.link) {
      openDialog(title, '<div class="alert ok">' + e(d.person ? d.person.name + '\'s ' + d.plan.productName + ' plan is active.' : 'Done.') + '</div><p>' + e(first(u.name)) + ' already has a password. The plan appears the next time they open the app.</p>', '<button class="btn" data-act="close">Done</button>');
      return;
    }
    openDialog(title,
      (d.plan ? '<div class="alert ok">' + e(d.person.name + '\'s ' + d.plan.productName + ' plan is active.') + '</div>' : '') +
      '<p>Send ' + e(first(u.name)) + ' this welcome link. It lets them choose a password and works once, for 7 days.' + (d.emailed ? ' We have also emailed it to ' + e(u.email) + '.' : '') + '</p>' +
      '<div class="share"><div class="copybox"><input class="in" readonly value="' + e(d.link) + '" aria-label="Welcome link"><button class="btn ghost" data-act="copy" data-text="' + e(d.message) + '">Copy message</button></div>' +
      '<a class="btn wa block" href="' + e(d.whatsapp) + '" target="_blank" rel="noopener">' + icon('wa') + 'Send on WhatsApp' + (u.phone ? ' to ' + e(phoneNice(u.phone)) : '') + '</a></div>',
      '<button class="btn ghost" data-act="close">Done</button>');
  }

  function adminPeople() {
    adminShell('people', '<div class="skel" style="height:320px"></div>', 'People and plans', 'Everyone receiving care, their plans, family and caregivers.', true);
    Promise.all([api('GET', 'admin/people' + fq()), needCatalog(), api('GET', 'admin/users')]).then(function (res) {
      var d = res[0];
      if (!d.ok) return pageError(d);
      S.cache.people = d.rows; S.cache.users = res[2].rows;
      $('#adm').innerHTML = '<div class="toolbar"><input class="in" type="search" placeholder="Search by name or ID" data-act="search" aria-label="Search people"><span class="sp" style="flex:1"></span><button class="btn sm" data-act="activate">' + icon('plus') + 'Add a family</button></div>' +
        (d.rows.length ? '<section class="panel tw" style="padding:6px 14px"><table class="ptable stackable"><thead><tr><th>Person</th><th>Plans</th><th>Family</th><th>Caregivers</th><th></th></tr></thead><tbody>' +
        d.rows.map(function (x) {
          return '<tr data-search="' + e((x.name + ' ' + x.id).toLowerCase()) + '"><td data-l="Person"><b>' + e(x.name) + '</b><br><span class="muted small">' + e(x.id) + (x.active ? '' : ', archived') + '</span></td>' +
            '<td data-l="Plans">' + (x.plans.length ? x.plans.map(function (p) { return '<div style="margin-bottom:4px"><span class="tagb ' + p.product + '">' + e(p.productName) + '</span> ' + e(p.name) + ' ' + statusPill(p) + '</div>'; }).join('') : '<span class="muted">No plan</span>') + '</td>' +
            '<td data-l="Family"><div class="names">' + (x.family.map(function (f) { return '<span>' + e(f.name) + (f.relation ? ' <span class="muted small">(' + e(f.relation) + ')</span>' : '') + (f.hasPassword ? '' : ' <span class="pill pending">no password yet</span>') + '</span>'; }).join('') || '<span class="muted">None</span>') + '</div></td>' +
            '<td data-l="Caregivers"><div class="names">' + (x.caregivers.map(function (c) { return '<span>' + e(c.name) + '</span>'; }).join('') || '<span class="pill pending">Not assigned</span>') + '</div></td>' +
            '<td><button class="btn sm ghost" data-act="manage" data-id="' + e(x.id) + '">Manage</button></td></tr>';
        }).join('') + '</tbody></table></section>' : '<div class="empty"><b>No one here yet</b>Activate a plan from a website booking, or add a family yourself.</div>');
    });
  }

  function manageDialog(id) {
    var x = (S.cache.people || []).filter(function (p) { return p.id === id; })[0];
    if (!x) return;
    var cat = S.catalog, users = S.cache.users || [];
    var plans = x.plans.map(function (p) {
      return '<li><span><span class="tagb ' + p.product + '">' + e(p.productName) + '</span> <b>' + e(p.name) + '</b><br><span class="muted small">' + (p.startDate ? e(date(p.startDate)) + ' to ' + e(date(p.endDate)) : 'Not started') + (p.bookingRef ? ', booking ' + e(p.bookingRef) : '') + '</span></span>' +
        '<select class="in" style="width:auto;min-height:38px" data-act="plan-status" data-id="' + e(p.id) + '" aria-label="Plan status">' + Object.keys(cat.statuses).map(function (s) { return '<option value="' + s + '"' + (s === p.status ? ' selected' : '') + '>' + cat.statuses[s] + '</option>'; }).join('') + '</select></li>';
    }).join('');
    var fam = x.family.map(function (f) { return '<li><span>' + e(f.name) + (f.relation ? ' <span class="muted small">(' + e(f.relation) + ')</span>' : '') + '</span><span style="display:flex;gap:6px"><button class="btn sm ghost" data-act="relink" data-id="' + e(f.id) + '">Sign-in link</button><button class="btn sm ghost" data-act="unlink" data-id="' + e(f.linkId) + '">Remove</button></span></li>'; }).join('');
    var cgs = x.caregivers.map(function (c) { return '<li><span>' + e(c.name) + '</span><button class="btn sm ghost" data-act="unlink" data-id="' + e(c.linkId) + '">Remove</button></li>'; }).join('');
    var freeCg = users.filter(function (u) { return u.role === 'caregiver' && u.active && !x.caregivers.some(function (c) { return c.id === u.id; }); });
    var freeFam = users.filter(function (u) { return u.role === 'family' && u.active && !x.family.some(function (c) { return c.id === u.id; }); });
    var open = x.plans.filter(function (p) { return p.status !== 'ended'; })[0];
    openDialog(x.name,
      '<p class="muted" style="margin-bottom:14px">' + e(x.id) + (open ? ' <a href="#/dashboard?p=' + e(x.id) + '" data-act="close-go">Open their dashboard</a>' : '') + '</p>' +
      '<h3>Plans</h3><ul class="rlist">' + (plans || '<li class="muted">No plans</li>') + '</ul>' +
      '<details style="margin:6px 0 16px"><summary class="link" style="text-decoration:none">Add another plan</summary><form data-form="addplan" data-id="' + e(x.id) + '" style="margin-top:12px"><div class="row2">' +
        '<label class="field"><span>Brand</span><select class="in" name="product" data-act="addplan-brand">' + cat.products.map(function (p) { return '<option value="' + p.id + '">' + e(p.name) + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span>Plan</span><select class="in" name="planId">' + planOptions(cat, 'karehome') + '</select></label>' +
        '<label class="field"><span>Starts on</span><input class="in" type="date" name="startDate" value="' + todayIST() + '"></label>' +
        '<label class="field"><span>Runs for</span><select class="in" name="months"><option value="1">1 month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12" selected>12 months</option></select></label></div>' +
        '<button class="btn sm" type="submit">Add plan</button></form></details>' +
      '<h3>Family who can see ' + e(first(x.name)) + '</h3><ul class="rlist">' + (fam || '<li class="muted">No one yet</li>') + '</ul>' +
      (freeFam.length ? '<form data-form="give" data-id="' + e(x.id) + '" class="toolbar" style="margin:8px 0 16px"><select class="in" name="userId" aria-label="Family login">' + freeFam.map(function (u) { return '<option value="' + e(u.id) + '">' + e(u.name) + '</option>'; }).join('') + '</select><input class="in" name="relation" placeholder="Relation, e.g. Son" aria-label="Relation" style="max-width:180px"><button class="btn sm" type="submit">Give access</button></form>' : '') +
      '<h3 style="margin-top:12px">Caregivers</h3><ul class="rlist">' + (cgs || '<li class="muted">No one assigned</li>') + '</ul>' +
      (freeCg.length ? '<form data-form="give" data-id="' + e(x.id) + '" class="toolbar" style="margin-top:8px"><select class="in" name="userId" aria-label="Caregiver">' + freeCg.map(function (u) { return '<option value="' + e(u.id) + '">' + e(u.name) + '</option>'; }).join('') + '</select><button class="btn sm" type="submit">Assign caregiver</button></form>' : '<p class="muted small">Add caregiver logins under Logins.</p>'),
      '<button class="btn" data-act="close">Done</button>');
  }

  function adminLogins() {
    adminShell('logins', '<div class="skel" style="height:320px"></div>', 'Logins', 'Families, caregivers and office staff who can sign in.', false);
    api('GET', 'admin/users').then(function (d) {
      if (!d.ok) return pageError(d);
      S.cache.users = d.rows;
      var role = S.cache.roleFilter || 'all';
      var rows = d.rows.filter(function (u) { return role === 'all' || u.role === role; });
      $('#adm').innerHTML = '<div class="toolbar"><div class="chips">' + [['all', 'Everyone'], ['family', 'Families'], ['caregiver', 'Caregivers'], ['admin', 'Office']].map(function (r) { return '<button data-act="role" data-k="' + r[0] + '" aria-pressed="' + (role === r[0]) + '">' + r[1] + '</button>'; }).join('') + '</div>' +
        '<input class="in" type="search" placeholder="Search" data-act="search" aria-label="Search logins"><span style="flex:1"></span><button class="btn sm" data-act="add-user">' + icon('plus') + 'Add a caregiver or staff login</button></div>' +
        '<section class="panel tw" style="padding:6px 14px"><table class="stackable"><thead><tr><th>Name</th><th>Role</th><th>Signs in with</th><th>Status</th><th>Last signed in</th><th></th></tr></thead><tbody>' +
        rows.map(function (u) {
          var st = !u.active ? '<span class="pill ended">Turned off</span>' : !u.hasPassword ? '<span class="pill pending">Waiting for password</span>' : '<span class="pill active"><i></i>Active</span>';
          return '<tr data-search="' + e((u.name + ' ' + (u.email || '') + ' ' + (u.phone || '')).toLowerCase()) + '"><td><b>' + e(u.name) + '</b>' + (u.role !== 'admin' ? '<br><span class="muted small">' + u.people + ' ' + (u.people === 1 ? 'person' : 'people') + '</span>' : '') + '</td><td data-l="Role">' + e(u.roleName) + '</td>' +
            '<td data-l="Signs in with">' + e(phoneNice(u.phone) || '') + (u.phone && u.email ? '<br>' : '') + e(u.email || '') + '</td><td data-l="Status">' + st + '</td><td data-l="Last signed in">' + (u.lastLoginAt ? e(ago(u.lastLoginAt)) : '<span class="muted">Never</span>') + '</td>' +
            '<td style="white-space:nowrap"><button class="btn sm ghost" data-act="relink" data-id="' + e(u.id) + '">' + (u.hasPassword ? 'Reset link' : 'Welcome link') + '</button> ' +
            (u.id !== S.me.user.id ? '<button class="btn sm ghost" data-act="toggle-user" data-id="' + e(u.id) + '" data-on="' + (!u.active) + '">' + (u.active ? 'Turn off' : 'Turn on') + '</button>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></section>';
    });
  }
  function addUserDialog() {
    openDialog('Add a login', '<form data-form="add-user" novalidate><div class="alert bad" data-msg hidden></div>' +
      '<div class="field"><span>Role</span><div class="seg"><label><input type="radio" name="role" value="caregiver" checked><span>Caregiver</span></label><label><input type="radio" name="role" value="admin"><span>Office admin</span></label><label><input type="radio" name="role" value="family"><span>Family</span></label></div><em class="err" data-err="role"></em></div>' +
      field('name', 'Name', 'autocomplete="off"') + '<div class="row2">' + field('phone', 'Mobile number', 'type="tel"') + field('email', 'Email (optional)', 'type="email"') + '</div>' +
      '<p class="muted small">They sign in with the mobile number or email. You will get a welcome link to send them.</p></form>',
      '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Add login</button>');
  }

  function adminActivity() {
    adminShell('activity', '<div class="skel" style="height:320px"></div>', 'Activity', 'Who did what, newest first. Kept for safety and audits.', false);
    api('GET', 'admin/activity').then(function (d) {
      if (!d.ok) return pageError(d);
      $('#adm').innerHTML = '<section class="panel tw" style="padding:6px 14px"><table><thead><tr><th>When</th><th>Who</th><th>What</th><th>Person</th></tr></thead><tbody>' +
        d.rows.map(function (r) {
          var extra = r.detail && r.detail.product ? ' (' + (BRANDS[r.detail.product] ? BRANDS[r.detail.product].name : r.detail.product) + ')' : '';
          if (r.detail && r.detail.reason) extra += ': ' + r.detail.reason;
          return '<tr><td>' + e(dt(r.at)) + '</td><td>' + e(r.who) + '</td><td>' + e((ACTIONS[r.action] || r.action) + extra) + '</td><td>' + e(r.person || '') + '</td></tr>';
        }).join('') + '</tbody></table></section>';
    });
  }

  // ================================================================ dialogs
  function openDialog(title, body, foot) {
    closeDialog();
    var d = document.createElement('dialog');
    d.innerHTML = '<div class="dlg-h"><h2>' + e(title) + '</h2><button class="dlg-x" data-act="close" aria-label="Close">×</button></div><div class="dlg-b">' + body + '</div>' + (foot ? '<div class="dlg-f">' + foot + '</div>' : '');
    document.body.appendChild(d);
    d.addEventListener('close', function () { d.remove(); if (S.cache.dirty && !$('dialog[open]')) { S.cache.dirty = false; refreshAdmin(); } });
    d.addEventListener('click', function (ev) { if (ev.target === d) d.close(); });
    d.showModal();
    var f = d.querySelector('input:not([type=hidden]):not([readonly]),select,textarea');
    if (f && window.innerWidth > 700) f.focus();
    return d;
  }
  function closeDialog() { var d = $('dialog[open]'); if (d) d.close(); }

  // ================================================================ forms
  function formData(form) {
    var o = {};
    $$('input,select,textarea', form).forEach(function (el) {
      if (!el.name) return;
      if ((el.type === 'radio' || el.type === 'checkbox') && !el.checked) return;
      o[el.name] = el.value.trim ? el.value.trim() : el.value;
    });
    return o;
  }
  function showErrors(form, d) {
    $$('.err', form).forEach(function (x) { x.textContent = ''; });
    $$('.in.bad', form).forEach(function (x) { x.classList.remove('bad'); x.removeAttribute('aria-invalid'); });
    var msg = $('[data-msg]', form);
    if (msg) { msg.hidden = !d.message; msg.textContent = d.message || ''; }
    var firstBad = null;
    Object.keys(d.errors || {}).forEach(function (k) {
      var slot = $('[data-err="' + k + '"]', form); if (slot) slot.textContent = d.errors[k];
      var inp = $('[name="' + k + '"]', form);
      if (inp && inp.classList.contains('in')) { inp.classList.add('bad'); inp.setAttribute('aria-invalid', 'true'); firstBad = firstBad || inp; }
    });
    if (firstBad) firstBad.focus(); else if (msg && !msg.hidden) msg.scrollIntoView({ block: 'nearest' });
  }
  function busy(form, on) {
    var b = $('button[type=submit]', form) || $('dialog[open] [data-act=submit-dialog]');
    if (b) { b.disabled = on; if (on) { b.dataset.label = b.innerHTML; b.textContent = 'Please wait…'; } else if (b.dataset.label) b.innerHTML = b.dataset.label; }
  }

  var FORMS = {
    signin: function (f, v) {
      return api('POST', 'login', { id: v.id, password: v.password }).then(function (d) {
        if (!d.ok) return d;
        return loadSession().then(function () { go('#/', true); });
      });
    },
    forgot: function (f, v) {
      return api('POST', 'forgot', { id: v.id }).then(function (d) {
        if (!d.ok) return d;
        S.flash = { kind: 'ok', text: d.message }; go('#/signin');
      });
    },
    link: function (f, v) {
      return api('POST', 'link', { token: f.getAttribute('data-token'), password: v.password }).then(function (d) {
        if (!d.ok) return d;
        return loadSession().then(function () { history.replaceState(null, '', '#/'); render(); toast('Password saved. Welcome to KareIQ.'); });
      });
    },
    'start-find': function (f, v) {
      return api('POST', 'start', { reference: v.reference, phone: v.phone, check: true }).then(function (d) {
        if (d.exists) { S.flash = { kind: 'info', text: d.message }; go('#/signin'); return; }
        if (!d.ok) return d;
        S.start = { found: d, phone: v.phone }; render();
      });
    },
    start: function (f, v) {
      var st = S.start;
      return api('POST', 'start', { reference: st.found.reference, phone: st.phone, name: v.name, email: v.email, personName: v.personName, relation: v.relation, password: v.password }).then(function (d) {
        if (!d.ok) return d;
        S.start = null;
        return loadSession().then(function () { history.replaceState(null, '', '#/'); render(); toast('Your account is ready.'); });
      });
    },
    join: function (f, v) {
      return api('POST', 'signup', v).then(function (d) {
        if (!d.ok) return d;
        var brand = f.getAttribute('data-brand');
        return loadSession().then(function () { history.replaceState(null, '', '#/plans'); render(); toast('Your account is ready.'); if (BRANDS[brand]) planDialog(brand); });
      });
    },
    'plan-request': function (f, v) {
      v.product = f.getAttribute('data-brand');
      if (v.personId) { delete v.personName; delete v.relation; }
      if (!$('[name=months]', f)) delete v.months;
      return api('POST', 'plans/request', v).then(function (d) {
        if (!d.ok) return d;
        S.cache.planOpts = null;
        closeDialog();
        S.people = null;
        return loadSession().then(function () { go('#/dashboard?p=' + encodeURIComponent(d.personId)); toast('Sent (' + d.reference + '). We will call you soon to confirm.'); });
      });
    },
    claim: function (f, v) {
      return api('POST', 'claim', v).then(function (d) {
        if (!d.ok) return d;
        S.cache.planOpts = null;
        closeDialog();
        S.people = null;
        return loadSession().then(function () { go('#/dashboard'); toast('Booking added to your account.'); });
      });
    },
    visit: function (f, v) {
      var id = f.getAttribute('data-id'), body = {}, obs = {};
      Object.keys(v).forEach(function (k) { if (k.indexOf('obs.') !== 0) body[k] = v[k]; });
      $$('[name^="obs."]', f).forEach(function (el) {
        var k = el.name.slice(4);
        if (el.type === 'checkbox') { if (el.checked) (obs[k] = obs[k] || []).push(el.value); }
        else if (el.type === 'radio') { if (el.checked) obs[k] = el.value; }
        else if (el.value.trim()) obs[k] = el.value.trim();
      });
      body.obs = obs;
      return api('POST', 'people/' + encodeURIComponent(id) + '/visits', body).then(function (d) {
        if (!d.ok) return d;
        toast('Visit saved. The family can see it now.');
        go(S.me.user.role === 'admin' ? '#/dashboard?p=' + encodeURIComponent(id) : '#/people');
      });
    },
    ask: function (f, v) {
      var p = (S.people || []).filter(function (x) { return x.id === v.personId; })[0];
      return api('POST', 'requests', { product: p ? p.product : 'karehome', kind: f.getAttribute('data-kind'), personId: v.personId, message: v.message }).then(function (d) {
        if (!d.ok) return d;
        closeDialog(); toast('Request sent (' + d.reference + '). We will be in touch soon.');
      });
    },
    book: function (f, v) {
      return api('POST', 'people/' + encodeURIComponent(S.pid) + '/services', { service: f.getAttribute('data-k'), date: v.date, time: v.time, note: v.note }).then(function (d) {
        if (!d.ok) return d;
        closeDialog(); toast('Booked (' + d.reference + ').' + (d.free ? ' This is a free session.' : '') + ' We will call you to confirm.'); render();
      });
    },
    range: function (f, v) {
      if (!v.from || !v.to || v.from > v.to) return Promise.resolve({ ok: false, message: 'Choose a start date before the end date.' });
      closeDialog(); go('#/dashboard?p=' + encodeURIComponent(S.pid) + '&from=' + v.from + '&to=' + v.to);
    },
    upload: function (f, v) {
      var input = $('[name=file]', f), file = input && input.files && input.files[0];
      if (!file) return Promise.resolve({ ok: false, errors: { file: 'Choose a file' } });
      if (file.size > 5 * 1024 * 1024) return Promise.resolve({ ok: false, errors: { file: 'This file is larger than 5 MB. Try a photo or a smaller PDF.' } });
      var name = v.name || file.name;
      return fetch('/api/app/people/' + encodeURIComponent(S.pid) + '/records', {
        method: 'POST', credentials: 'same-origin', body: file,
        headers: { 'Content-Type': 'application/octet-stream', 'X-Requested-With': 'kareiq', 'X-CSRF': S.csrf, 'X-File-Name': encodeURIComponent(name), 'X-Category': v.category, 'X-Date': v.date || '' }
      }).then(function (r) { return r.json().catch(function () { return { ok: false, message: 'The upload did not finish. Please try again.' }; }); }, function () { return { ok: false, message: 'Could not reach KareIQ. Check your internet connection.' }; })
        .then(function (d) { if (!d.ok) return d; closeDialog(); toast('Report uploaded.'); render(); });
    },
    risk: function (f, v) {
      var id = f.getAttribute('data-id'), date = v.date; delete v.date;
      return api('POST', 'people/' + encodeURIComponent(id) + '/risks', { test: f.getAttribute('data-test'), inputs: v, date: date }).then(function (d) {
        if (!d.ok) return d;
        var x = d.result, box = $('#riskres');
        if (box) box.innerHTML = '<h2>Result</h2><div class="risk ' + (x.level || 'none') + '" style="border:0;padding:0;box-shadow:none"><div class="rv">' + e(x.display) + '</div><div class="rb">' + dotHtml(x.level) + e(x.band) + '</div>' +
          (x.scale ? '<p class="muted small" style="margin-top:8px">' + e(x.scale) + '</p>' : '') + (x.note ? '<p class="small" style="margin-top:8px">' + e(x.note) + '</p>' : '') + '</div>' +
          '<p class="muted small" style="margin-top:12px">Saved. The family sees it on their dashboard.</p><a class="btn sm ghost" style="margin-top:12px" href="#/assess?p=' + e(id) + '">Do another check</a>';
        toast('Saved.');
        if (box && window.innerWidth < 980) box.scrollIntoView({ behavior: 'smooth', block: 'start' });
      });
    },
    'add-pkg': function (f, v) {
      return api('POST', 'admin/plans', { personId: S.pid, product: f.getAttribute('data-product'), planId: f.getAttribute('data-id'), startDate: v.startDate, months: v.months }).then(function (d) {
        if (!d.ok) return d; closeDialog(); toast('Package added.'); S.people = null; render();
      });
    },
    profile2: function (f, v) {
      return api('POST', 'people/' + encodeURIComponent(f.getAttribute('data-id')) + '/profile', v).then(function (d) { if (!d.ok) return d; toast('Saved.'); render(); });
    },
    profile: function (f, v) {
      return api('POST', 'profile', v).then(function (d) { if (!d.ok) return d; return loadSession().then(function () { toast('Details saved.'); render(); }); });
    },
    password: function (f, v) {
      return api('POST', 'password', v).then(function (d) { if (!d.ok) return d; f.reset(); toast(d.message); });
    },
    activate: function (f, v) {
      if (f.getAttribute('data-id')) { v.requestKind = f.getAttribute('data-type'); v.requestId = f.getAttribute('data-id'); }
      v.confirmAccount = Boolean($('[name=confirmAccount]:checked', f));
      return api('POST', 'admin/activate', v).then(function (d) {
        if (d.needsConfirm && !$('[name=confirmAccount]', f)) {
          $('[data-msg]', f).insertAdjacentHTML('afterend', '<label class="confirm"><input type="checkbox" name="confirmAccount"> <span>I confirmed on the phone that this account belongs to them</span></label>');
        }
        if (!d.ok) return d;
        linkResult(d, 'Plan activated'); refreshAdmin();
      });
    },
    'add-user': function (f, v) {
      return api('POST', 'admin/users', v).then(function (d) { if (!d.ok) return d; linkResult(d, 'Login added'); refreshAdmin(); });
    },
    addplan: function (f, v) {
      v.personId = f.getAttribute('data-id');
      return api('POST', 'admin/plans', v).then(function (d) { if (!d.ok) return d; toast('Plan added.'); reloadManage(v.personId); });
    },
    give: function (f, v) {
      v.personId = f.getAttribute('data-id');
      return api('POST', 'admin/links', v).then(function (d) { if (!d.ok) return d; toast('Done.'); reloadManage(v.personId); });
    }
  };
  function refreshAdmin() { var r = route(); if (r.parts[0] === 'admin') render(); }
  function reloadManage(id) {
    Promise.all([api('GET', 'admin/people'), api('GET', 'admin/users')]).then(function (res) {
      S.cache.people = res[0].rows; S.cache.users = res[1].rows; manageDialog(id);
      if (route().parts[1] === 'people') { var keep = S.cache.people; adminPeopleSoft(keep); }
    });
  }
  function adminPeopleSoft() { /* the table refreshes when the dialog closes */ S.cache.dirty = true; }

  document.addEventListener('submit', function (ev) {
    var f = ev.target.closest('form[data-form]');
    if (!f) return;
    ev.preventDefault();
    var fn = FORMS[f.getAttribute('data-form')];
    if (!fn) return;
    busy(f, true);
    Promise.resolve(fn(f, formData(f))).then(function (d) {
      if (d && d.ok === false) showErrors(f, d);
    }).catch(function (err) { if (!err.handled) showErrors(f, { message: 'Something went wrong. Please try again.' }); })
      .then(function () { if (document.body.contains(f)) busy(f, false); });
  });

  // ================================================================ clicks
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]');
    var menu = $('.menu:not([hidden])');
    if (menu && !(t && t.getAttribute('data-act') === 'menu') && !ev.target.closest('.menu')) { menu.hidden = true; var mb = $('.me>button'); if (mb) mb.setAttribute('aria-expanded', 'false'); }
    if (!t || t.tagName === 'SELECT' || (t.tagName === 'INPUT' && t.type !== 'radio')) return;
    var act = t.getAttribute('data-act');
    var id = t.getAttribute('data-id');
    switch (act) {
      case 'reload': location.reload(); break;
      case 'peek': { var inp = t.previousElementSibling; var show = inp.type === 'password'; inp.type = show ? 'text' : 'password'; t.textContent = show ? 'Hide' : 'Show'; t.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); break; }
      case 'menu': { var m = t.nextElementSibling; m.hidden = !m.hidden; t.setAttribute('aria-expanded', String(!m.hidden)); break; }
      case 'signout': ev.preventDefault(); api('POST', 'logout', {}).then(function () { S.me = null; S.csrf = ''; S.cache = {}; S.catalog = null; S.flash = { kind: 'ok', text: 'You are signed out.' }; go('#/signin', true); }); break;
      case 'start-back': S.start = null; render(); break;
      case 'drawer': { var open = !document.body.classList.contains('drawer-open'); document.body.classList.toggle('drawer-open', open); t.setAttribute('aria-expanded', String(open)); break; }
      case 'drawer-close': document.body.classList.remove('drawer-open'); break;
      case 'period': go('#/dashboard?p=' + encodeURIComponent(S.pid) + '&period=' + t.getAttribute('data-k')); break;
      case 'calendar': calendarDialog(); break;
      case 'jump': {
        var k2 = t.getAttribute('data-k'), blk = $('#t-' + k2);
        S.cache.metric = k2; $$('.vcard').forEach(function (c) { c.classList.toggle('on', c === t); });
        if (blk) { blk.scrollIntoView({ behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); blk.classList.add('flash'); setTimeout(function () { blk.classList.remove('flash'); }, 1200); }
        else toast('No ' + (METRICS[k2] ? METRICS[k2].label.toLowerCase() : 'readings') + ' in this period. Try a longer period.');
        break;
      }
      case 'showall': {
        var m = (S.cache.dash.series || []).filter(function (x) { return x.metric === t.getAttribute('data-k'); })[0], box = t.nextElementSibling;
        var show = box.hidden; if (show && m) box.innerHTML = allDataHtml(m);
        box.hidden = !show; t.setAttribute('aria-expanded', String(show)); t.textContent = show ? 'Hide data' : 'Show all data';
        break;
      }
      case 'rcat': S.cache.rcat = t.getAttribute('data-k'); $$('[data-act=rcat]').forEach(function (b) { b.setAttribute('aria-pressed', String(b === t)); }); drawRecords(); break;
      case 'rdownload': {
        var ids = $$('[data-act=rpick]').filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
        ids.forEach(function (rid, i) { setTimeout(function () { var a = document.createElement('a'); a.href = '/api/app/records/' + encodeURIComponent(rid) + '/file'; a.download = ''; document.body.appendChild(a); a.click(); a.remove(); }, i * 400); });
        break;
      }
      case 'rremove':
        openDialog('Remove a record', '<form data-form="rremove" data-id="' + e(id) + '" novalidate><div class="alert bad" data-msg hidden></div><p>Remove <b>' + e(t.getAttribute('data-name')) + '</b>? It will no longer show for the family or the care team.</p></form>',
          '<button class="btn ghost" data-act="close">Keep it</button><button class="btn" data-act="submit-dialog">Remove</button>');
        break;
      case 'upload': uploadDialog(); break;
      case 'pkgdetails': pkgDetails(id); break;
      case 'cat-details': catalogDetails(id); break;
      case 'add-pkg': closeDialog(); addPkgDialog(id); break;
      case 'choose-pkg': {
        var cpk = S.cache.pkg && S.cache.pkg.catalog.filter(function (x) { return x.id === id; })[0];
        var card = t.closest('[data-pkcard]'), msel = card && $('[data-act=dur]', card);
        closeDialog(); if (cpk) planDialog(cpk.product, cpk.id, msel ? msel.value : undefined);
        break;
      }
      case 'book': bookDialog(t.getAttribute('data-k')); break;
      case 'print': window.print(); break;
      case 'ask': askDialog(t.getAttribute('data-kind')); break;
      case 'choose-plan': planDialog(id); break;
      case 'claim': claimDialog(); break;
      case 'close': ev.preventDefault(); closeDialog(); break;
      case 'close-go': closeDialog(); break;
      case 'submit-dialog': { var f = $('dialog[open] form'); if (f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); break; }
      case 'filter': S.filter = t.getAttribute('data-k'); try { localStorage.setItem('kq.filter', S.filter); } catch (x) {} render(); break;
      case 'inbox': S.inbox = t.getAttribute('data-k'); render(); break;
      case 'role': S.cache.roleFilter = t.getAttribute('data-k'); render(); break;
      case 'activate': activateDialog(t.getAttribute('data-ref')); break;
      case 'manage': manageDialog(id); break;
      case 'add-user': addUserDialog(); break;
      case 'relink':
        api('POST', 'admin/users/' + encodeURIComponent(id) + '/link', {}).then(function (d) { if (d.ok) linkResult(d, d.user.hasPassword ? 'New sign-in link' : 'Welcome link'); else toast(d.message); });
        break;
      case 'toggle-user':
        api('PATCH', 'admin/users/' + encodeURIComponent(id), { active: t.getAttribute('data-on') === 'true' }).then(function (d) { toast(d.ok ? 'Saved.' : d.message); render(); });
        break;
      case 'unlink': {
        var pid = ($('dialog[open] form[data-id]') || {}).getAttribute ? $('dialog[open] form[data-id]').getAttribute('data-id') : null;
        var person = (S.cache.people || []).filter(function (p) { return p.family.concat(p.caregivers).some(function (l) { return l.linkId === id; }); })[0];
        api('POST', 'admin/links/' + encodeURIComponent(id) + '/remove', {}).then(function (d) { toast(d.ok ? 'Removed.' : d.message); if (person || pid) reloadManage((person && person.id) || pid); });
        break;
      }
      case 'copy': {
        var text = t.getAttribute('data-text');
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(function () { t.textContent = 'Copied'; }, function () { var i = t.previousElementSibling; i.select(); document.execCommand('copy'); t.textContent = 'Copied link'; });
        break;
      }
      case 'remove-reading': {
        var label = t.getAttribute('data-label');
        openDialog('Remove a reading', '<form data-form="remove" data-id="' + e(id) + '" novalidate><div class="alert bad" data-msg hidden></div><p style="margin-bottom:12px">Remove <b>' + e(label) + '</b>? It stays in the record with your reason, but the family will no longer see it.</p>' +
          '<label class="field"><span>Why is it wrong?</span><input class="in" name="reason" placeholder="e.g. Typed the wrong number" maxlength="300"><em class="err" data-err="reason"></em></label></form>',
          '<button class="btn ghost" data-act="close">Keep it</button><button class="btn" data-act="submit-dialog">Remove reading</button>');
        break;
      }
    }
  });
  FORMS.rremove = function (f) {
    return api('POST', 'records/' + encodeURIComponent(f.getAttribute('data-id')) + '/remove', {}).then(function (d) { if (!d.ok) return d; closeDialog(); toast('Record removed.'); render(); });
  };
  FORMS.remove = function (f, v) {
    return api('POST', 'readings/' + encodeURIComponent(f.getAttribute('data-id')) + '/remove', { reason: v.reason }).then(function (d) {
      if (!d.ok) return d; closeDialog(); toast('Reading removed.'); render();
    });
  };

  document.addEventListener('change', function (ev) {
    var t = ev.target, act = t.getAttribute('data-act');
    if (act === 'req-status') {
      api('PATCH', 'admin/requests/' + t.getAttribute('data-type') + '/' + encodeURIComponent(t.getAttribute('data-id')), { status: t.value }).then(function (d) { toast(d.ok ? 'Status saved.' : d.message); });
    } else if (act === 'plan-status') {
      api('PATCH', 'admin/plans/' + encodeURIComponent(t.getAttribute('data-id')), { status: t.value }).then(function (d) { toast(d.ok ? 'Plan updated.' : d.message); S.cache.dirty = true; });
    } else if (act === 'plan-pick') {
      fillPkgBox(t.value, S.cache.dlgMonths);
    } else if (act === 'dur') {
      var did = t.getAttribute('data-id'), pool = (S.cache.dlgPlans || []).concat((S.cache.pkg && S.cache.pkg.catalog) || []);
      var pk = pool.filter(function (x) { return x.id === did; })[0];
      var holder = t.closest('[data-pkcard]') || t.closest('dialog');
      var out = holder && $('[data-pkprice]', holder);
      if (pk && out) out.innerHTML = priceHtml(pk, t.value);
      if (t.closest('dialog')) S.cache.dlgMonths = t.value;
    } else if (act === 'person') {
      var r = route(); go('#/' + r.parts[0] + '?p=' + encodeURIComponent(t.value));
    } else if (act === 'sumgroup') {
      S.cache.sumGroup = t.value; var dd = S.cache.dash;
      if (dd) { $('#sumlist').innerHTML = summaryList(dd, t.value); $('#charts').innerHTML = chartsHtml(dd, t.value); drawCharts(); }
    } else if (act === 'rsort') {
      S.cache.rsort = t.value; drawRecords();
    } else if (act === 'rall') {
      $$('[data-act=rpick]').forEach(function (x) { x.checked = t.checked; }); syncPicks();
    } else if (act === 'rpick') {
      syncPicks();
    } else if (act === 'who') {
      var box = $('[data-new]', t.closest('form')); box.hidden = Boolean(t.value);
    } else if (act === 'act-brand' || act === 'addplan-brand') {
      var form = t.closest('form'), sel = $('[name=planId]', form);
      sel.innerHTML = planOptions(S.catalog, t.value);
    }
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.getAttribute('data-act') !== 'search') return;
    var q = ev.target.value.toLowerCase().trim();
    $$('tr[data-search]').forEach(function (tr) { tr.hidden = q && tr.getAttribute('data-search').indexOf(q) === -1; });
  });
  var rsz;
  window.addEventListener('resize', function () { clearTimeout(rsz); rsz = setTimeout(function () { if ($('[data-chart]')) drawCharts(); }, 200); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { var m = $('.menu:not([hidden])'); if (m) { m.hidden = true; } document.body.classList.remove('drawer-open'); }
  });

  render();
})();