// Business growth for the team dashboards (office API fin/*, hr/*, ops/*, sales/*; access in src/app/access.js):
//   Finance     add-on services billed (paid extra services a family booked, once the visit is done), package
//               income month by month (new, renewed, ended without renewal, spend per family), every discount given
//   HR          nurse skills per service (the scheduler and nurse suggestions offer only nurses who can do the visit),
//               nurse performance from real work (visits, on time, family ratings) shown in the review
//   Operations  package visits used this month against what each package includes, the same nurse for each family
//   Sales       upgrade suggestions (by package and time with KareIQ, never health data), family referrals, campaign results
// Every figure comes from stored records. Prices of add-on services, the visits each package includes per month and
// referral rewards are business rules: the team enters them, and they show as "not set" until then.
const { planName } = require('./products');
const packinfo = require('./packinfo');
const care = require('./care');
const orderlock = require('./orderlock');
const { BRAND_NAMES } = require('./finance');

const ymd = (s) => String(s || '').slice(0, 10);
const month = (s) => String(s || '').slice(0, 7);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
const isMonth = (s) => /^\d{4}-\d{2}$/.test(s || '');
const days = (a, b) => Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const lastDay = (m) => { const d = new Date(m + '-01T12:00:00Z'); d.setUTCMonth(d.getUTCMonth() + 1); d.setUTCDate(0); return d.toISOString().slice(0, 10); };
function monthsBack(today, n) { const out = []; const d = new Date(today.slice(0, 7) + '-01T12:00:00Z'); for (let i = n - 1; i >= 0; i--) out.push(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)).toISOString().slice(0, 7)); return out; }
const monthsBetween = (a, b) => Math.max(0, (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7)) - (b.slice(8, 10) < a.slice(8, 10) ? 1 : 0));
const r2 = (n) => Math.round(n * 100) / 100;

const ADDON_SERVICES = ['bystander', 'physiotherapy', 'teleconsultation', 'spongebath', 'blood-collection', 'dressing'];
const SERVICE_LABELS = { 'home-visit': 'Home visit (package)', 'first-visit': 'First visit (assessment)', bystander: 'Bystander', physiotherapy: 'Physiotherapy', teleconsultation: 'Teleconsultation', spongebath: 'Sponge bath', 'blood-collection': 'Blood collection', dressing: 'Dressing session' };
// the package checks a nurse may be trained for (from the package monitoring list)
const ASSESSMENTS = { falls: 'Fall risk tests (TUG, balance, reach, chair stand)', mental: 'Mental health questionnaire', ecg: 'ECG at home', bodycomp: 'Body composition', eyes: 'Eye sight check', sugar: 'Blood sugar testing' };
const PACKAGE_VISITS = ['home-visit', 'first-visit'];
// the next package up, by package only
const UPGRADE = { homestart: 'homeplus', homeplus: 'homeelite' };
const CAMPAIGN_KINDS = { camp: 'Health camp', event: 'Event or talk', society: 'Housing society drive', online: 'Online ad', print: 'Print or radio', other: 'Other' };
const STAFF_ROLES = ['admin', 'caregiver', 'finance', 'hr', 'operations', 'sales'];

function create(ctx) {
  const { docs, uid, now, todayIST, json, notFound, clean, audit, store, scheduler, staff, finance, namesFor, office } = ctx;
  const q = (url, k) => (url.searchParams.get(k) || '').trim();
  const fail = (res, message, errors) => json(res, 400, { ok: false, message: message || 'Please check the highlighted fields.', errors });
  const money = (s) => Math.round(Number(String(s == null ? '' : s).replace(/[^0-9.]/g, '')) * 100) / 100;
  async function setting(id) { return (await docs.findOne('app_settings', { id })) || {}; }
  async function saveSetting(id, data) { if (await docs.findOne('app_settings', { id })) await docs.update('app_settings', id, data); else await docs.insert('app_settings', { id, ...data }); }
  const { sendReport } = require('./teams');
  const people = async (ids) => { const list = [...new Set(ids.filter(Boolean))]; const rows = list.length ? await docs.find('app_people', { id: { $in: list } }) : []; return Object.fromEntries(rows.map((p) => [p.id, p.name])); };
  async function contactsOf(ids) {
    ids = [...new Set(ids.filter(Boolean))];
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
  const isRealPlan = (p) => !p.included && p.planId && p.status !== 'pending' && p.status !== 'cancelled' && p.startDate;

  // ================================================================ Finance
  // ---- add-on services: a paid extra service (not one of the package's free sessions) is charged once its visit is done,
  // at Finance's price for the service less the family's package discount on add-ons
  async function syncAddons() {
    const prices = (await setting('fin-addon-prices')).prices || {};
    const [bookings, visits, charges, plans] = await Promise.all([docs.find('enquiries', { kind: 'service' }), docs.find('app_schedule', { status: 'completed' }), docs.find('app_addon_charges'), docs.find('app_plans')]);
    const done = new Set(charges.map((c) => c.bookingId));
    const waitingPrice = [];
    for (const b of bookings) {
      if (b.free || done.has(b.id) || !ADDON_SERVICES.includes(b.service)) continue;
      const v = visits.find((x) => x.sourceKey === 'service:' + b.id);
      if (!v) continue;
      const price = prices[b.service];
      if (!(price > 0)) { waitingPrice.push({ bookingId: b.id, reference: b.reference, service: b.service, personId: b.personId, date: v.date }); continue; }
      // the package discount on add-ons of the Kare@Home package active on the visit day
      const tier = plans.find((p) => p.personId === b.personId && care.DISCOUNT[p.planId] && p.startDate && p.startDate <= v.date && (!p.endDate || p.endDate >= v.date) && p.status !== 'cancelled');
      const pct = tier ? care.DISCOUNT[tier.planId] : 0;
      await docs.insert('app_addon_charges', { id: uid(), bookingId: b.id, reference: b.reference, personId: b.personId, service: b.service, date: v.date, visitId: v.id, listPrice: price, discountPct: pct, discountPlan: tier ? tier.planId : null,
        discount: r2(price * pct / 100), amount: r2(price - price * pct / 100), status: 'unbilled', createdAt: now() });
    }
    return waitingPrice;
  }
  async function addonBills() {
    const [bills, pays] = await Promise.all([docs.find('app_addon_bills', {}, { sort: { createdAt: -1 } }), docs.find('app_payments')]);
    const today = todayIST();
    return bills.map((b) => {
      const paid = pays.filter((p) => p.addonBillId === b.id && p.kind === 'payment').reduce((s, p) => s + p.amount, 0);
      const due = r2(Math.max(0, b.amount - paid));
      return { ...b, paid: r2(paid), due, status: due <= 0 ? 'paid' : paid > 0 ? 'partial' : 'unpaid', overdueDays: due > 0 && b.dueDate < today ? days(b.dueDate, today) : 0 };
    });
  }
  async function addonBillPdf(b, customer) {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const doc = await PDFDocument.create();
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const pg = doc.addPage([595, 842]);
    const t = (s) => String(s == null ? '' : s).replace(/₹/g, 'Rs. ').replace(/[–—]/g, '-').replace(/[^\x20-\x7E]/g, '');
    const rs = (n) => 'Rs. ' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    let y = 790;
    const line = (s, x, size, f, col) => pg.drawText(t(s), { x, y, size: size || 10, font: f || font, color: col || rgb(0.1, 0.1, 0.12) });
    const right = (s, xr, size, f) => { const w = (f || font).widthOfTextAtSize(t(s), size || 10); pg.drawText(t(s), { x: xr - w, y, size: size || 10, font: f || font }); };
    line('KareIQ', 40, 20, bold, rgb(0.05, 0.47, 0.42)); right('Add-on services', 555, 16, bold); y -= 20;
    line('For ' + customer + ' (' + b.personId + ')', 40); right('No. ' + b.number, 555); y -= 14;
    line('Date ' + b.date + ' . Please pay by ' + b.dueDate, 40, 9.5); y -= 28;
    line('Service', 40, 10, bold); line('Visit', 250, 10, bold); right('Price', 400, 10, bold); right('Package discount', 480, 10, bold); right('Amount', 555, 10, bold); y -= 6;
    pg.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) }); y -= 16;
    for (const c of b.lines) { line(SERVICE_LABELS[c.service] || c.service, 40); line(c.date + ' (' + c.reference + ')', 250, 9); right(rs(c.listPrice), 400); right(c.discountPct ? c.discountPct + '%' : '-', 480); right(rs(c.amount), 555); y -= 16; if (y < 120) break; }
    pg.drawLine({ start: { x: 40, y: y + 8 }, end: { x: 555, y: y + 8 }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) }); y -= 10;
    line('Total', 40, 12, bold); right(rs(b.amount), 555, 12, bold); y -= 30;
    line('Free sessions included in your package are not charged. Prices include GST where it applies.', 40, 8.5);
    return Buffer.from(await doc.save());
  }
  // ---- package income month by month
  async function growth(n) {
    const today = todayIST(), months = monthsBack(today, n);
    const [plans, pays, inv] = await Promise.all([docs.find('app_plans'), docs.find('app_payments'), finance.invoices()]);
    const real = plans.filter(isRealPlan);
    const planOfPay = Object.fromEntries(inv.map((i) => [i.planId, i]));
    const later = (p) => real.some((x) => x.id !== p.id && x.personId === p.personId && x.product === p.product && x.startDate > p.startDate);
    const earlier = (p) => real.some((x) => x.id !== p.id && x.personId === p.personId && x.product === p.product && x.startDate < p.startDate);
    const rows = months.map((m) => {
      const end = lastDay(m), first = m + '-01';
      const active = real.filter((p) => p.startDate <= end && (!p.endDate || p.endDate >= end) && p.status !== 'cancelled');
      const started = real.filter((p) => month(p.startDate) === m);
      const ended = real.filter((p) => p.endDate && month(p.endDate) === m && p.endDate < today);
      const mine = pays.filter((p) => month(p.receivedAt) === m && p.planId && planOfPay[p.planId]);
      const income = r2(mine.reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0));
      const families = new Set(mine.filter((p) => p.kind === 'payment').map((p) => p.personId)).size;
      return { key: m, active: active.length, activeFamilies: new Set(active.map((p) => p.personId)).size, new: started.filter((p) => !earlier(p)).length, renewed: started.filter(earlier).length,
        ended: ended.length, lost: ended.filter((p) => !later(p)).length, income, payingFamilies: families, perFamily: families ? Math.round(income / families) : 0, first };
    });
    const byPackage = [...new Set(real.map((p) => p.planId))].map((k) => ({ key: k, label: planName(k), active: real.filter((p) => p.planId === k && p.startDate <= today && (!p.endDate || p.endDate >= today)).length })).filter((x) => x.active).sort((a, b) => b.active - a.active);
    const cur = rows[rows.length - 1], prev = rows[rows.length - 2] || null;
    const endedTotal = rows.reduce((s, r) => s + r.ended, 0), renewedTotal = endedTotal ? endedTotal - rows.reduce((s, r) => s + r.lost, 0) : 0;
    return { months: rows, byPackage, current: cur, previous: prev, renewalRate: endedTotal ? Math.round(renewedTotal / endedTotal * 100) : null };
  }
  // ---- every discount given: on quotations, as credit notes, and the package discount on add-ons
  async function discounts(from, to) {
    const [quotes, cns, charges] = await Promise.all([docs.find('app_quotes'), docs.find('app_credit_notes'), docs.find('app_addon_charges')]);
    const names = await people([...cns.map((c) => c.personId), ...charges.map((c) => c.personId)]);
    const by = await namesFor(cns.map((c) => c.createdBy));
    const inR = (d) => d >= from && d <= to;
    const rows = [];
    for (const x of quotes) if ((x.discount || 0) > 0 && ['sent', 'accepted'].includes(x.status) && inR(ymd(x.createdAt))) rows.push({ date: ymd(x.createdAt), kind: 'quote', kindName: 'Quotation', ref: x.number, who: x.name, packageId: x.packageId || null, packageName: x.packageName || '', list: x.total + x.discount, amount: x.discount, pct: x.total + x.discount ? Math.round(x.discount / (x.total + x.discount) * 1000) / 10 : null, by: x.byName || '', note: x.status === 'accepted' ? 'Accepted' : 'Sent' });
    for (const c of cns) if (inR(c.date)) rows.push({ date: c.date, kind: 'credit', kindName: 'Credit note', ref: c.number, who: names[c.personId] || c.personId, packageId: c.packageId || null, packageName: c.packageId ? planName(c.packageId) : '', list: null, amount: c.amount, pct: null, by: by[c.createdBy] || '', note: c.reason });
    for (const c of charges) if (c.discount > 0 && inR(c.date)) rows.push({ date: c.date, kind: 'addon', kindName: 'Package discount on an add-on', ref: c.reference, who: names[c.personId] || c.personId, packageId: c.discountPlan, packageName: planName(c.discountPlan) + ' (' + c.discountPct + '%)', list: c.listPrice, amount: c.discount, pct: c.discountPct, by: 'Package rule', note: SERVICE_LABELS[c.service] || c.service });
    rows.sort((a, b) => (a.date < b.date ? 1 : -1));
    const group = (key, label) => { const m = {}; rows.forEach((r) => { const k = r[key] || 'none'; m[k] = m[k] || { key: k, label: label(r), value: 0, count: 0 }; m[k].value = r2(m[k].value + r.amount); m[k].count++; }); return Object.values(m).sort((a, b) => b.value - a.value); };
    return { from, to, rows, total: r2(rows.reduce((s, r) => s + r.amount, 0)), byKind: group('kind', (r) => r.kindName), byPerson: group('by', (r) => r.by || 'Not recorded'), byPackage: group('packageName', (r) => r.packageName || 'No package') };
  }

  async function financeRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'fin/addons' && req.method === 'GET') {
      const waiting = await syncAddons();
      const [charges, bills, prices] = await Promise.all([docs.find('app_addon_charges', {}, { sort: { date: -1 } }), addonBills(), setting('fin-addon-prices')]);
      const names = await people([...charges.map((c) => c.personId), ...bills.map((b) => b.personId), ...waiting.map((w) => w.personId)]);
      const contacts = await contactsOf(charges.filter((c) => c.status === 'unbilled').map((c) => c.personId));
      const unbilled = charges.filter((c) => c.status === 'unbilled');
      const fam = [...new Set(unbilled.map((c) => c.personId))].map((pid) => { const mine = unbilled.filter((c) => c.personId === pid); return { personId: pid, customer: names[pid] || pid, contact: contacts[pid] || null, count: mine.length, amount: r2(mine.reduce((s, c) => s + c.amount, 0)), charges: mine.map((c) => ({ ...c, serviceName: SERVICE_LABELS[c.service] })) }; });
      return json(res, 200, { ok: true, services: Object.fromEntries(ADDON_SERVICES.map((k) => [k, SERVICE_LABELS[k]])), prices: prices.prices || {}, families: fam,
        waitingPrice: waiting.map((w) => ({ ...w, customer: names[w.personId] || w.personId, serviceName: SERVICE_LABELS[w.service] })),
        bills: bills.map((b) => ({ ...b, customer: names[b.personId] || b.personId })), methods: require('./orders').METHODS,
        totals: { unbilled: r2(unbilled.reduce((s, c) => s + c.amount, 0)), unbilledCount: unbilled.length, owed: r2(bills.reduce((s, b) => s + b.due, 0)), collected: r2(bills.reduce((s, b) => s + b.paid, 0)), waitingPrice: waiting.length } });
    }
    if (p === 'fin/addons/prices' && req.method === 'POST') {
      const prices = {};
      for (const k of ADDON_SERVICES) { const v = body.prices && body.prices[k]; if (v === '' || v == null) continue; const n = money(v); if (!(n > 0)) return fail(res, 'Enter prices in rupees.', { ['p_' + k]: 'Invalid' }); prices[k] = n; }
      await saveSetting('fin-addon-prices', { prices, updatedBy: user.id, updatedAt: now() });
      await audit(user.id, 'finance.addon.prices', null, prices);
      await syncAddons();
      return json(res, 200, { ok: true });
    }
    if (p === 'fin/addons/bill' && req.method === 'POST') {
      const pid = String(body.personId || '');
      const mine = (await docs.find('app_addon_charges', { personId: pid })).filter((c) => c.status === 'unbilled');
      if (!mine.length) return fail(res, 'Nothing to bill for this customer.');
      const b = { id: uid(), number: store.makeReference('AO'), personId: pid, date: today, dueDate: addDays(today, 7), amount: r2(mine.reduce((s, c) => s + c.amount, 0)), lines: mine.map((c) => ({ chargeId: c.id, reference: c.reference, service: c.service, date: c.date, listPrice: c.listPrice, discountPct: c.discountPct, amount: c.amount })), by: user.id, byName: user.name, createdAt: now() };
      await docs.insert('app_addon_bills', b);
      for (const c of mine) await docs.update('app_addon_charges', c.id, { status: 'billed', billId: b.id });
      await audit(user.id, 'finance.addon.bill', pid, { number: b.number, amount: b.amount });
      return json(res, 201, { ok: true, number: b.number, id: b.id });
    }
    if (parts[0] === 'fin' && parts[1] === 'addons' && parts[2] === 'charges' && parts[3] && parts[4] === 'waive' && req.method === 'POST') {
      const c = await docs.findOne('app_addon_charges', { id: parts[3] });
      if (!c || c.status !== 'unbilled') throw notFound();
      const reason = clean(body.reason, 200); if (reason.length < 3) return fail(res, null, { reason: 'Say why it is not charged.' });
      await docs.update('app_addon_charges', c.id, { status: 'waived', waived: { at: now(), by: user.id, byName: user.name, reason } });
      await audit(user.id, 'finance.addon.waive', c.personId, { reference: c.reference, amount: c.amount });
      return json(res, 200, { ok: true });
    }
    if (parts[0] === 'fin' && parts[1] === 'addons' && parts[2] === 'bills' && parts[3]) {
      const b = (await addonBills()).find((x) => x.id === parts[3]);
      if (!b) throw notFound();
      if (parts[4] === 'pdf' && req.method === 'GET') {
        const name = (await people([b.personId]))[b.personId] || b.personId;
        const buf = await addonBillPdf(b, name);
        res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': 'attachment; filename="' + b.number + '.pdf"', 'Cache-Control': 'no-store' });
        return res.end(buf);
      }
      if (parts[4] === 'pay' && req.method === 'POST') {
        // one payment at a time per bill (two clicks cannot both pass the "owed" check and overpay it),
        // and a transaction number is reserved for one payment only (src/app/orderlock.js)
        const done = await orderlock.withLock('addon:' + b.id, async () => {
          const bill = (await addonBills()).find((x) => x.id === b.id) || b; // read again under the lock
          const errors = {};
          const amount = money(body.amount); if (!(amount > 0)) errors.amount = 'Enter the amount received.'; else if (amount > bill.due + 0.001) errors.amount = 'At most ' + care.fmt(bill.due) + ' is owed.';
          const METHODS = require('./orders').METHODS;
          if (!METHODS[body.method]) errors.method = 'Choose how it was paid.';
          const ref = clean(body.ref, 60); if (ref.length < 3) errors.ref = 'Enter the transaction or receipt number.';
          if (!errors.ref && await docs.findOne('app_payments', { ref, kind: 'payment' })) errors.ref = 'This transaction number is already recorded.';
          if (!Object.keys(errors).length && !(await orderlock.claimRef(ref, 'addon:' + bill.id))) errors.ref = 'This transaction number is already recorded.';
          if (Object.keys(errors).length) return { errors };
          try {
            await docs.insert('app_payments', { id: uid(), kind: 'payment', planId: null, addonBillId: bill.id, personId: bill.personId, invoiceNo: bill.number, amount, method: body.method, ref, receivedAt: now(), recordedBy: user.id });
          } catch (e) { await orderlock.releaseRef(ref, 'addon:' + bill.id); throw e; }
          await audit(user.id, 'payment.recorded', bill.personId, { invoice: bill.number, amount });
          return { ok: true };
        });
        if (done.busy) return json(res, 409, { ok: false, message: 'A payment for this bill is being recorded right now. Wait a moment and refresh.' });
        if (done.value.errors) return fail(res, null, done.value.errors);
        return json(res, 201, { ok: true });
      }
    }
    if (p === 'fin/growth' && req.method === 'GET') return json(res, 200, { ok: true, ...(await growth(Math.min(24, Math.max(6, Number(q(url, 'months')) || 12)))) });
    if (p === 'fin/discounts' && req.method === 'GET') {
      const from = isDate(q(url, 'from')) ? q(url, 'from') : addDays(today, -90), to = isDate(q(url, 'to')) ? q(url, 'to') : today;
      return json(res, 200, { ok: true, ...(await discounts(from, to)) });
    }
    return undefined;
  }

  // ================================================================ HR
  // ---- nurse skills: the services a nurse may be booked for (used by the scheduler) and the package checks they are trained for
  async function nurses() { return (await scheduler.nurses()).filter((n) => n.user.active); }
  // ---- performance from real work: the last 12 months (or a given period)
  async function performance(userIds, from, to) {
    const [visits, issues, sla] = await Promise.all([docs.find('app_schedule', { nurseId: { $in: userIds }, date: { $gte: from, $lte: to } }), docs.find('app_issues', { type: 'feedback' }), setting('ops-sla')]);
    const grace = Number.isFinite(sla.graceMin) ? sla.graceMin : null;
    const out = {};
    for (const id of userIds) {
      const mine = visits.filter((v) => v.nurseId === id);
      const done = mine.filter((v) => v.status === 'completed');
      const started = mine.filter((v) => v.start && (v.history || []).some((h) => h.action === 'in_progress'));
      const late = started.map((v) => { const h = v.history.find((x) => x.action === 'in_progress'); const d = new Date(Date.parse(h.at) + 330 * 60000); return d.toISOString().slice(0, 10) === v.date ? d.getUTCHours() * 60 + d.getUTCMinutes() - (Number(v.start.slice(0, 2)) * 60 + Number(v.start.slice(3, 5))) : null; }).filter((x) => x != null);
      const ids = new Set(mine.map((v) => v.id));
      const rated = issues.filter((x) => ids.has(x.visitId) && x.rating);
      const missed = mine.filter((v) => v.date < todayIST() && ['assigned', 'accepted'].includes(v.status)).length;
      out[id] = { from, to, assigned: mine.filter((v) => v.status !== 'cancelled').length, completed: done.length, missed,
        onTimePct: grace == null || !late.length ? null : Math.round(late.filter((m) => m <= grace).length / late.length * 100), graceSet: grace != null,
        ratings: rated.length, avgRating: rated.length ? Math.round(rated.reduce((s, x) => s + x.rating, 0) / rated.length * 10) / 10 : null, lowRatings: rated.filter((x) => x.rating <= 2).length };
    }
    return out;
  }
  async function hrRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'hr/skills' && req.method === 'GET') {
      const list = await nurses();
      return json(res, 200, { ok: true, services: Object.fromEntries(Object.keys(SERVICE_LABELS).map((k) => [k, SERVICE_LABELS[k]])), assessments: ASSESSMENTS,
        rows: list.map((n) => { const a = scheduler.profileDefaults(n.profile); const sk = (n.profile && n.profile.skills) || {}; return { userId: n.user.id, name: n.user.name, employeeId: n.profile ? n.profile.employeeId : '', services: a.services || Object.keys(SERVICE_LABELS), allServices: !a.services, assessments: sk.assessments || [], updatedAt: sk.updatedAt || null, updatedByName: sk.updatedByName || null }; }) });
    }
    if (parts[0] === 'hr' && parts[1] === 'skills' && parts[2] && parts.length === 3 && req.method === 'POST') {
      const n = (await nurses()).find((x) => x.user.id === parts[2]);
      if (!n) throw notFound();
      const svc = (Array.isArray(body.services) ? body.services : []).filter((k) => SERVICE_LABELS[k]);
      const asm = (Array.isArray(body.assessments) ? body.assessments : []).filter((k) => ASSESSMENTS[k]);
      if (!svc.length) return fail(res, 'Tick at least one service the nurse can do.', { services: 'Required' });
      const prof = await staff.profileOf(n.user.id);
      const all = Object.keys(SERVICE_LABELS).every((k) => svc.includes(k));
      await docs.update('app_staff', prof.id, { availability: { ...(prof.availability || {}), services: all ? null : svc }, skills: { assessments: asm, updatedBy: user.id, updatedByName: user.name, updatedAt: now() },
        history: [...(prof.history || []), { at: now(), by: user.id, byName: user.name, field: 'skills', from: null, to: svc.length + ' services, ' + asm.length + ' checks', note: null }] });
      await audit(user.id, 'hr.skills', null, { employee: prof.employeeId, services: svc.length, checks: asm.length });
      return json(res, 200, { ok: true });
    }
    if (p === 'hr/performance' && req.method === 'GET') {
      const from = isDate(q(url, 'from')) ? q(url, 'from') : addDays(today, -365), to = isDate(q(url, 'to')) ? q(url, 'to') : today;
      const list = await nurses();
      const perf = await performance(list.map((n) => n.user.id), from, to);
      return json(res, 200, { ok: true, from, to, rows: list.map((n) => ({ userId: n.user.id, name: n.user.name, employeeId: n.profile ? n.profile.employeeId : '', ...perf[n.user.id] })) });
    }
    return undefined;
  }

  // ================================================================ Operations
  // ---- package visits used this month, against the visits each package includes (set by Operations)
  async function visitsUsed(m) {
    const [plans, visits, bookings, set] = await Promise.all([docs.find('app_plans'), docs.find('app_schedule', { date: { $gte: m + '-01', $lte: lastDay(m) } }), docs.find('enquiries', { kind: 'service' }), setting('ops-visit-allowance')]);
    const allow = set.perMonth || {};
    const end = lastDay(m), start = m + '-01';
    const active = plans.filter((p) => isRealPlan(p) && p.startDate <= end && (!p.endDate || p.endDate >= start));
    const pids = [...new Set(active.map((p) => p.personId))];
    const names = await people(pids);
    return pids.map((pid) => {
      const mine = active.filter((p) => p.personId === pid);
      const main = mine.find((p) => care.TIERS.includes(p.planId)) || mine[0];
      const vs = visits.filter((v) => v.personId === pid && PACKAGE_VISITS.includes(v.service));
      const done = vs.filter((v) => v.status === 'completed').length, planned = vs.filter((v) => ['awaiting_assignment', 'assigned', 'accepted', 'in_progress'].includes(v.status)).length, cancelled = vs.filter((v) => v.status === 'cancelled').length;
      const included = Number.isFinite(allow[main.planId]) ? allow[main.planId] : null;
      // the package's free sessions a year (physiotherapy or bystander)
      const tier = mine.find((p) => care.FREE[p.planId]);
      let free = null;
      if (tier) { const y0 = tier.startDate; const used = bookings.filter((b) => b.personId === pid && b.free && ymd(b.createdAt) >= y0 && ymd(b.createdAt) <= addDays(y0, 364)).length; free = { total: care.FREE[tier.planId], used, left: Math.max(0, care.FREE[tier.planId] - used) }; }
      const left = included == null ? null : included - done - planned;
      return { personId: pid, customer: names[pid] || pid, packageId: main.planId, packageName: planName(main.planId), brandName: BRAND_NAMES[main.product === 'karenest' ? 'karenest' : 'karehome'] || '', included, done, planned, cancelled, left,
        state: included == null ? 'not_set' : left < 0 ? 'over' : left > 0 && m <= todayIST().slice(0, 7) && days(todayIST(), end) < 7 ? 'short' : 'ok', free };
    }).sort((a, b) => ({ over: 0, short: 1, ok: 2, not_set: 3 }[a.state] - { over: 0, short: 1, ok: 2, not_set: 3 }[b.state]) || (a.customer < b.customer ? -1 : 1));
  }
  // ---- same nurse for each family: of the completed visits in the period, the share done by the family's regular nurse
  async function continuity(from, to) {
    const [visits, links] = await Promise.all([docs.find('app_schedule', { status: 'completed', date: { $gte: from, $lte: to } }), docs.find('app_links', { kind: 'caregiver' })]);
    const pids = [...new Set(visits.map((v) => v.personId).filter(Boolean))];
    const [names, nurseNames] = await Promise.all([people(pids), namesFor(visits.map((v) => v.nurseId))]);
    const rows = pids.map((pid) => {
      const mine = visits.filter((v) => v.personId === pid && v.nurseId);
      const count = {}; mine.forEach((v) => { count[v.nurseId] = (count[v.nurseId] || 0) + 1; });
      const linked = links.filter((l) => l.personId === pid).map((l) => l.userId);
      const top = Object.keys(count).sort((a, b) => count[b] - count[a])[0];
      const regular = linked.find((id) => count[id]) || top;
      return { personId: pid, customer: names[pid] || pid, visits: mine.length, nurses: Object.keys(count).length, regular: regular ? { id: regular, name: nurseNames[regular] || '', visits: count[regular] || 0, assigned: linked.includes(regular) } : null,
        sharePct: mine.length ? Math.round((count[regular] || 0) / mine.length * 100) : null, others: Object.keys(count).filter((id) => id !== regular).map((id) => ({ name: nurseNames[id] || '', visits: count[id] })) };
    }).filter((r) => r.visits).sort((a, b) => a.sharePct - b.sharePct);
    const total = rows.reduce((s, r) => s + r.visits, 0), byRegular = rows.reduce((s, r) => s + (r.regular ? r.regular.visits : 0), 0);
    return { from, to, rows, overallPct: total ? Math.round(byRegular / total * 100) : null, families: rows.length, lowFamilies: rows.filter((r) => r.sharePct < 60 && r.visits >= 3).length };
  }
  async function opsRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'ops/visits-used' && req.method === 'GET') {
      const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
      const rows = await visitsUsed(m);
      const set = await setting('ops-visit-allowance');
      const packs = [...new Set((await docs.find('app_plans')).filter(isRealPlan).map((x) => x.planId))].map((k) => ({ key: k, label: planName(k), perMonth: Number.isFinite((set.perMonth || {})[k]) ? set.perMonth[k] : null }));
      return json(res, 200, { ok: true, month: m, rows, packages: packs, totals: { customers: rows.length, over: rows.filter((r) => r.state === 'over').length, short: rows.filter((r) => r.state === 'short').length, notSet: rows.filter((r) => r.state === 'not_set').length, done: rows.reduce((s, r) => s + r.done, 0) } });
    }
    if (p === 'ops/visits-used/allowance' && req.method === 'POST') {
      const perMonth = {};
      for (const [k, v] of Object.entries(body.perMonth || {})) { if (v === '' || v == null) continue; const n = Number(v); if (!(Number.isInteger(n) && n >= 0 && n <= 62)) return fail(res, 'Enter a whole number of visits (0 to 62).', { ['a_' + k]: 'Invalid' }); perMonth[String(k).slice(0, 40)] = n; }
      await saveSetting('ops-visit-allowance', { perMonth, updatedBy: user.id, updatedAt: now() });
      await audit(user.id, 'ops.allowance', null, perMonth);
      return json(res, 200, { ok: true });
    }
    if (p === 'ops/continuity' && req.method === 'GET') return json(res, 200, { ok: true, ...(await continuity(isDate(q(url, 'from')) ? q(url, 'from') : addDays(today, -90), isDate(q(url, 'to')) ? q(url, 'to') : today)) });
    return undefined;
  }

  // ================================================================ Sales
  // ---- upgrade suggestions: by package and time with KareIQ only
  async function upgrades(minMonths) {
    const today = todayIST();
    const [plans, leads, all] = await Promise.all([docs.find('app_plans'), office.leadRows(), packinfo.all()]);
    const nest = all.find((x) => x.id === 'kareplus') || all.find((x) => x.product === 'karenest' && x.model !== 'quote');
    const active = plans.filter((p) => isRealPlan(p) && p.startDate <= today && (!p.endDate || p.endDate >= today) && (UPGRADE[p.planId] || (p.planId === 'homeelite' && nest)));
    const pids = [...new Set(active.map((p) => p.personId))];
    const [names, contacts] = await Promise.all([people(pids), contactsOf(pids)]);
    return active.filter((p) => !plans.some((x) => x.personId === p.personId && x.product === 'karenest' && x.status !== 'cancelled' && (!x.endDate || x.endDate >= today) && !x.included) || UPGRADE[p.planId]).map((p) => {
      const to = UPGRADE[p.planId] || nest.id;
      const pkTo = all.find((x) => x.id === to), pkFrom = all.find((x) => x.id === p.planId);
      const nowPrice = pkFrom ? packinfo.priceOf(pkFrom, p.months).amount : null, toPrice = pkTo ? packinfo.priceOf(pkTo, p.months).amount : null;
      const lead = leads.find((l) => l.upgradeOf === p.id) || leads.find((l) => l.source === 'upgrade' && l.personId === p.personId && l.status !== 'lost');
      return { planId: p.id, personId: p.personId, customer: names[p.personId] || p.personId, contact: contacts[p.personId] || null, from: p.planId, fromName: planName(p.planId), to, toName: pkTo ? pkTo.name : planName(to),
        months: monthsBetween(p.startDate, today), startDate: p.startDate, endDate: p.endDate, nowPrice, toPrice, extra: nowPrice != null && toPrice != null ? toPrice - nowPrice : null, termMonths: p.months || null,
        lead: lead ? { type: lead.type, id: lead.id, enquiryId: lead.enquiryId, statusName: lead.statusName, assignedName: lead.assignedName } : null };
    }).filter((r) => r.months >= minMonths).sort((a, b) => b.months - a.months);
  }
  async function campaignView(list) {
    const [leads, orders] = await Promise.all([office.leadRows(), docs.find('app_orders', { status: 'paid' })]);
    return list.map((c) => {
      const mine = leads.filter((l) => l.campaignId === c.id);
      const paid = mine.map((l) => l.orderId && orders.find((o) => o.id === l.orderId)).filter(Boolean);
      const revenue = paid.reduce((s, o) => s + (o.amount || 0), 0);
      const won = mine.filter((l) => l.status === 'converted' || (l.orderId && orders.some((o) => o.id === l.orderId))).length;
      return { ...c, kindName: CAMPAIGN_KINDS[c.kind] || c.kind, leads: mine.length, open: mine.filter((l) => ['new', 'contacted', 'follow_up'].includes(l.status)).length, won, paidCount: paid.length, revenue,
        conversionPct: mine.length ? Math.round(won / mine.length * 100) : null, costPerLead: c.cost && mine.length ? Math.round(c.cost / mine.length) : null, costPerWin: c.cost && won ? Math.round(c.cost / won) : null };
    });
  }
  async function salesRoute(req, res, parts, url, user, body) {
    const p = parts.join('/');
    const today = todayIST();
    if (p === 'sales/upgrades' && req.method === 'GET') {
      const min = [0, 1, 3, 6, 12].includes(Number(q(url, 'min'))) ? Number(q(url, 'min')) : 3;
      const rows = await upgrades(min);
      return json(res, 200, { ok: true, minMonths: min, rows, totals: { candidates: rows.length, withLead: rows.filter((r) => r.lead).length, extra: rows.reduce((s, r) => s + (r.extra || 0), 0) } });
    }
    if (p === 'sales/upgrades' && req.method === 'POST') {
      const r = (await upgrades(0)).find((x) => x.planId === String(body.planId || ''));
      if (!r) throw notFound();
      if (r.lead) return fail(res, 'There is already an upgrade lead for this customer (' + r.lead.enquiryId + ').');
      const c = r.contact || {}, at = now();
      const rec = await store.add('enquiries', 'KQ', { name: c.name || r.customer, phone: c.phone || '', email: c.email || '', interest: r.to === 'homeplus' || r.to === 'homeelite' ? 'karehome' : 'karenest', interestName: 'Upgrade: ' + r.fromName + ' to ' + r.toName, package: r.to,
        message: r.customer + ' has had ' + r.fromName + ' for ' + r.months + ' month' + (r.months === 1 ? '' : 's') + '.', source: 'upgrade', kind: 'enquiry', careForName: r.customer, personId: r.personId, upgradeOf: r.planId,
        createdAt: at, assignedTo: user.id, assignedAt: at, leadStatus: 'new', status: 'new', expectedValue: r.toPrice || undefined, expectedMonths: r.termMonths || undefined, addedBy: user.id,
        leadHistory: [{ at, by: user.name, byId: user.id, action: 'added', note: 'Upgrade suggestion: ' + r.fromName + ' to ' + r.toName }] });
      await audit(user.id, 'lead.add', r.personId, { lead: rec.reference, source: 'upgrade' });
      return json(res, 201, { ok: true, reference: rec.reference, id: rec.id });
    }
    // ---- referrals: the families who referred a lead; finding a family by its customer name or phone (3 characters at least)
    if (p === 'sales/referrers' && req.method === 'GET') {
      const t = q(url, 'q').toLowerCase();
      if (t.length < 3) return json(res, 200, { ok: true, rows: [] });
      const ppl = (await docs.find('app_people')).filter((x) => x.active !== false);
      const plans = await docs.find('app_plans');
      const withPlan = ppl.filter((x) => plans.some((pl) => pl.personId === x.id && isRealPlan(pl)));
      const contacts = await contactsOf(withPlan.map((x) => x.id));
      const digits = t.replace(/\D/g, '');
      const rows = withPlan.filter((x) => x.name.toLowerCase().includes(t) || (contacts[x.id] && ((contacts[x.id].name || '').toLowerCase().includes(t) || (digits.length >= 4 && String(contacts[x.id].phone || '').includes(digits))))).slice(0, 8);
      return json(res, 200, { ok: true, rows: rows.map((x) => ({ personId: x.id, customer: x.name, family: contacts[x.id] ? contacts[x.id].name : null })) });
    }
    if (p === 'sales/referrals' && req.method === 'GET') {
      const [leads, orders, set] = await Promise.all([office.leadRows(), docs.find('app_orders', { status: 'paid' }), setting('sales-referral')]);
      const refd = leads.filter((l) => l.referredBy);
      const names = await people(refd.map((l) => l.referredBy));
      const groups = [...new Set(refd.map((l) => l.referredBy))].map((pid) => {
        const mine = refd.filter((l) => l.referredBy === pid);
        const joined = mine.filter((l) => l.status === 'converted' || (l.orderId && orders.some((o) => o.id === l.orderId)));
        return { personId: pid, customer: names[pid] || pid, referred: mine.length, joined: joined.length, rewardsGiven: mine.filter((l) => l.referralReward).length, rewardsDue: joined.filter((l) => !l.referralReward).length,
          leads: mine.map((l) => ({ type: l.type, id: l.id, enquiryId: l.enquiryId, name: l.name, packageName: l.packageName, statusName: l.statusName, joined: joined.includes(l), reward: l.referralReward || null, createdAt: l.createdAt })) };
      }).sort((a, b) => b.joined - a.joined || b.referred - a.referred);
      return json(res, 200, { ok: true, rows: groups, reward: set.text || null, canSetReward: user.role === 'admin', totals: { families: groups.length, referred: refd.length, joined: groups.reduce((s, g) => s + g.joined, 0), rewardsDue: groups.reduce((s, g) => s + g.rewardsDue, 0) } });
    }
    if (p === 'sales/referrals/reward-rule' && req.method === 'POST') {
      if (user.role !== 'admin') return json(res, 403, { ok: false, message: 'The referral reward is set by the office admin.' });
      await saveSetting('sales-referral', { text: clean(body.text, 200) || null, updatedBy: user.id, updatedAt: now() });
      await audit(user.id, 'sales.referral.rule', null, {});
      return json(res, 200, { ok: true });
    }
    if (p === 'sales/referrals/reward' && req.method === 'POST') {
      const col = body.type === 'booking' ? 'bookings' : 'enquiries';
      const raw = (await store.readAll(col)).find((r) => r.id === String(body.id || ''));
      if (!raw || !raw.referredBy) throw notFound();
      const lead = (await office.leadRows()).find((l) => l.id === raw.id);
      const orders = await docs.find('app_orders', { status: 'paid' });
      if (!(lead.status === 'converted' || (lead.orderId && orders.some((o) => o.id === lead.orderId)))) return fail(res, 'A reward is given once the referred family has joined.');
      if (raw.referralReward) return fail(res, 'The reward for this referral is already recorded.');
      const what = clean(body.reward, 120); if (what.length < 2) return fail(res, null, { reward: 'Say what was given (e.g. ₹500 off the next renewal).' });
      await store.update(col, raw.id, { referralReward: { what, note: clean(body.note, 200) || null, at: now(), by: user.id, byName: user.name }, leadHistory: [...(raw.leadHistory || []), { at: now(), by: user.name, byId: user.id, action: 'note', note: 'Referral reward given: ' + what }] });
      await audit(user.id, 'sales.referral.reward', raw.referredBy, { lead: raw.reference });
      return json(res, 200, { ok: true });
    }
    // ---- campaigns: health camps, society drives, events and ads, with the leads each brought
    if (p === 'sales/campaigns' && req.method === 'GET') {
      const list = (await docs.find('app_campaigns', {}, { sort: { date: -1 } })).filter((c) => !c.archived || q(url, 'all'));
      const rows = await campaignView(list);
      return json(res, 200, { ok: true, rows, kinds: CAMPAIGN_KINDS, totals: { campaigns: rows.length, leads: rows.reduce((s, r) => s + r.leads, 0), won: rows.reduce((s, r) => s + r.won, 0), revenue: rows.reduce((s, r) => s + r.revenue, 0), cost: rows.reduce((s, r) => s + (r.cost || 0), 0) } });
    }
    if (p === 'sales/campaigns' && req.method === 'POST') {
      const errors = {};
      const name = clean(body.name, 80); if (name.length < 3) errors.name = 'Name the campaign.';
      if (!CAMPAIGN_KINDS[body.kind]) errors.kind = 'Choose the kind.';
      if (!isDate(body.date)) errors.date = 'Choose the date (the first day, for a longer campaign).';
      const cost = body.cost === '' || body.cost == null ? null : money(body.cost); if (cost != null && !(cost >= 0)) errors.cost = 'Enter the cost in rupees, or leave it empty.';
      if (Object.keys(errors).length) return fail(res, null, errors);
      const existing = body.id ? await docs.findOne('app_campaigns', { id: String(body.id) }) : null;
      const c = { name, kind: body.kind, date: body.date, place: clean(body.place, 120) || null, cost, note: clean(body.note, 300) || null, updatedBy: user.id, updatedAt: now() };
      if (existing) await docs.update('app_campaigns', existing.id, c); else await docs.insert('app_campaigns', { id: uid(), ...c, createdBy: user.id, createdByName: user.name, createdAt: now() });
      await audit(user.id, 'sales.campaign', null, { campaign: name });
      return json(res, existing ? 200 : 201, { ok: true });
    }
    if (parts[0] === 'sales' && parts[1] === 'campaigns' && parts[2] && parts[3] === 'archive' && req.method === 'POST') {
      const c = await docs.findOne('app_campaigns', { id: parts[2] });
      if (!c) throw notFound();
      await docs.update('app_campaigns', c.id, { archived: !c.archived });
      return json(res, 200, { ok: true });
    }
    return undefined;
  }

  // ---- reports (CSV, or PDF with ?format=pdf)
  async function reports(req, res, parts, url) {
    const kind = parts[2].replace(/\.(csv|pdf)$/, ''), key = parts[0] + '/' + kind, today = todayIST();
    if (key === 'fin/growth') {
      const g = await growth(12);
      return sendReport(res, url, 'package-income-' + today, ['Month', 'Active packages', 'Families with a package', 'New', 'Renewed', 'Ended', 'Ended without renewal', 'Package income (INR)', 'Paying families', 'Income per paying family (INR)'], g.months.map((r) => [r.key, r.active, r.activeFamilies, r.new, r.renewed, r.ended, r.lost, r.income, r.payingFamilies, r.perFamily]));
    }
    if (key === 'fin/discounts') {
      const d = await discounts(isDate(q(url, 'from')) ? q(url, 'from') : addDays(today, -90), isDate(q(url, 'to')) ? q(url, 'to') : today);
      return sendReport(res, url, 'discounts-' + d.from + '-to-' + d.to, ['Date', 'Kind', 'Reference', 'For', 'Package', 'Discount (INR)', 'Percent', 'Given by', 'Note'], d.rows.map((r) => [r.date, r.kindName, r.ref, r.who, r.packageName, r.amount, r.pct == null ? '' : r.pct, r.by, r.note || '']));
    }
    if (key === 'fin/addons') {
      const bills = await addonBills();
      const names = await people(bills.map((b) => b.personId));
      return sendReport(res, url, 'add-on-bills-' + today, ['Bill', 'Date', 'Customer', 'Services', 'Amount (INR)', 'Paid (INR)', 'Owed (INR)', 'Days overdue'], bills.map((b) => [b.number, b.date, names[b.personId] || b.personId, b.lines.length, b.amount, b.paid, b.due, b.overdueDays]));
    }
    if (key === 'ops/visits-used') {
      const m = isMonth(q(url, 'month')) ? q(url, 'month') : today.slice(0, 7);
      const rows = await visitsUsed(m);
      return sendReport(res, url, 'package-visits-' + m, ['Customer', 'Package', 'Included this month', 'Done', 'Planned', 'Left', 'Cancelled', 'Free sessions left this year'], rows.map((r) => [r.customer, r.packageName, r.included == null ? 'not set' : r.included, r.done, r.planned, r.left == null ? '' : r.left, r.cancelled, r.free ? r.free.left + ' of ' + r.free.total : '']));
    }
    if (key === 'ops/continuity') {
      const d = await continuity(addDays(today, -90), today);
      return sendReport(res, url, 'same-nurse-' + today, ['Customer', 'Visits (90 days)', 'Nurses', 'Regular nurse', 'By the regular nurse %'], d.rows.map((r) => [r.customer, r.visits, r.nurses, r.regular ? r.regular.name : '', r.sharePct]));
    }
    if (key === 'sales/campaigns') {
      const rows = await campaignView(await docs.find('app_campaigns', {}, { sort: { date: -1 } }));
      return sendReport(res, url, 'campaigns-' + today, ['Campaign', 'Kind', 'Date', 'Place', 'Cost (INR)', 'Leads', 'Joined', 'Conversion %', 'Paid revenue (INR)', 'Cost per lead (INR)'], rows.map((r) => [r.name, r.kindName, r.date, r.place || '', r.cost == null ? '' : r.cost, r.leads, r.won, r.conversionPct == null ? '' : r.conversionPct, r.revenue, r.costPerLead == null ? '' : r.costPerLead]));
    }
    if (key === 'sales/upgrades') {
      const rows = await upgrades(0);
      return sendReport(res, url, 'upgrade-suggestions-' + today, ['Customer', 'Now', 'Suggested', 'Months with KareIQ', 'Price now (INR)', 'Suggested price (INR)', 'Lead'], rows.map((r) => [r.customer, r.fromName, r.toName, r.months, r.nowPrice == null ? '' : r.nowPrice, r.toPrice == null ? '' : r.toPrice, r.lead ? r.lead.enquiryId : '']));
    }
    return undefined;
  }

  // ---- "Get your dashboard ready": the business settings each team enters once, with where to enter them
  async function setup(role) {
    const today = todayIST(), year = today.slice(0, 4);
    const item = (label, done, href, detail, by) => ({ label, done: Boolean(done), href, detail: detail || null, by: by || null });
    if (role === 'finance') {
      const [gst, bud, pr, recon] = await Promise.all([setting('fin-gst'), setting('fin-budget'), setting('fin-addon-prices'), docs.find('app_recon', {}, { limit: 1 })]);
      const lines = Object.keys(BRAND_NAMES), rates = gst.rates || {}, prices = pr.prices || {};
      const noRate = lines.filter((b) => !Number.isFinite(rates[b])).length, noPrice = ADDON_SERVICES.filter((k) => !(prices[k] > 0)).length;
      return [item('GST rate for each service line', !noRate, '#/office/fin/gst', noRate ? noRate + ' not set' : null),
        item('Monthly budgets for ' + year, bud.years && bud.years[year] && Object.keys(bud.years[year]).length, '#/office/fin/pnl'),
        item('Prices of add-on services', !noPrice, '#/office/fin/addons', noPrice ? noPrice + ' of ' + ADDON_SERVICES.length + ' not set' : null),
        item('First reconciliation with a gateway or bank statement', recon.length, '#/office/fin/recon')];
    }
    if (role === 'hr') {
      const [pol, list] = await Promise.all([setting('hr-leave-policy'), docs.find('app_users', { active: true })]);
      const staffUsers = list.filter((u) => STAFF_ROLES.includes(u.role));
      const profs = await docs.find('app_staff', { userId: { $in: staffUsers.map((u) => u.id) } });
      const prof = (u) => profs.find((x) => x.userId === u.id) || {};
      const noSalary = staffUsers.filter((u) => !prof(u).salary).length, nurses = staffUsers.filter((u) => u.role === 'caregiver');
      const noSkills = nurses.filter((u) => !prof(u).skills).length, noProb = staffUsers.filter((u) => !prof(u).probation).length;
      return [item('Leave allowances for each kind of leave', pol.allowances && Object.keys(pol.allowances).length, '#/office/hr/leave'),
        item('A salary for every employee', !noSalary, '#/office/hr/salaries', noSalary ? noSalary + ' without a salary' : null),
        item('Skills for every nurse', !noSkills, '#/office/hr/skills', noSkills ? noSkills + ' nurse' + (noSkills === 1 ? '' : 's') + ' not recorded' : null),
        item('Probation recorded for every employee', !noProb, '#/office/hr/reviews', noProb ? noProb + ' not recorded' : null)];
    }
    if (role === 'operations') {
      const [sla, allow, sched, sup, plans] = await Promise.all([setting('ops-sla'), setting('ops-visit-allowance'), scheduler.settings(), docs.find('app_supplies'), docs.find('app_plans')]);
      const used = [...new Set(plans.filter((p) => isRealPlan(p) && (!p.endDate || p.endDate >= today)).map((p) => p.planId))];
      const noAllow = used.filter((k) => !Number.isFinite((allow.perMonth || {})[k])).length;
      const items = sup.filter((x) => !x.archived), noLevel = items.filter((x) => x.reorderLevel == null).length;
      return [item('On-time grace period and target', Number.isFinite(sla.graceMin) && Number.isFinite(sla.targetPct), '#/office/ops/timeliness'),
        item('Visits each package includes a month', used.length && !noAllow, '#/office/ops/visits-used', noAllow ? noAllow + ' package' + (noAllow === 1 ? '' : 's') + ' not set' : null),
        item('Holidays for ' + year, sched.holidays.some((h) => String(h.date).slice(0, 4) === year), '#/office/scheduler/holidays'),
        item('Supplies with a reorder level', items.length && !noLevel, '#/office/ops/supplies', !items.length ? 'No supplies added yet' : noLevel ? noLevel + ' without a reorder level' : null)];
    }
    if (role === 'sales') {
      const [tpl, tg, cm, rf] = await Promise.all([setting('sales-templates'), setting('sales-targets'), setting('sales-commission'), setting('sales-referral')]);
      return [item('At least one message template', (tpl.rows || []).some((t) => !t.archived), '#/office/sales/templates'),
        item('Targets for this month', tg.months && tg.months[today.slice(0, 7)] && Object.keys(tg.months[today.slice(0, 7)]).length, '#/office/sales/targets', null, 'admin'),
        item('Commission rate', Number.isFinite(cm.ratePct), '#/office/sales/commission', null, 'admin'),
        item('Referral reward', rf.text, '#/office/sales/referrals', null, 'admin')];
    }
    return [];
  }

  async function handle(req, res, parts, url, user, body) {
    const team = { fin: 'finance', hr: 'hr', ops: 'operations', sales: 'sales' }[parts[0]];
    if (team && parts[1] === 'setup' && parts.length === 2 && req.method === 'GET') { const items = await setup(team); return json(res, 200, { ok: true, items, done: items.filter((x) => x.done).length, total: items.length }); }
    if (['fin', 'hr', 'ops', 'sales'].includes(parts[0]) && parts[1] === 'reports' && parts.length === 3 && req.method === 'GET') { const r = await reports(req, res, parts, url); if (r !== undefined) return r; }
    if (parts[0] === 'fin') return financeRoute(req, res, parts, url, user, body);
    if (parts[0] === 'hr') return hrRoute(req, res, parts, url, user, body);
    if (parts[0] === 'ops') return opsRoute(req, res, parts, url, user, body);
    if (parts[0] === 'sales') return salesRoute(req, res, parts, url, user, body);
    return undefined;
  }
  // for "Needs your attention"
  async function attention(role) {
    if (role === 'finance') {
      await syncAddons();
      const charges = (await docs.find('app_addon_charges')).filter((c) => c.status === 'unbilled');
      const prices = (await setting('fin-addon-prices')).prices || {};
      return [{ label: 'families with add-on services to bill', count: new Set(charges.map((c) => c.personId)).size, href: '#/office/fin/addons', tone: 'warn' }, { label: 'add-on services without a price', count: ADDON_SERVICES.filter((k) => !(prices[k] > 0)).length, href: '#/office/fin/addons', tone: '' }];
    }
    if (role === 'operations') { const rows = await visitsUsed(todayIST().slice(0, 7)); return [{ label: 'customers given more visits than their package includes', count: rows.filter((r) => r.state === 'over').length, href: '#/office/ops/visits-used', tone: 'warn' }, { label: 'customers short of their package visits this month', count: rows.filter((r) => r.state === 'short').length, href: '#/office/ops/visits-used', tone: 'warn' }]; }
    if (role === 'sales') { const rows = await upgrades(3); return [{ label: 'customers to offer an upgrade', count: rows.filter((r) => !r.lead).length, href: '#/office/sales/upgrades', tone: '' }]; }
    return [];
  }
  return { handle, attention, performance, syncAddons };
}

module.exports = { create, ADDON_SERVICES, ASSESSMENTS, CAMPAIGN_KINDS, SERVICE_LABELS };
