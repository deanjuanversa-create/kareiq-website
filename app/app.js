/* My KareIQ — one app for Kare@Home and KareNest families, caregivers and the office team.
   No framework: each screen is a function that returns HTML; actions use data-act attributes. */
(function () {
  'use strict';

  // ---------------------------------------------------------------- settings
  var SITES = {
    kareiq: 'https://kareiq-website-full.vercel.app/',
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
    // gap: readings further apart than this many days are not joined by a line, so missed weeks stay visible
    bp: { label: 'Blood pressure', unit: 'mmHg', series: [['systolic', 'Systolic'], ['diastolic', 'Diastolic']], gap: 4 },
    hr: { label: 'Heart rate', unit: 'bpm', series: [['value', 'Heart rate']], gap: 4 },
    glucose: { label: 'Blood sugar', unit: 'mg/dL', series: [['value', 'Blood sugar']], gap: 8 },
    spo2: { label: 'Oxygen level', unit: '%', series: [['value', 'Oxygen']], gap: 4 },
    temp: { label: 'Temperature', unit: '°C', series: [['value', 'Temperature']], gap: 8 },
    weight: { label: 'Weight', unit: 'kg', series: [['value', 'Weight']], gap: 45 },
    height: { label: 'Height', unit: 'cm', series: [['value', 'Height']], gap: 0 },
    bmi: { label: 'BMI', unit: 'kg/m²', series: [['value', 'BMI']], gap: 45 },
    chol: { label: 'Total cholesterol', unit: 'mg/dL', series: [['value', 'Cholesterol']], gap: 0 }
  };
  var CARDS = ['bp', 'hr', 'glucose', 'spo2', 'temp', 'bmi', 'weight', 'chol'];
  var ALWAYS = ['bp', 'hr', 'glucose', 'spo2'];
  var TRENDS = ['bp', 'hr', 'glucose', 'spo2', 'weight'];
  var PERIODS = [['7d', 'Last 7 days', 7], ['1m', 'Month', 30], ['6m', '6 months', 182], ['1y', '1 year', 365]];
  var GLUCOSE = { fasting: 'Fasting', post_meal: 'After meal', random: 'Random' };
  var STALE_DAYS = 30;
  var ACTIONS = {
    'signin': 'Signed in', 'password.set': 'Set their password', 'password.reset': 'Reset their password', 'password.changed': 'Changed their password',
    'password.help': 'Asked for sign-in help', 'account.created-from-booking': 'Created an account from a booking', 'account.signup': 'Created an account', 'plan.requested': 'Asked for a new plan', 'booking.added': 'Added a website booking to their account', 'visit.save': 'Saved a visit',
    'reading.remove': 'Removed a reading', 'request.sent': 'Sent a request', 'plan.activate': 'Activated a plan', 'plan.add': 'Added a plan', 'plan.edit': 'Changed a plan',
    'person.add': 'Added a person', 'person.edit': 'Edited a person', 'user.add': 'Added a login', 'user.edit': 'Edited a login', 'user.link': 'Made a sign-in link',
    'caregiver.assign': 'Assigned a caregiver', 'caregiver.unassign': 'Removed a caregiver', 'family.link': 'Gave family access', 'family.unlink': 'Removed family access', 'demo.seed': 'Created demo data'
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
      shield: '<path d="M12 3.5 19 6v5.5c0 4.4-3 7.6-7 9-4-1.4-7-4.6-7-9V6l7-2.5Z"/><path d="m9 12 2.2 2.2L15.5 10"/>'
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

  function render() {
    var r = route();
    var top = r.parts[0] || '';
    if (S.lastHash !== location.hash) { window.scrollTo(0, 0); closeDialog(); S.lastHash = location.hash; }
    if (['signin', 'start', 'link', 'forgot', 'join'].indexOf(top) > -1) {
      // coming from a website "Sign in" link while already signed in: go straight in
      if (top === 'signin' && !S.checked) { S.checked = true; return loadSession().then(render); }
      if (S.me && (top === 'signin' || top === 'join')) {
        var want = r.q.brand && S.me.products.some(function (b) { return b.id === r.q.brand; }) ? '#/' + r.q.brand : '#/';
        return go(want, true);
      }
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
    var me = S.me;
    if (top === '') return pickerView();
    if (top === 'account') return accountView();
    if (top === 'plans') return plansView(r);
    if (top === 'admin') { if (me.user.role !== 'admin') return go('#/', true); return adminView(r.parts[1] || 'today', r); }
    if (BRANDS[top]) {
      var mine = me.products.filter(function (b) { return b.id === top; })[0];
      if (!mine) return go('#/', true);
      setBrand(top);
      if (r.parts[1] === 'p' && r.parts[2]) return r.parts[3] === 'visit' ? visitView(top, r.parts[2]) : personView(top, r.parts[2], r.q);
      if (r.parts[1] === 'requests') return requestsView(top);
      return brandHome(top, mine);
    }
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

  // ================================================================ picker ("who's watching")
  function pickerView() {
    setBrand('kareiq');
    var me = S.me, prods = me.products, isAdmin = me.user.role === 'admin';
    if (!isAdmin && prods.length === 1) return go('#/' + prods[0].id, true);
    if (!prods.length && me.user.role === 'family') return go('#/plans', true);
    var tiles = prods.map(function (p) {
      var b = BRANDS[p.id];
      var who = isAdmin ? '<span>' + (p.count || 0) + ' active or waiting plan' + (p.count === 1 ? '' : 's') + '</span>'
        : p.people.map(function (x) { return '<span><b>' + e(initials(x.name)) + '</b>' + e(x.relation || first(x.name)) + '</span>'; }).join('');
      return '<button class="tile ' + p.id + '" data-act="pick" data-id="' + p.id + '">' +
        '<img class="bg" src="' + b.photo + '" alt="">' +
        '<span class="mark">' + (b.logo ? '<img src="' + b.logo + '" alt="' + e(b.name) + '">' : '<img src="' + b.mark + '" alt="">' + e(b.name)) + '</span>' +
        (p.status === 'pending' ? '<span class="state">Being set up</span>' : p.includedWith ? '<span class="state incl">Included with ' + e(p.includedWith) + '</span>' : '') +
        '<span class="tbody"><span class="tname">' + e(b.name) + '</span><br><span class="ttag">' + e(b.tag) + '</span><span class="who">' + who + '</span></span>' +
      '</button>';
    });
    if (isAdmin) {
      tiles.push('<button class="tile admin" data-act="pick" data-id="admin"><span class="bigicon">' + icon('shield') + '</span>' +
        '<span class="tbody"><span class="tname">Office</span><br><span class="ttag">Requests, people, plans and logins for both</span></span></button>');
    }
    var empty = !prods.length;
    root.innerHTML = '<div class="picker"><div class="picker-top"><img src="/img/kareiq-logo.png" alt="KareIQ">' + meMenu() + '</div>' +
      '<div class="picker-in">' +
        (empty ? noPlanHtml() :
        '<h1>' + (isAdmin ? 'Where would you like to work, ' : 'Where would you like to go, ') + e(first(me.user.name)) + '?</h1>' +
        '<p class="lead">' + (isAdmin ? 'Open a brand to see it the way families and caregivers do, or go to the office.' : 'Your family has care with both. You can switch any time from the top of the page.') + '</p>' +
        '<div class="tiles' + (tiles.length > 2 ? ' three' : '') + '">' + tiles.join('') + '</div>') +
      '</div></div>';
  }
  function noPlanHtml() {
    var cg = S.me.user.role === 'caregiver';
    return '<h1>' + (cg ? 'No one is assigned to you yet' : 'Welcome to KareIQ') + '</h1>' +
      '<p class="lead">' + (cg ? 'The office team will assign the people you care for. They will appear here.' : 'You do not have a Kare@Home or KareNest plan with us yet. Once you book and we confirm, it shows up here.') + '</p>' +
      (cg ? '' : '<div class="picker-foot"><a class="btn" href="' + SITES.karehome + '">See Kare@Home plans</a><a class="btn ghost" href="' + SITES.karenest + '">Visit KareNest</a></div>') +
      '<div class="picker-foot"><a class="link" href="' + waLink('Hello, I have a question about my KareIQ account.') + '" target="_blank" rel="noopener">Message us on WhatsApp</a></div>';
  }
  function pickBrand(btn) {
    var id = btn.getAttribute('data-id');
    var target = id === 'admin' ? '#/admin' : '#/' + id;
    var reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) return go(target);
    var r = btn.getBoundingClientRect();
    var z = document.createElement('div');
    z.className = 'zoom';
    z.style.cssText = 'left:' + r.left + 'px;top:' + r.top + 'px;width:' + r.width + 'px;height:' + r.height + 'px;--zc:' + (id === 'admin' ? '#2a3a64' : BRANDS[id].theme);
    z.innerHTML = id === 'admin' ? '' : '<img src="' + (BRANDS[id].logo || BRANDS[id].mark) + '" alt="">';
    document.body.appendChild(z);
    requestAnimationFrame(function () { requestAnimationFrame(function () { z.classList.add('full'); }); });
    setTimeout(function () { go(target); z.style.transition = 'opacity .35s'; z.style.opacity = '0'; setTimeout(function () { z.remove(); }, 400); }, 560);
  }

  // ================================================================ inside a brand
  function meMenu() {
    var u = S.me.user;
    return '<div class="me"><button data-act="menu" aria-haspopup="true" aria-expanded="false" aria-label="Your account">' + e(initials(u.name)) + '</button>' +
      '<div class="menu" hidden><div class="who"><b>' + e(u.name) + '</b><span class="muted small">' + e(u.roleName) + '</span></div>' +
      '<a href="#/account">Your account</a>' + (u.role === 'family' ? '<a href="#/plans">Add a plan or booking</a>' : '') + (S.me.products.length > 1 || u.role === 'admin' ? '<a href="#/">Switch between Kare@Home and KareNest</a>' : '') +
      (u.role === 'admin' ? '<a href="#/admin">Office</a>' : '') +
      '<button data-act="signout">Sign out</button></div></div>';
  }
  function bar(brand, current) {
    var me = S.me, role = me.user.role, multi = me.products.length > 1 || role === 'admin';
    var base = '#/' + brand;
    var links = role === 'family'
      ? [['home', base, 'Home', 'home'], ['requests', base + '/requests', 'Requests', 'chat']]
      : [['home', base, role === 'admin' ? 'People' : 'My people', 'people']];
    if (role === 'admin') links.push(['office', '#/admin', 'Office', 'shield']);
    var nav = links.map(function (l) { return '<a href="' + l[1] + '"' + (l[0] === current ? ' aria-current="page"' : '') + '>' + e(l[2]) + '</a>'; }).join('');
    var bnav = links.map(function (l) { return '<a href="' + l[1] + '"' + (l[0] === current ? ' aria-current="page"' : '') + '>' + icon(l[3]) + e(l[2]) + '</a>'; }).join('') +
      '<a href="' + waLink('Hello, I am contacting you from My KareIQ (' + BRANDS[brand].name + ').') + '" target="_blank" rel="noopener">' + icon('wa') + 'WhatsApp</a>';
    return '<header class="bar"><div class="bar-in"><a class="logo" href="' + base + '">' + brandLogo(brand) + '</a><nav class="nav" aria-label="Main">' + nav + '</nav><span class="sp"></span>' +
      (multi ? '<button class="switch" data-act="switch" title="Switch between Kare@Home and KareNest"><span class="duo"><img src="/img/karehome-emblem.png" alt=""><img src="/karenest/images/mark.webp" alt=""></span><span class="lbl">Switch</span></button>' : '') +
      meMenu() + '</div></header><nav class="bnav" aria-label="Main">' + bnav + '</nav>';
  }

  function brandHome(brand, mine) {
    var role = S.me.user.role;
    if (role === 'family' && mine.people.length) {
      var lastKey = 'kq.last.' + brand, last = null;
      try { last = localStorage.getItem(lastKey); } catch (x) {}
      var pick = mine.people.filter(function (x) { return x.id === last; })[0] || mine.people[0];
      return go('#/' + brand + '/p/' + pick.id, true);
    }
    root.innerHTML = bar(brand, 'home') + '<main class="page"><div class="skel" style="height:240px"></div></main>';
    api('GET', 'home?product=' + brand).then(function (d) {
      if (!d.ok) return pageError(d);
      var b = BRANDS[brand];
      var cards = d.people.map(function (x) {
        var bp = x.lastBp ? x.lastBp.systolic + '/' + x.lastBp.diastolic + ' mmHg' : null;
        var active = x.plan && x.plan.status === 'active';
        return '<div class="pcard"><div class="top"><span class="av lg">' + e(initials(x.name)) + '</span><div><b>' + e(x.name) + '</b>' +
          '<span class="meta">' + e(x.plan ? x.plan.name : '') + ' ' + statusPill(x.plan) + '</span></div></div>' +
          '<div class="meta">' + (x.lastVisit ? 'Last visit ' + e(ago(x.lastVisit)) : 'No visits recorded yet') + (bp ? '<br>Last blood pressure ' + e(bp) : '') + '</div>' +
          '<div class="btns">' + (active ? '<a class="btn sm" href="#/' + brand + '/p/' + x.id + '/visit">' + icon('plus') + 'Record visit</a>' : '') +
          '<a class="btn sm ghost" href="#/' + brand + '/p/' + x.id + '">See history</a></div></div>';
      }).join('');
      $('main.page').innerHTML = '<div class="head"><div><h1>' + (role === 'admin' ? 'Everyone at ' + e(b.name) : 'Good ' + greeting() + ', ' + e(first(S.me.user.name))) + '</h1>' +
        '<p class="sub">' + (role === 'admin' ? d.people.length + ' people with a plan' : 'The people you care for at ' + e(b.name) + '. Tap "Record visit" when you are with them.') + '</p></div></div>' +
        (d.people.length ? '<div class="cards">' + cards + '</div>' : '<div class="empty"><b>No one here yet</b>When a plan is activated for ' + e(b.name) + ', the person appears here.</div>');
    });
  }
  function greeting() { var h = Number(nowHM().slice(0, 2)); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
  function pageError(d) {
    var m = $('main.page') || root;
    m.innerHTML = '<div class="empty"><b>' + (d.status === 404 ? 'This page is not available' : 'Something went wrong') + '</b>' + e(d.message || '') + '<p style="margin-top:12px"><a class="btn sm" href="#/">Go to start</a></p></div>';
  }

  // ---------------------------------------------------------------- one person's page
  function personView(brand, id, q) {
    var role = S.me.user.role;
    var mine = S.me.products.filter(function (b) { return b.id === brand; })[0];
    var period = q.period || 'month';
    period = { '7d': '7d', '1m': '1m', '6m': '6m', '1y': '1y' }[q.period] || '1m';
    var current = role === 'family' ? 'home' : 'home';
    root.innerHTML = bar(brand, current) + '<main class="page"><div class="skel" style="height:90px;margin-bottom:18px"></div><div class="skel" style="height:160px"></div></main>';
    try { if (role === 'family') localStorage.setItem('kq.last.' + brand, id); } catch (x) {}
    api('GET', 'people/' + encodeURIComponent(id) + '?product=' + brand + '&period=' + period).then(function (d) {
      if (!d.ok) return pageError(d);
      S.cache.person = d;
      var b = BRANDS[brand], p = d.person, plan = d.plan;
      var switcher = role === 'family' && mine.people.length > 1 ? '<div class="people-switch" role="list" style="margin-bottom:18px">' + mine.people.map(function (x) {
        return '<a role="listitem" href="#/' + brand + '/p/' + x.id + '"' + (x.id === p.id ? ' aria-current="true"' : '') + '><span class="av">' + e(initials(x.name)) + '</span>' + e(first(x.name)) + (x.relation ? ' (' + e(x.relation) + ')' : '') + '</a>';
      }).join('') + '</div>' : '';
      var lastAt = Object.keys(d.latest).reduce(function (m, k) { return d.latest[k].at > m ? d.latest[k].at : m; }, '');
      var head = '<div class="head"><div><h1>' + e(p.name) + '</h1><p class="sub">' + (p.relation || plan ? '<span>' + e([p.relation, plan ? (plan.included ? 'included with ' + plan.viaName : plan.name + ' plan') : ''].filter(Boolean).join(', ')) + '</span>' : '') +
        (plan ? statusPill(plan) : '') + (lastAt ? '<span class="muted">Last reading ' + e(dt(lastAt)) + '</span>' : '') + '</p></div>' +
        (d.canRecord ? '<a class="btn" href="#/' + brand + '/p/' + p.id + '/visit">' + icon('plus') + 'Record visit</a>' : '') + '</div>';

      if (plan && plan.status === 'pending' && role === 'family') {
        $('main.page').innerHTML = switcher + head + pendingHtml(brand, d);
        return;
      }
      var body =
        '<section class="panel" aria-labelledby="h-latest"><h2 id="h-latest">Latest readings</h2>' + vitalsHtml(d.latest) + '</section>' +
        '<div class="grid"><div class="stack">' +
          '<section class="panel trend" aria-labelledby="h-trend"><h2 id="h-trend">How it has changed</h2><div id="trend"></div></section>' +
          '<section class="panel" aria-labelledby="h-visits"><h2 id="h-visits">' + e(b.words.visits) + '</h2>' + visitsHtml(d.visits, b, brand) + '</section>' +
        '</div><div class="stack">' +
          sideHtml(brand, d) +
        '</div></div>' +
        '<p class="note">' + icon('shield').replace('<svg', '<svg width="18" height="18"') + '<span>Health insights will appear here once our doctors have approved them. If something worries you, call us on <a href="tel:+918129345178">' + PHONE + '</a>.</span></p>';
      $('main.page').innerHTML = switcher + head + body;
      S.cache.trend = { metric: availableTrend(d)[0] || 'bp', period: period, brand: brand, id: p.id };
      drawTrend();
    });
  }

  function pendingHtml(brand, d) {
    var b = BRANDS[brand], plan = d.plan;
    return '<div class="setup"><section class="panel"><h2>Your ' + e(plan.included ? plan.viaName : b.name) + ' plan is being set up</h2>' +
      (plan.included ? '<p class="muted" style="margin-bottom:6px">' + e(b.name) + ' is included with it, so you will see both once it starts.</p>' : '') +
      '<p class="muted">We have your request' + (plan.bookingRef ? ' <b>' + e(plan.bookingRef) + '</b>' : '') + '. Here is what happens next.</p>' +
      '<ol class="prog">' +
        '<li class="done"><span class="dot">' + icon('check').replace('<svg', '<svg width="18" height="18"') + '</span><div><b>Request received</b><span class="muted small">' + e(date(plan.createdAt)) + '</span></div></li>' +
        '<li class="now"><span class="dot">2</span><div><b>We call you to confirm</b><span class="muted small">Usually within one working day. We agree the start date and payment.</span></div></li>' +
        '<li><span class="dot">3</span><div><b>Care begins</b><span class="muted small">Visit notes and health readings for ' + e(first(d.person.name)) + ' appear on this page.</span></div></li>' +
      '</ol></section>' +
      '<section class="panel"><h2>Questions?</h2><p class="muted" style="margin-bottom:14px">We are happy to help before you start.</p><div class="actions">' +
        '<a class="btn wa" href="' + waLink('Hello, about my ' + b.name + ' booking ' + (plan.bookingRef || '') + '.') + '" target="_blank" rel="noopener">' + icon('wa') + 'WhatsApp us</a>' +
        '<a class="btn ghost" href="tel:+918129345178">' + icon('phone') + 'Call ' + PHONE + '</a></div></section></div>';
  }

  function vitalsHtml(latest) {
    var now = Date.now();
    if (!Object.keys(latest).length) return '<div class="empty"><b>No readings yet</b>Blood pressure, heart rate, sugar and oxygen appear here after the first visit.</div>';
    return '<div class="vitals">' + CARDS.filter(function (k) { return latest[k] || ALWAYS.indexOf(k) > -1; }).map(function (k) {
      var m = METRICS[k], r = latest[k];
      if (!r) return '<div class="vital none"><div class="lbl">' + m.label + '</div><div class="val">Not measured yet</div></div>';
      var v = k === 'bp' ? r.systolic + '/' + r.diastolic : r.value;
      var stale = (now - new Date(r.at).getTime()) / 86400000 > STALE_DAYS;
      return '<div class="vital"><div class="lbl">' + m.label + (r.context ? ' <span class="muted small">(' + e(GLUCOSE[r.context] || r.context) + ')</span>' : '') + '</div>' +
        '<div class="val">' + e(v) + '<small>' + m.unit + '</small></div><div class="when">' + e(dt(r.at)) + '</div>' +
        (stale ? '<div class="stale">Over ' + STALE_DAYS + ' days old</div>' : '') + '</div>';
    }).join('') + '</div>';
  }
  function visitsHtml(visits, b, brand) {
    if (!visits.length) return '<div class="empty">' + e(b.words.visitsEmpty) + '</div>';
    return '<ol class="tl">' + visits.slice(0, 6).map(function (v) {
      var what = v.metrics.filter(function (m) { return m !== 'bmi'; }).map(function (m) { return METRICS[m] ? METRICS[m].label.toLowerCase() : m; });
      return '<li><div class="t">' + e(dt(v.at)) + (v.product && v.product !== brand && BRANDS[v.product] ? ' <span class="tagb ' + v.product + '">' + e(BRANDS[v.product].name) + '</span>' : '') + '</div><div class="m">' + e(v.by) + (what.length ? ', checked ' + e(what.slice(0, 3).join(', ')) + (what.length > 3 ? ' and more' : '') : '') + '</div>' +
        (v.note ? '<p class="n">' + e(v.note) + '</p>' : '') + '</li>';
    }).join('') + '</ol>';
  }
  function sideHtml(brand, d) {
    var b = BRANDS[brand], role = S.me.user.role, plan = d.plan;
    var team = d.caregivers.length ? '<div class="team">' + d.caregivers.map(function (c) {
      return '<div><span class="av">' + e(initials(c.name)) + '</span><span>' + e(c.name) + (c.phone ? '<br><a class="small" href="tel:' + e(c.phone) + '">' + e(phoneNice(c.phone)) + '</a>' : '') + '</span></div>';
    }).join('') + '</div>' : '<p class="muted">We will introduce your caregiver here once they are assigned.</p>';
    var fam = role !== 'family' && d.family.length ? '<h3 style="margin:16px 0 8px">Family</h3><div class="team">' + d.family.map(function (f) {
      return '<div><span class="av">' + e(initials(f.name)) + '</span><span>' + e(f.name) + (f.relation ? ' <span class="muted small">(' + e(p2(f.relation)) + ')</span>' : '') + (f.phone ? '<br><a class="small" href="tel:' + e(f.phone) + '">' + e(phoneNice(f.phone)) + '</a>' : '') + '</span></div>';
    }).join('') + '</div>' : '';
    var planHtml = plan ? '<section class="panel"><h2>Plan</h2><dl class="kv"><dt>Plan</dt><dd>' + (plan.included ? e(b.name) + ' is included with your ' + e(plan.viaName) + ' plan (' + e(plan.viaPlan) + ')' : e(plan.name)) + '</dd><dt>Status</dt><dd>' + statusPill(plan) + '</dd>' +
      (plan.startDate ? '<dt>Started</dt><dd>' + e(date(plan.startDate)) + '</dd>' : '') + (plan.endDate ? '<dt>Runs until</dt><dd>' + e(date(plan.endDate)) + '</dd>' : '') + '</dl></section>' : '';
    var help = role === 'family' ? '<section class="panel"><h2>Need something?</h2><div class="actions">' +
      '<button class="btn quiet" data-act="ask" data-kind="' + b.words.extraKind + '">' + icon('clock') + e(b.words.extra) + '</button>' +
      '<button class="btn quiet" data-act="ask" data-kind="question">' + icon('chat') + 'Ask the care team a question</button>' +
      '<button class="btn quiet" data-act="ask" data-kind="plan">' + icon('pen') + 'Change or renew the plan</button>' +
      '<a class="btn wa" href="' + waLink('Hello, I am ' + S.me.user.name + ', about ' + d.person.name + ' (' + b.name + ').') + '" target="_blank" rel="noopener">' + icon('wa') + 'WhatsApp us</a></div></section>' : '';
    return '<section class="panel"><h2>' + e(b.words.team) + '</h2>' + team + fam + '</section>' + planHtml + help;
  }
  function p2(s) { return s; }

  function availableTrend(d) { return TRENDS.filter(function (k) { return d.latest[k]; }); }
  function drawTrend() {
    var d = S.cache.person, t = S.cache.trend, el = $('#trend');
    if (!el || !d) return;
    var avail = availableTrend(d);
    if (!avail.length) { el.innerHTML = '<div class="empty"><b>No readings yet</b>Once the first visit is recorded, you will see how things change over time.</div>'; return; }
    var m = METRICS[t.metric], days = PERIODS.filter(function (p) { return p[0] === t.period; })[0][2];
    var end = Date.now(), start = end - days * 86400000;
    var rows = d.trend.filter(function (r) { return r.metric === t.metric && new Date(r.at).getTime() >= start; });
    var tabs = '<div class="tabs" role="tablist">' + avail.map(function (k) { return '<button role="tab" data-act="metric" data-k="' + k + '" aria-selected="' + (k === t.metric) + '">' + METRICS[k].label + '</button>'; }).join('') + '</div>';
    var chips = '<div class="chips">' + PERIODS.map(function (p) { return '<button data-act="period" data-k="' + p[0] + '" aria-pressed="' + (p[0] === t.period) + '">' + p[1] + '</button>'; }).join('') + '</div>';
    var html = tabs + chips;
    if (!rows.length) {
      el.innerHTML = html + '<div class="empty" style="margin-top:14px"><b>No ' + m.label.toLowerCase() + ' readings in this period</b>Try a longer period.</div>';
      return;
    }
    var means = m.series.map(function (s) { var v = rows.map(function (r) { return r[s[0]]; }).filter(function (x) { return x != null; }); return Math.round(v.reduce(function (a, b) { return a + b; }, 0) / v.length * 10) / 10; });
    html += '<p class="avg">Average <b>' + means.map(function (x) { return t.metric === 'bp' || t.metric === 'hr' || t.metric === 'spo2' ? Math.round(x) : x; }).join('/') + ' ' + m.unit + '</b> <span class="muted small">from ' + rows.length + ' reading' + (rows.length === 1 ? '' : 's') + ', ' + e(fmtS.format(new Date(start))) + ' to ' + e(fmtS.format(new Date(end))) + '</span></p>';
    if (m.series.length > 1) html += '<div class="legend"><span><i></i>' + m.series[0][1] + '</span><span><i class="d"></i>' + m.series[1][1] + '</span></div>';
    html += chartSvg(rows, m, start, end, el.clientWidth);
    html += '<details class="table"><summary>See all readings</summary><div class="tw"><table><thead><tr><th>When</th>' + m.series.map(function (s) { return '<th>' + s[1] + ' (' + m.unit + ')</th>'; }).join('') + '</tr></thead><tbody>' +
      rows.slice().reverse().map(function (r) { return '<tr><td>' + e(dt(r.at)) + '</td>' + m.series.map(function (s) { return '<td>' + e(r[s[0]]) + (r.context ? ' <span class="muted small">' + e(GLUCOSE[r.context]) + '</span>' : '') + '</td>'; }).join('') + '</tr>'; }).join('') +
      '</tbody></table></div></details>';
    el.innerHTML = html;
  }
  function chartSvg(rows, m, start, end, width) {
    // drawn at the real width, so labels stay readable on phones
    var W = Math.max(300, Math.round(width || 800)), H = W < 560 ? 200 : 240, L = 40, R = 12, T = 14, B = 28;
    var vals = [];
    rows.forEach(function (r) { m.series.forEach(function (s) { if (r[s[0]] != null) vals.push(r[s[0]]); }); });
    var lo = Math.min.apply(null, vals), hi = Math.max.apply(null, vals), pad = Math.max((hi - lo) * 0.12, 2);
    lo -= pad; hi += pad;
    function x(ms) { return L + (W - L - R) * (ms - start) / (end - start); }
    function y(v) { return T + (H - T - B) * (1 - (v - lo) / (hi - lo)); }
    var out = '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + e(m.label) + ' chart">';
    [lo + pad, (lo + hi) / 2, hi - pad].forEach(function (v) {
      out += '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" stroke="#d5deea" stroke-width="1" stroke-dasharray="3 5"/>' +
        '<text x="' + (L - 8) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end">' + Math.round(v) + '</text>';
    });
    [start, (start + end) / 2, end].forEach(function (ms, i) {
      out += '<text x="' + x(ms).toFixed(1) + '" y="' + (H - 8) + '" text-anchor="' + ['start', 'middle', 'end'][i] + '">' + e(fmtS.format(new Date(ms))) + '</text>';
    });
    m.series.forEach(function (s, si) {
      var seg = [], segs = [], prev = null;
      rows.forEach(function (r) {
        var v = r[s[0]]; if (v == null) return;
        var t = new Date(r.at).getTime();
        if (prev !== null && (t - prev) / 86400000 > m.gap) { if (seg.length > 1) segs.push(seg); seg = []; }
        seg.push([x(t), y(v)]); prev = t;
      });
      if (seg.length > 1) segs.push(seg);
      segs.forEach(function (sg) {
        out += '<polyline class="s' + (si + 1) + '" fill="none" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"' + (si ? ' stroke-dasharray="7 5"' : '') + ' points="' + sg.map(function (p) { return p[0].toFixed(1) + ',' + p[1].toFixed(1); }).join(' ') + '"/>';
      });
      rows.forEach(function (r) {
        var v = r[s[0]]; if (v == null) return;
        out += '<circle class="d' + (si + 1) + '" stroke-width="2" r="' + (rows.length > 60 ? 2.6 : 4) + '" cx="' + x(new Date(r.at).getTime()).toFixed(1) + '" cy="' + y(v).toFixed(1) + '"><title>' + e(dt(r.at)) + ': ' + v + ' ' + m.unit + '</title></circle>';
      });
    });
    return out + '</svg>';
  }

  // ---------------------------------------------------------------- caregiver: record a visit
  function visitView(brand, id) {
    root.innerHTML = bar(brand, 'home') + '<main class="page"><div class="skel" style="height:300px"></div></main>';
    Promise.all([api('GET', 'people/' + encodeURIComponent(id) + '?product=' + brand + '&period=7d'), api('GET', 'people/' + encodeURIComponent(id) + '/recent?product=' + brand)]).then(function (res) {
      var d = res[0], rec = res[1];
      if (!d.ok) return pageError(d);
      if (!d.canRecord) return pageError({ status: 404, message: 'Visits can be recorded while the plan is active.' });
      var p = d.person;
      function unit(name, label, u, attrs) {
        return '<label class="field"><span>' + label + '</span><div class="unit"><input class="in" name="' + name + '" inputmode="decimal" autocomplete="off" ' + (attrs || '') + '><em>' + u + '</em></div><em class="err" data-err="' + name + '"></em></label>';
      }
      $('main.page').innerHTML =
        '<div class="head"><div><h1>Visit for ' + e(p.name) + '</h1><p class="sub">Fill in only what you measured. Family members can see these readings and your note.</p></div>' +
        '<a class="btn ghost" href="#/' + brand + '/p/' + p.id + '">Cancel</a></div>' +
        '<div class="visit"><form data-form="visit" data-brand="' + brand + '" data-id="' + e(p.id) + '" novalidate><div class="alert bad" data-msg hidden></div>' +
          '<fieldset class="vgroup"><legend>Blood pressure</legend><div class="field"><div class="bp"><input class="in" name="systolic" inputmode="numeric" aria-label="Top number (systolic)"><b>/</b><input class="in" name="diastolic" inputmode="numeric" aria-label="Bottom number (diastolic)"><span class="muted">mmHg</span></div>' +
          '<em class="err" data-err="systolic"></em><em class="err" data-err="diastolic"></em></div></fieldset>' +
          '<fieldset class="vgroup"><legend>Pulse and oxygen</legend><div class="row2">' + unit('hr', 'Heart rate', 'bpm') + unit('spo2', 'Oxygen (SpO2)', '%') + '</div></fieldset>' +
          '<fieldset class="vgroup"><legend>Blood sugar</legend>' + unit('glucose', 'Reading', 'mg/dL') +
            '<div class="field"><span>Measured</span><div class="seg">' + Object.keys(GLUCOSE).map(function (k) { return '<label><input type="radio" name="glucoseContext" value="' + k + '"><span>' + GLUCOSE[k] + '</span></label>'; }).join('') + '</div><em class="err" data-err="glucoseContext"></em></div></fieldset>' +
          '<details class="vgroup" style="padding-bottom:12px"><summary style="cursor:pointer;font-weight:650">Temperature, weight, height and cholesterol</summary><div style="margin-top:12px"><div class="row2">' +
            unit('temp', 'Temperature', '°C') + unit('weight', 'Weight', 'kg') + unit('height', 'Height', 'cm', 'placeholder="Only once"') + unit('chol', 'Total cholesterol', 'mg/dL') + '</div></div></details>' +
          '<label class="field"><span>Note for the family</span><textarea class="in" name="note" maxlength="1000" placeholder="How was ' + e(first(p.name)) + ' today? Meals, mood, walking, medicines..."></textarea><em class="err" data-err="note"></em></label>' +
          '<details style="margin-bottom:10px"><summary class="link" style="text-decoration:none">The visit was earlier</summary><div class="row2" style="margin-top:10px">' +
            '<label class="field"><span>Date</span><input class="in" type="date" name="date" max="' + todayIST() + '" value="' + todayIST() + '"></label>' +
            '<label class="field"><span>Time</span><input class="in" type="time" name="time" value="' + nowHM() + '"></label></div><em class="err" data-err="when"></em></details>' +
          '<div class="savebar"><button class="btn" type="submit">' + icon('check') + 'Save visit</button></div>' +
        '</form>' +
        '<aside class="stack"><section class="panel"><h2>Recent readings</h2>' + recentHtml(rec.rows || []) + '</section></aside></div>';
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

  // ---------------------------------------------------------------- family: my requests
  function requestsView(brand) {
    root.innerHTML = bar(brand, 'requests') + '<main class="page"><div class="skel" style="height:200px"></div></main>';
    api('GET', 'requests?product=' + brand).then(function (d) {
      var names = { new: 'Sent', contacted: 'We are on it', scheduled: 'Arranged', closed: 'Done' };
      $('main.page').innerHTML = '<div class="head"><div><h1>Your requests</h1><p class="sub">Things you have asked the ' + e(BRANDS[brand].name) + ' team for.</p></div>' +
        '<button class="btn" data-act="ask" data-kind="question">' + icon('plus') + 'New request</button></div>' +
        (d.rows && d.rows.length ? '<section class="panel"><ul class="rlist">' + d.rows.map(function (r) {
          return '<li><span><b>' + e(r.title) + '</b>' + (r.personName ? ' for ' + e(r.personName) : '') + '<br><span class="muted small">' + e(r.reference) + ', sent ' + e(ago(r.createdAt)) + '</span>' +
            (r.message ? '<br><span class="small">' + e(r.message) + '</span>' : '') + '</span><span class="pill ' + (r.status === 'new' ? 'new' : r.status === 'closed' ? 'ended' : 'active') + '">' + e(names[r.status] || r.status) + '</span></li>';
        }).join('') + '</ul></section>' : '<div class="empty"><b>No requests yet</b>Ask for an extra visit, a plan change, or anything else. We usually reply the same day.</div>');
    });
  }

  function askDialog(kind) {
    var r = route(), brand = r.parts[0], b = BRANDS[brand];
    var d = S.cache.person && S.cache.person.person && r.parts[1] === 'p' ? S.cache.person.person : null;
    var mine = S.me.products.filter(function (x) { return x.id === brand; })[0];
    var people = mine ? mine.people : [];
    var titles = { visit: 'Book an extra visit', 'family-visit': 'Plan a visit to see them', question: 'Ask the care team', plan: 'Change or renew the plan' };
    var dated = kind === 'visit' || kind === 'family-visit';
    openDialog(titles[kind] || 'New request',
      '<form data-form="ask" data-kind="' + kind + '" data-brand="' + brand + '" novalidate><div class="alert bad" data-msg hidden></div>' +
      (people.length > 1 || !d ? '<label class="field"><span>For</span><select class="in" name="personId">' + people.map(function (x) { return '<option value="' + e(x.id) + '"' + (d && d.id === x.id ? ' selected' : '') + '>' + e(x.name) + '</option>'; }).join('') + '</select></label>'
        : '<input type="hidden" name="personId" value="' + e(d.id) + '">') +
      (kind === 'question' && !d ? '' : '') +
      (dated ? '<label class="field"><span>Preferred date</span><input class="in" type="date" name="date" min="' + todayIST() + '"></label>' : '') +
      '<label class="field"><span>' + (kind === 'plan' ? 'What would you like to change?' : dated ? 'Anything we should know?' : 'Your question') + '</span><textarea class="in" name="message" maxlength="1000"></textarea><em class="err" data-err="message"></em></label>' +
      '<p class="muted small">The ' + e(b.name) + ' team will call or WhatsApp you on ' + e(phoneNice(S.me.user.phone) || 'your number') + '.</p>' +
      '</form>', '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Send request</button>');
  }

  // ---------------------------------------------------------------- choosing a plan (families)
  function plansView(r) {
    var u = S.me.user;
    if (u.role !== 'family') return go('#/', true);
    setBrand('kareiq');
    var mine = S.me.products, first = !mine.length;
    var back = mine.length === 1 ? '#/' + mine[0].id : '#/';
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
  }
  function first_(n) { return first(n); }
  function planDialog(brand) {
    var b = BRANDS[brand];
    var load = S.cache.planOpts ? Promise.resolve(S.cache.planOpts) : api('GET', 'plans/options').then(function (d) { S.cache.planOpts = d; return d; });
    load.then(function (d) {
      if (!d.ok) return toast(d.message);
      var prod = d.products.filter(function (x) { return x.id === brand; })[0];
      var people = d.people || [];
      var who = people.length
        ? '<label class="field"><span>Who is it for?</span><select class="in" name="personId" data-act="who">' + people.map(function (x) { return '<option value="' + e(x.id) + '">' + e(x.name) + (x.relation ? ' (' + e(x.relation) + ')' : '') + '</option>'; }).join('') + '<option value="">Someone else</option></select></label><div data-new hidden>'
        : '<div data-new>';
      who += '<div class="row2">' + field('personName', people.length ? 'Their name' : 'Who is it for?', 'placeholder="e.g. Lakshmi Nair"') + field('relation', 'They are your', 'placeholder="e.g. Mother" list="rels2"') + '</div><datalist id="rels2"><option>Mother<option>Father<option>Grandmother<option>Grandfather<option>Spouse<option>Myself</datalist></div>';
      openDialog(b.name + ' plans',
        '<form data-form="plan-request" data-brand="' + brand + '" novalidate><div class="alert bad" data-msg hidden></div>' +
        '<div class="field"><span>Plan</span><div class="pick">' + prod.plans.map(function (pl, i) {
          return '<label><input type="radio" name="planId" value="' + e(pl.id) + '"' + (i === 0 ? ' checked' : '') + '><span><b>' + e(pl.name) + '</b>' + (pl.price ? '<em>' + e(pl.price) + '</em>' : '<em>Price on call</em>') + '</span></label>';
        }).join('') + '<label><input type="radio" name="planId" value="undecided"><span><b>Not sure yet</b><em>We will help you choose</em></span></label></div><em class="err" data-err="planId"></em></div>' +
        who +
        '<div class="row2">' + field('startDate', 'Would like to start (optional)', 'type="date" min="' + todayIST() + '"') + '<span></span></div>' +
        '<label class="field"><span>Anything we should know? (optional)</span><textarea class="in" name="note" maxlength="1000" placeholder="Health needs, mobility, preferred times..."></textarea></label>' +
        '<p class="muted small">Nothing is charged now. The ' + e(b.name) + ' team will call you on ' + e(phoneNice(S.me.user.phone)) + ' to confirm the plan, price and start date.</p></form>',
        '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Send to the ' + e(b.name) + ' team</button>');
    });
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
    setBrand('kareiq');
    var back = S.me.products.length === 1 && u.role !== 'admin' ? '#/' + S.me.products[0].id : '#/';
    root.innerHTML = '<header class="bar"><div class="bar-in"><a class="logo" href="' + back + '"><img src="/img/kareiq-logo.png" alt="KareIQ"></a><span class="sp"></span>' + meMenu() + '</div></header>' +
      '<main class="page" style="max-width:760px"><div class="head"><div><h1>Your account</h1><p class="sub">' + e(u.roleName) + ', signs in with ' + e([phoneNice(u.phone), u.email].filter(Boolean).join(' or ')) + '</p></div><a class="btn ghost" href="' + back + '">Done</a></div>' +
      '<section class="panel"><h2>Your details</h2><form data-form="profile" novalidate><div class="alert bad" data-msg hidden></div>' +
        field('name', 'Name', 'value="' + e(u.name) + '" autocomplete="name"') + field('email', 'Email', 'type="email" value="' + e(u.email || '') + '" autocomplete="email"', 'Your mobile number ' + e(phoneNice(u.phone) || '') + ' can be changed by our team.') +
        '<button class="btn" type="submit">Save details</button></form></section>' +
      '<section class="panel"><h2>Change password</h2><form data-form="password" novalidate><div class="alert bad" data-msg hidden></div>' +
        pwField('current', 'Current password') + pwField('next', 'New password', 'At least 8 characters.', 'new-password') +
        '<button class="btn" type="submit">Change password</button></form></section>' +
      '<section class="panel"><h2>Sign out</h2><p class="muted" style="margin-bottom:12px">For your family\'s privacy you are signed out automatically after 15 minutes without activity.</p><button class="btn ghost" data-act="signout">' + icon('out') + 'Sign out</button></section></main>';
  }

  // ================================================================ office (admin)
  function adminShell(tab, inner, title, sub, withFilter) {
    setBrand('kareiq');
    var links = [['today', 'Requests', 'inbox'], ['people', 'People and plans', 'people'], ['logins', 'Logins', 'key'], ['activity', 'Activity', 'clock']];
    root.innerHTML = '<div class="admin-wrap"><nav class="side" aria-label="Office">' +
      '<a class="logo" href="#/" style="padding:0;background:none"><img src="/img/kareiq-logo.png" alt="KareIQ"></a>' +
      links.map(function (l) { return '<a href="#/admin' + (l[0] === 'today' ? '' : '/' + l[0]) + '"' + (l[0] === tab ? ' aria-current="page"' : '') + '>' + icon(l[2]) + '<span class="lbl">' + l[1] + '</span>' + (l[0] === 'today' && S.cache.newCount ? '<span class="count">' + S.cache.newCount + '</span>' : '') + '</a>'; }).join('') +
      '<a href="/admin/" target="_blank" rel="noopener">' + icon('globe') + '<span class="lbl">Website text and prices</span></a>' +
      '<div class="bottom"><a href="#/">' + icon('grid') + '<span class="lbl">Open Kare@Home or KareNest</span></a><a href="#/account">' + icon('pen') + '<span class="lbl">Your account</span></a><a href="#" data-act="signout">' + icon('out') + '<span class="lbl">Sign out</span></a></div>' +
      '</nav><main class="admin-main"><div class="head"><div><h1>' + e(title) + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (withFilter ? brandFilter() : '') + '</div><div id="adm">' + inner + '</div></main></div>';
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
      var badge = $('.side a[aria-current] .count'), link = $('.side a[aria-current]');
      if (badge && !S.cache.newCount) badge.remove();
      else if (badge) badge.textContent = S.cache.newCount;
      else if (link && S.cache.newCount) link.insertAdjacentHTML('beforeend', '<span class="count">' + S.cache.newCount + '</span>');
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
  var KIND = { 'plan-request': 'New plan (app)', booking: 'Website booking', enquiry: 'Website enquiry', visit: 'Extra visit', 'family-visit': 'Family visit', question: 'Question', plan: 'Plan change', 'signin-help': 'Sign-in help' };
  function reqHtml(r) {
    var b = r.product ? BRANDS[r.product] : null;
    var purchase = (r.type === 'booking' || r.kind === 'plan-request' || (r.type === 'enquiry' && r.source !== 'app')) && r.product;
    var act = '';
    if (r.kind === 'signin-help' && r.userId) act = '<button class="btn sm" data-act="relink" data-id="' + e(r.userId) + '">' + icon('key') + 'Send sign-in link</button>';
    else if (purchase && !r.appPlanId) act = '<button class="btn sm" data-act="activate" data-ref="' + e(r.reference) + '">' + icon('check') + 'Activate plan</button>';
    else if (purchase && r.appPlanId && r.status !== 'scheduled' && r.status !== 'closed') act = '<button class="btn sm" data-act="activate" data-ref="' + e(r.reference) + '">' + icon('check') + 'Activate plan</button>';
    if (r.personId && r.product) act += '<a class="btn sm ghost" href="#/' + r.product + '/p/' + e(r.personId) + '">Open</a>';
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
      '<p class="muted" style="margin-bottom:14px">' + e(x.id) + (open ? ' <a href="#/' + open.product + '/p/' + e(x.id) + '" data-act="close-go">Open their page</a>' : '') + '</p>' +
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
      return api('POST', 'plans/request', v).then(function (d) {
        if (!d.ok) return d;
        S.cache.planOpts = null;
        closeDialog();
        return loadSession().then(function () { go('#/' + d.product + '/p/' + d.personId); toast('Sent (' + d.reference + '). We will call you soon to confirm.'); });
      });
    },
    claim: function (f, v) {
      return api('POST', 'claim', v).then(function (d) {
        if (!d.ok) return d;
        S.cache.planOpts = null;
        closeDialog();
        return loadSession().then(function () { go(d.product ? '#/' + d.product : '#/'); toast('Booking added to your account.'); });
      });
    },
    visit: function (f, v) {
      var brand = f.getAttribute('data-brand'), id = f.getAttribute('data-id');
      return api('POST', 'people/' + encodeURIComponent(id) + '/visits?product=' + brand, v).then(function (d) {
        if (!d.ok) return d;
        toast('Visit saved. The family can see it now.');
        go('#/' + brand + '/p/' + id);
      });
    },
    ask: function (f, v) {
      return api('POST', 'requests', { product: f.getAttribute('data-brand'), kind: f.getAttribute('data-kind'), personId: v.personId, date: v.date, message: v.message }).then(function (d) {
        if (!d.ok) return d;
        closeDialog(); toast('Request sent (' + d.reference + '). We will be in touch soon.');
        if (route().parts[1] === 'requests') render();
      });
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
      case 'switch': go('#/'); break;
      case 'pick': pickBrand(t); break;
      case 'start-back': S.start = null; render(); break;
      case 'metric': S.cache.trend.metric = t.getAttribute('data-k'); drawTrend(); break;
      case 'period': {
        var k = t.getAttribute('data-k'), tr = S.cache.trend;
        api('GET', 'people/' + encodeURIComponent(tr.id) + '?product=' + tr.brand + '&period=' + k).then(function (d) { if (d.ok) { S.cache.person = d; tr.period = k; drawTrend(); } });
        break;
      }
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
  window.addEventListener('resize', function () { clearTimeout(rsz); rsz = setTimeout(function () { if ($('#trend') && S.cache.trend) drawTrend(); }, 200); });
  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape') { var m = $('.menu:not([hidden])'); if (m) { m.hidden = true; } }
  });

  render();
})();
