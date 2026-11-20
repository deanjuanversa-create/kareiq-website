// node tools/check-assess.js [http://localhost:3000]
// Nurse Dashboard > Assessment: Regular Checkup and Onboarding Customer.
// 1. Against the workbooks (tools/fixtures/assessment-workbooks.json, extracted from the two .xlsx
//    files): every drop-down list and every row label is in the forms, options in the same order.
// 2. Against a fresh demo server (APP_DEMO=true, empty data folder) when a URL is given: saving and
//    reading back every option, validation, roles, and onboarding once only (also when sent twice at once).
const path = require('path');
const fx = require('./fixtures/assessment-workbooks.json');
const checkup = require('../src/app/checkup');
const onboarding = require('../src/app/onboarding');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// ---------------------------------------------------------------- 1. the workbooks
// list items are comma separated; these two items contain a comma themselves (kept as one option)
const JOINED = ['Pale, White or Clay Colour', 'Fluffy, Mushy or Regged Edges'];
function items(raw) {
  let s = raw;
  const keep = {};
  JOINED.forEach((j, i) => { if (s.includes(j)) { s = s.replace(j, '§' + i); keep['§' + i] = j; } });
  return s.split(',').map((x) => (keep[x.trim()] || x).trim());
}
const ckLists = [...checkup.FIELDS.filter((f) => f.options).map((f) => f.options), ...checkup.TABLE.rows.filter((r) => r.options).map((r) => r.options)];
const obLists = onboarding.FIELDS.filter((f) => f.options).map((f) => f.options);
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);
for (const l of fx.regular.lists) ok(ckLists.some((o) => same(o, items(l.raw))), 'Regular Checkup has the list ' + l.sheet + '!' + l.cells + ': ' + items(l.raw).join(' | '));
for (const l of fx.first.lists) ok(obLists.some((o) => same(o, items(l.raw))), 'Onboarding has the list ' + l.sheet + '!' + l.cells + ': ' + items(l.raw).join(' | '));
ok(fx.regular.lists.length === 33 && fx.first.lists.length === 26, 'all 59 workbook drop-down lists checked');
const optionCount = (lists) => lists.reduce((n, l) => n + items(l.raw).length, 0);
console.log('workbook options checked: Regular Checkup ' + optionCount(fx.regular.lists) + ', Onboarding ' + optionCount(fx.first.lists));

// every label in the workbooks appears in the forms (section titles, group titles, field labels, table rows)
const ckWords = [...checkup.SECTIONS.map((s) => s.title), ...checkup.FIELDS.map((f) => f.label), ...checkup.FIELDS.map((f) => f.group || ''), ...checkup.TABLE.rows.map((r) => r.label), checkup.TABLE.title, ...checkup.FIELDS.filter((f) => f.parts).flatMap((f) => f.parts.map((x) => x[1])), ...checkup.TABLE.columns,
  ...checkup.SECTIONS.filter((s) => s.info).flatMap((s) => [s.text, s.note, ...s.items.flatMap((it) => [it[0], ...it[1]])])].join(' || ');
const obWords = [...onboarding.SECTIONS.flatMap((s) => [s.title, ...s.groups.flatMap((g) => [g.title || '', ...g.fields.map((f) => f.label)])])].join(' || ');
const SKIP_REG = new Set(['General Data!A1', 'Diet!C18', 'General Data!B19']); // header "Parameter"; sample values (Milk, No)
for (const [cell, text] of Object.entries(fx.regular.cells)) {
  if (SKIP_REG.has(cell)) continue;
  const t = text.trim();
  ok(ckWords.includes(t) || t.split(/,\s*/).every((w) => ckWords.includes(w.trim())), 'Regular Checkup shows "' + t + '" (' + cell + ')');
}
for (const [cell, text] of Object.entries(fx.first.cells)) {
  const t = text.trim();
  ok(obWords.includes(t), 'Onboarding shows "' + t + '" (' + cell + ')');
}
ok(checkup.SECTIONS.map((s) => s.sheet).join() === fx.regular.sheets.join(), 'Regular Checkup sections in the workbook order');
ok(onboarding.SECTIONS.map((s) => s.sheet).join() === fx.first.sheets.join(), 'Onboarding sections in the workbook order');

// validation without a server
let errs = {};
let d = checkup.parse({ backPain: 'Maybe', standardWeight: '900', inTime: '10:00', outTime: '09:00', alcohol: 'No', alcoholWeekly: '2', food: { cereals: { choice: 'Oats' } } }, errs);
ok(errs['ck.backPain'] && errs['ck.standardWeight'] && errs['ck.outTime'] && errs['ck.food.cereals.choice'], 'checkup: unknown option, out-of-range number, Out before In, unknown food choice refused');
ok(!('alcoholWeekly' in d), 'checkup: Weekly Consumption ignored when Alchohol Consumption is "No"');
errs = {};
d = checkup.parse({ stoolType: 'Fluffy, Mushy or Regged Edges', stoolColor: 'Pale, White or Clay Colour', smoking: 'Yes', smokingWeekly: 'More than 3 packs', food: { lentils: { choice: 'Moong dal', quantity: '1 bowl' } } }, errs);
ok(!Object.keys(errs).length && d.stoolType === 'Fluffy, Mushy or Regged Edges' && d.smokingWeekly === 'More than 3 packs' && d.food.lentils.choice === 'Moong dal', 'checkup: options with commas, follow-ups and free-text rows accepted');
let v = onboarding.validate({ kycIdType: 'PAN', gpsCoordinates: 'north', gpsLink: 'http://x', kycIdNumber: '!' });
ok(v.errors && v.errors.kycIdType && v.errors.gpsCoordinates && v.errors.gpsLink && v.errors.kycIdNumber, 'onboarding: unknown ID type, bad coordinates, non-https link, bad ID number refused');
v = onboarding.validate({ smoking: 'At least once a week' });
ok(v.data && v.data.smoking === 'Atleast once a week', 'onboarding: the earlier spelling is read as the workbook option');

// ---------------------------------------------------------------- 2. the server
const URL0 = process.argv[2];
async function server() {
  const BASE = URL0.replace(/\/$/, '') + '/api/app/';
  async function login(id) {
    let cookie = '', csrf = '';
    const call = async (method, p, body) => {
      const h = { 'X-Requested-With': 'kareiq', cookie };
      if (csrf) h['X-CSRF'] = csrf;
      if (body) h['Content-Type'] = 'application/json';
      const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; }
      return { status: r.status, body: j };
    };
    await call('POST', 'login', { id, password: 'demo-pass-123' });
    csrf = (await call('GET', 'session')).body.csrf;
    return call;
  }
  const nurse = await login('nurse@demo.kareiq'), nest = await login('nest@demo.kareiq'), office = await login('admin@demo.kareiq'), fam = await login('family@demo.kareiq');
  const mine = (await nurse('GET', 'nurse/customers')).body.rows.map((c) => c.id);
  ok(mine.length >= 2, 'nurse has at least two assigned customers: ' + mine.join(', '));
  const [A, B] = mine;

  // ---- Regular Checkup
  const f = (await nurse('GET', 'forms/regular-checkup')).body;
  ok(f.ok && f.sections.length === 8 && f.source === 'Copy of Data Collection - Caregiver Regular Visits.xlsx', 'Regular Checkup form from the workbook');
  ok((await fam('GET', 'forms/regular-checkup')).status === 403, 'families cannot open the checkup form');
  const selects = checkup.FIELDS.filter((x) => x.type === 'select');
  const rounds = Math.max(...selects.map((x) => x.options.length), ...checkup.TABLE.rows.filter((r) => r.options).map((r) => r.options.length));
  const sent = [];
  for (let i = 0; i < rounds; i++) {
    const ck = { inTime: '08:' + String(10 + i).padStart(2, '0'), outTime: '08:' + String(40 + i).padStart(2, '0'), eyeSight: 'Uses reading glasses', obesityLevel: 'Standard', bodyType: 'Standard', standardWeight: '58', quantityPerMeal: '1 plate', bedTime: '22:00', phoneTime: '30 minutes', food: {} };
    for (const x of selects) ck[x.k] = x.options[i % x.options.length];
    for (const r of checkup.TABLE.rows) ck.food[r.k] = { choice: r.options ? r.options[i % r.options.length] : 'Moong dal', quantity: (i + 1) + ' serving' };
    const r = await nurse('POST', 'people/' + A + '/visits', { date: new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(Date.now() - 86400000)), checkup: ck, weight: '60', height: '158', bodyfat: '30', temp: '36.8', spo2: '97', hr: '76', pi: '3.1', systolic: '126', diastolic: '80' });
    ok(r.status === 201, 'checkup ' + (i + 1) + ' of ' + rounds + ' saved: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
    sent.push(ck);
  }
  // read back through the Wellbeing checks data (office): every answer as sent
  const dash = (await office('GET', 'people/' + A + '/dashboard?period=1m')).body;
  const cks = dash.obsHistory.filter((o) => o.form === 'regular_checkup');
  ok(cks.length === rounds, 'every checkup kept separately in the history: ' + cks.length);
  const flat = (o) => Object.fromEntries(o.groups.flatMap((g) => g.items.map((it) => [it.k, it.text])));
  let allBack = true;
  sent.slice().reverse().forEach((ck, j) => {
    const got = flat(cks[j]);
    for (const x of selects) { const want = x.showIf && ck[x.showIf[0]] !== x.showIf[1] ? undefined : ck[x.k]; if (got[x.k] !== want) { allBack = false; console.log('  mismatch', x.k, got[x.k], want); } }
    for (const r of checkup.TABLE.rows) if (got['food.' + r.k] !== ck.food[r.k].choice + ' · Quantity/Day: ' + ck.food[r.k].quantity) { allBack = false; console.log('  mismatch food', r.k, got['food.' + r.k]); }
  });
  ok(allBack, 'every drop-down option of the Regular Checkup saved and read back exactly');
  ok(cks[0].inTime && cks[0].outTime, 'In time and Out time kept');
  const bodyM = dash.series.map((m) => m.metric);
  ok(['weight', 'bodyfat', 'bmi', 'bp', 'spo2'].every((k) => bodyM.includes(k)), 'checkup readings appear in the Vitals and Body composition charts');
  const list = (await nurse('GET', 'people/' + A + '/checkups')).body;
  ok(list.rows.length === rounds && list.rows.every((x) => x.mine && !('checkup' in x) && x.inTime), 'nurse sees past checkups by date and time only, not the answers');
  let r = await nurse('POST', 'people/' + A + '/visits', { checkup: { backPain: 'Sometimes', outTime: '07:00', inTime: '08:00' } });
  ok(r.status === 400 && r.body.errors['ck.backPain'] && r.body.errors['ck.outTime'], 'checkup validation errors come back per field');
  ok([403, 404].includes((await nest('POST', 'people/' + A + '/visits', { checkup: { backPain: 'Yes' } })).status), 'a nurse not assigned cannot record a checkup');
  ok([403, 404].includes((await fam('POST', 'people/' + A + '/visits', { checkup: { backPain: 'Yes' } })).status), 'families cannot record a checkup');

  // ---- Onboarding Customer
  const of = (await nurse('GET', 'forms/onboarding')).body;
  ok(of.ok && of.sections.length === 6 && of.source === 'Copy of Data Collection - Caregiver First Visit.xlsx', 'Onboarding form from the workbook');
  r = await nurse('GET', 'people/' + A + '/onboarding');
  ok(r.body.status === 'pending' && r.body.eligible && r.body.canSubmit, 'eligible (approved and paid), pending; the assigned nurse can submit');
  const lockedA = r.body.general || {};
  ok((await nurse('POST', 'people/' + A + '/onboarding', { data: { name: 'x' } })).status === 400, 'confirmation required');
  ok((await nurse('POST', 'people/' + A + '/onboarding', { confirm: true, data: {} })).status === 400, 'an empty onboarding is refused');
  ok((await nurse('POST', 'people/' + A + '/onboarding', { confirm: true, data: { gender: 'Other' } })).status === 400, 'an option outside the workbook is refused');
  ok((await office('POST', 'people/' + A + '/onboarding', { confirm: true, data: { name: 'x' } })).status === 403, 'the office views onboarding but does not submit it');
  ok([403, 404].includes((await nest('POST', 'people/' + A + '/onboarding', { confirm: true, data: { name: 'x' } })).status), 'a nurse not assigned cannot submit');
  ok([403, 404].includes((await fam('GET', 'people/' + A + '/onboarding')).status), 'families cannot open onboarding');
  const famPid = ((await fam('GET', 'people')).body.rows || (await fam('GET', 'people')).body.people || [])[0];
  if (famPid) ok((await fam('GET', 'people/' + (famPid.id || famPid) + '/onboarding')).status === 403, 'families cannot open onboarding, even for their own relative');
  // one of each option across the form
  const data = { name: 'Onboarding Test', dob: '1950-05-04', kycIdNumber: 'ABCD 1234 5678', gpsCoordinates: '9.9312, 76.2673', gpsLink: 'https://maps.google.com/?q=9.9312,76.2673', ec1Phone: '9876543210', ec1Email: 'family@example.com', fdPhone: '04842345678', languages: 'Malayalam, English' };
  for (const x of onboarding.FIELDS) {
    if (x.type === 'select' && !(x.k in data)) data[x.k] = x.options[x.options.length - 1];
    if (x.type === 'multi') data[x.k] = x.options.slice();
    if (x.specify) data[x.specify] = 'Details';
  }
  data.smoking = 'Atleast once a week'; data.drinking = 'Daily';
  r = await nurse('POST', 'people/' + A + '/onboarding', { confirm: true, data });
  ok(r.status === 201, 'onboarding submitted with every multi-choice option: ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 160));
  r = await nurse('POST', 'people/' + A + '/onboarding', { confirm: true, data: { name: 'Again' } });
  ok(r.status === 409, 'a second onboarding for the same customer is refused (409)');
  ok((await nurse('PUT', 'people/' + A + '/onboarding', { data: { name: 'Edited' } })).status === 405 && (await office('DELETE', 'people/' + A + '/onboarding')).status === 405 && (await nurse('PATCH', 'people/' + A + '/onboarding', { data: {} })).status === 405, 'a completed onboarding cannot be edited or deleted (405), by a nurse or the office');
  r = await nurse('GET', 'people/' + A + '/onboarding');
  const rec = r.body.record;
  ok(r.body.status === 'completed' && !r.body.canSubmit && rec.completedAt && rec.completedBy && rec.data.name === (lockedA.name || 'Onboarding Test'), 'read only afterwards, with completion date and nurse (general information from the Operations Team kept)');
  ok(rec.data.ec1Phone !== '9876543210' && /X/.test(rec.data.ec1Phone) && /^XXXX /.test(rec.data.kycIdNumber), 'nurse view masks phone numbers and the ID number');
  ok(onboarding.FIELDS.filter((x) => x.type === 'multi').every((x) => JSON.stringify(rec.data[x.k]) === JSON.stringify(x.options)), 'every multi-choice option saved and read back');
  const ro = (await office('GET', 'people/' + A + '/onboarding')).body.record;
  ok(ro.data.ec1Phone === '9876543210' && ro.data.kycIdNumber === 'ABCD 1234 5678' && ro.data.smoking === 'Atleast once a week', 'office view shows the record as submitted');
  // simultaneous submissions for another customer: exactly one wins
  const many = await Promise.all([1, 2, 3, 4, 5].map((i) => nurse('POST', 'people/' + B + '/onboarding', { confirm: true, data: { name: 'Parallel ' + i } })));
  ok(many.filter((x) => x.status === 201).length === 1 && many.filter((x) => x.status === 409).length === 4, 'five simultaneous submissions: one saved, four refused (' + many.map((x) => x.status).join(',') + ')');
  const kept = (await office('GET', 'people/' + B + '/onboarding')).body.record;
  ok(/^Parallel [1-5]$/.test(kept.data.name), 'the one saved record is intact: ' + kept.data.name);
  // Regular Checkup carries on after onboarding
  ok((await nurse('POST', 'people/' + A + '/visits', { checkup: { headache: 'Mild' } })).status === 201, 'Regular Checkup still recorded after onboarding');
  ok((await nurse('GET', 'people/' + A + '/onboarding')).body.record.completedAt === rec.completedAt, 'the onboarding record is unchanged by later checkups');
  // the customer's details: filled where they were empty, never overwritten
  const det = (await office('GET', 'people/' + A + '/details')).body;
  ok(det.data && det.data.ec1Phone && det.history.some((h) => h.byRole === 'caregiver'), 'customer details filled from the onboarding (with a version entry)');
}

(async () => {
  if (URL0) await server();
  else console.log('(no server URL given: workbook and validation checks only)');
  console.log(`check-assess: PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERROR', e); process.exit(1); });
