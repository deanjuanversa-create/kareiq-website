// The office (admin) side: analytics, leads, customers, financials, employees, the nurse scheduler
// and the contact access audit. Admin-only; every figure comes from stored records.
const { PRODUCTS, planName } = require('./products');
const packinfo = require('./packinfo');
const { SLOTS, STATUS, ACTIVE, DAYS } = require('./scheduler');
const { KYC_KINDS, DEPARTMENTS, UNITS } = require('./staff');
const { BRAND_OF, BRAND_NAMES } = require('./finance');
const { POLICIES, CATEGORIES } = require('./nursing');
const care = require('./care');

const LEAD_STATUS = { new: 'New', contacted: 'Contacted', follow_up: 'Follow-up pending', converted: 'Converted', lost: 'Lost / closed' };
const SOURCES = { 'kare-at-home': 'Kare@Home website', karehome: 'Kare@Home website', karenest: 'KareNest website', kareiq: 'KareIQ website', app: 'KareIQ app', admin: 'Office' };
const PAGE = 25;
const ymd = (s) => String(s || '').slice(0, 10);
const month = (s) => String(s || '').slice(0, 7);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '');
function monthsBack(today, n) { const out = []; const d = new Date(today.slice(0, 7) + '-01T12:00:00Z'); for (let i = n - 1; i >= 0; i--) { const x = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - i, 1)); out.push(x.toISOString().slice(0, 7)); } return out; }
function monthsBetween(from, to) { const out = []; let d = new Date(from.slice(0, 7) + '-01T12:00:00Z'); const end = to.slice(0, 7); while (out.length < 60) { const m = d.toISOString().slice(0, 7); out.push(m); if (m >= end) break; d = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1)); } return out; }
function paginate(rows, url) { const page = Math.max(1, Number(url.searchParams.get('page')) || 1); const size = Math.min(100, Math.max(5, Number(url.searchParams.get('size')) || PAGE)); return { page, size, total: rows.length, pages: Math.max(1, Math.ceil(rows.length / size)), rows: rows.slice((page - 1) * size, page * size) }; }

function create(ctx) {
  const { docs, uid, now, todayIST, json, notFound, bad, clean, audit, store, scheduler, staff, finance, nursing, readRaw, sniff, namesFor, normalisePhone } = ctx;
  const q = (url, k) => (url.searchParams.get(k) || '').trim();

  // ---------------------------------------------------------------- customers (one row per person)
  async function customerRows() {
    const [people, plans, links, users, details] = await Promise.all([docs.find('app_people'), docs.find('app_plans'), docs.find('app_links'), docs.find('app_users'), docs.find('app_details')]);
    return people.map((x) => {
      const own = plans.filter((p) => p.personId === x.id && !p.included && p.status !== 'ended');
      const all = plans.filter((p) => p.personId === x.id && !p.included);
      const fam = links.filter((l) => l.personId === x.id && l.kind === 'family').map((l) => users.find((u) => u.id === l.userId)).filter(Boolean);
      const nurses = links.filter((l) => l.personId === x.id && l.kind === 'caregiver').map((l) => users.find((u) => u.id === l.userId)).filter(Boolean);
      const det = details.find((d) => d.personId === x.id || d.id === 'det-' + x.id);
      return {
        id: x.id, name: x.name, registeredAt: ymd(x.registeredAt || x.createdAt), active: own.some((p) => p.status === 'active'),
        status: own.some((p) => p.status === 'active') ? 'active' : own.some((p) => p.status === 'paused') ? 'paused' : own.some((p) => p.status === 'pending') ? 'pending' : all.length ? 'inactive' : 'no_plan',
        brands: [...new Set(all.map((p) => BRAND_OF(p.planId, p.product)))], packages: [...new Set(all.map((p) => p.planId).filter(Boolean))],
        currentPackages: own.filter((p) => p.status === 'active' || p.status === 'paused').map((p) => planName(p.planId)),
        phone: (fam[0] && fam[0].phone) || (det && det.data && det.data.phone1) || null, email: (fam[0] && fam[0].email) || (det && det.data && det.data.email) || null,
        family: fam.map((u) => u.name), nurses: nurses.map((u) => ({ id: u.id, name: u.name })), hasPlan: all.length > 0
      };
    });
  }
  function filterCustomers(rows, url) {
    const brand = q(url, 'brand'), pkg = q(url, 'package'), status = q(url, 'status'), from = q(url, 'from'), to = q(url, 'to'), nurse = q(url, 'nurse'), text = q(url, 'q').toLowerCase();
    return rows.filter((c) => (!brand || c.brands.includes(brand)) && (!pkg || c.packages.includes(pkg)) &&
      (!status || (status === 'active' ? c.status === 'active' : status === 'inactive' ? c.status !== 'active' : c.status === status)) &&
      (!isDate(from) || c.registeredAt >= from) && (!isDate(to) || c.registeredAt <= to) && (!nurse || c.nurses.some((n) => n.id === nurse)) &&
      (!text || c.name.toLowerCase().includes(text) || c.id.toLowerCase().includes(text) || (text.replace(/\D/g, '').length >= 4 && String(c.phone || '').replace(/\D/g, '').includes(text.replace(/\D/g, ''))) || String(c.email || '').toLowerCase().includes(text)));
  }

  async function customerAnalytics(url) {
    const today = todayIST();
    const rows = filterCustomers((await customerRows()).filter((c) => c.hasPlan), url);
    const from = isDate(q(url, 'from')) ? q(url, 'from') : null, to = isDate(q(url, 'to')) ? q(url, 'to') : today;
    const newFrom = from || new Date(Date.parse(today + 'T12:00:00Z') - 30 * 86400000).toISOString().slice(0, 10);
    const months = from ? monthsBetween(from, to) : monthsBack(today, 12);
    const byBrand = Object.keys(BRAND_NAMES).map((k) => ({ key: k, label: BRAND_NAMES[k], value: rows.filter((c) => c.brands.includes(k)).length }));
    const pk = {}; rows.forEach((c) => c.packages.forEach((p) => { pk[p] = (pk[p] || 0) + 1; }));
    const regs = months.map((m) => ({ key: m, value: rows.filter((c) => month(c.registeredAt) === m).length }));
    let run = rows.filter((c) => month(c.registeredAt) < months[0]).length;
    return {
      kpis: { total: rows.length, active: rows.filter((c) => c.status === 'active').length, inactive: rows.filter((c) => c.status !== 'active').length, newCustomers: rows.filter((c) => c.registeredAt >= newFrom && c.registeredAt <= to).length, newFrom },
      byBrand, byPackage: Object.keys(pk).map((k) => ({ key: k, label: planName(k), value: pk[k] })).sort((a, b) => b.value - a.value),
      registrations: regs, acquisition: regs.map((r) => ({ key: r.key, value: (run += r.value) })),
      activeInactive: [{ key: 'active', label: 'Active', value: rows.filter((c) => c.status === 'active').length }, { key: 'inactive', label: 'Inactive', value: rows.filter((c) => c.status !== 'active').length }],
      note: 'A customer with packages in two brands is counted once in the totals and once in each brand.'
    };
  }

  // ---------------------------------------------------------------- revenue
  async function revenueAnalytics(url) {
    const today = todayIST();
    const brand = q(url, 'brand'), pkg = q(url, 'package'), months = q(url, 'months'), pstatus = q(url, 'status');
    const from = isDate(q(url, 'from')) ? q(url, 'from') : null, to = isDate(q(url, 'to')) ? q(url, 'to') : null;
    let inv = await finance.invoices();
    inv = inv.filter((i) => (!brand || i.brand === brand) && (!pkg || i.packageId === pkg) && (!months || String(i.months || '') === months) && (!pstatus || i.status === pstatus) && i.status !== 'quote');
    const ids = new Set(inv.map((i) => i.planId));
    const pays = (await docs.find('app_payments')).filter((p) => ids.has(p.planId));
    const inRange = (d) => (!from || ymd(d) >= from) && (!to || ymd(d) <= to);
    const net = (list) => list.reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0);
    const pr = pays.filter((p) => inRange(p.receivedAt));
    const billedList = inv.filter((i) => inRange(i.date));
    const byKey = (key, names) => { const m = {}; for (const p of pr) { const i = inv.find((x) => x.planId === p.planId); const k = i[key]; m[k] = (m[k] || 0) + (p.kind === 'refund' ? -p.amount : p.amount); } return Object.keys(m).map((k) => ({ key: k, label: names(k), value: m[k] })).sort((a, b) => b.value - a.value); };
    const mlist = from ? monthsBetween(from, to || today) : monthsBack(today, 12);
    const years = [...new Set(pays.map((p) => p.receivedAt.slice(0, 4)).concat([today.slice(0, 4)]))].sort();
    const methods = {}; pr.filter((p) => p.kind === 'payment').forEach((p) => { methods[p.method || 'other'] = (methods[p.method || 'other'] || 0) + p.amount; });
    const orders = (await docs.find('app_orders', { status: 'awaiting_payment' })).filter((o) => (!brand || BRAND_OF(o.planId, o.product) === brand) && (!pkg || o.planId === pkg));
    const outstanding = inv.reduce((s, i) => s + i.outstanding, 0);
    return {
      kpis: {
        collected: net(pr), thisMonth: net(pays.filter((p) => month(p.receivedAt) === today.slice(0, 7))), thisYear: net(pays.filter((p) => p.receivedAt.slice(0, 4) === today.slice(0, 4))),
        billed: billedList.reduce((s, i) => s + i.amount, 0), outstanding, refunds: pr.filter((p) => p.kind === 'refund').reduce((s, p) => s + p.amount, 0),
        successfulPayments: pr.filter((p) => p.kind === 'payment').length, pendingPayments: inv.filter((i) => i.outstanding > 0).length + orders.length,
        pendingAmount: outstanding + orders.reduce((s, o) => s + o.amount, 0)
      },
      byBrand: byKey('brand', (k) => BRAND_NAMES[k] || k), byPackage: byKey('packageId', (k) => planName(k)),
      monthly: mlist.map((m) => ({ key: m, collected: net(pays.filter((p) => month(p.receivedAt) === m)), billed: inv.filter((i) => month(i.date) === m).reduce((s, i) => s + i.amount, 0) })),
      yearly: years.map((y) => ({ key: y, value: net(pays.filter((p) => p.receivedAt.slice(0, 4) === y)) })),
      methods: Object.keys(methods).map((k) => ({ key: k, label: (require('./orders').METHODS[k] || k), value: methods[k] })),
      payStatus: [{ key: 'paid', label: 'Paid', value: inv.filter((i) => i.status === 'paid').length }, { key: 'partial', label: 'Part paid', value: inv.filter((i) => i.status === 'partial').length }, { key: 'unpaid', label: 'Unpaid', value: inv.filter((i) => i.status === 'unpaid').length }, { key: 'orders', label: 'Orders awaiting payment', value: orders.length }],
      note: 'Collected = payments recorded after checking them, minus refunds. Unpaid invoices are never counted as collected.'
    };
  }

  // ---------------------------------------------------------------- leads (website bookings and enquiries, app plan requests)
  async function leadRows() {
    const [bookings, enquiries, plans, users] = await Promise.all([store.readAll('bookings'), store.readAll('enquiries'), docs.find('app_plans'), docs.find('app_users')]);
    const rows = [...bookings.map((r) => ({ type: 'booking', r })), ...enquiries.filter((r) => !r.kind || r.kind === 'plan-request' || r.kind === 'enquiry').map((r) => ({ type: 'enquiry', r }))];
    return rows.map(({ type, r }) => {
      const plan = r.appPlanId ? plans.find((p) => p.id === r.appPlanId) : null;
      const derived = r.leadStatus || (plan && plan.status === 'active' ? 'converted' : r.status === 'contacted' ? 'contacted' : r.status === 'scheduled' ? 'follow_up' : r.status === 'closed' ? 'lost' : 'new');
      const brand = r.package && /^kb-|^km-/.test(r.package) ? 'karewellness' : require('./products').productOfRequest(type, r) || 'kareiq';
      const who = r.assignedTo ? users.find((u) => u.id === r.assignedTo) : null;
      return {
        type, id: r.id, enquiryId: r.reference, name: r.name || '', phone: r.phone || '', email: r.email || '', brand, brandName: BRAND_NAMES[brand] || 'KareIQ',
        package: r.package && r.package !== 'undecided' ? r.package : null, packageName: r.package && r.package !== 'undecided' ? planName(r.package) : '', message: r.notes || r.message || '',
        title: type === 'booking' ? (r.serviceName || 'Booking') : (r.interestName || 'Enquiry'), source: r.source || (type === 'booking' ? 'kare-at-home' : 'kareiq'),
        sourceName: SOURCES[r.source || (type === 'booking' ? 'kare-at-home' : 'kareiq')] || r.source || 'Website', status: derived, statusName: LEAD_STATUS[derived],
        assignedTo: r.assignedTo || null, assignedName: who ? who.name : null, assignedAt: r.assignedAt || null, createdAt: r.createdAt, history: r.leadHistory || [], personId: r.personId || null
      };
    }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  function filterLeads(rows, url) {
    const from = q(url, 'from'), to = q(url, 'to'), brand = q(url, 'brand'), pkg = q(url, 'package'), source = q(url, 'source'), status = q(url, 'status'), who = q(url, 'assignee'), text = q(url, 'q').toLowerCase();
    return rows.filter((l) => (!isDate(from) || ymd(l.createdAt) >= from) && (!isDate(to) || ymd(l.createdAt) <= to) && (!brand || l.brand === brand) && (!pkg || l.package === pkg) &&
      (!source || l.source === source) && (!status || l.status === status) && (!who || (who === 'none' ? !l.assignedTo : l.assignedTo === who)) &&
      (!text || [l.name, l.phone, l.email, l.enquiryId, l.message].some((x) => String(x || '').toLowerCase().includes(text))));
  }
  function dupesOf(rows) {
    const key = (l) => [String(l.phone || '').replace(/\D/g, '').slice(-10), String(l.email || '').toLowerCase()];
    const m = new Map();
    rows.forEach((l) => key(l).filter(Boolean).forEach((k) => m.set(k, (m.get(k) || []).concat([l.id]))));
    return (l) => [...new Set(key(l).filter(Boolean).flatMap((k) => m.get(k) || []))].filter((id) => id !== l.id);
  }
  async function leadOverview(url) {
    const today = todayIST();
    const all = await leadRows();
    // the same person enquiring twice counts as one lead
    const seen = new Set(); const rows = filterLeads(all, url).filter((l) => { const k = String(l.phone || '').replace(/\D/g, '').slice(-10) || l.email || l.id; if (seen.has(k)) return false; seen.add(k); return true; });
    const count = (s) => rows.filter((l) => l.status === s).length;
    const from = isDate(q(url, 'from')) ? q(url, 'from') : null;
    const months = from ? monthsBetween(from, isDate(q(url, 'to')) ? q(url, 'to') : today) : monthsBack(today, 12);
    const group = (f, names) => { const m = {}; rows.forEach((l) => { const k = f(l) || 'none'; m[k] = (m[k] || 0) + 1; }); return Object.keys(m).map((k) => ({ key: k, label: names(k), value: m[k] })).sort((a, b) => b.value - a.value); };
    return {
      kpis: { total: rows.length, new: count('new'), contacted: count('contacted'), followUp: count('follow_up'), converted: count('converted'), lost: count('lost'), conversion: rows.length ? Math.round((count('converted') / rows.length) * 1000) / 10 : 0, duplicatesMerged: filterLeads(all, url).length - rows.length },
      overTime: months.map((m) => ({ key: m, value: rows.filter((l) => month(l.createdAt) === m).length })),
      byBrand: group((l) => l.brand, (k) => BRAND_NAMES[k] || 'KareIQ'), byPackage: group((l) => l.package, (k) => (k === 'none' ? 'Not chosen' : planName(k))),
      funnel: [['total', 'All leads', rows.length], ['contacted', 'Contacted or further', rows.filter((l) => ['contacted', 'follow_up', 'converted'].includes(l.status)).length], ['follow_up', 'Follow-up or further', rows.filter((l) => ['follow_up', 'converted'].includes(l.status)).length], ['converted', 'Converted', count('converted')]].map(([key, label, value]) => ({ key, label, value })),
      byStatus: Object.keys(LEAD_STATUS).map((k) => ({ key: k, label: LEAD_STATUS[k], value: count(k) })), bySource: group((l) => l.source, (k) => SOURCES[k] || k),
      note: 'Enquiries from the same phone number or email are counted as one lead.'
    };
  }
  async function members() {
    const users = (await docs.find('app_users', { active: true })).filter((u) => u.role === 'admin');
    const leads = await leadRows();
    return users.map((u) => ({ id: u.id, name: u.name, open: leads.filter((l) => l.assignedTo === u.id && !['converted', 'lost'].includes(l.status)).length, total: leads.filter((l) => l.assignedTo === u.id).length }));
  }

  // ---------------------------------------------------------------- the route table
  async function handle(req, res, parts, url, admin, body) {
    const p = parts.join('/');
    // ---- analytics
    if (p === 'analytics/customers' && req.method === 'GET') return json(res, 200, { ok: true, ...(await customerAnalytics(url)), brands: BRAND_NAMES, packages: (await packinfo.all()).map((x) => ({ id: x.id, name: x.name })) });
    if (p === 'analytics/revenue' && req.method === 'GET') return json(res, 200, { ok: true, ...(await revenueAnalytics(url)), brands: BRAND_NAMES, packages: (await packinfo.all()).map((x) => ({ id: x.id, name: x.name })) });

    // ---- leads
    if (p === 'leads/overview' && req.method === 'GET') return json(res, 200, { ok: true, ...(await leadOverview(url)), statuses: LEAD_STATUS, sources: SOURCES, brands: BRAND_NAMES, members: await members() });
    if (p === 'leads' && req.method === 'GET') {
      const all = await leadRows(); const dup = dupesOf(all);
      const pg = paginate(filterLeads(all, url), url);
      return json(res, 200, { ok: true, ...pg, rows: pg.rows.map((l) => ({ ...l, duplicates: dup(l).length })), statuses: LEAD_STATUS, sources: SOURCES, brands: BRAND_NAMES, members: await members() });
    }
    if (p === 'leads/members' && req.method === 'GET') return json(res, 200, { ok: true, rows: await members() });
    if (parts[0] === 'leads' && parts.length >= 3 && ['booking', 'enquiry'].includes(parts[1])) {
      const col = parts[1] === 'booking' ? 'bookings' : 'enquiries';
      const all = await leadRows();
      const lead = all.find((l) => l.type === parts[1] && l.id === parts[2]);
      if (!lead) throw notFound();
      if (parts.length === 3 && req.method === 'GET') {
        const dup = dupesOf(all)(lead).map((id) => all.find((l) => l.id === id)).filter(Boolean).map((l) => ({ type: l.type, id: l.id, enquiryId: l.enquiryId, name: l.name, title: l.title, createdAt: l.createdAt, statusName: l.statusName }));
        return json(res, 200, { ok: true, lead, duplicates: dup, members: await members(), statuses: LEAD_STATUS });
      }
      if (parts.length === 3 && req.method === 'PATCH') {
        if (!LEAD_STATUS[body.status]) throw bad('Choose a status.');
        const note = clean(body.note, 300);
        const row = (await store.readAll(col)).find((r) => r.id === lead.id);
        await store.update(col, lead.id, { leadStatus: body.status, status: { new: 'new', contacted: 'contacted', follow_up: 'scheduled', converted: 'closed', lost: 'closed' }[body.status], leadHistory: [...((row && row.leadHistory) || []), { at: now(), by: admin.name, action: 'status', to: body.status, note }] });
        await audit(admin.id, 'lead.status', lead.personId, { lead: lead.enquiryId, status: body.status });
        return json(res, 200, { ok: true });
      }
      if (parts[3] === 'assign' && req.method === 'POST') {
        const to = (await members()).find((m) => m.id === String(body.userId || ''));
        if (!to) return json(res, 400, { ok: false, message: 'Choose a team member.', errors: { userId: 'Required' } });
        const row = (await store.readAll(col)).find((r) => r.id === lead.id);
        await store.update(col, lead.id, { assignedTo: to.id, assignedAt: now(), ...(lead.status === 'new' ? { leadStatus: 'contacted', status: 'contacted' } : {}),
          leadHistory: [...((row && row.leadHistory) || []), { at: now(), by: admin.name, action: lead.assignedTo ? 'reassigned' : 'assigned', to: to.name, from: lead.assignedName || null, note: clean(body.note, 300) }] });
        await scheduler.notify([to.id], { kind: 'lead-assigned', title: 'Enquiry assigned to you', body: `${lead.name}: ${lead.title} (${lead.enquiryId}).`, link: '#/office/leads/assign?id=' + lead.type + ':' + lead.id });
        await audit(admin.id, 'lead.assign', lead.personId, { lead: lead.enquiryId, to: to.id });
        return json(res, 200, { ok: true });
      }
    }

    // ---- customers
    if (p === 'customers' && req.method === 'GET') {
      const sort = q(url, 'sort') || 'new';
      let rows = filterCustomers(await customerRows(), url);
      rows = rows.sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : sort === 'id' ? a.id.localeCompare(b.id) : sort === 'old' ? a.registeredAt.localeCompare(b.registeredAt) : b.registeredAt.localeCompare(a.registeredAt)));
      const nurses = (await docs.find('app_users', { role: 'caregiver' })).map((u) => ({ id: u.id, name: u.name }));
      return json(res, 200, { ok: true, ...paginate(rows, url), brands: BRAND_NAMES, packages: (await packinfo.all()).map((x) => ({ id: x.id, name: x.name })), nurses });
    }
    if (parts[0] === 'customers' && parts.length === 2 && req.method === 'GET') {
      const person = await docs.findOne('app_people', { id: parts[1] });
      if (!person) throw notFound();
      const row = (await customerRows()).find((c) => c.id === person.id);
      const [links, visits, activity, orders, det] = await Promise.all([
        docs.find('app_links', { personId: person.id }), docs.find('app_schedule', { personId: person.id }, { sort: { date: -1 } }),
        docs.find('app_audit', { personId: person.id }, { sort: { at: -1 }, limit: 40 }), docs.find('app_orders', { personId: person.id }, { sort: { createdAt: -1 } }), docs.findOne('app_details', { id: 'det-' + person.id })
      ]);
      const names = await namesFor([...links.map((l) => l.userId), ...visits.map((v) => v.nurseId), ...activity.map((a) => a.userId)].filter(Boolean));
      return json(res, 200, { ok: true, customer: { ...row, photo: person.photoAt || null }, details: det ? det.data : {}, detailsStatus: det ? det.status : 'new',
        links: links.map((l) => ({ kind: l.kind, userId: l.userId, name: names[l.userId] || '', relation: l.relation || null, since: l.createdAt })),
        visits: visits.slice(0, 60).map((v) => ({ id: v.id, reference: v.reference, date: v.date, slot: v.slot, start: v.start, serviceName: v.serviceName, status: v.status, statusName: STATUS[v.status], nurse: names[v.nurseId] || null })),
        orders: orders.map((o) => ({ reference: o.reference, name: o.name, amountText: o.amountText, status: o.status, createdAt: o.createdAt })),
        activity: activity.map((a) => ({ at: a.at, by: names[a.userId] || 'KareIQ', action: a.action })) });
    }

    // ---- financials
    if (p === 'finance/invoices' && req.method === 'GET') {
      const [inv, people] = await Promise.all([finance.invoices(), docs.find('app_people')]);
      const from = q(url, 'from'), to = q(url, 'to'), brand = q(url, 'brand'), pkg = q(url, 'package'), status = q(url, 'status'), text = q(url, 'q').toLowerCase(), plan = q(url, 'plan');
      const rows = inv.map((i) => ({ ...i, customerName: (people.find((x) => x.id === i.personId) || {}).name || i.personId })).filter((i) => (!isDate(from) || i.date >= from) && (!isDate(to) || i.date <= to) && (!brand || i.brand === brand) && (!pkg || i.packageId === pkg) &&
        (!status || i.status === status || (status === 'overdue' && i.overdueDays > 0)) && (!plan || i.planStatus === plan) && (!text || [i.number, i.customerName, i.personId].some((x) => String(x).toLowerCase().includes(text))));
      const totals = { amount: rows.reduce((s, i) => s + i.amount, 0), paid: rows.reduce((s, i) => s + i.paid - i.refunded, 0), outstanding: rows.reduce((s, i) => s + i.outstanding, 0) };
      return json(res, 200, { ok: true, ...paginate(rows, url), totals, brands: BRAND_NAMES, packages: (await packinfo.all()).map((x) => ({ id: x.id, name: x.name })), methods: require('./orders').METHODS });
    }
    if (p === 'finance/due' && req.method === 'GET') {
      const [inv, people] = await Promise.all([finance.invoices(), docs.find('app_people')]);
      const brand = q(url, 'brand'), pkg = q(url, 'package'), text = q(url, 'q').toLowerCase(), over = q(url, 'overdue'), status = q(url, 'status'), dueFrom = q(url, 'from'), dueTo = q(url, 'to');
      const rows = inv.filter((i) => i.outstanding > 0).map((i) => ({ ...i, customerName: (people.find((x) => x.id === i.personId) || {}).name || i.personId }))
        .filter((i) => (!brand || i.brand === brand) && (!pkg || i.packageId === pkg) && (!status || i.status === status) && (!isDate(dueFrom) || i.dueDate >= dueFrom) && (!isDate(dueTo) || i.dueDate <= dueTo) &&
          (!over || (over === 'not' ? i.overdueDays === 0 : over === '1-30' ? i.overdueDays >= 1 && i.overdueDays <= 30 : over === '31-60' ? i.overdueDays > 30 && i.overdueDays <= 60 : over === '60+' ? i.overdueDays > 60 : true)) &&
          (!text || [i.number, i.customerName, i.personId].some((x) => String(x).toLowerCase().includes(text))))
        .sort((a, b) => b.overdueDays - a.overdueDays);
      const sumBy = (k, names) => { const m = {}; rows.forEach((i) => { m[i[k]] = (m[i[k]] || 0) + i.outstanding; }); return Object.keys(m).map((x) => ({ key: x, label: names(x), value: m[x] })).sort((a, b) => b.value - a.value); };
      const today = todayIST();
      return json(res, 200, { ok: true, ...paginate(rows, url), totals: { outstanding: rows.reduce((s, i) => s + i.outstanding, 0), overdue: rows.filter((i) => i.overdueDays > 0).length, invoices: rows.length },
        byBrand: sumBy('brand', (k) => BRAND_NAMES[k] || k), byPackage: sumBy('packageId', (k) => planName(k)),
        trend: monthsBack(today, 6).map((m) => ({ key: m, value: rows.filter((i) => i.overdueDays > 0 && month(i.dueDate) === m).reduce((s, i) => s + i.outstanding, 0) })),
        brands: BRAND_NAMES, packages: (await packinfo.all()).map((x) => ({ id: x.id, name: x.name })), methods: require('./orders').METHODS });
    }
    if (p === 'finance/payments' && req.method === 'POST') {
      // the office records a payment it has checked in the bank or payment account
      const inv = (await finance.invoices()).find((i) => i.planId === String(body.planId || ''));
      if (!inv) throw notFound();
      const method = require('./orders').METHODS[body.method] ? body.method : null, ref = clean(body.ref, 60);
      const amount = Math.round(Number(String(body.amount || '').replace(/[^0-9.]/g, '')));
      const errors = {};
      if (!method) errors.method = 'Choose how it was paid.';
      if (ref.length < 4) errors.ref = 'Enter the transaction or receipt number.';
      if (!(amount > 0)) errors.amount = 'Enter the amount received.';
      else if (amount > inv.outstanding) errors.amount = `Only ${care.fmt(inv.outstanding)} is outstanding on this invoice.`;
      if (Object.keys(errors).length) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors });
      if (await docs.findOne('app_payments', { ref, kind: 'payment' })) return json(res, 409, { ok: false, message: 'This transaction number is already recorded.', errors: { ref: 'Already used' } });
      await docs.insert('app_payments', { id: uid(), kind: 'payment', planId: inv.planId, personId: inv.personId, invoiceNo: inv.number, amount, method, ref, receivedAt: now(), recordedBy: admin.id });
      await audit(admin.id, 'payment.recorded', inv.personId, { invoice: inv.number, amount });
      return json(res, 201, { ok: true });
    }
    if (p === 'finance/refunds' && req.method === 'POST') {
      const inv = (await finance.invoices()).find((i) => i.planId === String(body.planId || ''));
      if (!inv) throw notFound();
      const amount = Math.round(Number(String(body.amount || '').replace(/[^0-9.]/g, ''))), ref = clean(body.ref, 60), reason = clean(body.reason, 200);
      const errors = {};
      if (!(amount > 0)) errors.amount = 'Enter the amount refunded.';
      else if (amount > inv.paid - inv.refunded) errors.amount = 'A refund cannot be more than what was paid.';
      if (ref.length < 4) errors.ref = 'Enter the refund transaction number.';
      if (reason.length < 3) errors.reason = 'Say why.';
      if (Object.keys(errors).length) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors });
      await docs.insert('app_payments', { id: uid(), kind: 'refund', planId: inv.planId, personId: inv.personId, invoiceNo: inv.number, amount, method: 'refund', ref, reason, receivedAt: now(), recordedBy: admin.id });
      await audit(admin.id, 'payment.refund', inv.personId, { invoice: inv.number, amount });
      return json(res, 201, { ok: true });
    }
    if (parts[0] === 'finance' && parts[1] === 'invoices' && parts[3] === 'pdf' && req.method === 'GET') {
      const inv = (await finance.invoices()).find((i) => i.planId === parts[2]);
      if (!inv) throw notFound();
      const person = await docs.findOne('app_people', { id: inv.personId });
      const buf = await invoicePdf(inv, person);
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="invoice-${inv.number}.pdf"`, 'Cache-Control': 'private, no-store' });
      res.end(buf); return true;
    }

    // ---- employees
    if (p === 'employees' && req.method === 'GET') {
      const users = (await docs.find('app_users')).filter((u) => u.role === 'admin' || u.role === 'caregiver');
      const rows = [];
      for (const u of users) rows.push(staff.view(u, await staff.profileOf(u.id)));
      const role = q(url, 'role'), dept = q(url, 'department'), unit = q(url, 'unit'), status = q(url, 'status'), from = q(url, 'from'), to = q(url, 'to'), loc = q(url, 'location').toLowerCase(), text = q(url, 'q').toLowerCase();
      const list = rows.filter((e) => (!role || e.role === role) && (!dept || e.department === dept) && (!unit || e.businessUnit === unit) && (!status || e.status === status) && (!isDate(from) || (e.joinDate || '') >= from) && (!isDate(to) || (e.joinDate || '') <= to) && (!loc || e.location.toLowerCase().includes(loc)) && (!text || [e.name, e.employeeId].some((x) => String(x).toLowerCase().includes(text))));
      const today = todayIST(), since = new Date(Date.parse(today + 'T12:00:00Z') - 30 * 86400000).toISOString().slice(0, 10);
      const group = (f, names) => { const m = {}; list.forEach((e) => { const k = f(e) || 'none'; m[k] = (m[k] || 0) + 1; }); return Object.keys(m).map((k) => ({ key: k, label: names(k), value: m[k] })); };
      return json(res, 200, { ok: true, rows: list.sort((a, b) => a.name.localeCompare(b.name)),
        kpis: { total: list.length, active: list.filter((e) => e.status === 'active').length, inactive: list.filter((e) => e.status === 'inactive').length, onLeave: list.filter((e) => e.status === 'on_leave').length, newlyJoined: list.filter((e) => (e.joinDate || '') >= since).length },
        byRole: group((e) => e.role, (k) => (k === 'caregiver' ? 'Nurses / caregivers' : 'Office')), byDepartment: group((e) => e.department, (k) => (k === 'none' ? 'Not set' : k)),
        byStatus: group((e) => e.status, (k) => ({ active: 'Active', inactive: 'Inactive', on_leave: 'On leave' }[k])), byUnit: group((e) => e.businessUnit, (k) => UNITS[k] || k),
        joining: monthsBack(today, 12).map((m) => ({ key: m, value: list.filter((e) => month(e.joinDate) === m).length })),
        departments: DEPARTMENTS, units: UNITS });
    }
    if (parts[0] === 'employees' && parts.length >= 2) {
      const user = await docs.findOne('app_users', { id: parts[1] });
      if (!user || !['admin', 'caregiver'].includes(user.role)) throw notFound();
      const prof = await staff.profileOf(user.id);
      if (parts.length === 2 && req.method === 'GET') return json(res, 200, { ok: true, employee: staff.view(user, prof, { full: true }), kycKinds: KYC_KINDS, departments: DEPARTMENTS, units: UNITS });
      if (parts.length === 2 && req.method === 'PATCH') {
        const ch = {};
        if (body.department !== undefined) { if (!DEPARTMENTS.includes(body.department)) throw bad('Choose a department.'); ch.department = body.department; }
        if (body.businessUnit !== undefined) { if (!UNITS[body.businessUnit]) throw bad('Choose a business unit.'); ch.businessUnit = body.businessUnit; }
        if (body.location !== undefined) ch.location = clean(body.location, 80);
        if (body.joinDate !== undefined) { if (!isDate(body.joinDate) || body.joinDate > todayIST()) throw bad('Choose the date of joining.'); ch.joinDate = body.joinDate; }
        if (body.status !== undefined) { if (!['active', 'inactive'].includes(body.status)) throw bad('Choose a status.'); ch.status = body.status; }
        if (body.emergencyContact !== undefined) { const ph = body.emergencyContact && body.emergencyContact.phone ? normalisePhone(body.emergencyContact.phone) : null; if (body.emergencyContact && body.emergencyContact.phone && !ph) throw bad('Enter a 10-digit mobile number.'); ch.emergencyContact = body.emergencyContact && body.emergencyContact.name ? { name: clean(body.emergencyContact.name, 80), relation: clean(body.emergencyContact.relation, 40), phone: ph } : null; }
        await docs.update('app_staff', prof.id, { ...ch, updatedAt: now() });
        await audit(admin.id, 'employee.edit', null, { employee: prof.employeeId, fields: Object.keys(ch) });
        return json(res, 200, { ok: true });
      }
      if (parts[2] === 'kyc' && parts.length === 3 && req.method === 'POST') {
        const kind = KYC_KINDS[req.headers['x-kind']] ? String(req.headers['x-kind']) : null;
        if (!kind) return json(res, 400, { ok: false, message: 'Choose which document this is.' });
        const buf = await readRaw(req);
        if (!buf.length) return json(res, 400, { ok: false, message: 'Choose a file to upload.' });
        const mime = sniff(buf);
        if (!mime) return json(res, 415, { ok: false, message: 'Please upload a PDF or a photo (JPG, PNG or WEBP).' });
        let name = ''; try { name = decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch { name = ''; }
        const fileId = uid();
        await docs.insert('app_files', { id: fileId, kind: 'kyc', employeeId: prof.employeeId, mime, data: buf.toString('base64'), createdAt: now() });
        const doc = { id: uid(), kind, name: clean(name, 80) || KYC_KINDS[kind], fileId, mime, uploadedAt: now(), status: 'submitted' };
        await docs.update('app_staff', prof.id, { kyc: { docs: [...((prof.kyc && prof.kyc.docs) || []), doc] }, updatedAt: now() });
        await audit(admin.id, 'kyc.upload', null, { employee: prof.employeeId, kind });
        return json(res, 201, { ok: true });
      }
      if (parts[2] === 'kyc' && parts.length === 4) {
        const doc = ((prof.kyc && prof.kyc.docs) || []).find((d) => d.id === parts[3]);
        if (!doc) throw notFound();
        if (req.method === 'GET') {
          const f = await docs.findOne('app_files', { id: doc.fileId });
          if (!f) throw notFound();
          const buf = Buffer.from(f.data, 'base64');
          await audit(admin.id, 'kyc.view', null, { employee: prof.employeeId, kind: doc.kind });
          res.writeHead(200, { 'Content-Type': f.mime, 'Content-Length': buf.length, 'Content-Disposition': 'inline', 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
          res.end(buf); return true;
        }
        if (req.method === 'POST') {
          if (!['verified', 'rejected'].includes(body.status)) throw bad('Choose verified or rejected.');
          const docs2 = prof.kyc.docs.map((d) => (d.id === doc.id ? { ...d, status: body.status, verifiedAt: body.status === 'verified' ? now() : null, verifiedBy: admin.id, note: clean(body.note, 200) || null } : d));
          await docs.update('app_staff', prof.id, { kyc: { docs: docs2 }, updatedAt: now() });
          await audit(admin.id, 'kyc.' + body.status, null, { employee: prof.employeeId, kind: doc.kind });
          return json(res, 200, { ok: true });
        }
      }
    }

    // ---- nurse scheduler
    if (p === 'scheduler/nurses' && req.method === 'GET') {
      const list = await scheduler.nurses();
      const today = todayIST(), [w0, w1] = scheduler.weekOf(today);
      const week = await docs.find('app_schedule', { date: { $gte: w0, $lte: w1 } });
      const out = [];
      for (const n of list) {
        const prof = await staff.profileOf(n.user.id);
        out.push({ id: n.user.id, name: n.user.name, employeeId: prof.employeeId, active: n.user.active && prof.status !== 'inactive', availability: scheduler.profileDefaults(prof), leave: prof.leave || [], onLeave: staff.onLeaveToday(prof), weekVisits: week.filter((v) => v.nurseId === n.user.id && v.status !== 'cancelled').length });
      }
      const set = await scheduler.settings();
      return json(res, 200, { ok: true, rows: out, holidays: set.holidays, slots: SLOTS, days: DAYS, services: Object.keys(care.SERVICES).filter((k) => k !== 'family-visit').map((k) => ({ id: k, name: care.SERVICES[k].name })).concat([{ id: 'first-visit', name: 'First visit (assessment)' }]) });
    }
    if (parts[0] === 'scheduler' && parts[1] === 'nurses' && parts.length >= 3) {
      const user = await docs.findOne('app_users', { id: parts[2], role: 'caregiver' });
      if (!user) throw notFound();
      const prof = await staff.profileOf(user.id);
      if (parts.length === 3 && req.method === 'PATCH') {
        const a = body.availability || {};
        const days = {}; for (const d of DAYS) days[d] = (Array.isArray(a.days && a.days[d]) ? a.days[d] : []).filter((s) => SLOTS[s]);
        const av = { days, bufferMin: Math.max(0, Math.min(120, Number(a.bufferMin) || 0)), maxPerSlot: Number(a.maxPerSlot) > 0 ? Math.min(8, Number(a.maxPerSlot)) : null,
          services: Array.isArray(a.services) && a.services.length ? a.services.map(String) : null, brands: (Array.isArray(a.brands) ? a.brands : []).filter((b) => b === 'karehome' || b === 'karenest') };
        if (!av.brands.length) return json(res, 400, { ok: false, message: 'Choose at least one brand.' });
        await docs.update('app_staff', prof.id, { availability: av, updatedAt: now() });
        await audit(admin.id, 'nurse.hours', null, { employee: prof.employeeId });
        return json(res, 200, { ok: true });
      }
      if (parts[3] === 'leave' && parts.length === 4 && req.method === 'POST') {
        if (!isDate(body.from) || !isDate(body.to) || body.to < body.from) return json(res, 400, { ok: false, message: 'Choose the first and last day of leave.' });
        const clash = (await docs.find('app_schedule', { nurseId: user.id, date: { $gte: body.from, $lte: body.to } })).filter((v) => ACTIVE.includes(v.status));
        await docs.update('app_staff', prof.id, { leave: [...(prof.leave || []), { id: uid(), from: body.from, to: body.to, reason: clean(body.reason, 120) }], updatedAt: now() });
        // visits in the leave go back to the pool and are given to someone free
        const moved = [];
        for (const v of clash) {
          await docs.update('app_schedule', v.id, { nurseId: null, slotKey: null, start: null, end: null, status: 'awaiting_assignment', officeToldAt: null, history: [...(v.history || []), { at: now(), by: admin.id, byRole: 'admin', action: 'unassigned', from: user.id, note: 'Nurse on leave' }] });
          const r = await scheduler.assign(v.id, { by: admin.id, byRole: 'admin', note: 'Reassigned because the nurse is on leave' });
          moved.push({ reference: v.reference, assigned: r.ok });
        }
        await audit(admin.id, 'nurse.leave', null, { employee: prof.employeeId, from: body.from, to: body.to });
        return json(res, 201, { ok: true, moved });
      }
      if (parts[3] === 'leave' && parts.length === 5 && req.method === 'DELETE') {
        await docs.update('app_staff', prof.id, { leave: (prof.leave || []).filter((l) => l.id !== parts[4]), updatedAt: now() });
        return json(res, 200, { ok: true });
      }
    }
    if (p === 'scheduler/holidays' && req.method === 'POST') {
      const set = await scheduler.settings();
      const list = Array.isArray(body.holidays) ? body.holidays.filter((h) => isDate(h.date)).map((h) => ({ date: h.date, name: clean(h.name, 60) })) : set.holidays;
      const row = await docs.findOne('app_settings', { id: 'scheduling' });
      if (row) await docs.update('app_settings', 'scheduling', { holidays: list }); else await docs.insert('app_settings', { id: 'scheduling', holidays: list });
      return json(res, 200, { ok: true });
    }
    if (p === 'scheduler/visits' && req.method === 'GET') {
      const from = isDate(q(url, 'from')) ? q(url, 'from') : todayIST(), to = isDate(q(url, 'to')) ? q(url, 'to') : from;
      const nurse = q(url, 'nurse'), brand = q(url, 'brand'), status = q(url, 'status');
      let rows = await docs.find('app_schedule', status === 'awaiting_assignment' ? { status } : { date: { $gte: from, $lte: to } }, { sort: { date: 1, start: 1 } });
      rows = rows.filter((v) => (!nurse || v.nurseId === nurse) && (!brand || v.product === brand) && (!status || v.status === status));
      const names = await namesFor(rows.flatMap((v) => [v.nurseId, ...(v.history || []).map((h) => h.by)]).filter((x) => x && x !== 'system'));
      return json(res, 200, { ok: true, from, to, statuses: STATUS, slots: SLOTS, conflicts: await scheduler.conflicts(from, to),
        rows: rows.map((v) => ({ ...v, slotKey: undefined, sourceKey: undefined, nurseName: names[v.nurseId] || null, statusName: STATUS[v.status], history: (v.history || []).map((h) => ({ ...h, byName: h.by === 'system' ? 'Automatic' : names[h.by] || '' })) })) });
    }
    if (p === 'scheduler/visits' && req.method === 'POST') {
      // the office books a visit for a customer (it is then assigned like any other)
      const person = await docs.findOne('app_people', { id: String(body.personId || '') });
      if (!person) return json(res, 400, { ok: false, message: 'Choose a customer.' });
      if (!isDate(body.date) || body.date < todayIST()) return json(res, 400, { ok: false, message: 'Choose today or a later date.' });
      if (!SLOTS[body.slot]) return json(res, 400, { ok: false, message: 'Choose morning or evening.' });
      const service = care.SERVICES[body.service] || body.service === 'home-visit' ? body.service : null;
      if (!service) return json(res, 400, { ok: false, message: 'Choose a service.' });
      const plans = await docs.find('app_plans', { personId: person.id });
      const det = await docs.findOne('app_details', { id: 'det-' + person.id });
      const r = await scheduler.createVisit({ personId: person.id, customerName: person.name, product: plans.some((x) => x.product === 'karenest' && x.status === 'active') ? 'karenest' : 'karehome', service, serviceName: care.SERVICES[service] ? care.SERVICES[service].name : 'Home visit', date: body.date, slot: body.slot, location: (det && det.data && det.data.address) || '', by: admin.id, byRole: 'admin', bookedNote: 'Booked by the office' });
      return json(res, 201, { ok: true, assigned: r.ok, visit: { id: r.visit.id, reference: r.visit.reference, status: r.visit.status }, message: r.ok ? 'Booked and assigned.' : r.why });
    }
    if (parts[0] === 'scheduler' && parts[1] === 'visits' && parts.length === 4) {
      if (parts[3] === 'options' && req.method === 'GET') { const o = await scheduler.options(parts[2]); if (!o) throw notFound(); return json(res, 200, { ok: true, rows: o }); }
      if (parts[3] === 'assign' && req.method === 'POST') {
        const r = await scheduler.assign(parts[2], { nurseId: body.nurseId ? String(body.nurseId) : null, by: admin.id, byRole: 'admin', note: clean(body.note, 200) || undefined });
        if (!r.ok) return json(res, 409, { ok: false, message: r.why });
        await audit(admin.id, 'visit.assign', r.visit.personId, { visit: r.visit.reference, nurse: r.visit.nurseId });
        return json(res, 200, { ok: true, visit: { id: r.visit.id, nurseId: r.visit.nurseId, start: r.visit.start } });
      }
      if (parts[3] === 'cancel' && req.method === 'POST') {
        const r = await scheduler.setStatus(parts[2], admin, 'cancelled', clean(body.note, 200));
        if (!r.ok) return json(res, r.code || 400, { ok: false, message: r.why });
        return json(res, 200, { ok: true });
      }
    }

    // ---- contact access audit
    if (p === 'contact-audit' && req.method === 'GET') {
      const nurse = q(url, 'nurse'), person = q(url, 'customer').toLowerCase(), cat = q(url, 'category'), from = q(url, 'from'), to = q(url, 'to'), appr = q(url, 'approval'), result = q(url, 'result');
      let rows = await docs.find('app_contact_access', {}, { sort: { at: -1 } });
      rows = rows.filter((r) => (!nurse || r.nurseId === nurse) && (!person || r.customerName.toLowerCase().includes(person) || r.personId.toLowerCase().includes(person)) && (!cat || r.category === cat) &&
        (!isDate(from) || ymd(r.at) >= from) && (!isDate(to) || ymd(r.at) <= to) && (!appr || r.approvalStatus === appr) && (!result || r.result === result));
      const pol = ((await docs.findOne('app_settings', { id: 'contact-policy' })) || {}).policy || 'visit';
      const nurses = (await docs.find('app_users', { role: 'caregiver' })).map((u) => ({ id: u.id, name: u.name }));
      return json(res, 200, { ok: true, ...paginate(rows, url), policy: pol, policies: POLICIES, categories: CATEGORIES, nurses, pending: rows.filter((r) => r.approvalStatus === 'pending').length });
    }
    if (parts[0] === 'contact-audit' && parts[2] === 'decide' && parts.length === 3 && req.method === 'POST') {
      const r = await docs.findOne('app_contact_access', { id: parts[1] });
      if (!r) throw notFound();
      if (r.approvalStatus !== 'pending') return json(res, 409, { ok: false, message: 'This request has already been decided.' });
      const approve = body.approve === true, minutes = Math.max(15, Math.min(24 * 60, Number(body.minutes) || 120));
      await docs.update('app_contact_access', r.id, { approvalStatus: approve ? 'approved' : 'rejected', result: approve ? 'pending' : 'denied', decidedBy: admin.id, decidedByName: admin.name, decidedAt: now(), expiresAt: approve ? new Date(Date.now() + minutes * 60000).toISOString() : null });
      await scheduler.notify([r.nurseId], { kind: 'contact-decided', title: approve ? 'Contact access approved' : 'Contact access declined', body: `${CATEGORIES[r.category]} for ${r.customerName}` + (approve ? `: open it from the customer's page within ${minutes} minutes.` : '.'), link: '#/nurse/customer?p=' + r.personId });
      await audit(admin.id, 'contact.' + (approve ? 'approved' : 'rejected'), r.personId, { event: r.eventId });
      return json(res, 200, { ok: true });
    }
    if (p === 'settings/contact-policy' && req.method === 'POST') {
      if (!POLICIES[body.policy]) throw bad('Choose a policy.');
      const row = await docs.findOne('app_settings', { id: 'contact-policy' });
      if (row) await docs.update('app_settings', 'contact-policy', { policy: body.policy, updatedAt: now(), updatedBy: admin.id }); else await docs.insert('app_settings', { id: 'contact-policy', policy: body.policy, updatedAt: now(), updatedBy: admin.id });
      await audit(admin.id, 'contact.policy', null, { policy: body.policy });
      return json(res, 200, { ok: true });
    }
    return undefined;
  }

  // a simple A4 invoice
  async function invoicePdf(inv, person) {
    const { PDFDocument, StandardFonts, rgb } = require('pdf-lib');
    const doc = await PDFDocument.create(); const page = doc.addPage([595, 842]);
    const font = await doc.embedFont(StandardFonts.Helvetica), bold = await doc.embedFont(StandardFonts.HelveticaBold);
    const t = (s, x, y, size, f) => page.drawText(String(s).replace(/[^\x20-\x7E]/g, ''), { x, y, size: size || 10, font: f || font, color: rgb(0.09, 0.19, 0.35) });
    let y = 780;
    t('KareIQ', 50, y, 18, bold); t('INVOICE', 450, y, 16, bold); y -= 30;
    t('Invoice number: ' + inv.number, 50, y); t('Date: ' + inv.date, 400, y); y -= 16;
    t('Customer: ' + (person ? person.name : inv.personId) + ' (' + inv.personId + ')', 50, y); t('Due: ' + inv.dueDate, 400, y); y -= 30;
    page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) }); y -= 20;
    t('Description', 50, y, 10, bold); t('Amount (Rs)', 450, y, 10, bold); y -= 18;
    t(inv.productName + ': ' + inv.description, 50, y); t(Number(inv.amount).toLocaleString('en-IN'), 450, y); y -= 14;
    if (inv.period) { t('Period: ' + inv.period.from + ' to ' + (inv.period.to || ''), 50, y, 9); y -= 14; }
    if (inv.gst) { t(inv.gst, 50, y, 9); y -= 14; }
    y -= 10; page.drawLine({ start: { x: 50, y }, end: { x: 545, y }, thickness: 0.6, color: rgb(0.8, 0.8, 0.8) }); y -= 20;
    t('Total', 350, y, 10, bold); t(Number(inv.amount).toLocaleString('en-IN'), 450, y, 10, bold); y -= 16;
    t('Paid', 350, y); t(Number(inv.paid - inv.refunded).toLocaleString('en-IN'), 450, y); y -= 16;
    t('Outstanding', 350, y, 10, bold); t(Number(inv.outstanding).toLocaleString('en-IN'), 450, y, 10, bold); y -= 40;
    t('Status: ' + ({ paid: 'Paid', partial: 'Part paid', unpaid: 'Unpaid', refunded: 'Refunded' }[inv.status] || inv.status), 50, y);
    t('This is a statement of charges from KareIQ. Your GST tax invoice is issued by the KareIQ office.', 50, 60, 8);
    return Buffer.from(await doc.save());
  }

  return { handle };
}

module.exports = { create, LEAD_STATUS, SOURCES };
