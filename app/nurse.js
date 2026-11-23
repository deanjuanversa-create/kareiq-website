/* My KareIQ: the nurse portal (caregiver logins). Loaded only for nurses.
   Nurses see the customers assigned to them, the minimum information needed for a visit with phone
   numbers masked, their own schedule and visits, and can submit documents (never open them).
   Everything shown here is also enforced by the server; hiding a button is never the only guard. */
(function () {
  'use strict';
  var K = window.KQ, S = K.S, e = K.e, $ = K.$, $$ = K.$$, icon = K.icon, api = K.api;

  var ONB_ITEM = ['nurse/onboarding', 'Customer Onboarding', 'check'];
  var MENU = [
    ['nurse/visits', 'My visits', 'route'],
    ['nurse/schedule', 'Scheduler', 'cal'],
    ['nurse/customers', 'Assigned customers', 'people'],
    ONB_ITEM,
    { k: 'assess', label: 'Assessment', icon: 'clip', sub: [['assess/regular', 'Regular Checkup', 'pulse']] },
    { k: 'upl', label: 'Upload Documents', icon: 'upload', sub: [['nurse/upload', 'Upload', 'upload'], ['nurse/submissions', 'Your Submissions', 'file']] },
    ['nurse/me', 'My leave and training', 'cal'],
    ['nurse/notifications', 'Notifications', 'bell']
  ];
  var STATUS = { awaiting_assignment: 'Awaiting assignment', assigned: 'Assigned to you', accepted: 'Accepted', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
  var SLOT = { morning: 'Morning, 8 AM to 12 PM', evening: 'Evening, 2 PM to 6 PM' };
  var ACTIVE = ['assigned', 'accepted', 'in_progress'];
  var CATS = { cardiac: 'Cardiac', sugar: 'Blood Sugar', general: 'General', imaging: 'Imaging', prescription: 'Prescriptions', others: 'Others' };
  var DOW = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  // ---------------------------------------------------------------- dates (all in India time, as YYYY-MM-DD)
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function monday(iso) { var d = new Date(iso + 'T12:00:00Z'); return addDays(iso, -((d.getUTCDay() + 6) % 7)); }
  function dayName(iso) { return new Intl.DateTimeFormat('en-IN', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')); }
  function shortDay(iso) { return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')); }
  function when(v) { return v.start ? K.hm12(v.start) + (v.end ? ' to ' + K.hm12(v.end) : '') : SLOT[v.slot] || v.slot; }
  function rel(iso) { var t = K.todayIST(); return iso === t ? 'Today' : iso === addDays(t, 1) ? 'Tomorrow' : iso === addDays(t, -1) ? 'Yesterday' : shortDay(iso); }

  function shell(active, inner) { K.shell(active, '<div class="npage">' + inner + '</div>'); }
  function head(title, sub, right) { return '<div class="head"><div><h1>' + e(title) + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (right || '') + '</div>'; }
  function pill(status) { return '<span class="vpill ' + e(status) + '">' + e(STATUS[status] || status) + '</span>'; }
  function brandTags(list) { return (list || []).map(function (b) { return '<span class="tagb ' + e(b) + '">' + e(b === 'karenest' ? 'KareNest' : 'Kare@Home') + '</span>'; }).join(''); }
  function avatar(c, lg) {
    var src = c.photo ? '/api/app/people/' + encodeURIComponent(c.id) + '/photo?v=' + encodeURIComponent(c.photo) : '';
    return '<span class="nav-av' + (lg ? ' lg' : '') + '">' + (src ? '<img src="' + e(src) + '" alt="" loading="lazy">' : e(K.initials(c.name))) + '</span>';
  }
  function fail(d) { K.pageError(d); }

  // ---------------------------------------------------------------- data
  function customers(force) {
    if (S.cache.ncust && !force) return Promise.resolve(S.cache.ncust);
    return api('GET', 'nurse/customers').then(function (d) { if (d.ok) S.cache.ncust = d.rows; return d.ok ? d.rows : Promise.reject(d); });
  }
  function visits(from, to) { return api('GET', 'nurse/visits?from=' + from + '&to=' + to); }

  // ================================================================ My visits
  // Today first, then upcoming, completed and cancelled. Status changes: accept, start, complete.
  function visitsPage(r) {
    var tab = ['today', 'upcoming', 'completed', 'cancelled'].indexOf(r.q.tab) > -1 ? r.q.tab : 'today';
    shell('nurse/visits', head('Good ' + greeting() + ', ' + K.first(S.me.user.name), 'Your assigned visits. Accept a visit, start it when you arrive and complete it when you leave.') + K.loading(90) + K.loading(260));
    var t = K.todayIST();
    visits(addDays(t, -60), addDays(t, 90)).then(function (d) {
      if (!d.ok) return fail(d);
      S.cache.nvisits = d.rows;
      var rows = d.rows;
      var today = rows.filter(function (v) { return v.date === t && v.status !== 'cancelled'; });
      var up = rows.filter(function (v) { return v.date > t && ACTIVE.indexOf(v.status) > -1; });
      var done = rows.filter(function (v) { return v.status === 'completed'; }).reverse();
      var canc = rows.filter(function (v) { return v.status === 'cancelled'; }).reverse();
      var lists = { today: today, upcoming: up, completed: done, cancelled: canc };
      var toAccept = rows.filter(function (v) { return v.status === 'assigned' && v.date >= t; }).length;
      var kpi = '<div class="nkpis">' +
        nk('Today', today.filter(function (v) { return v.status !== 'completed'; }).length, 'route', 'still to do') +
        nk('This week', rows.filter(function (v) { return v.date >= monday(t) && v.date <= addDays(monday(t), 6) && v.status !== 'cancelled'; }).length, 'cal', 'visits') +
        nk('To accept', toAccept, 'check', toAccept ? 'waiting for you' : 'all accepted') +
        nk('Completed', done.filter(function (v) { return v.date >= addDays(t, -30); }).length, 'star', 'in 30 days') + '</div>';
      var tabs = '<div class="ntabs" role="tablist">' + [['today', 'Today'], ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(function (x) {
        return '<a role="tab" href="#/nurse/visits?tab=' + x[0] + '" aria-selected="' + (tab === x[0]) + '">' + x[1] + ' <b>' + lists[x[0]].length + '</b></a>';
      }).join('') + '</div>';
      var list = lists[tab];
      var body = list.length ? '<div class="vlist">' + groupByDay(list).map(function (g) {
        return '<h2 class="vday">' + e(rel(g.date)) + (rel(g.date) !== shortDay(g.date) ? ' <span class="muted">' + e(shortDay(g.date)) + '</span>' : '') + '</h2>' + g.rows.map(visitCard).join('');
      }).join('') + '</div>' : '<div class="empty"><b>' + { today: 'No visits today', upcoming: 'No upcoming visits', completed: 'No completed visits yet', cancelled: 'No cancelled visits' }[tab] + '</b>' + (tab === 'today' ? 'New visits appear here as soon as they are assigned to you, and you get a notification.' : '') + '</div>';
      $('#mn').innerHTML = '<div class="npage">' + head('Good ' + greeting() + ', ' + K.first(S.me.user.name), 'Your assigned visits. Accept a visit, start it when you arrive and complete it when you leave.', '<a class="btn ghost sm" href="#/nurse/schedule">' + icon('cal') + 'Open the scheduler</a>') + kpi + tabs + '<div class="tabpanel" role="tabpanel">' + body + '</div></div>';
      countUp();
    });
  }
  function nk(label, n, ic, sub) { return '<div class="nkpi"><span class="nki">' + icon(ic) + '</span><div><span class="muted small">' + e(label) + '</span><b data-count="' + n + '">' + n + '</b><span class="muted small">' + e(sub) + '</span></div></div>'; }
  function greeting() { var h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', hourCycle: 'h23' }).format(new Date())); return h < 12 ? 'morning' : h < 17 ? 'afternoon' : 'evening'; }
  function groupByDay(list) { var out = []; list.forEach(function (v) { var g = out[out.length - 1]; if (!g || g.date !== v.date) out.push(g = { date: v.date, rows: [] }); g.rows.push(v); }); return out; }
  function visitCard(v) {
    var acts = '';
    if (v.status === 'assigned') acts += '<button class="btn sm" data-act="nv-status" data-id="' + e(v.id) + '" data-s="accepted">' + icon('check') + 'Accept</button>';
    if (v.status === 'assigned' || v.status === 'accepted') acts += '<button class="btn sm ' + (v.status === 'accepted' ? '' : 'ghost') + '" data-act="nv-status" data-id="' + e(v.id) + '" data-s="in_progress">' + icon('play') + 'Start visit</button>';
    if (v.status === 'in_progress') acts += '<a class="btn sm ghost" href="#/assess/regular?p=' + e(v.personId) + '">' + icon('pulse') + 'Regular Checkup</a><button class="btn sm" data-act="nv-status" data-id="' + e(v.id) + '" data-s="completed">' + icon('check') + 'Complete visit</button>';
    return '<article class="vcard2 ' + e(v.status) + '"><div class="vtime"><b>' + e(v.start ? K.hm12(v.start) : (v.slot === 'evening' ? 'Evening' : 'Morning')) + '</b><span>' + e(v.end ? 'to ' + K.hm12(v.end) : '') + '</span></div>' +
      '<div class="vbody"><div class="vtop">' + pill(v.status) + '<span class="muted small">' + e(v.reference) + '</span></div>' +
      '<h3><a href="#/nurse/customer?p=' + e(v.personId) + '">' + e(v.customerName) + '</a></h3>' +
      '<p class="vmeta">' + icon('box') + e(v.serviceName) + ' · ' + brandTags([v.product]) + '</p>' +
      (v.location ? '<p class="vmeta">' + icon('home') + e(v.location) + '</p>' : '') +
      (v.note ? '<p class="vnote">' + e(v.note) + '</p>' : '') +
      (acts ? '<div class="vacts">' + acts + '</div>' : '') + '</div></article>';
  }

  // ================================================================ Scheduler: day, week and month
  function schedulePage(r) {
    var view = ['day', 'week', 'month'].indexOf(r.q.view) > -1 ? r.q.view : 'week';
    var show = ['upcoming', 'completed', 'cancelled', 'all'].indexOf(r.q.show) > -1 ? r.q.show : 'all';
    var at = /^\d{4}-\d{2}-\d{2}$/.test(r.q.d || '') ? r.q.d : K.todayIST();
    var range = view === 'day' ? [at, at] : view === 'week' ? [monday(at), addDays(monday(at), 6)] : monthRange(at);
    var step = function (n) { return view === 'day' ? addDays(at, n) : view === 'week' ? addDays(at, 7 * n) : shiftMonth(at, n); };
    var link = function (q) { return '#/nurse/schedule' + K.queryOf({ q: { view: view, show: show, d: at } }, q); };
    var title = view === 'day' ? dayName(at) : view === 'week' ? shortDay(range[0]) + ' to ' + shortDay(range[1]) : MONTHS[Number(at.slice(5, 7)) - 1] + ' ' + at.slice(0, 4);
    var bar = '<div class="caltools"><div class="seg3" role="group" aria-label="View">' + ['day', 'week', 'month'].map(function (v) { return '<a href="' + link({ view: v }) + '" aria-pressed="' + (v === view) + '">' + v.charAt(0).toUpperCase() + v.slice(1) + '</a>'; }).join('') + '</div>' +
      '<div class="calnav"><a class="ib" href="' + link({ d: step(-1) }) + '" aria-label="Previous">' + icon('left') + '</a><a class="btn sm ghost" href="' + link({ d: K.todayIST() }) + '">Today</a><a class="ib" href="' + link({ d: step(1) }) + '" aria-label="Next">' + icon('right') + '</a><b class="caltitle">' + e(title) + '</b></div>' +
      '<label class="sortby">Show <select data-act="ns-show" aria-label="Which visits to show">' + [['all', 'All visits'], ['upcoming', 'Upcoming'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(function (x) { return '<option value="' + x[0] + '"' + (x[0] === show ? ' selected' : '') + '>' + x[1] + '</option>'; }).join('') + '</select></label></div>';
    shell('nurse/schedule', head('Scheduler', 'Your visits by day, week or month. Morning visits run 8 AM to 12 PM and evening visits 2 PM to 6 PM.') + bar + K.loading(380));
    visits(range[0], range[1]).then(function (d) {
      if (!d.ok) return fail(d);
      var t = K.todayIST();
      var rows = d.rows.filter(function (v) { return show === 'all' || (show === 'upcoming' ? ACTIVE.indexOf(v.status) > -1 && v.date >= t : v.status === show); });
      var body = view === 'day' ? dayView(at, rows) : view === 'week' ? weekView(range[0], rows, link) : monthView(at, rows, link);
      $('#mn').innerHTML = '<div class="npage">' + head('Scheduler', 'Your visits by day, week or month. Morning visits run 8 AM to 12 PM and evening visits 2 PM to 6 PM.') + bar +
        '<div class="calwrap cal-' + view + '">' + body + '</div><p class="calkey">' + ['assigned', 'accepted', 'in_progress', 'completed', 'cancelled'].map(function (s) { return '<span><i class="ck-' + s + '"></i>' + e(STATUS[s]) + '</span>'; }).join('') + '</p></div>';
    });
  }
  function monthRange(at) { var a = at.slice(0, 8) + '01'; var b = addDays(shiftMonth(a, 1), -1); return [monday(a), addDays(monday(b), 6)]; }
  function shiftMonth(iso, n) { var y = Number(iso.slice(0, 4)), m = Number(iso.slice(5, 7)) - 1 + n; var d = new Date(Date.UTC(y, m, 1)); return d.toISOString().slice(0, 10); }
  function chip(v) { return '<a class="vchip ck-' + e(v.status) + '" href="#/nurse/customer?p=' + e(v.personId) + '" title="' + e(v.customerName + ', ' + v.serviceName + ', ' + STATUS[v.status]) + '"><b>' + e(v.start ? K.hm12(v.start) : '') + '</b> ' + e(v.customerName) + '<span>' + e(v.serviceName) + '</span></a>'; }
  function dayView(at, rows) {
    return ['morning', 'evening'].map(function (s) {
      var list = rows.filter(function (v) { return v.date === at && v.slot === s; });
      return '<section class="slotcol"><h3>' + e(SLOT[s]) + '</h3>' + (list.length ? list.map(visitCard).join('') : '<p class="muted slotempty">No visits in this slot.</p>') + '</section>';
    }).join('');
  }
  function weekView(mon, rows, link) {
    var t = K.todayIST();
    var days = [0, 1, 2, 3, 4, 5, 6].map(function (i) { return addDays(mon, i); });
    return '<div class="wk" role="table" aria-label="Week"><div class="wk-r wk-h" role="row"><span role="columnheader"></span>' + days.map(function (d, i) { return '<a role="columnheader" class="' + (d === t ? 'now' : '') + '" href="' + link({ view: 'day', d: d }) + '">' + DOW[i] + '<b>' + Number(d.slice(8)) + '</b></a>'; }).join('') + '</div>' +
      ['morning', 'evening'].map(function (s) {
        return '<div class="wk-r" role="row"><span class="wk-s" role="rowheader">' + (s === 'morning' ? 'Morning<small>8 AM to 12 PM</small>' : 'Evening<small>2 PM to 6 PM</small>') + '</span>' + days.map(function (d) {
          var list = rows.filter(function (v) { return v.date === d && v.slot === s; });
          return '<div role="cell" class="wk-c' + (d === t ? ' now' : '') + '" data-l="' + e(shortDay(d)) + '">' + list.map(chip).join('') + '</div>';
        }).join('') + '</div>';
      }).join('') + '</div>' +
      // on a phone the same week reads as a list, one day under the other
      '<div class="wk-agenda">' + days.map(function (d) {
        var list = rows.filter(function (v) { return v.date === d; });
        return '<div class="wka' + (d === t ? ' now' : '') + '"><a href="' + link({ view: 'day', d: d }) + '"><b>' + e(rel(d)) + '</b>' + (rel(d) !== shortDay(d) ? ' <span class="muted small">' + e(shortDay(d)) + '</span>' : '') + '</a>' + (list.length ? list.map(chip).join('') : '<span class="muted small">No visits</span>') + '</div>';
      }).join('') + '</div>';
  }
  function monthView(at, rows, link) {
    var t = K.todayIST(), mm = at.slice(0, 7), start = monthRange(at)[0], cells = [];
    for (var i = 0; i < 42; i++) { var d = addDays(start, i); if (i >= 35 && d.slice(0, 7) !== mm) break; cells.push(d); }
    return '<div class="mo"><div class="mo-h">' + DOW.map(function (x) { return '<span>' + x + '</span>'; }).join('') + '</div><div class="mo-g">' + cells.map(function (d) {
      var list = rows.filter(function (v) { return v.date === d; });
      return '<a class="mo-c' + (d.slice(0, 7) !== mm ? ' out' : '') + (d === t ? ' now' : '') + '" href="' + link({ view: 'day', d: d }) + '" aria-label="' + e(dayName(d) + ', ' + list.length + ' visits') + '"><b>' + Number(d.slice(8)) + '</b>' +
        (list.length ? '<span class="mo-dots">' + list.slice(0, 4).map(function (v) { return '<i class="ck-' + e(v.status) + '"></i>'; }).join('') + '</span><span class="mo-n">' + list.length + (list.length === 1 ? ' visit' : ' visits') + '</span>' : '') + '</a>';
    }).join('') + '</div></div>';
  }

  // ================================================================ Assigned customers
  function customersPage() {
    shell('nurse/customers', head('Assigned customers', 'The customers you look after. Open one for the details you need for a visit.') + K.loading(260));
    customers(true).then(function (rows) {
      $('#mn').innerHTML = '<div class="npage">' + head('Assigned customers', 'The customers you look after. Open one for the details you need for a visit.', '<label class="nsearch">' + icon('eye') + '<input class="in" type="search" data-act="n-filter" placeholder="Search by name or customer ID" aria-label="Search customers"></label>') +
        (rows.length ? '<div class="ncards">' + rows.map(function (c) {
          var ob = c.onboarding === 'completed' ? '<span class="pill active"><i></i>Onboarded</span>' : c.onboarding === 'pending' ? '<a class="pill pending" href="#/assess/onboarding?p=' + e(c.id) + '"><i></i>Ready for onboarding</a>' : '';
          return '<article class="ncard" data-find="' + e((c.name + ' ' + c.customerId).toLowerCase()) + '"><div class="nc-top">' + avatar(c) + '<div><h2 class="nch">' + e(c.name) + '</h2><span class="muted small">' + e(c.customerId) + '</span><div class="ptags">' + brandTags(c.brands) + '</div></div>' + (ob ? '<span class="nc-ob">' + ob + '</span>' : '') + '</div>' +
            (c.photoDue ? '<p class="nc-photo"><button type="button" class="phdue-btn" data-act="photo-cam" data-id="' + e(c.id) + '" data-name="' + e(c.name) + '">' + icon('camera') + '<span><b>' + (c.photo ? 'New photo due' : 'Photo needed') + '</b> · ' + (c.photo ? 'the photo is more than 6 months old' : 'no photo yet') + '. Take it now</span></button></p>' : '') +
            '<p class="nc-next">' + icon('clock') + (c.next ? '<span>Next visit: <b>' + e(rel(c.next.date)) + ', ' + e(c.next.start ? K.hm12(c.next.start) : SLOT[c.next.slot]) + '</b> · ' + e(c.next.serviceName) + '</span>' : '<span class="muted">No visit scheduled</span>') + '</p>' +
            '<div class="nc-acts"><a class="btn sm" href="#/nurse/customer?p=' + e(c.id) + '">' + icon('idcard') + 'Customer details</a><a class="btn sm ghost" href="#/assess/regular?p=' + e(c.id) + '">' + icon('pulse') + 'Regular Checkup</a><a class="btn sm ghost" href="#/nurse/upload?p=' + e(c.id) + '">' + icon('upload') + 'Upload</a></div></article>';
        }).join('') + '</div><p class="empty" data-none hidden><b>No customer matches</b>Try another name or ID.</p>' : '<div class="empty"><b>No customers are assigned to you yet</b>The office assigns customers, and new visits appear under My visits.</div>') +
        '<p class="note">' + icon('shield') + '<span>For privacy, nurses do not see health history, medical records or risk results. Record visits under Assessment and upload reports: they are read automatically and the family and the office see the results. Phone numbers stay hidden until you need them for a visit or an emergency.</span></p></div>';
    }, fail);
  }

  // ================================================================ Customer information (restricted)
  function customerPage(r) {
    shell('nurse/customers', head('Assigned customers', '') + K.loading(120) + K.loading(300));
    customers().then(function (list) {
      if (!list.length) { $('#mn').innerHTML = '<div class="npage">' + head('Assigned customers', '') + '<div class="empty"><b>No customers are assigned to you yet</b>The office assigns customers to you.</div></div>'; return; }
      var pick = list.filter(function (x) { return x.id === r.q.p; })[0] || list.filter(function (x) { return x.id === S.pid; })[0] || list[0];
      S.pid = pick.id;
      if (r.q.p !== pick.id) history.replaceState(null, '', '#/nurse/customer?p=' + encodeURIComponent(pick.id));
      api('GET', 'nurse/customers/' + encodeURIComponent(pick.id)).then(function (d) {
        if (!d.ok) return fail(d);
        S.cache.ncard = d.customer; S.cache.nopen = {};
        var fresh = S.cache.justOnboarded === pick.id; S.cache.justOnboarded = null;
        $('#mn').innerHTML = '<div class="npage">' + head('Assigned customers', 'The customer\'s general and onboarding information. Contact numbers stay masked; use Request Access when you need one.', '<a class="btn sm ghost" href="#/nurse/customers">' + icon('left') + 'All assigned customers</a>') + selectBar(list, pick) +
          cardHtml(d.customer) + '</div>';
        if (fresh) { var pl = $('.ngrid .panel-h .pill.active'); if (pl) pl.classList.add('celebrate'); }
      });
    }, fail);
  }
  function selectBar(list, pick) {
    return '<div class="pbar"><div class="pbar-l">' + (list.length > 1 ? '<label class="pp" data-ini="' + e(K.initials(pick.name)) + '"><span class="sr">Customer</span><select data-act="nc-pick" aria-label="Choose a customer">' + list.map(function (x) { return '<option value="' + e(x.id) + '"' + (x.id === pick.id ? ' selected' : '') + '>' + e(x.name) + '</option>'; }).join('') + '</select>' + icon('down') + '</label>' : '<span class="pp one" data-ini="' + e(K.initials(pick.name)) + '">' + e(pick.name) + '</span>') + '</div>' +
      '<div class="pbar-r"><a class="btn sm ghost" href="#/nurse/upload?p=' + e(pick.id) + '">' + icon('upload') + 'Upload a document</a></div></div>';
  }
  function masked(cat, key, val, label) {
    if (!val) return '';
    return '<div class="mrow"><dt>' + e(label) + '</dt><dd><span class="mval" data-cat="' + cat + '" data-f="' + key + '">' + e(val) + '</span></dd></div>';
  }
  function accessBtn(c, cat) {
    var st = c.access[cat];
    if (st.approvalOnly) {
      var out = '';
      if (st.open) out += '<button class="btn sm quiet" data-act="nc-access" data-cat="' + cat + '">' + icon('eye') + 'Show approved details</button>';
      if (st.pending) return out + '<span class="pill pending"><i></i>Waiting for office approval</span>';
      var left = ['phone1', 'phone2', 'email'].filter(function (k) { return (st.fields || []).indexOf(k) === -1 && c.general[k]; });
      return out + (left.length ? '<button class="btn sm ghost" data-act="nc-request" data-cat="' + cat + '">' + icon('lock') + 'Request Access</button>' : '');
    }
    if (st.open) return '<button class="btn sm quiet" data-act="nc-access" data-cat="' + cat + '">' + icon('eye') + 'Show contact information</button>';
    if (st.pending) return '<span class="pill pending"><i></i>Waiting for office approval</span>';
    return '<button class="btn sm ghost" data-act="nc-access" data-cat="' + cat + '">' + icon('lock') + 'Access contact information</button>';
  }
  // Request Access: the nurse chooses which of the customer's details, and says why; the office decides
  function requestDialog(cat) {
    var c = S.cache.ncard, g = c.general, st = c.access[cat];
    var opts = [['phone1', 'Primary Contact Number'], ['phone2', 'Secondary Contact Number'], ['email', 'Email']].filter(function (x) { return g[x[0]] && (st.fields || []).indexOf(x[0]) === -1; });
    K.openDialog('Request Access', '<form data-form="n-request" data-cat="' + e(cat) + '" novalidate><div class="alert bad" data-msg hidden></div>' +
      '<p class="muted" style="margin-bottom:12px">The office approves or rejects each request. Only the details they approve are shown to you, for ' + e(c.name) + ' only, and only for a limited time.</p>' +
      '<fieldset class="ckset"><legend>Which details do you need?</legend>' + opts.map(function (x) { return '<label class="ck"><input type="checkbox" name="fields" value="' + x[0] + '"' + (x[0] === 'phone1' ? ' checked' : '') + '><span>' + e(x[1]) + ' <span class="muted small">' + e(g[x[0]]) + '</span></span></label>'; }).join('') + '</fieldset><em class="err" data-err="fields"></em>' +
      '<label class="field"><span>Why do you need it?</span><textarea class="in" name="reason" maxlength="300" required placeholder="e.g. To confirm tomorrow\'s visit time with the customer"></textarea><em class="err" data-err="reason"></em></label>' +
      '<p class="dl-period">' + icon('shield') + '<span>The office sees your name, the customer, the time and this reason. Every view of an approved number is recorded.</span></p></form>',
      '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Send request</button>');
  }
  K.FORMS['n-request'] = function (f, v) {
    var fields = $$('input[name=fields]', f).filter(function (x) { return x.checked; }).map(function (x) { return x.value; });
    var errs = {};
    if (!fields.length) errs.fields = 'Choose at least one';
    if ((v.reason || '').trim().length < 5) errs.reason = 'Say why you need it.';
    if (Object.keys(errs).length) return Promise.resolve({ ok: false, errors: errs });
    var c = S.cache.ncard;
    return api('POST', 'nurse/contact-access', { personId: c.id, category: f.getAttribute('data-cat'), fields: fields, reason: v.reason, request: true }).then(function (d) {
      if (!d.ok) return d;
      K.closeDialog(); K.toast(d.message || 'Sent to the office.'); c.access[f.getAttribute('data-cat')].pending = true; rerender();
    });
  };
  function cardHtml(c) {
    var g = c.general;
    var facts = [g.age != null ? g.age + ' years' : '', g.gender].filter(Boolean).join(' · ');
    var onb = c.onboarding || {};
    var gen = '<section class="panel nsec"><div class="panel-h"><h2>General information</h2>' + (onb.status === 'completed' ? '<span class="pill active"><i></i>Onboarded</span>' : '<span class="pill pending"><i></i>Onboarding not completed</span>') + '</div><dl class="rogrid">' +
      ro('Customer ID', c.customerId) + ro('Name', g.name) + ro('Date of Birth', g.dob ? K.date(g.dob) : '') + ro('Age', g.age != null ? g.age + ' years' : '') + ro('Gender', g.gender) + ro('Blood Group', g.bloodGroup) + ro('Qualifications', g.qualification) + ro('Languages Spoken', g.languages) + ro('Address', g.address, true) + '</dl>' +
      (onb.status === 'completed' ? '<p class="muted small">Onboarding completed on ' + e(K.dt(onb.completedAt)) + ' by ' + e(onb.completedBy) + '. <a href="#/assess/onboarding?p=' + e(c.id) + '">Open the onboarding record</a></p>' : '') + '</section>';
    var contact = '<section class="panel nsec"><div class="panel-h"><h2>' + icon('phone') + 'Customer contact</h2>' + accessBtn(c, 'customer') + '</div><dl class="mlist">' +
      (masked('customer', 'phone1', g.phone1, 'Primary Contact Number') + masked('customer', 'phone2', g.phone2, 'Secondary Contact Number') + masked('customer', 'email', g.email, 'Email') || '<p class="muted">No contact number is on file.</p>') + '</dl>' +
      (c.access.customer.approvalOnly ? '<p class="muted small">Masked by default. Use Request Access: the office approves each request, and only the details they approve are shown.</p>' : '') + '</section>';
    var emerg = '<section class="panel nsec"><div class="panel-h"><h2>' + icon('shield') + 'Emergency contacts</h2>' + (c.emergency.length ? accessBtn(c, 'emergency') : '') + '</div>' +
      (c.emergency.length ? c.emergency.map(function (x, i) {
        return '<div class="ecard"><b>' + e(x.name || 'Emergency contact ' + (i + 1)) + '</b><span class="muted small">' + e([x.relation, x.gender, x.languages].filter(Boolean).join(' · ')) + '</span><dl class="mlist">' +
          masked('emergency', 'ec' + (i + 1) + 'Phone', x.phone, 'Phone') + masked('emergency', 'ec' + (i + 1) + 'Email', x.email, 'Email') + '</dl></div>';
      }).join('') : '<p class="muted">No emergency contact is on file. Ask the office to add one.</p>') + '</section>';
    var docs = '<section class="panel nsec"><div class="panel-h"><h2>' + icon('heart') + 'Doctors</h2>' + (c.doctors.length ? accessBtn(c, 'doctor') : '') + '</div>' +
      (c.doctors.length ? c.doctors.map(function (x, i) {
        return '<div class="ecard"><b>' + e(x.name || (i ? 'Specialist' : 'Family doctor')) + '</b><span class="muted small">' + e([i ? 'Specialist' : 'Family doctor', x.hospital, x.address].filter(Boolean).join(' · ')) + '</span><dl class="mlist">' +
          masked('doctor', i ? 'sdPhone' : 'fdPhone', x.phone, 'Phone') + (i ? masked('doctor', 'sdHospitalPhone', x.hospitalPhone, 'Hospital') : '') + '</dl></div>';
      }).join('') : '<p class="muted">No doctor is on file.</p>') + '</section>';
    var up = '<section class="panel nsec"><h2>Your visits with ' + e(K.first(c.name)) + '</h2>' + (c.upcoming.length ? '<ul class="rlist">' + c.upcoming.map(function (v) {
      return '<li><span><b>' + e(rel(v.date)) + ', ' + e(v.start ? K.hm12(v.start) : SLOT[v.slot]) + '</b><br><span class="muted small">' + e(v.serviceName) + ' · ' + e(v.reference) + '</span></span>' + pill(v.status) + '</li>';
    }).join('') + '</ul>' : '<p class="muted">No upcoming visit.</p>') + '</section>';
    var pol = '<p class="note">' + icon('lock') + '<span>The customer\'s own numbers open only after the office approves your request. Emergency and doctor numbers: ' + e(c.access.policyText) + '. ' + (c.access.visitNow ? '<b>Your visit ' + e(c.access.visitNow.reference) + ' is on now, so those numbers open without a reason.</b> ' : '') + 'Every time you open a number it is recorded for the office.</span></p>';
    return '<section class="phead ncard-h"><div class="avatar">' + (c.photo ? '<img src="/api/app/people/' + encodeURIComponent(c.id) + '/photo?v=' + encodeURIComponent(c.photo) + '" alt="Photo of ' + e(c.name) + '" width="112" height="112">' : '<span class="ph" role="img" aria-label="No photo">' + icon('user') + '</span>') + '</div>' +
      '<div class="phead-t"><h2>' + e(c.name) + '</h2><p class="muted">' + e(facts) + '</p><div class="ptags" style="margin-top:8px">' + brandTags(c.brands) + '</div>' +
        // a photo is taken when there is none, then again when it is 6 months old (not before)
        '<div class="phctl">' + (!c.photo || (c.photoDue && c.photoDue.due) ? '<button type="button" class="btn sm" data-act="photo-cam" data-id="' + e(c.id) + '" data-name="' + e(c.name) + '">' + icon('camera') + (c.photo ? 'Take a new photo' : 'Take photo') + '</button>' : '') +
          K.photoDueHtml(c.photoDue && (c.photoDue.required || c.photo) ? c.photoDue : null) + '</div></div></section>' +
      pol + '<div class="ngrid">' + gen + contact + emerg + docs + up + '</div>';
  }
  function ro(label, v, wide) { return '<div class="rof' + (wide ? ' wide' : '') + '"><dt>' + e(label) + '</dt><dd>' + (v ? e(v) : '<span class="muted">Not given</span>') + '</dd></div>'; }

  // asking to see a number: the server decides from the policy, the visit and the reason
  function askAccess(cat, extra) {
    var c = S.cache.ncard; if (!c) return Promise.resolve();
    return api('POST', 'nurse/contact-access', Object.assign({ personId: c.id, category: cat }, extra || {})).then(function (d) {
      if (!d.ok) {
        if (extra) return d; // shown in the dialog
        if (d.errors && d.errors.reason) emergencyDialog(cat); else K.toast(d.message || 'Not available.', 'bad');
        return;
      }
      if (d.result === 'granted') { K.closeDialog(); reveal(cat, d.values || {}, d.expiresAt); K.toast('Contact information shown until ' + clock(d.expiresAt) + '. This is recorded.'); return; }
      if (d.result === 'pending') { K.closeDialog(); K.toast(d.message); c.access[cat].pending = true; rerender(); return; }
      if (d.needsEmergency) { emergencyDialog(cat, d.message); return; }
      K.toast(d.message || 'Not available.', 'bad');
    });
  }
  function clock(iso) { return new Intl.DateTimeFormat('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' }).format(new Date(iso)); }
  function reveal(cat, values, until) {
    S.cache.nopen[cat] = true;
    $$('.mval[data-cat="' + cat + '"]').forEach(function (el) {
      var v = values[el.getAttribute('data-f')];
      if (!v) return;
      var isMail = /@/.test(v);
      el.innerHTML = '<a href="' + (isMail ? 'mailto:' : 'tel:') + e(isMail ? v : v.replace(/[^\d+]/g, '')) + '">' + e(isMail ? v : K.phoneNice(v) || v) + '</a>';
      el.classList.add('open');
    });
    var btn = $('[data-act=nc-access][data-cat="' + cat + '"]');
    if (btn) btn.outerHTML = '<span class="pill active"><i></i>Visible until ' + e(clock(until)) + '</span>';
    // hidden again when the access ends (and on leaving the page)
    var ms = Math.min(Date.parse(until) - Date.now(), 6 * 3600000);
    setTimeout(function () { if (S.cache.ncard && S.cache.nopen[cat]) { S.cache.nopen[cat] = false; var rr = K.route(); if (rr.parts.join('/') === 'nurse/customer') K.render(); } }, Math.max(1000, ms));
  }
  function rerender() { var c = S.cache.ncard; if (!c) return; var list = S.cache.ncust || []; $('#mn').innerHTML = '<div class="npage">' + head('Assigned customers', 'The customer\'s general and onboarding information. Contact numbers stay masked; use Request Access when you need one.', '<a class="btn sm ghost" href="#/nurse/customers">' + icon('left') + 'All assigned customers</a>') + selectBar(list, list.filter(function (x) { return x.id === c.id; })[0] || c) + cardHtml(c) + '</div>'; }
  function emergencyDialog(cat, msg) {
    var pol = S.cache.ncard.access.policy;
    var approval = pol === 'approval';
    K.openDialog(approval ? 'Ask the office for this number' : 'Is this an emergency?',
      '<form data-form="n-access" data-cat="' + e(cat) + '" data-emergency="' + (!approval) + '" novalidate><div class="alert bad" data-msg hidden></div>' +
      '<p class="muted" style="margin-bottom:12px">' + e(msg || (approval ? 'The office approves each request. The number stays hidden until they do.' : 'Numbers open during your assigned visit. Outside a visit, only in an emergency.')) + '</p>' +
      '<label class="field"><span>' + (approval ? 'Why do you need it?' : 'What is happening?') + '</span><textarea class="in" name="reason" maxlength="300" required placeholder="' + (approval ? 'e.g. To confirm tomorrow\'s visit time' : 'e.g. She has fallen and the door is locked') + '"></textarea><em class="err" data-err="reason"></em></label>' +
      '<p class="dl-period">' + K.icon('shield') + '<span>The office sees your name, the customer, the time and this reason. The number itself is never stored in the record.</span></p></form>',
      '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">' + (approval ? 'Send to the office' : 'Show the number now') + '</button>');
  }
  K.FORMS['n-access'] = function (f, v) {
    var em = f.getAttribute('data-emergency') === 'true';
    if ((v.reason || '').length < (em ? 10 : 5)) return Promise.resolve({ ok: false, errors: { reason: em ? 'Describe the emergency in a few words.' : 'Say why you need it.' } });
    return askAccess(f.getAttribute('data-cat'), { reason: v.reason, emergency: em });
  };

  // ================================================================ Upload Documents (submit only): Upload, Your Submissions
  var UP_SUB = 'Send a report or prescription for a customer. It is read automatically and the results go into the customer\'s health records.';
  function uploadPage(r) {
    shell('nurse/upload', head('Upload', UP_SUB) + K.loading(300));
    customers().then(function (list) {
      var pre = list.filter(function (c) { return c.id === r.q.p; })[0];
      var form = '<section class="panel nsec"><h2>New document</h2>' + (list.length ? '<form data-form="n-upload" novalidate><div class="alert bad" data-msg hidden></div>' +
        '<label class="field"><span>Customer</span><select class="in" name="personId" required><option value="">Choose a customer</option>' + list.map(function (c) { return '<option value="' + e(c.id) + '"' + (pre && pre.id === c.id ? ' selected' : '') + '>' + e(c.name + ' (' + c.customerId + ')') + '</option>'; }).join('') + '</select><em class="err" data-err="personId"></em></label>' +
        '<div class="row2">' + K.field('name', 'Document name', 'maxlength="80" placeholder="e.g. Blood test report" required') + '<label class="field"><span>Category</span><select class="in" name="category">' + Object.keys(CATS).map(function (k) { return '<option value="' + k + '"' + (k === 'general' ? ' selected' : '') + '>' + CATS[k] + '</option>'; }).join('') + '</select></label></div>' +
        '<label class="field dropz" data-drop><span>File</span><input class="in" type="file" name="file" data-act="n-file" accept="application/pdf,image/jpeg,image/png,image/webp" capture="environment" required><small>PDF or photo, up to 5 MB. Drop it here, or on a phone take a photo of the document.</small><span class="dropz-pick" data-pick hidden></span><em class="err" data-err="file"></em></label>' +
        '<div class="upstate" data-upstate role="status" aria-live="polite" hidden></div>' +
        '<button class="btn" type="submit">' + icon('upload') + 'Submit document</button></form>' : '<p class="muted">No customers are assigned to you yet.</p>') + '</section>';
      $('#mn').innerHTML = '<div class="npage">' + head('Upload', UP_SUB, '<a class="btn sm ghost" href="#/nurse/submissions">' + icon('file') + 'Your Submissions</a>') + '<div class="nup">' + form + '</div>' +
        '<p class="note">' + icon('lock') + '<span>For privacy, a document cannot be opened, downloaded, replaced or deleted after you submit it. If you sent the wrong file, tell the office.</span></p></div>';
    }, fail);
  }
  function submissionsPage() {
    var sub = 'Receipts for the documents you sent, with where each one is in being read. You never see the values read from them.';
    shell('nurse/submissions', head('Your Submissions', sub) + K.loading(300));
    Promise.all([customers(), api('GET', 'nurse/submissions')]).then(function (x) {
      var list = x[0], subs = x[1];
      if (!subs.ok) return fail(subs);
      var names = {}; list.forEach(function (c) { names[c.id] = c.name; });
      var prev = S.cache.subPrev || {}, now = {};
      subs.rows.forEach(function (s) { now[s.customerId + '|' + s.documentName + '|' + s.submittedAt] = s.status; });
      S.cache.subPrev = now;
      var changed = function (s) { var k = s.customerId + '|' + s.documentName + '|' + s.submittedAt; return prev[k] && prev[k] !== s.status; };
      var receipts = '<section class="panel nsec"><div class="panel-h"><h2>Submitted documents</h2><span class="muted small">' + subs.rows.length + ' sent</span></div>' +
        (subs.rows.length ? '<div class="tw"><table class="stackable rtable"><thead><tr><th>Customer</th><th>Document</th><th>Category</th><th>Submitted</th><th>Processing status</th></tr></thead><tbody>' + subs.rows.map(function (s) {
          return '<tr' + (changed(s) ? ' class="flash"' : '') + '><td data-l="Customer"><b>' + e(names[s.customerId] || s.customerId) + '</b><br><span class="muted small">' + e(s.customerId) + '</span></td><td data-l="Document">' + e(s.documentName) + '</td><td data-l="Category">' + e(CATS[s.category] || s.category || '') + '</td><td data-l="Submitted">' + e(K.dt(s.submittedAt)) + '</td><td data-l="Status"><span class="pchip ' + e(s.processing || (s.status === 'Submitted' ? 'completed' : 'failed')) + '">' + (s.processing === 'uploaded' || s.processing === 'processing' ? '<span class="spin" aria-hidden="true"></span>' : '') + e(s.status) + '</span></td></tr>';
        }).join('') + '</tbody></table></div>' : '<p class="muted">Documents you send appear here as receipts. <a href="#/nurse/upload">Upload a document</a></p>') + '</section>';
      $('#mn').innerHTML = '<div class="npage">' + head('Your Submissions', sub, '<a class="btn sm" href="#/nurse/upload">' + icon('upload') + 'Upload</a>') + receipts + '</div>';
      // the status moves on as documents are read: refresh while any is still being read
      if (subs.rows.some(function (r) { return r.processing === 'uploaded' || r.processing === 'processing'; })) {
        clearTimeout(S.cache.subTick);
        S.cache.subTick = setTimeout(function () { if (location.hash.indexOf('nurse/submissions') > -1 && !$('dialog[open]')) submissionsPage(); }, 5000);
      }
    }, fail);
  }

  // ================================================================ Customer Onboarding
  // Only the assigned customers whose package the office approved and whose payment is confirmed; the
  // server decides who appears and refuses an onboarding for anyone else.
  function onboardingPage() {
    var sub = 'Customers waiting for onboarding: their package is approved and paid. Complete the one-time onboarding at the first visit. Once done, the customer leaves this list and the details show under Assigned customers.';
    shell('nurse/onboarding', head('Customer Onboarding', sub) + K.loading(260));
    api('GET', 'nurse/onboarding').then(function (d) {
      if (!d.ok) return fail(d);
      onbSet(d.rows.length);
      if (!d.rows.length) { K.toast('No customer is waiting for onboarding.'); K.go('#/nurse/customers', true); return; }
      var pend = d.rows.length;
      $('#mn').innerHTML = '<div class="npage">' + head('Customer Onboarding', sub) +
        '<div class="nkpis">' + nk('Waiting for onboarding', pend, 'clock', 'approved and paid') + '</div>' +
        (d.rows.length ? '<div class="ncards">' + d.rows.map(function (c) {
          var g = c.general;
          return '<article class="ncard onbcard"><div class="nc-top">' + avatar(c) + '<div><h2 class="nch">' + e(c.name) + '</h2><span class="muted small">' + e(c.customerId) + '</span><div class="ptags">' + brandTags(c.brands) + '</div></div>' +
              '<span class="pill ' + (c.status === 'completed' ? 'active' : 'pending') + '"><i></i>' + (c.status === 'completed' ? 'Completed' : 'Pending') + '</span></div>' +
            '<dl class="rogrid sm">' + ro('Package', c.package ? c.package.name : '') + ro('Age', g.age != null ? g.age + ' years' : '') + ro('Gender', g.gender) + ro('Blood Group', g.bloodGroup) + ro('Languages Spoken', g.languages) + ro('Primary Contact Number', g.phone1) + ro('Address', g.address, true) + '</dl>' +
            (c.status === 'completed' ? '<p class="muted small">Completed on ' + e(K.dt(c.completedAt)) + ' by ' + e(c.completedBy) + '.</p>' : '') +
            '<div class="nc-acts"><a class="btn sm' + (c.status === 'completed' ? ' ghost' : '') + '" href="#/assess/onboarding?p=' + e(c.id) + '">' + icon(c.status === 'completed' ? 'eye' : 'check') + (c.status === 'completed' ? 'View onboarding' : 'Start onboarding') + '</a><a class="btn sm ghost" href="#/nurse/customer?p=' + e(c.id) + '">' + icon('people') + 'In Assigned customers</a></div></article>';
        }).join('') + '</div>' : '<div class="empty"><b>No customer is ready for onboarding</b>A customer appears here once the office has approved their package and the payment is confirmed.</div>') + '</div>';
      countUp();
    }, fail);
  }
  K.FORMS['n-upload'] = function (f, v) {
    var input = $('[name=file]', f), file = input && input.files && input.files[0], errs = {};
    if (!v.personId) errs.personId = 'Choose a customer';
    if (!v.name) errs.name = 'Name the document';
    if (!file) errs.file = 'Choose a file';
    else if (file.size > 5 * 1024 * 1024) errs.file = 'This file is larger than 5 MB.';
    else if (['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) === -1) errs.file = 'Please choose a PDF or a photo (JPG, PNG or WEBP).';
    if (Object.keys(errs).length) return Promise.resolve({ ok: false, errors: errs });
    var st = $('[data-upstate]', f); st.hidden = false; st.innerHTML = '<span class="spin" aria-hidden="true"></span>Sending the document…';
    return fetch('/api/app/people/' + encodeURIComponent(v.personId) + '/records', {
      method: 'POST', credentials: 'same-origin', body: file,
      headers: { 'Content-Type': 'application/octet-stream', 'X-Requested-With': 'kareiq', 'X-CSRF': S.csrf, 'X-File-Name': encodeURIComponent(v.name), 'X-Category': v.category }
    }).then(function (r) { return r.json().catch(function () { return { ok: false, message: 'The upload did not finish. Please try again.' }; }); }, function () { return { ok: false, message: 'Could not reach KareIQ. Check your internet connection.' }; })
      .then(function (d) {
        st.hidden = true;
        if (!d.ok) return d;
        var rc = d.receipt || {};
        K.openDialog('Document submitted', '<div class="co-done"><div class="co-ic">' + icon('check') + '</div><p>The document was sent. Keep this receipt.</p><dl class="kv">' +
          '<dt>Customer ID</dt><dd>' + e(rc.customerId) + '</dd><dt>Document</dt><dd>' + e(rc.documentName) + '</dd><dt>Submitted</dt><dd>' + e(K.dt(rc.submittedAt)) + '</dd><dt>Status</dt><dd>' + e(rc.status) + '</dd></dl></div>',
          '<button class="btn ghost" data-act="close">Upload another</button><a class="btn" href="#/nurse/submissions" data-act="close-go">Your Submissions</a>');
        f.reset(); filePicked($('[name=file]', f));
      });
  };

  // ================================================================ Notifications
  function notificationsPage() {
    shell('nurse/notifications', head('Notifications', 'New visits, changes to your visits and answers from the office.') + K.loading(260));
    api('GET', 'notifications').then(function (d) {
      if (!d.ok) return fail(d);
      $('#mn').innerHTML = '<div class="npage">' + head('Notifications', 'New visits, changes to your visits and answers from the office.', d.unread ? '<button class="btn sm ghost" data-act="bell-read">' + icon('check') + 'Mark all as read</button>' : '') +
        (d.rows.length ? '<ul class="nlist">' + d.rows.map(function (n) {
          return '<li class="' + (n.readAt ? '' : 'unread') + '"><span class="nl-i">' + icon(/visit/.test(n.kind) ? 'cal' : /contact/.test(n.kind) ? 'lock' : 'bell') + '</span><div><b>' + e(n.title) + '</b><p>' + e(n.body || '') + '</p><span class="muted small">' + e(K.dt(n.createdAt)) + '</span></div>' +
            (n.link ? '<a class="btn sm ghost" href="' + e(n.link) + '" data-act="bell-go" data-id="' + e(n.id) + '">Open</a>' : '') + '</li>';
        }).join('') + '</ul>' : '<div class="empty"><b>No notifications</b>You are told here when a visit is assigned to you or changes.</div>') + '</div>';
    });
  }

  // ---------------------------------------------------------------- small motion helper: numbers count up once
  function countUp() {
    if (K.reducedMotion()) return;
    $$('[data-count]').forEach(function (el) {
      var to = Number(el.getAttribute('data-count')); if (!to) return;
      var t0 = performance.now();
      (function tick(now) { var p = Math.min(1, (now - t0) / 650); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); })(t0);
    });
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'nv-status') {
      var s = t.getAttribute('data-s'), id = t.getAttribute('data-id');
      if (s === 'completed') {
        K.openDialog('Complete the visit', '<form data-form="nv-done" data-id="' + e(id) + '" novalidate><div class="alert bad" data-msg hidden></div><p class="muted" style="margin-bottom:12px">Mark this visit as completed? Remember to record the readings first.</p>' +
          '<label class="field"><span>Note for the office (optional)</span><textarea class="in" name="note" maxlength="300"></textarea></label></form>', '<button class="btn ghost" data-act="close">Back</button><button class="btn" data-act="submit-dialog">Complete visit</button>');
        return;
      }
      t.disabled = true; t.innerHTML = '<span class="spin" aria-hidden="true"></span>Saving…';
      api('POST', 'nurse/visits/' + encodeURIComponent(id) + '/status', { status: s }).then(function (d) {
        if (!d.ok) { K.toast(d.message || 'Could not update the visit.', 'bad'); K.render(); return; }
        K.toast(s === 'accepted' ? 'Visit accepted.' : 'Visit started. Record the readings when you are done.', 'ok');
        K.render();
      });
    } else if (act === 'nc-request') {
      requestDialog(t.getAttribute('data-cat'));
    } else if (act === 'nc-access') {
      var cat = t.getAttribute('data-cat');
      t.disabled = true; askAccess(cat).then(function () { if (document.body.contains(t)) t.disabled = false; });
    }
  });
  K.FORMS['nv-done'] = function (f, v) {
    return api('POST', 'nurse/visits/' + encodeURIComponent(f.getAttribute('data-id')) + '/status', { status: 'completed', note: v.note }).then(function (d) {
      if (!d.ok) return d; K.closeDialog(); K.toast('Visit completed. Thank you.', 'ok'); K.render();
    });
  };
  // the chosen file, shown with its size; a file dragged over the field highlights it
  function filePicked(input) {
    var f = input.files && input.files[0], box = input.closest('[data-drop]'), out = box && $('[data-pick]', box);
    if (!out) return;
    if (!f) { out.hidden = true; box.classList.remove('has'); return; }
    out.hidden = false; box.classList.add('has');
    out.innerHTML = icon('file') + '<b>' + e(f.name) + '</b><span class="muted small">' + (f.size > 1048576 ? (f.size / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(f.size / 1024)) + ' KB') + '</span>';
  }
  ['dragenter', 'dragover'].forEach(function (n) { document.addEventListener(n, function (ev) { var z = ev.target.closest && ev.target.closest('[data-drop]'); if (z) z.classList.add('over'); }); });
  ['dragleave', 'drop'].forEach(function (n) { document.addEventListener(n, function (ev) { var z = ev.target.closest && ev.target.closest('[data-drop]'); if (z) z.classList.remove('over'); }); });
  document.addEventListener('change', function (ev) {
    var t = ev.target, act = t.getAttribute && t.getAttribute('data-act');
    if (act === 'n-file') filePicked(t);
    if (act === 'nc-pick') K.go('#/nurse/customer?p=' + encodeURIComponent(t.value));
    if (act === 'ns-show') { var r = K.route(); K.go('#/nurse/schedule' + K.queryOf(r, { show: t.value })); }
  });
  document.addEventListener('input', function (ev) {
    if (ev.target.getAttribute('data-act') !== 'n-filter') return;
    var q = ev.target.value.toLowerCase().trim(), shown = 0;
    $$('.ncard[data-find]').forEach(function (c) { var on = !q || c.getAttribute('data-find').indexOf(q) > -1; c.hidden = !on; if (on) shown++; });
    var none = $('[data-none]'); if (none) none.hidden = shown > 0;
  });

  // Customer Onboarding shows in the menu only while this nurse has a customer waiting to be onboarded
  // (approved, paid, assigned), with the number waiting; it goes away once they are all done.
  function onbSet(n) {
    var was = S.cache.onbPending || 0;
    S.cache.onbPending = n; S.cache.onbAt = Date.now();
    S.counts = S.counts || {}; S.counts['nurse/onboarding'] = n;
    var sb = $('#sb .sb-in'); if (!sb) return;
    var link = $('a[href^="#/nurse/onboarding"]', sb);
    if (!n && link) { link.remove(); return; }
    if (n && !link) {
      var after = $('a[href^="#/nurse/customers"]', sb);
      if (after) after.insertAdjacentHTML('afterend', '<a href="#/nurse/onboarding" class="arrive">' + icon('check') + '<span>Customer Onboarding</span><b class="count">' + n + '</b></a>');
    } else if (n && link && n !== was) {
      var b = $('b.count', link); if (b) b.textContent = n; else { link.insertAdjacentHTML('beforeend', '<b class="count">' + n + '</b>'); b = $('b.count', link); }
      if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
    }
  }
  function onbRefresh() {
    if (S.cache.onbBusy || (S.cache.onbAt && Date.now() - S.cache.onbAt < 30000)) return;
    S.cache.onbBusy = true;
    api('GET', 'nurse/onboarding').then(function (d) { S.cache.onbBusy = false; if (d.ok) onbSet(d.rows.length); }, function () { S.cache.onbBusy = false; });
  }
  function menuNow() {
    setTimeout(onbRefresh, 0);
    return MENU.filter(function (m) { return m !== ONB_ITEM || (S.cache.onbPending || 0) > 0; });
  }

  // ---------------------------------------------------------------- my leave and training
  var LVT = { pending: 'warn', approved: 'good', rejected: 'bad', cancelled: '' };
  function mePage() {
    shell('nurse/me', head('My leave and training', 'Ask for leave, see your balance and the trainings you need to do.', '<button class="btn sm" data-act="n-leave">' + icon('plus') + 'Ask for leave</button>') + K.loading(260));
    Promise.all([api('GET', 'me/leave'), api('GET', 'me/trainings')]).then(function (x) {
      var d = x[0], t = x[1];
      if (!d.ok) return K.pageError(d);
      S.cache.myLeave = d;
      var bal = d.balances.filter(function (b) { return b.allowance != null || b.used || b.pending; });
      $('#mn').innerHTML = '<div class="npage">' + head('My leave and training', 'Ask for leave, see your balance and the trainings you need to do.', '<button class="btn sm" data-act="n-leave">' + icon('plus') + 'Ask for leave</button>') +
        (bal.length ? '<div class="tbuckets">' + bal.map(function (b) { return '<div class="tbucket"><span>' + e(b.name) + '</span><b>' + (b.remaining != null ? b.remaining + ' left' : b.used + ' used') + '</b><small>' + (b.allowance != null ? b.used + ' of ' + b.allowance + ' used' : 'No allowance set') + (b.pending ? ' · ' + b.pending + ' waiting' : '') + '</small></div>'; }).join('') + '</div>' : '') +
        '<section class="panel"><h2>My leave</h2>' + (d.rows.length ? '<ul class="rlist">' + d.rows.map(function (l) { return '<li><span><b>' + e(K.date(l.from)) + (l.to !== l.from ? ' – ' + e(K.date(l.to)) : '') + '</b><br><span class="muted small">' + e(l.typeName) + ' · ' + l.days + ' day' + (l.days === 1 ? '' : 's') + (l.decisionNote ? ' · ' + e(l.decisionNote) : '') + '</span></span><span class="tpill ' + (LVT[l.status] || '') + '">' + e(l.statusName) + '</span>' + (l.status === 'pending' ? '<button class="btn sm ghost" data-act="n-leave-wd" data-id="' + e(l.id) + '">Withdraw</button>' : '') + '</li>'; }).join('') + '</ul>' : '<p class="muted">No leave yet.</p>') + '</section>' +
        '<section class="panel"><h2>My trainings</h2>' + (t.ok && t.rows.length ? '<ul class="rlist">' + t.rows.map(function (x) { return '<li><span><b>' + e(x.title) + '</b><br><span class="muted small">Due ' + e(K.date(x.dueDate)) + '</span></span><span class="tpill ' + ({ done: 'good', overdue: 'bad', due: 'warn' }[x.mine.status] || '') + '">' + e({ done: 'Done', overdue: 'Overdue', due: 'Due this week', planned: 'Planned' }[x.mine.status]) + '</span></li>'; }).join('') + '</ul>' : '<p class="muted">No training assigned to you.</p>') + '</section></div>';
    });
  }
  K.FORMS['n-leave'] = function (f, v) { return api('POST', 'me/leave', v).then(function (d) { if (!d.ok) return d; K.closeDialog(); K.toast('Request sent. HR will let you know.', 'ok'); K.render(); }); };
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act');
    if (act === 'n-leave') {
      var types = (S.cache.myLeave && S.cache.myLeave.types) || {};
      K.openDialog('Ask for leave', '<form data-form="n-leave" novalidate><div class="alert bad" data-msg hidden></div><div class="row2">' + K.field('from', 'First day', 'type="date" min="' + K.todayIST() + '"') + K.field('to', 'Last day', 'type="date" min="' + K.todayIST() + '"') + '</div>' +
        '<label class="field"><span>Type of leave</span><select class="in" name="type"><option value="">Choose</option>' + Object.keys(types).map(function (k) { return '<option value="' + k + '">' + e(types[k]) + '</option>'; }).join('') + '</select><em class="err" data-err="type"></em></label>' + K.field('reason', 'Reason', 'maxlength="300"') +
        '<p class="muted small">HR or the office approves it. Once approved, your visits on those days go to another nurse.</p></form>', '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Send request</button>');
    } else if (act === 'n-leave-wd') {
      api('POST', 'me/leave/' + encodeURIComponent(t.getAttribute('data-id')) + '/withdraw', {}).then(function (d) { K.toast(d.ok ? 'Withdrawn.' : d.message, d.ok ? 'ok' : 'bad'); K.render(); });
    }
  });

  K.register('nurse', {
    label: 'Nurse portal',
    menu: menuNow,
    personPages: ['nurse/customer', 'nurse/upload', 'assess', 'assess/regular', 'assess/onboarding'],
    notifPage: '#/nurse/notifications',
    route: function (r, top) {
      if (top !== 'nurse') return false;
      var page = r.parts[1] || 'visits';
      if (page === 'visits') visitsPage(r);
      else if (page === 'schedule') schedulePage(r);
      else if (page === 'customers') customersPage(r);
      else if (page === 'customer') customerPage(r);
      else if (page === 'upload') uploadPage(r);
      else if (page === 'submissions') submissionsPage(r);
      else if (page === 'onboarding') onboardingPage(r);
      else if (page === 'notifications') notificationsPage(r);
      else if (page === 'me') mePage(r);
      else K.go('#/nurse/visits', true);
      return true;
    }
  });
})();
