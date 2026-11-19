// Assessments, automatic risk (status, history, clinical rule approval, admin Summary), KareIQ
// Policies, nurse Leave Record Management and the Notes feed. Every permission here is enforced on
// the server; the screens only hide what the server would refuse anyway.
const R = require('./riskrules');
const riskengine = require('./riskengine');
const vitals = require('./vitals');
const trends = require('./trends');
const { planName } = require('./products');
const checkup = require('./checkup');
const onboarding = require('./onboarding');
const firstvisit = require('./firstvisit');
const nursing = require('./nursing');
const { ACTIVE } = require('./scheduler');

// ---------------------------------------------------------------- KareIQ Policies (the seven, in order)
const POLICY_LIST = [
  ['onboarding-documents', 'Onboarding Documents'],
  ['disciplinary-framework', 'Disciplinary Framework'],
  ['code-of-conduct', 'Code of Conduct'],
  ['grievance-red-policy', 'Grievance Red Policy'],
  ['resident-and-visitor', 'Resident and Visitor'],
  ['rights-and-charter', 'Rights and Charter'],
  ['resident-leave-form', 'Resident Leave Form']
];
const POLICY_TITLE = Object.fromEntries(POLICY_LIST);
const MAX_POLICY_CHARS = 200000;

// ---------------------------------------------------------------- leave
const LEAVE_TYPES = { casual: 'Casual leave', sick: 'Sick leave', earned: 'Earned / annual leave', emergency: 'Emergency leave', unpaid: 'Unpaid leave', other: 'Other' };
const LEAVE_STATUS = { pending: 'Pending approval', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' };
// leave recorded before statuses existed was always in force, so it counts as approved
const leaveCounts = (l) => !l.status || l.status === 'approved';
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const daysIn = (from, to) => Math.round((Date.parse(to + 'T12:00:00Z') - Date.parse(from + 'T12:00:00Z')) / 86400000) + 1;

function create(ctx) {
  const { docs, uid, now, todayIST, json, forbidden, notFound, clean, audit, scheduler, staff, readRaw, sniff, visiblePerson, careTeam, canRecord, historyAllowed, risk } = ctx;
  const MAX_FILE = 5 * 1024 * 1024;

  // ================================================================ assessments (nurses)
  function parseAssessment(body) {
    const errors = {};
    const today = todayIST();
    const date = String(body.date || '');
    if (!isDate(date)) errors.date = 'Enter the date of the test or questionnaire';
    else if (date > today) errors.date = 'The date cannot be in the future';
    // a data-entry safety limit (not a clinical rule): results older than a year need the office
    else if (Date.parse(date + 'T12:00:00Z') < Date.now() - 366 * 86400000) errors.date = 'Results older than a year cannot be added here';
    const values = {};
    const src = body.values && typeof body.values === 'object' ? body.values : {};
    for (const [k, f] of Object.entries(R.INPUTS)) {
      const raw = src[k];
      if (raw === undefined || raw === null || String(raw).trim() === '') continue;
      let v = Number(String(raw).trim().replace(',', '.'));
      if (!Number.isFinite(v)) { errors['values.' + k] = 'Enter a number'; continue; }
      if (f.altUnit && body.units && body.units[k] === f.altUnit.unit) v = Math.round(v * f.altUnit.factor * 100) / 100; // as in the workbook (mg/mmol × 11.3)
      if (f.integer && !Number.isInteger(v)) { errors['values.' + k] = 'Enter a whole number'; continue; }
      if (v < f.min || v > f.max) { errors['values.' + k] = `This looks like a typing mistake (expected ${f.min}–${f.max} ${f.unit})`; continue; }
      if (f.options && !Object.prototype.hasOwnProperty.call(f.options, String(v))) { errors['values.' + k] = 'Choose one'; continue; }
      values[k] = v;
    }
    const facts = {};
    const fs = body.facts && typeof body.facts === 'object' ? body.facts : {};
    for (const [k, f] of Object.entries(R.FACTS)) {
      const raw = fs[k];
      if (raw === undefined || raw === null || raw === '') continue;
      if (f.type === 'yesno') { if (raw === 'yes' || raw === true) facts[k] = true; else if (raw === 'no' || raw === false) facts[k] = false; else errors['facts.' + k] = 'Choose yes or no'; }
      else if (f.type === 'select') { if (f.options[raw]) facts[k] = String(raw); else errors['facts.' + k] = 'Choose one'; }
      else { const n = Number(raw); if (Number.isFinite(n) && n >= f.min && n <= f.max) facts[k] = n; else errors['facts.' + k] = `Enter ${f.min}–${f.max}`; }
    }
    if (!Object.keys(errors).length && !Object.keys(values).length && !Object.keys(facts).length) errors.form = 'Enter at least one result or answer';
    return { errors: Object.keys(errors).length ? errors : null, date, values, facts };
  }

  // ================================================================ the Summary (admin)
  // Business analysis only: aggregate counts of customers by risk category and by package, and how
  // the two relate. No names, IDs or any per-customer record leave the server from here. The
  // filters (risk category, package) are applied on the server to the real data.
  const CATS = ['red', 'amber', 'green', 'grey'];
  const GREY_REASON = { notdone: 'Not done yet', unresolved: 'Workbook inconsistency', nocategory: 'No category in the workbook', expired: 'Out of date', other: 'Not available' };
  const greyReason = (i) => (i.status === 'missing' ? 'notdone' : i.status === 'unresolved' ? 'unresolved' : i.status === 'calculated' ? (i.expired ? 'expired' : 'nocategory') : 'other');
  async function summary(filter) {
    const f = { risk: CATS.includes(filter.risk) ? filter.risk : '', pkg: String(filter.pkg || '').slice(0, 80), ind: R.BY_ID[filter.ind] ? filter.ind : '' };
    const [people, plans] = await Promise.all([docs.find('app_people'), docs.find('app_plans')]);
    const current = plans.filter((p) => !p.included && (p.status === 'active' || p.status === 'paused'));
    const customers = people.filter((x) => x.active !== false && plans.some((p) => p.personId === x.id && !p.included && p.status !== 'ended'));
    const rows = []; // in memory only: { category, packages, flags, counted, why }
    let failed = 0;
    for (const c of customers) {
      const st = await risk.status(c.id);
      if (!st || st.error) failed++;
      const ind = (st && st.indicators) || [];
      const counted = ind.filter((i) => i.counts);
      const category = (st && CATS.includes(st.category)) ? st.category : 'grey';
      // the indicators behind this customer's category: Red/Amber/Green ones that decided it, or for
      // Grey the required indicators that are not complete and clear (with the reason)
      const why = {};
      if (category === 'grey') { for (const i of ind) if (i.required && !(i.counts && i.category === 'green')) why[i.id] = greyReason(i); }
      else for (const i of ind) if (i.counts && i.category === category && (category !== 'green' || i.required)) why[i.id] = category;
      rows.push({ category, why,
        packages: [...new Set(current.filter((p) => p.personId === c.id).map((p) => p.planId).filter(Boolean))],
        flags: counted.filter((i) => i.category === 'red' || i.category === 'amber').length, counted: counted.length });
    }
    const pkgIds = [...new Set(rows.flatMap((r) => r.packages))];
    const packages = pkgIds.map((id) => ({ id, name: planName(id) })).sort((a, b) => a.name.localeCompare(b.name));
    if (rows.some((r) => !r.packages.length)) packages.push({ id: '_none', name: 'No active package' });
    const inPkg = (r, id) => (id === '_none' ? !r.packages.length : r.packages.includes(id));
    const pkgOk = (r) => !f.pkg || inPkg(r, f.pkg);
    const riskOk = (r) => !f.risk || r.category === f.risk;
    const indOk = (r) => !f.ind || f.ind in r.why;
    const sel = rows.filter((r) => pkgOk(r) && riskOk(r) && indOk(r));
    const count = (list, fn) => list.filter(fn).length;
    // risk categories of the customers in the chosen package (all packages when none is chosen)
    const byCategory = CATS.map((k) => ({ key: k, label: R.CATEGORIES[k], count: count(rows, (r) => pkgOk(r) && indOk(r) && r.category === k) }));
    // packages of the customers in the chosen risk category; a customer with two packages counts under each
    const byPackage = packages.map((p) => ({ id: p.id, name: p.name, count: count(rows, (r) => riskOk(r) && indOk(r) && inPkg(r, p.id)) }));
    // package x category: every combination, so the relationship can be read at a glance
    const matrix = packages.map((p) => ({ id: p.id, name: p.name, total: count(rows, (r) => indOk(r) && inPkg(r, p.id)), cells: CATS.map((k) => ({ key: k, count: count(rows, (r) => indOk(r) && inPkg(r, p.id) && r.category === k) })) }));
    // the risk indicators behind the categories, for the customers in the chosen package and category:
    // how many customers each indicator puts in Red, Amber or Green, or keeps in Grey (and why)
    const indRows = rows.filter((r) => pkgOk(r) && riskOk(r));
    const indicators = R.INDICATORS.map((ind) => {
      const counts = { red: 0, amber: 0, green: 0, grey: 0 }, reasons = {};
      for (const r of indRows) { const w = r.why[ind.id]; if (!w) continue; counts[r.category]++; if (r.category === 'grey') reasons[w] = (reasons[w] || 0) + 1; }
      return { id: ind.id, title: ind.title, short: ind.short, group: R.GROUPS[ind.group], counts, total: counts.red + counts.amber + counts.green + counts.grey, reasons };
    }).filter((x) => x.total).sort((a, b) => (b.counts.red - a.counts.red) || (b.counts.amber - a.counts.amber) || (b.total - a.total) || a.title.localeCompare(b.title));
    // number of identified risks (Red or Amber indicators) among the filtered customers
    const b = { none: 0, 0: 0, 1: 0, 2: 0, 3: 0, '4+': 0 };
    for (const r of sel) { if (!r.counted) b.none++; else b[r.flags >= 4 ? '4+' : r.flags]++; }
    const labels = { none: 'Not assessed', 0: '0 risks', 1: '1 risk', 2: '2 risks', 3: '3 risks', '4+': '4 or more risks' };
    return { filter: f, totalAll: rows.length, total: sel.length, categories: R.CATEGORIES, packages, byCategory, byPackage, matrix, indicators,
      indicatorList: R.INDICATORS.map((i) => ({ id: i.id, title: i.title, group: R.GROUPS[i.group] })), greyReasons: GREY_REASON,
      riskCounts: { buckets: ['none', '0', '1', '2', '3', '4+'].map((k) => ({ key: k, label: labels[k], count: b[k] })), failed } };
  }

  // ================================================================ policies
  async function policy(key) {
    const row = await docs.findOne('app_policies', { id: key });
    return { key, title: POLICY_TITLE[key], content: row ? row.content || '' : '', attachment: row && row.attachment ? { name: row.attachment.name, size: row.attachment.size, mime: row.attachment.mime } : null,
      version: row ? row.version || 0 : 0, updatedAt: row ? row.updatedAt || null : null, updatedBy: row ? row.updatedByName || null : null };
  }
  async function savePolicy(key, changes, admin, action) {
    const row = await docs.findOne('app_policies', { id: key });
    const at = now();
    const next = { content: row ? row.content || '' : '', attachment: row ? row.attachment || null : null, ...changes };
    if (row) await docs.insert('app_policy_versions', { id: uid(), policy: key, version: row.version || 0, content: row.content || '', attachment: row.attachment || null, updatedAt: row.updatedAt || null, updatedBy: row.updatedBy || null, updatedByName: row.updatedByName || null, replacedAt: at });
    const doc = { title: POLICY_TITLE[key], ...next, version: (row ? row.version || 0 : 0) + 1, updatedAt: at, updatedBy: admin.id, updatedByName: admin.name };
    if (row) await docs.update('app_policies', key, doc); else await docs.insert('app_policies', { id: key, ...doc, createdAt: at });
    await audit(admin.id, 'policy.' + action, null, { policy: key, version: doc.version });
    return doc;
  }

  // ================================================================ leave
  async function nurseRows() {
    const list = await scheduler.nurses();
    const out = [];
    for (const n of list) { const prof = await staff.profileOf(n.user.id); out.push({ user: n.user, prof }); }
    return out;
  }
  function leaveView(l, n, names) {
    const t = todayIST();
    return { id: l.id, nurseId: n.user.id, nurseName: n.user.name, employeeId: n.prof.employeeId, from: l.from, to: l.to, days: daysIn(l.from, l.to), type: l.type || 'other', typeName: LEAVE_TYPES[l.type || 'other'],
      status: l.status || 'approved', statusName: LEAVE_STATUS[l.status || 'approved'], reason: l.reason || '', createdAt: l.createdAt || null, createdBy: names[l.createdBy] || null,
      decidedAt: l.decidedAt || null, decidedBy: names[l.decidedBy] || null, decisionNote: l.decisionNote || null, affected: l.affected || [], history: (l.history || []).map((h) => ({ ...h, by: names[h.by] || null })),
      current: leaveCounts(l) && l.from <= t && t <= l.to, upcoming: leaveCounts(l) && l.from > t, legacy: !l.status };
  }
  // the visits a leave touches: moved to a free nurse when possible, otherwise left for the office
  async function applyLeave(n, l, admin) {
    // Record the leave as approved first, so the auto-assigner already sees the nurse as unavailable
    // and never hands a released visit straight back to them. The caller's own save follows.
    const fresh = await staff.profileOf(n.user.id);
    const cur = fresh.leave || [];
    const block = { ...(cur.find((x) => x.id === l.id) || {}), ...l, status: 'approved' };
    await docs.update('app_staff', fresh.id, { leave: cur.some((x) => x.id === l.id) ? cur.map((x) => (x.id === l.id ? block : x)) : [...cur, block], updatedAt: now() });
    const clash = (await docs.find('app_schedule', { nurseId: n.user.id, date: { $gte: l.from, $lte: l.to } })).filter((v) => ACTIVE.includes(v.status));
    const affected = [];
    for (const v of clash) {
      await docs.update('app_schedule', v.id, { nurseId: null, slotKey: null, start: null, end: null, status: 'awaiting_assignment', officeToldAt: null, history: [...(v.history || []), { at: now(), by: admin.id, byRole: 'admin', action: 'unassigned', from: n.user.id, note: 'Nurse on approved leave' }] });
      const r = await scheduler.assign(v.id, { by: admin.id, byRole: 'admin', note: 'Reassigned because the nurse is on approved leave' });
      const after = await docs.findOne('app_schedule', { id: v.id });
      const to = after && after.nurseId ? await docs.findOne('app_users', { id: after.nurseId }) : null;
      affected.push({ visitId: v.id, reference: v.reference, date: v.date, slot: v.slot, customerName: v.customerName || null, personId: v.personId || null, serviceName: v.serviceName || null,
        result: r.ok ? 'reassigned' : 'awaiting_assignment', newNurse: to ? to.name : null, at: now() });
    }
    if (affected.some((a) => a.result === 'awaiting_assignment')) {
      await scheduler.notify(await scheduler.admins(), { kind: 'leave-conflict', title: 'Visits need a nurse', body: `${n.user.name}'s leave (${l.from} to ${l.to}) leaves ${affected.filter((a) => a.result === 'awaiting_assignment').length} visit(s) without a nurse.`, link: '#/office/scheduler/leave' });
    }
    return affected;
  }
  function overlapping(prof, l, exceptId) {
    return (prof.leave || []).find((x) => x.id !== exceptId && (leaveCounts(x) || x.status === 'pending') && x.from <= l.to && l.from <= x.to);
  }

  // ================================================================ routes
  async function handle(req, res, parts, url, user) {
    const p = parts.join('/');
    const isAdmin = user.role === 'admin';

    // ---- policy attachment upload (raw file body, office only)
    if (parts[0] === 'policies' && POLICY_TITLE[parts[1]] && parts[2] === 'attachment' && req.method === 'POST') {
      if (!isAdmin) throw forbidden();
      const buf = await readRaw(req);
      if (!buf.length) return json(res, 400, { ok: false, message: 'Choose a file to upload.' });
      if (buf.length > MAX_FILE) return json(res, 413, { ok: false, message: 'That file is larger than 5 MB.' });
      const mime = sniff(buf);
      if (mime !== 'application/pdf') return json(res, 415, { ok: false, message: 'Please upload the policy as a PDF.' });
      let name = '';
      try { name = decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch { name = ''; }
      name = clean(name, 120) || POLICY_TITLE[parts[1]] + '.pdf';
      const fileId = uid();
      await docs.insert('app_files', { id: fileId, personId: null, kind: 'policy', mime, data: buf.toString('base64'), createdAt: now() });
      const doc = await savePolicy(parts[1], { attachment: { fileId, name, mime, size: buf.length } }, user, 'attachment');
      return json(res, 201, { ok: true, updatedAt: doc.updatedAt, version: doc.version });
    }
    const body = req.method === 'GET' || (req.method === 'DELETE' && !req.headers['content-type']) ? {} : await ctx.readJson(req);
    req.body = body; // read once: the main router may read it again

    // ================================================================ medical documents: what was read from one document
    // (customers and the office; nurses see only the processing status in their submissions)
    if (parts[0] === 'people' && parts[2] === 'records' && parts[4] === 'extraction' && parts.length === 5 && req.method === 'GET') {
      if (user.role === 'caregiver') throw forbidden();
      const person = await visiblePerson(user, parts[1]);
      if (!historyAllowed(user)) throw forbidden();
      const rec = await docs.findOne('app_records', { id: String(parts[3]), personId: person.id });
      if (!rec || rec.removed) throw notFound();
      return json(res, 200, { ok: true, name: rec.name, ...(await ctx.documents.summary(rec)) });
    }
    if (parts[0] === 'admin' && parts[1] === 'documents') {
      if (!isAdmin) throw forbidden();
      if (parts.length === 2 && req.method === 'GET') {
        const want = String(url.searchParams.get('status') || 'open');
        const rows = (await docs.find('app_records', { removed: { $ne: true } }, { sort: { uploadedAt: -1 } })).filter((r) => r.processing);
        const pick = want === 'all' ? rows : want === 'open' ? rows.filter((r) => ['needs_review', 'failed', 'processing', 'uploaded', 'extracted'].includes(r.processing.status)) : rows.filter((r) => r.processing.status === want);
        const people = await docs.find('app_people', { id: { $in: [...new Set(pick.map((r) => r.personId))] } });
        const users = await docs.find('app_users', { id: { $in: [...new Set(pick.map((r) => r.uploadedBy))] } });
        const counts = {}; for (const r of rows) counts[r.processing.status] = (counts[r.processing.status] || 0) + 1;
        return json(res, 200, { ok: true, counts, statuses: ctx.documents.STATUS, rows: pick.slice(0, 200).map((r) => ({ id: r.id, name: r.name, personId: r.personId, personName: (people.find((x) => x.id === r.personId) || {}).name || r.personId,
          uploadedBy: (users.find((u) => u.id === r.uploadedBy) || {}).name || 'KareIQ', uploadedByRole: r.uploadedByRole || null, uploadedAt: r.uploadedAt, docType: r.docTypeLabel || null,
          processing: ctx.documents.statusOf(r), pending: r.processing.pending || 0, stored: r.processing.stored || 0, error: r.processing.status === 'failed' ? r.processing.lastError : null, attempts: r.processing.attempts || 0 })) });
      }
      const rec = await docs.findOne('app_records', { id: String(parts[2] || '') });
      if (!rec || rec.removed) throw notFound();
      if (parts.length === 3 && req.method === 'GET') {
        const ex = (await docs.find('app_extractions', { recordId: rec.id }, { sort: { createdAt: 1 } })).filter((x) => x.status !== 'superseded');
        const person = await docs.findOne('app_people', { id: rec.personId });
        const up = await docs.findOne('app_users', { id: rec.uploadedBy });
        return json(res, 200, { ok: true, record: { id: rec.id, name: rec.name, category: rec.category, personId: rec.personId, personName: person ? person.name : rec.personId, mime: rec.mime, size: rec.size, sha256: rec.sha256 || null,
          uploadedBy: up ? up.name : 'KareIQ', uploadedByRole: rec.uploadedByRole || null, uploadedAt: rec.uploadedAt, docType: rec.docTypeLabel || null, sections: rec.sections || [], dates: rec.dates || null, processing: rec.processing || null, status: ctx.documents.statusOf(rec) },
          extractions: ex, glucose: vitals.GLUCOSE_CONTEXTS });
      }
      if (parts.length === 4 && parts[3] === 'retry' && req.method === 'POST') {
        const st = rec.processing ? rec.processing.status : null;
        if (st && !['failed', 'uploaded', 'needs_review'].includes(st)) return json(res, 409, { ok: false, message: 'Only a failed document, one waiting for review, or one never processed can be read again.' });
        if (st === 'needs_review') { await audit(user.id, 'document.reread', rec.personId, { record: rec.id }); ctx.documents.enqueue(rec.id, { force: true }); return json(res, 202, { ok: true }); }
        await docs.update('app_records', rec.id, { processing: { ...(rec.processing || {}), status: 'uploaded', attempts: 0, retryable: false, nextRetryAt: null, updatedAt: now() } });
        await audit(user.id, 'document.retry', rec.personId, { record: rec.id });
        ctx.documents.enqueue(rec.id);
        return json(res, 202, { ok: true });
      }
      if (parts.length === 4 && parts[3] === 'close' && req.method === 'POST') {
        const out = await ctx.documents.close(rec.id, user, body.note);
        return out.status === 200 ? json(res, 200, { ok: true }) : json(res, out.status, { ok: false, message: out.message || 'Not possible.' });
      }
    }
    if (parts[0] === 'admin' && parts[1] === 'extractions' && parts.length === 3 && req.method === 'POST') {
      if (!isAdmin) throw forbidden();
      const out = await ctx.documents.review(String(parts[2]), body, user);
      if (out.status === 200) return json(res, 200, { ok: true, duplicate: Boolean(out.duplicate) });
      return json(res, out.status, { ok: false, message: out.message || 'Please check the highlighted fields.', errors: out.errors || {} });
    }

    // ================================================================ Assessment (nurses): Regular Checkup and Onboarding Customer
    if (p === 'forms/regular-checkup' && req.method === 'GET') {
      if (user.role !== 'caregiver' && !isAdmin) throw forbidden();
      const limits = Object.fromEntries(checkup.READINGS.map((k) => [k, vitals.LIMITS[k]]).concat([['systolic', vitals.LIMITS.systolic], ['diastolic', vitals.LIMITS.diastolic], ['chol', vitals.LIMITS.chol]]));
      return json(res, 200, { ok: true, ...checkup.definitions(), limits, glucose: vitals.GLUCOSE_CONTEXTS });
    }
    if (p === 'forms/onboarding' && req.method === 'GET') {
      if (user.role !== 'caregiver' && !isAdmin) throw forbidden();
      return json(res, 200, { ok: true, ...onboarding.definitions() });
    }
    // past Regular Checkups for one customer: when and by whom only (nurses do not see health history)
    if (parts[0] === 'people' && parts[2] === 'checkups' && parts.length === 3 && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1]);
      if (user.role === 'family') throw forbidden();
      if (user.role === 'caregiver' && !(await careTeam(user, person.id))) throw forbidden();
      const rows = await docs.find('app_visits', { personId: person.id, form: 'regular_checkup' }, { sort: { at: -1 }, limit: 30 });
      const names = Object.fromEntries((await docs.find('app_users', { id: { $in: [...new Set(rows.map((v) => v.by))] } })).map((u) => [u.id, u.name]));
      return json(res, 200, { ok: true, rows: rows.map((v) => ({ id: v.id, at: v.at, inTime: v.inTime || null, outTime: v.outTime || null, by: names[v.by] || v.caregiverName || 'Nurse', mine: v.by === user.id, createdAt: v.createdAt })) });
    }
    if (parts[0] === 'people' && parts[2] === 'onboarding' && parts.length === 3) {
      const person = await visiblePerson(user, parts[1]);
      if (user.role === 'family') throw forbidden();
      if (user.role === 'caregiver' && !(await careTeam(user, person.id))) throw forbidden();
      const id = 'onb-' + person.id;
      const view = async (rec) => {
        if (!rec) return null;
        const data = { ...rec.data };
        // nurses see the record read only, with phone numbers and the ID number masked as everywhere else in the nurse portal
        if (user.role === 'caregiver') {
          for (const k of onboarding.PHONE_KEYS) if (data[k]) data[k] = nursing.maskPhone(data[k]);
          if (data.kycIdNumber) data.kycIdNumber = 'XXXX ' + String(data.kycIdNumber).replace(/\s/g, '').slice(-4);
        }
        return { status: 'completed', completedAt: rec.completedAt, completedBy: rec.completedByName, completedByMe: rec.completedBy === user.id, data, age: firstvisit.ageFrom(rec.data.dob), masked: user.role === 'caregiver' };
      };
      if (req.method === 'GET') {
        const rec = await docs.findOne('app_onboarding', { id });
        return json(res, 200, { ok: true, person: { id: person.id, name: person.name }, record: await view(rec), status: rec ? 'completed' : 'not_started',
          canSubmit: !rec && user.role === 'caregiver' && (await canRecord(user, person.id)),
          prefill: rec ? null : { name: person.name || '', gender: person.sex === 'male' ? 'Male' : person.sex === 'female' ? 'Female' : '' } });
      }
      if (req.method !== 'POST') return json(res, 405, { ok: false, message: 'A completed onboarding record cannot be changed or deleted.' });
      if (user.role !== 'caregiver') throw forbidden(); // onboarding is done by the nurse at the first visit; the office views it
      if (!(await canRecord(user, person.id))) throw forbidden();
      const done = await docs.findOne('app_onboarding', { id });
      if (done) return json(res, 409, { ok: false, message: 'Onboarding for ' + person.name + ' was already completed on ' + new Date(done.completedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) + ' by ' + done.completedByName + '. It cannot be submitted again.' });
      if (body.confirm !== true) return json(res, 400, { ok: false, message: 'Please confirm the onboarding is complete.', errors: { confirm: 'Tick to confirm: the record cannot be changed after it is submitted' } });
      const v = onboarding.validate(body.data);
      if (v.errors) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors: v.errors });
      if (!Object.keys(v.data).length) return json(res, 400, { ok: false, message: 'The onboarding form is empty.', errors: { form: 'Fill in the onboarding details before submitting' } });
      const at = now();
      const rec = { id, personId: person.id, data: v.data, status: 'completed', completedAt: at, completedBy: user.id, completedByName: user.name, source: onboarding.definitions().source, createdAt: at, history: [{ at, by: user.id, action: 'submitted' }] };
      // atomic: a second submission (even at the same moment) finds the record there and is refused
      if (!(await docs.insertOnce('app_onboarding', rec))) {
        const first = await docs.findOne('app_onboarding', { id });
        return json(res, 409, { ok: false, message: 'Onboarding for ' + person.name + ' was already completed' + (first ? ' by ' + first.completedByName : '') + '. It cannot be submitted again.' });
      }
      await audit(user.id, 'onboarding.submit', person.id, { fields: Object.keys(v.data).length });
      // the customer's live "Personal and health details": fill only what is still empty there (the office's
      // later edits are never overwritten; the onboarding record itself stays as submitted)
      const detailKeys = new Set(firstvisit.FIELDS.flatMap((f) => [f.k, f.specify].filter(Boolean)));
      const det = await docs.findOne('app_details', { id: 'det-' + person.id });
      const before = det ? det.data || {} : {};
      const merged = { ...before };
      const filled = [];
      for (const [k, val] of Object.entries(v.data)) if (detailKeys.has(k) && (merged[k] == null || merged[k] === '' || (Array.isArray(merged[k]) && !merged[k].length))) { merged[k] = val; filled.push(k); }
      if (filled.length) {
        const version = (det ? det.version : 0) + 1;
        const drec = { personId: person.id, data: merged, version, status: det ? det.status : 'complete', updatedAt: at, updatedBy: user.id, updatedByRole: user.role };
        if (det) await docs.update('app_details', det.id, drec); else await docs.insert('app_details', { id: 'det-' + person.id, ...drec, createdAt: at });
        await docs.insert('app_details_versions', { id: uid(), personId: person.id, version, at, by: user.id, byRole: user.role, status: drec.status, changed: filled, data: merged, source: 'onboarding' });
        const sync = {};
        if (filled.includes('name') && merged.name !== person.name) sync.name = merged.name;
        if (filled.includes('dob')) sync.birthYear = Number(merged.dob.slice(0, 4));
        if (filled.includes('gender') && (merged.gender === 'Male' || merged.gender === 'Female')) sync.sex = merged.gender.toLowerCase();
        if (filled.includes('smoking')) sync.smoker = merged.smoking !== 'Never';
        if (filled.includes('pcDiabetes')) sync.diabetic = true;
        if (Object.keys(sync).length) await docs.update('app_people', person.id, sync);
        await risk.recalc(person.id, 'onboarding', user.id);
      }
      return json(res, 201, { ok: true, completedAt: at, filledDetails: filled.length });
    }

    // ================================================================ policies
    if (parts[0] === 'policies') {
      if (!isAdmin && user.role !== 'family') throw forbidden();
      if (parts.length === 1 && req.method === 'GET') {
        const rows = await docs.find('app_policies');
        return json(res, 200, { ok: true, canEdit: isAdmin, rows: POLICY_LIST.map(([key, title]) => { const r = rows.find((x) => x.id === key); return { key, title, updatedAt: r ? r.updatedAt || null : null, hasContent: Boolean(r && (r.content || r.attachment)) }; }) });
      }
      const key = parts[1];
      if (!POLICY_TITLE[key]) throw notFound();
      if (parts.length === 2 && req.method === 'GET') return json(res, 200, { ok: true, canEdit: isAdmin, policy: await policy(key) });
      if (parts.length === 2 && req.method === 'PUT') {
        if (!isAdmin) throw forbidden(); // families read only; the server refuses every change
        if (typeof body.content !== 'string') return json(res, 400, { ok: false, message: 'Enter the policy text.', errors: { content: 'Required' } });
        const content = body.content.replace(/\r\n/g, '\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '').trim();
        if (content.length > MAX_POLICY_CHARS) return json(res, 400, { ok: false, message: 'The policy text is too long.', errors: { content: 'Too long' } });
        const cur = await docs.findOne('app_policies', { id: key });
        if (cur && (cur.content || '') === content) return json(res, 200, { ok: true, unchanged: true, updatedAt: cur.updatedAt, version: cur.version }); // nothing changed: the date stays
        if (!cur && !content) return json(res, 400, { ok: false, message: 'Enter the policy text.', errors: { content: 'Required' } });
        const doc = await savePolicy(key, { content }, user, 'edit');
        return json(res, 200, { ok: true, updatedAt: doc.updatedAt, version: doc.version });
      }
      if (parts[2] === 'attachment' && parts.length === 3 && req.method === 'GET') {
        const row = await docs.findOne('app_policies', { id: key });
        if (!row || !row.attachment) throw notFound();
        const f = await docs.findOne('app_files', { id: row.attachment.fileId });
        if (!f) throw notFound();
        const buf = Buffer.from(f.data, 'base64');
        const safe = row.attachment.name.replace(/[^\w .()-]/g, '_');
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Length': buf.length, 'Content-Disposition': `${url.searchParams.get('download') ? 'attachment' : 'inline'}; filename="${safe.endsWith('.pdf') ? safe : safe + '.pdf'}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
        res.end(buf);
        return true;
      }
      if (parts[2] === 'attachment' && parts.length === 3 && req.method === 'DELETE') {
        if (!isAdmin) throw forbidden();
        const row = await docs.findOne('app_policies', { id: key });
        if (!row || !row.attachment) throw notFound();
        const doc = await savePolicy(key, { attachment: null }, user, 'attachment-removed'); // the old file stays with the previous version
        return json(res, 200, { ok: true, updatedAt: doc.updatedAt, version: doc.version });
      }
      if (parts[2] === 'versions' && req.method === 'GET') {
        if (!isAdmin) throw forbidden();
        const rows = await docs.find('app_policy_versions', { policy: key }, { sort: { version: -1 }, limit: 30 });
        return json(res, 200, { ok: true, rows: rows.map((v) => ({ version: v.version, updatedAt: v.updatedAt, updatedBy: v.updatedByName, replacedAt: v.replacedAt, length: (v.content || '').length, attachment: v.attachment ? v.attachment.name : null, content: v.content })) });
      }
      throw notFound();
    }

    // ================================================================ assessments
    if (p === 'forms/assessments' && req.method === 'GET') {
      if (user.role !== 'caregiver' && !isAdmin) throw forbidden();
      return json(res, 200, { ok: true, inputs: R.INPUTS, groups: R.INPUT_GROUPS, facts: R.FACTS });
    }
    if (parts[0] === 'people' && parts[2] === 'assessments' && parts.length === 3) {
      const person = await visiblePerson(user, parts[1]);
      if (user.role === 'family') throw forbidden();
      if (user.role === 'caregiver' && !(await careTeam(user, person.id))) throw forbidden();
      // assessments are recorded by the customer's nurse at the visit, as risk checks were; the office reads only
      if (req.method !== 'GET' && user.role !== 'caregiver') throw forbidden();
      if (req.method === 'GET') {
        // what the form needs: the person's facts and when each result was last recorded (no values: nurses do not see history)
        const rows = await docs.find('app_readings', { personId: person.id, voided: false, kind: 'assessment' }, { sort: { measuredAt: -1 } });
        const last = {};
        for (const r of rows) if (!last[r.metric]) last[r.metric] = r.measuredAt;
        const facts = {};
        for (const k of Object.keys(R.FACTS)) if (person[k] !== undefined && person[k] !== null) facts[k] = person[k];
        return json(res, 200, { ok: true, person: { id: person.id, name: person.name, sex: person.sex || null, birthYear: person.birthYear || null }, facts, lastRecorded: last });
      }
      if (req.method === 'POST') {
        if (!(await canRecord(user, person.id))) throw forbidden();
        const a = parseAssessment(body);
        if (a.errors) return json(res, 400, { ok: false, message: a.errors.form || 'Please check the highlighted fields.', errors: a.errors });
        // today: the time it was recorded (so a second result the same day is the latest); earlier days: midday
        const at = a.date === todayIST() ? new Date().toISOString() : a.date + 'T12:00:00+05:30';
        if (Date.parse(at) < trends.registeredMs(person)) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors: { date: 'The date cannot be before the registration date' } });
        const entryId = uid();
        for (const [metric, value] of Object.entries(a.values)) {
          await docs.insert('app_readings', { id: uid(), personId: person.id, metric, value, kind: 'assessment', measuredAt: new Date(at).toISOString(), measuredMs: Date.parse(at),
            source: 'caregiver_assessment', enteredBy: user.id, enteredAt: now(), assessmentId: entryId, voided: false });
        }
        if (Object.keys(a.facts).length) {
          const changes = { ...a.facts };
          if (changes.diabetic !== undefined) changes.diabetic = Boolean(changes.diabetic);
          await docs.update('app_people', person.id, changes);
        }
        await audit(user.id, 'assessment.save', person.id, { results: Object.keys(a.values), facts: Object.keys(a.facts) });
        const st = await risk.recalc(person.id, 'assessment', user.id);
        return json(res, 201, { ok: true, saved: Object.keys(a.values), facts: Object.keys(a.facts), ...(user.role === 'caregiver' ? {} : { risk: st && !st.error ? statusOut(st, user) : null }) });
      }
    }

    // ================================================================ risk status
    if (parts[0] === 'people' && parts[2] === 'risk' && parts.length === 3 && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1]);
      // nurses never receive risk results (the engine still runs on what they record or upload)
      if (user.role === 'caregiver') throw forbidden();
      const st = await risk.status(person.id);
      return json(res, 200, { ok: true, status: statusOut(st, user) });
    }
    if (parts[0] === 'people' && parts[2] === 'risk' && parts[3] === 'history' && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1]);
      if (!historyAllowed(user)) throw forbidden();
      const rows = await risk.history(person.id, 60);
      return json(res, 200, { ok: true, rows: rows.map((s) => ({ id: s.id, category: s.category, categoryName: R.CATEGORIES[s.category], previous: s.previous || null, reason: s.reason, responsible: s.responsible, trigger: s.trigger, at: s.at })) });
    }

    // ================================================================ notes from the care team (Health details > Notes)
    if (parts[0] === 'people' && parts[2] === 'notes' && parts.length === 3 && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1]);
      if (!historyAllowed(user)) throw Object.assign(new Error('Notes are shared with the family and the office team only.'), { status: 403 });
      const reg = trends.registeredMs(person);
      const visits = (await docs.find('app_visits', { personId: person.id }, { sort: { at: -1 } })).filter((v) => v.note && Date.parse(v.at) >= reg);
      const ids = [...new Set(visits.map((v) => v.by))];
      const users = ids.length ? await docs.find('app_users', { id: { $in: ids } }) : [];
      return json(res, 200, { ok: true, person: { id: person.id, name: person.name }, rows: visits.map((v) => ({ id: v.id, at: v.at, by: (users.find((u) => u.id === v.by) || {}).name || 'Care team', note: v.note })) });
    }

    // ================================================================ office only from here
    if (parts[0] !== 'admin') return undefined;
    if (!isAdmin) throw forbidden();
    const ap = parts.slice(1).join('/');

    if (ap === 'summary' && req.method === 'GET') return json(res, 200, { ok: true, ...(await summary({ risk: url.searchParams.get('risk'), pkg: url.searchParams.get('pkg'), ind: url.searchParams.get('ind') })) });

    if (ap === 'risk/rules' && req.method === 'GET') {
      const v = await risk.rulesView();
      const pk = await docs.find('app_plans');
      const packages = [...new Set(pk.map((x) => x.planId).filter(Boolean))].map((id) => ({ id, name: planName(id) })).sort((a, b) => a.name.localeCompare(b.name));
      return json(res, 200, { ok: true, ...v, packages });
    }
    if (parts[1] === 'risk' && parts[2] === 'rules' && parts.length === 4 && req.method === 'POST') {
      const out = await risk.saveRule(parts[3], body, user);
      if (out.error) return json(res, 400, { ok: false, message: out.error });
      if (out.errors) return json(res, 400, { ok: false, message: out.errors.form || 'Please check the highlighted fields.', errors: out.errors });
      await audit(user.id, body.withdraw ? 'risk.rules.withdraw' : 'risk.rules.approve', null, { indicator: parts[3], approver: out.row.approverName || null });
      const n = await risk.recalcAll(body.withdraw ? 'rules withdrawn' : 'rules approved', user.id);
      return json(res, 200, { ok: true, recalculated: n });
    }
    if (ap === 'risk/recalculate' && req.method === 'POST') {
      const n = await risk.recalcAll('recalculated by the office', user.id);
      await audit(user.id, 'risk.recalculate', null, { people: n });
      return json(res, 200, { ok: true, recalculated: n });
    }

    // ---- Leave Record Management
    if (ap === 'leave' && req.method === 'GET') {
      const rows = await nurseRows();
      const ids = new Set();
      for (const n of rows) for (const l of n.prof.leave || []) { ids.add(l.createdBy); ids.add(l.decidedBy); (l.history || []).forEach((h) => ids.add(h.by)); }
      const users = await docs.find('app_users', { id: { $in: [...ids].filter(Boolean) } });
      const names = Object.fromEntries(users.map((u) => [u.id, u.name]));
      const list = [];
      for (const n of rows) for (const l of n.prof.leave || []) list.push(leaveView(l, n, names));
      list.sort((a, b) => (a.from < b.from ? 1 : a.from > b.from ? -1 : 0));
      const t = todayIST();
      return json(res, 200, { ok: true, types: LEAVE_TYPES, statuses: LEAVE_STATUS, nurses: rows.map((n) => ({ id: n.user.id, name: n.user.name, employeeId: n.prof.employeeId, active: n.user.active })),
        rows: list, onLeaveNow: list.filter((x) => x.current), upcoming: list.filter((x) => x.upcoming).sort((a, b) => (a.from < b.from ? -1 : 1)), pending: list.filter((x) => x.status === 'pending'), today: t,
        needsNurse: list.reduce((n, x) => n + x.affected.filter((a) => a.result === 'awaiting_assignment').length, 0) });
    }
    if (parts[1] === 'leave' && (parts.length === 2 || parts.length === 4 || parts.length === 5)) {
      const bad = (message, errors) => json(res, 400, { ok: false, message, errors });
      if (parts.length === 2 && req.method === 'POST') {
        const nurse = await docs.findOne('app_users', { id: String(body.nurseId || ''), role: 'caregiver' });
        if (!nurse) return bad('Choose a nurse.', { nurseId: 'Required' });
        const err = {};
        if (!isDate(body.from)) err.from = 'Choose the first day';
        if (!isDate(body.to)) err.to = 'Choose the last day';
        if (!err.from && !err.to && body.to < body.from) err.to = 'The last day cannot be before the first day';
        if (!LEAVE_TYPES[body.type]) err.type = 'Choose the type of leave';
        const status = body.status === 'pending' ? 'pending' : 'approved';
        if (Object.keys(err).length) return bad('Please check the highlighted fields.', err);
        const prof = await staff.profileOf(nurse.id);
        const l = { id: uid(), from: body.from, to: body.to, type: body.type, status, reason: clean(body.reason, 300), createdBy: user.id, createdAt: now(), history: [{ at: now(), by: user.id, action: status === 'approved' ? 'added-approved' : 'added' }] };
        const clash = overlapping(prof, l);
        if (clash) return bad(`This overlaps ${nurse.name}'s ${LEAVE_STATUS[clash.status || 'approved'].toLowerCase()} leave from ${clash.from} to ${clash.to}.`, { from: 'Overlaps other leave' });
        if (status === 'approved') { l.decidedBy = user.id; l.decidedAt = now(); l.affected = await applyLeave({ user: nurse, prof }, l, user); }
        await docs.update('app_staff', prof.id, { leave: [...(prof.leave || []), l], updatedAt: now() });
        await audit(user.id, 'nurse.leave', null, { employee: prof.employeeId, from: l.from, to: l.to, status });
        return json(res, 201, { ok: true, id: l.id, affected: l.affected || [] });
      }
      // admin/leave/:nurseId/:leaveId[/approve|reject|cancel]
      const nurse = await docs.findOne('app_users', { id: String(parts[2] || ''), role: 'caregiver' });
      if (!nurse) throw notFound();
      const prof = await staff.profileOf(nurse.id);
      const list = prof.leave || [];
      const l = list.find((x) => x.id === parts[3]);
      if (!l) throw notFound();
      const save = async (changes, action, note) => {
        const nl = { ...l, ...changes, history: [...(l.history || []), { at: now(), by: user.id, action, note: note || null }] };
        await docs.update('app_staff', prof.id, { leave: list.map((x) => (x.id === l.id ? nl : x)), updatedAt: now() });
        await audit(user.id, 'nurse.leave.' + action, null, { employee: prof.employeeId, from: nl.from, to: nl.to });
        return nl;
      };
      if (parts.length === 4 && req.method === 'PATCH') {
        const st = l.status || 'approved';
        if (st === 'rejected' || st === 'cancelled') return bad('Rejected or cancelled leave cannot be edited. Add a new record instead.');
        const nl = { from: isDate(body.from) ? body.from : l.from, to: isDate(body.to) ? body.to : l.to, type: LEAVE_TYPES[body.type] ? body.type : l.type || 'other', reason: body.reason !== undefined ? clean(body.reason, 300) : l.reason };
        if (nl.to < nl.from) return bad('Please check the highlighted fields.', { to: 'The last day cannot be before the first day' });
        const clash = overlapping(prof, nl, l.id);
        if (clash) return bad(`This overlaps other leave from ${clash.from} to ${clash.to}.`, { from: 'Overlaps other leave' });
        let affected = l.affected || [];
        if (st === 'approved' && (nl.from < l.from || nl.to > l.to)) affected = affected.concat(await applyLeave({ user: nurse, prof }, { ...nl, id: l.id }, user)); // newly covered days
        await save({ ...nl, affected }, 'edited', `${l.from}–${l.to} → ${nl.from}–${nl.to}`);
        return json(res, 200, { ok: true });
      }
      if (parts.length === 5 && req.method === 'POST' && ['approve', 'reject', 'cancel'].includes(parts[4])) {
        const st = l.status || 'approved';
        const note = clean(body.note, 300);
        if (parts[4] === 'approve') {
          if (st !== 'pending') return bad('Only pending leave can be approved.');
          const clash = overlapping(prof, l, l.id);
          if (clash) return bad(`This overlaps other leave from ${clash.from} to ${clash.to}.`);
          const affected = await applyLeave({ user: nurse, prof }, l, user);
          await save({ status: 'approved', decidedBy: user.id, decidedAt: now(), decisionNote: note || null, affected }, 'approved', note);
          return json(res, 200, { ok: true, affected });
        }
        if (parts[4] === 'reject') {
          if (st !== 'pending') return bad('Only pending leave can be rejected.');
          if (!note) return bad('Please give a reason.', { note: 'Required' });
          await save({ status: 'rejected', decidedBy: user.id, decidedAt: now(), decisionNote: note }, 'rejected', note);
          return json(res, 200, { ok: true });
        }
        if (st === 'rejected' || st === 'cancelled') return bad('This leave is already ' + st + '.');
        // cancelling never moves visits back automatically: the office decides
        await save({ status: 'cancelled', decidedBy: user.id, decidedAt: now(), decisionNote: note || null }, 'cancelled', note);
        return json(res, 200, { ok: true });
      }
    }
    return undefined;
  }

  const statusOut = (st, user) => riskengine.view(st, user.role);

  return { handle, LEAVE_TYPES, LEAVE_STATUS, POLICY_LIST, leaveCounts, summary };
}

module.exports = { create, POLICY_LIST, LEAVE_TYPES, LEAVE_STATUS, leaveCounts };
