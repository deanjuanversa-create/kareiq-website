// node tools/check-roles.js http://localhost:3000
// API checks for the nurse portal and the office, on a fresh demo server (files mode, empty data folder):
//   APP_DEMO=true node server.js
// Nurse restrictions, masked numbers and the contact access policies, the audit (never the numbers),
// analytics that add up, payments, leads, KYC, the scheduler (parallel bookings, leave) and role walls.
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '') + '/api/app/';
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

async function login(id) {
  let cookie = '', csrf = '';
  const call = async (method, path, body, raw) => {
    const h = { 'X-Requested-With': 'kareiq', cookie };
    if (csrf) h['X-CSRF'] = csrf;
    if (body && !raw) h['Content-Type'] = 'application/json';
    if (raw) Object.assign(h, raw.headers);
    const r = await fetch(BASE + path, { method, headers: h, body: raw ? raw.body : body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = r.headers.get('content-type') || '';
    return { status: r.status, ct, body: ct.includes('json') ? await r.json() : Buffer.from(await r.arrayBuffer()) };
  };
  await call('POST', 'login', { id, password: 'demo-pass-123' });
  csrf = (await call('GET', 'session')).body.csrf;
  return call;
}
const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
const addD = (n) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const overlaps = (vs) => vs.some((a) => vs.some((b) => a.id !== b.id && a.nurseId && a.nurseId === b.nurseId && a.date === b.date && a.start && b.start && a.start < b.end && b.start < a.end));

(async () => {
  const nurse = await login('nurse@demo.kareiq'), nest = await login('nest@demo.kareiq'), office = await login('admin@demo.kareiq'), fam = await login('family@demo.kareiq');
  let r;

  // ---------------------------------------------------------------- role walls
  for (const p of ['admin/analytics/customers', 'admin/finance/invoices', 'admin/contact-audit', 'admin/employees']) {
    ok((await nurse('GET', p)).status === 403 && (await fam('GET', p)).status === 403, 'office only: ' + p);
  }
  ok((await fam('GET', 'nurse/customers')).status === 403 && (await office('GET', 'nurse/visits')).status === 403, 'nurse routes are for nurses only');
  for (const p of ['people/P-DEMO04/records', 'people/P-DEMO04/details', 'risk/forms?person=P-DEMO04', 'people/P-DEMO04/dashboard', 'details']) {
    ok((await nurse('GET', p)).status === 403, 'nurse cannot read ' + p);
  }
  ok((await nurse('POST', 'people/P-DEMO04/risks', { test: 'tug', inputs: { seconds: 10 } })).status === 403, 'nurse cannot save risk checks');
  ok((await nurse('GET', 'records/demo-d-P-DEMO01-ecg/file')).status === 404, 'nurse cannot open a medical record file');

  // ---------------------------------------------------------------- restricted customer information, masked
  r = await nurse('GET', 'nurse/customers');
  ok(r.status === 200 && r.body.rows.some((c) => c.id === 'P-DEMO04') && !r.body.rows.some((c) => c.id === 'P-DEMO02'), 'nurse sees only assigned customers');
  r = await nurse('GET', 'nurse/customers/P-DEMO04');
  const card = r.body.customer, raw = JSON.stringify(r.body);
  ok(card.general.phone1 === '+91 XXXXX 12345', 'mobile masked: ' + card.general.phone1);
  ok(!/9800012345|9800054321|9800077777|kamala\.demo@/.test(raw), 'no full number or email anywhere in the response');
  ok(card.emergency[0].phone === '+91 XXXXX 00003' && card.doctors[0].phone === '+91 XXXXX 77777', 'emergency and doctor numbers masked');
  ok(!('records' in card) && !('risks' in card) && !('readings' in card), 'no medical data in the customer card');
  ok((await nest('GET', 'nurse/customers/P-DEMO04')).status === 404, 'another nurse cannot open the customer');

  // ---------------------------------------------------------------- contact access: policy "visit" (default)
  r = await nurse('POST', 'nurse/contact-access', { personId: 'P-DEMO04', category: 'customer' });
  const live = card.access.visitNow;
  if (live) ok(r.body.result === 'granted' && r.body.basis === 'visit', 'during the visit the number opens');
  else ok(r.body.result === 'denied' && r.body.needsEmergency, 'outside a visit the number stays hidden');
  ok((await nurse('POST', 'nurse/contact-access', { personId: 'P-DEMO04', category: 'emergency', emergency: true, reason: 'short' })).status === 400, 'an emergency needs a real reason');
  r = await nurse('POST', 'nurse/contact-access', { personId: 'P-DEMO04', category: 'emergency', emergency: true, reason: 'She fell and is not answering the door' });
  ok(r.body.result === 'granted' && r.body.values.ec1Phone === '+919800000003', 'emergency with a reason opens the number');
  ok(r.body.expiresAt > new Date().toISOString() && Date.parse(r.body.expiresAt) - Date.now() <= 31 * 60000, 'emergency access lasts 30 minutes');
  ok((await nest('POST', 'nurse/contact-access', { personId: 'P-DEMO04', category: 'customer', emergency: true, reason: 'Trying someone else\'s customer' })).status === 404, 'not for customers of other nurses');

  // ---------------------------------------------------------------- policy "approval"
  ok((await office('POST', 'admin/settings/contact-policy', { policy: 'approval' })).status === 200, 'office sets the approval policy');
  ok((await nurse('POST', 'nurse/contact-access', { personId: 'P-DEMO04', category: 'doctor' })).status === 400, 'approval needs a reason');
  r = await nurse('POST', 'nurse/contact-access', { personId: 'P-DEMO04', category: 'doctor', reason: 'To share the visit report' });
  ok(r.body.result === 'pending' && !r.body.values, 'request waits; nothing shown');
  r = await office('GET', 'admin/contact-audit?approval=pending');
  const pend = r.body.rows[0];
  ok(r.body.pending === 1 && pend.category === 'doctor', 'office sees the waiting request');
  r = await office('GET', 'notifications');
  ok(r.body.rows.some((n) => n.kind === 'contact-request') && r.body.rows.some((n) => n.kind === 'contact-emergency'), 'office was notified of the request and the emergency');
  ok((await nurse('POST', 'admin/contact-audit/' + pend.id + '/decide', { approve: true })).status === 403, 'a nurse cannot approve');
  ok((await office('POST', 'admin/contact-audit/' + pend.id + '/decide', { approve: true, minutes: 60 })).status === 200, 'office approves');
  r = await nurse('POST', 'nurse/contact-access', { personId: 'P-DEMO04', category: 'doctor' });
  ok(r.body.result === 'granted' && r.body.values.fdPhone === '+919800077777', 'approved number opens');
  ok((await nurse('GET', 'notifications')).body.rows.some((n) => n.kind === 'contact-decided'), 'nurse told of the decision');
  // policy "emergency"
  await office('POST', 'admin/settings/contact-policy', { policy: 'emergency' });
  r = await nest('POST', 'nurse/contact-access', { personId: 'P-DEMO05', category: 'customer' });
  ok(r.body.result === 'denied' && r.body.needsEmergency, 'emergency-only policy: no reason, no number (even during a visit)');
  await office('POST', 'admin/settings/contact-policy', { policy: 'visit' });
  ok((await office('POST', 'admin/settings/contact-policy', { policy: 'anything' })).status === 400, 'unknown policy refused');

  // ---------------------------------------------------------------- the audit: complete, never the numbers
  r = await office('GET', 'admin/contact-audit?size=100');
  const audit = JSON.stringify(r.body.rows);
  ok(r.body.total >= 5 && r.body.rows.every((a) => a.eventId && a.nurseId && a.employeeId && a.personId && a.at && a.category && a.result), 'every request is recorded with who, whom, what, when and the result');
  ok(!/9800012345|9800000003|9800077777|98000/.test(audit), 'no phone number is stored in the audit');
  ok(r.body.rows.some((a) => a.reason === 'She fell and is not answering the door' && a.basis === 'emergency'), 'emergency reason kept');
  ok(r.body.rows.some((a) => a.result === 'denied'), 'refusals are recorded too');
  r = await office('GET', 'admin/contact-audit?nurse=demo-u-nest');
  ok(r.body.rows.every((a) => a.nurseId === 'demo-u-nest'), 'filter by nurse');

  // ---------------------------------------------------------------- nurse visits and submissions
  r = await nurse('GET', 'nurse/visits?from=' + addD(-30) + '&to=' + addD(30));
  const mine = r.body.rows;
  ok(mine.length >= 5 && mine.every((v) => v.reference && v.date && v.slot), 'nurse visits listed');
  const nextV = mine.find((v) => v.status === 'assigned');
  ok((await nest('POST', 'nurse/visits/' + nextV.id + '/status', { status: 'accepted' })).status === 404, 'another nurse cannot update the visit');
  ok((await nurse('POST', 'nurse/visits/' + nextV.id + '/status', { status: 'cancelled' })).status === 403, 'a nurse cannot cancel');
  ok((await nurse('POST', 'nurse/visits/' + nextV.id + '/status', { status: 'accepted' })).body.status === 'accepted', 'nurse accepts');
  const up = await nurse('POST', 'people/P-DEMO04/records', null, { headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent('Visit report'), 'X-Category': 'general' }, body: Buffer.from('%PDF-1.4 test') });
  ok(up.status === 201 && up.body.receipt && up.body.receipt.status === 'Submitted' && !up.body.id && !up.body.fileId, 'upload returns a receipt only');
  r = await nurse('GET', 'nurse/submissions');
  ok(r.body.rows[0].documentName === 'Visit report' && !JSON.stringify(r.body).includes('fileId'), 'submissions are receipts with no file link');
  ok((await nurse('GET', 'people/P-DEMO02/records')).status === 403, 'nurse cannot list records even for another person');

  // ---------------------------------------------------------------- scheduler over HTTP: parallel bookings, no overlaps
  const day = (() => { for (let i = 20; i < 30; i++) if (new Date(addD(i) + 'T12:00:00Z').getUTCDay() !== 0) return addD(i); })();
  const before = (await office('GET', 'admin/scheduler/visits?from=' + day + '&to=' + day)).body.rows.length;
  const people = ['P-DEMO01', 'P-DEMO04', 'P-DEMO01', 'P-DEMO04', 'P-DEMO01', 'P-DEMO04'];
  const res = await Promise.all(people.map((pid, i) => office('POST', 'admin/scheduler/visits', { personId: pid, date: day, slot: 'morning', service: i % 2 ? 'physiotherapy' : 'blood-collection' })));
  ok(res.every((x) => x.status === 201), 'six parallel bookings accepted');
  r = await office('GET', 'admin/scheduler/visits?from=' + day + '&to=' + day);
  const vs = r.body.rows;
  ok(vs.length === before + 6, 'six visits made');
  ok(!overlaps(vs), 'no nurse has overlapping visits');
  ok(vs.filter((v) => v.nurseId).every((v) => v.nurseId === 'demo-u-nurse'), 'Kare@Home visits go only to the Kare@Home nurse');
  ok(r.body.conflicts.length === 0, 'no conflicts reported');
  // leave: visits move or wait; the office is told
  const assigned = vs.filter((v) => v.nurseId === 'demo-u-nurse');
  r = await office('POST', 'admin/scheduler/nurses/demo-u-nurse/leave', { from: day, to: day, reason: 'Test leave' });
  ok(r.status === 201 && r.body.moved.length === assigned.length, 'leave releases that day\'s visits: ' + r.body.moved.length);
  r = await office('GET', 'admin/scheduler/visits?from=' + day + '&to=' + day);
  ok(r.body.rows.every((v) => v.nurseId !== 'demo-u-nurse'), 'nobody is booked with a nurse on leave');
  ok(r.body.rows.filter((v) => v.status !== 'cancelled').every((v) => v.status === 'awaiting_assignment'), 'with no other Kare@Home nurse they wait for the office');
  const waiting = r.body.rows[0];
  r = await office('GET', 'admin/scheduler/visits/' + waiting.id + '/options');
  ok(r.body.rows.find((o) => o.id === 'demo-u-nurse').ok === false, 'options explain the nurse on leave cannot take it');
  ok((await office('POST', 'admin/scheduler/visits/' + waiting.id + '/assign', { nurseId: 'demo-u-nurse' })).status === 409, 'manual assignment also respects leave');
  // holiday
  await office('POST', 'admin/scheduler/holidays', { holidays: [{ date: addD(40), name: 'Test holiday' }] });
  r = await office('POST', 'admin/scheduler/visits', { personId: 'P-DEMO01', date: addD(40), slot: 'morning', service: 'physiotherapy' });
  ok(r.body.assigned === false, 'no assignment on a holiday');

  // ---------------------------------------------------------------- analytics add up
  r = await office('GET', 'admin/analytics/customers');
  const k = r.body.kpis;
  ok(k.total === k.active + k.inactive, 'active + inactive = total');
  ok(r.body.acquisition[r.body.acquisition.length - 1].value === k.total, 'acquisition ends at the total');
  const kh = (await office('GET', 'admin/analytics/customers?brand=karehome')).body.kpis.total, kn = (await office('GET', 'admin/analytics/customers?brand=karenest')).body.kpis.total;
  ok(r.body.byBrand.find((b) => b.key === 'karehome').value === kh && r.body.byBrand.find((b) => b.key === 'karenest').value === kn, 'brand chart matches the brand filter');
  r = await office('GET', 'admin/finance/invoices?size=100');
  const inv = r.body.rows;
  ok(inv.every((i) => i.outstanding === Math.max(0, i.amount - i.paid)), 'outstanding = amount - paid on every invoice');
  ok(r.body.totals.outstanding === inv.reduce((s, i) => s + i.outstanding, 0), 'totals add up');
  let rev = (await office('GET', 'admin/analytics/revenue')).body.kpis;
  const unpaid = inv.find((i) => i.status === 'unpaid');
  ok((await office('POST', 'admin/finance/payments', { planId: unpaid.planId, method: 'upi', ref: 'CHK-1', amount: unpaid.outstanding + 1 })).status === 400, 'cannot record more than is owed');
  ok((await office('POST', 'admin/finance/payments', { planId: unpaid.planId, method: 'upi', ref: 'CHK-1', amount: 500 })).status === 201, 'payment recorded');
  ok((await office('POST', 'admin/finance/payments', { planId: unpaid.planId, method: 'upi', ref: 'CHK-1', amount: 500 })).status === 409, 'the same transaction cannot be recorded twice');
  let rev2 = (await office('GET', 'admin/analytics/revenue')).body.kpis;
  ok(rev2.collected === rev.collected + 500 && rev2.outstanding === rev.outstanding - 500, 'revenue moves by exactly the payment');
  ok((await office('POST', 'admin/finance/refunds', { planId: unpaid.planId, amount: 600, ref: 'RF-1', reason: 'test' })).status === 400, 'refund cannot exceed what was paid');
  ok((await office('POST', 'admin/finance/refunds', { planId: unpaid.planId, amount: 200, ref: 'RF-1', reason: 'Overcharged' })).status === 201, 'refund recorded');
  rev = (await office('GET', 'admin/analytics/revenue')).body.kpis;
  ok(rev.collected === rev2.collected - 200 && rev.refunds >= 200, 'refunds reduce collected');
  r = await office('GET', 'admin/finance/invoices/' + unpaid.planId + '/pdf');
  ok(r.status === 200 && r.ct === 'application/pdf' && r.body.slice(0, 4).toString() === '%PDF', 'invoice PDF');
  r = await office('GET', 'admin/finance/due');
  ok(r.body.rows.every((i) => i.outstanding > 0) && r.body.rows.every((a, i, x) => !i || x[i - 1].overdueDays >= a.overdueDays), 'payment due: only money owed, most overdue first');

  // ---------------------------------------------------------------- leads
  r = await office('GET', 'admin/leads/overview');
  ok(r.body.kpis.duplicatesMerged >= 1, 'repeat enquiries from one number count once');
  const lk = r.body.kpis; ok(lk.total === lk.new + lk.contacted + lk.followUp + lk.converted + lk.lost, 'lead statuses add up to the total');
  r = await office('GET', 'admin/leads?q=Sunil');
  ok(r.body.rows.length === 2 && r.body.rows.every((l) => l.duplicates === 1), 'both enquiries from the same number are marked');
  const lead = r.body.rows[0];
  ok((await office('POST', 'admin/leads/' + lead.type + '/' + lead.id + '/assign', { userId: 'demo-u-admin', note: 'Call back' })).status === 200, 'lead assigned');
  ok((await office('PATCH', 'admin/leads/' + lead.type + '/' + lead.id, { status: 'follow_up', note: 'Wants a demo' })).status === 200, 'lead status changed');
  r = await office('GET', 'admin/leads/' + lead.type + '/' + lead.id);
  ok(r.body.lead.history.length === 2 && r.body.lead.status === 'follow_up' && r.body.lead.assignedTo === 'demo-u-admin', 'lead history kept');
  ok((await nurse('GET', 'admin/leads')).status === 403, 'nurses cannot see leads');

  // ---------------------------------------------------------------- customers, employees, KYC
  r = await office('GET', 'admin/customers?size=5&page=1');
  ok(r.body.rows.length <= 5 && r.body.pages >= 1 && r.body.total >= 5, 'customer directory pages');
  ok((await office('GET', 'admin/customers?q=04')).body.rows.length === 1, 'search does not match partial phone digits');
  r = await office('GET', 'admin/customers/P-DEMO04');
  ok(r.body.customer.id === 'P-DEMO04' && r.body.visits.length > 0 && r.body.links.length > 0, 'consolidated profile');
  r = await office('GET', 'admin/employees');
  const emp = r.body.rows.find((x) => x.userId === 'demo-u-nurse');
  ok(emp.employeeId === 'EMP-DEMO02' && emp.service && emp.service.years >= 2, 'employee ID and length of service: ' + (emp.service && emp.service.text));
  r = await office('GET', 'admin/employees/demo-u-nurse');
  const kdoc = r.body.employee.kyc.docs.find((d) => d.status === 'submitted');
  ok(r.body.employee.kyc.status === 'submitted' && kdoc, 'KYC waiting for one document');
  ok((await nurse('GET', 'admin/employees/demo-u-nurse/kyc/' + kdoc.id)).status === 403, 'nurse cannot open KYC files');
  r = await office('GET', 'admin/employees/demo-u-nurse/kyc/' + kdoc.id);
  ok(r.status === 200 && r.body.slice(0, 4).toString() === '%PDF', 'office opens the KYC file');
  await office('POST', 'admin/employees/demo-u-nurse/kyc/' + kdoc.id, { status: 'verified' });
  ok((await office('GET', 'admin/employees/demo-u-nurse')).body.employee.kyc.status === 'verified', 'KYC verified when every required document is');
  ok((await office('PATCH', 'admin/employees/demo-u-nurse', { joinDate: addD(5) })).status === 400, 'joining date cannot be in the future');

  console.log(`check-roles: PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERROR', e); process.exit(1); });
