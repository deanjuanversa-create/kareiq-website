// The Finance Manager, HR, Operations Manager and Sales Executive dashboards (office API: fin/*,
// hr/*, ops/*, sales/*). One integrated part of the office: every figure is worked out from the
// records the rest of KareIQ already keeps (plans and invoices, app_payments, app_staff, the nurse
// scheduler, leave records, leads); the few new records (expenses, reconciliation runs, attendance,
// credentials, service issues, lead follow-ups) live beside them. Nothing here is sample data.
// Who may call what is decided first, in src/app/access.js; the office admin may call all of it.
const { PRODUCTS, planName } = require('./products');
const packinfo = require('./packinfo');
const care = require('./care');
const { STATUS: VSTATUS, ACTIVE, SLOTS, DAYS } = require('./scheduler');
const { BRAND_NAMES } = require('./finance');
const { kycSummary, DEPARTMENTS, KYC_KINDS } = require('./staff');
const { LEAVE_TYPES } = require('./features');
const { LEAD_STATUS, SOURCES } = require('./office');

const STAFF_ROLES = ['admin', 'caregiver', 'finance', 'hr', 'operations', 'sales'];
const ROLE_NAMES = { admin: 'Office admin', caregiver: 'Nurse / caregiver', finance: 'Finance Manager', hr: 'HR', operations: 'Operations Manager', sales: 'Sales Executive' };
const EXPENSE_CATEGORIES = { supplies: 'Medical supplies', equipment: 'Equipment', travel: 'Travel and fuel', rent: 'Rent and utilities', marketing: 'Marketing', software: 'Software and subscriptions', professional: 'Professional fees', training: 'Staff welfare and training', other: 'Other' };
const EXPENSE_STATUS = { submitted: 'Waiting for approval', approved: 'Approved', rejected: 'Rejected', paid: 'Paid', cancelled: 'Cancelled' };
const RECON_STATUS = { matched: 'Matched', amount_mismatch: 'Amount differs', missing_in_kareiq: 'Not in KareIQ', missing_in_statement: 'Not in the statement', failed: 'Failed at the gateway', failed_but_recorded: 'Failed, but recorded as paid', duplicate: 'Duplicate in the statement' };
const CRED_TYPES = { qualification: 'Professional qualification', license: 'Nursing / healthcare licence', certification: 'Certification', training: 'Training', compliance: 'Compliance record' };
const ATTENDANCE = { present: 'Present', absent: 'Absent', half_day: 'Half day', on_leave: 'On leave', week_off: 'Weekly off', holiday: 'Holiday' };
const ISSUE_TYPES = { complaint: 'Customer complaint', service: 'Service-delivery exception', 'missed-visit': 'Missed-visit follow-up', incident: 'Operational incident', feedback: 'Customer feedback' };
const ISSUE_STATUS = { open: 'Open', in_progress: 'In progress', resolved: 'Resolved', closed: 'Closed' };
const CONTACT_KINDS = { call: 'Phone call', whatsapp: 'WhatsApp', email: 'Email', meeting: 'Meeting / visit', note: 'Note' };
const EXPIRY_SOON = 30; // days: a credential expiring within this is flagged and reminded
const ONBOARDING_LATE = 7; // days an eligible customer may wait for onboarding before it is "delayed"

const ymd = (s) => String(s || '').slice(0, 10);
const month = (s) => String(s || '').slice(0, 7);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isMonth = (s) => /^\d{4}-\d{2}$/.test(s || '');
const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
function monthsBack(today, n) { const out = []; const d = new Date(today.slice(0, 7) + '-01T12:00:00Z'); for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7)); return out; }
function daysIn(from, to) { const out = []; for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d); return out; }
const money = (n) => Math.round(Number(n) || 0);
const group = (rows, keyOf, nameOf, valOf) => { const m = {}; rows.forEach((r) => { const k = keyOf(r) || 'none'; m[k] = (m[k] || 0) + (valOf ? valOf(r) : 1); }); return Object.keys(m).map((k) => ({ key: k, label: nameOf ? nameOf(k) : k, value: m[k] })).sort((a, b) => b.value - a.value); };
function paginate(rows, url) { const page = Math.max(1, Number(url.searchParams.get('page')) || 1); const size = Math.min(100, Math.max(5, Number(url.searchParams.get('size')) || 25)); return { page, size, total: rows.length, pages: Math.max(1, Math.ceil(rows.length / size)), rows: rows.slice((page - 1) * size, page * size) }; }
// leave days of one leave record that fall between two dates
const overlapDays = (l, from, to) => { const a = l.from > from ? l.from : from, b = l.to < to ? l.to : to; return b >= a ? days(a, b) + 1 : 0; };
const leaveCounts = (l) => !l.status || l.status === 'approved';

// a spreadsheet-safe CSV (a cell starting with = + - @ is never run as a formula)
function csvCell(v) {
  let s = v == null ? '' : String(v);
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+(\.\d+)?$/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}
// the same report as a PDF (landscape table, for sharing with management)
async function sendPdf(res, name, header, rows) {
  const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const W = 842, H = 595, M = 32, size = 7.5, lh = 12;
  const clean = (v) => String(v == null ? '' : v).replace(/\u20b9/g, 'Rs. ').replace(/[\u2013\u2014]/g, '-').replace(/\u00b7/g, '-').replace(/[^\x20-\x7E]/g, '');
  const widthOf = (t, f) => (f || font).widthOfTextAtSize(t, size);
  const natural = header.map((h, i) => Math.min(220, Math.max(widthOf(clean(h), bold), ...rows.slice(0, 300).map((r) => widthOf(clean(r[i]))))) + 10);
  const scale = Math.min(1, (W - 2 * M) / natural.reduce((a, b) => a + b, 0));
  const cols = natural.map((w) => w * scale);
  const fit = (t, w, f) => { let s = clean(t); if (widthOf(s, f) <= w - 4) return s; while (s.length > 1 && widthOf(s + '..', f) > w - 4) s = s.slice(0, -1); return s + '..'; };
  const title = name.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
  let page, y;
  const head = () => {
    page = doc.addPage([W, H]); y = H - M;
    page.drawText(clean('KareIQ - ' + title), { x: M, y, size: 12, font: bold, color: rgb(0.09, 0.19, 0.35) }); y -= 18;
    let x = M; header.forEach((h, i) => { page.drawText(fit(h, cols[i], bold), { x: x + 2, y, size, font: bold, color: rgb(0.2, 0.25, 0.32) }); x += cols[i]; });
    y -= 5; page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.6, color: rgb(0.7, 0.72, 0.76) }); y -= lh;
  };
  head();
  for (const r of rows) {
    if (y < M + 14) head();
    let x = M; r.forEach((c, i) => { page.drawText(fit(c, cols[i]), { x: x + 2, y, size, font, color: rgb(0.1, 0.12, 0.16) }); x += cols[i]; });
    y -= lh;
  }
  if (!rows.length) page.drawText('No rows.', { x: M, y, size: 9, font });
  const pages = doc.getPages();
  pages.forEach((pg, i) => pg.drawText('Page ' + (i + 1) + ' of ' + pages.length + ' - printed ' + new Date().toISOString().slice(0, 10), { x: W - M - 150, y: 16, size: 7, font, color: rgb(0.45, 0.48, 0.53) }));
  const buf = Buffer.from(await doc.save());
  res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}.pdf"`, 'Cache-Control': 'private, no-store' });
  res.end(buf);
  return true;
}
function sendReport(res, url, name, header, rows) { return url && url.searchParams.get('format') === 'pdf' ? sendPdf(res, name, header, rows) : sendCsv(res, name, header, rows); }
function sendCsv(res, name, header, rows) {
  const body = '﻿' + [header, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
  res.writeHead(200, { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${name}.csv"`, 'Cache-Control': 'private, no-store' });
  res.end(body);
  return true;
}
// a CSV statement from a payment gateway or bank (quoted fields, any common column names)
function parseCsv(text) {
  const rows = []; let row = [], cell = '', q = false;
  const t = String(text || '').replace(/^﻿/, '');
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"' && t[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true; else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter((r) => r.some((x) => String(x).trim()));
}
function statementRows(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) return { error: 'The file needs a header row and at least one transaction.' };
  const head = rows[0].map((h) => String(h).trim().toLowerCase());
  const col = (...names) => head.findIndex((h) => names.some((n) => h === n || h.includes(n)));
  const ref = col('utr', 'reference', 'transaction id', 'txn id', 'payment id', 'ref', 'id');
  const amount = col('amount', 'credit', 'value');
  const date = col('date', 'created', 'time');
  const status = col('status', 'state');
  if (ref < 0 || amount < 0) return { error: 'The file needs a transaction reference column (UTR, reference, transaction or payment ID) and an amount column.' };
  const out = [];
  for (const r of rows.slice(1)) {
    const a = Number(String(r[amount] || '').replace(/[^0-9.-]/g, ''));
    const d = date >= 0 ? String(r[date] || '').trim() : '';
    const iso = /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10) : /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/.test(d) ? d.replace(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4}).*$/, (m, dd, mm, yy) => `${yy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`) : null;
    out.push({ ref: String(r[ref] || '').trim(), amount: Number.isFinite(a) ? Math.round(a * 100) / 100 : null, date: iso, status: status >= 0 ? String(r[status] || '').trim().toLowerCase() : '' });
  }
  return { rows: out.filter((x) => x.ref || x.amount != null).slice(0, 5000) };
}

function create(ctx) {
  const { docs, uid, now, todayIST, json, notFound, bad, forbidden, clean, audit, store, scheduler, staff, finance, namesFor, office, lifecycle, normalisePhone, welcomeLink } = ctx;
  // "Needs your attention": what is waiting for this person, each with where to go; only items that are not zero
  const todo = (list) => list.filter((x) => x.count > 0);
  const moreTodo = async (role) => (ctx.more && ctx.more.attention ? ctx.more.attention(role) : []);
  // who to contact about a customer: the family logins linked to them, then the phone on the details form
  async function contactsOf(personIds) {
    const ids = [...new Set(personIds.filter(Boolean))];
    if (!ids.length) return {};
    const [links, dets] = await Promise.all([docs.find('app_links', { personId: { $in: ids }, kind: 'family' }), docs.find('app_details', { id: { $in: ids.map((x) => 'det-' + x) } })]);
    const users = links.length ? await docs.find('app_users', { id: { $in: links.map((l) => l.userId) } }) : [];
    const out = {};
    for (const id of ids) {
      const fam = links.filter((l) => l.personId === id).map((l) => users.find((u) => u.id === l.userId)).filter(Boolean);
      const det = dets.find((d) => d.id === 'det-' + id);
      const f = fam.find((u) => u.phone) || fam[0];
      out[id] = { name: f ? f.name : null, phone: (f && f.phone) || (det && det.data && det.data.phone1) || null, email: (f && f.email) || (det && det.data && det.data.email) || null, relation: f ? (links.find((l) => l.userId === f.id && l.personId === id) || {}).relation || null : null };
    }
    return out;
  }
  const q = (url, k) => (url.searchParams.get(k) || '').trim();
  const fail = (res, message, errors) => json(res, 400, { ok: false, message: message || 'Please check the highlighted fields.', errors });
  const people = async (ids) => { const list = [...new Set(ids.filter(Boolean))]; const rows = list.length ? await docs.find('app_people', { id: { $in: list } }) : []; return Object.fromEntries(rows.map((p) => [p.id, p.name])); };
  async function setting(id) { return (await docs.findOne('app_settings', { id })) || null; }
  async function saveSetting(id, data) { if (await docs.findOne('app_settings', { id })) await docs.update('app_settings', id, data); else await docs.insert('app_settings', { id, ...data }); }
  async function usersWithRole(...roles) { return (await docs.find('app_users', { active: true })).filter((u) => roles.includes(u.role)).map((u) => u.id); }

  // ================================================================ Finance
  async function financeOverview(user) {
    const today = todayIST();
    const [inv, pays, exps, orders, recon] = await Promise.all([finance.invoices(), docs.find('app_payments'), docs.find('app_expenses'), docs.find('app_orders', { status: 'awaiting_payment' }), docs.find('app_recon', {}, { sort: { createdAt: -1 }, limit: 1 })]);
    const billed = inv.filter((i) => i.status !== 'quote');
    const net = (list) => list.reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);
    const invOf = Object.fromEntries(inv.map((i) => [i.planId, i]));
    const live = exps.filter((x) => x.status === 'approved' || x.status === 'paid');
    const months = monthsBack(today, 12);
    const collectedBy = (key, names) => group(pays, (p) => (invOf[p.planId] || {})[key], names, (p) => (p.kind === 'refund' ? -p.amount : p.amount));
    return {
      kpis: {
        totalRevenue: billed.reduce((s, i) => s + i.amount - (i.credited || 0), 0), credited: inv.reduce((s, i) => s + (i.credited || 0), 0), collected: net(pays), outstanding: inv.reduce((s, i) => s + i.outstanding, 0),
        overdueAmount: inv.filter((i) => i.overdueDays > 0).reduce((s, i) => s + i.outstanding, 0), overdueInvoices: inv.filter((i) => i.overdueDays > 0).length,
        pendingPayments: orders.length + inv.filter((i) => i.outstanding > 0).length, pendingAmount: orders.reduce((s, o) => s + (o.amount || 0), 0) + inv.reduce((s, i) => s + i.outstanding, 0),
        refunds: pays.filter((p) => p.kind === 'refund').reduce((s, p) => s + p.amount, 0), refundCount: pays.filter((p) => p.kind === 'refund').length,
        thisMonth: net(pays.filter((p) => month(p.receivedAt) === today.slice(0, 7))), thisYear: net(pays.filter((p) => p.receivedAt.slice(0, 4) === today.slice(0, 4))),
        expensesThisMonth: live.filter((x) => month(x.date) === today.slice(0, 7)).reduce((s, x) => s + x.amount, 0), expensesWaiting: exps.filter((x) => x.status === 'submitted').length
      },
      invoiceStatus: ['paid', 'partial', 'unpaid', 'refunded'].map((k) => ({ key: k, label: { paid: 'Paid', partial: 'Partly paid', unpaid: 'Unpaid', refunded: 'Refunded' }[k], value: inv.filter((i) => i.status === k).length }))
        .concat([{ key: 'overdue', label: 'Overdue', value: inv.filter((i) => i.overdueDays > 0).length }]),
      monthly: months.map((m) => ({ key: m, collected: net(pays.filter((p) => month(p.receivedAt) === m)), billed: billed.filter((i) => month(i.date) === m).reduce((s, i) => s + i.amount - (i.credited || 0), 0), expenses: live.filter((x) => month(x.date) === m).reduce((s, x) => s + x.amount, 0) })),
      yearly: [...new Set(pays.map((p) => p.receivedAt.slice(0, 4)).concat([today.slice(0, 4)]))].sort().map((y) => ({ key: y, collected: net(pays.filter((p) => p.receivedAt.slice(0, 4) === y)), expenses: live.filter((x) => String(x.date).slice(0, 4) === y).reduce((s, x) => s + x.amount, 0) })),
      byPackage: collectedBy('packageId', (k) => (k === 'none' ? 'Other' : planName(k))), byService: collectedBy('brand', (k) => BRAND_NAMES[k] || k),
      byMethod: group(pays.filter((p) => p.kind === 'payment'), (p) => p.method, (k) => require('./orders').METHODS[k] || k, (p) => p.amount),
      packagePerformance: [...new Set(billed.map((i) => i.packageId))].map((k) => { const mine = billed.filter((i) => i.packageId === k); return { key: k, label: planName(k), invoices: mine.length, billed: mine.reduce((s, i) => s + i.amount - (i.credited || 0), 0), collected: mine.reduce((s, i) => s + i.paid - i.refunded, 0), outstanding: mine.reduce((s, i) => s + i.outstanding, 0) }; }).sort((a, b) => b.billed - a.billed),
      lastRecon: recon[0] ? { id: recon[0].id, at: recon[0].createdAt, counts: recon[0].counts, source: recon[0].source } : null,
      todo: todo([
        { key: 'overdue', label: 'Overdue invoices to follow up', count: inv.filter((i) => i.overdueDays > 0).length, href: '#/office/fin/receivables?bucket=overdue', tone: 'bad' },
        { key: 'approve', label: 'Expenses waiting for your approval', count: exps.filter((x) => x.status === 'submitted' && (!user || x.createdBy !== user.id)).length, href: '#/office/fin/expenses?status=submitted', tone: 'warn' },
        { key: 'pay', label: 'Approved expenses to pay', count: exps.filter((x) => x.status === 'approved').length, href: '#/office/fin/expenses?status=approved', tone: 'warn' },
        { key: 'recon', label: 'Reconciliation exceptions not resolved', count: (await docs.find('app_recon')).reduce((n, r) => n + (r.items || []).filter((i) => i.status !== 'matched' && !i.resolved).length, 0), href: '#/office/fin/recon', tone: 'warn' },
        { key: 'orders', label: 'Approved packages waiting for the customer\'s payment', count: orders.length, href: '#/office/finance/due', tone: '' }
      ].concat(await moreTodo('finance'))),
      note: 'Collected = verified payments minus refunds. Revenue = invoiced amounts of confirmed packages (packages priced on call are left out until a price is agreed).'
    };
  }
  async function paymentRows(url) {
    const [pays, inv] = await Promise.all([docs.find('app_payments', {}, { sort: { receivedAt: -1 } }), finance.invoices()]);
    const invOf = Object.fromEntries(inv.map((i) => [i.planId, i]));
    const names = await people(pays.map((p) => p.personId)), by = await namesFor(pays.map((p) => p.recordedBy));
    const kind = q(url, 'kind'), method = q(url, 'method'), from = q(url, 'from'), to = q(url, 'to'), text = q(url, 'q').toLowerCase();
    return pays.map((p) => ({ id: p.id, kind: p.kind, amount: p.amount, method: p.method, ref: p.ref, reason: p.reason || null, receivedAt: p.receivedAt, invoiceNo: p.invoiceNo || (invOf[p.planId] || {}).number || '', planId: p.planId,
      personId: p.personId, customerName: names[p.personId] || p.personId, packageName: (invOf[p.planId] || {}).packageName || '', recordedBy: by[p.recordedBy] || (p.recordedBy ? 'KareIQ' : 'Payment check'),
      status: p.kind === 'refund' ? 'Refunded' : 'Received', invoiceStatus: (invOf[p.planId] || {}).status || null }))
      .filter((p) => (!kind || p.kind === kind) && (!method || p.method === method) && (!isDate(from) || ymd(p.receivedAt) >= from) && (!isDate(to) || ymd(p.receivedAt) <= to) &&
        (!text || [p.ref, p.invoiceNo, p.customerName, p.personId].some((x) => String(x || '').toLowerCase().includes(text))));
  }
  async function reconcile(items, from, to) {
    const pays = await docs.find('app_payments');
    const out = [], used = new Set();
    for (const x of items) {
      // the KareIQ payment for this transaction: same reference, not matched yet, the same amount first
      const free = x.ref ? pays.filter((p) => p.ref === x.ref && !used.has(p.id)) : [];
      const amt = Math.round(Math.abs(x.amount || 0));
      const rec = free.find((p) => p.kind === 'payment' && Math.round(p.amount) === amt) || free.find((p) => p.kind === 'payment') || free[0] || null;
      const repeated = x.ref && out.some((o) => o.ref === x.ref && o.status !== 'failed');
      let status;
      if (/fail|declin|reject|error/.test(x.status)) status = rec || (x.ref && pays.some((p) => p.ref === x.ref)) ? 'failed_but_recorded' : 'failed';
      else if (!rec && repeated) status = 'duplicate';
      else if (!rec) status = 'missing_in_kareiq';
      else status = Math.round(rec.amount) === amt ? 'matched' : 'amount_mismatch';
      if (rec && status !== 'failed_but_recorded') used.add(rec.id);
      out.push({ ref: x.ref, date: x.date, amount: x.amount, gatewayStatus: x.status || null, status, paymentId: rec ? rec.id : null, kareiqAmount: rec ? rec.amount : null, invoiceNo: rec ? rec.invoiceNo || null : null });
    }
    // KareIQ payments in the statement's dates that the statement does not have
    for (const p of pays.filter((x) => x.kind === 'payment' && !used.has(x.id) && (!from || ymd(x.receivedAt) >= from) && (!to || ymd(x.receivedAt) <= to))) {
      out.push({ ref: p.ref, date: ymd(p.receivedAt), amount: null, gatewayStatus: null, status: 'missing_in_statement', paymentId: p.id, kareiqAmount: p.amount, invoiceNo: p.invoiceNo || null });
    }
    return out.map((x, i) => ({ n: i + 1, ...x, statusName: RECON_STATUS[x.status] }));
  }
  async function expenseRows(url) {
    const rows = await docs.find('app_expenses', {}, { sort: { date: -1 } });
    const names = await namesFor(rows.flatMap((x) => [x.createdBy, x.decidedBy, x.paidBy]));
    const status = q(url, 'status'), cat = q(url, 'category'), from = q(url, 'from'), to = q(url, 'to'), text = q(url, 'q').toLowerCase();
    return rows.map((x) => ({ ...x, categoryName: EXPENSE_CATEGORIES[x.category] || x.category, statusName: EXPENSE_STATUS[x.status], createdByName: names[x.createdBy] || '', decidedByName: names[x.decidedBy] || null, paidByName: names[x.paidBy] || null }))
      .filter((x) => (!status || x.status === status) && (!cat || x.category === cat) && (!isDate(from) || x.date >= from) && (!isDate(to) || x.date <= to) &&
        (!text || [x.reference, x.vendor, x.description].some((v) => String(v || '').toLowerCase().includes(text))));
  }

  async function financeRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    if (p === 'fin/overview' && req.method === 'GET') return json(res, 200, { ok: true, ...(await financeOverview(user)) });
    if (p === 'fin/payments' && req.method === 'GET') {
      const rows = await paymentRows(url);
      const pay = rows.filter((x) => x.kind === 'payment'), ref = rows.filter((x) => x.kind === 'refund');
      return json(res, 200, { ok: true, ...paginate(rows, url), totals: { received: pay.reduce((s, x) => s + x.amount, 0), refunded: ref.reduce((s, x) => s + x.amount, 0), payments: pay.length, refunds: ref.length }, methods: require('./orders').METHODS });
    }
    // ---- receivables: what is owed, by age, with the billing contact and every reminder sent
    if (p === 'fin/receivables' && req.method === 'GET') {
      const today = todayIST();
      const inv = (await finance.invoices()).filter((i) => i.outstanding > 0);
      const [names, contacts, rem] = await Promise.all([people(inv.map((i) => i.personId)), contactsOf(inv.map((i) => i.personId)), docs.find('app_reminders', {}, { sort: { at: -1 } })]);
      const by = await namesFor(rem.map((r) => r.by));
      const bucketOf = (i) => (i.overdueDays === 0 ? 'current' : i.overdueDays <= 30 ? 'd30' : i.overdueDays <= 60 ? 'd60' : i.overdueDays <= 90 ? 'd90' : 'd90p');
      const BUCKETS = { current: 'Not due yet', d30: '1–30 days overdue', d60: '31–60 days overdue', d90: '61–90 days overdue', d90p: 'More than 90 days overdue' };
      const want = q(url, 'bucket'), text = q(url, 'q').toLowerCase();
      const rows = inv.map((i) => { const mine = rem.filter((r) => r.planId === i.planId); return { planId: i.planId, number: i.number, date: i.date, dueDate: i.dueDate, personId: i.personId, customerName: names[i.personId] || i.personId, packageName: i.packageName,
        amount: i.amount, paid: i.paid - i.refunded, outstanding: i.outstanding, overdueDays: i.overdueDays, bucket: bucketOf(i), bucketName: BUCKETS[bucketOf(i)], contact: contacts[i.personId] || null,
        reminders: mine.length, lastReminder: mine[0] ? { at: mine[0].at, channel: mine[0].channel, by: by[mine[0].by] || '', note: mine[0].note || null } : null }; })
        .filter((r) => (!want || (want === 'overdue' ? r.overdueDays > 0 : r.bucket === want)) && (!text || [r.number, r.customerName, r.personId].some((x) => String(x).toLowerCase().includes(text))))
        .sort((a, b) => b.overdueDays - a.overdueDays);
      const all = inv.map((i) => ({ b: bucketOf(i), o: i.outstanding }));
      return json(res, 200, { ok: true, today, buckets: Object.keys(BUCKETS).map((k) => ({ key: k, label: BUCKETS[k], count: all.filter((x) => x.b === k).length, amount: all.filter((x) => x.b === k).reduce((s2, x) => s2 + x.o, 0) })), rows, methods: require('./orders').METHODS });
    }
    if (parts[0] === 'fin' && parts[1] === 'receivables' && parts[3] === 'remind' && parts.length === 4 && req.method === 'POST') {
      const inv = (await finance.invoices()).find((i) => i.planId === parts[2]);
      if (!inv) throw notFound();
      const channel = ['whatsapp', 'call', 'email', 'sms', 'visit'].includes(body.channel) ? body.channel : null;
      if (!channel) return fail(res, 'Choose how you reminded them.', { channel: 'Required' });
      const r = { id: uid(), planId: inv.planId, personId: inv.personId, invoiceNo: inv.number, channel, note: clean(body.note, 300) || null, promisedOn: isDate(body.promisedOn) ? body.promisedOn : null, outstanding: inv.outstanding, by: user.id, at: now() };
      await docs.insert('app_reminders', r);
      await audit(user.id, 'payment.reminder', inv.personId, { invoice: inv.number, channel });
      return json(res, 201, { ok: true });
    }
    // ---- reconciliation: a gateway or bank statement against the payments KareIQ recorded
    if (p === 'fin/recon' && req.method === 'GET') {
      const runs = await docs.find('app_recon', {}, { sort: { createdAt: -1 }, limit: 50 });
      const names = await namesFor(runs.map((r) => r.createdBy));
      return json(res, 200, { ok: true, statuses: RECON_STATUS, rows: runs.map((r) => ({ id: r.id, reference: r.reference, source: r.source, fileName: r.fileName, from: r.from, to: r.to, counts: r.counts, exceptions: r.exceptions, resolved: (r.items || []).filter((i) => i.resolved).length, createdAt: r.createdAt, by: names[r.createdBy] || '' })) });
    }
    if (p === 'fin/recon' && req.method === 'POST') {
      const text = String(body.csv || '');
      if (!text.trim()) return fail(res, 'Choose the statement file (CSV) exported from the payment gateway or bank.', { csv: 'Required' });
      if (text.length > 2000000) return fail(res, 'The statement is too large (2 MB at most). Export a shorter date range.', { csv: 'Too large' });
      const st = statementRows(text);
      if (st.error) return fail(res, st.error, { csv: st.error });
      const dates = st.rows.map((x) => x.date).filter(Boolean).sort();
      const from = isDate(body.from) ? body.from : dates[0] || null, to = isDate(body.to) ? body.to : dates[dates.length - 1] || null;
      const items = await reconcile(st.rows, from, to);
      const counts = Object.fromEntries(Object.keys(RECON_STATUS).map((k) => [k, items.filter((i) => i.status === k).length]));
      const run = { id: uid(), reference: store.makeReference('RC'), source: clean(body.source, 60) || 'Payment gateway statement', fileName: clean(body.fileName, 120) || null, from, to, counts,
        exceptions: items.filter((i) => i.status !== 'matched').length, items, createdBy: user.id, createdAt: now() };
      await docs.insert('app_recon', run);
      await audit(user.id, 'finance.reconcile', null, { run: run.reference, rows: st.rows.length, exceptions: run.exceptions });
      return json(res, 201, { ok: true, id: run.id, reference: run.reference, counts, exceptions: run.exceptions });
    }
    if (parts[0] === 'fin' && parts[1] === 'recon' && parts[2]) {
      const run = await docs.findOne('app_recon', { id: parts[2] });
      if (!run) throw notFound();
      if (parts.length === 3 && req.method === 'GET') {
        const names = await namesFor([run.createdBy, ...run.items.map((i) => i.resolved && i.resolved.by)]);
        return json(res, 200, { ok: true, statuses: RECON_STATUS, run: { ...run, by: names[run.createdBy] || '', items: run.items.map((i) => ({ ...i, resolved: i.resolved ? { ...i.resolved, byName: names[i.resolved.by] || '' } : null })) } });
      }
      if (parts[3] === 'exceptions.csv' && req.method === 'GET') {
        return sendReport(res, url, 'reconciliation-' + run.reference + '-exceptions', ['Row', 'Status', 'Reference', 'Date', 'Statement amount', 'KareIQ amount', 'Invoice', 'Gateway status', 'Resolved', 'Resolution note'],
          run.items.filter((i) => i.status !== 'matched').map((i) => [i.n, i.statusName, i.ref, i.date, i.amount, i.kareiqAmount, i.invoiceNo, i.gatewayStatus, i.resolved ? 'Yes' : 'No', i.resolved ? i.resolved.note : '']));
      }
      if (parts[3] === 'items' && parts[5] === 'resolve' && req.method === 'POST') {
        const n = Number(parts[4]); const item = run.items.find((i) => i.n === n);
        if (!item) throw notFound();
        if (item.status === 'matched') return fail(res, 'This row already matches.');
        const note = clean(body.note, 300);
        if (note.length < 3) return fail(res, 'Say how this was resolved.', { note: 'Required' });
        await docs.update('app_recon', run.id, { items: run.items.map((i) => (i.n === n ? { ...i, resolved: { at: now(), by: user.id, note } } : i)) });
        await audit(user.id, 'finance.reconcile.resolve', null, { run: run.reference, row: n });
        return json(res, 200, { ok: true });
      }
    }
    // ---- expenses: recorded, approved by someone else, then paid; every step kept
    if (p === 'fin/expenses' && req.method === 'GET') {
      const all = await expenseRows(url);
      const live = all.filter((x) => x.status === 'approved' || x.status === 'paid');
      const today = todayIST();
      return json(res, 200, { ok: true, ...paginate(all, url), categories: EXPENSE_CATEGORIES, statuses: EXPENSE_STATUS, me: user.id,
        totals: { approved: live.reduce((s, x) => s + x.amount, 0), waiting: all.filter((x) => x.status === 'submitted').reduce((s, x) => s + x.amount, 0), waitingCount: all.filter((x) => x.status === 'submitted').length, paid: all.filter((x) => x.status === 'paid').reduce((s, x) => s + x.amount, 0) },
        byCategory: group(live, (x) => x.category, (k) => EXPENSE_CATEGORIES[k] || k, (x) => x.amount), byMonth: monthsBack(today, 12).map((m) => ({ key: m, value: live.filter((x) => month(x.date) === m).reduce((s, x) => s + x.amount, 0) })) });
    }
    if (p === 'fin/expenses' && req.method === 'POST') {
      const errors = {};
      const amount = Math.round(Number(String(body.amount || '').replace(/[^0-9.]/g, '')) * 100) / 100;
      if (!isDate(body.date) || body.date > todayIST()) errors.date = 'Choose the date of the expense (not in the future).';
      if (!EXPENSE_CATEGORIES[body.category]) errors.category = 'Choose a category.';
      if (!(amount > 0)) errors.amount = 'Enter the amount.';
      const vendor = clean(body.vendor, 100), description = clean(body.description, 300);
      if (vendor.length < 2) errors.vendor = 'Enter who was paid.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      const x = { id: uid(), reference: store.makeReference('EX'), date: body.date, category: body.category, amount, vendor, description, invoiceRef: clean(body.invoiceRef, 60) || null,
        status: 'submitted', createdBy: user.id, createdAt: now(), history: [{ at: now(), by: user.id, action: 'submitted' }] };
      await docs.insert('app_expenses', x);
      await audit(user.id, 'expense.add', null, { expense: x.reference, amount });
      return json(res, 201, { ok: true, id: x.id, reference: x.reference });
    }
    if (parts[0] === 'fin' && parts[1] === 'expenses' && parts[2] && parts.length === 4 && req.method === 'POST') {
      const x = await docs.findOne('app_expenses', { id: parts[2] });
      if (!x) throw notFound();
      const action = parts[3], note = clean(body.note, 300);
      const step = async (changes, act) => { await docs.update('app_expenses', x.id, { ...changes, updatedAt: now(), history: [...(x.history || []), { at: now(), by: user.id, action: act, note: note || null }] }); await audit(user.id, 'expense.' + act, null, { expense: x.reference }); return json(res, 200, { ok: true }); };
      if (action === 'approve' || action === 'reject') {
        if (x.status !== 'submitted') return fail(res, 'Only an expense waiting for approval can be ' + (action === 'approve' ? 'approved' : 'rejected') + '.');
        if (x.createdBy === user.id) return json(res, 403, { ok: false, message: 'Someone else must approve an expense you recorded.' });
        if (action === 'reject' && note.length < 3) return fail(res, 'Say why it is rejected.', { note: 'Required' });
        return step({ status: action === 'approve' ? 'approved' : 'rejected', decidedBy: user.id, decidedAt: now(), decisionNote: note || null }, action === 'approve' ? 'approved' : 'rejected');
      }
      if (action === 'paid') {
        if (x.status !== 'approved') return fail(res, 'Only an approved expense can be marked as paid.');
        const ref = clean(body.ref, 60);
        if (ref.length < 3) return fail(res, 'Enter the payment reference.', { ref: 'Required' });
        return step({ status: 'paid', paidBy: user.id, paidAt: now(), paymentRef: ref }, 'paid');
      }
      if (action === 'cancel') {
        if (x.status !== 'submitted') return fail(res, 'Only an expense waiting for approval can be withdrawn.');
        if (x.createdBy !== user.id && user.role !== 'admin') return json(res, 403, { ok: false, message: 'Only the person who recorded it can withdraw it.' });
        return step({ status: 'cancelled' }, 'cancelled');
      }
    }
    // ---- reports (CSV)
    if (parts[0] === 'fin' && parts[1] === 'reports' && parts.length === 3 && req.method === 'GET') {
      const kind = parts[2].replace(/\.csv$/, '');
      const ov = await financeOverview(user);
      const today = todayIST();
      if (kind === 'revenue-package') return sendReport(res, url, 'revenue-by-package-' + today, ['Package', 'Invoices', 'Invoiced (INR)', 'Collected (INR)', 'Outstanding (INR)'], ov.packagePerformance.map((x) => [x.label, x.invoices, x.billed, x.collected, x.outstanding]));
      if (kind === 'revenue-service') return sendReport(res, url, 'revenue-by-service-' + today, ['Service line', 'Collected (INR)'], ov.byService.map((x) => [x.label, x.value]));
      if (kind === 'revenue-method') return sendReport(res, url, 'revenue-by-payment-method-' + today, ['Payment method', 'Received (INR)'], ov.byMethod.map((x) => [x.label, x.value]));
      if (kind === 'monthly') return sendReport(res, url, 'monthly-financial-summary-' + today, ['Month', 'Invoiced (INR)', 'Collected (INR)', 'Approved expenses (INR)', 'Collected minus expenses (INR)'], ov.monthly.map((m) => [m.key, m.billed, m.collected, m.expenses, m.collected - m.expenses]));
      if (kind === 'yearly') return sendReport(res, url, 'yearly-financial-summary-' + today, ['Year', 'Collected (INR)', 'Approved expenses (INR)'], ov.yearly.map((y) => [y.key, y.collected, y.expenses]));
      if (kind === 'invoices' || kind === 'receivables') {
        const inv = (await finance.invoices()).filter((i) => kind === 'invoices' || i.outstanding > 0);
        const names = await people(inv.map((i) => i.personId));
        return sendReport(res, url, kind + '-' + today, ['Invoice', 'Date', 'Due', 'Customer', 'Customer ID', 'Package', 'Service line', 'Amount (INR)', 'Paid (INR)', 'Refunded (INR)', 'Outstanding (INR)', 'Status', 'Days overdue'],
          inv.map((i) => [i.number, i.date, i.dueDate, names[i.personId] || '', i.personId, i.packageName, BRAND_NAMES[i.brand] || i.brand, i.amount, i.paid, i.refunded, i.outstanding, i.status, i.overdueDays]));
      }
      if (kind === 'payments' || kind === 'refunds') {
        const rows = (await paymentRows(url)).filter((x) => x.kind === (kind === 'payments' ? 'payment' : 'refund'));
        return sendReport(res, url, kind + '-' + today, ['Date', 'Reference', 'Invoice', 'Customer', 'Package', 'Method', 'Amount (INR)', 'Reason', 'Recorded by'], rows.map((x) => [ymd(x.receivedAt), x.ref, x.invoiceNo, x.customerName, x.packageName, x.method, x.amount, x.reason || '', x.recordedBy]));
      }
      if (kind === 'expenses') {
        const rows = await expenseRows(url);
        return sendReport(res, url, 'expenses-' + today, ['Reference', 'Date', 'Category', 'Paid to', 'Description', 'Amount (INR)', 'Status', 'Recorded by', 'Decided by', 'Payment reference'], rows.map((x) => [x.reference, x.date, x.categoryName, x.vendor, x.description, x.amount, x.statusName, x.createdByName, x.decidedByName || '', x.paymentRef || '']));
      }
      throw notFound();
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
  function credStatus(c, today) {
    if (c.withdrawn) return 'withdrawn';
    if (!c.expiresOn) return 'valid';
    const left = days(today, c.expiresOn);
    return left < 0 ? 'expired' : left <= EXPIRY_SOON ? 'expiring' : 'valid';
  }
  function credView(c, today) { const st = credStatus(c, today); return { ...c, typeName: CRED_TYPES[c.type] || c.type, status: st, statusName: { valid: 'Valid', expiring: 'Expiring soon', expired: 'Expired', withdrawn: 'Withdrawn' }[st], daysLeft: c.expiresOn ? days(today, c.expiresOn) : null }; }
  // onboarding checklist, from what is already recorded
  function onboarding(u, p, today) {
    const k = kycSummary(u.role, p.kyc);
    const creds = (p.credentials || []).filter((c) => !c.withdrawn);
    const steps = [
      ['details', 'Department, designation and joining date', Boolean(p.department && p.designation && p.joinDate)],
      ['contact', 'Phone or email, and an emergency contact', Boolean((u.phone || u.email) && p.emergencyContact && p.emergencyContact.phone)],
      ['kyc', 'KYC documents verified', k.status === 'verified'],
      ['login', 'Has signed in (password set)', Boolean(u.passwordHash)]
    ];
    if (u.role === 'caregiver') steps.push(['licence', 'A current nursing / healthcare licence recorded', creds.some((c) => c.type === 'license' && credStatus(c, today) !== 'expired')]);
    const done = steps.filter((s) => s[2]).length;
    return { status: done === steps.length ? 'complete' : 'in_progress', done, total: steps.length, steps: steps.map(([key, label, ok]) => ({ key, label, ok })) };
  }
  function empView(u, p, today) {
    const v = staff.view(u, p);
    return { ...v, roleName: ROLE_NAMES[u.role] || u.role, designation: p.designation || '', exitDate: p.exitDate || null, onboarding: onboarding(u, p, today), credentials: (p.credentials || []).map((c) => credView(c, today)) };
  }
  async function attendanceFor(date) { return docs.find('app_attendance', { date }); }
  async function leavePolicy() { const s = await setting('hr-leave-policy'); return (s && s.allowances) || {}; }

  async function hrRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'hr/overview' && req.method === 'GET') {
      const list = (await employees()).map(({ user: u, prof }) => ({ u, prof, v: empView(u, prof, today) }));
      const since = addDays(today, -30), year = today.slice(0, 4);
      const creds = list.flatMap((x) => x.v.credentials.filter((c) => c.status !== 'withdrawn'));
      const att = await attendanceFor(today);
      const pendingLeave = list.reduce((n, x) => n + (x.prof.leave || []).filter((l) => l.status === 'pending').length, 0);
      return json(res, 200, { ok: true,
        kpis: { total: list.length, active: list.filter((x) => x.v.status !== 'inactive').length, inactive: list.filter((x) => x.v.status === 'inactive').length, onLeave: list.filter((x) => x.v.status === 'on_leave').length,
          joined: list.filter((x) => (x.v.joinDate || '') >= since && (x.v.joinDate || '') <= today).length, left: list.filter((x) => x.v.exitDate && x.v.exitDate >= since).length,
          leftThisYear: list.filter((x) => x.v.exitDate && x.v.exitDate.slice(0, 4) === year).length,
          onboarding: list.filter((x) => x.v.status !== 'inactive' && x.v.onboarding.status !== 'complete').length, expiring: creds.filter((c) => c.status === 'expiring').length, expired: creds.filter((c) => c.status === 'expired').length,
          pendingLeave, markedToday: att.length },
        byDepartment: group(list.filter((x) => x.v.status !== 'inactive'), (x) => x.v.department, (k) => (k === 'none' ? 'Not set' : k)),
        byRole: group(list.filter((x) => x.v.status !== 'inactive'), (x) => x.u.role, (k) => ROLE_NAMES[k] || k),
        joining: monthsBack(today, 12).map((m) => ({ key: m, joined: list.filter((x) => month(x.v.joinDate) === m).length, left: list.filter((x) => month(x.v.exitDate) === m).length })),
        expiringSoon: creds.filter((c) => c.status !== 'valid').sort((a, b) => (a.expiresOn < b.expiresOn ? -1 : 1)).slice(0, 8).map((c) => ({ ...c, employee: (list.find((x) => (x.prof.credentials || []).some((y) => y.id === c.id)) || {}).v })).map((c) => ({ id: c.id, name: c.name, typeName: c.typeName, expiresOn: c.expiresOn, status: c.status, daysLeft: c.daysLeft, employeeName: c.employee ? c.employee.name : '', userId: c.employee ? c.employee.userId : null })),
        recent: list.filter((x) => x.v.joinDate).sort((a, b) => (a.v.joinDate < b.v.joinDate ? 1 : -1)).slice(0, 5).map((x) => ({ userId: x.u.id, name: x.u.name, roleName: x.v.roleName, joinDate: x.v.joinDate, onboarding: x.v.onboarding })),
        todo: todo([
          { key: 'leave', label: 'Leave requests to approve or reject', count: pendingLeave, href: '#/office/scheduler/leave', tone: 'warn' },
          { key: 'expired', label: 'Credentials that have expired', count: creds.filter((c) => c.status === 'expired').length, href: '#/office/hr/credentials?status=expired', tone: 'bad' },
          { key: 'expiring', label: 'Credentials expiring within 30 days', count: creds.filter((c) => c.status === 'expiring').length, href: '#/office/hr/credentials?status=expiring', tone: 'warn' },
          { key: 'onboarding', label: 'Employees with onboarding steps left', count: list.filter((x) => x.v.status !== 'inactive' && x.v.onboarding.status !== 'complete').length, href: '#/office/hr/onboarding?status=in_progress', tone: '' },
          { key: 'attendance', label: 'Employees not marked in today\'s attendance', count: Math.max(0, list.filter((x) => x.u.active && x.v.status !== 'inactive').length - att.length), href: '#/office/hr/attendance', tone: '' }
        ].concat(await moreTodo('hr'))) });
    }
    // HR adds a new nurse / caregiver: the login, the employee record and the welcome link to set a password.
    // Office logins (admin, Finance, HR, Operations, Sales) are given by the office admin under Settings > Logins.
    if (p === 'hr/employees' && req.method === 'POST') {
      const errors = {};
      const name = clean(body.name, 80); if (name.length < 2) errors.name = 'Enter the name.';
      const phone = body.phone ? normalisePhone(body.phone) : null; if (body.phone && !phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'This email address looks incomplete.';
      if (!phone && !email) errors.phone = 'Enter a mobile number or email; it is what they sign in with.';
      if (phone && await docs.findOne('app_users', { phone })) errors.phone = 'Another login already uses this mobile number.';
      if (email && await docs.findOne('app_users', { email })) errors.email = 'Another login already uses this email.';
      const dept = DEPARTMENTS.includes(body.department) ? body.department : 'Nursing';
      if (body.joinDate && !isDate(body.joinDate)) errors.joinDate = 'Choose the date of joining.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      const u = { id: uid(), name, email: email || null, phone, role: 'caregiver', passwordHash: null, active: true, createdAt: now(), createdBy: user.id };
      await docs.insert('app_users', u);
      const prof = await staff.profileOf(u.id);
      await docs.update('app_staff', prof.id, { department: dept, designation: clean(body.designation, 80) || 'Staff Nurse', location: clean(body.location, 80), joinDate: isDate(body.joinDate) ? body.joinDate : today, businessUnit: ['karehome', 'karenest', 'kareiq'].includes(body.businessUnit) ? body.businessUnit : prof.businessUnit, updatedAt: now() });
      await audit(user.id, 'user.add', null, { role: 'caregiver', name, by: 'hr' });
      return json(res, 201, { ok: true, userId: u.id, employeeId: prof.employeeId, ...(await welcomeLink(req, u)) });
    }
    if (p === 'hr/onboarding' && req.method === 'GET') {
      const rows = (await employees()).map(({ user: u, prof }) => empView(u, prof, today)).filter((v) => v.status !== 'inactive' || q(url, 'all'));
      const st = q(url, 'status');
      return json(res, 200, { ok: true, rows: rows.filter((v) => !st || v.onboarding.status === st).sort((a, b) => a.onboarding.done / a.onboarding.total - b.onboarding.done / b.onboarding.total) });
    }
    if (parts[0] === 'hr' && parts[1] === 'employees' && parts[2]) {
      const u = await docs.findOne('app_users', { id: parts[2] });
      if (!u || !STAFF_ROLES.includes(u.role)) throw notFound();
      const prof = await staff.profileOf(u.id);
      if (parts.length === 3 && req.method === 'GET') {
        const names = await namesFor((prof.history || []).map((h) => h.by));
        const m = today.slice(0, 7);
        const att = (await docs.find('app_attendance', { userId: u.id })).filter((a) => month(a.date) === m);
        return json(res, 200, { ok: true, employee: { ...staff.view(u, prof, { full: true }), ...empView(u, prof, today), history: (prof.history || []).map((h) => ({ ...h, byName: h.byName || names[h.by] || '' })) },
          attendance: Object.fromEntries(Object.keys(ATTENDANCE).map((k) => [k, att.filter((a) => a.status === k).length])), credTypes: CRED_TYPES, departments: DEPARTMENTS, kycKinds: KYC_KINDS });
      }
      // credentials: qualifications, licences, certifications, training and compliance records
      if (parts[3] === 'credentials') {
        const list = prof.credentials || [];
        const read = () => {
          const errors = {};
          if (!CRED_TYPES[body.type]) errors.type = 'Choose the kind of record.';
          const name = clean(body.name, 120); if (name.length < 2) errors.name = 'Enter its name.';
          if (body.issuedOn && (!isDate(body.issuedOn) || body.issuedOn > today)) errors.issuedOn = 'Choose the date it was issued.';
          if (body.expiresOn && !isDate(body.expiresOn)) errors.expiresOn = 'Choose the expiry date.';
          if (isDate(body.issuedOn) && isDate(body.expiresOn) && body.expiresOn < body.issuedOn) errors.expiresOn = 'It cannot expire before it was issued.';
          return { errors, data: { type: body.type, name, number: clean(body.number, 60) || null, issuer: clean(body.issuer, 120) || null, issuedOn: isDate(body.issuedOn) ? body.issuedOn : null, expiresOn: isDate(body.expiresOn) ? body.expiresOn : null, note: clean(body.note, 200) || null } };
        };
        if (parts.length === 4 && req.method === 'POST') {
          const r = read(); if (Object.keys(r.errors).length) return fail(res, null, r.errors);
          const c = { id: uid(), ...r.data, addedBy: user.id, addedAt: now() };
          await docs.update('app_staff', prof.id, { credentials: [...list, c], updatedAt: now() });
          await audit(user.id, 'employee.credential.add', null, { employee: prof.employeeId, type: c.type });
          return json(res, 201, { ok: true, id: c.id });
        }
        const c = list.find((x) => x.id === parts[4]);
        if (!c) throw notFound();
        if (parts.length === 5 && req.method === 'PATCH') {
          const r = read(); if (Object.keys(r.errors).length) return fail(res, null, r.errors);
          const changed = { ...c, ...r.data, remindedSoon: r.data.expiresOn !== c.expiresOn ? null : c.remindedSoon || null, remindedExpired: r.data.expiresOn !== c.expiresOn ? null : c.remindedExpired || null, history: [...(c.history || []), { at: now(), by: user.id, from: { name: c.name, expiresOn: c.expiresOn } }] };
          await docs.update('app_staff', prof.id, { credentials: list.map((x) => (x.id === c.id ? changed : x)), updatedAt: now() });
          await audit(user.id, 'employee.credential.edit', null, { employee: prof.employeeId });
          return json(res, 200, { ok: true });
        }
        if (parts.length === 6 && parts[5] === 'withdraw' && req.method === 'POST') {
          await docs.update('app_staff', prof.id, { credentials: list.map((x) => (x.id === c.id ? { ...x, withdrawn: { at: now(), by: user.id, note: clean(body.note, 200) || null } } : x)), updatedAt: now() });
          await audit(user.id, 'employee.credential.withdraw', null, { employee: prof.employeeId });
          return json(res, 200, { ok: true });
        }
      }
    }
    if (p === 'hr/credentials' && req.method === 'GET') {
      const rows = [];
      for (const { user: u, prof } of await employees()) for (const c of prof.credentials || []) rows.push({ ...credView(c, today), userId: u.id, employeeName: u.name, employeeId: prof.employeeId, roleName: ROLE_NAMES[u.role] });
      const st = q(url, 'status'), type = q(url, 'type');
      return json(res, 200, { ok: true, types: CRED_TYPES, soonDays: EXPIRY_SOON, rows: rows.filter((c) => (!st || c.status === st) && (!type || c.type === type)).sort((a, b) => (a.expiresOn || '9999') < (b.expiresOn || '9999') ? -1 : 1),
        counts: { valid: rows.filter((c) => c.status === 'valid').length, expiring: rows.filter((c) => c.status === 'expiring').length, expired: rows.filter((c) => c.status === 'expired').length } });
    }
    // ---- attendance: marked by HR for each day; approved leave and nurses' visits shown beside it
    if (p === 'hr/attendance' && req.method === 'GET') {
      const date = isDate(q(url, 'date')) && q(url, 'date') <= today ? q(url, 'date') : today;
      const [list, att, visits] = await Promise.all([employees(), attendanceFor(date), docs.find('app_schedule', { date })]);
      const names = await namesFor(att.map((a) => a.markedBy));
      return json(res, 200, { ok: true, date, statuses: ATTENDANCE, rows: list.filter(({ prof, user: u }) => u.active && prof.status !== 'inactive' && (!prof.joinDate || prof.joinDate <= date)).map(({ user: u, prof }) => {
        const a = att.find((x) => x.userId === u.id);
        const lv = (prof.leave || []).find((l) => leaveCounts(l) && l.from <= date && date <= l.to);
        const mine = visits.filter((v) => v.nurseId === u.id);
        return { userId: u.id, name: u.name, employeeId: prof.employeeId, roleName: ROLE_NAMES[u.role], department: prof.department || '', status: a ? a.status : null, note: a ? a.note || null : null, markedBy: a ? names[a.markedBy] || '' : null,
          onLeave: lv ? LEAVE_TYPES[lv.type] || 'Leave' : null, visits: mine.length, visitsDone: mine.filter((v) => v.status === 'completed' || v.status === 'in_progress').length, suggested: a ? null : lv ? 'on_leave' : mine.some((v) => v.status === 'completed' || v.status === 'in_progress') ? 'present' : null };
      }).sort((a, b) => a.name.localeCompare(b.name)) });
    }
    if (p === 'hr/attendance' && req.method === 'POST') {
      const date = body.date;
      if (!isDate(date) || date > today) return fail(res, 'Choose today or an earlier day.', { date: 'Required' });
      const rows = Array.isArray(body.rows) ? body.rows.slice(0, 500) : [];
      const staffIds = new Set((await employees()).map((x) => x.user.id));
      let saved = 0;
      for (const r of rows) {
        if (!staffIds.has(String(r.userId)) || !ATTENDANCE[r.status]) continue;
        const id = 'att-' + r.userId + '-' + date;
        const cur = await docs.findOne('app_attendance', { id });
        const rec = { status: r.status, note: clean(r.note, 200) || null, markedBy: user.id, markedAt: now() };
        if (cur) { if (cur.status === rec.status && (cur.note || null) === rec.note) continue; await docs.update('app_attendance', id, { ...rec, history: [...(cur.history || []), { at: now(), by: user.id, from: cur.status, to: rec.status }] }); }
        else await docs.insert('app_attendance', { id, userId: String(r.userId), date, ...rec, history: [{ at: now(), by: user.id, to: rec.status }] });
        saved++;
      }
      await audit(user.id, 'attendance.mark', null, { date, rows: saved });
      return json(res, 200, { ok: true, saved });
    }
    if (p === 'hr/attendance/summary' && req.method === 'GET') {
      const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
      const [list, att] = await Promise.all([employees(), docs.find('app_attendance')]);
      const inMonth = att.filter((a) => month(a.date) === m);
      const first = m + '-01', last = (() => { const d = new Date(first + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); })();
      const upto = last < today ? last : today;
      return json(res, 200, { ok: true, month: m, statuses: ATTENDANCE, rows: list.filter(({ user: u }) => u.active).map(({ user: u, prof }) => {
        const mine = inMonth.filter((a) => a.userId === u.id);
        const counts = Object.fromEntries(Object.keys(ATTENDANCE).map((k) => [k, mine.filter((a) => a.status === k).length]));
        const leaveDays = (prof.leave || []).filter(leaveCounts).reduce((n, l) => n + overlapDays(l, first, upto), 0);
        return { userId: u.id, name: u.name, employeeId: prof.employeeId, roleName: ROLE_NAMES[u.role], counts, marked: mine.length, unmarked: upto >= first ? daysIn(first, upto).length - mine.length : 0, approvedLeaveDays: leaveDays };
      }).sort((a, b) => a.name.localeCompare(b.name)) });
    }
    // ---- leave balances: the yearly allowance HR sets, minus approved leave (Leave Record Management)
    if (p === 'hr/leave/balances' && req.method === 'GET') {
      const year = /^\d{4}$/.test(q(url, 'year')) ? q(url, 'year') : today.slice(0, 4);
      const allow = await leavePolicy();
      const list = await employees(); // every employee: nurses and the office team share one leave system
      return json(res, 200, { ok: true, year, types: LEAVE_TYPES, allowances: allow, policySet: Object.keys(allow).length > 0, rows: list.map(({ user: u, prof }) => {
        const leave = prof.leave || [];
        const by = Object.fromEntries(Object.keys(LEAVE_TYPES).map((t) => {
          const used = leave.filter((l) => leaveCounts(l) && (l.type || 'other') === t).reduce((n, l) => n + overlapDays(l, year + '-01-01', year + '-12-31'), 0);
          const pending = leave.filter((l) => l.status === 'pending' && (l.type || 'other') === t).reduce((n, l) => n + overlapDays(l, year + '-01-01', year + '-12-31'), 0);
          return [t, { used, pending, allowance: Number.isFinite(allow[t]) ? allow[t] : null, remaining: Number.isFinite(allow[t]) ? allow[t] - used : null }];
        }));
        return { userId: u.id, name: u.name, employeeId: prof.employeeId, active: u.active && prof.status !== 'inactive', types: by };
      }) });
    }
    if (p === 'hr/leave/policy' && req.method === 'POST') {
      const a = {};
      for (const t of Object.keys(LEAVE_TYPES)) { const v = body.allowances && body.allowances[t]; if (v !== '' && v != null) { const n = Number(v); if (!Number.isInteger(n) || n < 0 || n > 365) return fail(res, 'Enter whole days between 0 and 365.', { [t]: 'Invalid' }); a[t] = n; } }
      await saveSetting('hr-leave-policy', { allowances: a, updatedBy: user.id, updatedAt: now() });
      await audit(user.id, 'hr.leave.policy', null, { types: Object.keys(a) });
      return json(res, 200, { ok: true });
    }
    // ---- reports (CSV)
    if (parts[0] === 'hr' && parts[1] === 'reports' && parts.length === 3 && req.method === 'GET') {
      const kind = parts[2].replace(/\.csv$/, '');
      const list = await employees();
      if (kind === 'headcount') return sendReport(res, url, 'headcount-' + today, ['Employee ID', 'Name', 'Role', 'Department', 'Designation', 'Business unit', 'Location', 'Joined', 'Left', 'Status'],
        list.map(({ user: u, prof }) => { const v = empView(u, prof, today); return [v.employeeId, v.name, v.roleName, v.department, v.designation, v.businessUnitName, v.location, v.joinDate, v.exitDate || '', v.statusName]; }));
      if (kind === 'onboarding') return sendReport(res, url, 'onboarding-status-' + today, ['Employee ID', 'Name', 'Role', 'Status', 'Steps done', 'Missing'],
        list.map(({ user: u, prof }) => { const o = onboarding(u, prof, today); return [prof.employeeId, u.name, ROLE_NAMES[u.role], o.status === 'complete' ? 'Complete' : 'In progress', o.done + ' of ' + o.total, o.steps.filter((s) => !s.ok).map((s) => s.label).join('; ')]; }));
      if (kind === 'credentials') return sendReport(res, url, 'credentials-expiry-' + today, ['Employee ID', 'Name', 'Kind', 'Name of record', 'Number', 'Issued by', 'Issued on', 'Expires on', 'Days left', 'Status'],
        list.flatMap(({ user: u, prof }) => (prof.credentials || []).map((c) => credView(c, today)).map((c) => [prof.employeeId, u.name, c.typeName, c.name, c.number || '', c.issuer || '', c.issuedOn || '', c.expiresOn || 'No expiry', c.daysLeft == null ? '' : c.daysLeft, c.statusName])));
      if (kind === 'attendance') {
        const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
        const att = (await docs.find('app_attendance')).filter((a) => month(a.date) === m);
        return sendReport(res, url, 'attendance-' + m, ['Employee ID', 'Name', 'Role', ...Object.values(ATTENDANCE), 'Days marked'],
          list.map(({ user: u, prof }) => { const mine = att.filter((a) => a.userId === u.id); return [prof.employeeId, u.name, ROLE_NAMES[u.role], ...Object.keys(ATTENDANCE).map((k) => mine.filter((a) => a.status === k).length), mine.length]; }));
      }
      if (kind === 'leave') {
        const year = /^\d{4}$/.test(q(url, 'year')) ? q(url, 'year') : today.slice(0, 4);
        const rows = [];
        for (const { user: u, prof } of list) for (const l of prof.leave || []) if (overlapDays(l, year + '-01-01', year + '-12-31')) rows.push([prof.employeeId, u.name, LEAVE_TYPES[l.type] || l.type || 'Other', l.from, l.to, days(l.from, l.to) + 1, l.status || 'approved', l.reason || '']);
        return sendReport(res, url, 'leave-' + year, ['Employee ID', 'Name', 'Type', 'From', 'To', 'Days', 'Status', 'Reason'], rows);
      }
      throw notFound();
    }
    return undefined;
  }

  // ================================================================ Operations
  const nowHM = () => new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  // missed: the day has passed and the visit never started; delayed: today, more than 30 minutes past its start
  function visitFlags(v, today, hm) {
    const open = ACTIVE.includes(v.status) || v.status === 'awaiting_assignment';
    const missed = open && v.status !== 'in_progress' && v.date < today;
    const toMin = (s) => { const [h, m] = String(s || '').split(':').map(Number); return h * 60 + m; };
    const delayed = !missed && v.date === today && (v.status === 'assigned' || v.status === 'accepted' || v.status === 'awaiting_assignment') && toMin(v.start || SLOTS[v.slot] && SLOTS[v.slot].from) + 30 < toMin(hm);
    const rescheduled = (v.history || []).some((h) => h.action === 'rescheduled');
    return { missed, delayed, rescheduled };
  }
  async function visitRows(from, to) {
    const rows = await docs.find('app_schedule', { date: { $gte: from, $lte: to } }, { sort: { date: 1, start: 1 } });
    const names = await namesFor(rows.map((v) => v.nurseId));
    const contacts = await contactsOf(rows.map((v) => v.personId));
    const today = todayIST(), hm = nowHM();
    return rows.map((v) => ({ contact: v.personId ? contacts[v.personId] || null : null, id: v.id, reference: v.reference, date: v.date, slot: v.slot, slotName: SLOTS[v.slot] ? SLOTS[v.slot].name : v.slot, start: v.start || null, end: v.end || null, serviceName: v.serviceName, product: v.product,
      personId: v.personId || null, customerName: v.customerName || '', location: v.location || '', nurseId: v.nurseId || null, nurseName: names[v.nurseId] || null, status: v.status, statusName: VSTATUS[v.status],
      createdAt: v.createdAt, assignedAt: v.assignedAt || null, completedAt: v.completedAt || null, ...visitFlags(v, today, hm) }));
  }
  async function customerOps() {
    const today = todayIST();
    const rows = await office.customerRows();
    const [plans, onb] = await Promise.all([docs.find('app_plans'), docs.find('app_onboarding')]);
    const out = [];
    for (const c of rows.filter((x) => x.status === 'active' || x.status === 'paused' || x.status === 'pending')) {
      const done = onb.find((o) => o.id === 'onb-' + c.id);
      const el = c.status === 'active' && !done ? await lifecycle.eligibility(c.id) : null;
      const active = plans.filter((pl) => pl.personId === c.id && pl.status === 'active' && !pl.included);
      const since = active.map((pl) => pl.startDate || ymd(pl.createdAt)).filter(Boolean).sort()[0] || null;
      const stage = done ? 'onboarded' : c.status === 'pending' ? 'package' : el && el.eligible ? 'awaiting' : 'not_eligible';
      out.push({ id: c.id, name: c.name, status: c.status, packages: c.currentPackages, brands: c.brands, nurses: c.nurses, hasNurse: c.nurses.length > 0, stage,
        stageName: { onboarded: 'Onboarded', package: 'Package not active yet', awaiting: 'Waiting for onboarding', not_eligible: 'Not eligible yet' }[stage],
        reasons: el && !el.eligible ? el.reasons : [], since, waitingDays: stage === 'awaiting' && since ? days(since, today) : null, delayed: stage === 'awaiting' && since ? days(since, today) > ONBOARDING_LATE : false,
        onboardedAt: done ? ymd(done.createdAt || done.at) : null, onboardingDays: done && since ? Math.max(0, days(since, ymd(done.createdAt || done.at))) : null });
    }
    return out;
  }
  async function issueRows(url) {
    const rows = await docs.find('app_issues', {}, { sort: { createdAt: -1 } });
    const names = await namesFor(rows.flatMap((x) => [x.createdBy, x.assignedTo]));
    const st = q(url, 'status'), type = q(url, 'type'), text = q(url, 'q').toLowerCase();
    return rows.map((x) => ({ ...x, typeName: ISSUE_TYPES[x.type], statusName: ISSUE_STATUS[x.status], createdByName: names[x.createdBy] || '', assignedName: names[x.assignedTo] || null, ageDays: days(ymd(x.createdAt), todayIST()) }))
      .filter((x) => (!st || (st === 'open_all' ? x.status === 'open' || x.status === 'in_progress' : x.status === st)) && (!type || x.type === type) && (!text || [x.reference, x.title, x.customerName, x.detail].some((v) => String(v || '').toLowerCase().includes(text))));
  }
  async function capacity(from, to) {
    const list = (await scheduler.nurses()).filter((n) => n.user.active);
    const visits = (await docs.find('app_schedule', { date: { $gte: from, $lte: to } })).filter((v) => v.status !== 'cancelled');
    const set = await scheduler.settings();
    const holidays = new Set((set.holidays || []).map((h) => h.date));
    const conflicts = await scheduler.conflicts(from, to);
    const range = daysIn(from, to);
    const minutesOf = (slot) => (SLOTS[slot] ? (Number(SLOTS[slot].to.slice(0, 2)) - Number(SLOTS[slot].from.slice(0, 2))) * 60 : 0);
    const wd = (d) => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(d + 'T12:00:00Z').getUTCDay()];
    return list.map((n) => {
      const prof = n.profile || {}; const av = scheduler.profileDefaults(prof);
      const onLeave = (d) => (prof.leave || []).some((l) => leaveCounts(l) && l.from <= d && d <= l.to);
      let avail = 0, leaveDays = 0;
      for (const d of range) { if (holidays.has(d)) continue; if (onLeave(d)) { if ((av.days[wd(d)] || []).length) leaveDays++; continue; } for (const s of av.days[wd(d)] || []) avail += minutesOf(s); }
      const mine = visits.filter((v) => v.nurseId === n.user.id);
      const booked = mine.reduce((s, v) => s + (v.minutes || 60), 0);
      const nc = conflicts.filter((c) => mine.some((v) => v.id === c.visitId));
      return { id: n.user.id, name: n.user.name, active: prof.status !== 'inactive', workDays: Object.keys(av.days).filter((k) => (av.days[k] || []).length).length, availableMinutes: avail, bookedMinutes: booked,
        utilisation: avail ? Math.round((booked / avail) * 1000) / 10 : null, visits: mine.length, completed: mine.filter((v) => v.status === 'completed').length, upcoming: mine.filter((v) => v.date >= todayIST() && ACTIVE.includes(v.status)).length,
        leaveDays, onLeaveToday: onLeave(todayIST()), conflicts: nc.length, leaveConflicts: nc.filter((c) => c.kind === 'leave').length, conflictList: nc };
    });
  }
  async function opsOverview() {
    const today = todayIST();
    const [cust, vis, issues] = await Promise.all([customerOps(), visitRows(addDays(today, -30), addDays(today, 7)), docs.find('app_issues')]);
    const past30 = vis.filter((v) => v.date < today), todays = vis.filter((v) => v.date === today);
    const waiting = await docs.find('app_schedule', { status: 'awaiting_assignment' });
    return {
      kpis: {
        activeCustomers: cust.filter((c) => c.status === 'active').length, awaitingOnboarding: cust.filter((c) => c.stage === 'awaiting').length, delayedOnboarding: cust.filter((c) => c.delayed).length,
        awaitingNurse: cust.filter((c) => c.status === 'active' && !c.hasNurse).length, today: todays.filter((v) => v.status !== 'cancelled').length, todayDone: todays.filter((v) => v.status === 'completed').length,
        upcoming: vis.filter((v) => v.date > today && v.status !== 'cancelled').length, completed30: past30.filter((v) => v.status === 'completed').length, cancelled30: vis.filter((v) => v.date >= addDays(today, -30) && v.status === 'cancelled').length,
        rescheduled30: vis.filter((v) => v.rescheduled).length, unassigned: waiting.length, missed: vis.filter((v) => v.missed).length, delayed: vis.filter((v) => v.delayed).length,
        openIssues: issues.filter((x) => x.status === 'open' || x.status === 'in_progress').length,
        completionRate: past30.filter((v) => v.status !== 'cancelled').length ? Math.round((past30.filter((v) => v.status === 'completed').length / past30.filter((v) => v.status !== 'cancelled').length) * 1000) / 10 : null
      },
      today: todays, attention: vis.filter((v) => v.missed || v.delayed).slice(0, 12),
      todo: todo([
        { key: 'unassigned', label: 'Visits waiting for a nurse', count: waiting.length, href: '#/office/scheduler?status=awaiting_assignment', tone: 'bad' },
        { key: 'delayed', label: 'Visits running late right now', count: vis.filter((v) => v.delayed).length, href: '#/office/ops/visits?flag=delayed&from=' + today + '&to=' + today, tone: 'warn' },
        { key: 'missed', label: 'Missed visits to follow up', count: vis.filter((v) => v.missed).length, href: '#/office/ops/visits?flag=missed&from=' + addDays(today, -30) + '&to=' + today, tone: 'bad' },
        { key: 'onboarding', label: 'Customers waiting too long for onboarding', count: cust.filter((c) => c.delayed).length, href: '#/office/ops/onboarding?stage=delayed', tone: 'warn' },
        { key: 'nonurse', label: 'Active customers without a nurse', count: cust.filter((c) => c.status === 'active' && !c.hasNurse).length, href: '#/office/ops/onboarding?stage=no_nurse', tone: 'warn' },
        { key: 'issues', label: 'Open service issues', count: issues.filter((x) => x.status === 'open' || x.status === 'in_progress').length, href: '#/office/ops/quality?status=open_all', tone: '' }
      ].concat(await moreTodo('operations'))),
      daily: daysIn(addDays(today, -13), today).map((d) => ({ key: d, completed: vis.filter((v) => v.date === d && v.status === 'completed').length, missed: vis.filter((v) => v.date === d && v.missed).length, cancelled: vis.filter((v) => v.date === d && v.status === 'cancelled').length }))
    };
  }

  async function opsRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'ops/overview' && req.method === 'GET') return json(res, 200, { ok: true, ...(await opsOverview()) });
    if (p === 'ops/visits' && req.method === 'GET') {
      const from = isDate(q(url, 'from')) ? q(url, 'from') : addDays(today, -7), to = isDate(q(url, 'to')) && q(url, 'to') >= from ? q(url, 'to') : addDays(today, 7);
      if (days(from, to) > 366) return fail(res, 'Choose at most a year.');
      const st = q(url, 'status'), flag = q(url, 'flag'), nurse = q(url, 'nurse'), text = q(url, 'q').toLowerCase();
      let rows = await visitRows(from, to);
      rows = rows.filter((v) => (!st || v.status === st) && (!flag || v[flag] === true) && (!nurse || v.nurseId === nurse) && (!text || [v.reference, v.customerName, v.personId, v.serviceName].some((x) => String(x || '').toLowerCase().includes(text))));
      const nurses = (await scheduler.nurses()).map((n) => ({ id: n.user.id, name: n.user.name }));
      return json(res, 200, { ok: true, from, to, statuses: VSTATUS, nurses, ...paginate(rows, url),
        totals: { all: rows.length, completed: rows.filter((v) => v.status === 'completed').length, missed: rows.filter((v) => v.missed).length, delayed: rows.filter((v) => v.delayed).length, rescheduled: rows.filter((v) => v.rescheduled).length, cancelled: rows.filter((v) => v.status === 'cancelled').length } });
    }
    if (parts[0] === 'ops' && parts[1] === 'visits' && parts[3] === 'reschedule' && parts.length === 4 && req.method === 'POST') {
      const v = await docs.findOne('app_schedule', { id: parts[2] });
      if (!v) throw notFound();
      if (v.status === 'completed' || v.status === 'cancelled' || v.status === 'in_progress') return fail(res, 'A visit that is ' + VSTATUS[v.status].toLowerCase() + ' cannot be moved.');
      const errors = {};
      if (!isDate(body.date) || body.date < today) errors.date = 'Choose today or a later date.';
      if (!SLOTS[body.slot]) errors.slot = 'Choose morning or evening.';
      const note = clean(body.note, 200);
      if (note.length < 3) errors.note = 'Say why it is moved.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      if (body.date === v.date && body.slot === v.slot) return fail(res, 'Choose a different day or slot.', { date: 'Same as now' });
      // the visit goes back to waiting at its new time and is given to a free nurse by the same scheduler rules
      // (availability, approved leave, holidays, no overlaps)
      const before = { date: v.date, slot: v.slot, nurseId: v.nurseId || null };
      await docs.update('app_schedule', v.id, { date: body.date, slot: body.slot, nurseId: null, slotKey: null, start: null, end: null, status: 'awaiting_assignment', officeToldAt: null, updatedAt: now(),
        history: [...(v.history || []), { at: now(), by: user.id, byRole: user.role, action: 'rescheduled', note, from: before.date + ' ' + before.slot, to: body.date + ' ' + body.slot }] });
      if (before.nurseId) await scheduler.notify([before.nurseId], { kind: 'visit-removed', title: 'Visit moved', body: `${v.serviceName} for ${v.customerName} on ${before.date} was moved to ${body.date}.`, link: '#/nurse/visits?d=' + before.date });
      const keep = body.keepNurse && before.nurseId ? before.nurseId : null;
      let r = await scheduler.assign(v.id, { nurseId: keep, by: user.id, byRole: user.role, note: 'Rescheduled' });
      if (!r.ok && keep) r = await scheduler.assign(v.id, { by: user.id, byRole: user.role, note: 'Rescheduled' });
      await audit(user.id, 'visit.reschedule', v.personId || null, { visit: v.reference, to: body.date + ' ' + body.slot });
      return json(res, 200, { ok: true, assigned: r.ok, message: r.ok ? 'Moved and assigned.' : 'Moved. ' + (r.why || 'It waits for a nurse.') });
    }
    if (p === 'ops/capacity' && req.method === 'GET') {
      const [w0, w1] = scheduler.weekOf(today);
      const from = isDate(q(url, 'from')) ? q(url, 'from') : w0, to = isDate(q(url, 'to')) && q(url, 'to') >= from ? q(url, 'to') : w1;
      if (days(from, to) > 92) return fail(res, 'Choose at most three months.');
      const rows = await capacity(from, to);
      const visitIds = rows.flatMap((r) => r.conflictList.map((c) => c.visitId));
      const vis = visitIds.length ? await docs.find('app_schedule', { id: { $in: visitIds } }) : [];
      return json(res, 200, { ok: true, from, to, rows: rows.map((r) => ({ ...r, conflictList: r.conflictList.map((c) => { const v = vis.find((x) => x.id === c.visitId) || {}; return { ...c, reference: v.reference, date: v.date, slot: v.slot, customerName: v.customerName, serviceName: v.serviceName }; }) })),
        totals: { available: rows.reduce((s, r) => s + r.availableMinutes, 0), booked: rows.reduce((s, r) => s + r.bookedMinutes, 0), conflicts: rows.reduce((s, r) => s + r.conflicts, 0), leaveConflicts: rows.reduce((s, r) => s + r.leaveConflicts, 0) } });
    }
    if (p === 'ops/onboarding' && req.method === 'GET') {
      const rows = await customerOps();
      const st = q(url, 'stage');
      return json(res, 200, { ok: true, lateDays: ONBOARDING_LATE, rows: rows.filter((c) => (!st || (st === 'delayed' ? c.delayed : st === 'no_nurse' ? c.status === 'active' && !c.hasNurse : c.stage === st))).sort((a, b) => (b.waitingDays || 0) - (a.waitingDays || 0)),
        counts: { awaiting: rows.filter((c) => c.stage === 'awaiting').length, delayed: rows.filter((c) => c.delayed).length, onboarded: rows.filter((c) => c.stage === 'onboarded').length, notEligible: rows.filter((c) => c.stage === 'not_eligible').length, noNurse: rows.filter((c) => c.status === 'active' && !c.hasNurse).length } });
    }
    // ---- service quality: complaints, service exceptions, missed-visit follow-up, incidents, feedback
    if (p === 'ops/issues' && req.method === 'GET') {
      const all = await issueRows(url);
      const fb = (await docs.find('app_issues', { type: 'feedback' })).filter((x) => Number.isInteger(x.rating));
      const team = (await docs.find('app_users', { active: true })).filter((u) => u.role === 'admin' || u.role === 'operations').map((u) => ({ id: u.id, name: u.name }));
      return json(res, 200, { ok: true, types: ISSUE_TYPES, statuses: ISSUE_STATUS, team, ...paginate(all, url),
        counts: Object.fromEntries(Object.keys(ISSUE_STATUS).map((k) => [k, all.filter((x) => x.status === k).length])), byType: group(all, (x) => x.type, (k) => ISSUE_TYPES[k] || k),
        satisfaction: fb.length ? { responses: fb.length, average: Math.round((fb.reduce((s, x) => s + x.rating, 0) / fb.length) * 10) / 10, byRating: [5, 4, 3, 2, 1].map((n) => ({ key: String(n), label: n + ' star' + (n > 1 ? 's' : ''), value: fb.filter((x) => x.rating === n).length })) } : null });
    }
    if (p === 'ops/issues' && req.method === 'POST') {
      const errors = {};
      if (!ISSUE_TYPES[body.type]) errors.type = 'Choose the kind of issue.';
      const title = clean(body.title, 140); if (title.length < 3) errors.title = 'Describe it in a few words.';
      const rating = body.type === 'feedback' ? Number(body.rating) : null;
      if (body.type === 'feedback' && !(Number.isInteger(rating) && rating >= 1 && rating <= 5)) errors.rating = 'Choose the rating the customer gave (1 to 5).';
      let person = null, visit = null;
      if (body.personId) { person = await docs.findOne('app_people', { id: String(body.personId) }); if (!person) errors.personId = 'Customer not found.'; }
      if (body.visitId) { visit = await docs.findOne('app_schedule', { id: String(body.visitId) }); if (!visit) errors.visitId = 'Visit not found.'; else if (!person && visit.personId) person = await docs.findOne('app_people', { id: visit.personId }); }
      if (Object.keys(errors).length) return fail(res, null, errors);
      const x = { id: uid(), reference: store.makeReference('IS'), type: body.type, title, detail: clean(body.detail, 1000) || null, priority: ['low', 'normal', 'high'].includes(body.priority) ? body.priority : 'normal',
        personId: person ? person.id : null, customerName: person ? person.name : (visit && visit.customerName) || null, visitId: visit ? visit.id : null, visitRef: visit ? visit.reference : null, rating,
        status: body.type === 'feedback' ? 'closed' : 'open', assignedTo: null, createdBy: user.id, createdAt: now(), history: [{ at: now(), by: user.id, action: 'opened' }] };
      await docs.insert('app_issues', x);
      await audit(user.id, 'issue.add', x.personId, { issue: x.reference, type: x.type });
      return json(res, 201, { ok: true, id: x.id, reference: x.reference });
    }
    if (parts[0] === 'ops' && parts[1] === 'issues' && parts[2] && parts.length === 3 && req.method === 'PATCH') {
      const x = await docs.findOne('app_issues', { id: parts[2] });
      if (!x) throw notFound();
      const ch = {}; const note = clean(body.note, 500);
      if (body.status !== undefined) { if (!ISSUE_STATUS[body.status]) return fail(res, 'Choose a status.'); ch.status = body.status; if (body.status === 'resolved' || body.status === 'closed') { if (note.length < 3) return fail(res, 'Say how it was resolved.', { note: 'Required' }); ch.resolvedAt = now(); } }
      if (body.assignedTo !== undefined) { const u = body.assignedTo ? await docs.findOne('app_users', { id: String(body.assignedTo) }) : null; if (body.assignedTo && (!u || !['admin', 'operations'].includes(u.role))) return fail(res, 'Choose a team member.'); ch.assignedTo = u ? u.id : null; }
      if (!Object.keys(ch).length && !note) return fail(res, 'Nothing to save.');
      await docs.update('app_issues', x.id, { ...ch, updatedAt: now(), history: [...(x.history || []), { at: now(), by: user.id, action: ch.status ? 'status' : ch.assignedTo !== undefined ? 'assigned' : 'note', to: ch.status || null, note: note || null }] });
      if (ch.assignedTo && ch.assignedTo !== user.id) await scheduler.notify([ch.assignedTo], { kind: 'issue-assigned', title: 'Service issue assigned to you', body: `${x.reference}: ${x.title}`, link: '#/office/ops/quality' });
      await audit(user.id, 'issue.update', x.personId, { issue: x.reference, status: ch.status || null });
      return json(res, 200, { ok: true });
    }
    if (parts[0] === 'ops' && parts[1] === 'reports' && parts.length === 3 && req.method === 'GET') {
      const kind = parts[2].replace(/\.csv$/, '');
      const from = isDate(q(url, 'from')) ? q(url, 'from') : addDays(today, -30), to = isDate(q(url, 'to')) ? q(url, 'to') : today;
      if (kind === 'visits' || kind === 'missed-cancelled') {
        const rows = (await visitRows(from, to)).filter((v) => kind === 'visits' || v.missed || v.status === 'cancelled');
        return sendReport(res, url, kind + '-' + from + '-to-' + to, ['Reference', 'Date', 'Slot', 'Start', 'Service', 'Customer', 'Customer ID', 'Nurse', 'Status', 'Missed', 'Rescheduled', 'Booked', 'Assigned', 'Completed'],
          rows.map((v) => [v.reference, v.date, v.slotName, v.start || '', v.serviceName, v.customerName, v.personId || '', v.nurseName || '', v.statusName, v.missed ? 'Yes' : '', v.rescheduled ? 'Yes' : '', ymd(v.createdAt), v.assignedAt || '', v.completedAt || '']));
      }
      if (kind === 'summary') {
        const rows = await visitRows(from, to);
        const done = rows.filter((v) => v.status !== 'cancelled' && v.date < today);
        const assignedH = rows.filter((v) => v.assignedAt && v.createdAt).map((v) => (Date.parse(v.assignedAt) - Date.parse(v.createdAt)) / 3600000).filter((h) => h >= 0).sort((a, b) => a - b);
        const cust = await customerOps();
        const onb = cust.filter((c) => c.onboardingDays != null).map((c) => c.onboardingDays).sort((a, b) => a - b);
        const med = (a) => (a.length ? Math.round(a[Math.floor(a.length / 2)] * 10) / 10 : '');
        return sendReport(res, url, 'operations-summary-' + from + '-to-' + to, ['Measure', 'Value'], [
          ['Period', from + ' to ' + to], ['Visits', rows.length], ['Completed', rows.filter((v) => v.status === 'completed').length], ['Visit completion rate (%)', done.length ? Math.round((done.filter((v) => v.status === 'completed').length / done.length) * 1000) / 10 : ''],
          ['Missed', rows.filter((v) => v.missed).length], ['Cancelled', rows.filter((v) => v.status === 'cancelled').length], ['Rescheduled', rows.filter((v) => v.rescheduled).length],
          ['Assigned automatically or by the office', assignedH.length], ['Median hours from booking to assignment', med(assignedH)],
          ['Customers onboarded (all time)', onb.length], ['Median days from package start to onboarding', med(onb)], ['Customers waiting for onboarding now', cust.filter((c) => c.stage === 'awaiting').length], ['Of which delayed (over ' + ONBOARDING_LATE + ' days)', cust.filter((c) => c.delayed).length]]);
      }
      if (kind === 'utilisation') {
        const rows = await capacity(from, to);
        return sendReport(res, url, 'nurse-utilisation-' + from + '-to-' + to, ['Nurse', 'Available hours', 'Booked hours', 'Utilisation (%)', 'Visits', 'Completed', 'Leave days', 'Conflicts'], rows.map((r) => [r.name, Math.round(r.availableMinutes / 6) / 10, Math.round(r.bookedMinutes / 6) / 10, r.utilisation == null ? '' : r.utilisation, r.visits, r.completed, r.leaveDays, r.conflicts]));
      }
      if (kind === 'onboarding') {
        const rows = await customerOps();
        return sendReport(res, url, 'customer-onboarding-' + today, ['Customer ID', 'Name', 'Packages', 'Stage', 'Package active since', 'Days waiting', 'Delayed', 'Onboarded on', 'Nurse assigned', 'Why not eligible'], rows.map((c) => [c.id, c.name, c.packages.join('; '), c.stageName, c.since || '', c.waitingDays == null ? '' : c.waitingDays, c.delayed ? 'Yes' : '', c.onboardedAt || '', c.hasNurse ? c.nurses.map((n) => n.name).join('; ') : 'No', c.reasons.join(' ')]));
      }
      if (kind === 'issues') {
        const rows = await issueRows(url);
        return sendReport(res, url, 'service-issues-' + today, ['Reference', 'Opened', 'Kind', 'Title', 'Customer', 'Visit', 'Priority', 'Status', 'Assigned to', 'Rating'], rows.map((x) => [x.reference, ymd(x.createdAt), x.typeName, x.title, x.customerName || '', x.visitRef || '', x.priority, x.statusName, x.assignedName || '', x.rating || '']));
      }
      throw notFound();
    }
    return undefined;
  }

  // ================================================================ Sales
  async function priceIndex() { const all = await packinfo.all(); return Object.fromEntries(all.map((p) => [p.id, p])); }
  function expected(l, packs) {
    if (Number.isFinite(l.expectedValue)) return { value: l.expectedValue, from: 'entered' };
    const pk = l.package && packs[l.package];
    if (!pk) return { value: null, from: null };
    const pr = packinfo.priceOf(pk, l.expectedMonths || undefined);
    return pr.amount ? { value: pr.amount, from: 'price' } : { value: null, from: 'quote' };
  }
  async function salesLeads(url, user) {
    const [all, packs, orders] = await Promise.all([office.leadRows(), priceIndex(), docs.find('app_orders')]);
    const today = todayIST();
    const rows = office.filterLeads(all, url).filter((l) => !q(url, 'mine') || l.assignedTo === user.id).map((l) => {
      const ex = expected(l, packs);
      const order = l.orderId ? orders.find((o) => o.id === l.orderId) : null;
      return { ...l, expected: ex.value, expectedFrom: ex.from, open: !['converted', 'lost'].includes(l.status),
        followUp: l.followUpAt ? (ymd(l.followUpAt) < today ? 'overdue' : ymd(l.followUpAt) === today ? 'today' : 'upcoming') : null,
        purchase: order && order.status === 'paid' ? { reference: order.reference, amount: order.amount, at: (order.payment && order.payment.verifiedAt) || order.updatedAt || order.createdAt } : null,
        contacts: (l.history || []).filter((h) => h.action === 'contact').length, lastContactAt: ((l.history || []).filter((h) => h.action === 'contact').pop() || {}).at || null };
    });
    return rows;
  }

  async function salesRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'sales/overview' && req.method === 'GET') {
      const rows = await salesLeads(url, user);
      const count = (s) => rows.filter((l) => l.status === s).length;
      const from = isDate(q(url, 'from')) ? q(url, 'from') : null;
      const months = from ? (() => { const out = []; let m = from.slice(0, 7); const end = (isDate(q(url, 'to')) ? q(url, 'to') : today).slice(0, 7); while (out.length < 60) { out.push(m); if (m >= end) break; const d = new Date(m + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); m = d.toISOString().slice(0, 7); } return out; })() : monthsBack(today, 12);
      const stages = ['new', 'contacted', 'follow_up', 'converted'];
      const reached = (l, s) => (s === 'new' ? true : l.status === 'lost' ? (l.history || []).some((h) => h.to === s || (s === 'contacted' && h.action === 'contact')) : stages.indexOf(l.status) >= stages.indexOf(s));
      const purchases = rows.filter((l) => l.purchase || l.status === 'converted');
      return json(res, 200, { ok: true, statuses: LEAD_STATUS, sources: SOURCES,
        kpis: { total: rows.length, new: count('new'), contacted: count('contacted'), qualified: count('follow_up'), converted: count('converted'), lost: count('lost'),
          conversion: rows.length ? Math.round((count('converted') / rows.length) * 1000) / 10 : 0,
          pipeline: rows.filter((l) => l.open && l.expected).reduce((s, l) => s + l.expected, 0), pipelineLeads: rows.filter((l) => l.open && l.expected).length, unpriced: rows.filter((l) => l.open && l.expectedFrom === 'quote').length,
          overdue: rows.filter((l) => l.open && l.followUp === 'overdue').length, dueToday: rows.filter((l) => l.open && l.followUp === 'today').length, upcoming: rows.filter((l) => l.open && l.followUp === 'upcoming').length,
          purchases: rows.filter((l) => l.purchase).length, purchaseValue: rows.filter((l) => l.purchase).reduce((s, l) => s + (l.purchase.amount || 0), 0), unassigned: rows.filter((l) => l.open && !l.assignedTo).length },
        bySource: group(rows, (l) => l.sourceName), byPackage: group(rows, (l) => l.package, (k) => (k === 'none' ? 'Not chosen' : planName(k))),
        stageConversion: stages.map((s, i) => { const n = rows.filter((l) => reached(l, s)).length, prev = i ? rows.filter((l) => reached(l, stages[i - 1])).length : n; return { key: s, label: LEAD_STATUS[s], value: n, rate: prev ? Math.round((n / prev) * 1000) / 10 : 0 }; }),
        monthly: months.map((m) => ({ key: m, leads: rows.filter((l) => month(l.createdAt) === m).length, converted: rows.filter((l) => l.status === 'converted' && month((l.history || []).filter((h) => h.to === 'converted').map((h) => h.at).pop() || l.createdAt) === m).length, purchases: rows.filter((l) => l.purchase && month(l.purchase.at) === m).length })),
        packageTrend: (() => { const top = group(rows.filter((l) => l.package), (l) => l.package).slice(0, 4).map((x) => x.key); return { packages: top.map((k) => ({ key: k, label: planName(k) })), months: months.map((m) => ({ key: m, values: top.map((k) => rows.filter((l) => l.package === k && month(l.createdAt) === m).length) })) }; })(),
        byMember: group(rows.filter((l) => l.assignedTo), (l) => l.assignedTo, (k) => (rows.find((l) => l.assignedTo === k) || {}).assignedName || 'Team member').map((x) => ({ ...x, converted: rows.filter((l) => l.assignedTo === x.key && l.status === 'converted').length })),
        recentPurchases: purchases.filter((l) => l.purchase).sort((a, b) => (a.purchase.at < b.purchase.at ? 1 : -1)).slice(0, 6).map((l) => ({ name: l.name, packageName: l.packageName, amount: l.purchase.amount, at: l.purchase.at, reference: l.purchase.reference })),
        todo: todo([
          { key: 'overdue', label: 'Follow-ups overdue', count: rows.filter((l) => l.open && l.followUp === 'overdue' && (!l.assignedTo || l.assignedTo === user.id || user.role === 'admin')).length, href: '#/office/sales/followups', tone: 'bad' },
          { key: 'today', label: 'Follow-ups due today', count: rows.filter((l) => l.open && l.followUp === 'today' && (!l.assignedTo || l.assignedTo === user.id || user.role === 'admin')).length, href: '#/office/sales/followups', tone: 'warn' },
          { key: 'new', label: 'New leads not contacted yet', count: rows.filter((l) => l.status === 'new').length, href: '#/office/leads/list?status=new', tone: 'warn' },
          { key: 'nofollow', label: 'Open leads without a follow-up date', count: rows.filter((l) => l.open && !l.followUpAt && l.status !== 'new').length, href: '#/office/sales/followups', tone: '' }
        ].concat(await moreTodo('sales'))),
        note: 'Expected values come from the published package prices (or the amount a team member entered); packages priced on call are not counted until a value is entered. A purchase is counted only when its payment is verified.' });
    }
    // a lead from a phone call, walk-in, referral or event: added to the same enquiry database as the websites'
    if (p === 'sales/leads' && req.method === 'POST') {
      const errors = {};
      const name = clean(body.name, 80); if (name.length < 2) errors.name = 'Enter the name.';
      const phone = body.phone ? normalisePhone(body.phone) : null; if (body.phone && !phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'This email address looks incomplete.';
      if (!phone && !email) errors.phone = 'Enter a mobile number or email so the lead can be contacted.';
      const source = ['phone', 'walk-in', 'referral', 'event', 'admin'].includes(body.source) ? body.source : 'phone';
      const pk = body.package ? await packinfo.byId(String(body.package)) : null;
      if (body.package && !pk) errors.package = 'Choose a package.';
      let followUpAt = null;
      if (body.followUpAt) { if (!isDate(String(body.followUpAt).slice(0, 10)) || String(body.followUpAt).slice(0, 10) < today) errors.followUpAt = 'Choose today or a later date.'; else followUpAt = String(body.followUpAt).slice(0, 16); }
      if (Object.keys(errors).length) return fail(res, null, errors);
      const note = clean(body.note, 500);
      const at = now();
      const rec = await store.add('enquiries', 'KQ', { name, phone, email: email || '', interest: pk ? pk.product : 'kareiq', interestName: pk ? pk.name : 'Enquiry', package: pk ? pk.id : 'undecided', message: note, source, kind: 'enquiry', careForName: clean(body.careFor, 80) || null,
        createdAt: at, assignedTo: user.id, assignedAt: at, leadStatus: note ? 'contacted' : 'new', status: note ? 'contacted' : 'new', followUpAt, nextAction: clean(body.nextAction, 200) || null, addedBy: user.id,
        leadHistory: [{ at, by: user.name, byId: user.id, action: 'added', note: 'Added by ' + user.name + ' (' + (SOURCES[source] || source) + ')' }].concat(note ? [{ at, by: user.name, byId: user.id, action: 'contact', channel: source === 'walk-in' ? 'meeting' : 'call', outcome: null, note }] : []) });
      await audit(user.id, 'lead.add', null, { lead: rec.reference, source });
      return json(res, 201, { ok: true, id: rec.id, reference: rec.reference });
    }
    if (p === 'sales/followups' && req.method === 'GET') {
      const rows = (await salesLeads(url, user)).filter((l) => l.open);
      const view = (l) => ({ type: l.type, id: l.id, enquiryId: l.enquiryId, name: l.name, phone: l.phone, title: l.title, packageName: l.packageName, statusName: l.statusName, assignedName: l.assignedName, followUpAt: l.followUpAt, nextAction: l.nextAction, lastContactAt: l.lastContactAt, contacts: l.contacts, expected: l.expected });
      const by = (a, b) => (a.followUpAt < b.followUpAt ? -1 : 1);
      return json(res, 200, { ok: true, overdue: rows.filter((l) => l.followUp === 'overdue').sort(by).map(view), today: rows.filter((l) => l.followUp === 'today').map(view), upcoming: rows.filter((l) => l.followUp === 'upcoming').sort(by).slice(0, 50).map(view),
        none: rows.filter((l) => !l.followUp).slice(0, 50).map(view), kinds: CONTACT_KINDS });
    }
    // contact history, notes, next action, follow-up date, package interest and expected value
    if (parts[0] === 'sales' && parts[1] === 'leads' && ['booking', 'enquiry'].includes(parts[2]) && parts[3] && parts[4] === 'activity' && parts.length === 5 && req.method === 'POST') {
      const col = parts[2] === 'booking' ? 'bookings' : 'enquiries';
      const raw = (await store.readAll(col)).find((r) => r.id === parts[3]);
      if (!raw) throw notFound();
      const errors = {}, ch = {};
      const kind = CONTACT_KINDS[body.kind] ? body.kind : null;
      const note = clean(body.note, 500), outcome = clean(body.outcome, 120);
      if (body.followUpAt !== undefined && body.followUpAt !== '' && body.followUpAt !== null) { if (!isDate(String(body.followUpAt).slice(0, 10)) || String(body.followUpAt).slice(0, 10) < today) errors.followUpAt = 'Choose today or a later date.'; else ch.followUpAt = String(body.followUpAt).slice(0, 16); }
      if (body.followUpAt === '' || body.followUpAt === null) ch.followUpAt = null;
      if (body.nextAction !== undefined) ch.nextAction = clean(body.nextAction, 200) || null;
      if (body.expectedValue !== undefined) { if (body.expectedValue === '' || body.expectedValue === null) ch.expectedValue = null; else { const v = Math.round(Number(String(body.expectedValue).replace(/[^0-9.]/g, ''))); if (!(v > 0)) errors.expectedValue = 'Enter an amount, or leave it empty.'; else ch.expectedValue = v; } }
      if (body.package !== undefined) { if (body.package && !(await packinfo.byId(String(body.package)))) errors.package = 'Choose a package.'; else ch.package = body.package || 'undecided'; }
      if (body.months !== undefined && body.months !== '') ch.expectedMonths = Number(body.months) || null;
      if (!kind && !Object.keys(ch).length) errors.kind = 'Record a contact, or change the follow-up.';
      if (kind && !note && !outcome) errors.note = 'Write what was discussed.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      const entries = [];
      if (kind) entries.push({ at: now(), by: user.name, byId: user.id, action: 'contact', channel: kind, outcome: outcome || null, note: note || null });
      if (Object.keys(ch).length) entries.push({ at: now(), by: user.name, byId: user.id, action: 'plan', note: [ch.followUpAt !== undefined ? 'Follow-up ' + (ch.followUpAt ? ch.followUpAt.replace('T', ' ') : 'cleared') : '', ch.nextAction ? 'Next: ' + ch.nextAction : '', ch.package ? 'Interested in ' + (ch.package === 'undecided' ? 'no package yet' : planName(ch.package)) : '', ch.expectedValue !== undefined ? 'Expected value ' + (ch.expectedValue ? care.fmt(ch.expectedValue) : 'cleared') : ''].filter(Boolean).join(' · ') });
      // a first contact moves a new lead to Contacted; nothing here can approve, convert or take a payment
      const status = kind && (raw.leadStatus || 'new') === 'new' ? { leadStatus: 'contacted', status: 'contacted' } : {};
      if (ch.followUpAt !== undefined) ch.followUpReminded = null;
      await store.update(col, raw.id, { ...ch, ...status, leadHistory: [...(raw.leadHistory || []), ...entries] });
      await audit(user.id, 'lead.activity', raw.personId || null, { lead: raw.reference, kind: kind || 'plan' });
      return json(res, 200, { ok: true });
    }
    if (p === 'sales/packages' && req.method === 'GET') {
      const [packs, rows] = await Promise.all([packinfo.all(), salesLeads(url, user)]);
      return json(res, 200, { ok: true, rows: packs.map((pk) => {
        const mine = rows.filter((l) => l.package === pk.id);
        const pr = packinfo.priceOf(pk);
        return { id: pk.id, name: pk.name, product: pk.product, productName: PRODUCTS[pk.product] ? PRODUCTS[pk.product].name : pk.product, group: pk.group, type: pk.type, tagline: pk.tagline, model: pk.model,
          price: pr.amount || null, priceText: pk.model === 'quote' ? 'Priced on call' : pk.model === 'fixed' ? care.fmt(pk.price) + ' ' + (pk.length || '') : pk.prices ? 'From ' + care.fmt(Math.min(...Object.values(pk.prices).map((x) => x.perMonth))) + ' a month' : '',
          enquiries: mine.length, open: mine.filter((l) => l.open).length, converted: mine.filter((l) => l.status === 'converted').length, purchases: mine.filter((l) => l.purchase).length };
      }) });
    }
    if (parts[0] === 'sales' && parts[1] === 'reports' && parts.length === 3 && req.method === 'GET') {
      const kind = parts[2].replace(/\.csv$/, '');
      const rows = await salesLeads(url, user);
      if (kind === 'leads') return sendReport(res, url, 'leads-' + today, ['Enquiry ID', 'Received', 'Name', 'Phone', 'Email', 'Source', 'Package', 'Status', 'Assigned to', 'Follow-up', 'Next action', 'Expected value (INR)', 'Contacts'],
        rows.map((l) => [l.enquiryId, ymd(l.createdAt), l.name, l.phone, l.email, l.sourceName, l.packageName || 'Not chosen', l.statusName, l.assignedName || '', l.followUpAt || '', l.nextAction || '', l.expected || '', l.contacts]));
      if (kind === 'daily' || kind === 'monthly') {
        const key = kind === 'daily' ? ymd : month;
        const keys = [...new Set(rows.map((l) => key(l.createdAt)))].sort().reverse();
        return sendReport(res, url, kind + '-leads-' + today, [kind === 'daily' ? 'Day' : 'Month', 'Leads', 'Contacted', 'Follow-up', 'Converted', 'Lost'], keys.map((k) => { const m = rows.filter((l) => key(l.createdAt) === k); return [k, m.length, m.filter((l) => l.status === 'contacted').length, m.filter((l) => l.status === 'follow_up').length, m.filter((l) => l.status === 'converted').length, m.filter((l) => l.status === 'lost').length]; }));
      }
      if (kind === 'conversions') return sendReport(res, url, 'conversions-' + today, ['Enquiry ID', 'Name', 'Package', 'Source', 'Assigned to', 'Received', 'Order', 'Paid amount (INR)', 'Paid on'],
        rows.filter((l) => l.status === 'converted' || l.purchase).map((l) => [l.enquiryId, l.name, l.packageName, l.sourceName, l.assignedName || '', ymd(l.createdAt), l.purchase ? l.purchase.reference : '', l.purchase ? l.purchase.amount : '', l.purchase ? ymd(l.purchase.at) : '']));
      if (kind === 'followups') return sendReport(res, url, 'follow-ups-' + today, ['Enquiry ID', 'Name', 'Phone', 'Status', 'Follow-up', 'State', 'Next action', 'Assigned to', 'Last contact'],
        rows.filter((l) => l.open && l.followUpAt).sort((a, b) => (a.followUpAt < b.followUpAt ? -1 : 1)).map((l) => [l.enquiryId, l.name, l.phone, l.statusName, l.followUpAt, l.followUp, l.nextAction || '', l.assignedName || '', l.lastContactAt ? ymd(l.lastContactAt) : '']));
      if (kind === 'packages') { const g = group(rows, (l) => l.package, (k) => (k === 'none' ? 'Not chosen' : planName(k))); return sendReport(res, url, 'package-enquiries-' + today, ['Package', 'Enquiries', 'Converted', 'Paid purchases'], g.map((x) => [x.label, x.value, rows.filter((l) => (l.package || 'none') === x.key && l.status === 'converted').length, rows.filter((l) => (l.package || 'none') === x.key && l.purchase).length])); }
      if (kind === 'pipeline') return sendReport(res, url, 'pipeline-' + today, ['Enquiry ID', 'Name', 'Status', 'Package', 'Expected value (INR)', 'Value from', 'Assigned to', 'Follow-up'],
        rows.filter((l) => l.open).map((l) => [l.enquiryId, l.name, l.statusName, l.packageName || 'Not chosen', l.expected || '', l.expectedFrom === 'entered' ? 'Entered' : l.expectedFrom === 'price' ? 'Published price' : l.expectedFrom === 'quote' ? 'Priced on call' : '', l.assignedName || '', l.followUpAt || '']));
      throw notFound();
    }
    return undefined;
  }

  // ================================================================ reminders (hourly)
  async function remind() {
    const today = todayIST();
    // credentials: once when within the expiry window, once when expired (HR, the office and the employee)
    const hr = await usersWithRole('hr', 'admin');
    for (const { user: u, prof } of await employees()) {
      let changed = false;
      const list = (prof.credentials || []).map((c) => {
        const st = credStatus(c, today);
        if (st === 'expiring' && !c.remindedSoon) { changed = true; return { ...c, remindedSoon: now(), _n: 'soon' }; }
        if (st === 'expired' && !c.remindedExpired) { changed = true; return { ...c, remindedExpired: now(), _n: 'expired' }; }
        return c;
      });
      if (!changed) continue;
      for (const c of list.filter((x) => x._n)) {
        const body = `${u.name}: ${c.name} ${c._n === 'expired' ? 'expired on' : 'expires on'} ${c.expiresOn}.`;
        await scheduler.notify(hr, { kind: 'credential-expiry', title: c._n === 'expired' ? 'Credential expired' : 'Credential expiring soon', body, link: '#/office/hr/credentials' });
        if (u.active && u.role !== 'hr') await scheduler.notify([u.id], { kind: 'credential-expiry', title: c._n === 'expired' ? 'Your credential has expired' : 'Your credential expires soon', body: `${c.name} ${c._n === 'expired' ? 'expired on' : 'expires on'} ${c.expiresOn}. Please share the renewed document with HR.`, link: '#/account' });
      }
      await docs.update('app_staff', prof.id, { credentials: list.map(({ _n, ...c }) => c) });
    }
    // lead follow-ups: the assigned team member (or the sales team when nobody is) once on the day it is due
    const sales = await usersWithRole('sales', 'admin');
    for (const col of ['bookings', 'enquiries']) {
      for (const r of await store.readAll(col)) {
        if (!r.followUpAt || ymd(r.followUpAt) > today || r.followUpReminded === r.followUpAt || ['converted', 'lost'].includes(r.leadStatus)) continue;
        await scheduler.notify(r.assignedTo ? [r.assignedTo] : sales, { kind: 'lead-followup', title: ymd(r.followUpAt) < today ? 'Follow-up overdue' : 'Follow-up due today', body: `${r.name || 'A lead'} (${r.reference})${r.nextAction ? ': ' + r.nextAction : ''}`, link: '#/office/sales/followups' });
        await store.update(col, r.id, { followUpReminded: r.followUpAt });
      }
    }
  }

  async function handle(req, res, parts, url, user, body) {
    if (parts[0] === 'fin') return financeRoute(req, res, parts, url, user, body);
    if (parts[0] === 'hr') return hrRoute(req, res, parts, url, user, body);
    if (parts[0] === 'ops') return opsRoute(req, res, parts, url, user, body);
    if (parts[0] === 'sales') return salesRoute(req, res, parts, url, user, body);
    return undefined;
  }
  return { handle, remind, financeOverview, opsOverview };
}

module.exports = { create, sendReport, EXPENSE_CATEGORIES, RECON_STATUS, CRED_TYPES, ATTENDANCE, ISSUE_TYPES, CONTACT_KINDS, statementRows, csvCell };
