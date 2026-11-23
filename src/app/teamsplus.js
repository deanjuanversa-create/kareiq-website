// More for the team dashboards (office API fin/*, hr/*, ops/*, sales/*; access in src/app/access.js):
//   Finance     GST summary (rates set by Finance), credit notes, profit and loss with budgets
//   HR          payroll inputs (no salary calculation), training plans with due reminders
//   Operations  on-time performance against a target, visits by area, family feedback after visits
//   Sales       lost reasons, quotations (PDF), monthly targets, merging duplicate leads
//   Everyone    the team's own activity log
// Every figure comes from stored records; anything that needs a business rule (GST rates, budgets,
// targets, the on-time grace period) is set by the team and shown as "not set" until it is.
const { planName } = require('./products');
const packinfo = require('./packinfo');
const care = require('./care');
const { SLOTS } = require('./scheduler');
const { BRAND_NAMES } = require('./finance');
const { LEAVE_TYPES } = require('./features');

const ymd = (s) => String(s || '').slice(0, 10);
const month = (s) => String(s || '').slice(0, 7);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isMonth = (s) => /^\d{4}-\d{2}$/.test(s || '');
const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const monthsOfYear = (y) => Array.from({ length: 12 }, (_, i) => y + '-' + String(i + 1).padStart(2, '0'));
const lastDay = (m) => { const d = new Date(m + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const leaveCounts = (l) => !l.status || l.status === 'approved';
const overlap = (l, from, to) => { const a = l.from > from ? l.from : from, b = l.to < to ? l.to : to; return b >= a ? days(a, b) + 1 : 0; };
const r2 = (n) => Math.round(n * 100) / 100;

const LOST_REASONS = { price: 'Price too high', location: 'Outside our area', competitor: 'Chose another provider', not_needed: 'No longer needed', no_response: 'Stopped responding', timing: 'Not the right time', family: 'Family decided against it', other: 'Other' };
const QUOTE_STATUS = { draft: 'Draft', sent: 'Sent', accepted: 'Accepted', declined: 'Declined', expired: 'Expired' };
const STAFF_ROLES = ['admin', 'caregiver', 'finance', 'hr', 'operations', 'sales'];
const ROLE_NAMES = { admin: 'Office admin', caregiver: 'Nurse / caregiver', finance: 'Finance Manager', hr: 'HR', operations: 'Operations Manager', sales: 'Sales Executive' };
// which audit actions belong to which team's activity log
const TEAM_ACTIONS = {
  finance: /^(payment\.|finance\.|expense\.|credit\.|gst\.|budget\.)/,
  hr: /^(employee\.|kyc\.|attendance\.|hr\.|nurse\.leave|leave\.|training\.|user\.add)/,
  operations: /^(visit\.|issue\.|ops\.)/,
  sales: /^(lead\.|quote\.|sales\.|general\.save)/
};

function create(ctx) {
  const { docs, uid, now, todayIST, json, notFound, clean, audit, store, scheduler, staff, finance, namesFor, office } = ctx;
  const q = (url, k) => (url.searchParams.get(k) || '').trim();
  const fail = (res, message, errors) => json(res, 400, { ok: false, message: message || 'Please check the highlighted fields.', errors });
  async function setting(id) { return (await docs.findOne('app_settings', { id })) || {}; }
  async function saveSetting(id, data) { if (await docs.findOne('app_settings', { id })) await docs.update('app_settings', id, data); else await docs.insert('app_settings', { id, ...data }); }
  const money = (s) => Math.round(Number(String(s == null ? '' : s).replace(/[^0-9.]/g, '')) * 100) / 100;

  // ================================================================ Finance
  // GST: prices are shown inclusive of GST; the rate for each service line is set by Finance (check it
  // with your accountant). GST inside an amount = amount x rate / (100 + rate). Credit notes reduce it.
  async function gstReport(year) {
    const rates = (await setting('fin-gst')).rates || {};
    const [inv, cns] = await Promise.all([finance.invoices(), docs.find('app_credit_notes')]);
    const billed = inv.filter((i) => i.status !== 'quote' && String(i.date).slice(0, 4) === year);
    const lines = Object.keys(BRAND_NAMES);
    const rows = monthsOfYear(year).map((m) => {
      const out = { key: m, lines: {} };
      for (const b of lines) {
        const gross = billed.filter((i) => i.brand === b && month(i.date) === m).reduce((s, i) => s + i.amount, 0);
        const credited = cns.filter((c) => c.brand === b && month(c.date) === m).reduce((s, c) => s + c.amount, 0);
        const net = gross - credited, rate = Number.isFinite(rates[b]) ? rates[b] : null;
        const gst = rate == null ? null : r2((net * rate) / (100 + rate));
        out.lines[b] = { gross, credited, net, rate, gst, taxable: gst == null ? null : r2(net - gst) };
      }
      out.net = lines.reduce((s, b) => s + out.lines[b].net, 0);
      out.gst = lines.every((b) => out.lines[b].gst != null) ? r2(lines.reduce((s, b) => s + out.lines[b].gst, 0)) : null;
      return out;
    });
    return { year, rates, lines: lines.map((b) => ({ key: b, label: BRAND_NAMES[b], rate: Number.isFinite(rates[b]) ? rates[b] : null })), rows,
      totals: { net: rows.reduce((s, r) => s + r.net, 0), gst: rows.every((r) => r.gst != null) ? r2(rows.reduce((s, r) => s + r.gst, 0)) : null } };
  }
  async function pnl(year) {
    const [pays, cns, exps, bud] = await Promise.all([docs.find('app_payments'), docs.find('app_credit_notes'), docs.find('app_expenses'), setting('fin-budget')]);
    const cats = require('./teams').EXPENSE_CATEGORIES;
    const budget = (bud.years && bud.years[year]) || {};
    const live = exps.filter((x) => (x.status === 'approved' || x.status === 'paid') && String(x.date).slice(0, 4) === year);
    const rows = monthsOfYear(year).map((m) => {
      const income = pays.filter((p) => month(p.receivedAt) === m).reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);
      const byCat = Object.fromEntries(Object.keys(cats).map((c) => [c, live.filter((x) => x.category === c && month(x.date) === m).reduce((s, x) => s + x.amount, 0)]));
      const expenses = Object.values(byCat).reduce((s, v) => s + v, 0);
      return { key: m, income, credited: cns.filter((c) => month(c.date) === m).reduce((s, c) => s + c.amount, 0), expenses, byCat, net: income - expenses };
    });
    const catRows = Object.keys(cats).map((c) => {
      const actual = rows.reduce((s, r) => s + r.byCat[c], 0);
      const monthly = Number.isFinite(budget[c]) ? budget[c] : null;
      const elapsed = year < todayIST().slice(0, 4) ? 12 : year > todayIST().slice(0, 4) ? 0 : Number(todayIST().slice(5, 7));
      return { key: c, label: cats[c], actual, monthlyBudget: monthly, budgetToDate: monthly == null ? null : monthly * elapsed, variance: monthly == null ? null : monthly * elapsed - actual };
    });
    return { year, rows, categories: catRows, budget, totals: { income: rows.reduce((s, r) => s + r.income, 0), expenses: rows.reduce((s, r) => s + r.expenses, 0), net: rows.reduce((s, r) => s + r.net, 0), credited: rows.reduce((s, r) => s + r.credited, 0) } };
  }

  async function financeRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const year = /^\d{4}$/.test(q(url, 'year')) ? q(url, 'year') : todayIST().slice(0, 4);
    if (p === 'fin/gst' && req.method === 'GET') return json(res, 200, { ok: true, ...(await gstReport(year)) });
    if (p === 'fin/gst/rates' && req.method === 'POST') {
      const rates = {};
      for (const b of Object.keys(BRAND_NAMES)) {
        const v = body.rates && body.rates[b];
        if (v === '' || v == null) continue;
        const n = Number(v);
        if (!(n >= 0 && n <= 28)) return fail(res, 'Enter a GST rate between 0 and 28 percent.', { [b]: 'Invalid' });
        rates[b] = n;
      }
      await saveSetting('fin-gst', { rates, updatedBy: user.id, updatedAt: now() });
      await audit(user.id, 'gst.rates', null, rates);
      return json(res, 200, { ok: true });
    }
    // ---- credit notes: a recorded reduction of an invoice (a discount agreed later, a billing mistake)
    if (p === 'fin/credit-notes' && req.method === 'GET') {
      const rows = await docs.find('app_credit_notes', {}, { sort: { createdAt: -1 } });
      const names = await namesFor(rows.map((r) => r.createdBy));
      const ppl = await docs.find('app_people', { id: { $in: [...new Set(rows.map((r) => r.personId))] } });
      return json(res, 200, { ok: true, rows: rows.map((r) => ({ ...r, by: names[r.createdBy] || '', customerName: (ppl.find((x) => x.id === r.personId) || {}).name || r.personId })), total: rows.reduce((s, r) => s + r.amount, 0) });
    }
    if (p === 'fin/credit-notes' && req.method === 'POST') {
      const inv = (await finance.invoices()).find((i) => i.planId === String(body.planId || ''));
      if (!inv) throw notFound();
      const amount = money(body.amount), reason = clean(body.reason, 300);
      const errors = {};
      const room = inv.amount - (inv.credited || 0) - Math.max(0, inv.paid - inv.refunded);
      if (!(amount > 0)) errors.amount = 'Enter the amount.';
      else if (amount > room) errors.amount = room > 0 ? 'At most ' + care.fmt(room) + ' can be credited (the unpaid part). Refund money already paid instead.' : 'This invoice has nothing unpaid left to credit. Use a refund for money already paid.';
      if (reason.length < 5) errors.reason = 'Say why the invoice is reduced.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      const cn = { id: uid(), number: store.makeReference('CN'), planId: inv.planId, personId: inv.personId, invoiceNo: inv.number, brand: inv.brand, packageId: inv.packageId, amount, reason, date: todayIST(), createdBy: user.id, createdAt: now() };
      await docs.insert('app_credit_notes', cn);
      await audit(user.id, 'credit.note', inv.personId, { invoice: inv.number, amount, number: cn.number });
      if (ctx.lifecycle) await ctx.lifecycle.announce(inv.personId); // a fully settled invoice can make the customer eligible for onboarding
      return json(res, 201, { ok: true, number: cn.number });
    }
    if (p === 'fin/pnl' && req.method === 'GET') return json(res, 200, { ok: true, ...(await pnl(year)) });
    if (p === 'fin/pnl/budget' && req.method === 'POST') {
      const cats = require('./teams').EXPENSE_CATEGORIES;
      const b = {};
      for (const c of Object.keys(cats)) { const v = body.budget && body.budget[c]; if (v === '' || v == null) continue; const n = money(v); if (!(n >= 0)) return fail(res, 'Enter amounts in rupees.', { [c]: 'Invalid' }); b[c] = n; }
      const cur = await setting('fin-budget');
      await saveSetting('fin-budget', { years: { ...(cur.years || {}), [year]: b }, updatedBy: user.id, updatedAt: now() });
      await audit(user.id, 'budget.set', null, { year });
      return json(res, 200, { ok: true });
    }
    return undefined;
  }

  // ================================================================ HR
  async function employees() {
    const users = (await docs.find('app_users')).filter((u) => STAFF_ROLES.includes(u.role));
    const out = [];
    for (const u of users) out.push({ user: u, prof: await staff.profileOf(u.id) });
    return out;
  }
  // payroll inputs for a month: days, attendance and leave; no salary is calculated here
  async function payroll(m) {
    const first = m + '-01', last = lastDay(m);
    const [list, att, set] = await Promise.all([employees(), docs.find('app_attendance'), scheduler.settings()]);
    const hol = new Set((set.holidays || []).map((h) => h.date).filter((d) => d >= first && d <= last));
    return list.filter(({ user: u, prof }) => (!prof.joinDate || prof.joinDate <= last) && (!prof.exitDate || prof.exitDate >= first)).map(({ user: u, prof }) => {
      const from = prof.joinDate && prof.joinDate > first ? prof.joinDate : first, to = prof.exitDate && prof.exitDate < last ? prof.exitDate : last;
      const mine = att.filter((a) => a.userId === u.id && a.date >= from && a.date <= to);
      const c = (k) => mine.filter((a) => a.status === k).length;
      const leave = {}; for (const t of Object.keys(LEAVE_TYPES)) leave[t] = (prof.leave || []).filter((l) => leaveCounts(l) && (l.type || 'other') === t).reduce((n, l) => n + overlap(l, from, to), 0);
      const paidLeave = Object.keys(leave).filter((t) => t !== 'unpaid').reduce((n, t) => n + leave[t], 0);
      return { userId: u.id, employeeId: prof.employeeId, name: u.name, roleName: ROLE_NAMES[u.role], department: prof.department || '', designation: prof.designation || '', joinDate: prof.joinDate || '', exitDate: prof.exitDate || '',
        daysInPeriod: days(from, to) + 1, holidays: [...hol].filter((d) => d >= from && d <= to).length, present: c('present'), halfDay: c('half_day'), absent: c('absent'), weekOff: c('week_off'), markedLeave: c('on_leave'),
        leave, paidLeave, unpaidLeave: leave.unpaid, unmarked: days(from, to) + 1 - mine.length };
    });
  }
  function trainingView(t, list, today) {
    const assignees = (t.userIds || []).map((id) => {
      const emp = list.find((x) => x.user.id === id);
      const done = (t.completions || []).find((c) => c.userId === id);
      const due = t.dueDate;
      return { userId: id, name: emp ? emp.user.name : id, roleName: emp ? ROLE_NAMES[emp.user.role] : '', done: Boolean(done), completedOn: done ? done.completedOn : null, status: done ? 'done' : due < today ? 'overdue' : days(today, due) <= 7 ? 'due' : 'planned' };
    });
    return { ...t, assignees, doneCount: assignees.filter((a) => a.done).length, overdue: assignees.filter((a) => a.status === 'overdue').length };
  }
  async function hrRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'hr/payroll' && req.method === 'GET') {
      const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
      return json(res, 200, { ok: true, month: m, types: LEAVE_TYPES, rows: await payroll(m) });
    }
    if (p === 'hr/trainings' && req.method === 'GET') {
      const [rows, list] = await Promise.all([docs.find('app_trainings', {}, { sort: { dueDate: 1 } }), employees()]);
      return json(res, 200, { ok: true, rows: rows.filter((t) => !t.cancelled).map((t) => trainingView(t, list, today)), employees: list.filter((x) => x.user.active && x.prof.status !== 'inactive').map((x) => ({ id: x.user.id, name: x.user.name, role: x.user.role, roleName: ROLE_NAMES[x.user.role] })), roles: ROLE_NAMES });
    }
    if (p === 'hr/trainings' && req.method === 'POST') {
      const errors = {};
      const title = clean(body.title, 120); if (title.length < 3) errors.title = 'Name the training.';
      if (!isDate(body.dueDate)) errors.dueDate = 'Choose the date it must be done by.';
      const list = await employees();
      let ids = Array.isArray(body.userIds) ? body.userIds.map(String) : [];
      const roles = Array.isArray(body.roles) ? body.roles.filter((r) => STAFF_ROLES.includes(r)) : [];
      ids = [...new Set(ids.concat(list.filter((x) => roles.includes(x.user.role) && x.user.active).map((x) => x.user.id)))].filter((id) => list.some((x) => x.user.id === id));
      if (!ids.length) errors.userIds = 'Choose who must do it (a role or people).';
      if (Object.keys(errors).length) return fail(res, null, errors);
      const t = { id: uid(), title, description: clean(body.description, 500) || null, dueDate: body.dueDate, mandatory: body.mandatory !== false, userIds: ids, completions: [], createdBy: user.id, createdAt: now() };
      await docs.insert('app_trainings', t);
      await scheduler.notify(ids, { kind: 'training', title: 'Training assigned to you', body: `${title}, to be done by ${t.dueDate}.`, link: '#/office/me/leave' });
      await audit(user.id, 'training.add', null, { title, people: ids.length });
      return json(res, 201, { ok: true, id: t.id });
    }
    if (parts[0] === 'hr' && parts[1] === 'trainings' && parts[2] && parts[3] === 'complete' && req.method === 'POST') {
      const t = await docs.findOne('app_trainings', { id: parts[2] });
      if (!t) throw notFound();
      const who = String(body.userId || '');
      if (!(t.userIds || []).includes(who)) return fail(res, 'This person is not assigned to the training.');
      const on = isDate(body.completedOn) && body.completedOn <= today ? body.completedOn : today;
      const comps = (t.completions || []).filter((c) => c.userId !== who).concat(body.undo ? [] : [{ userId: who, completedOn: on, recordedBy: user.id, at: now(), note: clean(body.note, 200) || null }]);
      await docs.update('app_trainings', t.id, { completions: comps });
      // a completed training is also kept on the employee's record (Credentials, kind Training)
      if (!body.undo) {
        const prof = await staff.profileOf(who);
        const creds = (prof.credentials || []).filter((c) => c.trainingId !== t.id);
        await docs.update('app_staff', prof.id, { credentials: [...creds, { id: uid(), type: 'training', name: t.title, issuedOn: on, expiresOn: null, trainingId: t.id, addedBy: user.id, addedAt: now() }] });
      }
      await audit(user.id, 'training.' + (body.undo ? 'undo' : 'complete'), null, { title: t.title });
      return json(res, 200, { ok: true });
    }
    if (parts[0] === 'hr' && parts[1] === 'trainings' && parts[2] && parts[3] === 'cancel' && req.method === 'POST') {
      const t = await docs.findOne('app_trainings', { id: parts[2] });
      if (!t) throw notFound();
      await docs.update('app_trainings', t.id, { cancelled: { at: now(), by: user.id } });
      await audit(user.id, 'training.cancel', null, { title: t.title });
      return json(res, 200, { ok: true });
    }
    return undefined;
  }

  // ================================================================ Operations
  // on time: the nurse started the visit within the grace period after its planned start
  async function timeliness(from, to) {
    const set = await setting('ops-sla');
    const grace = Number.isFinite(set.graceMin) ? set.graceMin : null, target = Number.isFinite(set.targetPct) ? set.targetPct : null;
    const rows = (await docs.find('app_schedule', { date: { $gte: from, $lte: to } })).filter((v) => v.start && (v.history || []).some((h) => h.action === 'in_progress'));
    const names = await namesFor(rows.map((v) => v.nurseId));
    const per = {};
    for (const v of rows) {
      const h = (v.history || []).find((x) => x.action === 'in_progress');
      const planned = Date.parse(v.date + 'T' + v.start + ':00+05:30');
      const late = Math.round((Date.parse(h.at) - planned) / 60000);
      const k = v.nurseId || 'none';
      per[k] = per[k] || { nurseId: k, name: names[k] || 'Not assigned', started: 0, onTime: 0, lateList: [] };
      per[k].started++;
      if (grace != null && late <= grace) per[k].onTime++;
      per[k].lateList.push(Math.max(0, late));
    }
    const out = Object.values(per).map((n) => ({ nurseId: n.nurseId, name: n.name, started: n.started, onTime: grace == null ? null : n.onTime, pct: grace == null ? null : Math.round((n.onTime / n.started) * 1000) / 10,
      avgLateMin: Math.round(n.lateList.reduce((s, x) => s + x, 0) / n.lateList.length), meetsTarget: grace == null || target == null ? null : (n.onTime / n.started) * 100 >= target })).sort((a, b) => (a.pct ?? 0) - (b.pct ?? 0));
    const all = out.reduce((s, n) => s + n.started, 0), on = out.reduce((s, n) => s + (n.onTime || 0), 0);
    return { from, to, graceMin: grace, targetPct: target, rows: out, totals: { started: all, onTime: grace == null ? null : on, pct: grace == null || !all ? null : Math.round((on / all) * 1000) / 10 } };
  }
  // the area of an address: the PIN code when there is one, otherwise its last part (town or locality)
  function areaOf(text) {
    const s = String(text || '').trim();
    if (!s) return null;
    const pin = s.match(/\b(\d{6})\b/);
    if (pin) { const before = s.slice(0, pin.index).split(',').map((x) => x.trim()).filter(Boolean); return (before.length ? before[before.length - 1] + ' ' : '') + pin[1]; }
    const bits = s.split(',').map((x) => x.trim()).filter(Boolean);
    return bits.length ? bits[bits.length - 1] : null;
  }
  async function opsRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'ops/timeliness' && req.method === 'GET') {
      const from = isDate(q(url, 'from')) ? q(url, 'from') : addDays(today, -30), to = isDate(q(url, 'to')) ? q(url, 'to') : today;
      return json(res, 200, { ok: true, ...(await timeliness(from, to)) });
    }
    if (p === 'ops/timeliness/target' && req.method === 'POST') {
      const g = Number(body.graceMin), t = Number(body.targetPct);
      if (!(Number.isInteger(g) && g >= 0 && g <= 240)) return fail(res, 'Enter the minutes allowed after the planned start (0 to 240).', { graceMin: 'Invalid' });
      if (!(t >= 1 && t <= 100)) return fail(res, 'Enter the target as a percentage (1 to 100).', { targetPct: 'Invalid' });
      await saveSetting('ops-sla', { graceMin: g, targetPct: t, updatedBy: user.id, updatedAt: now() });
      await audit(user.id, 'ops.target', null, { graceMin: g, targetPct: t });
      return json(res, 200, { ok: true });
    }
    if (p === 'ops/areas' && req.method === 'GET') {
      const from = isDate(q(url, 'date')) ? q(url, 'date') : today, to = isDate(q(url, 'to')) && q(url, 'to') >= from ? q(url, 'to') : from;
      const [visits, dets] = await Promise.all([docs.find('app_schedule', { date: { $gte: from, $lte: to } }), docs.find('app_details')]);
      const names = await namesFor(visits.map((v) => v.nurseId));
      const det = (pid) => dets.find((d) => d.id === 'det-' + pid);
      const groups = {};
      for (const v of visits.filter((x) => x.status !== 'cancelled')) {
        // the customer's address first; a visit's own location only when it looks like an address
        const addr = det(v.personId) && det(v.personId).data && det(v.personId).data.address;
        const a = areaOf(addr) || (/,|\d{6}/.test(v.location || '') ? areaOf(v.location) : null) || 'Address not recorded';
        groups[a] = groups[a] || { area: a, visits: [], nurses: new Set(), customers: new Set() };
        groups[a].visits.push({ id: v.id, reference: v.reference, date: v.date, slot: v.slot, slotName: SLOTS[v.slot] ? SLOTS[v.slot].name : v.slot, start: v.start || null, serviceName: v.serviceName, customerName: v.customerName, personId: v.personId, nurseName: names[v.nurseId] || null, status: v.status });
        if (v.nurseId) groups[a].nurses.add(names[v.nurseId]);
        if (v.personId) groups[a].customers.add(v.personId);
      }
      const rows = Object.values(groups).map((g) => ({ area: g.area, visits: g.visits.sort((a, b) => (a.date + (a.start || '')).localeCompare(b.date + (b.start || ''))), nurses: [...g.nurses].filter(Boolean), customers: g.customers.size, unassigned: g.visits.filter((v) => !v.nurseName).length })).sort((a, b) => b.visits.length - a.visits.length);
      return json(res, 200, { ok: true, from, to, rows });
    }
    if (p === 'ops/feedback' && req.method === 'GET') {
      const rows = (await docs.find('app_issues', { type: 'feedback' }, { sort: { createdAt: -1 } })).slice(0, 100);
      return json(res, 200, { ok: true, rows: rows.map((x) => ({ id: x.id, reference: x.reference, rating: x.rating, title: x.title, detail: x.detail, customerName: x.customerName, visitRef: x.visitRef, source: x.source || 'office', createdAt: x.createdAt })) });
    }
    return undefined;
  }
  // ---- family feedback after a completed visit (the family Home asks; one answer per visit)
  async function familyFeedback(req, res, parts, user, body, visiblePerson) {
    if (user.role !== 'family') return undefined;
    if (parts[0] === 'feedback' && parts[1] === 'pending' && req.method === 'GET') {
      const links = await docs.find('app_links', { userId: user.id, kind: 'family' });
      const ids = links.map((l) => l.personId);
      if (!ids.length) return json(res, 200, { ok: true, rows: [] });
      const since = addDays(todayIST(), -7);
      const [visits, answered] = await Promise.all([docs.find('app_schedule', { personId: { $in: ids }, status: 'completed' }), docs.find('app_issues', { type: 'feedback' })]);
      const done = new Set(answered.map((x) => x.visitId).filter(Boolean));
      const skipped = new Set((await docs.find('app_feedback_skips', { userId: user.id })).map((x) => x.visitId));
      const names = await namesFor(visits.map((v) => v.nurseId));
      const rows = visits.filter((v) => v.date >= since && !done.has(v.id) && !skipped.has(v.id)).sort((a, b) => (a.date < b.date ? 1 : -1)).slice(0, 3)
        .map((v) => ({ visitId: v.id, personId: v.personId, customerName: v.customerName, serviceName: v.serviceName, date: v.date, nurseName: names[v.nurseId] || null }));
      return json(res, 200, { ok: true, rows });
    }
    if (parts[0] === 'feedback' && parts.length === 2 && req.method === 'POST') {
      const v = await docs.findOne('app_schedule', { id: parts[1] });
      if (!v || !v.personId || v.status !== 'completed') return json(res, 404, { ok: false, message: 'That visit was not found.' });
      await visiblePerson(user, v.personId);
      if (body.skip) { await docs.insert('app_feedback_skips', { id: uid(), userId: user.id, visitId: v.id, at: now() }); return json(res, 200, { ok: true }); }
      const rating = Number(body.rating);
      if (!(Number.isInteger(rating) && rating >= 1 && rating <= 5)) return json(res, 400, { ok: false, message: 'Choose 1 to 5 stars.', errors: { rating: 'Required' } });
      if ((await docs.find('app_issues', { type: 'feedback', visitId: v.id })).length) return json(res, 409, { ok: false, message: 'Thank you, this visit already has feedback.' });
      const comment = clean(body.comment, 500);
      const x = { id: uid(), reference: store.makeReference('IS'), type: 'feedback', source: 'family', title: 'Feedback on ' + v.serviceName + ' (' + v.date + ')', detail: comment || null, priority: rating <= 2 ? 'high' : 'normal',
        personId: v.personId, customerName: v.customerName, visitId: v.id, visitRef: v.reference, rating, status: rating <= 2 ? 'open' : 'closed', createdBy: user.id, createdAt: now(), history: [{ at: now(), by: user.id, action: 'opened', note: 'From the family' }] };
      await docs.insert('app_issues', x);
      // a low rating is followed up by Operations
      if (rating <= 2) await scheduler.notify(await scheduler.operations(), { kind: 'low-feedback', title: 'Low rating from a family', body: `${v.customerName}: ${rating} of 5 for ${v.serviceName} on ${v.date}.`, link: '#/office/ops/quality' });
      await audit(user.id, 'feedback.add', v.personId, { visit: v.reference, rating });
      return json(res, 201, { ok: true });
    }
    return undefined;
  }

  // ================================================================ Sales
  async function quoteView(qt) { return { ...qt, statusName: QUOTE_STATUS[qt.validUntil < todayIST() && qt.status === 'sent' ? 'expired' : qt.status], expired: qt.validUntil < todayIST() && qt.status === 'sent' }; }
  async function quotePdf(qt) {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const doc = await PDFDocument.create(); const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const ink = rgb(0.09, 0.19, 0.35), muted = rgb(0.4, 0.45, 0.52);
    const t = (s, x, y, size, f, c) => page.drawText(String(s == null ? '' : s).replace(/₹/g, 'Rs. ').replace(/[^\x20-\x7E]/g, ''), { x, y, size: size || 10, font: f || font, color: c || ink });
    const rs = (n) => 'Rs. ' + Math.round(n).toLocaleString('en-IN');
    let y = 780;
    t('KareIQ', 50, y, 22, bold); t('Quotation', 420, y, 18, bold); y -= 18;
    t('Healthcare at home and in community living', 50, y, 9, font, muted); t(qt.number, 420, y, 10); y -= 14; t('Date ' + ymd(qt.createdAt) + '   Valid until ' + qt.validUntil, 360, y, 9, font, muted);
    y -= 40; t('For', 50, y, 9, font, muted); y -= 14; t(qt.name, 50, y, 12, bold); y -= 14; if (qt.phone) { t(qt.phone, 50, y, 10); y -= 14; } if (qt.careFor) { t('Care for: ' + qt.careFor, 50, y, 10); y -= 14; }
    y -= 20; page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.7, color: muted }); y -= 18;
    t('Item', 50, y, 10, bold); t('Amount', 470, y, 10, bold); y -= 16;
    for (const it of qt.items) { t(it.label.slice(0, 80), 50, y, 10); t(rs(it.amount), 470, y, 10); y -= 16; }
    if (qt.discount) { t('Discount', 50, y, 10); t('- ' + rs(qt.discount), 470, y, 10); y -= 16; }
    page.drawLine({ start: { x: 50, y: y + 4 }, end: { x: 545, y: y + 4 }, thickness: 0.7, color: muted }); y -= 14;
    t('Total', 50, y, 12, bold); t(rs(qt.total), 470, y, 12, bold); y -= 16; t(qt.gstNote || 'Inclusive of all GST.', 50, y, 9, font, muted); y -= 30;
    if (qt.notes) { for (const line of String(qt.notes).match(/.{1,95}(\s|$)/g) || []) { t(line.trim(), 50, y, 10); y -= 14; } y -= 10; }
    t('This quotation is valid until ' + qt.validUntil + '. The package starts once our team confirms it and the payment is received.', 50, y, 9, font, muted);
    y -= 14; t('Prepared by ' + (qt.byName || 'KareIQ') + '.', 50, y, 9, font, muted);
    return Buffer.from(await doc.save());
  }
  async function salesRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    // ---- quotations
    if (p === 'sales/quotes' && req.method === 'GET') {
      const rows = await docs.find('app_quotes', {}, { sort: { createdAt: -1 } });
      const mine = q(url, 'mine');
      const list = [];
      for (const r of rows.filter((x) => !mine || x.createdBy === user.id)) list.push(await quoteView(r));
      return json(res, 200, { ok: true, statuses: QUOTE_STATUS, rows: list, totals: { open: list.filter((x) => x.status === 'sent' && !x.expired).reduce((s, x) => s + x.total, 0), accepted: list.filter((x) => x.status === 'accepted').reduce((s, x) => s + x.total, 0) } });
    }
    if (p === 'sales/quotes' && req.method === 'POST') {
      const errors = {};
      const leadType = ['booking', 'enquiry'].includes(body.leadType) ? body.leadType : null;
      const lead = leadType && body.leadId ? (await office.leadRows()).find((l) => l.type === leadType && l.id === String(body.leadId)) : null;
      if (body.leadId && !lead) errors.leadId = 'Lead not found.';
      const name = clean(body.name || (lead && lead.name), 80); if (name.length < 2) errors.name = 'Enter who the quote is for.';
      const pk = body.packageId ? await packinfo.byId(String(body.packageId)) : null;
      if (!pk) errors.packageId = 'Choose the package.';
      const months = pk && packinfo.durationOf(pk) ? Number(body.months) || (pk.model === 'tiers' ? 12 : 1) : null;
      const price = pk ? packinfo.priceOf(pk, months) : { amount: null };
      const base = price.amount || money(body.amount);
      if (pk && !(base > 0)) errors.amount = pk.name + ' is priced on call: enter the proposed amount.';
      const extras = (Array.isArray(body.extras) ? body.extras : []).map((x) => ({ label: clean(x.label, 80), amount: money(x.amount) })).filter((x) => x.label && x.amount > 0).slice(0, 8);
      const discount = money(body.discount) || 0;
      const subtotal = base + extras.reduce((s, x) => s + x.amount, 0);
      if (discount < 0 || discount >= subtotal) errors.discount = 'The discount must be less than the total.';
      const validUntil = isDate(body.validUntil) && body.validUntil >= today ? body.validUntil : addDays(today, 15);
      if (Object.keys(errors).length) return fail(res, null, errors);
      const qt = { id: uid(), number: store.makeReference('QT'), leadType, leadId: lead ? lead.id : null, leadRef: lead ? lead.enquiryId : null, name, phone: (lead && lead.phone) || body.phone || null, careFor: clean(body.careFor, 80) || null,
        packageId: pk.id, packageName: pk.name, months, items: [{ label: price.text || pk.name, amount: base }].concat(extras), discount, total: subtotal - discount, gstNote: pk.noGst ? '' : 'Inclusive of all GST.', notes: clean(body.notes, 500) || null,
        validUntil, status: 'draft', createdBy: user.id, byName: user.name, createdAt: now(), history: [{ at: now(), by: user.id, action: 'created' }] };
      await docs.insert('app_quotes', qt);
      if (lead) {
        const col = lead.type === 'booking' ? 'bookings' : 'enquiries';
        const raw = (await store.readAll(col)).find((r) => r.id === lead.id);
        await store.update(col, lead.id, { package: pk.id, expectedValue: qt.total, expectedMonths: months, leadHistory: [...((raw && raw.leadHistory) || []), { at: now(), by: user.name, byId: user.id, action: 'quote', note: 'Quotation ' + qt.number + ': ' + care.fmt(qt.total) }] });
      }
      await audit(user.id, 'quote.add', null, { quote: qt.number, total: qt.total });
      return json(res, 201, { ok: true, id: qt.id, number: qt.number });
    }
    if (parts[0] === 'sales' && parts[1] === 'quotes' && parts[2]) {
      const qt = await docs.findOne('app_quotes', { id: parts[2] });
      if (!qt) throw notFound();
      if (parts[3] === 'pdf' && req.method === 'GET') {
        const buf = await quotePdf(qt);
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="quotation-${qt.number}.pdf"`, 'Cache-Control': 'private, no-store' });
        res.end(buf); return true;
      }
      if (parts[3] === 'status' && req.method === 'POST') {
        const to = body.status;
        const allowed = { draft: ['sent', 'declined'], sent: ['accepted', 'declined', 'sent'], accepted: [], declined: [] };
        if (!(allowed[qt.status] || []).includes(to)) return fail(res, 'A ' + QUOTE_STATUS[qt.status].toLowerCase() + ' quotation cannot become ' + (QUOTE_STATUS[to] || to).toLowerCase() + '.');
        await docs.update('app_quotes', qt.id, { status: to, updatedAt: now(), history: [...(qt.history || []), { at: now(), by: user.id, action: to, note: clean(body.note, 200) || null }] });
        if (qt.leadId && (to === 'accepted' || to === 'declined')) {
          const col = qt.leadType === 'booking' ? 'bookings' : 'enquiries';
          const raw = (await store.readAll(col)).find((r) => r.id === qt.leadId);
          if (raw) await store.update(col, raw.id, { leadStatus: to === 'accepted' ? 'follow_up' : raw.leadStatus, leadHistory: [...(raw.leadHistory || []), { at: now(), by: user.name, byId: user.id, action: 'quote', note: 'Quotation ' + qt.number + ' ' + to + (to === 'accepted' ? ': waiting for the office to approve the package and the payment' : '') }] });
        }
        if (to === 'accepted') await scheduler.notify(await scheduler.admins(), { kind: 'quote-accepted', title: 'Quotation accepted', body: `${qt.name} accepted ${qt.number} for ${qt.packageName} (${care.fmt(qt.total)}). Approve the package request when it arrives.`, link: '#/office/sales/quotes' });
        await audit(user.id, 'quote.' + to, null, { quote: qt.number });
        return json(res, 200, { ok: true });
      }
    }
    // ---- targets: set by the office admin, seen by everyone in Sales
    if (p === 'sales/targets' && req.method === 'GET') {
      const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
      const set = await setting('sales-targets');
      const tg = (set.months && set.months[m]) || {};
      const [leads, members, orders] = await Promise.all([office.leadRows(), office.members(), docs.find('app_orders', { status: 'paid' })]);
      const rows = members.map((u) => {
        const mine = leads.filter((l) => l.assignedTo === u.id);
        const conv = mine.filter((l) => l.status === 'converted' && month(((l.history || []).filter((h) => h.to === 'converted').pop() || {}).at || l.createdAt) === m).length;
        const paid = mine.map((l) => l.orderId && orders.find((o) => o.id === l.orderId)).filter((o) => o && month((o.payment && o.payment.verifiedAt) || o.paidAt || o.updatedAt) === m).reduce((s, o) => s + (o.amount || 0), 0);
        const t = tg[u.id] || {};
        return { userId: u.id, name: u.name, leads: mine.filter((l) => month(l.assignedAt || l.createdAt) === m).length, conversions: conv, revenue: paid, target: { leads: t.leads ?? null, conversions: t.conversions ?? null, revenue: t.revenue ?? null } };
      });
      return json(res, 200, { ok: true, month: m, canSet: user.role === 'admin', rows });
    }
    if (p === 'sales/targets' && req.method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { ok: false, message: 'Targets are set by the office admin.' });
      const m = isMonth(body.month) ? body.month : today.slice(0, 7);
      const set = await setting('sales-targets');
      const tg = {};
      for (const [id, t] of Object.entries(body.targets || {})) tg[id] = { leads: t.leads === '' || t.leads == null ? null : Math.max(0, Math.round(Number(t.leads)) || 0), conversions: t.conversions === '' || t.conversions == null ? null : Math.max(0, Math.round(Number(t.conversions)) || 0), revenue: t.revenue === '' || t.revenue == null ? null : Math.max(0, money(t.revenue)) };
      await saveSetting('sales-targets', { months: { ...(set.months || {}), [m]: tg }, updatedBy: user.id, updatedAt: now() });
      await audit(user.id, 'sales.targets', null, { month: m });
      return json(res, 200, { ok: true });
    }
    // ---- merge repeat enquiries from the same person into one lead (nothing is deleted)
    if (p === 'sales/leads/merge' && req.method === 'POST') {
      const all = await office.leadRows();
      const find = (k) => { const [t, ...rest] = String(k || '').split(':'); return all.find((l) => l.type === t && l.id === rest.join(':')); };
      const keep = find(body.keep);
      const others = (Array.isArray(body.merge) ? body.merge : []).map(find).filter(Boolean).filter((l) => !(l.type === keep?.type && l.id === keep?.id));
      if (!keep) return fail(res, 'Choose the lead to keep.');
      if (!others.length) return fail(res, 'Choose the repeat enquiries to merge into it.');
      if (others.some((l) => l.requestKind || l.orderId || l.appPlanId)) return fail(res, 'A package request or order from the app cannot be merged away; keep it as the main lead instead.');
      const col = (l) => (l.type === 'booking' ? 'bookings' : 'enquiries');
      const keptRaw = (await store.readAll(col(keep))).find((r) => r.id === keep.id);
      let hist = [...((keptRaw && keptRaw.leadHistory) || [])];
      for (const o of others) {
        const raw = (await store.readAll(col(o))).find((r) => r.id === o.id);
        hist = hist.concat(((raw && raw.leadHistory) || []).map((h) => ({ ...h, from: o.enquiryId })));
        hist.push({ at: now(), by: user.name, byId: user.id, action: 'merged', note: o.enquiryId + ' merged into this lead' + (o.message ? ': ' + String(o.message).slice(0, 120) : '') });
        await store.update(col(o), o.id, { mergedInto: { type: keep.type, id: keep.id, ref: keep.enquiryId, at: now(), by: user.id } });
      }
      hist.sort((a, b) => String(a.at).localeCompare(String(b.at)));
      await store.update(col(keep), keep.id, { leadHistory: hist });
      await audit(user.id, 'lead.merge', keep.personId || null, { keep: keep.enquiryId, merged: others.map((o) => o.enquiryId) });
      return json(res, 200, { ok: true, merged: others.length });
    }
    if (p === 'sales/lost' && req.method === 'GET') {
      const rows = (await office.leadRows()).filter((l) => l.status === 'lost');
      const g = {}; rows.forEach((l) => { const k = l.lostReason || 'not_recorded'; g[k] = (g[k] || 0) + 1; });
      return json(res, 200, { ok: true, reasons: LOST_REASONS, byReason: Object.keys(g).map((k) => ({ key: k, label: LOST_REASONS[k] || 'Not recorded', value: g[k] })).sort((a, b) => b.value - a.value),
        rows: rows.slice(0, 100).map((l) => ({ type: l.type, id: l.id, enquiryId: l.enquiryId, name: l.name, packageName: l.packageName, sourceName: l.sourceName, lostReason: l.lostReason || null, lostReasonName: LOST_REASONS[l.lostReason] || 'Not recorded', lostNote: l.lostNote || null, assignedName: l.assignedName })) });
    }
    return undefined;
  }

  // ================================================================ the team's activity log
  async function activity(req, res, team, url) {
    const users = (await docs.find('app_users')).filter((u) => u.role === team || u.role === 'admin');
    const ids = new Set(users.filter((u) => u.role === team).map((u) => u.id));
    const rows = (await docs.find('app_audit', {}, { sort: { at: -1 }, limit: 3000 })).filter((a) => ids.has(a.userId) || (a.userId && TEAM_ACTIONS[team].test(a.action || '') && users.some((u) => u.id === a.userId)));
    const who = q(url, 'user');
    const list = rows.filter((a) => !who || a.userId === who).slice(0, 300);
    const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
    const people = await docs.find('app_people', { id: { $in: [...new Set(list.map((a) => a.personId).filter(Boolean))] } });
    return json(res, 200, { ok: true, members: users.filter((u) => ids.has(u.id)).map((u) => ({ id: u.id, name: u.name })),
      rows: list.map((a) => ({ at: a.at, by: names[a.userId] || 'Someone', byRole: (users.find((u) => u.id === a.userId) || {}).role || '', action: a.action, customer: a.personId ? (people.find((x) => x.id === a.personId) || {}).name || a.personId : null,
        detail: a.detail && typeof a.detail === 'object' ? Object.entries(a.detail).filter(([k, v]) => v != null && typeof v !== 'object').slice(0, 4).map(([k, v]) => k + ': ' + v).join(' · ') : null })) });
  }

  // ---- the added reports (CSV, or PDF with ?format=pdf)
  async function reports(req, res, parts, url, user) {
    const { sendReport } = require('./teams');
    const kind = parts[2].replace(/\.(csv|pdf)$/, '');
    const today = todayIST(), year = /^\d{4}$/.test(q(url, 'year')) ? q(url, 'year') : today.slice(0, 4);
    const key = parts[0] + '/' + kind;
    if (key === 'fin/gst') {
      const g = await gstReport(year);
      return sendReport(res, url, 'gst-summary-' + year, ['Month', ...g.lines.flatMap((l) => [l.label + ' net (INR)', l.label + ' GST rate %', l.label + ' GST (INR)']), 'Net total (INR)', 'GST total (INR)'],
        g.rows.map((r) => [r.key, ...g.lines.flatMap((l) => [r.lines[l.key].net, r.lines[l.key].rate == null ? 'not set' : r.lines[l.key].rate, r.lines[l.key].gst == null ? '' : r.lines[l.key].gst]), r.net, r.gst == null ? '' : r.gst]));
    }
    if (key === 'fin/pnl') {
      const d = await pnl(year);
      return sendReport(res, url, 'profit-and-loss-' + year, ['Month', 'Money in (INR)', 'Expenses (INR)', 'Net (INR)', 'Credit notes (INR)'], d.rows.map((r) => [r.key, r.income, r.expenses, r.net, r.credited]).concat([['Total', d.totals.income, d.totals.expenses, d.totals.net, d.totals.credited]]));
    }
    if (key === 'fin/credit-notes') {
      const rows = await docs.find('app_credit_notes', {}, { sort: { createdAt: -1 } });
      const names = await namesFor(rows.map((r) => r.createdBy));
      return sendReport(res, url, 'credit-notes-' + today, ['Credit note', 'Date', 'Invoice', 'Customer ID', 'Amount (INR)', 'Reason', 'By'], rows.map((r) => [r.number, r.date, r.invoiceNo, r.personId, r.amount, r.reason, names[r.createdBy] || '']));
    }
    if (key === 'hr/payroll') {
      const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
      const rows = await payroll(m);
      return sendReport(res, url, 'payroll-inputs-' + m, ['Employee ID', 'Name', 'Role', 'Department', 'Designation', 'Joined', 'Left', 'Days in period', 'Holidays', 'Present', 'Half days', 'Absent', 'Weekly off', 'Paid leave days', 'Unpaid leave days', 'Not marked'],
        rows.map((r) => [r.employeeId, r.name, r.roleName, r.department, r.designation, r.joinDate, r.exitDate, r.daysInPeriod, r.holidays, r.present, r.halfDay, r.absent, r.weekOff, r.paidLeave, r.unpaidLeave, r.unmarked]));
    }
    if (key === 'hr/trainings') {
      const [rows, list] = await Promise.all([docs.find('app_trainings'), employees()]);
      return sendReport(res, url, 'trainings-' + today, ['Training', 'Due', 'Employee', 'Role', 'Status', 'Completed on'], rows.filter((t) => !t.cancelled).flatMap((t) => trainingView(t, list, today).assignees.map((a) => [t.title, t.dueDate, a.name, a.roleName, a.status, a.completedOn || ''])));
    }
    if (key === 'ops/timeliness') {
      const d = await timeliness(isDate(q(url, 'from')) ? q(url, 'from') : addDays(today, -30), isDate(q(url, 'to')) ? q(url, 'to') : today);
      return sendReport(res, url, 'on-time-performance-' + d.from + '-to-' + d.to, ['Nurse', 'Visits started', 'On time', 'On time %', 'Average minutes late', 'Meets target'], d.rows.map((n) => [n.name, n.started, n.onTime == null ? 'grace not set' : n.onTime, n.pct == null ? '' : n.pct, n.avgLateMin, n.meetsTarget == null ? '' : n.meetsTarget ? 'Yes' : 'No']));
    }
    if (key === 'ops/feedback') {
      const rows = await docs.find('app_issues', { type: 'feedback' }, { sort: { createdAt: -1 } });
      return sendReport(res, url, 'customer-feedback-' + today, ['Date', 'Customer', 'Visit', 'Rating', 'Comment', 'From'], rows.map((x) => [ymd(x.createdAt), x.customerName || '', x.visitRef || '', x.rating, x.detail || '', x.source === 'family' ? 'Family' : 'Office']));
    }
    if (key === 'sales/lost') {
      const rows = (await office.leadRows()).filter((l) => l.status === 'lost');
      return sendReport(res, url, 'lost-leads-' + today, ['Enquiry ID', 'Name', 'Package', 'Source', 'Reason', 'Note', 'Assigned to'], rows.map((l) => [l.enquiryId, l.name, l.packageName || '', l.sourceName, LOST_REASONS[l.lostReason] || 'Not recorded', l.lostNote || '', l.assignedName || '']));
    }
    if (key === 'sales/quotes') {
      const rows = await docs.find('app_quotes', {}, { sort: { createdAt: -1 } });
      return sendReport(res, url, 'quotations-' + today, ['Quotation', 'Date', 'For', 'Package', 'Total (INR)', 'Discount (INR)', 'Valid until', 'Status', 'By'], rows.map((x) => [x.number, ymd(x.createdAt), x.name, x.packageName, x.total, x.discount || 0, x.validUntil, QUOTE_STATUS[x.status], x.byName]));
    }
    return undefined;
  }

  async function handle(req, res, parts, url, user, body) {
    if (['fin', 'hr', 'ops', 'sales'].includes(parts[0]) && parts[1] === 'reports' && parts.length === 3 && req.method === 'GET') { const r = await reports(req, res, parts, url, user); if (r !== undefined) return r; }
    const team = { fin: 'finance', hr: 'hr', ops: 'operations', sales: 'sales' }[parts[0]];
    if (team && parts[1] === 'activity' && parts.length === 2 && req.method === 'GET') return activity(req, res, team, url);
    if (parts[0] === 'fin') return financeRoute(req, res, parts, url, user, body);
    if (parts[0] === 'hr') return hrRoute(req, res, parts, url, user, body);
    if (parts[0] === 'ops') return opsRoute(req, res, parts, url, user, body);
    if (parts[0] === 'sales') return salesRoute(req, res, parts, url, user, body);
    return undefined;
  }
  // my trainings (every staff login)
  async function myTrainings(user) {
    const [rows, list] = await Promise.all([docs.find('app_trainings'), employees()]);
    return rows.filter((t) => !t.cancelled && (t.userIds || []).includes(user.id)).map((t) => trainingView(t, list, todayIST())).map((t) => ({ id: t.id, title: t.title, description: t.description, dueDate: t.dueDate, mine: t.assignees.find((a) => a.userId === user.id) }));
  }
  // hourly: trainings due within 7 days or overdue (once each), to the person and HR
  async function remind() {
    const today = todayIST();
    const hr = (await docs.find('app_users', { active: true })).filter((u) => u.role === 'hr').map((u) => u.id);
    for (const t of await docs.find('app_trainings')) {
      if (t.cancelled) continue;
      const sent = t.reminded || {};
      let changed = false;
      for (const id of t.userIds || []) {
        if ((t.completions || []).some((c) => c.userId === id)) continue;
        const stage = t.dueDate < today ? 'overdue' : days(today, t.dueDate) <= 7 ? 'due' : null;
        if (!stage || sent[id] === stage) continue;
        await scheduler.notify([id], { kind: 'training', title: stage === 'overdue' ? 'Training overdue' : 'Training due soon', body: `${t.title}: due ${t.dueDate}.`, link: '#/office/me/leave' });
        if (stage === 'overdue') { const u = await docs.findOne('app_users', { id }); await scheduler.notify(hr, { kind: 'training', title: 'Training overdue', body: `${u ? u.name : id}: ${t.title} was due ${t.dueDate}.`, link: '#/office/hr/trainings' }); }
        sent[id] = stage; changed = true;
      }
      if (changed) await docs.update('app_trainings', t.id, { reminded: sent });
    }
  }
  return { handle, familyFeedback, myTrainings, remind, gstReport, pnl, payroll, areaOf, LOST_REASONS };
}

module.exports = { create, LOST_REASONS, QUOTE_STATUS, TEAM_ACTIONS };
