// The last round for the team dashboards (office API fin/*, hr/*, ops/*, sales/*; access in src/app/access.js):
//   Finance     package renewals, the accounts export (journal CSV and Tally XML), vendor bills (payables)
//   HR          salary structures and payslips, the exit checklist, recruitment, probation and reviews
//   Operations  nurse suggestions for visits that need a nurse, supplies with low-stock alerts, actual visit times
//   Sales       the pipeline board, renewal leads (made automatically), message templates, commission
// Every figure is worked out from stored records. Anything that is a business rule (salary, deductions,
// commission rate, reorder levels) is entered by the team and shown as "not set" until it is.
const { planName } = require('./products');
const packinfo = require('./packinfo');
const care = require('./care');
const { SLOTS, STATUS: VSTATUS } = require('./scheduler');
const { BRAND_NAMES } = require('./finance');
const { DEPARTMENTS } = require('./staff');
const { LEAD_STATUS } = require('./office');

const ymd = (s) => String(s || '').slice(0, 10);
const month = (s) => String(s || '').slice(0, 7);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isMonth = (s) => /^\d{4}-\d{2}$/.test(s || '');
const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const lastDay = (m) => { const d = new Date(m + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
const r2 = (n) => Math.round(n * 100) / 100;
const toMin = (hm) => { const [h, m] = String(hm || '').split(':').map(Number); return h * 60 + m; };
// minutes past midnight in India for a stored ISO time
const istMin = (iso) => { const d = new Date(Date.parse(iso) + 330 * 60000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const istDay = (iso) => new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 10);

const STAFF_ROLES = ['admin', 'caregiver', 'finance', 'hr', 'operations', 'sales'];
const ROLE_NAMES = { admin: 'Office admin', caregiver: 'Nurse / caregiver', finance: 'Finance Manager', hr: 'HR', operations: 'Operations Manager', sales: 'Sales Executive' };
const RENEW_DAYS = 30; // a package ending within this many days is due for renewal
const BILL_STATUS = { unpaid: 'Unpaid', partial: 'Part paid', paid: 'Paid', cancelled: 'Cancelled' };
const PAY_METHODS = { bank: 'Bank transfer', upi: 'UPI', cheque: 'Cheque', cash: 'Cash', card: 'Card' };
// salary: earnings are monthly amounts (pro-rated for days not paid); deductions are fixed monthly amounts HR enters
const EARNINGS = { basic: 'Basic', hra: 'House rent allowance', conveyance: 'Conveyance', special: 'Special allowance', other: 'Other allowance' };
const DEDUCTIONS = { pf: 'Provident fund (employee)', esi: 'ESI (employee)', pt: 'Professional tax', tds: 'Income tax (TDS)', other: 'Other deduction' };
const EXIT_REASONS = { resigned: 'Resigned', contract_end: 'Contract ended', terminated: 'Terminated', retired: 'Retired', other: 'Other' };
const EXIT_STEPS = [
  ['notice', 'Resignation or notice recorded'],
  ['handover', 'Work and patients handed over'],
  ['assets', 'ID card, uniform and equipment returned'],
  ['login', 'Login switched off'],
  ['settlement', 'Full and final settlement paid'],
  ['letter', 'Relieving and experience letter issued']
];
const CANDIDATE_STAGES = { applied: 'Applied', screening: 'Screening', interview: 'Interview', offered: 'Offer made', joined: 'Joined', rejected: 'Not selected', withdrawn: 'Withdrew' };
const CANDIDATE_SOURCES = { referral: 'Referral', jobportal: 'Job portal', walkin: 'Walk-in', agency: 'Agency', website: 'Website', other: 'Other' };
const PROBATION = { on: 'On probation', confirmed: 'Confirmed', extended: 'Probation extended', none: 'No probation' };
const SUPPLY_CATS = { consumable: 'Consumables', device: 'Devices and equipment', ppe: 'Protective equipment', medicine: 'Medicines', other: 'Other' };
const MOVE_KINDS = { received: 'Received', issued: 'Issued', adjusted: 'Stock count correction' };
const TEMPLATE_CHANNELS = { whatsapp: 'WhatsApp', email: 'Email', sms: 'SMS' };
const PLACEHOLDERS = ['name', 'package', 'price', 'agent', 'enquiryId', 'company'];

function create(ctx) {
  const { docs, uid, now, todayIST, json, notFound, clean, audit, store, scheduler, staff, finance, namesFor, office, auth, welcomeLink, normalisePhone } = ctx;
  const q = (url, k) => (url.searchParams.get(k) || '').trim();
  const fail = (res, message, errors) => json(res, 400, { ok: false, message: message || 'Please check the highlighted fields.', errors });
  const money = (s) => Math.round(Number(String(s == null ? '' : s).replace(/[^0-9.]/g, '')) * 100) / 100;
  const hasMoney = (s) => s !== '' && s != null && /\d/.test(String(s));
  async function setting(id) { return (await docs.findOne('app_settings', { id })) || {}; }
  async function saveSetting(id, data) { if (await docs.findOne('app_settings', { id })) await docs.update('app_settings', id, data); else await docs.insert('app_settings', { id, ...data }); }
  async function usersWithRole(...roles) { return (await docs.find('app_users', { active: true })).filter((u) => roles.includes(u.role)).map((u) => u.id); }
  const { sendReport } = require('./teams');

  // ================================================================ Finance
  // ---- renewals: active packages whose period ends soon (or ended in the last week), with no newer package after them
  async function renewals(windowDays) {
    const today = todayIST(), until = addDays(today, windowDays || RENEW_DAYS), since = addDays(today, -7);
    const plans = await docs.find('app_plans');
    const ending = plans.filter((p) => !p.included && p.planId && p.endDate && ['active', 'ended'].includes(p.status) && p.endDate >= since && p.endDate <= until)
      .filter((p) => !plans.some((n) => n.id !== p.id && n.personId === p.personId && n.product === p.product && n.status !== 'cancelled' && ((n.startDate && n.startDate > p.startDate) || (!n.startDate && n.createdAt > p.createdAt))));
    if (!ending.length) return [];
    const ids = [...new Set(ending.map((p) => p.personId))];
    const [ppl, inv, leads, contacts] = await Promise.all([docs.find('app_people', { id: { $in: ids } }), finance.invoices(), office.leadRows(), contactsOf(ids)]);
    return ending.map((p) => {
      const i = inv.find((x) => x.planId === p.id) || {};
      const lead = leads.find((l) => l.renewalOf === p.id) || leads.find((l) => l.source === 'renewal' && l.personId === p.personId && l.package === p.planId && l.status !== 'lost');
      return { planId: p.id, personId: p.personId, customer: (ppl.find((x) => x.id === p.personId) || {}).name || p.personId, product: p.product, brandName: BRAND_NAMES[i.brand] || '', packageId: p.planId, packageName: planName(p.planId),
        startDate: p.startDate, endDate: p.endDate, daysLeft: days(today, p.endDate), months: p.months || null, lastAmount: i.amount || 0, outstanding: i.outstanding || 0, invoiceNo: i.number || null,
        contact: contacts[p.personId] || null, lead: lead ? { type: lead.type, id: lead.id, enquiryId: lead.enquiryId, statusName: lead.statusName, status: lead.status, assignedName: lead.assignedName } : null };
    }).sort((a, b) => (a.endDate < b.endDate ? -1 : 1));
  }
  async function contactsOf(ids) {
    if (!ids.length) return {};
    const [links, dets] = await Promise.all([docs.find('app_links', { personId: { $in: ids }, kind: 'family' }), docs.find('app_details', { id: { $in: ids.map((x) => 'det-' + x) } })]);
    const users = links.length ? await docs.find('app_users', { id: { $in: links.map((l) => l.userId) } }) : [];
    const out = {};
    for (const id of ids) {
      const fam = links.filter((l) => l.personId === id).map((l) => users.find((u) => u.id === l.userId)).filter(Boolean);
      const det = dets.find((d) => d.id === 'det-' + id), f = fam.find((u) => u.phone) || fam[0];
      out[id] = { name: f ? f.name : null, phone: (f && f.phone) || (det && det.data && det.data.phone1) || null, email: (f && f.email) || (det && det.data && det.data.email) || null };
    }
    return out;
  }

  // ---- vendor bills (what KareIQ owes its suppliers)
  function billView(b, today) {
    const paid = (b.payments || []).reduce((s, x) => s + x.amount, 0), due = r2(Math.max(0, b.amount - paid));
    const status = b.cancelled ? 'cancelled' : due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
    return { ...b, paid: r2(paid), due, status, statusName: BILL_STATUS[status], overdueDays: status !== 'paid' && status !== 'cancelled' && b.dueDate < today ? days(b.dueDate, today) : 0 };
  }
  async function bills() { const today = todayIST(); return (await docs.find('app_bills', {}, { sort: { dueDate: 1 } })).map((b) => billView(b, today)); }

  // ---- the accounts export: every money movement as a double-entry voucher (ledger names match the KareIQ records)
  async function vouchers(from, to) {
    const cats = require('./teams').EXPENSE_CATEGORIES;
    const [inv, pays, cns, exps, bl] = await Promise.all([finance.invoices(), docs.find('app_payments'), docs.find('app_credit_notes'), docs.find('app_expenses'), bills()]);
    const ids = [...new Set(inv.map((i) => i.personId))];
    const ppl = ids.length ? await docs.find('app_people', { id: { $in: ids } }) : [];
    const cust = (pid) => ((ppl.find((p) => p.id === pid) || {}).name || pid) + ' (' + pid + ')';
    const bank = (m) => (m === 'cash' ? 'Cash' : 'Bank');
    const sales = (brand) => 'Sales - ' + (BRAND_NAMES[brand] || 'KareIQ');
    const inRange = (d) => d >= from && d <= to;
    const out = [];
    const add = (date, type, no, dr, cr, amount, narration) => { if (amount > 0 && inRange(date)) out.push({ date, type, no, lines: [{ ledger: dr, dr: r2(amount), cr: 0 }, { ledger: cr, dr: 0, cr: r2(amount) }], narration }); };
    for (const i of inv) if (i.status !== 'quote' && i.amount > 0) add(i.date, 'Sales', i.number, cust(i.personId), sales(i.brand), i.amount, i.packageName + (i.period ? ', ' + i.period.from + ' to ' + i.period.to : ''));
    for (const p of pays) {
      const i = inv.find((x) => x.planId === p.planId) || {};
      if (p.kind === 'refund') add(ymd(p.receivedAt), 'Payment', p.ref || p.id.slice(0, 8), cust(p.personId), bank(p.method), p.amount, 'Refund on ' + (i.number || '') + (p.reason ? ': ' + p.reason : ''));
      else add(ymd(p.receivedAt), 'Receipt', p.ref || p.id.slice(0, 8), bank(p.method), cust(p.personId), p.amount, 'Payment on ' + (i.number || '') + ' by ' + (p.method || 'payment'));
    }
    for (const c of cns) add(c.date, 'Credit Note', c.number, sales(c.brand), cust(c.personId), c.amount, 'On ' + c.invoiceNo + ': ' + c.reason);
    for (const x of exps) if (x.status === 'approved' || x.status === 'paid') {
      add(x.date, 'Journal', x.reference || x.id.slice(0, 8), (cats[x.category] || 'Other') + ' expenses', x.vendor ? 'Creditor - ' + x.vendor : 'Expenses payable', x.amount, (x.description || x.vendor || 'Expense'));
      if (x.status === 'paid' && x.paidAt) add(ymd(x.paidAt), 'Payment', x.paymentRef || x.reference, x.vendor ? 'Creditor - ' + x.vendor : 'Expenses payable', 'Bank', x.amount, 'Paid: ' + (x.description || x.vendor || 'expense'));
    }
    for (const b of bl) if (b.status !== 'cancelled') {
      add(b.date, 'Purchase', b.billNo, (cats[b.category] || 'Other') + ' expenses', 'Creditor - ' + b.vendor, b.amount, b.description || 'Bill ' + b.billNo);
      for (const p of b.payments || []) add(p.date, 'Payment', p.ref || b.billNo, 'Creditor - ' + b.vendor, bank(p.method), p.amount, 'Bill ' + b.billNo + ' ' + b.vendor);
    }
    return out.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }
  const xmlEsc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/[^\x09\x0A\x0D\x20-퟿-�]/g, '');
  function tallyXml(list) {
    // Tally's XML import: a debit is ISDEEMEDPOSITIVE Yes with a negative amount; a credit is No with a positive amount
    const v = list.map((x) => '<TALLYMESSAGE xmlns:UDF="TallyUDF"><VOUCHER VCHTYPE="' + xmlEsc(x.type) + '" ACTION="Create"><DATE>' + x.date.replace(/-/g, '') + '</DATE><VOUCHERTYPENAME>' + xmlEsc(x.type) + '</VOUCHERTYPENAME><VOUCHERNUMBER>' + xmlEsc(x.no) + '</VOUCHERNUMBER><NARRATION>' + xmlEsc(x.narration) + '</NARRATION>' +
      x.lines.map((l) => '<ALLLEDGERENTRIES.LIST><LEDGERNAME>' + xmlEsc(l.ledger) + '</LEDGERNAME><ISDEEMEDPOSITIVE>' + (l.dr ? 'Yes' : 'No') + '</ISDEEMEDPOSITIVE><AMOUNT>' + (l.dr ? (-l.dr).toFixed(2) : l.cr.toFixed(2)) + '</AMOUNT></ALLLEDGERENTRIES.LIST>').join('') + '</VOUCHER></TALLYMESSAGE>').join('\n');
    return '<?xml version="1.0" encoding="UTF-8"?>\n<ENVELOPE><HEADER><TALLYREQUEST>Import Data</TALLYREQUEST></HEADER><BODY><IMPORTDATA><REQUESTDESC><REPORTNAME>Vouchers</REPORTNAME></REQUESTDESC><REQUESTDATA>\n' + v + '\n</REQUESTDATA></IMPORTDATA></BODY></ENVELOPE>\n';
  }

  async function financeRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'fin/renewals' && req.method === 'GET') {
      const w = Math.min(120, Math.max(7, Number(q(url, 'days')) || RENEW_DAYS));
      const rows = await renewals(w);
      return json(res, 200, { ok: true, days: w, rows, totals: { count: rows.length, value: rows.reduce((s, r) => s + r.lastAmount, 0), ended: rows.filter((r) => r.daysLeft < 0).length, withLead: rows.filter((r) => r.lead).length } });
    }
    if (p === 'fin/bills' && req.method === 'GET') {
      const st = q(url, 'status');
      const rows = (await bills()).filter((b) => (!st ? b.status !== 'cancelled' : st === 'overdue' ? b.overdueDays > 0 : b.status === st));
      const all = await bills(), open = all.filter((b) => b.status === 'unpaid' || b.status === 'partial');
      return json(res, 200, { ok: true, rows, statuses: BILL_STATUS, methods: PAY_METHODS, categories: require('./teams').EXPENSE_CATEGORIES,
        totals: { owed: r2(open.reduce((s, b) => s + b.due, 0)), overdue: r2(open.filter((b) => b.overdueDays > 0).reduce((s, b) => s + b.due, 0)), overdueCount: open.filter((b) => b.overdueDays > 0).length, dueWeek: r2(open.filter((b) => b.dueDate >= today && b.dueDate <= addDays(today, 7)).reduce((s, b) => s + b.due, 0)), open: open.length },
        vendors: [...new Set(all.map((b) => b.vendor))].sort() });
    }
    if (p === 'fin/bills' && req.method === 'POST') {
      const cats = require('./teams').EXPENSE_CATEGORIES;
      const errors = {};
      const vendor = clean(body.vendor, 80); if (vendor.length < 2) errors.vendor = 'Enter the supplier.';
      const billNo = clean(body.billNo, 40); if (!billNo) errors.billNo = 'Enter the bill number on the supplier\'s bill.';
      const amount = money(body.amount); if (!(amount > 0)) errors.amount = 'Enter the bill amount.';
      if (!isDate(body.date) || body.date > today) errors.date = 'Choose the bill date (not in the future).';
      if (!isDate(body.dueDate)) errors.dueDate = 'Choose when it must be paid.'; else if (isDate(body.date) && body.dueDate < body.date) errors.dueDate = 'The due date cannot be before the bill date.';
      if (!cats[body.category]) errors.category = 'Choose a category.';
      if (!errors.billNo && (await docs.find('app_bills', { vendor })).some((b) => !b.cancelled && b.billNo.toLowerCase() === billNo.toLowerCase())) errors.billNo = 'This supplier\'s bill ' + billNo + ' is already recorded.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      const b = { id: uid(), vendor, billNo, amount, date: body.date, dueDate: body.dueDate, category: body.category, description: clean(body.description, 300) || null, payments: [], createdBy: user.id, createdByName: user.name, createdAt: now() };
      await docs.insert('app_bills', b);
      await audit(user.id, 'finance.bill', null, { vendor, bill: billNo, amount });
      return json(res, 201, { ok: true, id: b.id });
    }
    if (parts[0] === 'fin' && parts[1] === 'bills' && parts[2] && parts.length === 4 && req.method === 'POST') {
      const b = await docs.findOne('app_bills', { id: parts[2] });
      if (!b) throw notFound();
      const v = billView(b, today);
      if (parts[3] === 'pay') {
        if (v.status === 'cancelled' || v.status === 'paid') return fail(res, 'This bill is ' + v.statusName.toLowerCase() + '.');
        const errors = {};
        const amount = money(body.amount); if (!(amount > 0)) errors.amount = 'Enter the amount paid.'; else if (amount > v.due + 0.001) errors.amount = 'At most ' + care.fmt(v.due) + ' is still owed.';
        const date = isDate(body.date) && body.date <= today ? body.date : null; if (!date) errors.date = 'Choose the payment date (not in the future).';
        if (!PAY_METHODS[body.method]) errors.method = 'Choose how it was paid.';
        if (Object.keys(errors).length) return fail(res, null, errors);
        await docs.update('app_bills', b.id, { payments: [...(b.payments || []), { id: uid(), amount, date, method: body.method, ref: clean(body.ref, 60) || null, by: user.id, byName: user.name, at: now() }] });
        await audit(user.id, 'finance.bill.pay', null, { bill: b.billNo, vendor: b.vendor, amount });
        return json(res, 200, { ok: true });
      }
      if (parts[3] === 'cancel') {
        if ((b.payments || []).length) return fail(res, 'A bill with payments cannot be cancelled.');
        const reason = clean(body.reason, 200); if (reason.length < 3) return fail(res, null, { reason: 'Say why the bill is cancelled.' });
        await docs.update('app_bills', b.id, { cancelled: { at: now(), by: user.id, reason } });
        await audit(user.id, 'finance.bill.cancel', null, { bill: b.billNo, vendor: b.vendor });
        return json(res, 200, { ok: true });
      }
    }
    if (p === 'fin/export' && req.method === 'GET') {
      const from = isDate(q(url, 'from')) ? q(url, 'from') : today.slice(0, 7) + '-01', to = isDate(q(url, 'to')) ? q(url, 'to') : today;
      if (to < from) return fail(res, 'The end date is before the start date.');
      const list = await vouchers(from, to);
      const fmt = q(url, 'format');
      await audit(user.id, 'finance.export', null, { from, to, format: fmt || 'summary', vouchers: list.length });
      if (fmt === 'tally') {
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8', 'Content-Disposition': 'attachment; filename="kareiq-tally-' + from + '-to-' + to + '.xml"', 'Cache-Control': 'no-store' });
        return res.end(tallyXml(list));
      }
      if (fmt === 'csv' || fmt === 'pdf') {
        const rows = list.flatMap((v) => v.lines.map((l, i) => [v.date, v.type, v.no, l.ledger, l.dr || '', l.cr || '', i === 0 ? v.narration : '']));
        if (fmt === 'pdf') url.searchParams.set('format', 'pdf'); else url.searchParams.delete('format');
        return sendReport(res, url, 'accounts-journal-' + from + '-to-' + to, ['Date', 'Voucher type', 'Voucher no', 'Ledger', 'Debit (INR)', 'Credit (INR)', 'Narration'], rows);
      }
      const byType = {};
      list.forEach((v) => { byType[v.type] = byType[v.type] || { type: v.type, count: 0, amount: 0 }; byType[v.type].count++; byType[v.type].amount = r2(byType[v.type].amount + v.lines[0].dr); });
      const ledgers = [...new Set(list.flatMap((v) => v.lines.map((l) => l.ledger)))].sort();
      return json(res, 200, { ok: true, from, to, count: list.length, byType: Object.values(byType), ledgers, sample: list.slice(0, 8) });
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
  function salaryOf(prof) {
    const s = prof.salary || null;
    if (!s) return null;
    const gross = r2(Object.keys(EARNINGS).reduce((n, k) => n + (s.earnings[k] || 0), 0)), ded = r2(Object.keys(DEDUCTIONS).reduce((n, k) => n + (s.deductions[k] || 0), 0));
    return { ...s, gross, deductionsTotal: ded, net: r2(gross - ded) };
  }
  // a payslip for one month: earnings pro-rated for days not paid (loss of pay), deductions as HR set them
  function payslipFor(inputs, prof, m, lopOverride) {
    const s = salaryOf(prof);
    if (!s) return null;
    const dim = Number(lastDay(m).slice(8));
    const notEmployed = dim - inputs.daysInPeriod; // joined or left during the month
    const lopAuto = r2(inputs.unpaidLeave + inputs.absent + inputs.halfDay * 0.5);
    const lop = lopOverride != null ? lopOverride : lopAuto;
    const paidDays = r2(Math.max(0, dim - notEmployed - lop));
    const f = paidDays / dim;
    const earnings = Object.keys(EARNINGS).filter((k) => s.earnings[k]).map((k) => ({ key: k, label: EARNINGS[k], full: s.earnings[k], amount: r2(s.earnings[k] * f) }));
    const deductions = Object.keys(DEDUCTIONS).filter((k) => s.deductions[k]).map((k) => ({ key: k, label: DEDUCTIONS[k], amount: s.deductions[k] }));
    const gross = r2(earnings.reduce((n, x) => n + x.amount, 0)), ded = r2(deductions.reduce((n, x) => n + x.amount, 0));
    return { month: m, daysInMonth: dim, notEmployed, lopAuto, lop, paidDays, earnings, deductions, gross, deductionsTotal: ded, net: r2(Math.max(0, gross - ded)), bank: s.bank || null, pan: s.pan || null, uan: s.uan || null };
  }
  async function payslipRows(m) {
    const inputs = await ctx.plus.payroll(m);
    const list = await employees();
    const issued = await docs.find('app_payslips', { month: m });
    return inputs.map((i) => {
      const emp = list.find((x) => x.user.id === i.userId);
      const slip = issued.find((x) => x.userId === i.userId && !x.withdrawn);
      return { userId: i.userId, employeeId: i.employeeId, name: i.name, roleName: i.roleName, designation: i.designation, inputs: i, salarySet: Boolean(emp && emp.prof.salary),
        draft: emp ? payslipFor(i, emp.prof, m) : null, issued: slip ? { id: slip.id, number: slip.number, net: slip.slip.net, gross: slip.slip.gross, deductionsTotal: slip.slip.deductionsTotal, lop: slip.slip.lop, issuedAt: slip.issuedAt, byName: slip.byName } : null };
    });
  }
  async function payslipPdf(rec) {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const pg = doc.addPage([595, 842]);
    const t = (s) => String(s == null ? '' : s).replace(/₹/g, 'Rs. ').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '');
    const rs = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let y = 790;
    const line = (txt, x, size, f, col) => pg.drawText(t(txt), { x, y, size: size || 10, font: f || font, color: col || rgb(0.1, 0.1, 0.12) });
    const right = (txt, xr, size, f) => { const w = (f || font).widthOfTextAtSize(t(txt), size || 10); pg.drawText(t(txt), { x: xr - w, y, size: size || 10, font: f || font }); };
    line('KareIQ', 40, 20, bold, rgb(0.05, 0.47, 0.42)); right('Payslip', 555, 16, bold); y -= 20;
    const [yy, mm] = rec.month.split('-');
    line('Pay period: ' + ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'][Number(mm) - 1] + ' ' + yy, 40, 10); right('No. ' + rec.number, 555, 10); y -= 28;
    pg.drawLine({ start: { x: 40, y: y + 12 }, end: { x: 555, y: y + 12 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) });
    const s = rec.slip, e = rec.employee;
    const info = [['Employee', e.name], ['Employee ID', e.employeeId], ['Designation', e.designation || e.roleName], ['Department', e.department || '-'], ['Date of joining', e.joinDate || '-'], ['PAN', s.pan || '-'], ['UAN', s.uan || '-'], ['Bank account', s.bank || '-'],
      ['Days in month', s.daysInMonth], ['Loss of pay days', s.lop], ['Paid days', s.paidDays]];
    info.forEach((r, i) => { const col = i % 2, x = col ? 310 : 40; if (!col && i) y -= 16; pg.drawText(t(r[0]), { x, y, size: 9, font, color: rgb(0.4, 0.4, 0.45) }); pg.drawText(t(r[1]), { x: x + 95, y, size: 9.5, font: bold }); });
    y -= 34;
    line('Earnings', 40, 11, bold); right('Amount', 290, 11, bold); line('Deductions', 310, 11, bold); right('Amount', 555, 11, bold); y -= 6;
    pg.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) }); y -= 16;
    const n = Math.max(s.earnings.length, s.deductions.length, 1);
    for (let i = 0; i < n; i++) {
      const a = s.earnings[i], d = s.deductions[i];
      if (a) { line(a.label, 40, 10); right(rs(a.amount), 290); }
      if (d) { line(d.label, 310, 10); right(rs(d.amount), 555); }
      y -= 16;
    }
    pg.drawLine({ start: { x: 40, y: y + 8 }, end: { x: 555, y: y + 8 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) }); y -= 8;
    line('Gross earnings', 40, 10, bold); right(rs(s.gross), 290, 10, bold); line('Total deductions', 310, 10, bold); right(rs(s.deductionsTotal), 555, 10, bold); y -= 30;
    pg.drawRectangle({ x: 40, y: y - 8, width: 515, height: 28, color: rgb(0.92, 0.97, 0.96) });
    line('Net pay', 52, 13, bold); right(rs(s.net), 543, 13, bold); y -= 44;
    if (s.notEmployed) { line('Joined or left during the month: ' + s.notEmployed + ' day(s) of the month were outside employment and are not paid.', 40, 8.5); y -= 14; }
    line('Earnings are the monthly salary set by HR, reduced in proportion to loss-of-pay days. Deductions are as set by HR.', 40, 8.5); y -= 13;
    line('Issued ' + ymd(rec.issuedAt) + ' by ' + rec.byName + '. This is a computer-generated payslip and needs no signature.', 40, 8.5);
    return Buffer.from(await doc.save());
  }
  function sendFile(res, buf, type, name) { res.writeHead(200, { 'Content-Type': type, 'Content-Disposition': 'attachment; filename="' + name + '"', 'Cache-Control': 'no-store' }); res.end(buf); }
  function exitView(u, prof, today) {
    const x = prof.exit || null;
    if (!x) return null;
    const steps = EXIT_STEPS.map(([k, label]) => { const d = (x.steps || {})[k]; return { key: k, label, done: Boolean(d), at: d ? d.at : null, byName: d ? d.byName : null, note: d ? d.note : null }; });
    const done = steps.filter((s) => s.done).length;
    return { userId: u.id, name: u.name, roleName: ROLE_NAMES[u.role], employeeId: prof.employeeId, exitDate: prof.exitDate || x.exitDate, reason: x.reason, reasonName: EXIT_REASONS[x.reason] || 'Other', note: x.note || null, startedAt: x.startedAt, steps, done, total: steps.length,
      complete: done === steps.length, loginActive: u.active, left: (prof.exitDate || x.exitDate) <= today };
  }
  function reviewState(u, prof, today) {
    const pr = prof.probation || null;
    const reviews = (prof.reviews || []).slice().sort((a, b) => (a.date < b.date ? 1 : -1));
    const last = reviews[0] || null;
    const base = last ? last.date : prof.joinDate || ymd(u.createdAt);
    const reviewDue = addDays(base, 365);
    return { userId: u.id, name: u.name, roleName: ROLE_NAMES[u.role], employeeId: prof.employeeId, joinDate: prof.joinDate || null, designation: prof.designation || '',
      probation: pr ? { ...pr, statusName: PROBATION[pr.status] || '', endingSoon: pr.status !== 'confirmed' && pr.status !== 'none' && pr.endDate && pr.endDate <= addDays(today, 14), overdue: pr.status !== 'confirmed' && pr.status !== 'none' && pr.endDate && pr.endDate < today } : null,
      lastReview: last, reviews, reviewDue, reviewOverdue: reviewDue < today };
  }
  async function hrRoute(req, res, parts, url, user, body, rawReq) {
    const p = parts.join('/');
    const today = todayIST();
    // ---- salary structures (HR and the office admin only; never shown to other teams)
    if (p === 'hr/salaries' && req.method === 'GET') {
      const list = (await employees()).filter((x) => x.user.active || x.prof.salary);
      return json(res, 200, { ok: true, earnings: EARNINGS, deductions: DEDUCTIONS, rows: list.map(({ user: u, prof }) => ({ userId: u.id, employeeId: prof.employeeId, name: u.name, roleName: ROLE_NAMES[u.role], designation: prof.designation || '', active: u.active, salary: salaryOf(prof) })) });
    }
    if (parts[0] === 'hr' && parts[1] === 'salaries' && parts[2] && parts.length === 3 && req.method === 'POST') {
      const u = await docs.findOne('app_users', { id: parts[2] });
      if (!u || !STAFF_ROLES.includes(u.role)) throw notFound();
      const prof = await staff.profileOf(u.id);
      const errors = {}, earnings = {}, deductions = {};
      for (const k of Object.keys(EARNINGS)) { const v = body.earnings && body.earnings[k]; if (!hasMoney(v)) continue; const n = money(v); if (!(n >= 0)) errors['e_' + k] = 'Invalid'; else if (n) earnings[k] = n; }
      for (const k of Object.keys(DEDUCTIONS)) { const v = body.deductions && body.deductions[k]; if (!hasMoney(v)) continue; const n = money(v); if (!(n >= 0)) errors['d_' + k] = 'Invalid'; else if (n) deductions[k] = n; }
      if (!Object.keys(earnings).length) errors.e_basic = 'Enter at least the basic salary.';
      const gross = Object.values(earnings).reduce((s, n) => s + n, 0), ded = Object.values(deductions).reduce((s, n) => s + n, 0);
      if (!errors.e_basic && ded > gross) errors.d_other = 'Deductions are more than the salary.';
      const pan = clean(body.pan, 10).toUpperCase(); if (pan && !/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) errors.pan = 'A PAN looks like ABCDE1234F.';
      const uan = clean(body.uan, 12); if (uan && !/^\d{12}$/.test(uan)) errors.uan = 'A UAN has 12 digits.';
      if (!isDate(body.effectiveFrom)) errors.effectiveFrom = 'Choose the date this salary applies from.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      const acct = clean(body.bank, 60);
      const s = { earnings, deductions, pan: pan || null, uan: uan || null, bank: acct ? acct.replace(/\d(?=\d{4})/g, 'x') : (prof.salary && prof.salary.bank) || null, effectiveFrom: body.effectiveFrom, updatedBy: user.id, updatedByName: user.name, updatedAt: now() };
      await docs.update('app_staff', prof.id, { salary: s, salaryHistory: [...(prof.salaryHistory || []), ...(prof.salary ? [prof.salary] : [])] });
      await audit(user.id, 'hr.salary', null, { employee: prof.employeeId });
      return json(res, 200, { ok: true });
    }
    // ---- payslips
    if (p === 'hr/payslips' && req.method === 'GET') {
      const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
      const rows = await payslipRows(m);
      return json(res, 200, { ok: true, month: m, rows, totals: { net: r2(rows.filter((r) => r.issued).reduce((s, r) => s + r.issued.net, 0)), draftNet: r2(rows.filter((r) => !r.issued && r.draft).reduce((s, r) => s + r.draft.net, 0)), issued: rows.filter((r) => r.issued).length, noSalary: rows.filter((r) => !r.salarySet).length } });
    }
    if (p === 'hr/payslips/issue' && req.method === 'POST') {
      const m = isMonth(body.month) ? body.month : null;
      if (!m) return fail(res, 'Choose the month.');
      if (m > today.slice(0, 7)) return fail(res, 'Payslips can be issued for this month or earlier.');
      const rows = await payslipRows(m), list = await employees();
      const want = Array.isArray(body.userIds) && body.userIds.length ? body.userIds.map(String) : rows.filter((r) => r.salarySet && !r.issued).map((r) => r.userId);
      const lops = body.lop || {};
      const done = [];
      for (const id of want) {
        const r = rows.find((x) => x.userId === id), emp = list.find((x) => x.user.id === id);
        if (!r || !emp || !emp.prof.salary || r.issued) continue;
        const ov = lops[id] !== '' && lops[id] != null && Number(lops[id]) >= 0 ? Math.min(31, r2(Number(lops[id]))) : null;
        const slip = payslipFor(r.inputs, emp.prof, m, ov);
        const rec = { id: uid(), number: store.makeReference('PS'), userId: id, month: m, slip, employee: { name: emp.user.name, employeeId: emp.prof.employeeId, designation: emp.prof.designation || '', roleName: ROLE_NAMES[emp.user.role], department: emp.prof.department || '', joinDate: emp.prof.joinDate || '' }, issuedAt: now(), by: user.id, byName: user.name };
        await docs.insert('app_payslips', rec);
        done.push(id);
      }
      if (done.length) await scheduler.notify(done, { kind: 'payslip', title: 'Your payslip is ready', body: 'Your payslip for ' + m + ' is ready to download.', link: '#/me' });
      await audit(user.id, 'hr.payslips', null, { month: m, count: done.length });
      return json(res, 200, { ok: true, issued: done.length });
    }
    if (parts[0] === 'hr' && parts[1] === 'payslips' && parts[2] && parts[3] === 'pdf' && req.method === 'GET') {
      const rec = await docs.findOne('app_payslips', { id: parts[2] });
      if (!rec) throw notFound();
      return sendFile(res, await payslipPdf(rec), 'application/pdf', 'payslip-' + rec.employee.employeeId + '-' + rec.month + '.pdf');
    }
    if (parts[0] === 'hr' && parts[1] === 'payslips' && parts[2] && parts[3] === 'withdraw' && req.method === 'POST') {
      const rec = await docs.findOne('app_payslips', { id: parts[2] });
      if (!rec || rec.withdrawn) throw notFound();
      const reason = clean(body.reason, 200); if (reason.length < 3) return fail(res, null, { reason: 'Say why it is withdrawn (for example, a corrected payslip follows).' });
      await docs.update('app_payslips', rec.id, { withdrawn: { at: now(), by: user.id, reason } });
      await audit(user.id, 'hr.payslip.withdraw', null, { number: rec.number });
      return json(res, 200, { ok: true });
    }
    // ---- exit checklist
    if (p === 'hr/exits' && req.method === 'GET') {
      const rows = (await employees()).map(({ user: u, prof }) => exitView(u, prof, today)).filter(Boolean).sort((a, b) => (a.complete - b.complete) || (a.exitDate < b.exitDate ? -1 : 1));
      return json(res, 200, { ok: true, rows, steps: EXIT_STEPS.map(([k, l]) => ({ key: k, label: l })), reasons: EXIT_REASONS,
        employees: (await employees()).filter((x) => x.user.active && !x.prof.exit && x.user.id !== user.id && x.user.role !== 'admin').map((x) => ({ id: x.user.id, name: x.user.name, roleName: ROLE_NAMES[x.user.role] })) });
    }
    if (parts[0] === 'hr' && parts[1] === 'exits' && parts[2] && req.method === 'POST') {
      const u = await docs.findOne('app_users', { id: parts[2] });
      if (!u || !STAFF_ROLES.includes(u.role)) throw notFound();
      if (u.role === 'admin') return fail(res, 'The office admin\'s own login is managed by the office admin.');
      if (u.id === user.id) return fail(res, 'Your own exit is handled by the office admin or another HR person.');
      const prof = await staff.profileOf(u.id);
      if (parts.length === 3) { // start
        const errors = {};
        if (prof.exit) return fail(res, 'An exit is already in progress for ' + u.name + '.');
        if (!isDate(body.exitDate)) errors.exitDate = 'Choose the last working day.';
        if (!EXIT_REASONS[body.reason]) errors.reason = 'Choose the reason.';
        if (Object.keys(errors).length) return fail(res, null, errors);
        const x = { reason: body.reason, note: clean(body.note, 300) || null, exitDate: body.exitDate, startedAt: now(), startedBy: user.id, steps: {} };
        await docs.update('app_staff', prof.id, { exit: x, exitDate: body.exitDate, history: [...(prof.history || []), { at: now(), by: user.id, byName: user.name, field: 'exitDate', from: prof.exitDate || null, to: body.exitDate, note: 'Exit started: ' + EXIT_REASONS[body.reason] }] });
        // Operations needs to know: future visits of a leaving nurse must move
        if (u.role === 'caregiver') {
          const later = (await docs.find('app_schedule', { nurseId: u.id, date: { $gt: body.exitDate } })).filter((v) => ['assigned', 'accepted'].includes(v.status));
          if (later.length) await scheduler.notify(await scheduler.operations(), { kind: 'exit', title: u.name + ' is leaving', body: `Last working day ${body.exitDate}. ${later.length} visit(s) after that date need another nurse.`, link: '#/office/scheduler' });
        }
        await audit(user.id, 'hr.exit.start', null, { employee: prof.employeeId, exitDate: body.exitDate });
        return json(res, 201, { ok: true });
      }
      if (parts[3] === 'step' && parts.length === 4) {
        if (!prof.exit) throw notFound();
        const k = String(body.step || '');
        if (!EXIT_STEPS.some(([s]) => s === k)) return fail(res, 'Choose a step.');
        const steps = { ...(prof.exit.steps || {}) };
        if (body.undo) { if (k === 'login' && !u.active) return fail(res, 'The login is switched off. The office admin can switch it on again under Settings → Logins.'); delete steps[k]; }
        else {
          if (k === 'login') {
            if ((prof.exitDate || prof.exit.exitDate) > today) return fail(res, 'The login can be switched off on or after the last working day (' + (prof.exitDate || prof.exit.exitDate) + ').');
            await docs.update('app_users', u.id, { active: false });
            if (auth && auth.endAllSessions) await auth.endAllSessions(u.id);
          }
          steps[k] = { at: now(), by: user.id, byName: user.name, note: clean(body.note, 200) || null };
        }
        await docs.update('app_staff', prof.id, { exit: { ...prof.exit, steps } });
        await audit(user.id, 'hr.exit.' + (body.undo ? 'undo' : 'step'), null, { employee: prof.employeeId, step: k });
        return json(res, 200, { ok: true });
      }
      if (parts[3] === 'cancel' && parts.length === 4) {
        if (!prof.exit) throw notFound();
        if (!u.active) return fail(res, 'The login is already switched off; ask the office admin to reinstate the employee.');
        await docs.update('app_staff', prof.id, { exit: null, exitDate: null, history: [...(prof.history || []), { at: now(), by: user.id, byName: user.name, field: 'exitDate', from: prof.exitDate || null, to: null, note: 'Exit withdrawn' + (body.note ? ': ' + clean(body.note, 200) : '') }] });
        await audit(user.id, 'hr.exit.cancel', null, { employee: prof.employeeId });
        return json(res, 200, { ok: true });
      }
    }
    // ---- recruitment
    if (p === 'hr/candidates' && req.method === 'GET') {
      const rows = await docs.find('app_candidates', {}, { sort: { createdAt: -1 } });
      const st = q(url, 'stage');
      const counts = Object.fromEntries(Object.keys(CANDIDATE_STAGES).map((k) => [k, rows.filter((c) => c.stage === k).length]));
      return json(res, 200, { ok: true, stages: CANDIDATE_STAGES, sources: CANDIDATE_SOURCES, roles: { caregiver: 'Nurse / caregiver' }, departments: DEPARTMENTS, counts,
        rows: rows.filter((c) => (!st ? !['rejected', 'withdrawn', 'joined'].includes(c.stage) || q(url, 'all') : c.stage === st)).map((c) => ({ ...c, stageName: CANDIDATE_STAGES[c.stage], sourceName: CANDIDATE_SOURCES[c.source] || c.source })) });
    }
    if (p === 'hr/candidates' && req.method === 'POST') {
      const errors = {};
      const name = clean(body.name, 80); if (name.length < 2) errors.name = 'Enter the name.';
      const phone = body.phone ? normalisePhone(body.phone) : null; if (body.phone && !phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
      const email = String(body.email || '').trim().toLowerCase().slice(0, 120); if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'This email address looks incomplete.';
      if (!phone && !email) errors.phone = 'Enter a mobile number or email.';
      if (!CANDIDATE_SOURCES[body.source]) errors.source = 'Choose where they came from.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      if (phone && (await docs.find('app_candidates', { phone })).some((c) => !['rejected', 'withdrawn'].includes(c.stage))) return fail(res, null, { phone: 'This person is already in recruitment.' });
      const c = { id: uid(), reference: store.makeReference('CAN'), name, phone, email: email || null, position: clean(body.position, 80) || 'Staff Nurse', qualification: clean(body.qualification, 120) || null, experienceYears: Number(body.experienceYears) >= 0 ? Math.min(50, Number(body.experienceYears)) : null,
        source: body.source, stage: 'applied', interviewAt: null, history: [{ at: now(), by: user.id, byName: user.name, stage: 'applied', note: clean(body.note, 300) || null }], createdAt: now(), createdBy: user.id };
      await docs.insert('app_candidates', c);
      await audit(user.id, 'hr.candidate', null, { candidate: c.reference });
      return json(res, 201, { ok: true, id: c.id });
    }
    if (parts[0] === 'hr' && parts[1] === 'candidates' && parts[2] && parts.length === 4 && req.method === 'POST') {
      const c = await docs.findOne('app_candidates', { id: parts[2] });
      if (!c) throw notFound();
      if (parts[3] === 'stage') {
        const to = String(body.stage || '');
        if (!CANDIDATE_STAGES[to] || to === 'joined') return fail(res, 'Choose the stage. "Joined" is set when you add them as an employee.');
        if (c.stage === 'joined') return fail(res, 'This candidate has already joined.');
        let interviewAt = c.interviewAt;
        if (to === 'interview') { if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(String(body.interviewAt || ''))) return fail(res, null, { interviewAt: 'Choose the interview date and time.' }); interviewAt = body.interviewAt; }
        if (['rejected', 'withdrawn'].includes(to) && clean(body.note, 300).length < 3) return fail(res, null, { note: 'Add a short note on why.' });
        await docs.update('app_candidates', c.id, { stage: to, interviewAt, history: [...(c.history || []), { at: now(), by: user.id, byName: user.name, stage: to, note: clean(body.note, 300) || null, interviewAt: to === 'interview' ? interviewAt : undefined }] });
        await audit(user.id, 'hr.candidate.stage', null, { candidate: c.reference, stage: to });
        return json(res, 200, { ok: true });
      }
      if (parts[3] === 'hire') {
        if (c.stage !== 'offered') return fail(res, 'Make the offer first (move the candidate to "Offer made").');
        const phone = c.phone, email = c.email;
        if (phone && await docs.findOne('app_users', { phone })) return fail(res, 'Another login already uses ' + phone + '.');
        if (email && await docs.findOne('app_users', { email })) return fail(res, 'Another login already uses ' + email + '.');
        if (body.joinDate && !isDate(body.joinDate)) return fail(res, null, { joinDate: 'Choose the date of joining.' });
        const joinDate = isDate(body.joinDate) ? body.joinDate : today;
        const u = { id: uid(), name: c.name, email: email || null, phone: phone || null, role: 'caregiver', passwordHash: null, active: true, createdAt: now(), createdBy: user.id };
        await docs.insert('app_users', u);
        const prof = await staff.profileOf(u.id);
        const probMonths = [0, 3, 6].includes(Number(body.probationMonths)) ? Number(body.probationMonths) : 6;
        const probEnd = probMonths ? (() => { const d = new Date(joinDate + 'T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + probMonths); return d.toISOString().slice(0, 10); })() : null;
        await docs.update('app_staff', prof.id, { department: DEPARTMENTS.includes(body.department) ? body.department : 'Nursing', designation: c.position || 'Staff Nurse', joinDate, candidateId: c.id,
          probation: probMonths ? { status: 'on', endDate: probEnd, setBy: user.id, setAt: now() } : { status: 'none', endDate: null, setBy: user.id, setAt: now() }, updatedAt: now() });
        await docs.update('app_candidates', c.id, { stage: 'joined', userId: u.id, history: [...(c.history || []), { at: now(), by: user.id, byName: user.name, stage: 'joined', note: 'Added as employee ' + prof.employeeId }] });
        await audit(user.id, 'user.add', null, { role: 'caregiver', name: c.name, by: 'hr', candidate: c.reference });
        return json(res, 201, { ok: true, userId: u.id, employeeId: prof.employeeId, ...(welcomeLink ? await welcomeLink(rawReq, u) : {}) });
      }
    }
    // ---- probation and reviews
    if (p === 'hr/reviews' && req.method === 'GET') {
      const rows = (await employees()).filter((x) => x.user.active).map(({ user: u, prof }) => reviewState(u, prof, today));
      return json(res, 200, { ok: true, rows, probation: PROBATION,
        totals: { onProbation: rows.filter((r) => r.probation && ['on', 'extended'].includes(r.probation.status)).length, endingSoon: rows.filter((r) => r.probation && r.probation.endingSoon).length, reviewsOverdue: rows.filter((r) => r.reviewOverdue).length } });
    }
    if (parts[0] === 'hr' && parts[1] === 'reviews' && parts[2] && parts.length === 4 && req.method === 'POST') {
      const u = await docs.findOne('app_users', { id: parts[2] });
      if (!u || !STAFF_ROLES.includes(u.role)) throw notFound();
      if (u.id === user.id) return fail(res, 'Your own probation and reviews are recorded by someone else.');
      const prof = await staff.profileOf(u.id);
      if (parts[3] === 'probation') {
        const st = String(body.status || '');
        if (!PROBATION[st]) return fail(res, null, { status: 'Choose the probation status.' });
        if (['on', 'extended'].includes(st) && !isDate(body.endDate)) return fail(res, null, { endDate: 'Choose when the probation ends.' });
        const pr = { status: st, endDate: ['on', 'extended'].includes(st) ? body.endDate : (prof.probation && prof.probation.endDate) || null, note: clean(body.note, 300) || null, setBy: user.id, setByName: user.name, setAt: now(), confirmedOn: st === 'confirmed' ? today : null };
        await docs.update('app_staff', prof.id, { probation: pr, history: [...(prof.history || []), { at: now(), by: user.id, byName: user.name, field: 'probation', from: prof.probation ? prof.probation.status : null, to: st, note: pr.note }] });
        if (st === 'confirmed') await scheduler.notify([u.id], { kind: 'probation', title: 'Your employment is confirmed', body: 'Your probation is complete. Congratulations!', link: '#/me' });
        await audit(user.id, 'hr.probation', null, { employee: prof.employeeId, status: st });
        return json(res, 200, { ok: true });
      }
      if (parts[3] === 'add') {
        const errors = {};
        const rating = Number(body.rating); if (!(rating >= 1 && rating <= 5)) errors.rating = 'Choose a rating from 1 to 5.';
        const period = clean(body.period, 40); if (period.length < 3) errors.period = 'Say which period the review covers (e.g. 2026).';
        const strengths = clean(body.strengths, 600), improve = clean(body.improve, 600);
        if (strengths.length < 3 && improve.length < 3) errors.strengths = 'Write what went well or what to improve.';
        if (Object.keys(errors).length) return fail(res, null, errors);
        const r = { id: uid(), date: today, period, rating, strengths: strengths || null, improve: improve || null, goals: clean(body.goals, 600) || null, by: user.id, byName: user.name, at: now() };
        await docs.update('app_staff', prof.id, { reviews: [...(prof.reviews || []), r] });
        await audit(user.id, 'hr.review', null, { employee: prof.employeeId, period });
        return json(res, 201, { ok: true });
      }
    }
    return undefined;
  }

  // ================================================================ Operations
  // ---- nurse suggestions for visits that need a nurse: free and allowed (the scheduler's own check), then
  // who already cares for the customer, who works in the customer's area, and who has the lightest week
  async function suggestions() {
    const today = todayIST();
    const waiting = (await docs.find('app_schedule', { status: 'awaiting_assignment' })).filter((v) => v.date >= today).sort((a, b) => (a.date + a.slot < b.date + b.slot ? -1 : 1)).slice(0, 60);
    if (!waiting.length) return [];
    const [nurses, links, dets] = await Promise.all([scheduler.nurses(), docs.find('app_links', { kind: 'caregiver' }), docs.find('app_details', { id: { $in: [...new Set(waiting.map((v) => 'det-' + v.personId))] } })]);
    const areaOf = ctx.plus.areaOf;
    const out = [];
    for (const v of waiting) {
      const det = dets.find((d) => d.id === 'det-' + v.personId);
      const addr = det && det.data ? [det.data.address, det.data.city, det.data.area].filter(Boolean).join(', ') : '';
      const area = addr ? areaOf(addr) : null;
      const opts = (await scheduler.options(v.id)) || [];
      const ranked = opts.map((o) => {
        const n = nurses.find((x) => x.user.id === o.id) || {};
        const loc = (n.profile && n.profile.location) || '';
        const cares = links.some((l) => l.userId === o.id && l.personId === v.personId);
        const sameArea = Boolean(area && loc && areaOf(loc) === area);
        const reasons = [];
        if (cares) reasons.push('Already cares for ' + (v.customerName || 'this customer'));
        if (sameArea) reasons.push('Works in ' + area);
        if (o.ok) reasons.push('Free at ' + o.start + ' · ' + o.weekLoad + ' visit' + (o.weekLoad === 1 ? '' : 's') + ' this week');
        return { nurseId: o.id, name: o.name, ok: o.ok, start: o.start, why: o.why, weekLoad: o.weekLoad, cares, sameArea, reasons, score: (o.ok ? 1000 : 0) + (cares ? 100 : 0) + (sameArea ? 50 : 0) - o.weekLoad };
      }).sort((a, b) => b.score - a.score);
      out.push({ id: v.id, ref: v.ref || null, date: v.date, slot: v.slot, slotName: SLOTS[v.slot] ? SLOTS[v.slot].name : v.slot, minutes: v.minutes, serviceName: v.serviceName, customerName: v.customerName, personId: v.personId, area: area || null,
        suggestions: ranked.filter((r) => r.ok).slice(0, 3), unavailable: ranked.filter((r) => !r.ok).length, reasonsBlocked: [...new Set(ranked.filter((r) => !r.ok).map((r) => r.why))] });
    }
    return out;
  }
  // ---- actual visit times from the nurses' own Start and Complete taps (no new step for nurses)
  async function visitTimes(from, to) {
    const rows = await docs.find('app_schedule', { date: { $gte: from, $lte: to } });
    const names = await namesFor(rows.map((v) => v.nurseId));
    const set = await setting('ops-sla');
    const grace = Number.isFinite(set.graceMin) ? set.graceMin : null;
    const list = rows.filter((v) => v.start && ['in_progress', 'completed'].includes(v.status)).map((v) => {
      const s = (v.history || []).find((h) => h.action === 'in_progress'), c = (v.history || []).filter((h) => h.action === 'completed').pop();
      const startedAt = s ? s.at : null, doneAt = c ? c.at : null;
      const sMin = startedAt && istDay(startedAt) === v.date ? istMin(startedAt) : null, cMin = doneAt && istDay(doneAt) === v.date ? istMin(doneAt) : null;
      const late = sMin == null ? null : sMin - toMin(v.start);
      const actual = startedAt && doneAt ? Math.round((Date.parse(doneAt) - Date.parse(startedAt)) / 60000) : null;
      return { id: v.id, date: v.date, nurseName: names[v.nurseId] || '', customerName: v.customerName, serviceName: v.serviceName, plannedStart: v.start, plannedEnd: v.end, plannedMin: v.minutes,
        startedAt, doneAt, startMin: sMin, doneMin: cMin, lateMin: late, actualMin: actual, shortMin: actual != null && v.minutes ? v.minutes - actual : null, status: v.status, statusName: VSTATUS[v.status],
        onTime: late == null || grace == null ? null : late <= grace, short: actual != null && v.minutes ? actual < v.minutes * 0.75 : false, long: actual != null && v.minutes ? actual > v.minutes * 1.5 : false };
    }).sort((a, b) => (a.date + (a.plannedStart || '') < b.date + (b.plannedStart || '') ? 1 : -1));
    const done = list.filter((x) => x.actualMin != null);
    return { from, to, grace, rows: list, totals: { started: list.length, completed: done.length, avgLate: list.filter((x) => x.lateMin != null).length ? Math.round(list.filter((x) => x.lateMin != null).reduce((s, x) => s + Math.max(0, x.lateMin), 0) / list.filter((x) => x.lateMin != null).length) : 0,
      avgActual: done.length ? Math.round(done.reduce((s, x) => s + x.actualMin, 0) / done.length) : 0, avgPlanned: done.length ? Math.round(done.reduce((s, x) => s + (x.plannedMin || 0), 0) / done.length) : 0, short: list.filter((x) => x.short).length, long: list.filter((x) => x.long).length } };
  }
  // ---- supplies
  function supplyView(s) {
    const stock = r2((s.moves || []).reduce((n, m) => n + (m.kind === 'issued' ? -m.qty : m.kind === 'adjusted' ? m.delta : m.qty), 0));
    const low = s.reorderLevel != null && stock <= s.reorderLevel;
    return { id: s.id, name: s.name, unit: s.unit, category: s.category, categoryName: SUPPLY_CATS[s.category] || 'Other', location: s.location || '', reorderLevel: s.reorderLevel, stock, low, out: stock <= 0,
      lastMove: (s.moves || []).slice(-1)[0] || null, archived: Boolean(s.archived) };
  }
  async function opsRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'ops/suggestions' && req.method === 'GET') { const rows = await suggestions(); return json(res, 200, { ok: true, rows, withSuggestion: rows.filter((r) => r.suggestions.length).length }); }
    if (p === 'ops/visit-times' && req.method === 'GET') return json(res, 200, { ok: true, ...(await visitTimes(isDate(q(url, 'from')) ? q(url, 'from') : addDays(today, -14), isDate(q(url, 'to')) ? q(url, 'to') : today)) });
    if (p === 'ops/supplies' && req.method === 'GET') {
      const all = (await docs.find('app_supplies', {}, { sort: { name: 1 } })).map(supplyView);
      const rows = all.filter((s) => !s.archived || q(url, 'all'));
      const nurses = (await scheduler.nurses()).filter((n) => n.user.active).map((n) => ({ id: n.user.id, name: n.user.name }));
      return json(res, 200, { ok: true, rows, categories: SUPPLY_CATS, kinds: MOVE_KINDS, nurses, totals: { items: rows.length, low: rows.filter((s) => s.low && !s.out).length, out: rows.filter((s) => s.out).length, noLevel: rows.filter((s) => s.reorderLevel == null).length } });
    }
    if (p === 'ops/supplies' && req.method === 'POST') {
      const errors = {};
      const name = clean(body.name, 80); if (name.length < 2) errors.name = 'Enter the item.';
      const unit = clean(body.unit, 20) || 'pieces';
      if (!SUPPLY_CATS[body.category]) errors.category = 'Choose a category.';
      const lvl = body.reorderLevel === '' || body.reorderLevel == null ? null : Number(body.reorderLevel); if (lvl != null && !(lvl >= 0)) errors.reorderLevel = 'Enter 0 or more.';
      const opening = body.opening === '' || body.opening == null ? 0 : Number(body.opening); if (!(opening >= 0)) errors.opening = 'Enter 0 or more.';
      if (!errors.name && (await docs.find('app_supplies')).some((s) => !s.archived && s.name.toLowerCase() === name.toLowerCase())) errors.name = 'This item is already in the list.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      const s = { id: uid(), name, unit, category: body.category, location: clean(body.location, 60) || null, reorderLevel: lvl, moves: opening ? [{ id: uid(), kind: 'received', qty: opening, note: 'Opening stock', by: user.id, byName: user.name, at: now() }] : [], createdAt: now(), createdBy: user.id };
      await docs.insert('app_supplies', s);
      await audit(user.id, 'ops.supply', null, { item: name });
      return json(res, 201, { ok: true, id: s.id });
    }
    if (parts[0] === 'ops' && parts[1] === 'supplies' && parts[2] && parts.length === 4 && req.method === 'POST') {
      const s = await docs.findOne('app_supplies', { id: parts[2] });
      if (!s) throw notFound();
      const v = supplyView(s);
      if (parts[3] === 'move') {
        const kind = String(body.kind || '');
        if (!MOVE_KINDS[kind]) return fail(res, null, { kind: 'Choose what happened.' });
        let m;
        if (kind === 'adjusted') {
          const counted = Number(body.counted); if (!(counted >= 0) || body.counted === '' || body.counted == null) return fail(res, null, { counted: 'Enter the quantity you counted.' });
          if (clean(body.note, 200).length < 3) return fail(res, null, { note: 'Say why the count differs (e.g. damaged, expired).' });
          m = { id: uid(), kind, delta: r2(counted - v.stock), counted };
        } else {
          const qty = Number(body.qty); if (!(qty > 0)) return fail(res, null, { qty: 'Enter how many.' });
          if (kind === 'issued' && qty > v.stock) return fail(res, null, { qty: 'Only ' + v.stock + ' ' + s.unit + ' in stock.' });
          m = { id: uid(), kind, qty };
          if (kind === 'issued' && body.nurseId) { const n = await docs.findOne('app_users', { id: String(body.nurseId) }); if (n && n.role === 'caregiver') { m.toId = n.id; m.toName = n.name; } }
          if (kind === 'received') m.supplier = clean(body.supplier, 80) || null;
        }
        Object.assign(m, { note: clean(body.note, 200) || null, by: user.id, byName: user.name, at: now() });
        await docs.update('app_supplies', s.id, { moves: [...(s.moves || []), m], lowAlerted: null });
        await audit(user.id, 'ops.supply.' + kind, null, { item: s.name, qty: m.qty || m.delta });
        const after = supplyView({ ...s, moves: [...(s.moves || []), m] });
        if (after.low && !v.low) await scheduler.notify(await usersWithRole('admin', 'operations'), { kind: 'supply', title: after.out ? s.name + ' is out of stock' : s.name + ' is running low', body: `${after.stock} ${s.unit} left (reorder at ${s.reorderLevel}).`, link: '#/office/ops/supplies' });
        return json(res, 200, { ok: true, stock: after.stock });
      }
      if (parts[3] === 'edit') {
        const lvl = body.reorderLevel === '' || body.reorderLevel == null ? null : Number(body.reorderLevel); if (lvl != null && !(lvl >= 0)) return fail(res, null, { reorderLevel: 'Enter 0 or more.' });
        await docs.update('app_supplies', s.id, { reorderLevel: lvl, location: clean(body.location, 60) || null, unit: clean(body.unit, 20) || s.unit, archived: Boolean(body.archived) });
        await audit(user.id, 'ops.supply.edit', null, { item: s.name });
        return json(res, 200, { ok: true });
      }
      if (parts[3] === 'history') return undefined;
    }
    if (parts[0] === 'ops' && parts[1] === 'supplies' && parts[2] && parts[3] === 'history' && req.method === 'GET') {
      const s = await docs.findOne('app_supplies', { id: parts[2] });
      if (!s) throw notFound();
      let run = 0;
      const moves = (s.moves || []).map((m) => { run = r2(run + (m.kind === 'issued' ? -m.qty : m.kind === 'adjusted' ? m.delta : m.qty)); return { ...m, kindName: MOVE_KINDS[m.kind], after: run }; }).reverse();
      return json(res, 200, { ok: true, item: supplyView(s), moves });
    }
    return undefined;
  }

  // ================================================================ Sales
  const STAGES = ['new', 'contacted', 'follow_up', 'converted', 'lost'];
  async function pipeline(url, user) {
    const [all, packs] = await Promise.all([office.leadRows(), packinfo.all()]);
    const since = addDays(todayIST(), -60);
    const rows = office.filterLeads(all, url).filter((l) => (!q(url, 'mine') || l.assignedTo === user.id) && (['new', 'contacted', 'follow_up'].includes(l.status) || ymd((l.history || []).slice(-1)[0] ? l.history.slice(-1)[0].at : l.createdAt) >= since));
    const price = (l) => { if (Number.isFinite(l.expectedValue)) return l.expectedValue; const pk = packs.find((x) => x.id === l.package); return pk ? packinfo.priceOf(pk, l.expectedMonths || undefined).amount || null : null; };
    const cards = rows.map((l) => ({ type: l.type, id: l.id, enquiryId: l.enquiryId, name: l.name, phone: l.phone, packageName: l.packageName, status: l.status, assignedName: l.assignedName, followUpAt: l.followUpAt, source: l.source, sourceName: l.sourceName, value: price(l), createdAt: l.createdAt, renewal: l.source === 'renewal' }));
    return STAGES.map((s) => { const list = cards.filter((c) => c.status === s); return { key: s, label: LEAD_STATUS[s], count: list.length, value: list.reduce((n, c) => n + (c.value || 0), 0), cards: list.slice(0, 80) }; });
  }
  function fill(tpl, v) { return String(tpl || '').replace(/\{(\w+)\}/g, (m, k) => (v[k] != null && v[k] !== '' ? String(v[k]) : m)); }
  async function salesRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'sales/renewal-leads' && req.method === 'POST') {
      const n = await makeRenewalLeads();
      await audit(user.id, 'sales.renewals', null, { made: n });
      return json(res, 200, { ok: true, made: n });
    }
    if (p === 'sales/pipeline' && req.method === 'GET') {
      const cols = await pipeline(url, user);
      return json(res, 200, { ok: true, columns: cols, statuses: LEAD_STATUS, open: cols.filter((c) => ['new', 'contacted', 'follow_up'].includes(c.key)).reduce((s, c) => s + c.count, 0) });
    }
    // ---- message templates: the team's ready-made messages; {name} and the others are filled per lead
    if (p === 'sales/templates' && req.method === 'GET') {
      const set = await setting('sales-templates');
      return json(res, 200, { ok: true, rows: (set.rows || []).filter((t) => !t.archived), channels: TEMPLATE_CHANNELS, placeholders: PLACEHOLDERS });
    }
    if (p === 'sales/templates' && req.method === 'POST') {
      const set = await setting('sales-templates');
      const rows = set.rows || [];
      const errors = {};
      const name = clean(body.name, 60); if (name.length < 2) errors.name = 'Name the template.';
      if (!TEMPLATE_CHANNELS[body.channel]) errors.channel = 'Choose where it is sent.';
      const text = String(body.body || '').replace(/\r/g, '').trim().slice(0, 1500); if (text.length < 5) errors.body = 'Write the message.';
      const bad = (text.match(/\{(\w+)\}/g) || []).map((x) => x.slice(1, -1)).filter((k) => !PLACEHOLDERS.includes(k));
      if (bad.length) errors.body = 'Unknown placeholder: {' + bad[0] + '}. Use ' + PLACEHOLDERS.map((x) => '{' + x + '}').join(', ') + '.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      const t = { id: body.id && rows.some((x) => x.id === body.id) ? body.id : uid(), name, channel: body.channel, subject: body.channel === 'email' ? clean(body.subject, 120) || name : null, body: text, updatedBy: user.id, updatedByName: user.name, updatedAt: now() };
      await saveSetting('sales-templates', { rows: rows.filter((x) => x.id !== t.id).concat([t]) });
      await audit(user.id, 'sales.template', null, { template: name });
      return json(res, 200, { ok: true, id: t.id });
    }
    if (parts[0] === 'sales' && parts[1] === 'templates' && parts[2] && parts[3] === 'archive' && req.method === 'POST') {
      const set = await setting('sales-templates');
      if (!(set.rows || []).some((x) => x.id === parts[2])) throw notFound();
      await saveSetting('sales-templates', { rows: set.rows.map((x) => (x.id === parts[2] ? { ...x, archived: true } : x)) });
      await audit(user.id, 'sales.template.remove', null, {});
      return json(res, 200, { ok: true });
    }
    // a template filled in for one lead (the screen then opens WhatsApp, email or copies it)
    if (p === 'sales/templates/fill' && req.method === 'POST') {
      const set = await setting('sales-templates');
      const t = (set.rows || []).find((x) => x.id === body.templateId && !x.archived);
      if (!t) throw notFound();
      const lead = (await office.leadRows()).find((l) => l.id === body.leadId && l.type === body.type);
      if (!lead) throw notFound();
      const pk = lead.package ? await packinfo.byId(lead.package) : null;
      const vals = { name: (lead.name || '').split(' ')[0], package: lead.packageName || (pk && pk.name) || '', price: Number.isFinite(lead.expectedValue) ? care.fmt(lead.expectedValue) : pk && packinfo.priceOf(pk, lead.expectedMonths || undefined).amount ? care.fmt(packinfo.priceOf(pk, lead.expectedMonths || undefined).amount) : '', agent: user.name.split(/[ ,]/)[0], enquiryId: lead.enquiryId, company: 'KareIQ' };
      const text = fill(t.body, vals);
      return json(res, 200, { ok: true, channel: t.channel, subject: t.subject ? fill(t.subject, vals) : null, text, missing: (text.match(/\{(\w+)\}/g) || []), phone: lead.phone || null, email: lead.email || null, name: lead.name });
    }
    // ---- commission: the office admin sets the rate; it is worked out on paid package revenue of each executive's leads
    if (p === 'sales/commission' && req.method === 'GET') {
      const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
      const set = await setting('sales-commission');
      const rate = Number.isFinite(set.ratePct) ? set.ratePct : null;
      const tg = ((await setting('sales-targets')).months || {})[m] || {};
      const [leads, members, orders] = await Promise.all([office.leadRows(), office.members(), docs.find('app_orders', { status: 'paid' })]);
      const rows = members.filter((u) => user.role !== 'sales' || u.id === user.id).map((u) => {
        const sales = leads.filter((l) => l.assignedTo === u.id).map((l) => ({ l, o: l.orderId && orders.find((o) => o.id === l.orderId) })).filter((x) => x.o && month((x.o.payment && x.o.payment.verifiedAt) || x.o.paidAt || x.o.updatedAt) === m);
        const revenue = sales.reduce((s, x) => s + (x.o.amount || 0), 0);
        const t = (tg[u.id] || {}).revenue;
        return { userId: u.id, name: u.name, sales: sales.map((x) => ({ enquiryId: x.l.enquiryId, name: x.l.name, packageName: x.l.packageName, amount: x.o.amount, reference: x.o.reference })), revenue, commission: rate == null ? null : r2(revenue * rate / 100), target: Number.isFinite(t) ? t : null, me: u.id === user.id };
      });
      return json(res, 200, { ok: true, month: m, ratePct: rate, canSet: user.role === 'admin', rows, total: rate == null ? null : r2(rows.reduce((s, r) => s + r.commission, 0)) });
    }
    if (p === 'sales/commission' && req.method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { ok: false, message: 'The commission rate is set by the office admin.' });
      const v = body.ratePct === '' || body.ratePct == null ? null : Number(body.ratePct);
      if (v != null && !(v >= 0 && v <= 50)) return fail(res, null, { ratePct: 'Enter a rate between 0 and 50 percent.' });
      await saveSetting('sales-commission', { ratePct: v, updatedBy: user.id, updatedAt: now() });
      await audit(user.id, 'sales.commission', null, { ratePct: v });
      return json(res, 200, { ok: true });
    }
    return undefined;
  }

  // ---- reports added in this round (CSV, or PDF with ?format=pdf)
  async function reports(req, res, parts, url) {
    const kind = parts[2].replace(/\.(csv|pdf)$/, '');
    const key = parts[0] + '/' + kind, today = todayIST();
    if (key === 'fin/renewals') {
      const rows = await renewals(Math.min(120, Math.max(7, Number(q(url, 'days')) || RENEW_DAYS)));
      return sendReport(res, url, 'renewals-' + today, ['Customer', 'Customer ID', 'Package', 'Ends', 'Days left', 'Last invoice', 'Amount (INR)', 'Outstanding (INR)', 'Renewal lead', 'Lead status'], rows.map((r) => [r.customer, r.personId, r.packageName, r.endDate, r.daysLeft, r.invoiceNo || '', r.lastAmount, r.outstanding, r.lead ? r.lead.enquiryId : '', r.lead ? r.lead.statusName : '']));
    }
    if (key === 'fin/bills') {
      const rows = await bills();
      return sendReport(res, url, 'vendor-bills-' + today, ['Supplier', 'Bill no', 'Bill date', 'Due', 'Category', 'Amount (INR)', 'Paid (INR)', 'Owed (INR)', 'Status', 'Days overdue'], rows.map((b) => [b.vendor, b.billNo, b.date, b.dueDate, (require('./teams').EXPENSE_CATEGORIES)[b.category] || '', b.amount, b.paid, b.due, b.statusName, b.overdueDays]));
    }
    if (key === 'hr/payslips') {
      const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
      const rows = await payslipRows(m);
      return sendReport(res, url, 'payslips-' + m, ['Employee ID', 'Name', 'Role', 'Salary set', 'Loss of pay days', 'Paid days', 'Gross (INR)', 'Deductions (INR)', 'Net pay (INR)', 'Payslip'],
        rows.map((r) => [r.employeeId, r.name, r.roleName, r.salarySet ? 'Yes' : 'No', r.draft ? r.draft.lop : '', r.draft ? r.draft.paidDays : '', r.draft ? r.draft.gross : '', r.draft ? r.draft.deductionsTotal : '', r.issued ? r.issued.net : r.draft ? r.draft.net : '', r.issued ? r.issued.number : 'Not issued']));
    }
    if (key === 'hr/candidates') {
      const rows = await docs.find('app_candidates', {}, { sort: { createdAt: -1 } });
      return sendReport(res, url, 'recruitment-' + today, ['Reference', 'Name', 'Position', 'Source', 'Stage', 'Applied', 'Interview'], rows.map((c) => [c.reference, c.name, c.position, CANDIDATE_SOURCES[c.source] || c.source, CANDIDATE_STAGES[c.stage], ymd(c.createdAt), c.interviewAt ? c.interviewAt.replace('T', ' ') : '']));
    }
    if (key === 'ops/visit-times') {
      const d = await visitTimes(isDate(q(url, 'from')) ? q(url, 'from') : addDays(today, -14), isDate(q(url, 'to')) ? q(url, 'to') : today);
      const hm = (m) => (m == null ? '' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'));
      return sendReport(res, url, 'visit-times-' + d.from + '-to-' + d.to, ['Date', 'Nurse', 'Customer', 'Service', 'Planned start', 'Started', 'Minutes late', 'Completed', 'Planned minutes', 'Actual minutes'], d.rows.map((x) => [x.date, x.nurseName, x.customerName, x.serviceName, x.plannedStart, hm(x.startMin), x.lateMin == null ? '' : x.lateMin, hm(x.doneMin), x.plannedMin || '', x.actualMin == null ? '' : x.actualMin]));
    }
    if (key === 'ops/supplies') {
      const rows = (await docs.find('app_supplies', {}, { sort: { name: 1 } })).map(supplyView).filter((s) => !s.archived);
      return sendReport(res, url, 'supplies-' + today, ['Item', 'Category', 'Unit', 'In stock', 'Reorder at', 'Status', 'Kept at'], rows.map((s) => [s.name, s.categoryName, s.unit, s.stock, s.reorderLevel == null ? 'not set' : s.reorderLevel, s.out ? 'Out of stock' : s.low ? 'Low' : 'OK', s.location]));
    }
    if (key === 'sales/commission') {
      const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
      const set = await setting('sales-commission');
      const rate = Number.isFinite(set.ratePct) ? set.ratePct : null;
      const [leads, members, orders] = await Promise.all([office.leadRows(), office.members(), docs.find('app_orders', { status: 'paid' })]);
      const rows = members.map((u) => { const rev = leads.filter((l) => l.assignedTo === u.id).map((l) => l.orderId && orders.find((o) => o.id === l.orderId)).filter((o) => o && month((o.payment && o.payment.verifiedAt) || o.paidAt || o.updatedAt) === m).reduce((s, o) => s + (o.amount || 0), 0); return [u.name, rev, rate == null ? 'rate not set' : rate, rate == null ? '' : r2(rev * rate / 100)]; });
      return sendReport(res, url, 'commission-' + m, ['Team member', 'Paid revenue (INR)', 'Rate %', 'Commission (INR)'], rows);
    }
    return undefined;
  }

  async function handle(req, res, parts, url, user, body) {
    if (['fin', 'hr', 'ops', 'sales'].includes(parts[0]) && parts[1] === 'reports' && parts.length === 3 && req.method === 'GET') { const r = await reports(req, res, parts, url); if (r !== undefined) return r; }
    if (parts[0] === 'fin') return financeRoute(req, res, parts, url, user, body);
    if (parts[0] === 'hr') return hrRoute(req, res, parts, url, user, body, req);
    if (parts[0] === 'ops') return opsRoute(req, res, parts, url, user, body);
    if (parts[0] === 'sales') return salesRoute(req, res, parts, url, user, body);
    return undefined;
  }

  // ---- my payslips (every staff login sees only their own)
  async function myPayslips(user) {
    return (await docs.find('app_payslips', { userId: user.id }, { sort: { month: -1 } })).filter((x) => !x.withdrawn).map((x) => ({ id: x.id, number: x.number, month: x.month, net: x.slip.net, issuedAt: x.issuedAt }));
  }
  async function myPayslipPdf(user, id, res) {
    const rec = await docs.findOne('app_payslips', { id });
    if (!rec || rec.userId !== user.id || rec.withdrawn) throw notFound();
    return sendFile(res, await payslipPdf(rec), 'application/pdf', 'payslip-' + rec.month + '.pdf');
  }

  // ---- hourly: renewal leads for Sales, overdue bills for Finance, probation endings for HR, low stock for Operations
  // renewal leads: one per ending package, assigned to whoever sold it (or unassigned), Sales told
  async function makeRenewalLeads() {
    const today = todayIST();
    const made = [];
    const due = await renewals(RENEW_DAYS);
    const fresh = due.filter((r) => !r.lead && r.daysLeft >= 0);
    if (fresh.length) {
      const leads = await office.leadRows();
      for (const r of fresh) {
        if (leads.some((l) => l.renewalOf === r.planId)) continue;
        const prev = leads.find((l) => l.personId === r.personId && l.appPlanId === r.planId) || leads.find((l) => l.personId === r.personId && l.assignedTo);
        const c = r.contact || {};
        const at = now();
        const rec = await store.add('enquiries', 'KQ', { name: c.name || r.customer, phone: c.phone || '', email: c.email || '', interest: r.product, interestName: 'Renewal: ' + r.packageName, package: r.packageId, message: 'Package ' + r.packageName + ' for ' + r.customer + ' ends on ' + r.endDate + '.',
          source: 'renewal', kind: 'enquiry', careForName: r.customer, personId: r.personId, renewalOf: r.planId, createdAt: at, assignedTo: prev && prev.assignedTo ? prev.assignedTo : null, assignedAt: prev && prev.assignedTo ? at : null, leadStatus: 'new', status: 'new',
          followUpAt: addDays(r.endDate, -14) > today ? addDays(r.endDate, -14) + 'T10:00' : today + 'T10:00', expectedValue: r.lastAmount || undefined, expectedMonths: r.months || undefined,
          leadHistory: [{ at, by: 'KareIQ', action: 'added', note: 'Made automatically: the package ends on ' + r.endDate }] });
        made.push({ rec, to: prev && prev.assignedTo });
      }
      if (made.length) {
        const sales = await usersWithRole('admin', 'sales');
        await scheduler.notify(sales, { kind: 'renewal', title: made.length + ' renewal lead' + (made.length === 1 ? '' : 's'), body: 'Packages ending in the next ' + RENEW_DAYS + ' days are in the enquiry database as renewal leads.', link: '#/office/sales/pipeline' });
      }
    }
    return made.length;
  }
  async function remind() {
    const today = todayIST();
    await makeRenewalLeads();
    // a bill that has just become overdue (once per bill)
    const fin = await usersWithRole('finance');
    for (const b of await bills()) if (b.overdueDays > 0 && b.status !== 'paid' && b.status !== 'cancelled' && !b.overdueTold) {
      await scheduler.notify(fin.length ? fin : await usersWithRole('admin'), { kind: 'bill', title: 'Supplier bill overdue', body: `${b.vendor} bill ${b.billNo}: ${care.fmt(b.due)} was due ${b.dueDate}.`, link: '#/office/fin/bills' });
      await docs.update('app_bills', b.id, { overdueTold: today });
    }
    // probation ending within 14 days (once per end date)
    const hr = await usersWithRole('hr');
    for (const { user: u, prof } of await employees()) {
      const pr = prof.probation;
      if (!u.active || !pr || !['on', 'extended'].includes(pr.status) || !pr.endDate || pr.endDate > addDays(today, 14) || pr.told === pr.endDate) continue;
      await scheduler.notify(hr.length ? hr : await usersWithRole('admin'), { kind: 'probation', title: 'Probation ending: ' + u.name, body: `Probation ends ${pr.endDate}. Confirm, extend or record the decision.`, link: '#/office/hr/reviews' });
      await docs.update('app_staff', prof.id, { probation: { ...pr, told: pr.endDate } });
    }
    // low stock: once until stock is moved again
    const ops = await usersWithRole('admin', 'operations');
    for (const s of await docs.find('app_supplies')) {
      const v = supplyView(s);
      if (v.archived || !v.low || s.lowAlerted) continue;
      await scheduler.notify(ops, { kind: 'supply', title: v.out ? s.name + ' is out of stock' : s.name + ' is running low', body: `${v.stock} ${s.unit} left (reorder at ${s.reorderLevel}).`, link: '#/office/ops/supplies' });
      await docs.update('app_supplies', s.id, { lowAlerted: now() });
    }
  }

  // counts for each team's "Needs your attention"
  async function attention(role) {
    const today = todayIST();
    if (role === 'finance') { const b = (await bills()).filter((x) => x.overdueDays > 0); const r = await renewals(RENEW_DAYS); return [{ label: 'supplier bills overdue', count: b.length, href: '#/office/fin/bills?status=overdue', tone: 'bad' }, { label: 'packages ending in ' + RENEW_DAYS + ' days', count: r.filter((x) => x.daysLeft >= 0).length, href: '#/office/fin/renewals', tone: 'warn' }]; }
    if (role === 'hr') { const list = await employees(); const rv = list.filter((x) => x.user.active).map(({ user: u, prof }) => reviewState(u, prof, today)); const ex = list.map(({ user: u, prof }) => exitView(u, prof, today)).filter((x) => x && !x.complete); const cand = (await docs.find('app_candidates')).filter((c) => c.stage === 'interview' && c.interviewAt && c.interviewAt.slice(0, 10) <= addDays(today, 2)); return [{ label: 'probations ending in 14 days', count: rv.filter((r) => r.probation && r.probation.endingSoon).length, href: '#/office/hr/reviews', tone: 'warn' }, { label: 'exits not finished', count: ex.length, href: '#/office/hr/exits', tone: 'warn' }, { label: 'interviews in the next 2 days', count: cand.length, href: '#/office/hr/recruitment?stage=interview' }]; }
    if (role === 'operations') { const s = (await docs.find('app_supplies')).map(supplyView).filter((x) => !x.archived && x.low); return [{ label: 'supplies low or out of stock', count: s.length, href: '#/office/ops/supplies', tone: 'warn' }]; }
    if (role === 'sales') { const leads = (await office.leadRows()).filter((l) => l.source === 'renewal' && ['new', 'contacted', 'follow_up'].includes(l.status)); return [{ label: 'renewal leads open', count: leads.length, href: '#/office/sales/pipeline', tone: 'warn' }]; }
    return [];
  }

  return { handle, remind, myPayslips, myPayslipPdf, attention, renewals };
}

module.exports = { create, EXIT_STEPS, CANDIDATE_STAGES, EARNINGS, DEDUCTIONS, PLACEHOLDERS };
