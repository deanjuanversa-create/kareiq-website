// The nurse (caregiver) side: assigned customers, the minimum customer information with masked
// phone numbers, asking to see a number (policy + audit), own visits, own document submissions.
// Every route checks the nurse may see that customer; nothing relies on hidden buttons.
//
// Contact access policies (set by the office; default "visit"):
//   visit     - numbers open during the nurse's assigned visit for that customer (from an hour before
//               the slot until 30 minutes after it); outside that, only as an emergency with a reason
//   approval  - every request waits for the office to approve it
//   emergency - only as an emergency, with a reason, every time
// Every click is recorded (who, which customer, which kind of contact, when, why, the result), and
// the numbers themselves are never written into those records.

const { SLOTS, ACTIVE } = require('./scheduler');
const firstvisit = require('./firstvisit');

const POLICIES = { visit: 'During an assigned visit, or in an emergency with a reason', approval: 'Only after the office approves', emergency: 'Only in an emergency, with a reason' };
const CATEGORIES = { customer: 'Customer', emergency: 'Emergency contact', doctor: "Doctor's contact" };
const FIELDS = { customer: ['phone1', 'phone2', 'email'], emergency: ['ec1Phone', 'ec2Phone', 'ec1Email', 'ec2Email'], doctor: ['fdPhone', 'sdPhone', 'sdHospitalPhone'] };

// +91 XXXXX 12345 (the real number with the first five digits hidden)
function maskPhone(v) {
  const d = String(v || '').replace(/\D/g, '');
  if (d.length < 6) return v ? 'XXXXX' : '';
  const last10 = d.slice(-10), cc = d.length > 10 ? d.slice(0, d.length - 10) : '91';
  return `+${cc} XXXXX ${last10.slice(5)}`;
}
function maskEmail(v) {
  const m = String(v || '').match(/^(.)(.*)(@.+)$/);
  return m ? m[1] + 'xxxx' + m[3] : '';
}
function istNow() {
  const parts = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
  const [h, m] = parts.split(':').map(Number);
  return h * 60 + m;
}
const toMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
function istIso(date, hm) { return new Date(Date.parse(`${date}T${hm}:00+05:30`)).toISOString(); }

function create(ctx) {
  const { docs, uid, now, todayIST, json, forbidden, notFound, clean, audit, store, scheduler, staff } = ctx;

  async function policy() { return ((await docs.findOne('app_settings', { id: 'contact-policy' })) || {}).policy || 'visit'; }

  // Customers this nurse may see: linked by the office, or with an active visit of theirs
  async function assignedIds(user) {
    const links = await docs.find('app_links', { userId: user.id, kind: 'caregiver' });
    const visits = await visitsOf(user.id, todayIST(-1));
    return [...new Set([...links.map((l) => l.personId), ...visits.filter((v) => v.personId && ACTIVE.includes(v.status)).map((v) => v.personId)])];
  }
  async function visitsOf(nurseId, from, to) {
    const q = { nurseId };
    if (from || to) q.date = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };
    return docs.find('app_schedule', q, { sort: { date: 1, start: 1 } });
  }
  async function mayAccess(user, personId) {
    if (user.role !== 'caregiver') return false;
    return (await assignedIds(user)).includes(personId);
  }

  // the visit (today, now) that opens contact numbers under the "visit" policy
  async function liveVisit(user, personId) {
    const today = todayIST(), t = istNow();
    const list = (await docs.find('app_schedule', { nurseId: user.id, personId, date: today })).filter((v) => ACTIVE.includes(v.status));
    return list.find((v) => { const s = SLOTS[v.slot]; return t >= toMin(s.from) - 60 && t <= toMin(s.to) + 30; }) || null;
  }

  async function customerCard(user, personId) {
    const person = await docs.findOne('app_people', { id: personId });
    const det = (await docs.findOne('app_details', { id: 'det-' + personId })) || { data: {} };
    const d = det.data || {};
    const plans = (await docs.find('app_plans', { personId })).filter((p) => p.status === 'active' || p.status === 'paused');
    const pol = await policy();
    const live = await liveVisit(user, personId);
    const grants = (await docs.find('app_contact_access', { nurseId: user.id, personId })).filter((g) => g.result === 'granted' && g.expiresAt && g.expiresAt > now());
    const pend = (await docs.find('app_contact_access', { nurseId: user.id, personId, approvalStatus: 'pending' }));
    const upcoming = (await visitsOf(user.id, todayIST())).filter((v) => v.personId === personId && v.status !== 'cancelled').slice(0, 5)
      .map((v) => ({ id: v.id, reference: v.reference, date: v.date, slot: v.slot, start: v.start, serviceName: v.serviceName, status: v.status }));
    const state = (cat) => ({ open: grants.some((g) => g.category === cat), until: (grants.filter((g) => g.category === cat).sort((a, b) => (a.expiresAt < b.expiresAt ? 1 : -1))[0] || {}).expiresAt || null, pending: pend.some((g) => g.category === cat) });
    return {
      id: person.id, customerId: person.id, name: d.name || person.name, photo: person.photoAt || null, brands: [...new Set(plans.map((p) => p.product))],
      general: { age: firstvisit.ageFrom(d.dob) ?? (person.birthYear ? new Date().getFullYear() - person.birthYear : null), gender: d.gender || (person.sex === 'male' ? 'Male' : person.sex === 'female' ? 'Female' : ''), bloodGroup: d.bloodGroup || '', languages: [].concat(d.languages || []).join(', '), address: d.address || '',
        phone1: maskPhone(d.phone1), phone2: maskPhone(d.phone2), email: maskEmail(d.email) },
      emergency: [1, 2].map((n) => ({ name: d['ec' + n + 'Name'] || '', relation: d['ec' + n + 'Relation'] || '', gender: d['ec' + n + 'Gender'] || '', languages: [].concat(d['ec' + n + 'Languages'] || []).join(', '), phone: maskPhone(d['ec' + n + 'Phone']), email: maskEmail(d['ec' + n + 'Email']) })).filter((x) => x.name || x.phone),
      doctors: [{ name: d.fdName || '', address: d.fdAddress || '', phone: maskPhone(d.fdPhone) }, { name: d.sdName || '', address: d.sdAddress || '', hospital: d.sdHospital || '', phone: maskPhone(d.sdPhone), hospitalPhone: maskPhone(d.sdHospitalPhone) }].filter((x) => x.name || x.phone || x.hospitalPhone),
      access: { policy: pol, policyText: POLICIES[pol], visitNow: live ? { id: live.id, reference: live.reference, slot: live.slot } : null, customer: state('customer'), emergency: state('emergency'), doctor: state('doctor') },
      upcoming
    };
  }
  function revealed(d, cat) {
    const out = {};
    for (const k of FIELDS[cat]) if (d[k]) out[k] = d[k];
    return out;
  }

  // POST nurse/contact-access { personId, category, emergency, reason }
  async function contactAccess(user, body) {
    const personId = String(body.personId || '');
    const category = CATEGORIES[body.category] ? body.category : null;
    if (!category) return { status: 400, body: { ok: false, message: 'Choose which contact to see.' } };
    if (!(await mayAccess(user, personId))) return { status: 404, body: { ok: false, message: 'This customer is not assigned to you.' } };
    const person = await docs.findOne('app_people', { id: personId });
    const prof = await staff.profileOf(user.id);
    const pol = await policy();
    const live = await liveVisit(user, personId);
    const reason = clean(body.reason, 300);
    const base = { id: uid(), eventId: store.makeReference('CA'), at: now(), nurseId: user.id, nurseName: user.name, employeeId: prof.employeeId, personId, customerName: person ? person.name : personId, category, policy: pol, visitId: live ? live.id : null, visitRef: live ? live.reference : null, reason: reason || null };
    const det = (await docs.findOne('app_details', { id: 'det-' + personId })) || { data: {} };
    const grant = async (basis, until, approval) => {
      await docs.insert('app_contact_access', { ...base, basis, approvalStatus: approval || 'not_required', result: 'granted', expiresAt: until });
      await audit(user.id, 'contact.access', personId, { category, basis });
      return { status: 200, body: { ok: true, result: 'granted', basis, expiresAt: until, values: revealed(det.data || {}, category) } };
    };
    const deny = async (why, needsEmergency) => {
      await docs.insert('app_contact_access', { ...base, basis: null, approvalStatus: 'not_required', result: 'denied', expiresAt: null, deniedWhy: why });
      return { status: 200, body: { ok: true, result: 'denied', message: why, needsEmergency: Boolean(needsEmergency) } };
    };
    // already open (approved by the office, an emergency, or this visit) and not yet expired: shown again, and recorded again
    const valid = (await docs.find('app_contact_access', { nurseId: user.id, personId, category })).filter((g) => (g.approvalStatus === 'approved' || g.result === 'granted') && g.expiresAt && g.expiresAt > now())
      .sort((a, b) => (a.expiresAt < b.expiresAt ? 1 : -1))[0];
    if (valid) return grant(valid.basis || 'approval', valid.expiresAt, valid.approvalStatus === 'approved' ? 'approved' : undefined);
    if (pol === 'approval') {
      const waiting = (await docs.find('app_contact_access', { nurseId: user.id, personId, category, approvalStatus: 'pending' }))[0];
      if (waiting) return { status: 200, body: { ok: true, result: 'pending', message: 'Your request is waiting for the office to approve it.' } };
      if (reason.length < 5) return { status: 400, body: { ok: false, message: 'Say why you need this number (the office sees it).', errors: { reason: 'Required' } } };
      await docs.insert('app_contact_access', { ...base, basis: 'approval', approvalStatus: 'pending', result: 'pending', expiresAt: null });
      await scheduler.notify(await scheduler.admins(), { kind: 'contact-request', title: 'Contact access request', body: `${user.name} asks to see the ${CATEGORIES[category].toLowerCase()} number for ${base.customerName}.`, link: '#/office/contact-audit?status=pending' });
      return { status: 200, body: { ok: true, result: 'pending', message: 'Sent to the office. The number stays hidden until they approve it.' } };
    }
    // open until 30 minutes after the visit's slot ends
    if (pol === 'visit' && live) return grant('visit', new Date(Date.parse(istIso(live.date, SLOTS[live.slot].to)) + 30 * 60000).toISOString());
    if (body.emergency === true) {
      if (reason.length < 10) return { status: 400, body: { ok: false, message: 'In an emergency, describe what is happening (at least a few words). The office sees this.', errors: { reason: 'Required' } } };
      const r = await grant('emergency', new Date(Date.now() + 30 * 60000).toISOString());
      await scheduler.notify(await scheduler.admins(), { kind: 'contact-emergency', title: 'Emergency contact access', body: `${user.name} opened the ${CATEGORIES[category].toLowerCase()} number for ${base.customerName}: ${reason}`, link: '#/office/contact-audit' });
      return r;
    }
    return deny(pol === 'visit' ? 'Numbers open during your assigned visit with this customer. In an emergency, give the reason to see it now.' : 'Give the reason for this emergency to see the number.', true);
  }

  async function handle(req, res, p, parts, url, user, body) {
    // notifications: every signed-in role
    if (p === 'notifications' && req.method === 'GET') {
      const rows = await docs.find('app_notifications', { userId: user.id }, { sort: { createdAt: -1 }, limit: 50 });
      return json(res, 200, { ok: true, unread: rows.filter((n) => !n.readAt).length, rows });
    }
    if (p === 'notifications/read' && req.method === 'POST') {
      const rows = await docs.find('app_notifications', { userId: user.id });
      for (const n of rows) if (!n.readAt && (body.all || (Array.isArray(body.ids) && body.ids.includes(n.id)))) await docs.update('app_notifications', n.id, { readAt: now() });
      return json(res, 200, { ok: true });
    }
    if (parts[0] !== 'nurse') return undefined;
    if (user.role !== 'caregiver') throw forbidden();
    if (p === 'nurse/customers' && req.method === 'GET') {
      const ids = await assignedIds(user);
      const people = ids.length ? await docs.find('app_people', { id: { $in: ids } }) : [];
      const visits = await visitsOf(user.id, todayIST());
      const plans = ids.length ? await docs.find('app_plans', { personId: { $in: ids } }) : [];
      return json(res, 200, { ok: true, rows: people.filter((x) => x.active !== false).map((x) => {
        const next = visits.find((v) => v.personId === x.id && ACTIVE.includes(v.status));
        return { id: x.id, customerId: x.id, name: x.name, photo: x.photoAt || null, brands: [...new Set(plans.filter((pl) => pl.personId === x.id && (pl.status === 'active' || pl.status === 'paused')).map((pl) => pl.product))],
          next: next ? { date: next.date, slot: next.slot, start: next.start, serviceName: next.serviceName } : null };
      }).sort((a, b) => a.name.localeCompare(b.name)) });
    }
    if (parts[1] === 'customers' && parts.length === 3 && req.method === 'GET') {
      if (!(await mayAccess(user, parts[2]))) throw notFound();
      return json(res, 200, { ok: true, customer: await customerCard(user, parts[2]), categories: CATEGORIES });
    }
    if (p === 'nurse/contact-access' && req.method === 'POST') {
      const r = await contactAccess(user, body || {});
      return json(res, r.status, r.body);
    }
    if (p === 'nurse/visits' && req.method === 'GET') {
      const from = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('from') || '') ? url.searchParams.get('from') : todayIST(-31);
      const to = /^\d{4}-\d{2}-\d{2}$/.test(url.searchParams.get('to') || '') ? url.searchParams.get('to') : todayIST(62);
      const rows = await visitsOf(user.id, from, to);
      return json(res, 200, { ok: true, from, to, statuses: scheduler.STATUS, slots: SLOTS, rows: rows.map((v) => ({ id: v.id, reference: v.reference, personId: v.personId, customerName: v.customerName, product: v.product, serviceName: v.serviceName, date: v.date, slot: v.slot, start: v.start, end: v.end, location: v.location, status: v.status, note: v.note || '', history: (v.history || []).map((h) => ({ at: h.at, action: h.action, note: h.note || '' })) })) });
    }
    if (parts[1] === 'visits' && parts[3] === 'status' && parts.length === 4 && req.method === 'POST') {
      const r = await scheduler.setStatus(parts[2], user, String(body.status || ''), body.note);
      if (!r.ok) return json(res, r.code || 400, { ok: false, message: r.why });
      return json(res, 200, { ok: true, status: r.visit.status });
    }
    if (p === 'nurse/submissions' && req.method === 'GET') {
      const rows = await docs.find('app_records', { uploadedBy: user.id }, { sort: { uploadedAt: -1 }, limit: 100 });
      // a receipt only: no file, no link, no report date or contents
      return json(res, 200, { ok: true, rows: rows.map((r) => ({ customerId: r.personId, documentName: r.name, category: r.category, submittedAt: r.uploadedAt, status: r.removed ? 'Withdrawn by the office' : 'Submitted' })) });
    }
    return undefined;
  }

  return { handle, assignedIds, mayAccess, maskPhone, maskEmail, POLICIES, CATEGORIES };
}

module.exports = { create, maskPhone, maskEmail, POLICIES, CATEGORIES };
