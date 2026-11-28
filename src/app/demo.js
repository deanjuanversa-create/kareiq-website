// Demo accounts for trying the app (only in demo mode: APP_ENV=demo, or APP_DEMO=true while developing).
// Never runs when a real admin already exists.

const crypto = require('crypto');
const docs = require('../docs');
const auth = require('./auth');
const runtime = require('../runtime');

// demo logins have a published password: refuse to create them anywhere but an explicit demo
function refuseOutsideDemo() {
  if (!runtime.demoAllowed()) throw new Error('Demo accounts can only be created in demo mode (APP_ENV=demo, or APP_DEMO=true while developing).');
}

const PASSWORD = 'demo-pass-123';
const USERS = [
  ['admin', 'Office Admin (demo)', 'admin@demo.kareiq', null],
  ['family', 'Priya Nair (demo)', 'family@demo.kareiq', '+919800000001'],
  ['family', 'Rahul Menon (demo)', 'rahul@demo.kareiq', '+919800000002'],
  ['family', 'Arjun Iyer (demo)', 'arjun@demo.kareiq', '+919800000003'],   // bought Kare@Home only
  ['family', 'Meena Das (demo)', 'meena@demo.kareiq', '+919800000004'],    // bought KareNest (Kare@Home is included)
  ['caregiver', 'Nurse Anjali (demo)', 'nurse@demo.kareiq', '+919800000011'],
  ['caregiver', 'Joseph, KareNest care team (demo)', 'nest@demo.kareiq', '+919800000012'],
  // the four team dashboards
  ['finance', 'Farah, Finance Manager (demo)', 'finance@demo.kareiq', null],
  ['hr', 'Hari, HR (demo)', 'hr@demo.kareiq', null],
  ['operations', 'Omana, Operations Manager (demo)', 'ops@demo.kareiq', null],
  ['sales', 'Sanjay, Sales Executive (demo)', 'sales@demo.kareiq', null]
];

function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

async function seed() {
  refuseOutsideDemo();
  const now = new Date();
  const iso = () => new Date().toISOString();
  const hash = auth.hashPassword(PASSWORD);
  const ids = {};
  for (const [role, name, email, phone] of USERS) {
    // fixed ids, so every copy of a demo server has the same accounts (see APP_STATELESS)
    const id = 'demo-u-' + email.split('@')[0];
    ids[email.split('@')[0]] = id;
    await docs.insert('app_users', { id, name, email, phone, role, passwordHash: hash, active: true, createdAt: iso() });
  }
  const people = [
    { id: 'P-DEMO01', name: 'Lakshmi Nair', birthYear: 1951, sex: 'female', diabetic: true, smoker: false, parentalMI: false },
    { id: 'P-DEMO02', name: 'Gopal Nair', birthYear: 1947, sex: 'male', diabetic: false, smoker: false, parentalMI: true },
    { id: 'P-DEMO03', name: 'Saraswathi Menon', birthYear: 1955, sex: 'female' },
    { id: 'P-DEMO04', name: 'Kamala Iyer', birthYear: 1949, sex: 'female', diabetic: false, smoker: false, parentalMI: false },
    { id: 'P-DEMO05', name: 'Mohan Das', birthYear: 1944, sex: 'male', diabetic: false, smoker: false, parentalMI: false }
  ];
  // registered about two months ago (the demo history starts then); Saraswathi has only just joined
  const regAgo = { 'P-DEMO01': 62, 'P-DEMO02': 62, 'P-DEMO03': 3, 'P-DEMO04': 62, 'P-DEMO05': 62 };
  for (const x of people) await docs.insert('app_people', { ...x, active: true, registeredAt: new Date(now.getTime() - regAgo[x.id] * 86400000).toISOString(), createdAt: iso() });

  const link = (user, personId, kind, relation) => docs.insert('app_links', { id: `demo-l-${user}-${personId}`, userId: ids[user], personId, kind, relation: relation || null, createdAt: iso() });
  await link('family', 'P-DEMO01', 'family', 'Mother');
  await link('family', 'P-DEMO02', 'family', 'Father');
  await link('rahul', 'P-DEMO03', 'family', 'Mother');
  await link('arjun', 'P-DEMO04', 'family', 'Mother');
  await link('meena', 'P-DEMO05', 'family', 'Father');
  await link('nurse', 'P-DEMO04', 'caregiver');
  await link('nest', 'P-DEMO05', 'caregiver');
  await link('nurse', 'P-DEMO01', 'caregiver');
  // Saraswathi has only asked for a package: no nurse is assigned until it is approved and paid
  await link('nest', 'P-DEMO02', 'caregiver');

  const day = (n) => new Date(now.getTime() - n * 86400000).toISOString().slice(0, 10);
  const plan = (personId, product, planId, status, start, months) => docs.insert('app_plans', {
    id: `demo-p-${personId}-${product}`, personId, product, planId, status, startDate: status === 'pending' ? null : start,
    endDate: null, months, bookingRef: null, createdAt: iso()
  });
  await plan('P-DEMO01', 'karehome', 'homeplus', 'active', day(75), 12);
  await plan('P-DEMO02', 'karenest', 'kareplus', 'active', day(120), 12);
  await plan('P-DEMO03', 'karehome', 'homestart', 'pending', null, 3);
  await plan('P-DEMO04', 'karehome', 'homeelite', 'active', day(40), 6);
  await plan('P-DEMO05', 'karenest', 'kareplus', 'active', day(60), 12);
  for (const p of await docs.find('app_plans')) {
    if (p.startDate) {
      const d = new Date(p.startDate + 'T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + p.months); d.setUTCDate(d.getUTCDate() - 1);
      await docs.update('app_plans', p.id, { endDate: d.toISOString().slice(0, 10) });
    }
  }

  // ~2 months of visits
  const write = async (personId, product, by, seedN, base) => {
    const r = rand(seedN);
    for (let n = 58; n >= 0; n -= (product === 'karenest' ? 1 : 2)) {
      if (r() < 0.12) continue; // a missed day, so the chart shows real gaps
      const at = new Date(now.getTime() - n * 86400000);
      at.setUTCHours(3 + Math.floor(r() * 5), Math.floor(r() * 60), 0, 0);
      if (at > now) continue;
      const visitId = `demo-v-${personId}-${n}`;
      const rows = [
        { metric: 'bp', systolic: Math.round(base.sys + (r() - 0.5) * 14), diastolic: Math.round(base.dia + (r() - 0.5) * 8) },
        { metric: 'hr', value: Math.round(base.hr + (r() - 0.5) * 10) },
        { metric: 'spo2', value: Math.round(96 + r() * 3) },
        { metric: 'pi', value: Math.round((1.4 + r() * 2.5) * 10) / 10 }
      ];
      if (n % 4 === 0) rows.push({ metric: 'glucose', value: Math.round(base.glu + (r() - 0.5) * 20), context: 'fasting' });
      if (n % 14 === 0) { const w = Math.round((base.w + (r() - 0.5)) * 10) / 10; rows.push({ metric: 'weight', value: w }, { metric: 'bmi', value: Math.round(w / ((base.h / 100) ** 2) * 10) / 10, calc: true }); }
      if (n === 56) rows.push({ metric: 'height', value: base.h }, { metric: 'chol', value: base.chol });
      if (n % 6 === 0) rows.push({ metric: 'temp', value: Math.round((36.4 + r() * 0.6) * 10) / 10 });
      if (n % 7 === 0) rows.push(...[['bodyfat', 30 + r() * 4], ['moisture', 51 + r() * 3], ['visceral', 8 + r() * 2], ['bone', 3 + r()], ['bmr', 1250 + r() * 120], ['protein', 15 + r() * 3], ['subfat', 26 + r() * 4], ['lean', 64 + r() * 4]].map(([metric, v]) => ({ metric, value: Math.round(v * 10) / 10 })));
      for (const row of rows) {
        const { calc, ...data } = row;
        await docs.insert('app_readings', { id: `${visitId}-${data.metric}`, personId, product, ...data, measuredAt: at.toISOString(), measuredMs: at.getTime(), source: calc ? 'calculated' : 'caregiver_visit', enteredBy: by, enteredAt: at.toISOString(), visitId, voided: false });
      }
      const notes = product === 'karenest'
        ? ['Joined the morning yoga circle and enjoyed it.', 'Ate well at lunch; walked in the garden for 20 minutes.', 'Played carrom with friends in the evening.', null, null, 'Slept well. Asked about the music evening on Friday.']
        : ['Took all morning medicines on time.', 'Did the KareBalance exercises for 15 minutes.', 'Walked to the gate and back with support.', null, null, 'Good appetite today. Reminded about the eye check-up.'];
      const pick = (list) => list[Math.floor(r() * list.length)];
      const obs = {
        meals: pick(['2', '3', '3', '3']), foods: ['rice', 'lentils', 'vegetables', ...(r() < 0.5 ? ['fruits'] : []), ...(r() < 0.3 ? ['fish'] : [])], cooking: ['steamed'],
        spice: pick(['low', 'medium']), salt: pick(['low', 'average', 'average']), waterL: Math.round((1.2 + r()) * 10) / 10, waterFreq: pick(['often', 'meals']),
        lastMealHours: pick([2, 2, 3]), stoolTimes: 1, constipation: pick(['no', 'no', 'no', 'mild']), stoolBlood: 'no', urineBlood: 'no', urinePain: 'no',
        sleepHours: pick([6, 6.5, 7, 7.5]), sleepQuality: pick(['good', 'good', 'fair']), lifestyle: pick(['moderate', 'sedentary']), cognitive: 'clear',
        medicines: pick(['taken', 'taken', 'taken', 'missed']), ...(r() < 0.25 ? { pains: ['knee'] } : {})
      };
      await docs.insert('app_visits', { id: visitId, personId, product, by, at: at.toISOString(), note: notes[Math.floor(r() * notes.length)], metrics: [...new Set(rows.map((x) => x.metric))], obs, createdAt: at.toISOString() });
    }
  };
  await write('P-DEMO01', 'karehome', ids.nurse, 11, { sys: 136, dia: 84, hr: 76, glu: 112, w: 61, h: 156, chol: 212 });
  await write('P-DEMO02', 'karenest', ids.nest, 29, { sys: 128, dia: 80, hr: 72, glu: 104, w: 70, h: 168, chol: 190 });
  await write('P-DEMO04', 'karehome', ids.nurse, 47, { sys: 142, dia: 88, hr: 80, glu: 126, w: 58, h: 152, chol: 224 });
  await write('P-DEMO05', 'karenest', ids.nest, 53, { sys: 124, dia: 78, hr: 70, glu: 98, w: 66, h: 170, chol: 180 });

  // risk scores from the KareIQ risk sheet
  const risk = require('./risk');
  const day0 = (n) => new Date(now.getTime() - n * 86400000).toISOString();
  const addRisk = async (personId, test, inputs, ago, by) => {
    const out = risk.evaluate(test, inputs);
    const key = `demo-r-${personId}-${test}` + (ago > 40 && earlier.has(personId + test) ? '-1' : '');
    if (out.result) await docs.insert('app_risks', { id: key, personId, test, inputs: out.inputs, ...out.result, at: day0(ago), enteredBy: by, createdAt: day0(ago) });
  };
  // earlier checks, so the risk trend compares real assessments: improving, worsening and stable
  const earlier = new Set(['P-DEMO01phq9', 'P-DEMO01tug', 'P-DEMO02chair30', 'P-DEMO02mmse', 'P-DEMO04tug']);
  await addRisk('P-DEMO01', 'phq9', { score: 11 }, 55, ids.nurse);          // moderate -> mild: improving
  await addRisk('P-DEMO01', 'tug', { seconds: 16.8 }, 48, ids.nurse);       // same band, a little faster: stable
  await addRisk('P-DEMO02', 'chair30', { sex: 'male', age: 79, count: 9 }, 50, ids.nest); // below average -> average: improving
  await addRisk('P-DEMO02', 'mmse', { score: 26 }, 58, ids.nest);           // unchanged: stable
  await addRisk('P-DEMO04', 'tug', { seconds: 17 }, 45, ids.nurse);         // good -> fall risk: worsening
  await addRisk('P-DEMO01', 'cvd', { sex: 'female', age: 75, sbp: 136, tc: 212, hdl: 48, crp: 2.4, smoker: 'no', parentMI: 'no', diabetic: 'yes', hba1c: 7.1 }, 20, ids.admin);
  await addRisk('P-DEMO01', 'idrs', { score: 60 }, 40, ids.nurse);
  await addRisk('P-DEMO01', 'tug', { seconds: 14.5 }, 12, ids.nurse);
  await addRisk('P-DEMO01', 'phq9', { score: 6 }, 30, ids.nurse);
  await addRisk('P-DEMO01', 'psqi', { score: 7 }, 30, ids.nurse);
  await addRisk('P-DEMO01', 'kidney', { sex: 'female', age: 75, egfr: 52, acr: 45, acrUnit: 'mg/g' }, 20, ids.admin);
  await addRisk('P-DEMO02', 'cvd', { sex: 'male', age: 79, sbp: 128, tc: 190, hdl: 44, crp: 1.8, smoker: 'no', parentMI: 'yes', diabetic: 'no' }, 25, ids.admin);
  await addRisk('P-DEMO02', 'chair30', { sex: 'male', age: 79, count: 12 }, 10, ids.nest);
  await addRisk('P-DEMO02', 'mmse', { score: 26 }, 30, ids.nest);
  await addRisk('P-DEMO04', 'tug', { seconds: 21 }, 8, ids.nurse);
  await addRisk('P-DEMO04', 'balance4', { stage: 3 }, 8, ids.nurse);
  await addRisk('P-DEMO04', 'gad7', { score: 4 }, 30, ids.nurse);
  await addRisk('P-DEMO04', 'snehita', { age: 77, menarche: 13, irregular: 'no', bf24: 'yes', fdr: 'no', biopsy: 'no', birth: 'under25' }, 60, ids.admin);
  await addRisk('P-DEMO05', 'fib4', { age: 82, ast: 32, alt: 28, plt: 210 }, 35, ids.admin);
  await addRisk('P-DEMO05', 'reach', { cm: 27 }, 15, ids.nest);

  // assessments the nurse recorded for Lakshmi (the engine calculates her risk purposes from these):
  // the four fall tests, the questionnaires and a liver panel
  const addInputs = async (personId, values, ago, by) => {
    const at = day0(ago);
    for (const [metric, value] of Object.entries(values)) {
      await docs.insert('app_readings', { id: `demo-a-${personId}-${metric}-${ago}`, personId, metric, value, kind: 'assessment', measuredAt: at, measuredMs: Date.parse(at),
        source: 'caregiver_assessment', enteredBy: by, enteredAt: at, assessmentId: `demo-a-${personId}-${ago}`, voided: false });
    }
  };
  await addInputs('P-DEMO01', { tug: 14.5, balanceSeconds: 24, reach: 25, chair30: 11 }, 12, ids.nurse);
  await addInputs('P-DEMO01', { psqi: 7, phq9: 6, gad7: 4, idrs: 60, mmse: 27 }, 30, ids.nurse);
  await addInputs('P-DEMO01', { ast: 32, alt: 28, plt: 210, alb: 4 }, 20, ids.admin);

  // a few sample medical records (small PDFs)
  const pdf = (title) => Buffer.from(`%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n4 0 obj<</Length ${44 + title.length}>>stream\nBT /F1 18 Tf 60 760 Td (${title} - sample) Tj ET\nendstream endobj\n5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n`, 'latin1');
  const addRecord = async (personId, key, name, category, ago, by) => {
    const buf = pdf(name);
    await docs.insert('app_files', { id: `demo-f-${personId}-${key}`, personId, data: buf.toString('base64'), createdAt: day0(ago) });
    await docs.insert('app_records', { id: `demo-d-${personId}-${key}`, personId, name, category, date: day0(ago).slice(0, 10), mime: 'application/pdf', ext: 'pdf', size: buf.length, fileId: `demo-f-${personId}-${key}`, uploadedBy: by, uploadedAt: day0(ago) });
  };
  for (const [pid, by] of [['P-DEMO01', ids.nurse], ['P-DEMO04', ids.nurse], ['P-DEMO02', ids.nest]]) {
    await addRecord(pid, 'ecg', 'Cardiac stress test', 'cardiac', 44, by);
    await addRecord(pid, 'bp', 'Blood pressure monitoring', 'cardiac', 38, by);
    await addRecord(pid, 'chol', 'Cholesterol panel', 'general', 33, by);
    await addRecord(pid, 'exam', 'Physical examination', 'general', 28, by);
    await addRecord(pid, 'sugar', 'Diabetes screening', 'sugar', 23, by);
    await addRecord(pid, 'lipid', 'Lipid profile', 'general', 18, by);
    await addRecord(pid, 'xray', 'Chest X-ray', 'imaging', 12, by);
    await addRecord(pid, 'rx', 'Prescription from Dr. Varma', 'prescription', 6, by);
  }

  await seedOperations(ids, pdf, day0);

  await docs.insert('app_audit', { id: 'demo-seed', at: iso(), userId: null, action: 'demo.seed', personId: null, detail: null });
  console.log('[app] demo accounts created (password: demo-pass-123): admin@demo.kareiq, family@demo.kareiq (both), arjun@demo.kareiq (Kare@Home only), meena@demo.kareiq (KareNest, includes Kare@Home), rahul@demo.kareiq (being set up), nurse@demo.kareiq, nest@demo.kareiq');
}

// ---------------------------------------------------------------- the office and nurse side of the demo
// Employee records, contact details (demo numbers only), visits booked through the real scheduler,
// recorded payments, a few website enquiries and notifications. Demo accounts only.
async function seedOperations(ids, pdf, day0) {
  const crypto2 = require('crypto');
  const uid = () => crypto2.randomUUID();
  const iso = () => new Date().toISOString();
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const addD = (n) => { const d = new Date(today + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const store = require('../store');

  // employees: department, unit, joining date, KYC
  const kycDoc = async (emp, kind, status, ago) => {
    const buf = pdf('KYC ' + kind);
    const fileId = 'demo-kf-' + emp + '-' + kind;
    await docs.insert('app_files', { id: fileId, kind: 'kyc', employeeId: emp, mime: 'application/pdf', data: buf.toString('base64'), createdAt: day0(ago) });
    return { id: 'demo-k-' + emp + '-' + kind, kind, name: kind.replace(/-/g, ' ') + '.pdf', fileId, mime: 'application/pdf', uploadedAt: day0(ago), status, verifiedAt: status === 'verified' ? day0(ago - 1) : null };
  };
  const all = ['id-proof', 'address-proof', 'nursing-registration', 'qualification'];
  const staff = [
    { userId: ids.admin, employeeId: 'EMP-DEMO01', department: 'Office', businessUnit: 'kareiq', location: 'Kochi', joinDate: '2023-06-12', docs: [['id-proof', 'verified'], ['address-proof', 'verified']], availability: null, leave: [] },
    { userId: ids.nurse, employeeId: 'EMP-DEMO02', department: 'Nursing', businessUnit: 'karehome', location: 'Kochi', joinDate: '2024-02-05', docs: all.map((k) => [k, k === 'qualification' ? 'submitted' : 'verified']),
      availability: { days: { mon: ['morning', 'evening'], tue: ['morning', 'evening'], wed: ['morning', 'evening'], thu: ['morning', 'evening'], fri: ['morning', 'evening'], sat: ['morning', 'evening'], sun: [] }, bufferMin: 30, maxPerSlot: null, services: null, brands: ['karehome'] }, leave: [{ id: 'demo-leave-1', from: addD(12), to: addD(13), reason: 'Family function' }] },
    { userId: ids.nest, employeeId: 'EMP-DEMO03', department: 'Care', businessUnit: 'karenest', location: 'Thrissur', joinDate: '2025-01-20', docs: [['id-proof', 'verified'], ['address-proof', 'submitted']],
      availability: { days: { mon: ['morning', 'evening'], tue: ['morning', 'evening'], wed: ['morning', 'evening'], thu: ['morning', 'evening'], fri: ['morning', 'evening'], sat: ['morning', 'evening'], sun: ['morning', 'evening'] }, bufferMin: 15, maxPerSlot: null, services: null, brands: ['karenest'] }, leave: [] }
  ];
  for (const s of staff) {
    const docsList = [];
    for (const [k, st] of s.docs) docsList.push(await kycDoc(s.employeeId, k, st, 300));
    await docs.insert('app_staff', { id: 'demo-st-' + s.employeeId, userId: s.userId, employeeId: s.employeeId, department: s.department, businessUnit: s.businessUnit, location: s.location, joinDate: s.joinDate, status: 'active',
      emergencyContact: { name: 'Family contact (demo)', relation: 'Spouse', phone: '+919800000099' }, availability: s.availability, leave: s.leave, kyc: { docs: docsList }, createdAt: iso() });
  }

  // contact details for two demo customers (made-up numbers), so the masked numbers can be tried
  const det = (personId, data) => docs.insert('app_details', { id: 'det-' + personId, personId, data, version: 1, status: 'complete', updatedAt: iso(), updatedBy: ids.admin, updatedByRole: 'admin', createdAt: iso() });
  await det('P-DEMO04', { name: 'Kamala Iyer', gender: 'Female', bloodGroup: 'B+', languages: 'Tamil, English', address: '12 Temple Road, Kochi (demo address)', phone1: '+919800012345', phone2: '+919800054321', email: 'kamala.demo@example.com',
    ec1Name: 'Arjun Iyer', ec1Relation: 'Son', ec1Phone: '+919800000003', ec1Email: 'arjun.demo@example.com', fdName: 'Dr. Varma (demo)', fdAddress: 'Kochi', fdPhone: '+919800077777', sdName: 'Dr. Menon (demo)', sdHospital: 'City Hospital (demo)', sdPhone: '+919800088888', sdHospitalPhone: '+919800099999' });
  await det('P-DEMO05', { name: 'Mohan Das', gender: 'Male', bloodGroup: 'O+', languages: 'Malayalam', address: 'KareNest, Thrissur', phone1: '+919800023456', ec1Name: 'Meena Das', ec1Relation: 'Daughter', ec1Phone: '+919800000004', fdName: 'Dr. Thomas (demo)', fdPhone: '+919800066666' });

  // visits, assigned by the real scheduler (availability first, then fairness)
  const scheduler = require('./scheduler').create({ docs, uid, now: iso, store });
  // Kare@Home nurses do not work on Sundays: demo visits move to the next (or, in the past, previous) day
  const workday = (offset, product) => (product === 'karehome' && new Date(addD(offset) + 'T12:00:00Z').getUTCDay() === 0 ? offset + (offset < 0 ? -1 : 1) : offset);
  const book = async (personId, name, product, service, offset, slot, finish) => {
    const r = await scheduler.createVisit({ personId, customerName: name, product, service, date: addD(workday(offset, product)), slot, location: product === 'karenest' ? 'KareNest' : 'Home', by: ids.admin, byRole: 'admin', bookedNote: 'Booked by the office (demo)' });
    const v = r.visit;
    if (r.ok && finish) {
      const steps = finish === 'completed' ? ['accepted', 'in_progress', 'completed'] : finish === 'cancelled' ? ['cancelled'] : finish === 'in_progress' ? ['accepted', 'in_progress'] : [finish];
      const history = v.history.concat(steps.map((s) => ({ at: iso(), by: s === 'cancelled' ? ids.admin : v.nurseId, byRole: s === 'cancelled' ? 'admin' : 'caregiver', action: s })));
      await docs.update('app_schedule', v.id, { status: steps[steps.length - 1], history, ...(finish === 'cancelled' ? { slotKey: null } : {}) });
    }
    return v;
  };
  for (const n of [-9, -7, -5, -2]) await book('P-DEMO04', 'Kamala Iyer', 'karehome', n === -5 ? 'physiotherapy' : 'home-visit', n, 'morning', 'completed');
  await book('P-DEMO01', 'Lakshmi Nair', 'karehome', 'home-visit', -3, 'evening', 'completed');
  await book('P-DEMO04', 'Kamala Iyer', 'karehome', 'home-visit', 0, 'morning', 'accepted');
  await book('P-DEMO01', 'Lakshmi Nair', 'karehome', 'physiotherapy', 0, 'evening', null);
  await book('P-DEMO01', 'Lakshmi Nair', 'karehome', 'home-visit', 1, 'morning', null);
  await book('P-DEMO04', 'Kamala Iyer', 'karehome', 'blood-collection', 2, 'morning', null);
  await book('P-DEMO01', 'Lakshmi Nair', 'karehome', 'dressing', 4, 'evening', 'cancelled');
  for (const n of [-6, -4, -1]) await book('P-DEMO05', 'Mohan Das', 'karenest', 'home-visit', n, 'morning', 'completed');
  await book('P-DEMO05', 'Mohan Das', 'karenest', 'home-visit', 0, 'morning', 'in_progress');
  await book('P-DEMO02', 'Gopal Nair', 'karenest', 'physiotherapy', 1, 'evening', null);
  // the Kare@Home nurse is on leave then, so this one waits for the office
  await book('P-DEMO01', 'Lakshmi Nair', 'karehome', 'physiotherapy', 12, 'morning', null);

  // payments the office recorded after checking them (demo): paid, part paid, unpaid and overdue
  const care = require('./care');
  const pay = async (planId, share, method, ago) => {
    const pl = await docs.findOne('app_plans', { id: planId });
    const ch = await care.chargeOf(pl);
    if (!ch.amount) return;
    await docs.insert('app_payments', { id: 'demo-pay-' + planId, kind: 'payment', planId, personId: pl.personId, amount: Math.round(ch.amount * share), method, ref: 'DEMO-' + planId.slice(-6).toUpperCase(), receivedAt: day0(ago), recordedBy: ids.admin });
  };
  await pay('demo-p-P-DEMO01-karehome', 1, 'upi', 70);
  await pay('demo-p-P-DEMO02-karenest', 0.5, 'bank', 110);
  await pay('demo-p-P-DEMO04-karehome', 1, 'card', 38);
  // the office approved these packages (the lifecycle: request -> general information -> approval -> payment);
  // with the payment confirmed, Lakshmi and Kamala are ready for nurse onboarding. Gopal's payment is only
  // part paid and Mohan's is not recorded yet, so they are not; Saraswathi's request still waits in the
  // Enquiry database.
  for (const id of ['P-DEMO01', 'P-DEMO02', 'P-DEMO04', 'P-DEMO05']) {
    const pl = (await docs.find('app_plans', { personId: id })).find((x) => x.status === 'active');
    if (pl) await docs.update('app_plans', pl.id, { approval: { status: 'approved', by: ids.admin, byName: 'Office Admin (demo)', at: day0(80), via: 'demo' } });
  }
  const sara = (await docs.find('app_plans', { personId: 'P-DEMO03' }))[0];
  if (sara) {
    const r = await store.add('enquiries', 'KQ', { name: 'Rahul Menon (demo)', phone: '+919800000002', email: '', interest: 'app-plan-request', interestName: 'New plan from the app', message: 'Plan: Kare@Home HomeStart\nPayment plan: Quarterly (3 months)', source: 'app', product: 'karehome', package: 'homestart', billing: '3', userId: ids.rahul, accountUserId: ids.rahul, personId: 'P-DEMO03', personName: 'Saraswathi Menon', relation: 'Mother', appPlanId: sara.id, kind: 'plan-request', createdAt: day0(2) });
    await docs.update('app_plans', sara.id, { bookingRef: r.reference });
  }

  // website enquiries and bookings (demo names), so lead management has something to show
  const leads = [
    ['enquiries', 'KQ', { name: 'Sunil Kumar (demo)', phone: '+919800100001', email: 'sunil.demo@example.com', interest: 'karehome', interestName: 'Kare@Home', message: 'Looking for daily visits for my father.', source: 'kareiq', createdAt: day0(2) }],
    ['enquiries', 'KQ', { name: 'Anita Joseph (demo)', phone: '+919800100002', interest: 'karenest', interestName: 'KareNest', package: 'kareplus', message: 'Can we visit KareNest this weekend?', source: 'karenest', createdAt: day0(6), leadStatus: 'contacted', assignedTo: ids.admin, assignedAt: day0(5) }],
    ['bookings', 'KH', { name: 'Ravi Pillai (demo)', phone: '+919800100003', service: 'physiotherapy', serviceName: 'Physiotherapy', package: 'homeplus', date: addD(5), time: 'morning', page: 'kare-at-home', createdAt: day0(1) }],
    ['enquiries', 'KQ', { name: 'Sunil Kumar (demo)', phone: '+919800100001', interest: 'karehome', interestName: 'Kare@Home', message: 'Following up on my enquiry.', source: 'karehome', createdAt: day0(1) }],
    ['enquiries', 'KQ', { name: 'Fathima Rahman (demo)', phone: '+919800100004', interest: 'karenest', interestName: 'KareNest', source: 'karenest', createdAt: day0(40), leadStatus: 'converted' }],
    ['enquiries', 'KQ', { name: 'George Mathew (demo)', phone: '+919800100005', interest: 'karehome', interestName: 'Kare@Home', source: 'kareiq', createdAt: day0(75), leadStatus: 'lost' }]
  ];
  for (const [col, prefix, rec] of leads) await store.add(col, prefix, rec);

  // the team dashboards (demo records): one lead with a follow-up for Sales, a nurse licence that
  // expires soon for HR, one expense waiting for approval for Finance, one open service issue for Operations
  const sunil = (await store.readAll('enquiries')).find((r) => r.name === 'Sunil Kumar (demo)');
  if (sunil) await store.update('enquiries', sunil.id, { assignedTo: ids.sales, assignedAt: day0(1), leadStatus: 'contacted', followUpAt: addD(1), nextAction: 'Call back with Kare@Home HomePlus prices', package: 'homeplus',
    leadHistory: [{ at: day0(1), by: 'Sanjay, Sales Executive (demo)', byId: ids.sales, action: 'contact', channel: 'call', outcome: 'Interested', note: 'Wants daily visits for his father; asked for prices.' }] });
  const staffRow = await docs.findOne('app_staff', { userId: ids.nurse });
  const lic = { id: 'demo-cred-1', type: 'license', name: 'Kerala Nurses and Midwives Council registration', number: 'KNMC-DEMO-0001', issuer: 'KNMC', issuedOn: '2021-12-15', expiresOn: addD(20), addedBy: ids.hr, addedAt: iso() };
  if (staffRow) await docs.update('app_staff', staffRow.id, { designation: 'Staff Nurse', credentials: [lic] });
  else await docs.insert('app_staff', { id: 'demo-staff-nurse', userId: ids.nurse, employeeId: 'EMP-DEMO01', department: 'Nursing', designation: 'Staff Nurse', businessUnit: 'karehome', location: 'Kochi', joinDate: day0(400).slice(0, 10), status: 'active', leave: [], kyc: { docs: [] }, credentials: [lic], createdAt: iso() });
  await docs.insert('app_expenses', { id: 'demo-exp-1', reference: 'EX-DEMO01', date: day0(3).slice(0, 10), category: 'supplies', amount: 4850, vendor: 'Medline Kochi (demo)', description: 'Glucometer strips and dressing kits', status: 'submitted', createdBy: ids.finance, createdAt: day0(3), history: [{ at: day0(3), by: ids.finance, action: 'submitted' }] });
  await docs.insert('app_issues', { id: 'demo-issue-1', reference: 'IS-DEMO01', type: 'complaint', title: 'Nurse arrived later than the slot', detail: 'The family says the morning visit started after 11 AM.', priority: 'normal', personId: 'P-DEMO01', customerName: 'Lakshmi Nair', status: 'open', createdBy: ids.ops, createdAt: day0(2), history: [{ at: day0(2), by: ids.ops, action: 'opened' }] });

  // the demo's older notifications count as read; two fresh ones show on the bell
  for (const n of await docs.find('app_notifications')) await docs.update('app_notifications', n.id, { readAt: iso() });
  await scheduler.notify([ids.nurse], { kind: 'visit-assigned', title: 'Welcome to the nurse portal', body: 'Your visits, schedule and customers are here. Accept each new visit when it arrives.', link: '#/nurse/visits' });
}

// A demo database filled before a demo login was added (the four team dashboards, 23 Nov 2026)
// gets the missing demo logins when the server starts. Only in demo mode, only on a database the
// demo filled itself (it has the demo-seed record); nothing else in it is changed.
async function topUp() {
  refuseOutsideDemo();
  if (!(await docs.findOne('app_audit', { id: 'demo-seed' }))) return 0;
  const hash = auth.hashPassword(PASSWORD);
  let added = 0;
  for (const [role, name, email, phone] of USERS) {
    const id = 'demo-u-' + email.split('@')[0];
    if (await docs.findOne('app_users', { id }) || await docs.findOne('app_users', { email })) continue;
    await docs.insert('app_users', { id, name, email, phone, role, passwordHash: hash, active: true, createdAt: new Date().toISOString() });
    added++;
  }
  if (added) console.log('[app] demo: added ' + added + ' missing demo login(s) (password: ' + PASSWORD + ')');
  return added;
}

module.exports = { seed, topUp, PASSWORD, USERS };
