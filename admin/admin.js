/* KareIQ admin: overview charts, bookings & enquiries, website content editor */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const $$ = (sel, el = document) => [...el.querySelectorAll(sel)];
  const fmt = (n) => Number(n || 0).toLocaleString('en-IN');
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const NS = 'http://www.w3.org/2000/svg';
  const svg = (tag, attrs = {}, parent) => { const el = document.createElementNS(NS, tag); for (const k in attrs) el.setAttribute(k, attrs[k]); if (parent) parent.appendChild(el); return el; };
  const DAY = 86400000;
  const STATUS = ['new', 'contacted', 'scheduled', 'closed'];
  const STATUS_C = { new: 'var(--st-new)', contacted: 'var(--st-contacted)', scheduled: 'var(--st-scheduled)', closed: 'var(--st-closed)' };
  const SERIES = { bookings: '#11998e', enquiries: '#7c5cc4' }; // validated pair (CVD ΔE 14.3)

  const state = { view: 'overview', list: 'bookings', days: 30, rows: { bookings: [], enquiries: [] }, content: null, defaults: null };

  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.classList.add('show');
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 2400);
  }

  async function api(url, opts = {}) {
    const res = await fetch(url, { credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, ...opts });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && data.signedOut) { location.replace('/admin/login'); throw new Error('Signed out'); }
    if (!res.ok) { const e = new Error(data.message || 'Request failed'); e.data = data; throw e; }
    return data;
  }

  // ============================== navigation ==============================
  function show(view) {
    state.view = view;
    $$('.nav-btn').forEach((b) => b.classList.toggle('active', b.dataset.view === view));
    $('view-overview').hidden = view !== 'overview';
    $('view-list').hidden = !(view === 'bookings' || view === 'enquiries');
    $('view-content').hidden = view !== 'content';
    if (view === 'bookings' || view === 'enquiries') { state.list = view; renderList(); }
    if (view === 'overview') renderOverview();
    try { history.replaceState(null, '', '#' + view); } catch (e) { /* ignore */ }
  }
  $$('.nav-btn').forEach((b) => b.addEventListener('click', () => show(b.dataset.view)));

  // ============================== data ==============================
  async function loadRows() {
    const [b, e] = await Promise.all([api('/api/admin/bookings'), api('/api/admin/enquiries')]);
    state.rows.bookings = b.rows; state.rows.enquiries = e.rows;
    for (const k of ['bookings', 'enquiries']) {
      const n = state.rows[k].filter((r) => r.status === 'new').length;
      const c = $('c-' + k); c.textContent = n; c.classList.toggle('hot', n > 0);
    }
  }

  // ============================== overview ==============================
  const inRange = (rows, from, to) => rows.filter((r) => { const t = Date.parse(r.createdAt); return t >= from && t < to; });
  function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }

  function rangeBounds() {
    const end = startOfDay(Date.now()) + DAY;
    if (!state.days) {
      const all = [...state.rows.bookings, ...state.rows.enquiries].map((r) => Date.parse(r.createdAt));
      const first = all.length ? startOfDay(Math.min(...all)) : end - 30 * DAY;
      return { from: Math.min(first, end - 7 * DAY), to: end, prevFrom: null };
    }
    return { from: end - state.days * DAY, to: end, prevFrom: end - 2 * state.days * DAY };
  }

  function renderOverview() {
    const { from, to, prevFrom } = rangeBounds();
    const B = inRange(state.rows.bookings, from, to);
    const E = inRange(state.rows.enquiries, from, to);
    const pB = prevFrom ? inRange(state.rows.bookings, prevFrom, from) : null;
    const pE = prevFrom ? inRange(state.rows.enquiries, prevFrom, from) : null;
    const rangeLabel = state.days ? `the last ${state.days} days` : 'all time';
    $('ovSub').textContent = `Bookings and enquiries from both websites, ${rangeLabel}.`;

    // ---- KPIs
    const waiting = state.rows.bookings.filter((r) => r.status === 'new').length + state.rows.enquiries.filter((r) => r.status === 'new').length;
    const sched = B.filter((r) => r.status === 'scheduled' || r.status === 'closed').length;
    const delta = (cur, prev) => {
      if (prev == null) return '<span class="delta">&nbsp;</span>';
      if (!prev && !cur) return '<span class="delta">No change</span>';
      if (!prev) return `<span class="delta up">▲ New this period</span>`;
      const d = Math.round(((cur - prev) / prev) * 100);
      return `<span class="delta ${d > 0 ? 'up' : d < 0 ? 'down' : ''}">${d > 0 ? '▲' : d < 0 ? '▼' : ''} ${Math.abs(d)}% vs previous ${state.days} days</span>`;
    };
    $('kpis').innerHTML = `
      <div class="kpi"><small>Kare@Home bookings</small><strong>${fmt(B.length)}</strong>${delta(B.length, pB && pB.length)}</div>
      <div class="kpi"><small>KareIQ enquiries</small><strong>${fmt(E.length)}</strong>${delta(E.length, pE && pE.length)}</div>
      <div class="kpi ${waiting ? 'attn' : ''}"><small>Waiting for a call back</small><strong>${fmt(waiting)}</strong><span class="delta">${waiting ? 'Status "New", all time' : 'Everyone has been contacted'}</span></div>
      <div class="kpi"><small>Visits scheduled</small><strong>${fmt(sched)}</strong><span class="delta">${B.length ? Math.round((sched / B.length) * 100) + '% of bookings in range' : 'No bookings in range'}</span></div>`;

    // ---- trend
    const spanDays = Math.round((to - from) / DAY);
    const weekly = spanDays > 120;
    const step = weekly ? 7 * DAY : DAY;
    const buckets = [];
    for (let t = from; t < to; t += step) buckets.push(t);
    const count = (rows) => buckets.map((t) => rows.filter((r) => { const x = Date.parse(r.createdAt); return x >= t && x < t + step; }).length);
    const series = [
      { key: 'bookings', name: 'Bookings', color: SERIES.bookings, values: count(B) },
      { key: 'enquiries', name: 'Enquiries', color: SERIES.enquiries, values: count(E) }
    ];
    $('trendSub').textContent = `${weekly ? 'Per week' : 'Per day'}, ${rangeLabel}.`;
    $('trendLegend').innerHTML = series.map((s) => `<span style="--c:${s.color}"><i></i>${s.name}</span>`).join('');
    lineChart($('trendChart'), buckets, series, weekly);
    $('trend-table').innerHTML = `<table class="mini"><thead><tr><th>${weekly ? 'Week of' : 'Date'}</th><th class="n">Bookings</th><th class="n">Enquiries</th></tr></thead><tbody>${buckets.map((t, i) => `<tr><td>${dateLabel(t, true)}</td><td class="n">${series[0].values[i]}</td><td class="n">${series[1].values[i]}</td></tr>`).reverse().join('')}</tbody></table>`;

    // ---- pipeline
    pipeline($('pipeline'), B);

    // ---- breakdowns
    const by = (rows, fn) => {
      const m = new Map();
      rows.forEach((r) => { const k = fn(r) || 'Not given'; m.set(k, (m.get(k) || 0) + 1); });
      return [...m.entries()].sort((a, b) => b[1] - a[1]);
    };
    const topN = (pairs, n) => {
      if (pairs.length <= n) return pairs;
      const rest = pairs.slice(n - 1).reduce((s, p) => s + p[1], 0);
      return [...pairs.slice(0, n - 1), ['Other', rest]];
    };
    const area = (r) => { const a = String(r.area || '').trim(); if (!a) return ''; const parts = a.split(',').map((x) => x.trim()).filter(Boolean); const city = parts[parts.length - 1]; return city.charAt(0).toUpperCase() + city.slice(1).toLowerCase(); };
    const cards = [
      { title: 'Services requested', sub: 'Kare@Home bookings', pairs: by(B, (r) => r.serviceName), total: B.length, color: SERIES.bookings, empty: 'No bookings in this period yet.' },
      { title: 'Packages chosen', sub: 'Kare@Home bookings', pairs: by(B, (r) => r.packageName), total: B.length, color: SERIES.bookings, empty: 'No bookings in this period yet.' },
      { title: 'Payment plans', sub: 'Kare@Home bookings', pairs: by(B, (r) => r.billingName || 'Not chosen'), total: B.length, color: SERIES.bookings, empty: 'No bookings in this period yet.' },
      { title: 'Top cities', sub: 'From the area people entered', pairs: topN(by(B, area), 6), total: B.length, color: SERIES.bookings, empty: 'No bookings in this period yet.' },
      { title: 'Who the care is for', sub: 'Kare@Home bookings', pairs: by(B, (r) => r.careForName || r.careFor), total: B.length, color: SERIES.bookings, empty: 'No bookings in this period yet.' },
      { title: 'Enquiry interests', sub: 'KareIQ enquiries', pairs: by(E, (r) => r.interestName), total: E.length, color: SERIES.enquiries, empty: 'No enquiries in this period yet.' }
    ];
    const wrap = $('breakdowns');
    wrap.innerHTML = '';
    cards.forEach((c, i) => {
      const card = document.createElement('article');
      card.className = 'card';
      card.innerHTML = `<div class="card-h"><div><h2>${esc(c.title)}</h2><p class="sub">${esc(c.sub)} · ${fmt(c.total)} in range</p></div>${c.total ? `<button class="link" data-table="b${i}">Show table</button>` : ''}</div>`;
      const body = document.createElement('div');
      card.appendChild(body);
      hbars(body, c.pairs, c.total, c.color, c.empty);
      if (c.total) {
        const t = document.createElement('div');
        t.className = 'tbl-wrap'; t.id = `b${i}-table`; t.hidden = true;
        t.innerHTML = `<table class="mini"><thead><tr><th>${esc(c.title)}</th><th class="n">Count</th><th class="n">Share</th></tr></thead><tbody>${c.pairs.map(([k, v]) => `<tr><td>${esc(k)}</td><td class="n">${v}</td><td class="n">${Math.round((v / c.total) * 100)}%</td></tr>`).join('')}</tbody></table>`;
        card.appendChild(t);
      }
      wrap.appendChild(card);
    });
  }

  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-table]');
    if (!b) return;
    const t = $(b.dataset.table + '-table');
    if (!t) return;
    t.hidden = !t.hidden;
    b.textContent = t.hidden ? 'Show table' : 'Hide table';
  });

  function dateLabel(t, long) {
    return new Date(t).toLocaleDateString('en-IN', long ? { day: 'numeric', month: 'short', year: 'numeric' } : { day: 'numeric', month: 'short' });
  }

  // ---- tooltip
  const tip = $('tip');
  function showTip(html, x, y) {
    tip.innerHTML = html; tip.hidden = false;
    const r = tip.getBoundingClientRect();
    let left = x + 14, top = y - r.height - 10;
    if (left + r.width > innerWidth - 8) left = x - r.width - 14;
    if (top < 8) top = y + 16;
    tip.style.left = left + 'px'; tip.style.top = top + 'px';
  }
  const hideTip = () => { tip.hidden = true; };

  // ---- line chart
  function niceMax(v) {
    if (v <= 4) return 4;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
    return 10 * p;
  }

  function lineChart(host, xs, series, weekly) {
    host.innerHTML = '';
    const total = series.reduce((s, x) => s + x.values.reduce((a, b) => a + b, 0), 0);
    if (!total) {
      host.innerHTML = '<div class="empty-chart">No bookings or enquiries in this period yet.<br>New requests from the websites will appear here.</div>';
      return;
    }
    const W = Math.max(300, host.clientWidth), H = 260;
    const m = { l: 34, r: 96, t: 14, b: 28 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const maxV = niceMax(Math.max(...series.flatMap((s) => s.values)));
    const x = (i) => m.l + (xs.length === 1 ? iw / 2 : (i / (xs.length - 1)) * iw);
    const y = (v) => m.t + ih - (v / maxV) * ih;
    const root = svg('svg', { viewBox: `0 0 ${W} ${H}`, width: W, height: H, role: 'img', 'aria-label': 'Line chart of bookings and enquiries over time' }, host);

    // grid + y labels
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (maxV / ticks) * i;
      svg('line', { class: i === 0 ? 'axis' : 'grid', x1: m.l, x2: W - m.r, y1: y(v), y2: y(v) }, root);
      const t = svg('text', { x: m.l - 8, y: y(v) + 4, 'text-anchor': 'end' }, root); t.textContent = Number.isInteger(v) ? v : v.toFixed(1);
    }
    // x labels (about 6)
    const every = Math.max(1, Math.ceil(xs.length / 6));
    xs.forEach((t, i) => {
      if (i % every && i !== xs.length - 1) return;
      if (i !== xs.length - 1 && xs.length - 1 - i < every * .6) return;
      const tx = svg('text', { x: x(i), y: H - 8, 'text-anchor': i === 0 ? 'start' : i === xs.length - 1 ? 'end' : 'middle' }, root);
      tx.textContent = dateLabel(t);
    });
    // series
    const ends = [];
    series.forEach((s) => {
      const d = s.values.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join('');
      svg('path', { class: 'area', d: `${d}L${x(xs.length - 1)},${y(0)}L${x(0)},${y(0)}Z`, fill: s.color }, root);
      svg('path', { class: 'series', d, stroke: s.color }, root);
      const lv = s.values[s.values.length - 1];
      svg('circle', { cx: x(xs.length - 1), cy: y(lv), r: 4, fill: s.color, stroke: '#fff', 'stroke-width': 2 }, root);
      ends.push({ s, y: y(lv) });
    });
    // end labels, nudged apart when they collide
    ends.sort((a, b) => a.y - b.y);
    for (let i = 1; i < ends.length; i++) if (ends[i].y - ends[i - 1].y < 16) ends[i].y = ends[i - 1].y + 16;
    ends.forEach((e) => {
      const t = svg('text', { class: 'endlbl', x: x(xs.length - 1) + 10, y: e.y + 4 }, root);
      t.textContent = `${e.s.name} ${e.s.values[e.s.values.length - 1]}`;
    });

    // crosshair + tooltip
    const xh = svg('line', { class: 'xhair', y1: m.t, y2: m.t + ih, x1: -10, x2: -10, opacity: 0 }, root);
    const dots = series.map((s) => svg('circle', { r: 4.5, fill: s.color, stroke: '#fff', 'stroke-width': 2, cx: -10, cy: -10, opacity: 0 }, root));
    const hit = svg('rect', { x: m.l, y: m.t, width: iw, height: ih + 6, fill: 'transparent', tabindex: 0, 'aria-label': 'Move with arrow keys to read values' }, root);
    let cur = xs.length - 1;
    function at(i, cx, cy) {
      cur = Math.max(0, Math.min(xs.length - 1, i));
      xh.setAttribute('opacity', 1); dots.forEach((d) => d.setAttribute('opacity', 1));
      xh.setAttribute('x1', x(cur)); xh.setAttribute('x2', x(cur));
      dots.forEach((d, k) => { d.setAttribute('cx', x(cur)); d.setAttribute('cy', y(series[k].values[cur])); });
      const label = weekly ? 'Week of ' + dateLabel(xs[cur], true) : dateLabel(xs[cur], true);
      const rect = root.getBoundingClientRect();
      const px = cx != null ? cx : rect.left + (x(cur) / W) * rect.width;
      const py = cy != null ? cy : rect.top + (m.t / H) * rect.height + 30;
      showTip(`<div class="t">${esc(label)}</div>${series.map((s) => `<div class="r" style="--c:${s.color}"><i></i><b>${s.values[cur]}</b><span>${esc(s.name)}</span></div>`).join('')}`, px, py);
    }
    function fromEvent(e) {
      const rect = root.getBoundingClientRect();
      const sx = ((e.clientX - rect.left) / rect.width) * W;
      return Math.round(((sx - m.l) / iw) * (xs.length - 1));
    }
    hit.addEventListener('pointermove', (e) => at(fromEvent(e), e.clientX, e.clientY));
    hit.addEventListener('pointerleave', () => { xh.setAttribute('opacity', 0); dots.forEach((d) => d.setAttribute('opacity', 0)); hideTip(); });
    hit.addEventListener('focus', () => at(cur));
    hit.addEventListener('blur', hideTip);
    hit.addEventListener('keydown', (e) => { if (e.key === 'ArrowLeft') { e.preventDefault(); at(cur - 1); } if (e.key === 'ArrowRight') { e.preventDefault(); at(cur + 1); } });
  }

  // ---- horizontal bars (one series, values labelled, share on hover)
  function hbars(host, pairs, total, color, emptyText) {
    if (!total) { host.innerHTML = `<div class="empty-chart">${esc(emptyText)}</div>`; return; }
    const max = Math.max(...pairs.map((p) => p[1]));
    const list = document.createElement('div');
    list.className = 'hbars';
    pairs.forEach(([k, v], i) => {
      const row = document.createElement('div');
      row.className = 'hb'; row.tabIndex = 0;
      row.style.setProperty('--c', color);
      const lbl = document.createElement('span'); lbl.className = 'lbl'; lbl.textContent = k;
      const val = document.createElement('span'); val.className = 'val'; val.innerHTML = `${fmt(v)}<small>${Math.round((v / total) * 100)}%</small>`;
      const track = document.createElement('span'); track.className = 'track';
      const fill = document.createElement('span'); fill.className = 'fill'; fill.style.width = (v / max) * 100 + '%'; fill.style.animationDelay = i * 60 + 'ms';
      track.appendChild(fill);
      row.append(lbl, val, track);
      const tipHtml = () => `<div class="t">${esc(k)}</div><div class="r" style="--c:${color}"><i></i><b>${fmt(v)}</b><span>of ${fmt(total)} · ${Math.round((v / total) * 100)}%</span></div>`;
      row.addEventListener('pointermove', (e) => showTip(tipHtml(), e.clientX, e.clientY));
      row.addEventListener('pointerleave', hideTip);
      row.addEventListener('focus', () => { const r = row.getBoundingClientRect(); showTip(tipHtml(), r.left + r.width / 2, r.top); });
      row.addEventListener('blur', hideTip);
      list.appendChild(row);
    });
    host.innerHTML = '';
    host.appendChild(list);
  }

  // ---- status pipeline (status colours always shown with their name)
  function pipeline(host, rows) {
    if (!rows.length) { host.innerHTML = '<div class="empty-chart">No bookings in this period yet.</div>'; return; }
    const counts = STATUS.map((s) => [s, rows.filter((r) => r.status === s).length]);
    const total = rows.length;
    const bar = counts.filter(([, n]) => n).map(([s, n]) => `<span style="--c:${STATUS_C[s]};flex:${n}" data-s="${s}" data-n="${n}" tabindex="0" aria-label="${s}: ${n}"></span>`).join('');
    host.innerHTML = `<div class="pipe">${bar}</div><div class="pipe-legend">${counts.map(([s, n]) => `<div><small style="--c:${STATUS_C[s]}"><i></i>${s}</small><b>${n}</b><em>${Math.round((n / total) * 100)}% of ${total}</em></div>`).join('')}</div>`;
    $$('.pipe span', host).forEach((sp) => {
      const html = () => `<div class="t" style="text-transform:capitalize">${sp.dataset.s}</div><div class="r" style="--c:${STATUS_C[sp.dataset.s]}"><i></i><b>${sp.dataset.n}</b><span>bookings · ${Math.round((sp.dataset.n / total) * 100)}%</span></div>`;
      sp.addEventListener('pointermove', (e) => showTip(html(), e.clientX, e.clientY));
      sp.addEventListener('pointerleave', hideTip);
      sp.addEventListener('focus', () => { const r = sp.getBoundingClientRect(); showTip(html(), r.left + r.width / 2, r.top); });
      sp.addEventListener('blur', hideTip);
    });
  }

  $$('#range button').forEach((b) => b.addEventListener('click', () => {
    state.days = +b.dataset.days;
    $$('#range button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
    renderOverview();
  }));
  let rz;
  addEventListener('resize', () => { clearTimeout(rz); rz = setTimeout(() => { if (state.view === 'overview') renderOverview(); }, 150); });

  // ============================== lists ==============================
  const when = (iso) => (iso ? new Date(iso).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '');
  const fmtDate = (d) => (d ? new Date(d + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
  const waLink = (phone) => 'https://wa.me/' + String(phone || '').replace(/\D/g, '');
  function statusSelect(r) {
    return `<select class="status" data-id="${esc(r.id)}" style="--c:${STATUS_C[r.status] || 'var(--muted)'}" aria-label="Status for ${esc(r.reference)}">` +
      STATUS.map((s) => `<option value="${s}"${s === r.status ? ' selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('') + '</select>';
  }
  function person(r) {
    return `${esc(r.name)}<span class="s"><a href="tel:${esc(r.phone)}">${esc(r.phone)}</a> · <a href="${waLink(r.phone)}" target="_blank" rel="noopener">WhatsApp</a></span>${r.email ? `<span class="s">${esc(r.email)}</span>` : ''}`;
  }
  function renderList() {
    const k = state.list;
    const rows = state.rows[k];
    $('listTitle').textContent = k === 'bookings' ? 'Kare@Home bookings' : 'KareIQ enquiries';
    $('listSub').textContent = `${rows.length} total · ${rows.filter((r) => r.status === 'new').length} waiting for a call back`;
    $('export').href = `/api/admin/${k}/export.csv`;
    const q = $('q').value.trim().toLowerCase();
    const sf = $('statusFilter').value;
    const list = rows.filter((r) => (!sf || r.status === sf) && (!q || JSON.stringify(r).toLowerCase().includes(q)));
    const table = $('thead').closest('table'); table.className = 'list';
    if (k === 'bookings') {
      $('thead').innerHTML = '<tr><th>Reference</th><th>Person</th><th>Care for / Area</th><th>Service &amp; package</th><th>Preferred visit</th><th>Notes</th><th>Status</th><th>Internal note</th></tr>';
      $('tbody').innerHTML = list.map((r) => `<tr>
        <td><span class="ref">${esc(r.reference)}</span><span class="s">${esc(when(r.createdAt))}</span></td>
        <td>${person(r)}</td>
        <td>${esc(r.careForName || r.careFor)}<span class="s">${esc(r.area)}</span></td>
        <td>${esc(r.serviceName)}<span class="s">${esc(r.packageName)}${r.billingName ? ' · ' + esc(r.billingName) : ''}</span></td>
        <td>${esc(fmtDate(r.date)) || '<span class="s">Flexible</span>'}<span class="s">${esc(r.timeName || '')}</span></td>
        <td class="notes">${esc(r.notes)}</td>
        <td>${statusSelect(r)}</td>
        <td><input class="note" data-id="${esc(r.id)}" value="${esc(r.adminNote || '')}" placeholder="Add note" aria-label="Internal note for ${esc(r.reference)}"></td></tr>`).join('');
    } else {
      $('thead').innerHTML = '<tr><th>Reference</th><th>Person</th><th>Interested in</th><th>Message</th><th>Page</th><th>Status</th><th>Internal note</th></tr>';
      $('tbody').innerHTML = list.map((r) => `<tr>
        <td><span class="ref">${esc(r.reference)}</span><span class="s">${esc(when(r.createdAt))}</span></td>
        <td>${person(r)}</td><td>${esc(r.interestName)}</td><td class="notes">${esc(r.message)}</td><td>${esc(r.source)}</td>
        <td>${statusSelect(r)}</td>
        <td><input class="note" data-id="${esc(r.id)}" value="${esc(r.adminNote || '')}" placeholder="Add note" aria-label="Internal note for ${esc(r.reference)}"></td></tr>`).join('');
    }
    const empty = $('empty');
    empty.hidden = list.length > 0;
    empty.textContent = rows.length ? 'Nothing matches this search.' : (k === 'bookings' ? 'No bookings yet. New Kare@Home bookings will appear here.' : 'No enquiries yet. New KareIQ enquiries will appear here.');
  }
  STATUS.forEach((s) => { const o = document.createElement('option'); o.value = s; o.textContent = s[0].toUpperCase() + s.slice(1); $('statusFilter').appendChild(o); });
  $('q').addEventListener('input', renderList);
  $('statusFilter').addEventListener('change', renderList);
  $('refresh').addEventListener('click', () => loadRows().then(() => { renderList(); toast('Up to date'); }).catch(() => toast('Could not refresh. Is the server running?')));
  $('tbody').addEventListener('change', async (e) => {
    const el = e.target;
    const k = state.list;
    const body = el.classList.contains('status') ? { status: el.value } : el.classList.contains('note') ? { adminNote: el.value } : null;
    if (!body) return;
    try {
      const data = await api(`/api/admin/${k}/${encodeURIComponent(el.dataset.id)}`, { method: 'PATCH', body: JSON.stringify(body) });
      const list = state.rows[k]; const i = list.findIndex((r) => r.id === data.row.id); if (i > -1) list[i] = data.row;
      const n = list.filter((r) => r.status === 'new').length; $('c-' + k).textContent = n; $('c-' + k).classList.toggle('hot', n > 0);
      if (body.status) { el.style.setProperty('--c', STATUS_C[el.value]); toast('Status updated'); renderList(); } else toast('Note saved');
    } catch (err) { toast(err.message); }
  });

  // ============================== content editor ==============================
  const form = $('cform');
  const PLANS = ['1', '3', '6', '12'];
  const PKG_C = ['var(--teal)', 'var(--violet)', 'var(--blue)'];
  const getPath = (o, p) => p.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
  const setPath = (o, p, v) => { const ks = p.split('.'); const last = ks.pop(); ks.reduce((a, k) => (a[k] = a[k] || {}), o)[last] = v; };
  let loadedJSON = '';

  $$('#ctabs button').forEach((b) => b.addEventListener('click', () => {
    $$('#ctabs button').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-selected', x === b); });
    $$('.ctab').forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.ctab; });
  }));

  function buildEditors(c) {
    $('savings').innerHTML = PLANS.map((m) => `<label class="f pct"><span>${m === '1' ? '1 month' : m + ' months'}</span><input type="number" min="0" max="90" step="1" data-save="${m}" ${m === '1' ? 'title="Usually 0 for monthly"' : ''}></label>`).join('');
    $('pkgEditors').innerHTML = c.pricing.packages.map((p, i) => `
      <article class="card pkg" style="--c:${PKG_C[i]}" data-pkg="${p.key}">
        <div class="card-h"><div><h2 data-title>${esc(p.name)}</h2><p class="sub">Package card ${i + 1} on Kare@Home</p></div></div>
        <div class="pkg-top">
          <label class="f"><span>Package name</span><input data-p="name" maxlength="40"></label>
          <label class="f"><span>Original price (struck through)</span><span class="rupee money"><input type="number" min="0" step="1" data-p="mrp"></span></label>
          <label class="chk"><input type="checkbox" data-p="offer"> Launch offer tag</label>
          <label class="chk"><input type="radio" name="popular" value="${p.key}" data-p="popular"> Most popular</label>
        </div>
        <div class="table-wrap"><table class="prices">
          <thead><tr><th>Payment plan</th><th>Price per month</th><th>Billed amount</th><th></th></tr></thead>
          <tbody>${PLANS.map((m) => `<tr data-m="${m}"><td>${m === '1' ? '1 month' : m + ' months'}</td>
            <td><span class="rupee" style="display:block"><input type="number" min="1" step="1" data-k="pm" aria-label="${esc(p.name)} ${m} month price per month"></span></td>
            <td><span class="rupee" style="display:block"><input type="number" min="1" step="1" data-k="total" aria-label="${esc(p.name)} ${m} month billed amount"></span></td>
            <td class="hint" data-hint></td></tr>`).join('')}</tbody>
        </table></div>
        <div class="pkg-actions"><button type="button" class="link" data-fill>Set billed amounts to price per month × months</button></div>
        <label class="f"><span>What's included (one item per line)</span><textarea data-p="includes" rows="9"></textarea></label>
      </article>`).join('');
  }

  function fill(c) {
    $$('[name]', form).forEach((el) => { if (el.name !== 'popular') el.value = getPath(c, el.name) ?? ''; });
    PLANS.forEach((m) => { $(`savings`).querySelector(`[data-save="${m}"]`).value = c.pricing.savings[m]; });
    c.pricing.packages.forEach((p) => {
      const card = form.querySelector(`[data-pkg="${p.key}"]`);
      card.querySelector('[data-p="name"]').value = p.name;
      card.querySelector('[data-p="mrp"]').value = p.mrp;
      card.querySelector('[data-p="offer"]').checked = !!p.offer;
      card.querySelector('[data-p="popular"]').checked = !!p.popular;
      card.querySelector('[data-p="includes"]').value = p.includes.join('\n');
      card.querySelector('[data-title]').textContent = p.name;
      PLANS.forEach((m) => {
        const tr = card.querySelector(`tr[data-m="${m}"]`);
        tr.querySelector('[data-k="pm"]').value = p.prices[m][0];
        tr.querySelector('[data-k="total"]').value = p.prices[m][1];
      });
      hints(card);
    });
    $('lastSaved').textContent = c.updatedAt ? `Last saved ${new Date(c.updatedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}.` : 'Showing the original website content.';
  }

  function collect() {
    const c = JSON.parse(JSON.stringify(state.content));
    delete c.updatedAt;
    $$('[name]', form).forEach((el) => { if (el.name !== 'popular') setPath(c, el.name, el.value.trim()); });
    PLANS.forEach((m) => { c.pricing.savings[m] = Number($('savings').querySelector(`[data-save="${m}"]`).value); });
    c.pricing.packages = c.pricing.packages.map((p) => {
      const card = form.querySelector(`[data-pkg="${p.key}"]`);
      const prices = {};
      PLANS.forEach((m) => {
        const tr = card.querySelector(`tr[data-m="${m}"]`);
        prices[m] = [Number(tr.querySelector('[data-k="pm"]').value), Number(tr.querySelector('[data-k="total"]').value)];
      });
      return {
        key: p.key,
        name: card.querySelector('[data-p="name"]').value.trim(),
        mrp: Number(card.querySelector('[data-p="mrp"]').value),
        offer: card.querySelector('[data-p="offer"]').checked,
        popular: card.querySelector('[data-p="popular"]').checked,
        prices,
        includes: card.querySelector('[data-p="includes"]').value.split('\n').map((s) => s.trim()).filter(Boolean)
      };
    });
    return c;
  }

  function hints(card) {
    const base = Number(card.querySelector('tr[data-m="1"] [data-k="pm"]').value) || 0;
    PLANS.forEach((m) => {
      const tr = card.querySelector(`tr[data-m="${m}"]`);
      const pm = Number(tr.querySelector('[data-k="pm"]').value) || 0;
      const total = Number(tr.querySelector('[data-k="total"]').value) || 0;
      const h = tr.querySelector('[data-hint]');
      const parts = [];
      if (m !== '1' && base && pm) { const s = Math.round((1 - pm / base) * 100); if (s) parts.push(`${s > 0 ? 'saves' : 'costs'} ${Math.abs(s)}% vs monthly`); }
      if (pm && total && Math.abs(pm * m - total) > m) parts.push(`${m} × ₹${fmt(pm)} = ₹${fmt(pm * m)}`);
      h.textContent = parts.join(' · ');
    });
  }

  const isDirty = () => !!state.content && JSON.stringify(collect()) !== loadedJSON;
  function updateDirty() {
    const d = isDirty();
    $('saveState').textContent = d ? 'Unsaved changes' : 'All changes saved';
    $('saveState').classList.toggle('dirty', d);
    $('saveBtn').disabled = !d;
    $('discard').disabled = !d;
  }
  form.addEventListener('input', (e) => {
    const card = e.target.closest('[data-pkg]');
    if (card) { hints(card); if (e.target.dataset.p === 'name') card.querySelector('[data-title]').textContent = e.target.value || 'Package'; }
    updateDirty();
  });
  form.addEventListener('change', updateDirty);
  form.addEventListener('click', (e) => {
    const b = e.target.closest('[data-fill]');
    if (!b) return;
    const card = b.closest('[data-pkg]');
    PLANS.forEach((m) => {
      const tr = card.querySelector(`tr[data-m="${m}"]`);
      const pm = Number(tr.querySelector('[data-k="pm"]').value) || 0;
      if (pm) tr.querySelector('[data-k="total"]').value = pm * m;
    });
    hints(card); updateDirty();
    toast('Billed amounts updated. Save to publish.');
  });

  async function loadContent() {
    const data = await api('/api/admin/content');
    state.content = data.content; state.defaults = data.defaults;
    buildEditors(state.content);
    fill(state.content);
    loadedJSON = JSON.stringify(collect());
    updateDirty();
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const box = $('cerrors');
    box.hidden = true;
    $('saveBtn').disabled = true;
    $('saveBtn').textContent = 'Saving…';
    try {
      const data = await api('/api/admin/content', { method: 'PUT', body: JSON.stringify(collect()) });
      state.content = data.content;
      fill(state.content);
      loadedJSON = JSON.stringify(collect());
      toast('Saved. The website now shows your changes.');
    } catch (err) {
      const list = (err.data && err.data.errors) || [];
      box.innerHTML = `<b>${esc(err.message)}</b>${list.length ? `<ul>${list.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}`;
      box.hidden = false;
      box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } finally {
      $('saveBtn').textContent = 'Save & publish';
      updateDirty();
    }
  });
  $('discard').addEventListener('click', () => { fill(state.content); $('cerrors').hidden = true; updateDirty(); toast('Changes discarded'); });
  $('resetBtn').addEventListener('click', () => { $('resetConfirm').hidden = false; $('resetBtn').hidden = true; });
  $('resetNo').addEventListener('click', () => { $('resetConfirm').hidden = true; $('resetBtn').hidden = false; });
  $('resetYes').addEventListener('click', async () => {
    try {
      const data = await api('/api/admin/content/reset', { method: 'POST', body: '{}' });
      state.content = data.content; fill(state.content); loadedJSON = JSON.stringify(collect()); updateDirty();
      toast('Original website content restored');
    } catch (err) { toast(err.message); }
    $('resetConfirm').hidden = true; $('resetBtn').hidden = false;
  });
  addEventListener('beforeunload', (e) => { if (isDirty()) { e.preventDefault(); e.returnValue = ''; } });

  $('signout').addEventListener('click', async () => {
    try { await fetch('/api/admin/logout', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' }, body: '{}' }); } catch (e) { /* ignore */ }
    location.replace('/admin/login');
  });

  // ============================== start ==============================
  // Storage warning (Vercel without a database connected)
  fetch('/api/admin/session', { credentials: 'same-origin' }).then((r) => r.json()).then((s) => {
    if (s.storage !== 'temporary') return;
    const b = document.createElement('div');
    b.className = 'storage-warn';
    b.innerHTML = '<b>Bookings are not being saved permanently.</b> This site is running on Vercel without a database, so new bookings, enquiries and content edits will disappear. In your Vercel project open <b>Storage</b>, add <b>Upstash for Redis</b>, connect it to this project, then redeploy.';
    document.querySelector('.main').prepend(b);
  }).catch(() => {});

  (async function start() {
    try { await Promise.all([loadRows(), loadContent()]); }
    catch (e) { toast('Could not load admin data. Check the server is running.'); }
    const h = location.hash.slice(1);
    show(['overview', 'bookings', 'enquiries', 'content'].includes(h) ? h : 'overview');
    setInterval(() => loadRows().then(() => { if (state.view === 'overview') renderOverview(); else if (state.view !== 'content') renderList(); }).catch(() => {}), 60000);
  })();
})();
