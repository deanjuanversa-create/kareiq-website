#!/usr/bin/env node
// Checks the customer lifecycle end to end against a running demo server (fresh data folder):
// package request -> enquiry -> General Information by the Operations Team -> approval -> payment ->
// nurse onboarding eligibility -> onboarding -> nurse Customer Profiles; contact-number access requests;
// KareIQ Policies permissions; the nurse navigation.
//   APP_DEMO=true node server.js      (fresh data folder), then:
//   node tools/check-lifecycle.js http://localhost:3000
const fs = require('fs');
const path = require('path');

const URL0 = process.argv[2] || 'http://localhost:3000';
const BASE = URL0.replace(/\/$/, '') + '/api/app/';
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('PASS ', msg); } else { fail++; console.log('FAIL ', msg); } };

async function login(id) {
  let cookie = '', csrf = '';
  const call = async (method, p, body) => {
    const h = { 'X-Requested-With': 'kareiq', cookie };
    if (csrf) h['X-CSRF'] = csrf;
    if (body) h['Content-Type'] = 'application/json';
    const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; }
    return { status: r.status, body: j, text: t };
  };
  const r = await call('POST', 'login', { id, password: 'demo-pass-123' });
  if (r.status !== 200) throw new Error('login failed for ' + id);
  csrf = (await call('GET', 'session')).body.csrf;
  return call;
}

(async () => {
  const office = await login('admin@demo.kareiq'), nurse = await login('nurse@demo.kareiq'), nest = await login('nest@demo.kareiq');
  const rahul = await login('rahul@demo.kareiq'), fam = await login('family@demo.kareiq');
  const P = 'P-DEMO03'; // Saraswathi Menon: Rahul's mother, no package bought yet, so no nurse assigned
  const PHONE1 = '9812300011', PHONE2 = '9812300022';

  // ---------------------------------------------------------------- 1. a package request creates an enquiry
  let r = await rahul('POST', 'people/' + P + '/orders', { planId: 'homeplus', months: '3', agree: true, idem: 'chk-lifecycle-0001' });
  ok(r.status === 201 && r.body.order && r.body.order.status === 'awaiting_approval', '1. customer package request accepted, waiting for approval (' + r.status + ' ' + (r.body.order && r.body.order.status) + ')');
  const order = r.body.order || {};
  ok(order.enquiryRef && /^KQ-/.test(order.enquiryRef), '1. the request carries its enquiry reference ' + order.enquiryRef);
  r = await office('GET', 'admin/leads?size=100');
  const lead = r.body.rows.find((l) => l.enquiryId === order.enquiryRef);
  ok(lead && lead.requestKind === 'order' && lead.personId === P && lead.packageName, '1. the request is in the Admin Enquiry database, linked to the customer (' + (lead && lead.title) + ')');
  ok((await rahul('POST', 'people/' + P + '/orders', { planId: 'homeplus', months: '3', agree: true, idem: 'chk-lifecycle-0002' })).status === 409, '1. a second open request for the same package is refused');
  const peopleBefore = (await office('GET', 'admin/customers?size=200')).body.total;

  // ---------------------------------------------------------------- no package bought: no nurse
  const NURSE = 'demo-u-nurse';
  r = await office('POST', 'admin/links', { userId: NURSE, personId: P });
  ok(r.status === 409, 'a nurse cannot be assigned to a customer who has not bought a package (' + r.status + ')');
  ok(!(await nurse('GET', 'nurse/customers')).body.rows.some((x) => x.id === P), 'the customer is not in any nurse\'s Assigned customers');

  // ---------------------------------------------------------------- 5. a pending enquiry gives no onboarding eligibility
  r = await nurse('GET', 'nurse/onboarding');
  ok(r.status === 200 && !r.body.rows.some((x) => x.id === P), '5. pending enquiry: the customer is not in the nurse\'s Customer Onboarding list');
  r = await nurse('POST', 'people/' + P + '/onboarding', { confirm: true, data: { maritalStatus: 'Married' } });
  ok([403, 404].includes(r.status), '5. pending enquiry: onboarding refused by the server (' + r.status + ')');
  ok((await office('POST', 'admin/orders/' + order.id + '/verify', { method: 'upi', paymentRef: 'EARLY-001', amount: order.amount })).status === 409, '5. a payment cannot be recorded before the package is approved');

  // ---------------------------------------------------------------- 2. the Operations Team saves the General Information
  const id = lead.id;
  ok((await office('POST', 'admin/leads/enquiry/' + id + '/approve', {})).status === 409, '2. approval refused until the General Information is captured');
  r = await office('POST', 'admin/leads/enquiry/' + id + '/general', { data: { name: 'Saraswathi Menon', email: 'not-an-email', phone1: '12', dob: '2999-01-01' } });
  ok(r.status === 400 && r.body.errors.email && r.body.errors.phone1 && r.body.errors.dob, '2. invalid email, contact number and date of birth refused');
  r = await office('POST', 'admin/leads/enquiry/' + id + '/general', { data: { email: 'sara@example.com' } });
  ok(r.status === 400 && r.body.errors.name && r.body.errors.phone1, '2. Name and Primary Contact Number are required');
  const general = { name: 'Saraswathi Menon', dob: '1955-03-02', gender: 'Female', bloodGroup: 'A+', qualification: 'Degree', languages: 'Malayalam, English', address: '4 Lake View, Kochi (demo)', email: 'sara.demo@example.com', phone1: PHONE1, phone2: PHONE2 };
  r = await office('GET', 'admin/leads/enquiry/' + id);
  ok(r.body.general && r.body.general.fields.map((f) => f.label).join('|') === 'Name|Date of Birth|Age|Gender|Blood Group|Qualifications|Languages Spoken|Address|Email|Primary Contact Number|Secondary Contact Number', '2. the form has exactly the eleven General Information fields');
  r = await office('POST', 'admin/leads/enquiry/' + id + '/general', { data: { ...general, age: 99 }, version: r.body.general.version });
  ok(r.status === 200 && r.body.changed >= 10, '2. all General Information saved (' + r.status + ', ' + r.body.changed + ' fields)');
  r = await office('GET', 'admin/leads/enquiry/' + id);
  const g = r.body.general;
  ok(Object.keys(general).every((k) => g.data[k] === general[k]), '2. every field read back as saved');
  const age = new Date().getFullYear() - 1955 - (new Date().toISOString().slice(5, 10) < '03-02' ? 1 : 0);
  ok(g.age === age && !('age' in g.data), '2. Age worked out from the date of birth (' + g.age + '), never stored as typed');
  ok(g.history[0].source === 'operations' && g.history[0].enquiryRef === order.enquiryRef && r.body.lead.history.some((h) => h.action === 'general'), '2. source and update history kept (Operations Team, enquiry ' + order.enquiryRef + ')');
  ok((await office('GET', 'admin/customers?size=200')).body.total === peopleBefore, '2. no duplicate customer record created');
  ok((await office('POST', 'admin/leads/enquiry/' + id + '/general', { data: general, version: 0 })).status === 409, '2. a stale edit is refused (someone else saved first)');
  ok((await rahul('POST', 'admin/leads/enquiry/' + id + '/general', { data: general })).status === 403 && (await nurse('POST', 'admin/leads/enquiry/' + id + '/general', { data: general })).status === 403, '2. only the office captures General Information');

  // ---------------------------------------------------------------- 6. approval without payment: still not eligible
  ok((await rahul('POST', 'admin/leads/enquiry/' + id + '/approve', {})).status === 403, '6. a customer cannot approve');
  r = await office('POST', 'admin/leads/enquiry/' + id + '/approve', { note: 'Checked on the call' });
  ok(r.status === 200, '6. office approves the package (' + r.status + ')');
  r = await office('GET', 'admin/leads/enquiry/' + id);
  ok(r.body.lifecycle.stage === 'approved' && r.body.lifecycle.order.status === 'awaiting_payment' && !r.body.lifecycle.eligible, '6. approved, waiting for payment, not eligible');
  ok(!(await nurse('GET', 'nurse/onboarding')).body.rows.some((x) => x.id === P), '6. approved but unpaid: not in Customer Onboarding');
  ok([403, 404].includes((await nurse('POST', 'people/' + P + '/onboarding', { confirm: true, data: { maritalStatus: 'Married' } })).status), '6. approved but unpaid: onboarding refused');
  ok((await office('POST', 'admin/orders/' + order.id + '/verify', { method: 'upi', paymentRef: 'PART-001', amount: Math.round(order.amount / 2) })).status === 400, '6. a part payment does not confirm the order');
  ok(!(await nurse('GET', 'nurse/onboarding')).body.rows.some((x) => x.id === P), '6. still not eligible after a refused part payment');

  // ---------------------------------------------------------------- 7. approval + payment: eligible
  r = await office('POST', 'admin/orders/' + order.id + '/verify', { method: 'upi', paymentRef: 'LIFE-0001', amount: order.amount });
  ok(r.status === 200 && r.body.plan && r.body.plan.status === 'active', '7. payment verified, package active');
  r = await office('GET', 'admin/leads/enquiry/' + id);
  ok(r.body.lifecycle.stage === 'active' && r.body.lifecycle.eligible, '7. lifecycle: paid and eligible');
  ok(!(await nurse('GET', 'nurse/onboarding')).body.rows.some((x) => x.id === P), '7. paid but no nurse assigned yet: in nobody\'s list');
  r = await office('POST', 'admin/links', { userId: NURSE, personId: P });
  ok(r.status === 201, '7. once the package is bought, the office assigns the nurse (' + r.status + ')');
  r = await nurse('GET', 'nurse/onboarding');
  const row = r.body.rows.find((x) => x.id === P);
  ok(row && row.status === 'pending' && row.package && /HomePlus/i.test(row.package.name), '7. the customer appears in Customer Onboarding as Pending with the approved package (' + (row && row.package && row.package.name) + ')');
  ok((await nurse('GET', 'notifications')).body.rows.some((n) => n.kind === 'onboarding-ready' && n.personId === P), '7. the assigned nurse was told the customer is ready');

  // ---------------------------------------------------------------- 3 + 4. synchronised to the nurse, contact numbers masked
  r = await nurse('GET', 'nurse/customers/' + P);
  const card = r.body.customer;
  ok(r.status === 200 && card.general.name === general.name && card.general.dob === general.dob && card.general.bloodGroup === 'A+' && card.general.qualification === 'Degree' && card.general.languages === general.languages && card.general.address === general.address && card.general.age === age, '3. General Information synchronised to the nurse\'s customer record');
  const nurseTexts = [r.text, (await nurse('GET', 'nurse/onboarding')).text, (await nurse('GET', 'people/' + P + '/onboarding')).text, (await nurse('GET', 'nurse/customers')).text];
  ok(card.general.phone1 === '+91 XXXXX 00011' && card.general.phone2 === '+91 XXXXX 00022', '4. contact numbers masked in the nurse card (' + card.general.phone1 + ', ' + card.general.phone2 + ')');
  ok(nurseTexts.every((t) => !t.includes(PHONE1) && !t.includes(PHONE2) && !t.includes('sara.demo@example.com')), '4. full numbers and email absent from every nurse API response');
  r = await nurse('GET', 'people/' + P + '/onboarding');
  ok(r.body.eligible && r.body.canSubmit && r.body.lockedKeys.includes('phone1') && r.body.general.name === general.name && r.body.general.phone1 === '+91 XXXXX 00011', '3. the onboarding form shows the General Information read only (no re-entry), numbers masked');

  // ---------------------------------------------------------------- 8. only the assigned nurse
  ok([403, 404].includes((await nest('GET', 'people/' + P + '/onboarding')).status) && !(await nest('GET', 'nurse/onboarding')).body.rows.some((x) => x.id === P), '8. a nurse not assigned cannot see the onboarding task');
  ok([403, 404].includes((await nest('POST', 'people/' + P + '/onboarding', { confirm: true, data: { maritalStatus: 'Married' } })).status), '8. a nurse not assigned cannot submit it');
  ok((await office('POST', 'people/' + P + '/onboarding', { confirm: true, data: { maritalStatus: 'Married' } })).status === 403 && [403, 404].includes((await rahul('GET', 'people/' + P + '/onboarding')).status), '8. the office and the family cannot submit onboarding');

  // ---------------------------------------------------------------- 9 + 10. onboarding once; the Customer Profile is updated
  r = await nurse('POST', 'people/' + P + '/onboarding', { confirm: true, data: { name: 'Typed by the nurse', phone1: '9000000000', kycIdType: 'Aadhar', kycIdNumber: '1234 5678 9012', ec1Name: 'Rahul Menon', ec1Relation: 'Son', ec1Phone: '9812300033' } });
  ok(r.status === 201, '9. the assigned nurse submits the onboarding (' + r.status + ')');
  const twice = await Promise.all([1, 2, 3].map(() => nurse('POST', 'people/' + P + '/onboarding', { confirm: true, data: { ec1Name: 'Again' } })));
  ok(twice.every((x) => x.status === 409), '10. onboarding cannot be submitted again (' + twice.map((x) => x.status).join(',') + ')');
  ok((await nurse('PUT', 'people/' + P + '/onboarding', { data: {} })).status === 405 && (await nurse('DELETE', 'people/' + P + '/onboarding')).status === 405, '10. the completed record cannot be edited or deleted');
  const rec = (await office('GET', 'people/' + P + '/onboarding')).body.record;
  ok(rec.data.name === general.name && rec.data.phone1 === PHONE1 && rec.data.ec1Name === 'Rahul Menon', '9. the record keeps the Operations Team\'s General Information (the nurse cannot overwrite it) plus the nurse\'s entries');
  r = await nurse('GET', 'nurse/customers/' + P);
  ok(r.body.customer.onboarding.status === 'completed' && r.body.customer.onboarding.completedAt && r.body.customer.emergency.some((x) => x.name === 'Rahul Menon' && /XXXXX/.test(x.phone)), '9. the customer\'s page under Assigned customers shows the onboarding as completed, with the new details (numbers masked)');
  ok((await nurse('GET', 'nurse/customers')).body.rows.find((x) => x.id === P).onboarding === 'completed', '9. Assigned customers marks the customer as onboarded');
  r = await nurse('GET', 'nurse/onboarding');
  ok(r.body.rows.find((x) => x.id === P).status === 'completed', '9. Customer Onboarding shows Completed');
  r = await office('GET', 'admin/leads/enquiry/' + id);
  ok(r.body.lifecycle.stage === 'onboarded', '9. the enquiry shows the whole lifecycle completed');

  // ---------------------------------------------------------------- 11. contact access requests reach the office
  r = await nurse('POST', 'nurse/contact-access', { personId: P, category: 'customer', request: true, fields: ['phone1', 'phone2'], reason: 'To confirm tomorrow\'s visit time' });
  ok(r.body.result === 'pending' && !r.body.values, '11. Request Access sent; nothing shown yet');
  ok((await nurse('POST', 'nurse/contact-access', { personId: P, category: 'customer', request: true, fields: ['phone1'], reason: 'Again please' })).body.result === 'pending', '11. a second request waits for the first');
  r = await office('GET', 'admin/contact-audit?approval=pending');
  const req1 = r.body.rows.find((x) => x.personId === P);
  ok(req1 && req1.fields.join() === 'phone1,phone2' && req1.reason && req1.nurseName, '11. the office sees the request: nurse, customer, details asked for and why');
  ok((await office('GET', 'notifications')).body.rows.some((n) => n.kind === 'contact-request'), '11. the office was notified');
  ok(!JSON.stringify(r.body.rows).includes(PHONE1), '11. the audit never stores the numbers');

  // ---------------------------------------------------------------- 12. approval opens only what was approved
  ok((await nurse('POST', 'admin/contact-audit/' + req1.id + '/decide', { approve: true })).status === 403, '12. a nurse cannot approve');
  r = await office('POST', 'admin/contact-audit/' + req1.id + '/decide', { approve: true, minutes: 60, fields: ['phone1'] });
  ok(r.status === 200, '12. office approves the Primary Contact Number only');
  r = await nurse('POST', 'nurse/contact-access', { personId: P, category: 'customer' });
  ok(r.body.result === 'granted' && r.body.values.phone1 === PHONE1 && !('phone2' in r.body.values) && !('email' in r.body.values), '12. only the approved number is shown');
  r = await nurse('GET', 'nurse/customers/' + P);
  ok(r.body.customer.general.phone2 === '+91 XXXXX 00022' && !r.text.includes(PHONE2), '12. the other number stays masked');
  ok(!(await nurse('GET', 'nurse/customers/P-DEMO04')).body.customer.access.customer.open && (await nurse('POST', 'nurse/contact-access', { personId: 'P-DEMO04', category: 'customer' })).status === 400, '12. the approval does not open another customer\'s numbers');
  ok((await nest('POST', 'nurse/contact-access', { personId: P, category: 'customer' })).status === 404, '12. nor for another nurse');
  r = await office('POST', 'admin/contact-audit/' + req1.id + '/revoke', {});
  ok(r.status === 200, '12. the office revokes the access');
  r = await nurse('POST', 'nurse/contact-access', { personId: P, category: 'customer' });
  ok(r.status === 400 && !r.body.values, '12. after revocation the number is hidden again');

  // ---------------------------------------------------------------- 13. rejection reveals nothing
  r = await nurse('POST', 'nurse/contact-access', { personId: P, category: 'customer', request: true, fields: ['phone2'], reason: 'Need the second number for the visit' });
  const req2 = (await office('GET', 'admin/contact-audit?approval=pending')).body.rows.find((x) => x.personId === P);
  ok(r.body.result === 'pending' && req2 && req2.fields.join() === 'phone2', '13. a new request for the Secondary Contact Number');
  ok((await office('POST', 'admin/contact-audit/' + req2.id + '/decide', { approve: false, note: 'Use the primary number' })).status === 200, '13. office rejects it');
  r = await nurse('POST', 'nurse/contact-access', { personId: P, category: 'customer' });
  const card2 = await nurse('GET', 'nurse/customers/' + P);
  ok(!r.body.values && !card2.text.includes(PHONE2) && !card2.text.includes(PHONE1) && card2.body.customer.access.customer.open === false, '13. after rejection the numbers stay masked');
  ok((await nurse('GET', 'notifications')).body.rows.some((n) => n.kind === 'contact-decided' && /declined/i.test(n.title)), '13. the nurse was told');
  r = await office('GET', 'admin/contact-audit?customer=' + P);
  ok(r.body.rows.some((a) => a.approvalStatus === 'approved' && a.decidedByName && a.decidedAt && a.revokedAt) && r.body.rows.some((a) => a.approvalStatus === 'rejected' && a.decidedByName), '13. requests, decisions, deciders, times and the revocation are all recorded');

  // ---------------------------------------------------------------- the decline path and the plan-request path
  r = await office('GET', 'admin/leads?size=100');
  const planReq = r.body.rows.find((l) => l.requestKind === 'plan-request' && l.personId === P);
  if (planReq) { // the demo's own plan request for Saraswathi (made before this run): decline it with a reason
    ok((await office('POST', 'admin/leads/enquiry/' + planReq.id + '/reject', {})).status === 400, 'declining needs a reason');
    ok((await office('POST', 'admin/leads/enquiry/' + planReq.id + '/reject', { note: 'Bought HomePlus instead' })).status === 200, 'office declines the earlier plan request');
    ok((await office('GET', 'admin/leads/enquiry/' + planReq.id)).body.lifecycle.stage === 'rejected', 'the declined request shows as declined');
  }
  r = await fam('POST', 'people/P-DEMO02/orders', { planId: 'homeplus', months: '1', agree: true, idem: 'chk-lifecycle-0003' });
  const o2 = r.body.order;
  ok(r.status === 201 && o2.status === 'awaiting_approval', 'another customer request (Gopal, HomePlus)');
  const l2 = (await office('GET', 'admin/leads?size=100')).body.rows.find((l) => l.enquiryId === o2.enquiryRef);
  ok((await office('POST', 'admin/leads/enquiry/' + l2.id + '/reject', { note: 'Not available at KareNest' })).status === 200 && (await fam('GET', 'people/P-DEMO02/orders')).body.rows.find((x) => x.id === o2.id).status === 'rejected', 'declined: the customer sees the request as declined');

  // ---------------------------------------------------------------- 14. KareIQ Policies: one section, filters, permissions
  const appJs = fs.readFileSync(path.join(__dirname, '..', 'app', 'app.js'), 'utf8'), officeJs = fs.readFileSync(path.join(__dirname, '..', 'app', 'office.js'), 'utf8');
  ok(/\['policies', 'KareIQ Policies', 'shield'\]/.test(appJs) && /\['policies', 'KareIQ Policies', 'shield'\]/.test(officeJs) && !/label: 'KareIQ Policies', icon: 'shield', sub:/.test(appJs + officeJs), '14. KareIQ Policies is a standalone section (not a dropdown) for customers and the office');
  r = await fam('GET', 'policies');
  ok(r.status === 200 && r.body.rows.map((x) => x.title).join('|') === 'Onboarding Documents|Disciplinary Framework|Code of Conduct|Grievance Red Policy|Resident and Visitor|Rights and Charter|Resident Leave Form' && r.body.canEdit === false, '14. the customer sees the seven categories, read only');
  const keys = r.body.rows.map((x) => x.key);
  const each = await Promise.all(keys.map((k) => fam('GET', 'policies/' + k)));
  ok(each.every((x, i) => x.status === 200 && x.body.policy.title === r.body.rows[i].title), '14. every category filter opens its own policy');
  ok((await fam('PUT', 'policies/' + keys[2], { content: 'Changed by a customer' })).status === 403 && (await fam('DELETE', 'policies/' + keys[2] + '/attachment')).status === 403 && (await fam('GET', 'policies/' + keys[2] + '/versions')).status === 403, '14. a customer cannot edit, delete or see versions');
  const before = (await office('GET', 'policies/' + keys[2])).body.policy;
  r = await office('PUT', 'policies/' + keys[2], { content: '# Code of Conduct\n\nTest text published by the lifecycle check.' });
  const after = (await office('GET', 'policies/' + keys[2])).body.policy;
  ok(r.status === 200 && after.updatedAt && after.updatedAt !== before.updatedAt && after.version === (before.version || 0) + 1, '14. the office edits a policy; Last Updated and the version move on');
  ok((await office('GET', 'policies/' + keys[2] + '/versions')).status === 200 && (await fam('GET', 'policies/' + keys[2])).body.policy.content.includes('Test text'), '14. version history kept; the customer reads the new text');
  ok((await nurse('GET', 'policies')).status === 403, '14. nurses have no policy section');

  // ---------------------------------------------------------------- 15. nurse navigation
  const nurseJs = fs.readFileSync(path.join(__dirname, '..', 'app', 'nurse.js'), 'utf8');
  const menuSrc = nurseJs.slice(nurseJs.indexOf('var MENU = ['), nurseJs.indexOf('];', nurseJs.indexOf('var MENU = [')) + 2);
  const MENU = Function('return ' + menuSrc.replace(/^var MENU = /, '').replace(/;$/, ''))();
  const grp = (label) => MENU.find((m) => !Array.isArray(m) && m.label === label);
  ok(grp('Upload Documents') && grp('Upload Documents').sub.map((x) => x[1]).join('|') === 'Upload|Your Submissions', '15. Upload Documents is a dropdown with exactly Upload and Your Submissions');
  ok(grp('Assessment') && grp('Assessment').sub.map((x) => x[1]).join('|') === 'Regular Checkup', '15. Assessment contains only Regular Checkup');
  ok(MENU.some((m) => Array.isArray(m) && m[1] === 'Customer Onboarding') && !grp('Assessment').sub.some((x) => /onboard/i.test(x[1])), '15. Customer Onboarding is its own main section, not under Assessment');
  ok(!MENU.some((m) => Array.isArray(m) && /Customer Profiles/.test(m[1])) && MENU.some((m) => Array.isArray(m) && m[1] === 'Assigned customers'), '15. no separate Customer Profiles section: customer details live under Assigned customers');
  ok(/caregiver'\) \{ S\.cache\.ncust = null;[^\n]*go\('#\/nurse\/customer\?p=/.test(appJs), '15. after onboarding the nurse is taken to the customer under Assigned customers');
  ok(/page === 'submissions'\) submissionsPage/.test(nurseJs) && /page === 'upload'\) uploadPage/.test(nurseJs), '15. Upload and Your Submissions open separate pages');
  ok((await nurse('GET', 'nurse/submissions')).status === 200, '15. Your Submissions data still served');

  console.log('\ncheck-lifecycle: PASS ' + pass + ' FAIL ' + fail);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('ERROR', e); process.exit(1); });
