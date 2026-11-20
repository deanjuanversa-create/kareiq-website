/* My KareIQ: the office interface (admin logins). Loaded only for the office team.
   Overview analytics, lead management, customers, financials, employees, the nurse scheduler and
   the contact access audit. Every figure comes from the server; nothing here is sample data. */
(function () {
  'use strict';
  var K = window.KQ, S = K.S, e = K.e, $ = K.$, $$ = K.$$, icon = K.icon, api = K.api;

  var MENU = [
    { k: 'ov', label: 'Overview', icon: 'chart', sub: [['office/overview/summary', 'Summary', 'grid'], ['office/overview/customers', 'Customer analytics', 'people'], ['office/overview/revenue', 'Revenue analytics', 'rupee']] },
    { k: 'leads', label: 'Lead management', icon: 'funnel', sub: [['office/leads/overview', 'Lead overview', 'chart'], ['office/leads/list', 'Enquiry database', 'inbox'], ['office/leads/assign', 'Assign to a member', 'team']] },
    { k: 'cust', label: 'Customer management', icon: 'people', sub: [['office/customers', 'Customer directory', 'people'], ['office/documents', 'Document review', 'file']] },
    { k: 'fin', label: 'Financials', icon: 'receipt', sub: [['office/finance/invoices', 'Invoices', 'receipt'], ['office/finance/due', 'Payment due', 'clock']] },
    { k: 'emp', label: 'Employees', icon: 'team', sub: [['office/employees', 'Employee overview', 'chart'], ['office/employees/kyc', 'KYC and details', 'idcard']] },
    { k: 'sch', label: 'Nurse scheduler', icon: 'cal', sub: [['office/scheduler', 'Visit board', 'cal'], ['office/scheduler/nurses', 'Nurses and hours', 'clock'], ['office/scheduler/leave', 'Leave records', 'clip'], ['office/scheduler/holidays', 'Holidays', 'star']] },
    { k: 'pol', label: 'KareIQ Policies', icon: 'shield', sub: K.POLICIES.map(function (x) { return ['policies/' + x[0], x[1], 'file']; }) },
    ['office/contact-audit', 'Contact access audit', 'lock'],
    { k: 'set', label: 'Settings', icon: 'sliders', sub: [['admin', 'Requests and orders', 'inbox'], ['admin/people', 'People and plans', 'people'], ['admin/logins', 'Logins', 'key'], ['admin/activity', 'Activity', 'clock'], ['office/risk-rules', 'Risk rules', 'gauge'], ['/admin/', 'Website text and prices', 'globe']] }
  ];
  // categorical colours in a fixed order (validated palette); one hue for single-series charts
  var PAL = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
  var FUNNEL = ['#86b6ef', '#5598e7', '#2a78d6', '#1c5cab'];
  var BRAND_COLOR = { karehome: PAL[0], karenest: PAL[2], karewellness: PAL[6], kareiq: PAL[1] };
  var INV_STATUS = { paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid', refunded: 'Refunded', quote: 'Price on call' };
  var VSTATUS = { awaiting_assignment: 'Awaiting assignment', assigned: 'Nurse assigned', accepted: 'Accepted by nurse', in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled' };
  var DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri'], ['sat', 'Sat'], ['sun', 'Sun']];
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // ---------------------------------------------------------------- formatting
  function money(n) { return '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN'); }
  function moneyShort(n) { var a = Math.abs(n); return a >= 1e7 ? '₹' + (n / 1e7).toFixed(1).replace(/\.0$/, '') + ' Cr' : a >= 1e5 ? '₹' + (n / 1e5).toFixed(1).replace(/\.0$/, '') + ' L' : a >= 1e3 ? '₹' + (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K' : '₹' + Math.round(n); }
  function num(n) { return Number(n || 0).toLocaleString('en-IN'); }
  function mon(key) { var m = Number(key.slice(5, 7)); return MONTHS[m - 1] + (key.slice(5, 7) === '01' ? ' ' + key.slice(2, 4) : ''); }
  function addDays(iso, n) { var d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
  function shortDay(iso) { return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(iso + 'T12:00:00Z')); }
  function enc(x) { return encodeURIComponent(x); }

  // ---------------------------------------------------------------- page frame
  function page(active, title, sub, right, body) {
    K.shell(active, '<div class="opage"><div class="head"><div><h1>' + e(title) + '</h1>' + (sub ? '<p class="sub">' + sub + '</p>' : '') + '</div>' + (right || '') + '</div>' + body + '</div>');
  }
  function skeleton() { return '<div class="okpis">' + [1, 2, 3, 4].map(function () { return '<div class="skel" style="height:104px"></div>'; }).join('') + '</div>' + K.loading(300); }
  function swap(html) { var m = $('#mn .opage'); if (!m) return; var h = $('.head', m); m.innerHTML = (h ? h.outerHTML : '') + html; animateIn(m); }
  function fail(d) { K.pageError(d); }

  // ---------------------------------------------------------------- filters (one row above the charts or table)
  // fields: [key, label, type, options]; type: search, date, select. The values live in the address.
  function filters(r, fields, extra) {
    var q = r.q;
    var has = fields.some(function (f) { return q[f[0]]; });
    return '<form class="ofilters" data-form="o-filter" role="search" aria-label="Filters" novalidate>' + fields.map(function (f) {
      var v = q[f[0]] || '';
      if (f[2] === 'select') return '<label><span>' + e(f[1]) + '</span><select class="in" name="' + f[0] + '" data-act="o-auto"><option value="">All</option>' + Object.keys(f[3] || {}).map(function (k) { return '<option value="' + e(k) + '"' + (k === v ? ' selected' : '') + '>' + e(f[3][k]) + '</option>'; }).join('') + '</select></label>';
      if (f[2] === 'date') return '<label><span>' + e(f[1]) + '</span><input class="in" type="date" name="' + f[0] + '" value="' + e(v) + '" data-act="o-auto"></label>';
      return '<label class="grow"><span>' + e(f[1]) + '</span><input class="in" type="search" name="' + f[0] + '" value="' + e(v) + '" placeholder="' + e(f[3] || 'Search') + '"></label>';
    }).join('') + '<div class="of-b"><button class="btn sm" type="submit">' + icon('funnel') + 'Apply</button>' + (has ? '<a class="btn sm ghost" href="#/' + r.parts.join('/') + '">Clear</a>' : '') + '</div>' + (extra || '') + '</form>';
  }
  K.FORMS['o-filter'] = function (f, v) {
    var r = K.route(), q = {};
    Object.keys(r.q).forEach(function (k) { if (['p', 'id', 'view'].indexOf(k) > -1) q[k] = r.q[k]; });
    Object.keys(v).forEach(function (k) { if (v[k]) q[k] = v[k]; });
    K.go('#/' + r.parts.join('/') + K.queryOf({ q: q }));
    return Promise.resolve();
  };
  function qs(r, keys) { var out = []; (keys || Object.keys(r.q)).forEach(function (k) { if (r.q[k]) out.push(enc(k) + '=' + enc(r.q[k])); }); return out.length ? '?' + out.join('&') : ''; }
  function pager(d, r) {
    if (d.pages <= 1) return '<p class="opgr muted small">' + d.total + (d.total === 1 ? ' result' : ' results') + '</p>';
    var link = function (p) { return '#/' + r.parts.join('/') + K.queryOf(r, { page: p }); };
    return '<nav class="opgr" aria-label="Pages"><span class="muted small">' + ((d.page - 1) * d.size + 1) + ' to ' + Math.min(d.total, d.page * d.size) + ' of ' + d.total + '</span>' +
      (d.page > 1 ? '<a class="btn sm ghost" href="' + link(d.page - 1) + '">' + icon('left') + 'Previous</a>' : '') + '<b>Page ' + d.page + ' of ' + d.pages + '</b>' +
      (d.page < d.pages ? '<a class="btn sm ghost" href="' + link(d.page + 1) + '">Next' + icon('right') + '</a>' : '') + '</nav>';
  }

  // ---------------------------------------------------------------- KPI tiles (numbers count up once)
  function kpi(label, value, o) {
    o = o || {};
    var fmt = o.money ? 'money' : 'num';
    return '<div class="okpi' + (o.tone ? ' ' + o.tone : '') + '"><span class="ok-i">' + icon(o.icon || 'chart') + '</span><div><span class="ok-l">' + e(label) + '</span>' +
      '<b data-count="' + (Number(value) || 0) + '" data-fmt="' + fmt + '">' + (o.money ? money(value) : o.suffix ? value + o.suffix : num(value)) + '</b>' + (o.sub ? '<span class="ok-s">' + o.sub + '</span>' : '') + '</div></div>';
  }
  function kpis(list) { return '<div class="okpis">' + list.join('') + '</div>'; }
  function animateIn(root) {
    if (K.reducedMotion()) return;
    $$('[data-count]', root).forEach(function (el) {
      var to = Number(el.getAttribute('data-count')), fmt = el.getAttribute('data-fmt');
      if (!to || /%/.test(el.textContent)) return;
      var t0 = performance.now(), show = function (v) { el.textContent = fmt === 'money' ? money(v) : num(Math.round(v)); };
      (function tick(now) { var p = Math.min(1, (now - t0) / 700); show(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(tick); else show(to); })(t0);
    });
    $$('.och', root).forEach(function (c) { c.classList.add('anim'); });
    $$('.och svg polyline.oln', root).forEach(function (p) { try { p.style.setProperty('--len', Math.ceil(p.getTotalLength())); } catch (x) {} });
  }

  // ---------------------------------------------------------------- charts (SVG and HTML, animated; every chart has its numbers as a table)
  function figure(title, body, items, fmt, cols) {
    var f = fmt || num;
    var table = '<details class="odata"><summary>Show the numbers</summary><div class="tw"><table><thead><tr><th>' + e((cols && cols[0]) || 'Item') + '</th>' + (items[0] && items[0].values ? items[0].values.map(function (v) { return '<th>' + e(v.name) + '</th>'; }).join('') : '<th>' + e((cols && cols[1]) || 'Value') + '</th>') + '</tr></thead><tbody>' +
      items.map(function (it) { return '<tr><td>' + e(it.label || it.key) + '</td>' + (it.values ? it.values.map(function (v) { return '<td>' + e(f(v.value)) + '</td>'; }).join('') : '<td>' + e(f(it.value)) + '</td>') + '</tr>'; }).join('') + '</tbody></table></div></details>';
    return '<figure class="och"><figcaption>' + e(title) + '</figcaption>' + body + table + '</figure>';
  }
  function empty(text) { return '<p class="och-empty">' + e(text || 'No data for these filters yet.') + '</p>'; }
  // horizontal bars: magnitude by category, one hue
  function hbars(title, items, fmt, color) {
    var f = fmt || num, max = Math.max.apply(null, items.map(function (x) { return x.value; }).concat([0]));
    var body = items.length && max > 0 ? '<ul class="hb">' + items.map(function (it, i) {
      var w = max ? Math.max(1.5, (it.value / max) * 100) : 0;
      return '<li data-tip="' + e((it.label || it.key) + ': ' + f(it.value)) + '"><span class="hb-l">' + e(it.label || it.key) + '</span><span class="hb-t"><i style="width:' + w + '%;background:' + (typeof color === 'function' ? color(it, i) : color || PAL[0]) + ';animation-delay:' + (i * 0.05) + 's"></i></span><b>' + e(f(it.value)) + '</b></li>';
    }).join('') + '</ul>' : empty();
    return figure(title, body, items, f);
  }
  // nice axis steps
  function niceMax(v) { if (v <= 0) return 1; var p = Math.pow(10, Math.floor(Math.log10(v))), n = v / p; return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p; }
  // columns over time (one series) or a line; series: [{name, color, values:[...]}] with keys
  function timeChart(title, keys, series, o) {
    o = o || {};
    var f = o.fmt || num, W = 640, H = 230, L = 48, R = 12, T = 14, B = 30, pw = W - L - R, ph = H - T - B;
    var all = []; series.forEach(function (s) { all = all.concat(s.values); });
    var max = niceMax(Math.max.apply(null, all.concat([0]))), n = keys.length;
    if (!n || !all.some(function (v) { return v > 0; })) return figure(title, empty(), [], f);
    var x = function (i) { return L + (pw / n) * (i + 0.5); }, y = function (v) { return T + ph - (v / max) * ph; };
    var grid = [0, 0.25, 0.5, 0.75, 1].map(function (t) { var v = max * t; return '<line class="og" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + e(o.short ? o.short(v) : f(v)) + '</text>'; }).join('');
    var every = Math.ceil(n / 12);
    var xl = keys.map(function (k, i) { return i % every ? '' : '<text x="' + x(i) + '" y="' + (H - 9) + '" text-anchor="middle">' + e(o.label ? o.label(k) : mon(k)) + '</text>'; }).join('');
    var marks = '';
    if (o.kind === 'line') {
      series.forEach(function (s) {
        marks += '<polyline class="oln" style="stroke:' + s.color + '" points="' + s.values.map(function (v, i) { return x(i) + ',' + y(v); }).join(' ') + '"/>';
        marks += s.values.map(function (v, i) { return '<circle class="opt" cx="' + x(i) + '" cy="' + y(v) + '" r="4" style="fill:' + s.color + ';animation-delay:' + (0.3 + i * 0.03) + 's"/>'; }).join('');
      });
      marks += keys.map(function (k, i) { return '<rect class="ohit" x="' + (x(i) - pw / n / 2) + '" y="' + T + '" width="' + pw / n + '" height="' + ph + '" data-tip="' + e((o.label ? o.label(k) : mon(k)) + ': ' + series.map(function (s) { return (series.length > 1 ? s.name + ' ' : '') + f(s.values[i]); }).join(', ')) + '"/>'; }).join('');
    } else {
      var gw = Math.min((pw / n) * 0.72, 30 * series.length + 2 * (series.length - 1)), bw = series.length > 1 ? (gw - 2 * (series.length - 1)) / series.length : gw;
      keys.forEach(function (k, i) {
        series.forEach(function (s, j) {
          var v = s.values[i], h = Math.max(0, y(0) - y(v)), bx = x(i) - gw / 2 + j * (bw + 2);
          if (h > 0) marks += '<path class="obar" style="fill:' + s.color + ';animation-delay:' + (i * 0.025) + 's" d="' + roundTop(bx, y(v), bw, h, Math.min(4, bw / 2)) + '"/>';
        });
        marks += '<rect class="ohit" x="' + (x(i) - pw / n / 2) + '" y="' + T + '" width="' + pw / n + '" height="' + ph + '" data-tip="' + e((o.label ? o.label(k) : mon(k)) + ': ' + series.map(function (s) { return (series.length > 1 ? s.name + ' ' : '') + f(s.values[i]); }).join(', ')) + '"/>';
      });
    }
    var legend = series.length > 1 ? '<p class="olg">' + series.map(function (s) { return '<span><i style="background:' + s.color + '"></i>' + e(s.name) + '</span>'; }).join('') + '</p>' : '';
    var svg = '<svg class="osvg" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + e(title) + '">' + grid + '<line class="oax" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '"/>' + marks + xl + '</svg>';
    var items = keys.map(function (k, i) { return { label: o.label ? o.label(k) : mon(k), values: series.map(function (s) { return { name: s.name, value: s.values[i] }; }), value: series[0].values[i] }; });
    return figure(title, legend + svg, items, f, ['Period']);
  }
  function roundTop(x, y, w, h, r) { r = Math.min(r, h); return 'M' + x + ',' + (y + h) + 'V' + (y + r) + 'Q' + x + ',' + y + ' ' + (x + r) + ',' + y + 'H' + (x + w - r) + 'Q' + (x + w) + ',' + y + ' ' + (x + w) + ',' + (y + r) + 'V' + (y + h) + 'Z'; }
  // share of a whole: a ring with a legend that carries the numbers
  function donut(title, items, fmt, colorOf) {
    var f = fmt || num, total = items.reduce(function (s, x) { return s + x.value; }, 0);
    if (!total) return figure(title, empty(), items, f);
    var R = 54, C = 2 * Math.PI * R, off = 0;
    var segs = items.map(function (it, i) {
      var len = (it.value / total) * C, gap = items.filter(function (x) { return x.value; }).length > 1 ? 2 : 0;
      var s = it.value ? '<circle class="oseg" r="' + R + '" cx="70" cy="70" transform="rotate(-90 70 70)" style="stroke:' + (colorOf ? colorOf(it, i) : PAL[i % PAL.length]) + ';stroke-dasharray:' + Math.max(0, len - gap) + ' ' + C + ';stroke-dashoffset:' + (-off) + ';animation-delay:' + (i * 0.08) + 's" data-tip="' + e((it.label || it.key) + ': ' + f(it.value) + ' (' + Math.round((it.value / total) * 100) + '%)') + '"/>' : '';
      off += len; return s;
    }).join('');
    var body = '<div class="odn"><svg viewBox="0 0 140 140" role="img" aria-label="' + e(title) + '"><g>' + segs + '</g><text x="70" y="68" text-anchor="middle" class="odn-t">' + e(f(total)) + '</text><text x="70" y="86" text-anchor="middle" class="odn-s">total</text></svg>' +
      '<ul class="odn-l">' + items.map(function (it, i) { return '<li><i style="background:' + (colorOf ? colorOf(it, i) : PAL[i % PAL.length]) + '"></i><span>' + e(it.label || it.key) + '</span><b>' + e(f(it.value)) + '</b><small>' + Math.round((it.value / total) * 100) + '%</small></li>'; }).join('') + '</ul></div>';
    return figure(title, body, items, f);
  }
  function funnel(title, items) {
    var max = Math.max.apply(null, items.map(function (x) { return x.value; }).concat([0]));
    if (!max) return figure(title, empty(), items);
    return figure(title, '<ul class="ofn">' + items.map(function (it, i) {
      var pct = i ? Math.round((it.value / (items[0].value || 1)) * 100) + '% of all' : '';
      return '<li data-tip="' + e(it.label + ': ' + it.value) + '"><span class="ofn-b" style="width:' + Math.max(8, (it.value / max) * 100) + '%;background:' + FUNNEL[Math.min(i, FUNNEL.length - 1)] + ';animation-delay:' + (i * 0.08) + 's"></span><span class="ofn-l"><b>' + num(it.value) + '</b> ' + e(it.label) + (pct ? ' <small>' + pct + '</small>' : '') + '</span></li>';
    }).join('') + '</ul>', items);
  }
  // one tooltip for every chart
  var tip;
  function showTip(el, ev) {
    if (!tip) { tip = document.createElement('div'); tip.className = 'otip'; tip.setAttribute('role', 'tooltip'); document.body.appendChild(tip); }
    tip.textContent = el.getAttribute('data-tip'); tip.hidden = false;
    var x = ev && ev.clientX != null ? ev.clientX : el.getBoundingClientRect().left + 20, y = ev && ev.clientY != null ? ev.clientY : el.getBoundingClientRect().top;
    var w = tip.offsetWidth; tip.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, x - w / 2)) + 'px'; tip.style.top = Math.max(8, y - tip.offsetHeight - 14) + 'px';
  }
  document.addEventListener('mousemove', function (ev) { var t = ev.target.closest && ev.target.closest('.och [data-tip]'); if (t) showTip(t, ev); else if (tip) tip.hidden = true; });
  document.addEventListener('scroll', function () { if (tip) tip.hidden = true; }, true);

  function brandOpts(d) { return d.brands || { karehome: 'Kare@Home', karenest: 'KareNest', karewellness: 'KareWellness' }; }
  function pkgOpts(d) { var o = {}; (d.packages || []).forEach(function (p) { o[p.id] = p.name; }); return o; }
  function tags(list, names) { return (list || []).map(function (b) { return '<span class="tagb ' + e(b) + '">' + e((names || {})[b] || b) + '</span>'; }).join(' '); }

  // ================================================================ Overview: customer analytics
  function customerAnalytics(r) {
    var active = 'office/overview/customers', title = 'Customer analytics', sub = 'Who your customers are, by brand and package, and how the customer base is growing.';
    page(active, title, sub, '', skeleton());
    api('GET', 'admin/analytics/customers' + qs(r)).then(function (d) {
      if (!d.ok) return fail(d);
      var k = d.kpis;
      swap(filters(r, [['from', 'Registered from', 'date'], ['to', 'Registered to', 'date'], ['brand', 'Brand', 'select', brandOpts(d)], ['package', 'Package', 'select', pkgOpts(d)], ['status', 'Status', 'select', { active: 'Active', inactive: 'Inactive' }]]) +
        kpis([kpi('Total customers', k.total, { icon: 'people' }), kpi('Active customers', k.active, { icon: 'check', tone: 'good', sub: k.total ? Math.round((k.active / k.total) * 100) + '% of all' : '' }),
          kpi('Inactive customers', k.inactive, { icon: 'clock', tone: 'muted' }), kpi('New customers', k.newCustomers, { icon: 'plus', sub: 'since ' + e(K.date(k.newFrom)) })]) +
        '<div class="ogrid">' +
          timeChart('Customer acquisition (total customers over time)', d.acquisition.map(function (x) { return x.key; }), [{ name: 'Customers', color: PAL[0], values: d.acquisition.map(function (x) { return x.value; }) }], { kind: 'line' }) +
          timeChart('New registrations by month', d.registrations.map(function (x) { return x.key; }), [{ name: 'Registrations', color: PAL[0], values: d.registrations.map(function (x) { return x.value; }) }]) +
          hbars('Customers by brand', d.byBrand, num, function (it) { return BRAND_COLOR[it.key] || PAL[0]; }) +
          donut('Active and inactive', d.activeInactive, num, function (it) { return it.key === 'active' ? PAL[2] : '#9aa5b1'; }) +
          hbars('Customers by package', d.byPackage) +
        '</div><p class="note">' + icon('shield') + '<span>' + e(d.note) + ' Counts come from the customer records; nothing is estimated.</span></p>');
    });
  }

  // ================================================================ Overview: revenue analytics
  function revenueAnalytics(r) {
    var active = 'office/overview/revenue';
    page(active, 'Revenue analytics', 'Money collected, billed and still owed. Only verified payments count as collected.', '', skeleton());
    api('GET', 'admin/analytics/revenue' + qs(r)).then(function (d) {
      if (!d.ok) return fail(d);
      var k = d.kpis;
      swap(filters(r, [['from', 'From', 'date'], ['to', 'To', 'date'], ['brand', 'Brand', 'select', brandOpts(d)], ['package', 'Package', 'select', pkgOpts(d)], ['months', 'Payment plan', 'select', { 1: 'Monthly', 3: 'Quarterly', 6: 'Half-yearly', 12: 'Yearly' }], ['status', 'Invoice status', 'select', { paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid', refunded: 'Refunded' }]]) +
        kpis([kpi('Collected', k.collected, { money: true, icon: 'rupee', tone: 'good', sub: 'payments minus refunds' }), kpi('This month', k.thisMonth, { money: true, icon: 'cal' }), kpi('This year', k.thisYear, { money: true, icon: 'chart' }),
          kpi('Outstanding', k.outstanding, { money: true, icon: 'clock', tone: k.outstanding ? 'warn' : '', sub: k.pendingPayments + ' awaiting payment' }), kpi('Billed', k.billed, { money: true, icon: 'receipt' }), kpi('Refunds', k.refunds, { money: true, icon: 'left', tone: 'muted' }),
          kpi('Successful payments', k.successfulPayments, { icon: 'check' }), kpi('Pending amount', k.pendingAmount, { money: true, icon: 'clock', sub: 'includes orders awaiting payment' })]) +
        '<div class="ogrid">' +
          timeChart('Collected by month', d.monthly.map(function (x) { return x.key; }), [{ name: 'Collected', color: PAL[0], values: d.monthly.map(function (x) { return x.collected; }) }, { name: 'Billed', color: PAL[1], values: d.monthly.map(function (x) { return x.billed; }) }], { fmt: money, short: moneyShort }) +
          timeChart('Collected by year', d.yearly.map(function (x) { return x.key; }), [{ name: 'Collected', color: PAL[0], values: d.yearly.map(function (x) { return x.value; }) }], { fmt: money, short: moneyShort, label: function (k) { return k; } }) +
          hbars('Collected by brand', d.byBrand, money, function (it) { return BRAND_COLOR[it.key] || PAL[0]; }) +
          hbars('Collected by package', d.byPackage, money) +
          donut('Payment methods', d.methods, money) +
          hbars('Payment status (invoices and orders)', d.payStatus, num, function (it) { return { paid: PAL[2], partial: PAL[3], unpaid: PAL[7], orders: '#9aa5b1' }[it.key]; }) +
        '</div><p class="note">' + icon('shield') + '<span>' + e(d.note) + ' The payment gateway is not connected yet, so payments are recorded by the office after checking them.</span></p>');
    });
  }

  // ================================================================ Overview: Summary
  // Summary: aggregate analysis of risk categories and packages. Counts only: no names, IDs,
  // profiles or links to individual customers. Filters (risk category, package) are applied on
  // the server, and every chart and count below follows them.
  function summaryPage(r) {
    page('office/overview/summary', 'Summary', 'Your customers at a glance: packages and risk. Counts only; no customer is identified here.', '<button class="btn sm ghost" data-act="o-risk-recalc">' + icon('gauge') + 'Recalculate risk</button>', skeleton());
    S.cache.sumF = { risk: r.q.risk || '', pkg: r.q.pkg || '', ind: r.q.risk ? r.q.ind || '' : '' };
    summaryLoad(false);
  }
  function summaryLoad(update) {
    var f = S.cache.sumF;
    var q = []; if (f.risk) q.push('risk=' + enc(f.risk)); if (f.pkg) q.push('pkg=' + enc(f.pkg)); if (f.ind) q.push('ind=' + enc(f.ind));
    history.replaceState(null, '', '#/office/overview/summary' + (q.length ? '?' + q.join('&') : '')); S.lastHash = location.hash;
    var box = $('#sumbody'); if (box) box.setAttribute('aria-busy', 'true');
    api('GET', 'admin/summary' + (q.length ? '?' + q.join('&') : '')).then(function (d) {
      if (!d.ok) return fail(d);
      S.cache.summary = d; S.cache.sumF = { risk: d.filter.risk, pkg: d.filter.pkg, ind: d.filter.ind };
      if (update && $('#sumbody')) { $('#sumbody').outerHTML = summaryHtml(); var c = $('#sumbody'); $$('.och', c).forEach(function (x) { x.classList.add('anim'); }); }
      else swap(summaryHtml());
    });
  }
  var RISK_NAME = { red: 'Red', amber: 'Amber', green: 'Green', grey: 'Grey' };
  // Executive layout: overview cards (total, packages, the four risk categories), then one chart
  // for risk distribution and one for packages. The indicator breakdown appears only once a risk
  // category is chosen. Everything is an aggregate count from the server; nothing identifies a customer.
  function summaryHtml() {
    var d = S.cache.summary, f = S.cache.sumF;
    var pkName = function (id) { return (d.packages.filter(function (x) { return x.id === id; })[0] || {}).name || id; };
    var indName = function (id) { return (d.indicatorList.filter(function (x) { return x.id === id; })[0] || {}).title || id; };
    var pct = function (n, of) { return of ? Math.round((n / of) * 100) + '%' : '0%'; };
    var plural = function (n) { return num(n) + ' customer' + (n === 1 ? '' : 's'); };
    var cats = d.byCategory, base = cats.reduce(function (t, x) { return t + x.count; }, 0);
    var SHORT = { red: 'Red', amber: 'Amber', green: 'Green', grey: 'Not assessed' };
    var SUB = { red: 'Very high risk', amber: 'Needs attention', green: 'No risk', grey: 'Not enough current data' };

    // ---- filter bar: package dropdown, active filters, reset
    var active = [];
    if (f.risk) active.push('<span class="xchip ' + f.risk + '"><i></i>' + e(SHORT[f.risk]) + '<button data-act="o-sum-risk" data-k="' + f.risk + '" aria-label="Remove the risk filter">' + icon('x') + '</button></span>');
    if (f.pkg) active.push('<span class="xchip">' + e(pkName(f.pkg)) + '<button data-act="o-sum-pkg" data-k="' + e(f.pkg) + '" aria-label="Remove the package filter">' + icon('x') + '</button></span>');
    if (f.ind) active.push('<span class="xchip">' + e(indName(f.ind)) + '<button data-act="o-sum-ind" data-k="' + e(f.ind) + '" aria-label="Remove the indicator filter">' + icon('x') + '</button></span>');
    var bar = '<div class="xbar" role="region" aria-label="Filters">' +
      '<label class="xsel"><span>Package</span><select class="in" data-act="o-sum-sel" name="pkg"><option value="">All packages</option>' + d.packages.map(function (p) { return '<option value="' + e(p.id) + '"' + (f.pkg === p.id ? ' selected' : '') + '>' + e(p.name) + '</option>'; }).join('') + '</select></label>' +
      '<div class="xactive" aria-live="polite">' + (active.length ? '<span class="muted small">Filtered by</span>' + active.join('') + '<button class="link small" data-act="o-sum-clear">Reset all</button>' : '<span class="muted small">Choose a risk card or a package to analyse further.</span>') + '</div></div>';

    // ---- overview cards
    var pkReal = d.packages.filter(function (p) { return p.id !== '_none'; });
    var topPk = d.matrix.filter(function (m) { return m.id !== '_none'; }).slice().sort(function (a, b2) { return b2.total - a.total; })[0];
    var cards = '<div class="xkpis">' +
      '<div class="xk total"><span class="xk-l">Total customers</span><b>' + num(d.totalAll) + '</b><span class="xk-s">' + (f.pkg ? num(base) + ' in ' + e(pkName(f.pkg)) : 'with a current or recent package') + '</span></div>' +
      '<div class="xk pk"><span class="xk-l">Packages</span><b>' + num(pkReal.length) + '</b><span class="xk-s">' + (topPk && topPk.total ? 'Most customers: ' + e(topPk.name) + ' (' + num(topPk.total) + ')' : 'No active packages') + '</span></div>' +
      cats.map(function (c) {
        return '<button type="button" class="xk risk ' + c.key + (f.risk && f.risk !== c.key ? ' dim' : '') + '" data-act="o-sum-risk" data-k="' + c.key + '" aria-pressed="' + (f.risk === c.key) + '" title="' + e(f.risk === c.key ? 'Show all categories again' : 'See what is behind ' + SHORT[c.key]) + '">' +
          '<span class="xk-l"><i></i>' + e(SHORT[c.key]) + '</span><b>' + num(c.count) + '</b><span class="xk-s">' + pct(c.count, base) + ' · ' + e(SUB[c.key]) + '</span></button>';
      }).join('') + '</div>';

    // ---- primary chart 1: risk distribution (one 100% bar) and the same split for each package
    var stack = function (cells, total, label) {
      return '<span class="xstack" role="img" aria-label="' + e(label + ': ' + cells.map(function (c) { return SHORT[c.key] + ' ' + c.count; }).join(', ')) + '">' + cells.map(function (c) {
        return c.count ? '<i class="' + c.key + (f.risk && f.risk !== c.key ? ' dim' : '') + '" style="flex:' + c.count + '" data-tip="' + e(label + ' · ' + SHORT[c.key] + ': ' + plural(c.count) + ' (' + pct(c.count, total) + ')') + '"></i>' : '';
      }).join('') + '</span>';
    };
    var riskPanel = '<section class="xpanel" aria-labelledby="h-xrisk"><div class="xp-h"><h2 id="h-xrisk">Risk distribution</h2><span class="muted small">' + (f.pkg ? e(pkName(f.pkg)) : 'All customers') + ' · ' + plural(base) + '</span></div>' +
      (base ? stack(cats, base, f.pkg ? pkName(f.pkg) : 'All customers').replace('class="xstack"', 'class="xstack big"') +
        '<ul class="xlegend">' + cats.map(function (c) { return '<li class="' + c.key + '"><i></i>' + e(SHORT[c.key]) + ' <b>' + num(c.count) + '</b> <span class="muted">' + pct(c.count, base) + '</span></li>'; }).join('') + '</ul>'
        : empty('No customers' + (f.pkg ? ' in this package.' : ' yet.'))) + '</section>';

    // ---- primary chart 2: packages, each bar split by risk category (or the chosen category only)
    var rows = d.matrix.filter(function (m) { return m.total; });
    var pmax = Math.max.apply(null, rows.map(function (m) { return f.risk ? (m.cells.filter(function (c) { return c.key === f.risk; })[0] || {}).count || 0 : m.total; }).concat([1]));
    var pkgPanel = '<section class="xpanel" aria-labelledby="h-xpkg"><div class="xp-h"><h2 id="h-xpkg">Packages</h2><span class="muted small">' + (f.risk ? e(SHORT[f.risk]) + ' customers per package' : 'Customers per package, split by risk') + '</span></div>' +
      (rows.length ? '<ul class="xpk" role="group" aria-label="Filter by package">' + rows.map(function (m) {
        var n = f.risk ? (m.cells.filter(function (c) { return c.key === f.risk; })[0] || {}).count || 0 : m.total;
        var cells = f.risk ? m.cells.filter(function (c) { return c.key === f.risk; }) : m.cells;
        return '<li><button type="button" data-act="o-sum-pkg" data-k="' + e(m.id) + '" aria-pressed="' + (f.pkg === m.id) + '" class="' + (f.pkg && f.pkg !== m.id ? 'dim' : '') + '">' +
          '<span class="xpk-n">' + e(m.name) + '</span><span class="xpk-b"><span style="width:' + (n / pmax * 100) + '%">' + stack(cells, m.total, m.name) + '</span></span><b>' + num(n) + '</b></button></li>';
      }).join('') + '</ul><p class="muted small xnote">A customer with two packages is counted under each. Select a package to narrow everything on this page.</p>' : empty('No customers yet.')) + '</section>';

    // ---- risk indicator breakdown: only once a risk category is chosen
    var breakdown = '';
    if (f.risk) {
      var inds = d.indicators, catTotal = d.total && !f.ind ? d.total : (cats.filter(function (c) { return c.key === f.risk; })[0] || {}).count || 0;
      var imax = Math.max.apply(null, inds.map(function (x) { return x.total; }).concat([1]));
      var head = { red: 'What is making customers Red', amber: 'What is making customers Amber', green: 'Required indicators that are clear for Green customers', grey: 'What is keeping customers Not assessed' }[f.risk];
      var help = { red: 'Each indicator that is Very High Risk for these customers. A customer can have more than one.', amber: 'Each indicator that needs attention for these customers. A customer can have more than one.', green: 'Green customers have every required indicator current and clear.', grey: 'Required indicators that are not complete and clear for these customers, and why.' }[f.risk];
      breakdown = '<section class="xpanel xbreak ' + f.risk + '" aria-labelledby="h-xbr"><div class="xp-h"><div><h2 id="h-xbr">' + e(head) + '</h2><p class="muted small">' + e(help) + '</p></div><span class="muted small">' + e(SHORT[f.risk]) + (f.pkg ? ' · ' + e(pkName(f.pkg)) : '') + ' · ' + plural(catTotal) + '</span></div>' +
        (inds.length ? '<ul class="xind" role="group" aria-label="Filter by risk indicator">' + inds.map(function (x) {
          var reasons = f.risk === 'grey' ? Object.keys(x.reasons).sort(function (a2, b2) { return x.reasons[b2] - x.reasons[a2]; }).map(function (k) { return '<span class="xr">' + e(d.greyReasons[k]) + ' ' + x.reasons[k] + '</span>'; }).join('') : '';
          return '<li><button type="button" data-act="o-sum-ind" data-k="' + e(x.id) + '" aria-pressed="' + (f.ind === x.id) + '" class="' + (f.ind && f.ind !== x.id ? 'dim' : '') + '">' +
            '<span class="xi-n"><b>' + e(x.title) + '</b>' + (reasons ? '<span class="xi-r">' + reasons + '</span>' : '<span class="muted small">' + e(x.group) + '</span>') + '</span>' +
            '<span class="xi-b"><i style="width:' + (x.total / imax * 100) + '%"></i></span><span class="xi-c"><b>' + num(x.total) + '</b><small>' + pct(x.total, (cats.filter(function (c) { return c.key === f.risk; })[0] || {}).count) + '</small></span></button></li>';
        }).join('') + '</ul><p class="muted small xnote">Select an indicator to narrow the cards and charts to customers it applies to.</p>' : empty('No ' + SHORT[f.risk] + ' customers' + (f.pkg ? ' in this package.' : ' yet.'))) + '</section>';
    }
    return '<div id="sumbody" class="xdash">' + bar + cards + breakdown + '<div class="xgrid">' + riskPanel + pkgPanel + '</div>' +
      (d.riskCounts.failed ? '<p class="alert bad small">The last risk recalculation failed for ' + plural(d.riskCounts.failed) + '; they are counted from their last good result.</p>' : '') +
      '<p class="note">' + icon('shield') + '<span>Aggregate counts only, from current packages and each customer\'s latest risk result. No customer is named or identified. Very small counts in a narrow filter can still point to a person; treat them with care.</span></p></div>';
  }

  // ================================================================ Settings: Risk rules
  // The workbook rules are clinically approved and active as written. This page shows, per
  // indicator, where the workbook is inconsistent (and so which values cannot be classified), the
  // category of every band, and lets the owner record an answer, a category for a band the
  // workbook leaves without one, a validity period, and whether it is required for Green.
  var CATS3 = [['red', 'Red – Very High Risk'], ['amber', 'Amber – Lower Risk / Needs Attention'], ['green', 'Green – No Risk']];
  var RSTATE = { active: ['active', 'Active as written'], partial: ['pending', 'Active; some values unresolved'], conflict: ['ended', 'Not calculated: workbook conflict'], blocked: ['ended', 'Cannot be calculated'] };
  function rulesPage() {
    page('office/risk-rules', 'Risk rules', 'The risk rules from the KareIQ workbook, calculated exactly as written. Where the workbook is inconsistent, the affected values are not classified until an answer is recorded here.', '', K.loading(120) + K.loading(400));
    api('GET', 'admin/risk/rules').then(function (d) {
      if (!d.ok) return fail(d);
      S.cache.rules = d;
      var n = function (st) { return d.indicators.filter(function (i) { return i.state === st; }).length; };
      var open = d.indicators.reduce(function (t, i) { return t + i.open.length; }, 0) + d.global.decisions.filter(function (dc) { return !d.global.choices[dc.id]; }).length;
      var unc = d.indicators.reduce(function (t, i) { return t + (i.blocked ? 0 : i.uncategorised.length); }, 0);
      var g = d.global;
      var globalCard = '<section class="panel rcard2" id="rule-_global"><div class="panel-h"><h2>All indicators: shared boundaries</h2>' + rulePill(g.rule) + '</div>' +
        '<form data-form="o-rule" data-id="_global" novalidate><div class="alert bad" data-msg hidden></div>' + g.decisions.map(function (dc) { return decisionHtml(dc, g.choices); }).join('') + approverHtml(g.rule, '_global') + '</form></section>';
      swap(kpis([kpi('Active as written', n('active'), { icon: 'check', tone: 'good' }), kpi('Active, some values unresolved', n('partial'), { icon: 'clock', tone: n('partial') ? 'warn' : '' }),
          kpi('Workbook conflicts', n('conflict'), { icon: 'x', tone: n('conflict') ? 'warn' : 'muted', sub: 'two formulas or methods' }), kpi('Open questions', open, { icon: 'clip', tone: open ? 'warn' : '', sub: unc + ' bands without a category' })]) +
        '<p class="note">' + icon('shield') + '<span>The workbook\'s formulas, bands and thresholds are applied exactly as supplied. Band categories follow the agreed wording ("very high" → Red; "elevated, moderate, medium, intermediate, high" → Amber; normal / low / good / standard → Green). A result is used only where every reading of the workbook gives the same answer; values that fall on a workbook inconsistency, and bands the workbook gives no category, are shown but never counted, so they can never make anyone Green. Every answer recorded here keeps the name of the person deciding and the date, and earlier answers stay in the history.</span></p>' +
        globalCard + d.indicators.map(function (ind) { return indicatorCard(ind, d); }).join(''));
    });
  }
  function rulePill(rule) {
    if (!rule) return '<span class="pill">Workbook defaults</span>';
    if (!rule.approved) return '<span class="pill">Back to workbook defaults ' + e(K.date(rule.at)) + '</span>';
    return '<span class="pill active"><i></i>Answer recorded by ' + e(rule.approverName) + ', ' + e(K.date(rule.at)) + '</span>';
  }
  function decisionHtml(dc, chosen) {
    var refs = '<span class="muted small rrefs">Workbook: ' + e(dc.refs.join('; ')) + (dc.affects === 'all' ? ' · affects every value' : ' · affects only the values in question') + '</span>';
    if (dc.kind === 'thresholds') {
      var v = chosen[dc.id] || {};
      return '<fieldset class="rdec"><legend>' + e(dc.question) + '</legend>' + refs + '<p class="muted small">Leave both empty to keep it open (the result is shown without a band).</p><div class="row2">' + dc.fields.map(function (fl) { return K.field('t.' + dc.id + '.' + fl[0], fl[1] + ' (' + fl[2] + ')', 'inputmode="decimal" value="' + (v[fl[0]] != null ? e(v[fl[0]]) : '') + '"'); }).join('') + '</div><em class="err" data-err="c-' + e(dc.id) + '"></em></fieldset>';
    }
    return '<fieldset class="rdec"><legend>' + e(dc.question) + '</legend>' + refs +
      '<label class="ropt"><input type="radio" name="c.' + dc.id + '" value=""' + (chosen[dc.id] ? '' : ' checked') + '><span><b>Leave open</b><small>The affected values stay unresolved and are not counted.</small></span></label>' +
      dc.options.map(function (o) {
        return '<label class="ropt"><input type="radio" name="c.' + dc.id + '" value="' + e(o.id) + '"' + (chosen[dc.id] === o.id ? ' checked' : '') + '><span><b>' + e(o.label) + '</b>' + (o.detail ? '<small>' + e(o.detail) + '</small>' : '') + '</span></label>';
      }).join('') + '</fieldset>';
  }
  function bandsHtml(ind) {
    return '<table class="otable rmap"><thead><tr><th>Workbook band</th><th>From the agreed wording</th><th>Category used</th></tr></thead><tbody>' + ind.bands.map(function (b) {
      var sug = b.proposed ? CATS3.filter(function (c) { return c[0] === b.proposed; })[0][1] : 'None (the wording is not covered)';
      return '<tr><td data-l="Band">' + e(b.label) + (b.scale ? ' <span class="muted small">(' + e(b.scale) + ')</span>' : '') + '</td><td data-l="Agreed wording"><span class="muted small">' + e(sug) + '</span></td><td data-l="Category"><select class="in sm" name="m.' + e(b.key) + '" aria-label="Category for ' + e(b.label) + '"><option value="">No category: shown, not counted</option>' + CATS3.map(function (c) { return '<option value="' + c[0] + '"' + (b.category === c[0] ? ' selected' : '') + '>' + e(c[1]) + '</option>'; }).join('') + '</select></td></tr>';
    }).join('') + '</tbody></table>';
  }
  function approverHtml(rule, id) {
    return '<div class="rapprove"><div class="row2">' + K.field('approverName', 'Decided by (name)', 'maxlength="120" value="' + e(rule && rule.approved ? rule.approverName : '') + '"') + K.field('note', 'Note (optional)', 'maxlength="300"') + '</div>' +
      '<label class="ck"><input type="checkbox" name="confirm" value="1"><span>I confirm this was decided by the person named above.</span></label><em class="err" data-err="confirm"></em>' +
      '<div class="savebar"><button class="btn" type="submit">' + icon('check') + 'Save and recalculate</button>' + (rule && rule.approved ? '<button class="btn ghost" type="button" data-act="o-rule-withdraw" data-id="' + e(id) + '">Back to workbook defaults</button>' : '') + '</div></div>';
  }
  function indicatorCard(ind, d) {
    var st = RSTATE[ind.state];
    if (ind.blocked) return '<section class="panel rcard2 blocked"><div class="panel-h"><h2>' + e(ind.title) + '</h2><span class="pill ended"><i></i>' + st[1] + '</span></div><p class="muted">' + e(ind.blocked) + '</p></section>';
    var req = ind.required || { mode: 'all', packages: [] };
    var openQs = ind.decisions.filter(function (dc) { return ind.open.indexOf(dc.id) > -1; });
    return '<details class="panel rcard2" id="rule-' + e(ind.id) + '"' + (location.hash.indexOf('open=' + ind.id) > -1 ? ' open' : '') + '><summary><span class="rc-t"><b>' + e(ind.title) + '</b><span class="muted small">' + e(ind.group) + (ind.vital ? ' · single vital (Standard Range sheet)' : '') + (ind.women ? ' · women only' : '') +
        (openQs.length ? ' · ' + openQs.length + ' open question' + (openQs.length === 1 ? '' : 's') : '') + (ind.uncategorised.length ? ' · ' + ind.uncategorised.length + ' band' + (ind.uncategorised.length === 1 ? '' : 's') + ' without a category' : '') + '</span></span>' +
        '<span class="pill ' + st[0] + '"><i></i>' + st[1] + '</span></summary>' +
      '<form data-form="o-rule" data-id="' + e(ind.id) + '" novalidate><div class="alert bad" data-msg hidden></div>' +
      '<p class="muted small">Inputs: ' + e(ind.inputs.join(', ')) + '. Workbook: ' + e(ind.refs.join('; ')) + '.</p>' +
      (ind.usesGlobal ? '<p class="muted small">Also uses the shared boundary rule at the top of this page.</p>' : '') +
      ind.decisions.map(function (dc) { return decisionHtml(dc, ind.choices); }).join('') +
      '<fieldset class="rdec"><legend>Category for each band</legend>' + bandsHtml(ind) + '</fieldset>' +
      '<fieldset class="rdec"><legend>How long a result counts</legend><p class="muted small">The workbook gives no validity period, so by default a result counts until a newer one is recorded. Enter days to make results expire (counted from the oldest reading the score uses).</p>' + K.field('validityDays', 'Days (empty = no expiry)', 'inputmode="numeric" value="' + (ind.validityDays || '') + '"') + '</fieldset>' +
      '<fieldset class="rdec"><legend>Required for Green</legend><p class="muted small">A customer is Green only when every required indicator is current and Green. The workbook does not say which are required; by default every applicable indicator is.</p>' +
        [['all', 'Required for every customer it applies to (default)'], ['packages', 'Required only for the packages ticked below'], ['none', 'Not required (counts only when it shows a risk)']].map(function (o) { return '<label class="ropt"><input type="radio" name="reqmode" value="' + o[0] + '"' + (req.mode === o[0] ? ' checked' : '') + '><span><b>' + e(o[1]) + '</b></span></label>'; }).join('') +
        '<div class="chips2">' + d.packages.map(function (pk) { return '<label class="chipck"><input type="checkbox" name="pk.' + e(pk.id) + '"' + ((req.packages || []).indexOf(pk.id) > -1 ? ' checked' : '') + '>' + e(pk.name) + '</label>'; }).join('') + '</div><em class="err" data-err="required"></em></fieldset>' +
      approverHtml(ind.rule, ind.id) + '</form></details>';
  }
  K.FORMS['o-rule'] = function (f, v) {
    var id = f.getAttribute('data-id'), body = { choices: {}, mapping: {}, approverName: v.approverName, note: v.note, confirm: Boolean(f.elements.confirm && f.elements.confirm.checked) };
    Object.keys(v).forEach(function (k) {
      var p = k.split('.');
      if (p[0] === 'c' && v[k]) body.choices[p.slice(1).join('.')] = v[k];
      else if (p[0] === 'm' && v[k]) body.mapping[p.slice(1).join('.')] = v[k];
      else if (p[0] === 't' && v[k] !== '') { var dk = p.slice(1, -1).join('.'); body.choices[dk] = body.choices[dk] || {}; body.choices[dk][p[p.length - 1]] = Number(v[k]); }
    });
    if (id !== '_global') {
      body.validityDays = v.validityDays;
      body.required = { mode: v.reqmode || 'all', packages: $$('input[type=checkbox][name^="pk."]', f).filter(function (c) { return c.checked; }).map(function (c) { return c.name.slice(3); }) };
    }
    return api('POST', 'admin/risk/rules/' + enc(id), body).then(function (d) {
      if (!d.ok) return d;
      K.toast('Saved. Risk recalculated for ' + d.recalculated + ' people.', 'ok');
      history.replaceState(null, '', '#/office/risk-rules?open=' + id); K.render();
    });
  };

  // ================================================================ Customer management: Document review
  // Medical documents uploaded by nurses and customers are read automatically. Values with a clear
  // test date and a confident reading are stored straight away; the others wait here. The office
  // accepts (correcting the value or date if needed) or rejects each one; nothing is stored until then.
  var DST = { uploaded: 'Uploaded', processing: 'Processing', extracted: 'Extracted', needs_review: 'Needs Review', completed: 'Completed', failed: 'Failed', not_processed: 'Not processed' };
  var EXST = { accepted: 'Stored', stored: 'Saved (other result)', captured: 'Saved as written', needs_review: 'Needs review', duplicate: 'Already stored', rejected: 'Rejected' };
  function docsPage(r) {
    var id = r.q.id;
    if (id) return docPage(id);
    var st = r.q.status || 'open';
    page('office/documents', 'Document review', 'Medical documents from nurses and customers, read automatically. Check the values that could not be stored automatically.', '', skeleton());
    api('GET', 'admin/documents?status=' + enc(st)).then(function (d) {
      if (!d.ok) return fail(d);
      var tabs = [['open', 'Open'], ['needs_review', 'Needs Review'], ['failed', 'Failed'], ['completed', 'Completed'], ['all', 'All']];
      var c = d.counts || {};
      swap(kpis([kpi('Needs review', c.needs_review || 0, { icon: 'clip', tone: c.needs_review ? 'warn' : '' }), kpi('Failed', c.failed || 0, { icon: 'x', tone: c.failed ? 'bad' : '' }),
          kpi('Processing', (c.processing || 0) + (c.uploaded || 0) + (c.extracted || 0), { icon: 'clock' }), kpi('Completed', c.completed || 0, { icon: 'check', tone: 'good' })]) +
        '<nav class="otabs" aria-label="Show">' + tabs.map(function (t) { return '<a href="#/office/documents?status=' + t[0] + '"' + (t[0] === st ? ' aria-current="page"' : '') + '>' + t[1] + '</a>'; }).join('') + '</nav>' +
        (d.rows.length ? '<section class="panel otw"><table class="stackable otable"><thead><tr><th>Document</th><th>Customer</th><th>Uploaded</th><th>Status</th><th></th></tr></thead><tbody>' + d.rows.map(function (x) {
          return '<tr><td data-l="Document"><b>' + e(x.name) + '</b><br><span class="muted small">' + e(x.docType || '') + '</span></td>' +
            '<td data-l="Customer">' + e(x.personName) + '<br><span class="muted small">' + e(x.personId) + '</span></td>' +
            '<td data-l="Uploaded">' + e(K.dt(x.uploadedAt)) + '<br><span class="muted small">by ' + e(x.uploadedBy) + (x.uploadedByRole === 'caregiver' ? ' (nurse)' : x.uploadedByRole === 'family' ? ' (customer)' : '') + '</span></td>' +
            '<td data-l="Status"><span class="pchip ' + e(x.processing.status) + '">' + e(x.processing.label) + '</span>' + (x.pending ? '<br><span class="muted small">' + x.pending + ' to check</span>' : '') + (x.error ? '<br><span class="small" style="color:var(--bad)">' + e(x.error) + '</span>' : '') + '</td>' +
            '<td><a class="btn sm ghost" href="#/office/documents?id=' + enc(x.id) + '">Open</a></td></tr>';
        }).join('') + '</tbody></table></section>' : '<div class="empty"><b>Nothing here</b>Documents appear here when they are uploaded.</div>') +
        '<p class="note">' + icon('shield') + '<span>Values are stored automatically when the number can be read, the unit is known and the document shows the test or collection date. Only values that cannot be stored safely wait here: no test date, a number outside what is possible, "less than" values or an unknown unit. The upload date is never used as the test date. Every stored value links back to its document and line.</span></p>');
    });
  }
  function docPage(id) {
    page('office/documents', 'Document review', '', '<a class="btn sm ghost" href="#/office/documents">' + icon('left') + 'All documents</a>', skeleton());
    api('GET', 'admin/documents/' + enc(id)).then(function (d) {
      if (!d.ok) return fail(d);
      S.cache.docr = d;
      var rec = d.record, ds = rec.dates || {}, pr = rec.processing || {};
      var dateRow = function (label, x) { return '<div><dt>' + label + '</dt><dd>' + (x && x.date ? '<b>' + e(K.date(x.date)) + '</b> <span class="muted small">"' + e(x.raw) + '", page ' + e(x.page) + '</span>' : x && x.ambiguous ? '<span class="pill pending">More than one: ' + e((x.values || []).join(', ')) + '</span>' : '<span class="muted">Not in the document</span>') + '</dd></div>'; };
      var head = '<section class="panel"><div class="panel-h"><h2>' + e(rec.name) + '</h2><span class="pchip ' + e(rec.status.status) + '">' + e(rec.status.label) + '</span></div>' +
        '<dl class="onb-dl">' +
          '<div><dt>Customer</dt><dd>' + e(rec.personName) + ' <span class="muted small">' + e(rec.personId) + '</span></dd></div>' +
          '<div><dt>Uploaded</dt><dd>' + e(K.dt(rec.uploadedAt)) + ' by ' + e(rec.uploadedBy) + '</dd></div>' +
          '<div><dt>Document type</dt><dd>' + e(rec.docType || 'Not identified') + (rec.sections.length ? ' <span class="muted small">(' + e(rec.sections.join(', ')) + ')</span>' : '') + '</dd></div>' +
          dateRow('Test / collection date', ds.test) + dateRow('Report date', ds.report) + dateRow('Issue / printed date', ds.issue) +
          '<div><dt>Reading</dt><dd>' + (pr.engine ? e((pr.engine.sources || []).map(function (x) { return x === 'text' ? 'PDF text' : 'OCR (Tesseract LSTM)'; }).join(', ')) + (pr.engine.tesseract ? ' <span class="muted small">' + e(pr.engine.tesseract) + '</span>' : '') : '<span class="muted">Not read yet</span>') + ' · attempt ' + e(pr.attempts || 0) + '</dd></div>' +
          '<div><dt>File</dt><dd><a href="/api/app/records/' + enc(rec.id) + '/file?view=1" target="_blank" rel="noopener">Open the document</a> <span class="muted small">' + e(Math.round(rec.size / 1024)) + ' KB · SHA-256 ' + e((rec.sha256 || '').slice(0, 12)) + '…</span></dd></div>' +
        '</dl>' + (ds.measuredNote ? '<p class="alert info small">' + e(ds.measuredNote) + '</p>' : '') + (pr.status === 'failed' ? '<p class="alert bad small">' + e(pr.lastError || 'Failed') + '</p>' : '') + (pr.note ? '<p class="muted small">' + e(pr.note) + '</p>' : '') +
        '<div class="oacts">' + (pr.status === 'failed' || pr.status === 'uploaded' || pr.status === 'needs_review' || !pr.status ? '<button class="btn sm" data-act="o-doc-retry" data-id="' + e(rec.id) + '">' + icon('route') + 'Read again</button>' : '') +
          (pr.status === 'needs_review' && !d.extractions.some(function (x) { return x.status === 'needs_review'; }) ? '<button class="btn sm ghost" data-act="o-doc-close" data-id="' + e(rec.id) + '">Mark reviewed (no values to store)</button>' : '') + '</div></section>';
      var rows = d.extractions.length ? '<section class="panel"><h2>Values read</h2><div class="docx">' + d.extractions.map(function (x) {
        var val = x.field === 'bp' ? x.systolic + '/' + x.diastolic : x.value != null ? x.value : x.text;
        var raw = x.rawValue + (x.rawUnit ? ' ' + x.rawUnit : '');
        var review = x.status === 'needs_review';
        return '<article class="docv ' + e(x.status) + '"><div class="docv-h"><div><b>' + e(x.name) + '</b>' + (x.context ? ' <span class="muted small">(' + e(d.glucose[x.context] || x.context) + ')</span>' : '') +
            '<div class="docv-v">' + e(val) + ' <small>' + e(x.unit || '') + '</small></div></div><span class="vst ' + e(x.status) + '">' + e(EXST[x.status] || x.status) + '</span></div>' +
          '<p class="muted small">"' + e(x.rawLine) + '" · page ' + e(x.page) + ', line ' + e(x.line) + (x.section ? ' · ' + e(x.section) : '') + '</p>' +
          '<p class="small">Read as <b>' + e(raw) + '</b>' + (x.conversion && x.conversion !== 'none' ? ' · ' + e(x.conversion) : '') + (x.refRange ? ' · reference ' + e(x.refRange) : '') + ' · confidence <b>' + Math.round(x.confidence * 100) + '%</b> · test date ' + (x.measuredDate ? e(K.date(x.measuredDate)) : '<b>unknown</b>') + '</p>' +
          (x.reasons && x.reasons.length ? '<ul class="docv-r">' + x.reasons.map(function (r) { return '<li>' + e(r) + '</li>'; }).join('') + '</ul>' : '') +
          (x.notes && x.notes.length ? '<ul class="docv-n">' + x.notes.map(function (r) { return '<li>' + e(r) + '</li>'; }).join('') + '</ul>' : '') +
          (x.corrected ? '<p class="muted small">Corrected on review: ' + e(Object.keys(x.corrected).map(function (k) { return k + ' ' + x.corrected[k].from + ' → ' + x.corrected[k].to; }).join(', ')) + '</p>' : '') +
          (x.reviewNote ? '<p class="muted small">Note: ' + e(x.reviewNote) + '</p>' : '') +
          (review ? '<form data-form="o-docv" data-id="' + e(x.id) + '" class="docv-f" novalidate><div class="alert bad" data-msg hidden></div><div class="row3">' +
            (x.field === 'bp' ? K.field('systolic', 'Systolic', 'inputmode="numeric" value="' + e(x.systolic) + '"') + K.field('diastolic', 'Diastolic', 'inputmode="numeric" value="' + e(x.diastolic) + '"')
              : K.field('value', 'Value (' + (x.unit || 'score') + ')', 'inputmode="decimal" value="' + e(x.conversion === 'none' ? '' : x.value) + '"' + (x.conversion === 'none' ? ' placeholder="Convert to ' + e(x.unit) + '"' : ''))) +
            K.field('date', 'Test date (from the document)', 'type="date" value="' + e(x.measuredDate || '') + '"') +
            (x.field === 'glucose' ? '<label class="field"><span>Measured</span><select class="in" name="context"><option value="">Choose…</option>' + Object.keys(d.glucose).map(function (k) { return '<option value="' + k + '"' + (x.context === k ? ' selected' : '') + '>' + e(d.glucose[k]) + '</option>'; }).join('') + '</select><em class="err" data-err="context"></em></label>' : '') +
            '</div>' + K.field('note', 'Note (required to reject)', 'maxlength="300"') +
            '<div class="oacts"><button class="btn sm" type="submit" name="action" value="accept">' + icon('check') + 'Accept and store</button><button class="btn sm ghost" type="button" data-act="o-docv-reject" data-id="' + e(x.id) + '">Reject</button></div></form>' : '') +
          '</article>';
      }).join('') + '</div></section>' : '<div class="empty"><b>No supported values were found</b>The document may be a prescription, an image report or a format the reader does not know. Open it to check.</div>';
      swap(head + rows);
    });
  }
  K.FORMS['o-docv'] = function (f, v) {
    var body = { action: 'accept', date: v.date, note: v.note };
    ['value', 'systolic', 'diastolic', 'context'].forEach(function (k) { if (v[k] !== undefined && v[k] !== '') body[k] = v[k]; });
    return api('POST', 'admin/extractions/' + enc(f.getAttribute('data-id')), body).then(function (d) {
      if (!d.ok) return d;
      K.toast(d.duplicate ? 'Already stored: nothing added twice.' : 'Stored. Risk recalculated.', 'ok'); K.render();
    });
  };

  // ================================================================ Nurse scheduler: Leave records
  var LEAVE_TYPES = { casual: 'Casual leave', sick: 'Sick leave', earned: 'Earned / annual leave', emergency: 'Emergency leave', unpaid: 'Unpaid leave', other: 'Other' };
  function liveLeave(l) { return !l.status || l.status === 'approved' || l.status === 'pending'; }
  var LST = { pending: 'pending', approved: 'active', rejected: 'ended', cancelled: 'ended' };
  function leavePage(r) {
    page('office/scheduler/leave', 'Leave records', 'Every nurse\'s leave: who is away now, approved leave coming up, requests to decide, and the visits each leave affects.', '<button class="btn sm" data-act="o-leave-add">' + icon('plus') + 'Add leave</button>', skeleton());
    api('GET', 'admin/leave').then(function (d) {
      if (!d.ok) return fail(d);
      S.cache.leave = d;
      var q = r.q;
      var nurses = {}; d.nurses.forEach(function (n) { nurses[n.id] = n.name + ' (' + n.employeeId + ')'; });
      var rows = d.rows.filter(function (l) {
        if (q.nurse && l.nurseId !== q.nurse) return false;
        if (q.status && l.status !== q.status) return false;
        if (q.from && l.to < q.from) return false;
        if (q.to && l.from > q.to) return false;
        return true;
      });
      var who = q.nurse ? d.nurses.filter(function (n) { return n.id === q.nurse; })[0] : null;
      var mini = function (title, list, emptyText) {
        return '<section class="panel"><h2>' + e(title) + ' (' + list.length + ')</h2>' + (list.length ? '<ul class="rlist">' + list.map(function (l) {
          return '<li><span><b>' + e(l.nurseName) + '</b> · ' + e(l.typeName) + '<br><span class="muted small">' + e(K.date(l.from)) + (l.to !== l.from ? ' to ' + e(K.date(l.to)) : '') + ' · ' + l.days + ' day' + (l.days === 1 ? '' : 's') + '</span></span></li>';
        }).join('') + '</ul>' : '<p class="muted small">' + e(emptyText) + '</p>') + '</section>';
      };
      swap(kpis([kpi('On leave today', d.onLeaveNow.length, { icon: 'cal', tone: d.onLeaveNow.length ? 'warn' : '' }), kpi('Upcoming approved leave', d.upcoming.length, { icon: 'clock' }), kpi('Waiting for a decision', d.pending.length, { icon: 'inbox', tone: d.pending.length ? 'warn' : '' }),
          kpi('Visits needing a nurse', d.needsNurse, { icon: 'people', tone: d.needsNurse ? 'warn' : 'good', sub: 'because of leave' })]) +
        '<div class="ogrid2">' + mini('On leave today', d.onLeaveNow, 'Nobody is on leave today.') + mini('Upcoming approved leave', d.upcoming.slice(0, 8), 'No approved leave coming up.') + '</div>' +
        filters(r, [['nurse', 'Nurse', 'select', nurses], ['status', 'Status', 'select', d.statuses], ['from', 'From', 'date'], ['to', 'To', 'date']]) +
        (who ? '<h2 class="sec">Leave history for ' + e(who.name) + '</h2>' : '') +
        (rows.length ? '<section class="panel otw"><table class="stackable otable"><thead><tr><th>Nurse</th><th>Dates</th><th>Days</th><th>Type</th><th>Status</th><th>Affected visits</th><th></th></tr></thead><tbody>' + rows.map(function (l) {
          var need = l.affected.filter(function (a) { return a.result === 'awaiting_assignment'; }).length;
          var acts = l.status === 'pending' ? '<button class="btn sm" data-act="o-leave-approve" data-u="' + e(l.nurseId) + '" data-id="' + e(l.id) + '">Approve</button><button class="btn sm ghost" data-act="o-leave-reject" data-u="' + e(l.nurseId) + '" data-id="' + e(l.id) + '">Reject</button>' : '';
          if (l.status === 'pending' || l.status === 'approved') acts += '<button class="btn sm ghost" data-act="o-leave-edit" data-u="' + e(l.nurseId) + '" data-id="' + e(l.id) + '">Edit</button><button class="btn sm ghost" data-act="o-leave-cancel" data-u="' + e(l.nurseId) + '" data-id="' + e(l.id) + '">Cancel</button>';
          return '<tr><td data-l="Nurse"><a href="#/office/scheduler/leave?nurse=' + e(l.nurseId) + '"><b>' + e(l.nurseName) + '</b></a><br><span class="muted small">' + e(l.employeeId) + '</span></td>' +
            '<td data-l="Dates"><b>' + e(K.date(l.from)) + '</b>' + (l.to !== l.from ? ' to <b>' + e(K.date(l.to)) + '</b>' : '') + (l.current ? '<br><span class="pill pending"><i></i>On leave now</span>' : '') + (l.reason ? '<br><span class="muted small">' + e(l.reason) + '</span>' : '') + '</td>' +
            '<td data-l="Days">' + l.days + '</td><td data-l="Type">' + e(l.typeName) + '</td>' +
            '<td data-l="Status"><span class="pill ' + LST[l.status] + '"><i></i>' + e(l.statusName) + '</span>' + (l.legacy ? '<br><span class="muted small">Recorded before statuses</span>' : '') + (l.decisionNote ? '<br><span class="muted small">' + e(l.decisionNote) + '</span>' : '') + '</td>' +
            '<td data-l="Affected visits">' + (l.affected.length ? '<button class="link" data-act="o-leave-visits" data-u="' + e(l.nurseId) + '" data-id="' + e(l.id) + '">' + l.affected.length + ' visit' + (l.affected.length === 1 ? '' : 's') + '</button>' + (need ? '<br><span class="pill pending"><i></i>' + need + ' need a nurse</span>' : '') : '<span class="muted small">' + (l.status === 'approved' ? 'None' : 'Checked when approved') + '</span>') + '</td>' +
            '<td><div class="oacts">' + acts + '</div></td></tr>';
        }).join('') + '</tbody></table></section>' : '<div class="empty"><b>No leave records match</b>Try other filters, or add leave.</div>') +
        '<p class="note">' + icon('shield') + '<span>Only approved leave makes a nurse unavailable. When leave is approved, that nurse\'s visits in the period go to a free nurse where possible; any that cannot be moved are left for you on the Visit board. Nothing is cancelled automatically, and cancelled or rejected leave stays in the history.</span></p>');
    });
  }
  function leaveOf(u, id) { return (S.cache.leave.rows || []).filter(function (l) { return l.nurseId === u && l.id === id; })[0]; }
  function leaveDialog(l) {
    var d = S.cache.leave, edit = Boolean(l);
    K.openDialog(edit ? 'Edit leave for ' + l.nurseName : 'Add leave', '<form data-form="o-leave2" data-u="' + e(edit ? l.nurseId : '') + '" data-id="' + e(edit ? l.id : '') + '" novalidate><div class="alert bad" data-msg hidden></div>' +
      (edit ? '' : '<label class="field"><span>Nurse</span><select class="in" name="nurseId"><option value="">Choose a nurse</option>' + d.nurses.map(function (n) { return '<option value="' + e(n.id) + '">' + e(n.name + ' (' + n.employeeId + ')') + '</option>'; }).join('') + '</select><em class="err" data-err="nurseId"></em></label>') +
      '<div class="row2">' + K.field('from', 'First day', 'type="date" value="' + e(edit ? l.from : '') + '"') + K.field('to', 'Last day', 'type="date" value="' + e(edit ? l.to : '') + '"') + '</div>' +
      '<label class="field"><span>Type of leave</span><select class="in" name="type">' + (edit ? '' : '<option value="">Choose…</option>') + Object.keys(d.types).map(function (k) { return '<option value="' + k + '"' + (edit && l.type === k ? ' selected' : '') + '>' + e(d.types[k]) + '</option>'; }).join('') + '</select><em class="err" data-err="type"></em></label>' +
      (edit ? '' : '<div class="field"><span>Status</span><div class="seg"><label><input type="radio" name="status" value="approved" checked><span>Approved</span></label><label><input type="radio" name="status" value="pending"><span>Pending (a request to decide)</span></label></div></div>') +
      K.field('reason', 'Reason (optional)', 'maxlength="300" value="' + e(edit ? l.reason : '') + '"') +
      '<p class="muted small">Approved leave makes the nurse unavailable. Their visits in this period go to a free nurse where possible; the rest are listed for you to reassign.</p></form>',
      '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">' + (edit ? 'Save' : 'Add leave') + '</button>');
  }
  K.FORMS['o-leave2'] = function (f, v) {
    var u = f.getAttribute('data-u'), id = f.getAttribute('data-id');
    var call = id ? api('PATCH', 'admin/leave/' + enc(u) + '/' + enc(id), v) : api('POST', 'admin/leave', v);
    return call.then(function (d) {
      if (!d.ok) return d;
      K.closeDialog();
      var need = (d.affected || []).filter(function (a) { return a.result === 'awaiting_assignment'; }).length;
      K.toast(id ? 'Leave updated.' : 'Leave added.' + (d.affected && d.affected.length ? ' ' + d.affected.length + ' visit(s) affected' + (need ? ', ' + need + ' need a nurse.' : ', all moved to another nurse.') : ''), need ? 'bad' : 'ok');
      K.render();
    });
  };
  K.FORMS['o-leave-decide'] = function (f, v) {
    return api('POST', 'admin/leave/' + enc(f.getAttribute('data-u')) + '/' + enc(f.getAttribute('data-id')) + '/' + f.getAttribute('data-kind'), { note: v.note }).then(function (d) {
      if (!d.ok) return d; K.closeDialog(); K.toast('Leave ' + (f.getAttribute('data-kind') === 'reject' ? 'rejected.' : 'cancelled.'), 'ok'); K.render();
    });
  };
  function leaveVisitsDialog(l) {
    K.openDialog('Visits affected by ' + l.nurseName + '\'s leave', '<p class="muted small">' + e(K.date(l.from)) + ' to ' + e(K.date(l.to)) + '</p><ul class="rlist">' + l.affected.map(function (a) {
      return '<li><span><b>' + e(K.date(a.date)) + '</b> · ' + e(a.customerName || '') + (a.serviceName ? ' · ' + e(a.serviceName) : '') + '<br><span class="muted small">' + e(a.reference || '') + '</span></span>' +
        (a.result === 'reassigned' ? '<span class="pill active"><i></i>Moved to ' + e(a.newNurse || 'another nurse') + '</span>' : '<span class="pill pending"><i></i>Needs a nurse</span>') + '</li>';
    }).join('') + '</ul>', '<a class="btn ghost" href="#/office/scheduler" data-act="close">Open the Visit board</a><button class="btn" data-act="close">Done</button>');
  }

  // ================================================================ Lead management
  function leadOverview(r) {
    page('office/leads/overview', 'Lead overview', 'Enquiries and bookings from the websites and the app, and how many become customers.', '', skeleton());
    api('GET', 'admin/leads/overview' + qs(r)).then(function (d) {
      if (!d.ok) return fail(d);
      var k = d.kpis;
      swap(filters(r, [['from', 'From', 'date'], ['to', 'To', 'date'], ['brand', 'Brand', 'select', brandOpts(d)], ['source', 'Source', 'select', uniq(d.sources)]]) +
        kpis([kpi('Total leads', k.total, { icon: 'inbox', sub: k.duplicatesMerged ? k.duplicatesMerged + ' repeat enquiries merged' : '' }), kpi('New', k.new, { icon: 'star' }), kpi('Contacted', k.contacted, { icon: 'phone' }), kpi('Follow-up pending', k.followUp, { icon: 'clock', tone: k.followUp ? 'warn' : '' }),
          kpi('Converted', k.converted, { icon: 'check', tone: 'good' }), kpi('Lost or closed', k.lost, { icon: 'x', tone: 'muted' }), kpi('Conversion rate', k.conversion, { icon: 'chart', suffix: '%' })]) +
        '<div class="ogrid">' +
          timeChart('Leads by month', d.overTime.map(function (x) { return x.key; }), [{ name: 'Leads', color: PAL[0], values: d.overTime.map(function (x) { return x.value; }) }]) +
          funnel('Conversion funnel', d.funnel) +
          hbars('Leads by status', d.byStatus) + hbars('Leads by source', d.bySource) +
          hbars('Leads by brand', d.byBrand, num, function (it) { return BRAND_COLOR[it.key] || PAL[0]; }) + hbars('Leads by package', d.byPackage) +
        '</div><p class="note">' + icon('shield') + '<span>' + e(d.note) + '</span></p>');
    });
  }
  function uniq(src) { var o = {}, seen = {}; Object.keys(src || {}).forEach(function (k) { if (!seen[src[k]]) { seen[src[k]] = 1; o[k] = src[k]; } }); return o; }
  function leadStatusSel(l, statuses) {
    return '<select class="in sm" data-act="o-lead-status" data-type="' + e(l.type) + '" data-id="' + e(l.id) + '" aria-label="Status of ' + e(l.enquiryId) + '">' + Object.keys(statuses).map(function (k) { return '<option value="' + k + '"' + (k === l.status ? ' selected' : '') + '>' + e(statuses[k]) + '</option>'; }).join('') + '</select>';
  }
  function leadsList(r) {
    page('office/leads/list', 'Enquiry database', 'Every enquiry and booking, with status, owner and history. Repeat enquiries from the same number are marked.', '', K.loading(60) + K.loading(400));
    api('GET', 'admin/leads' + qs(r)).then(function (d) {
      if (!d.ok) return fail(d);
      S.cache.leadMeta = d;
      var mem = {}; d.members.forEach(function (m) { mem[m.id] = m.name; }); mem.none = 'Not assigned';
      swap(filters(r, [['q', 'Search', 'search', 'Name, phone, email or enquiry ID'], ['from', 'From', 'date'], ['to', 'To', 'date'], ['brand', 'Brand', 'select', brandOpts(d)], ['source', 'Source', 'select', uniq(d.sources)], ['status', 'Status', 'select', d.statuses], ['assignee', 'Assigned to', 'select', mem]]) +
        (d.rows.length ? '<section class="panel otw"><table class="stackable otable"><thead><tr><th>Enquiry</th><th>Name and contact</th><th>Brand and package</th><th>Source</th><th>Status</th><th>Assigned to</th><th></th></tr></thead><tbody>' + d.rows.map(function (l) {
          return '<tr><td data-l="Enquiry"><b>' + e(l.enquiryId) + '</b><br><span class="muted small">' + e(K.dt(l.createdAt)) + '</span><br><span class="small">' + e(l.title) + '</span></td>' +
            '<td data-l="Contact"><b>' + e(l.name) + '</b><br><span class="small">' + e(K.phoneNice(l.phone) || l.phone) + '</span>' + (l.email ? '<br><span class="small muted">' + e(l.email) + '</span>' : '') + (l.duplicates ? '<br><span class="pill pending"><i></i>' + l.duplicates + ' other enquir' + (l.duplicates === 1 ? 'y' : 'ies') + '</span>' : '') + '</td>' +
            '<td data-l="Brand">' + tags([l.brand], d.brands) + (l.packageName ? '<br><span class="small">' + e(l.packageName) + '</span>' : '') + '</td><td data-l="Source">' + e(l.sourceName) + '</td>' +
            '<td data-l="Status">' + leadStatusSel(l, d.statuses) + '</td><td data-l="Assigned to">' + (l.assignedName ? e(l.assignedName) : '<span class="muted">Not assigned</span>') + '</td>' +
            '<td><button class="btn sm ghost" data-act="o-lead" data-type="' + e(l.type) + '" data-id="' + e(l.id) + '">Open</button></td></tr>';
        }).join('') + '</tbody></table></section>' + pager(d, r) : '<div class="empty"><b>No enquiries match</b>New website enquiries and bookings appear here.</div>'));
    });
  }
  function leadDialog(type, id) {
    api('GET', 'admin/leads/' + type + '/' + enc(id)).then(function (d) {
      if (!d.ok) return K.toast(d.message || 'Could not open the enquiry.', 'bad');
      var l = d.lead;
      K.openDialog('Enquiry ' + l.enquiryId,
        '<dl class="kv okv"><dt>Received</dt><dd>' + e(K.dt(l.createdAt)) + '</dd><dt>Name</dt><dd>' + e(l.name) + '</dd><dt>Phone</dt><dd>' + (l.phone ? '<a href="tel:' + e(l.phone) + '">' + e(K.phoneNice(l.phone) || l.phone) + '</a>' : '–') + '</dd><dt>Email</dt><dd>' + e(l.email || '–') + '</dd>' +
        '<dt>Interest</dt><dd>' + e(l.title) + '</dd><dt>Brand</dt><dd>' + e(l.brandName) + '</dd><dt>Package</dt><dd>' + e(l.packageName || 'Not chosen') + '</dd><dt>Source</dt><dd>' + e(l.sourceName) + '</dd>' + (l.message ? '<dt>Message</dt><dd style="white-space:pre-line">' + e(l.message) + '</dd>' : '') + '</dl>' +
        '<form data-form="o-lead-status" data-type="' + e(type) + '" data-id="' + e(id) + '" class="osub" novalidate><div class="alert bad" data-msg hidden></div><h3>Status</h3><div class="row2"><label class="field"><span>Status</span><select class="in" name="status">' + Object.keys(d.statuses).map(function (k) { return '<option value="' + k + '"' + (k === l.status ? ' selected' : '') + '>' + e(d.statuses[k]) + '</option>'; }).join('') + '</select></label>' +
          '<label class="field"><span>Note (optional)</span><input class="in" name="note" maxlength="300" placeholder="e.g. Called, will decide next week"></label></div><button class="btn sm" type="submit">Save status</button></form>' +
        '<form data-form="o-lead-assign" data-type="' + e(type) + '" data-id="' + e(id) + '" class="osub" novalidate><div class="alert bad" data-msg hidden></div><h3>Assigned to</h3><div class="row2"><label class="field"><span>Team member</span><select class="in" name="userId"><option value="">Choose</option>' + d.members.map(function (m) { return '<option value="' + e(m.id) + '"' + (m.id === l.assignedTo ? ' selected' : '') + '>' + e(m.name) + ' (' + m.open + ' open)</option>'; }).join('') + '</select><em class="err" data-err="userId"></em></label>' +
          '<label class="field"><span>Note (optional)</span><input class="in" name="note" maxlength="300"></label></div><button class="btn sm" type="submit">' + (l.assignedTo ? 'Reassign' : 'Assign') + '</button></form>' +
        (d.duplicates.length ? '<h3 class="osub-h">Other enquiries from the same person</h3><ul class="rlist">' + d.duplicates.map(function (x) { return '<li><span><b>' + e(x.enquiryId) + '</b> ' + e(x.title) + '<br><span class="muted small">' + e(K.dt(x.createdAt)) + ' · ' + e(x.statusName) + '</span></span><button class="btn sm ghost" data-act="o-lead" data-type="' + e(x.type) + '" data-id="' + e(x.id) + '">Open</button></li>'; }).join('') + '</ul>' : '') +
        '<h3 class="osub-h">History</h3>' + (l.history.length ? '<ol class="tl">' + l.history.slice().reverse().map(function (h) { return '<li><div class="t">' + e(h.action === 'status' ? 'Status: ' + (d.statuses[h.to] || h.to) : (h.action === 'reassigned' ? 'Reassigned to ' : 'Assigned to ') + h.to) + '</div><div class="m">' + e(K.dt(h.at)) + ' by ' + e(h.by) + '</div>' + (h.note ? '<div class="n">' + e(h.note) + '</div>' : '') + '</li>'; }).join('') + '</ol>' : '<p class="muted">No changes yet.</p>'),
        '<button class="btn ghost" data-act="close">Close</button>');
    });
  }
  K.FORMS['o-lead-status'] = function (f, v) {
    return api('PATCH', 'admin/leads/' + f.getAttribute('data-type') + '/' + enc(f.getAttribute('data-id')), { status: v.status, note: v.note }).then(function (d) { if (!d.ok) return d; K.toast('Status saved.', 'ok'); S.cache.dirtyLead = true; leadDialog(f.getAttribute('data-type'), f.getAttribute('data-id')); });
  };
  K.FORMS['o-lead-assign'] = function (f, v) {
    return api('POST', 'admin/leads/' + f.getAttribute('data-type') + '/' + enc(f.getAttribute('data-id')) + '/assign', { userId: v.userId, note: v.note }).then(function (d) { if (!d.ok) return d; K.toast('Assigned. They have been notified.', 'ok'); S.cache.dirtyLead = true; leadDialog(f.getAttribute('data-type'), f.getAttribute('data-id')); });
  };
  function leadsAssign(r) {
    var showAll = r.q.all === '1';
    page('office/leads/assign', 'Assign to a member', 'Give each enquiry an owner. The team member is notified and the change is kept in the enquiry history.', '', K.loading(140) + K.loading(320));
    Promise.all([api('GET', 'admin/leads/members'), api('GET', 'admin/leads' + K.queryOf({ q: { assignee: showAll ? '' : 'none', page: r.q.page || '', status: showAll ? '' : '' } }))]).then(function (x) {
      var m = x[0], d = x[1];
      if (!m.ok) return fail(m); if (!d.ok) return fail(d);
      var open = d.rows.filter(function (l) { return ['converted', 'lost'].indexOf(l.status) === -1; });
      swap('<div class="omembers">' + m.rows.map(function (u) { return '<div class="omem"><span class="av">' + e(K.initials(u.name)) + '</span><div><b>' + e(u.name) + '</b><span class="muted small">' + u.open + ' open · ' + u.total + ' in total</span></div></div>'; }).join('') + '</div>' +
        '<div class="sec-row"><h2 class="sec">' + (showAll ? 'All enquiries' : 'Not assigned yet') + '</h2><a class="btn sm ghost" href="#/office/leads/assign' + (showAll ? '' : '?all=1') + '">' + (showAll ? 'Show only unassigned' : 'Show all enquiries') + '</a></div>' +
        ((showAll ? d.rows : open).length ? '<section class="panel otw"><table class="stackable otable"><thead><tr><th>Enquiry</th><th>Name</th><th>Interest</th><th>Status</th><th>Assign to</th></tr></thead><tbody>' + (showAll ? d.rows : open).map(function (l) {
          return '<tr><td data-l="Enquiry"><b>' + e(l.enquiryId) + '</b><br><span class="muted small">' + e(K.ago(l.createdAt)) + '</span></td><td data-l="Name">' + e(l.name) + (l.duplicates ? ' <span class="pill pending"><i></i>repeat</span>' : '') + '</td><td data-l="Interest">' + e(l.title) + '<br>' + tags([l.brand], d.brands) + '</td><td data-l="Status">' + e(l.statusName) + '</td>' +
            '<td data-l="Assign to"><select class="in sm" data-act="o-assign-sel" data-type="' + e(l.type) + '" data-id="' + e(l.id) + '" aria-label="Assign ' + e(l.enquiryId) + '"><option value="">' + (l.assignedName ? e(l.assignedName) : 'Choose a member') + '</option>' + m.rows.filter(function (u) { return u.id !== l.assignedTo; }).map(function (u) { return '<option value="' + e(u.id) + '">' + e(u.name) + '</option>'; }).join('') + '</select></td></tr>';
        }).join('') + '</tbody></table></section>' + pager(d, r) : '<div class="empty"><b>Every enquiry has an owner</b>New enquiries that need an owner appear here.</div>'));
    });
  }

  // ================================================================ Customer directory and profile
  function customersPage(r) {
    page('office/customers', 'Customer directory', 'Every customer with their unique customer ID. Open a customer for their complete profile.', '', K.loading(60) + K.loading(420));
    api('GET', 'admin/customers' + qs(r)).then(function (d) {
      if (!d.ok) return fail(d);
      var nurses = {}; d.nurses.forEach(function (n) { nurses[n.id] = n.name; });
      var ST = { active: 'Active', paused: 'Paused', pending: 'Being set up', inactive: 'Inactive', no_plan: 'No package' };
      swap(filters(r, [['q', 'Search', 'search', 'Name, customer ID, phone or email'], ['brand', 'Brand', 'select', brandOpts(d)], ['package', 'Package', 'select', pkgOpts(d)], ['status', 'Status', 'select', { active: 'Active', inactive: 'Not active', paused: 'Paused', pending: 'Being set up', no_plan: 'No package' }], ['from', 'Registered from', 'date'], ['to', 'Registered to', 'date'], ['nurse', 'Nurse', 'select', nurses], ['sort', 'Sort', 'select', { new: 'Newest first', old: 'Oldest first', name: 'Name', id: 'Customer ID' }]]) +
        (d.rows.length ? '<section class="panel otw"><table class="stackable otable"><thead><tr><th>Customer</th><th>Brand</th><th>Package</th><th>Status</th><th>Risk</th><th>Registered</th><th>Contact</th><th>Nurses</th><th></th></tr></thead><tbody>' + d.rows.map(function (c) {
          return '<tr><td data-l="Customer"><a class="ocust" href="#/office/customer?p=' + e(c.id) + '"><span class="av">' + e(K.initials(c.name)) + '</span><span><b>' + e(c.name) + '</b><span class="muted small">' + e(c.id) + '</span></span></a></td>' +
            '<td data-l="Brand">' + (tags(c.brands, d.brands) || '–') + '</td><td data-l="Package">' + e(c.currentPackages.join(', ') || '–') + '</td><td data-l="Status"><span class="pill ' + (c.status === 'active' ? 'active' : c.status === 'pending' ? 'pending' : c.status === 'paused' ? 'paused' : 'ended') + '"><i></i>' + e(ST[c.status]) + '</span></td>' +
            '<td data-l="Risk"><span class="rcat sm ' + e(c.risk || 'grey') + '"><i aria-hidden="true">' + K.CAT_ICON[c.risk || 'grey'] + '</i>' + e(RISK_NAME[c.risk || 'grey']) + '</span></td>' +
            '<td data-l="Registered">' + e(K.date(c.registeredAt)) + '</td><td data-l="Contact"><span class="small">' + e(K.phoneNice(c.phone) || '–') + '</span>' + (c.family.length ? '<br><span class="muted small">' + e(c.family.join(', ')) + '</span>' : '') + '</td>' +
            '<td data-l="Nurses">' + e(c.nurses.map(function (n) { return n.name; }).join(', ') || '–') + '</td><td><a class="btn sm ghost" href="#/office/customer?p=' + e(c.id) + '">Profile</a></td></tr>';
        }).join('') + '</tbody></table></section>' + pager(d, r) : '<div class="empty"><b>No customers match</b>Try other filters.</div>'));
    });
  }
  function customerProfile(r) {
    K.withPerson(r, 'office/customer', function (p, people) {
      var top = '<div class="head"><div><h1>Customer profile</h1><p class="sub">Everything about one customer in one place: details, family and nurses, visits, invoices and activity.</p></div></div>';
      K.fill(top + K.personBar(p, people) + K.loading(160) + K.loading(300));
      Promise.all([api('GET', 'admin/customers/' + enc(p.id)), api('GET', 'admin/finance/invoices?q=' + enc(p.id) + '&size=50')]).then(function (x) {
        var d = x[0], inv = x[1];
        if (!d.ok) return fail(d);
        var c = d.customer, det = d.details || {}, pid = enc(p.id);
        var quick = [['health/vitals', 'Vitals', 'pulse'], ['health/body', 'Body composition', 'scale'], ['health/wellbeing', 'Wellbeing checks', 'smile'], ['health/risks', 'Risk trends', 'gauge'], ['health/notes', 'Notes', 'chat'], ['assess/onboarding', 'Onboarding record', 'idcard'], ['records', 'Medical records', 'file'], ['package', 'Package and services', 'box'], ['clientinfo', 'Client information', 'clip']]
          .map(function (q) { return '<a class="gotile sm" href="#/' + q[0] + '?p=' + pid + '"><span class="gt-i">' + icon(q[2]) + '</span><span class="gt-t"><b>' + q[1] + '</b></span>' + icon('arrow') + '</a>'; }).join('');
        var ro = function (l, v) { return '<div class="rof"><dt>' + e(l) + '</dt><dd>' + (v ? e(v) : '<span class="muted">Not given</span>') + '</dd></div>'; };
        var fam = d.links.filter(function (l) { return l.kind === 'family'; }), nur = d.links.filter(function (l) { return l.kind === 'caregiver'; });
        var html = '<section class="phead"><div class="avatar">' + (c.photo ? '<img src="/api/app/people/' + pid + '/photo?v=' + enc(c.photo) + '" alt="" width="112" height="112">' : '<span class="ph">' + icon('user') + '</span>') + '</div><div class="phead-t"><h2>' + e(c.name) + '</h2><p class="muted">Customer ID <b>' + e(c.id) + '</b> · registered ' + e(K.date(c.registeredAt)) + '</p><div class="ptags" style="margin-top:8px">' + tags(c.brands, { karehome: 'Kare@Home', karenest: 'KareNest', karewellness: 'KareWellness' }) + ' <span class="pill ' + (c.status === 'active' ? 'active' : 'pending') + '"><i></i>' + e(c.status === 'active' ? 'Active' : c.status.replace('_', ' ')) + '</span></div></div></section>' +
          '<div class="gotiles osm">' + quick + '</div>' +
          '<section class="panel"><div class="panel-h"><h2>Overall risk</h2><a class="btn sm ghost" href="#/health/risks?p=' + pid + '">' + icon('gauge') + 'Risk trends</a></div><div id="orisk">' + K.loading(80) + '</div></section>' +
          '<div class="ogrid2"><section class="panel"><h2>Details</h2><dl class="rogrid">' + ro('Phone', K.phoneNice(det.phone1 || c.phone)) + ro('Email', det.email || c.email) + ro('Address', det.address) + ro('Blood group', det.bloodGroup) + ro('Packages', c.currentPackages.join(', ')) + ro('Details form', d.detailsStatus) + '</dl></section>' +
          '<section class="panel"><h2>Family and care team</h2><ul class="rlist">' + fam.concat(nur).map(function (l) { return '<li><span><b>' + e(l.name) + '</b><br><span class="muted small">' + e(l.kind === 'family' ? 'Family' + (l.relation ? ', ' + l.relation : '') : 'Nurse') + ' · since ' + e(K.date(l.since)) + '</span></span></li>'; }).join('') + '</ul>' + (fam.length + nur.length ? '' : '<p class="muted">No one linked yet.</p>') + '<a class="link small" href="#/admin/people">Change in People and plans</a></section></div>' +
          '<section class="panel"><div class="panel-h"><h2>Visits</h2><a class="btn sm ghost" href="#/office/scheduler">' + icon('cal') + 'Visit board</a></div>' + (d.visits.length ? '<div class="tw"><table class="stackable otable"><thead><tr><th>Date</th><th>Service</th><th>Nurse</th><th>Status</th></tr></thead><tbody>' + d.visits.slice(0, 12).map(function (v) { return '<tr><td data-l="Date"><b>' + e(K.date(v.date)) + '</b> ' + e(v.start ? K.hm12(v.start) : v.slot) + '<br><span class="muted small">' + e(v.reference) + '</span></td><td data-l="Service">' + e(v.serviceName) + '</td><td data-l="Nurse">' + e(v.nurse || '–') + '</td><td data-l="Status"><span class="vpill ' + e(v.status) + '">' + e(v.statusName) + '</span></td></tr>'; }).join('') + '</tbody></table></div>' : '<p class="muted">No visits booked.</p>') + '</section>' +
          '<section class="panel"><div class="panel-h"><h2>Invoices</h2><a class="btn sm ghost" href="#/office/finance/invoices?q=' + pid + '">All invoices</a></div>' + (inv.ok && inv.rows.length ? invoiceTable(inv.rows, true) : '<p class="muted">No invoices yet.</p>') + '</section>' +
          (d.orders.length ? '<section class="panel"><h2>Orders</h2><ul class="rlist">' + d.orders.map(function (o) { return '<li><span><b>' + e(o.name) + '</b> · ' + e(o.amountText) + '<br><span class="muted small">' + e(o.reference) + ' · ' + e(K.dt(o.createdAt)) + '</span></span><span class="pill">' + e(o.status.replace(/_/g, ' ')) + '</span></li>'; }).join('') + '</ul></section>' : '') +
          '<section class="panel"><h2>Recent activity</h2>' + (d.activity.length ? '<ol class="tl">' + d.activity.slice(0, 15).map(function (a) { return '<li><div class="t">' + e(K.ACTIONS[a.action] || a.action) + '</div><div class="m">' + e(K.dt(a.at)) + ' · ' + e(a.by) + '</div></li>'; }).join('') + '</ol>' : '<p class="muted">Nothing yet.</p>') + '</section>' +
          '<p class="note">' + icon('shield') + '<span>You are viewing this customer as the office. Nothing here signs you in as them.</span></p>';
        K.fill(top + K.personBar(p, people) + html);
        api('GET', 'people/' + pid + '/risk').then(function (rk) { var b = $('#orisk'); if (b) b.innerHTML = rk.ok ? K.riskHero(rk.status, { history: true, pid: p.id }) : '<p class="muted">' + e(rk.message || 'Not available') + '</p>'; });
      });
    });
  }

  // ================================================================ Financials
  function invoiceTable(rows, compact) {
    return '<div class="tw"><table class="stackable otable"><thead><tr><th>Invoice</th>' + (compact ? '' : '<th>Customer</th>') + '<th>Package</th><th>Amount</th><th>Paid</th><th>Outstanding</th><th>Status</th><th></th></tr></thead><tbody>' + rows.map(function (i) {
      return '<tr><td data-l="Invoice"><b>' + e(i.number) + '</b><br><span class="muted small">' + e(K.date(i.date)) + ', due ' + e(K.date(i.dueDate)) + '</span></td>' +
        (compact ? '' : '<td data-l="Customer"><a href="#/office/customer?p=' + e(i.personId) + '">' + e(i.customerName) + '</a><br><span class="muted small">' + e(i.personId) + '</span></td>') +
        '<td data-l="Package">' + e(i.packageName) + (i.months ? '<br><span class="muted small">' + i.months + ' month' + (i.months > 1 ? 's' : '') + '</span>' : '') + '</td><td data-l="Amount"><b>' + money(i.amount) + '</b></td><td data-l="Paid">' + money(i.paid - i.refunded) + '</td>' +
        '<td data-l="Outstanding">' + (i.outstanding ? '<b>' + money(i.outstanding) + '</b>' + (i.overdueDays ? '<br><span class="odue">' + i.overdueDays + ' days overdue</span>' : '') : '–') + '</td>' +
        '<td data-l="Status"><span class="ipill ' + e(i.status) + '">' + e(INV_STATUS[i.status] || i.status) + '</span></td>' +
        '<td class="oacts"><a class="btn sm ghost" href="/api/app/admin/finance/invoices/' + enc(i.planId) + '/pdf" download>' + icon('download') + 'PDF</a>' +
        (i.outstanding ? '<button class="btn sm" data-act="o-pay" data-id="' + e(i.planId) + '" data-n="' + e(i.number) + '" data-o="' + i.outstanding + '">Record payment</button>' : '') +
        (i.paid - i.refunded > 0 ? '<button class="btn sm ghost" data-act="o-refund" data-id="' + e(i.planId) + '" data-n="' + e(i.number) + '" data-o="' + (i.paid - i.refunded) + '">Refund</button>' : '') + '</td></tr>';
    }).join('') + '</tbody></table></div>';
  }
  function invoicesPage(r) {
    page('office/finance/invoices', 'Invoices', 'One invoice for every confirmed package. Download it, or record a payment after checking it in the bank or payment account.', '', K.loading(60) + K.loading(420));
    api('GET', 'admin/finance/invoices' + qs(r)).then(function (d) {
      if (!d.ok) return fail(d);
      S.cache.methods = d.methods;
      swap(filters(r, [['q', 'Search', 'search', 'Invoice number, customer or ID'], ['from', 'From', 'date'], ['to', 'To', 'date'], ['brand', 'Brand', 'select', brandOpts(d)], ['package', 'Package', 'select', pkgOpts(d)], ['status', 'Status', 'select', { paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid', overdue: 'Overdue', refunded: 'Refunded' }], ['plan', 'Package status', 'select', { active: 'Active', paused: 'Paused', ended: 'Ended' }]]) +
        kpis([kpi('Invoiced', d.totals.amount, { money: true, icon: 'receipt', sub: d.total + ' invoices' }), kpi('Paid', d.totals.paid, { money: true, icon: 'check', tone: 'good' }), kpi('Outstanding', d.totals.outstanding, { money: true, icon: 'clock', tone: d.totals.outstanding ? 'warn' : '' })]) +
        (d.rows.length ? '<section class="panel otw">' + invoiceTable(d.rows) + '</section>' + pager(d, r) : '<div class="empty"><b>No invoices match</b>Invoices appear once a package is confirmed.</div>'));
    });
  }
  function duePage(r) {
    page('office/finance/due', 'Payment due', 'Invoices with money still owed, the most overdue first. An invoice is due 7 days after its date.', '', skeleton());
    api('GET', 'admin/finance/due' + qs(r)).then(function (d) {
      if (!d.ok) return fail(d);
      S.cache.methods = d.methods;
      swap(filters(r, [['q', 'Search', 'search', 'Invoice, customer or ID'], ['brand', 'Brand', 'select', brandOpts(d)], ['package', 'Package', 'select', pkgOpts(d)], ['overdue', 'Overdue', 'select', { not: 'Not yet due', '1-30': '1 to 30 days', '31-60': '31 to 60 days', '60+': 'More than 60 days' }], ['status', 'Status', 'select', { unpaid: 'Unpaid', partial: 'Part paid' }], ['from', 'Due from', 'date'], ['to', 'Due to', 'date']]) +
        kpis([kpi('Outstanding', d.totals.outstanding, { money: true, icon: 'rupee', tone: d.totals.outstanding ? 'warn' : '' }), kpi('Overdue invoices', d.totals.overdue, { icon: 'clock', tone: d.totals.overdue ? 'bad' : '' }), kpi('Invoices with money owed', d.totals.invoices, { icon: 'receipt' })]) +
        '<div class="ogrid">' + hbars('Outstanding by brand', d.byBrand, money, function (it) { return BRAND_COLOR[it.key] || PAL[0]; }) + hbars('Outstanding by package', d.byPackage, money) +
          timeChart('Overdue amount by due month', d.trend.map(function (x) { return x.key; }), [{ name: 'Overdue', color: PAL[7], values: d.trend.map(function (x) { return x.value; }) }], { fmt: money, short: moneyShort }) + '</div>' +
        (d.rows.length ? '<section class="panel otw">' + invoiceTable(d.rows) + '</section>' + pager(d, r) : '<div class="empty"><b>Nothing is owed</b>Every invoice matching these filters is paid.</div>'));
    });
  }
  function payDialog(planId, number, outstanding, refund) {
    var m = S.cache.methods || { upi: 'UPI', card: 'Card', netbanking: 'Net banking', bank: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' };
    K.openDialog((refund ? 'Record a refund: ' : 'Record a payment: ') + number,
      '<form data-form="o-pay" data-id="' + e(planId) + '" data-refund="' + (refund ? '1' : '') + '" novalidate><div class="alert bad" data-msg hidden></div>' +
      '<p class="muted" style="margin-bottom:12px">' + (refund ? 'Up to ' + money(outstanding) + ' can be refunded.' : money(outstanding) + ' is outstanding. Record only money you have seen in the bank or payment account.') + '</p>' +
      (refund ? '' : '<label class="field"><span>How it was paid</span><select class="in" name="method"><option value="">Choose</option>' + Object.keys(m).map(function (k) { return '<option value="' + k + '">' + e(m[k]) + '</option>'; }).join('') + '</select><em class="err" data-err="method"></em></label>') +
      '<div class="row2">' + K.field('amount', 'Amount (₹)', 'inputmode="numeric" value="' + outstanding + '"') + K.field('ref', refund ? 'Refund transaction number' : 'Transaction or receipt number', 'maxlength="60"') + '</div>' +
      (refund ? K.field('reason', 'Reason', 'maxlength="200"') : '') + '</form>',
      '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">' + (refund ? 'Record refund' : 'Record payment') + '</button>');
  }
  K.FORMS['o-pay'] = function (f, v) {
    var refund = f.getAttribute('data-refund') === '1';
    v.planId = f.getAttribute('data-id');
    return api('POST', 'admin/finance/' + (refund ? 'refunds' : 'payments'), v).then(function (d) { if (!d.ok) return d; K.closeDialog(); K.toast(refund ? 'Refund recorded.' : 'Payment recorded.', 'ok'); K.render(); });
  };

  // ================================================================ Employees
  function employeesPage(r) {
    page('office/employees', 'Employee overview', 'Everyone with a staff login: nurses and the office team.', '', skeleton());
    api('GET', 'admin/employees' + qs(r)).then(function (d) {
      if (!d.ok) return fail(d);
      var units = d.units, depts = {}; d.departments.forEach(function (x) { depts[x] = x; });
      var k = d.kpis;
      swap(filters(r, [['q', 'Search', 'search', 'Name or employee ID'], ['role', 'Role', 'select', { caregiver: 'Nurse / caregiver', admin: 'Office' }], ['department', 'Department', 'select', depts], ['unit', 'Business unit', 'select', units], ['status', 'Status', 'select', { active: 'Active', inactive: 'Inactive', on_leave: 'On leave' }], ['location', 'Location', 'search', 'e.g. Kochi'], ['from', 'Joined from', 'date'], ['to', 'Joined to', 'date']]) +
        kpis([kpi('Employees', k.total, { icon: 'team' }), kpi('Active', k.active, { icon: 'check', tone: 'good' }), kpi('On leave today', k.onLeave, { icon: 'cal', tone: k.onLeave ? 'warn' : '' }), kpi('Inactive', k.inactive, { icon: 'x', tone: 'muted' }), kpi('Joined in 30 days', k.newlyJoined, { icon: 'plus' })]) +
        '<div class="ogrid">' + donut('By role', d.byRole) + hbars('By department', d.byDepartment) + hbars('By business unit', d.byUnit) + donut('By status', d.byStatus, num, function (it) { return { active: PAL[2], on_leave: PAL[3], inactive: '#9aa5b1' }[it.key] || PAL[0]; }) +
          timeChart('Joined by month', d.joining.map(function (x) { return x.key; }), [{ name: 'Joined', color: PAL[0], values: d.joining.map(function (x) { return x.value; }) }]) + '</div>' +
        (d.rows.length ? '<section class="panel otw">' + empTable(d.rows) + '</section>' : '<div class="empty"><b>No employees match</b></div>'));
    });
  }
  var KYC = { not_submitted: 'Not submitted', submitted: 'Submitted, to check', verified: 'Verified', action_needed: 'Action needed' };
  var EST = { active: 'Active', inactive: 'Inactive', on_leave: 'On leave' };
  function empTable(rows) {
    return '<table class="stackable otable"><thead><tr><th>Employee</th><th>Role</th><th>Department</th><th>Unit and location</th><th>Joined</th><th>Service</th><th>Status</th><th>KYC</th></tr></thead><tbody>' + rows.map(function (x) {
      return '<tr><td data-l="Employee"><a class="ocust" href="#/office/employees/kyc?id=' + e(x.userId) + '"><span class="av">' + e(K.initials(x.name)) + '</span><span><b>' + e(x.name) + '</b><span class="muted small">' + e(x.employeeId) + '</span></span></a></td><td data-l="Role">' + e(x.roleName) + '</td><td data-l="Department">' + e(x.department || '–') + '</td>' +
        '<td data-l="Unit">' + e(x.businessUnitName) + (x.location ? '<br><span class="muted small">' + e(x.location) + '</span>' : '') + '</td><td data-l="Joined">' + e(x.joinDate ? K.date(x.joinDate) : '–') + '</td><td data-l="Service">' + e(x.service ? x.service.text : '–') + '</td>' +
        '<td data-l="Status"><span class="pill ' + (x.status === 'active' ? 'active' : x.status === 'on_leave' ? 'pending' : 'ended') + '"><i></i>' + e(EST[x.status]) + '</span></td><td data-l="KYC"><span class="kpill ' + e(x.kycStatus) + '">' + e(KYC[x.kycStatus]) + '</span></td></tr>';
    }).join('') + '</tbody></table>';
  }
  function kycPage(r) {
    page('office/employees/kyc', 'KYC and details', 'Employee records, identity documents and how long each person has worked here.', '', K.loading(420));
    api('GET', 'admin/employees').then(function (list) {
      if (!list.ok) return fail(list);
      var pick = list.rows.filter(function (x) { return x.userId === r.q.id; })[0] || list.rows[0];
      if (!pick) return swap('<div class="empty"><b>No employees yet</b>Add staff logins under Settings, Logins.</div>');
      api('GET', 'admin/employees/' + enc(pick.userId)).then(function (d) {
        if (!d.ok) return fail(d);
        var x = d.employee, kyc = x.kyc, ec = x.emergencyContact || {};
        var side = '<nav class="oside" aria-label="Employees">' + list.rows.map(function (y) { return '<a href="#/office/employees/kyc?id=' + e(y.userId) + '"' + (y.userId === x.userId ? ' aria-current="page"' : '') + '><span class="av">' + e(K.initials(y.name)) + '</span><span><b>' + e(y.name) + '</b><span class="kpill ' + e(y.kycStatus) + '">' + e(KYC[y.kycStatus]) + '</span></span></a>'; }).join('') + '</nav>';
        var sel = function (name, opts, v) { return '<select class="in" name="' + name + '">' + Object.keys(opts).map(function (k) { return '<option value="' + e(k) + '"' + (k === v ? ' selected' : '') + '>' + e(opts[k]) + '</option>'; }).join('') + '</select>'; };
        var depts = {}; d.departments.forEach(function (z) { depts[z] = z; });
        var main = '<section class="phead"><div class="avatar"><span class="ph">' + icon('user') + '</span></div><div class="phead-t"><h2>' + e(x.name) + '</h2><p class="muted">' + e(x.employeeId) + ' · ' + e(x.roleName) + '</p><div class="ptags" style="margin-top:8px"><span class="pill ' + (x.status === 'active' ? 'active' : 'pending') + '"><i></i>' + e(EST[x.status]) + '</span><span class="kpill ' + e(kyc.status) + '">KYC: ' + e(KYC[kyc.status]) + '</span></div></div></section>' +
          '<div class="okpis">' + kpi('Length of service', x.service ? x.service.days : 0, { icon: 'clock', sub: e(x.service ? x.service.text : 'Set the date of joining') + ' (days)' }) + kpi('Documents', kyc.docs.length, { icon: 'file', sub: kyc.pending.length ? kyc.pending.length + ' still to verify' : 'all verified' }) + '</div>' +
          '<section class="panel"><h2>Employee details</h2><form data-form="o-emp" data-id="' + e(x.userId) + '" novalidate><div class="alert bad" data-msg hidden></div><div class="detgrid">' +
            '<label class="field"><span>Department</span>' + sel('department', depts, x.department) + '</label><label class="field"><span>Business unit</span>' + sel('businessUnit', d.units, x.businessUnit) + '</label>' +
            K.field('location', 'Location', 'value="' + e(x.location) + '" maxlength="80"') + K.field('joinDate', 'Date of joining', 'type="date" max="' + K.todayIST() + '" value="' + e(x.joinDate || '') + '"') +
            '<label class="field"><span>Status</span>' + sel('status', { active: 'Active', inactive: 'Inactive' }, x.status === 'inactive' ? 'inactive' : 'active') + '</label>' +
            '<div class="rof"><dt>Phone and email (from the login)</dt><dd>' + e([K.phoneNice(x.phone), x.email].filter(Boolean).join(' · ') || '–') + '</dd></div>' +
            K.field('ecName', 'Emergency contact name', 'value="' + e(ec.name || '') + '" maxlength="80"') + K.field('ecRelation', 'Relationship', 'value="' + e(ec.relation || '') + '" maxlength="40"') + K.field('ecPhone', 'Emergency contact phone', 'type="tel" value="' + e(ec.phone || '') + '"') +
          '</div><button class="btn" type="submit">Save details</button></form></section>' +
          '<section class="panel"><div class="panel-h"><h2>KYC documents</h2><span class="muted small">Only the office can open these. Every view is recorded.</span></div>' +
            (kyc.pending.length ? '<p class="alert info">Still needed or to verify: ' + e(kyc.pending.map(function (p) { return p.name + (p.sent ? ' (sent)' : ''); }).join(', ')) + '</p>' : '<p class="alert ok">All required documents are verified' + (kyc.verifiedAt ? ' (' + e(K.date(kyc.verifiedAt)) + ')' : '') + '.</p>') +
            (kyc.docs.length ? '<ul class="rlist">' + kyc.docs.map(function (doc) {
              return '<li><span><b>' + e(doc.kindName) + '</b> · ' + e(doc.name) + '<br><span class="muted small">Uploaded ' + e(K.dt(doc.uploadedAt)) + (doc.verifiedAt ? ', verified ' + e(K.date(doc.verifiedAt)) : '') + (doc.note ? ' · ' + e(doc.note) : '') + '</span></span>' +
                '<span class="oacts"><span class="kpill ' + (doc.status === 'verified' ? 'verified' : doc.status === 'rejected' ? 'action_needed' : 'submitted') + '">' + e({ verified: 'Verified', rejected: 'Rejected', submitted: 'To check' }[doc.status]) + '</span>' +
                '<a class="btn sm ghost" href="/api/app/admin/employees/' + enc(x.userId) + '/kyc/' + enc(doc.id) + '" target="_blank" rel="noopener">' + icon('eye') + 'Open</a>' +
                (doc.status !== 'verified' ? '<button class="btn sm" data-act="o-kyc" data-u="' + e(x.userId) + '" data-id="' + e(doc.id) + '" data-s="verified">Verify</button>' : '') + (doc.status === 'submitted' ? '<button class="btn sm ghost" data-act="o-kyc" data-u="' + e(x.userId) + '" data-id="' + e(doc.id) + '" data-s="rejected">Reject</button>' : '') + '</span></li>';
            }).join('') + '</ul>' : '<p class="muted">No documents uploaded yet.</p>') +
            '<form data-form="o-kyc-up" data-id="' + e(x.userId) + '" class="osub" novalidate><div class="alert bad" data-msg hidden></div><h3>Add a document</h3><div class="row2"><label class="field"><span>Document</span><select class="in" name="kind">' + Object.keys(d.kycKinds).map(function (k) { return '<option value="' + k + '">' + e(d.kycKinds[k]) + '</option>'; }).join('') + '</select></label>' +
              '<label class="field"><span>File</span><input class="in" type="file" name="file" accept="application/pdf,image/jpeg,image/png,image/webp"><em class="err" data-err="file"></em></label></div><button class="btn sm" type="submit">' + icon('upload') + 'Upload</button></form></section>';
        swap('<div class="oemp">' + side + '<div class="oemp-m">' + main + '</div></div>');
      });
    });
  }
  K.FORMS['o-emp'] = function (f, v) {
    var body = { department: v.department, businessUnit: v.businessUnit, location: v.location, status: v.status, emergencyContact: v.ecName ? { name: v.ecName, relation: v.ecRelation, phone: v.ecPhone } : null };
    if (v.joinDate) body.joinDate = v.joinDate;
    return api('PATCH', 'admin/employees/' + enc(f.getAttribute('data-id')), body).then(function (d) { if (!d.ok) return d; K.toast('Details saved.', 'ok'); K.render(); });
  };
  K.FORMS['o-kyc-up'] = function (f, v) {
    var file = $('[name=file]', f).files[0];
    if (!file) return Promise.resolve({ ok: false, errors: { file: 'Choose a file' } });
    if (file.size > 5 * 1024 * 1024) return Promise.resolve({ ok: false, errors: { file: 'Up to 5 MB' } });
    return fetch('/api/app/admin/employees/' + enc(f.getAttribute('data-id')) + '/kyc', { method: 'POST', credentials: 'same-origin', body: file, headers: { 'Content-Type': 'application/octet-stream', 'X-Requested-With': 'kareiq', 'X-CSRF': S.csrf, 'X-Kind': v.kind, 'X-File-Name': encodeURIComponent(file.name) } })
      .then(function (r) { return r.json().catch(function () { return { ok: false, message: 'The upload did not finish.' }; }); }, function () { return { ok: false, message: 'Could not reach KareIQ.' }; })
      .then(function (d) { if (!d.ok) return d; K.toast('Document uploaded.', 'ok'); K.render(); });
  };

  // ================================================================ Nurse scheduler
  function boardPage(r) {
    var t = K.todayIST(), from = /^\d{4}-\d{2}-\d{2}$/.test(r.q.from || '') ? r.q.from : t, to = /^\d{4}-\d{2}-\d{2}$/.test(r.q.to || '') && r.q.to >= from ? r.q.to : addDays(from, 6);
    r.q.from = from; r.q.to = to;
    page('office/scheduler', 'Visit board', 'Visits are assigned automatically by availability, then fairness. Assign or reassign by hand here.', '<button class="btn" data-act="o-book">' + icon('plus') + 'Book a visit</button>', K.loading(140) + K.loading(360));
    Promise.all([api('GET', 'admin/scheduler/visits?from=' + from + '&to=' + to + (r.q.nurse ? '&nurse=' + enc(r.q.nurse) : '') + (r.q.brand ? '&brand=' + enc(r.q.brand) : '') + (r.q.status ? '&status=' + enc(r.q.status) : '')),
      api('GET', 'admin/scheduler/visits?status=awaiting_assignment'), api('GET', 'admin/scheduler/nurses')]).then(function (x) {
      var d = x[0], wait = x[1], n = x[2];
      if (!d.ok) return fail(d);
      S.cache.schedMeta = n;
      var nurses = {}; (n.rows || []).forEach(function (y) { nurses[y.id] = y.name; });
      var active = d.rows.filter(function (v) { return v.status !== 'cancelled'; });
      var kp = kpis([kpi('Visits in this range', active.length, { icon: 'cal' }), kpi('Awaiting assignment', wait.rows.length, { icon: 'clock', tone: wait.rows.length ? 'bad' : 'good' }), kpi('Completed', d.rows.filter(function (v) { return v.status === 'completed'; }).length, { icon: 'check' }), kpi('Conflicts', d.conflicts.length, { icon: 'x', tone: d.conflicts.length ? 'bad' : 'good' })]);
      var waitHtml = wait.rows.length ? '<section class="panel owait"><div class="panel-h"><h2>' + icon('clock') + 'Awaiting assignment</h2><span class="muted small">No nurse was free when these were booked</span></div><ul class="rlist">' + wait.rows.map(function (v) {
        return '<li><span><b>' + e(v.customerName) + '</b> · ' + e(v.serviceName) + '<br><span class="muted small">' + e(shortDay(v.date)) + ', ' + e(v.slot === 'evening' ? 'evening' : 'morning') + ' · ' + e(v.reference) + '</span></span><span class="oacts"><button class="btn sm" data-act="o-assign" data-id="' + e(v.id) + '">Assign a nurse</button><button class="btn sm ghost" data-act="o-cancel" data-id="' + e(v.id) + '">Cancel</button></span></li>';
      }).join('') + '</ul></section>' : '';
      var conf = d.conflicts.length ? '<section class="panel oconf"><h2>' + icon('x') + 'Conflicts</h2><ul class="rlist">' + d.conflicts.map(function (c) { var v = d.rows.filter(function (x) { return x.id === c.visitId; })[0]; return '<li><span><b>' + e(c.why) + '</b>' + (v ? '<br><span class="muted small">' + e(v.reference + ', ' + v.customerName + ', ' + shortDay(v.date) + ' ' + K.hm12(v.start)) + '</span>' : '') + '</span>' + (v ? '<button class="btn sm ghost" data-act="o-assign" data-id="' + e(v.id) + '">Reassign</button>' : '') + '</li>'; }).join('') + '</ul></section>' : '';
      var days = []; for (var dd = from; dd <= to && days.length < 31; dd = addDays(dd, 1)) days.push(dd);
      var board = '<div class="oboard">' + days.map(function (day) {
        var list = d.rows.filter(function (v) { return v.date === day; });
        if (!list.length) return '<section class="obd empty-day' + (day === t ? ' now' : '') + '"><h3>' + e(shortDay(day)) + (day === t ? ' <span class="pill new">Today</span>' : '') + ' <span class="muted small">No visits</span></h3></section>';
        return '<section class="obd' + (day === t ? ' now' : '') + '"><h3>' + e(shortDay(day)) + (day === t ? ' <span class="pill new">Today</span>' : '') + '</h3>' + ['morning', 'evening'].map(function (s) {
          var sl = list.filter(function (v) { return v.slot === s; });
          return '<div class="obs"><span class="obs-h">' + (s === 'morning' ? 'Morning · 8 AM to 12 PM' : 'Evening · 2 PM to 6 PM') + '</span>' + (sl.length ? sl.map(visitRow).join('') : '<p class="muted small">No visits</p>') + '</div>';
        }).join('') + '</section>';
      }).join('') + '</div>';
      swap(filters(r, [['from', 'From', 'date'], ['to', 'To', 'date'], ['nurse', 'Nurse', 'select', nurses], ['brand', 'Brand', 'select', { karehome: 'Kare@Home', karenest: 'KareNest' }], ['status', 'Status', 'select', VSTATUS]]) + kp + waitHtml + conf + board);
    });
  }
  function visitRow(v) {
    var live = ['assigned', 'accepted', 'in_progress'].indexOf(v.status) > -1;
    return '<div class="ovr ' + e(v.status) + '"><div class="ovr-t"><b>' + e(v.start ? K.hm12(v.start) + (v.end ? ' to ' + K.hm12(v.end) : '') : 'No time yet') + '</b><span class="vpill ' + e(v.status) + '">' + e(v.statusName) + '</span></div>' +
      '<div><a href="#/office/customer?p=' + e(v.personId) + '"><b>' + e(v.customerName) + '</b></a> · ' + e(v.serviceName) + '</div><div class="muted small">' + e(v.nurseName ? 'Nurse: ' + v.nurseName : 'No nurse yet') + ' · ' + e(v.reference) + (v.location ? ' · ' + e(v.location) : '') + '</div>' +
      (live || v.status === 'awaiting_assignment' ? '<div class="oacts"><button class="btn sm ghost" data-act="o-assign" data-id="' + e(v.id) + '">' + (v.nurseId ? 'Reassign' : 'Assign') + '</button><button class="btn sm ghost" data-act="o-cancel" data-id="' + e(v.id) + '">Cancel</button></div>' : '') +
      (v.history && v.history.length ? '<details class="ohist"><summary>History</summary><ol class="tl">' + v.history.map(function (h) { return '<li><div class="t">' + e(h.action.replace(/_/g, ' ')) + '</div><div class="m">' + e(K.dt(h.at)) + ' · ' + e(h.byName || '') + '</div>' + (h.note ? '<div class="n">' + e(h.note) + '</div>' : '') + '</li>'; }).join('') + '</ol></details>' : '') + '</div>';
  }
  function assignDialog(id) {
    api('GET', 'admin/scheduler/visits/' + enc(id) + '/options').then(function (d) {
      if (!d.ok) return K.toast(d.message || 'Could not load the nurses.', 'bad');
      K.openDialog('Assign a nurse', '<form data-form="o-assign" data-id="' + e(id) + '" novalidate><div class="alert bad" data-msg hidden></div><p class="muted" style="margin-bottom:12px">Only nurses who are free for this visit can be chosen. The list is ordered by fairness (fewest visits this week first).</p>' +
        '<div class="pick">' + d.rows.map(function (o, i) {
          return '<label><input type="radio" name="nurseId" value="' + e(o.id) + '"' + (o.ok ? '' : ' disabled') + (o.current ? ' checked' : '') + '><span><b>' + e(o.name) + (o.current ? ' (now assigned)' : '') + '</b><em>' + (o.ok ? 'Free from ' + e(K.hm12(o.start)) + ' · ' + o.weekLoad + ' this week' : e(o.why)) + '</em></span></label>';
        }).join('') + '</div><label class="field" style="margin-top:12px"><span>Note (optional)</span><input class="in" name="note" maxlength="200"></label></form>',
        '<button class="btn ghost" data-act="close">Cancel</button><button class="btn ghost" data-act="o-auto-assign" data-id="' + e(id) + '">Pick automatically</button><button class="btn" data-act="submit-dialog">Assign</button>');
    });
  }
  K.FORMS['o-assign'] = function (f, v) {
    if (!v.nurseId) return Promise.resolve({ ok: false, message: 'Choose a nurse, or pick automatically.' });
    return api('POST', 'admin/scheduler/visits/' + enc(f.getAttribute('data-id')) + '/assign', { nurseId: v.nurseId, note: v.note }).then(function (d) { if (!d.ok) return d; K.closeDialog(); K.toast('Assigned. The nurse has been notified.', 'ok'); K.render(); });
  };
  K.FORMS['o-cancel'] = function (f, v) {
    return api('POST', 'admin/scheduler/visits/' + enc(f.getAttribute('data-id')) + '/cancel', { note: v.note }).then(function (d) { if (!d.ok) return d; K.closeDialog(); K.toast('Visit cancelled.', 'ok'); K.render(); });
  };
  function bookDialog() {
    Promise.all([K.loadPeople(), S.cache.schedMeta ? Promise.resolve(S.cache.schedMeta) : api('GET', 'admin/scheduler/nurses')]).then(function (x) {
      var people = x[0], meta = x[1];
      K.openDialog('Book a visit', '<form data-form="o-book" novalidate><div class="alert bad" data-msg hidden></div>' +
        '<label class="field"><span>Customer</span><select class="in" name="personId"><option value="">Choose a customer</option>' + people.map(function (p) { return '<option value="' + e(p.id) + '">' + e(p.name + ' (' + p.id + ')') + '</option>'; }).join('') + '</select></label>' +
        '<label class="field"><span>Service</span><select class="in" name="service">' + (meta.services || []).map(function (s) { return '<option value="' + e(s.id) + '">' + e(s.name) + '</option>'; }).join('') + '</select></label>' +
        '<div class="row2">' + K.field('date', 'Date', 'type="date" min="' + K.todayIST() + '" value="' + addDays(K.todayIST(), 1) + '"') + '<label class="field"><span>Time</span><select class="in" name="slot"><option value="morning">Morning (8 AM to 12 PM)</option><option value="evening">Evening (2 PM to 6 PM)</option></select></label></div>' +
        '<p class="muted small">A free nurse is assigned automatically. If no one is free, the visit waits under Awaiting assignment.</p></form>',
        '<button class="btn ghost" data-act="close">Cancel</button><button class="btn" data-act="submit-dialog">Book</button>');
    });
  }
  K.FORMS['o-book'] = function (f, v) {
    return api('POST', 'admin/scheduler/visits', v).then(function (d) { if (!d.ok) return d; K.closeDialog(); K.toast(d.message, d.assigned ? 'ok' : 'bad'); K.render(); });
  };
  function nursesPage() {
    page('office/scheduler/nurses', 'Nurses and hours', 'Working days, slots, travel time, brands and services for each nurse, and their leave. Visits during new leave are moved to a free nurse.', '', K.loading(380));
    api('GET', 'admin/scheduler/nurses').then(function (d) {
      if (!d.ok) return fail(d);
      swap(d.rows.length ? '<div class="onurses">' + d.rows.map(function (n) {
        var a = n.availability;
        return '<section class="panel onurse"><div class="panel-h"><div class="ocust"><span class="av">' + e(K.initials(n.name)) + '</span><span><h2 class="onm">' + e(n.name) + '</h2><span class="muted small">' + e(n.employeeId) + ' · ' + n.weekVisits + ' visits this week</span></span></div>' +
          (n.onLeave ? '<span class="pill pending"><i></i>On leave today</span>' : n.active ? '<span class="pill active"><i></i>Working</span>' : '<span class="pill ended"><i></i>Inactive</span>') + '</div>' +
          '<form data-form="o-hours" data-id="' + e(n.id) + '" novalidate><div class="alert bad" data-msg hidden></div><table class="ohours"><thead><tr><th></th>' + DAYS.map(function (x) { return '<th>' + x[1] + '</th>'; }).join('') + '</tr></thead><tbody>' + ['morning', 'evening'].map(function (s) {
            return '<tr><th>' + (s === 'morning' ? 'Morning' : 'Evening') + '</th>' + DAYS.map(function (x) { return '<td><input type="checkbox" name="d.' + x[0] + '.' + s + '" aria-label="' + x[1] + ' ' + s + '"' + ((a.days[x[0]] || []).indexOf(s) > -1 ? ' checked' : '') + '></td>'; }).join('') + '</tr>';
          }).join('') + '</tbody></table>' +
          '<div class="row2">' + K.field('bufferMin', 'Travel time between visits (minutes)', 'inputmode="numeric" value="' + a.bufferMin + '"') + K.field('maxPerSlot', 'Most visits in one slot (empty = no limit)', 'inputmode="numeric" value="' + (a.maxPerSlot || '') + '"') + '</div>' +
          '<fieldset class="multi"><legend>Brands</legend><div class="chips2">' + [['karehome', 'Kare@Home'], ['karenest', 'KareNest']].map(function (b) { return '<label class="chipck"><input type="checkbox" name="b.' + b[0] + '"' + (a.brands.indexOf(b[0]) > -1 ? ' checked' : '') + '>' + b[1] + '</label>'; }).join('') + '</div></fieldset>' +
          '<fieldset class="multi" style="margin-top:10px"><legend>Services (none ticked = every service)</legend><div class="chips2">' + d.services.map(function (s) { return '<label class="chipck"><input type="checkbox" name="s.' + e(s.id) + '"' + (a.services && a.services.indexOf(s.id) > -1 ? ' checked' : '') + '>' + e(s.name) + '</label>'; }).join('') + '</div></fieldset>' +
          '<button class="btn sm" type="submit" style="margin-top:12px">Save hours</button></form>' +
          '<h3 class="osub-h">Leave <a class="link small" href="#/office/scheduler/leave?nurse=' + e(n.id) + '">Full leave history</a></h3>' + (n.leave.filter(liveLeave).length ? '<ul class="rlist">' + n.leave.filter(liveLeave).map(function (l) { return '<li><span><b>' + e(K.date(l.from)) + (l.to !== l.from ? ' to ' + e(K.date(l.to)) : '') + '</b>' + (l.reason ? '<br><span class="muted small">' + e(l.reason) + '</span>' : '') + '</span>' + (l.status === 'pending' ? '<span class="pill pending"><i></i>Pending</span>' : '<button class="btn sm ghost" data-act="o-leave-del" data-u="' + e(n.id) + '" data-id="' + e(l.id) + '">Cancel leave</button>') + '</li>'; }).join('') + '</ul>' : '<p class="muted small">No leave planned.</p>') +
          '<form data-form="o-leave" data-id="' + e(n.id) + '" class="oleave" novalidate><div class="alert bad" data-msg hidden></div>' + K.field('from', 'First day', 'type="date" min="' + K.todayIST() + '"') + K.field('to', 'Last day', 'type="date" min="' + K.todayIST() + '"') + '<label class="field"><span>Type</span><select class="in" name="type">' + Object.keys(LEAVE_TYPES).map(function (k) { return '<option value="' + k + '">' + LEAVE_TYPES[k] + '</option>'; }).join('') + '</select></label>' + K.field('reason', 'Reason (optional)', 'maxlength="300"') + '<button class="btn sm ghost" type="submit">Add approved leave</button></form></section>';
      }).join('') + '</div>' : '<div class="empty"><b>No nurse logins yet</b>Add a caregiver login under Settings, Logins.</div>');
    });
  }
  K.FORMS['o-hours'] = function (f) {
    var days = {}; DAYS.forEach(function (x) { days[x[0]] = []; });
    var brands = [], services = [];
    $$('input[type=checkbox]', f).forEach(function (c) {
      if (!c.checked) return; var p = c.name.split('.');
      if (p[0] === 'd') days[p[1]].push(p[2]); else if (p[0] === 'b') brands.push(p[1]); else if (p[0] === 's') services.push(p.slice(1).join('.'));
    });
    return api('PATCH', 'admin/scheduler/nurses/' + enc(f.getAttribute('data-id')), { availability: { days: days, bufferMin: $('[name=bufferMin]', f).value, maxPerSlot: $('[name=maxPerSlot]', f).value, brands: brands, services: services } })
      .then(function (d) { if (!d.ok) return d; K.toast('Hours saved. New bookings follow them.', 'ok'); });
  };
  K.FORMS['o-leave'] = function (f, v) {
    return api('POST', 'admin/scheduler/nurses/' + enc(f.getAttribute('data-id')) + '/leave', v).then(function (d) {
      if (!d.ok) return d;
      var moved = d.moved || [];
      K.toast('Leave added.' + (moved.length ? ' ' + moved.filter(function (m) { return m.assigned; }).length + ' of ' + moved.length + ' visits moved to another nurse.' : ''), 'ok'); K.render();
    });
  };
  function holidaysPage() {
    page('office/scheduler/holidays', 'Holidays', 'No visits are assigned on these days.', '', K.loading(260));
    api('GET', 'admin/scheduler/nurses').then(function (d) {
      if (!d.ok) return fail(d);
      S.cache.holidays = d.holidays.slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
      var t = K.todayIST();
      swap('<div class="ogrid2"><section class="panel"><h2>Add a holiday</h2><form data-form="o-holiday" novalidate><div class="alert bad" data-msg hidden></div>' + K.field('date', 'Date', 'type="date" min="' + t + '"') + K.field('name', 'Name', 'maxlength="60" placeholder="e.g. Onam"') + '<button class="btn sm" type="submit">Add holiday</button></form></section>' +
        '<section class="panel"><h2>Holidays</h2>' + (S.cache.holidays.length ? '<ul class="rlist">' + S.cache.holidays.map(function (h) { return '<li class="' + (h.date < t ? 'past' : '') + '"><span><b>' + e(K.date(h.date)) + '</b> · ' + e(h.name || 'Holiday') + '</span><button class="btn sm ghost" data-act="o-hol-del" data-d="' + e(h.date) + '">Remove</button></li>'; }).join('') + '</ul>' : '<p class="muted">No holidays added.</p>') + '</section></div>');
    });
  }
  function saveHolidays(list, msg) { return api('POST', 'admin/scheduler/holidays', { holidays: list }).then(function (d) { if (!d.ok) return d; K.toast(msg, 'ok'); K.render(); }); }
  K.FORMS['o-holiday'] = function (f, v) {
    if (!v.date) return Promise.resolve({ ok: false, errors: { date: 'Choose the date' } });
    return saveHolidays((S.cache.holidays || []).filter(function (h) { return h.date !== v.date; }).concat([{ date: v.date, name: v.name }]), 'Holiday added.');
  };

  // ================================================================ Contact access audit
  function auditPage(r) {
    page('office/contact-audit', 'Contact access audit', 'Every time a nurse opens a customer, emergency or doctor number: who, when, why and the result. The numbers themselves are never stored here.', '', K.loading(160) + K.loading(380));
    Promise.all([api('GET', 'admin/contact-audit' + qs(r)), api('GET', 'admin/contact-audit?approval=pending&size=50')]).then(function (x) {
      var d = x[0], p = x[1];
      if (!d.ok) return fail(d);
      var nurses = {}; d.nurses.forEach(function (n) { nurses[n.id] = n.name; });
      var policy = '<section class="panel"><h2>Policy</h2><form data-form="o-policy" novalidate><div class="pick">' + Object.keys(d.policies).map(function (k) { return '<label><input type="radio" name="policy" value="' + k + '"' + (k === d.policy ? ' checked' : '') + '><span><b>' + e(d.policies[k]) + '</b>' + (k === 'visit' ? '<em>Recommended</em>' : '') + '</span></label>'; }).join('') + '</div><button class="btn sm" type="submit" style="margin-top:12px">Save policy</button></form></section>';
      var pend = '<section class="panel' + (p.rows.length ? ' owait' : '') + '"><h2>Waiting for approval</h2>' + (p.rows.length ? '<ul class="rlist">' + p.rows.map(function (a) {
        return '<li><span><b>' + e(a.nurseName) + '</b> asks for the ' + e((d.categories[a.category] || a.category).toLowerCase()) + ' of <b>' + e(a.customerName) + '</b><br><span class="muted small">' + e(K.dt(a.at)) + ' · ' + e(a.eventId) + (a.reason ? ' · "' + e(a.reason) + '"' : '') + '</span></span>' +
          '<span class="oacts"><select class="in sm" data-min="' + e(a.id) + '" aria-label="For how long"><option value="60">1 hour</option><option value="120" selected>2 hours</option><option value="480">8 hours</option><option value="1440">24 hours</option></select><button class="btn sm" data-act="o-decide" data-id="' + e(a.id) + '" data-ok="1">Approve</button><button class="btn sm ghost" data-act="o-decide" data-id="' + e(a.id) + '">Decline</button></span></li>';
      }).join('') + '</ul>' : '<p class="muted">No requests are waiting.</p>') + '</section>';
      var BASIS = { visit: 'During a visit', emergency: 'Emergency', approval: 'Approved by the office' };
      var RES = { granted: 'Shown', denied: 'Not shown', pending: 'Waiting' };
      swap('<div class="ogrid2">' + pend + policy + '</div>' + filters(r, [['customer', 'Customer', 'search', 'Name or customer ID'], ['nurse', 'Nurse', 'select', nurses], ['category', 'Contact', 'select', d.categories], ['result', 'Result', 'select', RES], ['approval', 'Approval', 'select', { not_required: 'Not needed', pending: 'Waiting', approved: 'Approved', rejected: 'Declined' }], ['from', 'From', 'date'], ['to', 'To', 'date']]) +
        (d.rows.length ? '<section class="panel otw"><table class="stackable otable"><thead><tr><th>Event</th><th>Nurse</th><th>Customer</th><th>Contact</th><th>Basis and reason</th><th>Result</th></tr></thead><tbody>' + d.rows.map(function (a) {
          return '<tr><td data-l="Event"><b>' + e(a.eventId) + '</b><br><span class="muted small">' + e(K.dt(a.at)) + '</span></td><td data-l="Nurse">' + e(a.nurseName) + '<br><span class="muted small">' + e(a.employeeId || '') + '</span></td>' +
            '<td data-l="Customer"><a href="#/office/customer?p=' + e(a.personId) + '">' + e(a.customerName) + '</a><br><span class="muted small">' + e(a.personId) + '</span></td><td data-l="Contact">' + e(d.categories[a.category] || a.category) + '</td>' +
            '<td data-l="Basis">' + e(BASIS[a.basis] || (a.approvalStatus === 'pending' ? 'Asked the office' : '–')) + (a.visitRef ? '<br><span class="muted small">Visit ' + e(a.visitRef) + '</span>' : '') + (a.reason ? '<br><span class="small">"' + e(a.reason) + '"</span>' : '') + (a.deniedWhy ? '<br><span class="muted small">' + e(a.deniedWhy) + '</span>' : '') + '</td>' +
            '<td data-l="Result"><span class="apill ' + e(a.result) + '">' + e(RES[a.result] || a.result) + '</span>' + (a.approvalStatus && a.approvalStatus !== 'not_required' ? '<br><span class="muted small">' + e({ pending: 'Waiting for approval', approved: 'Approved', rejected: 'Declined' }[a.approvalStatus]) + (a.decidedByName ? ' by ' + e(a.decidedByName) : '') + '</span>' : '') + (a.expiresAt && a.result === 'granted' ? '<br><span class="muted small">until ' + e(K.dt(a.expiresAt)) + '</span>' : '') + '</td></tr>';
        }).join('') + '</tbody></table></section>' + pager(d, r) : '<div class="empty"><b>No contact access yet</b>Each time a nurse opens a number, it is listed here.</div>') +
        '<p class="note">' + icon('lock') + '<span>This record cannot be changed by nurses, and phone numbers are never written into it.</span></p>');
    });
  }
  K.FORMS['o-policy'] = function (f, v) { return api('POST', 'admin/settings/contact-policy', { policy: v.policy }).then(function (d) { if (!d.ok) return d; K.toast('Policy saved. It applies from the next request.', 'ok'); }); };

  // ---------------------------------------------------------------- counts on the menu (waiting visits, waiting contact requests)
  function refreshCounts() {
    if (S.cache.countsAt && Date.now() - S.cache.countsAt < 120000) return;
    S.cache.countsAt = Date.now();
    Promise.all([api('GET', 'admin/scheduler/visits?status=awaiting_assignment'), api('GET', 'admin/contact-audit?approval=pending&size=5')]).then(function (x) {
      S.counts = S.counts || {};
      S.counts['office/scheduler'] = x[0].ok ? x[0].rows.length : 0;
      S.counts['office/contact-audit'] = x[1].ok ? x[1].total : 0;
      Object.keys(S.counts).forEach(function (k) {
        var a = $('.sb a[href^="#/' + k + '"]'); if (!a || a.getAttribute('href').split('?')[0] !== '#/' + k) return;
        var b = $('.count', a); if (S.counts[k]) { if (!b) a.insertAdjacentHTML('beforeend', '<b class="count">' + S.counts[k] + '</b>'); else b.textContent = S.counts[k]; } else if (b) b.remove();
      });
    });
  }

  // ---------------------------------------------------------------- events
  document.addEventListener('click', function (ev) {
    var t = ev.target.closest('[data-act]'); if (!t) return;
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
    if (act === 'o-sum-pkg' || act === 'o-sum-risk' || act === 'o-sum-ind') { var fk = act === 'o-sum-pkg' ? 'pkg' : act === 'o-sum-ind' ? 'ind' : 'risk', fv = t.getAttribute('data-k'); S.cache.sumF[fk] = S.cache.sumF[fk] === fv ? '' : fv; if (fk === 'risk') S.cache.sumF.ind = ''; summaryLoad(true); }
    else if (act === 'o-sum-clear') { S.cache.sumF = { pkg: '', risk: '', ind: '' }; summaryLoad(true); }
    else if (act === 'o-doc-retry') { t.disabled = true; api('POST', 'admin/documents/' + enc(id) + '/retry', {}).then(function (d) { K.toast(d.ok ? 'Processing again. This page updates in a moment.' : d.message, d.ok ? 'ok' : 'bad'); setTimeout(K.render, 2500); }); }
    else if (act === 'o-doc-close') { api('POST', 'admin/documents/' + enc(id) + '/close', {}).then(function (d) { K.toast(d.ok ? 'Marked reviewed.' : d.message, d.ok ? 'ok' : 'bad'); K.render(); }); }
    else if (act === 'o-docv-reject') {
      var fm = t.closest('form'), note = fm.elements.note.value.trim();
      if (note.length < 3) { var er = fm.querySelector('[data-err=note]'); if (er) er.textContent = 'Say why this value is not used'; fm.elements.note.focus(); return; }
      api('POST', 'admin/extractions/' + enc(id), { action: 'reject', note: note }).then(function (d) { K.toast(d.ok ? 'Rejected. Nothing was stored.' : d.message, d.ok ? 'ok' : 'bad'); K.render(); });
    }
    else if (act === 'o-risk-recalc') {
      t.disabled = true;
      api('POST', 'admin/risk/recalculate', {}).then(function (d) { t.disabled = false; K.toast(d.ok ? 'Risk recalculated for ' + d.recalculated + ' people.' : d.message, d.ok ? 'ok' : 'bad'); if (d.ok) K.render(); });
    } else if (act === 'o-rule-withdraw') {
      var why = prompt('Why go back to the workbook defaults? (Recorded answers for this indicator stop applying straight away.)');
      if (why === null) return;
      api('POST', 'admin/risk/rules/' + enc(id), { withdraw: true, note: why }).then(function (d) { K.toast(d.ok ? 'Back to the workbook defaults. Risk recalculated.' : d.message, d.ok ? 'ok' : 'bad'); K.render(); });
    } else if (act === 'o-leave-add') leaveDialog(null);
    else if (act === 'o-leave-edit') leaveDialog(leaveOf(t.getAttribute('data-u'), id));
    else if (act === 'o-leave-visits') leaveVisitsDialog(leaveOf(t.getAttribute('data-u'), id));
    else if (act === 'o-leave-approve') {
      if (!confirm('Approve this leave? The nurse becomes unavailable for these days and their visits are moved to a free nurse where possible.')) return;
      t.disabled = true;
      api('POST', 'admin/leave/' + enc(t.getAttribute('data-u')) + '/' + enc(id) + '/approve', {}).then(function (d) {
        t.disabled = false; if (!d.ok) return K.toast(d.message, 'bad');
        var need = d.affected.filter(function (a) { return a.result === 'awaiting_assignment'; }).length;
        K.toast('Leave approved.' + (d.affected.length ? ' ' + d.affected.length + ' visit(s) affected' + (need ? ', ' + need + ' need a nurse.' : ', all moved.') : ''), need ? 'bad' : 'ok'); K.render();
      });
    } else if (act === 'o-leave-reject' || act === 'o-leave-cancel') {
      var rej = act === 'o-leave-reject', lv = leaveOf(t.getAttribute('data-u'), id);
      K.openDialog((rej ? 'Reject' : 'Cancel') + ' leave for ' + lv.nurseName, '<form data-form="o-leave-decide" data-kind="' + (rej ? 'reject' : 'cancel') + '" data-u="' + e(lv.nurseId) + '" data-id="' + e(lv.id) + '" novalidate><div class="alert bad" data-msg hidden></div><p>' + e(K.date(lv.from)) + ' to ' + e(K.date(lv.to)) + ' · ' + e(lv.typeName) + '</p>' +
        K.field('note', rej ? 'Reason (required)' : 'Reason (optional)', 'maxlength="300"') + (rej ? '' : '<p class="muted small">The record stays in the history. Visits already moved to other nurses are not moved back.</p>') + '</form>',
        '<button class="btn ghost" data-act="close">Back</button><button class="btn" data-act="submit-dialog">' + (rej ? 'Reject leave' : 'Cancel leave') + '</button>');
    }
    else if (act === 'o-lead') leadDialog(t.getAttribute('data-type'), id);
    else if (act === 'o-pay' || act === 'o-refund') payDialog(id, t.getAttribute('data-n'), Number(t.getAttribute('data-o')), act === 'o-refund');
    else if (act === 'o-assign') assignDialog(id);
    else if (act === 'o-auto-assign') {
      t.disabled = true;
      api('POST', 'admin/scheduler/visits/' + enc(id) + '/assign', {}).then(function (d) { t.disabled = false; if (!d.ok) return K.toast(d.message, 'bad'); K.closeDialog(); K.toast('Assigned automatically.', 'ok'); K.render(); });
    } else if (act === 'o-cancel') {
      K.openDialog('Cancel the visit', '<form data-form="o-cancel" data-id="' + e(id) + '" novalidate><div class="alert bad" data-msg hidden></div><p style="margin-bottom:12px">Cancel this visit? The nurse is told and the time is freed.</p><label class="field"><span>Reason</span><input class="in" name="note" maxlength="200" placeholder="e.g. The family cancelled"></label></form>',
        '<button class="btn ghost" data-act="close">Keep it</button><button class="btn" data-act="submit-dialog">Cancel visit</button>');
    } else if (act === 'o-book') bookDialog();
    else if (act === 'o-kyc') {
      var s = t.getAttribute('data-s'); t.disabled = true;
      api('POST', 'admin/employees/' + enc(t.getAttribute('data-u')) + '/kyc/' + enc(id), { status: s }).then(function (d) { if (!d.ok) { t.disabled = false; return K.toast(d.message, 'bad'); } K.toast(s === 'verified' ? 'Marked as verified.' : 'Marked as rejected.', 'ok'); K.render(); });
    } else if (act === 'o-leave-del') {
      if (!confirm('Cancel this leave? It stays in the leave history. Visits already moved to other nurses are not moved back.')) return;
      api('DELETE', 'admin/scheduler/nurses/' + enc(t.getAttribute('data-u')) + '/leave/' + enc(id)).then(function (d) { K.toast(d.ok ? 'Leave cancelled.' : d.message, d.ok ? 'ok' : 'bad'); K.render(); });
    } else if (act === 'o-hol-del') {
      var day = t.getAttribute('data-d');
      saveHolidays((S.cache.holidays || []).filter(function (h) { return h.date !== day; }), 'Holiday removed.');
    } else if (act === 'o-decide') {
      var ok = t.getAttribute('data-ok') === '1', mins = $('[data-min="' + id + '"]');
      t.disabled = true;
      api('POST', 'admin/contact-audit/' + enc(id) + '/decide', { approve: ok, minutes: mins ? Number(mins.value) : 120 }).then(function (d) { K.toast(d.ok ? (ok ? 'Approved. The nurse has been told.' : 'Declined.') : d.message, d.ok ? 'ok' : 'bad'); S.cache.countsAt = 0; K.render(); });
    }
  });
  document.addEventListener('change', function (ev) {
    var t = ev.target, act = t.getAttribute && t.getAttribute('data-act');
    if (act === 'o-sum-sel') { S.cache.sumF[t.name] = t.value; summaryLoad(true); return; }
    if (act === 'o-auto') { var f = t.closest('form'); if (f) f.requestSubmit ? f.requestSubmit() : f.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true })); }
    else if (act === 'o-lead-status') {
      api('PATCH', 'admin/leads/' + t.getAttribute('data-type') + '/' + enc(t.getAttribute('data-id')), { status: t.value }).then(function (d) { K.toast(d.ok ? 'Status saved.' : d.message, d.ok ? 'ok' : 'bad'); });
    } else if (act === 'o-assign-sel' && t.value) {
      t.disabled = true;
      api('POST', 'admin/leads/' + t.getAttribute('data-type') + '/' + enc(t.getAttribute('data-id')) + '/assign', { userId: t.value }).then(function (d) { K.toast(d.ok ? 'Assigned. They have been notified.' : d.message, d.ok ? 'ok' : 'bad'); K.render(); });
    }
  });
  // a lead changed inside its dialog: the list behind it refreshes when the dialog closes
  document.addEventListener('close', function () { if (S.cache.dirtyLead && !$('dialog[open]')) { S.cache.dirtyLead = false; var r = K.route(); if (r.parts[0] === 'office' && r.parts[1] === 'leads') K.render(); } }, true);

  K.register('office', {
    label: 'Office',
    menu: MENU,
    personPages: ['office/customer'],
    notifPage: null,
    route: function (r, top) {
      if (top !== 'office') return false;
      var p = r.parts.slice(1).join('/');
      refreshCounts();
      var pages = {
        'overview/summary': summaryPage, 'overview/customers': customerAnalytics, 'overview/revenue': revenueAnalytics, overview: summaryPage,
        'leads/overview': leadOverview, leads: leadOverview, 'leads/list': leadsList, 'leads/assign': leadsAssign,
        customers: customersPage, customer: customerProfile,
        'finance/invoices': invoicesPage, finance: invoicesPage, 'finance/due': duePage,
        employees: employeesPage, 'employees/kyc': kycPage,
        scheduler: boardPage, 'scheduler/nurses': nursesPage, 'scheduler/holidays': holidaysPage, 'scheduler/leave': leavePage, 'risk-rules': rulesPage,
        'contact-audit': auditPage, documents: docsPage
      };
      (pages[p] || function () { K.go('#/office/overview/summary', true); })(r);
      return true;
    }
  });
})();
