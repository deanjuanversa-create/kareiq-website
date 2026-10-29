// Demo accounts for trying the app on your own computer (files mode only, or APP_DEMO=true).
// Never runs when a real admin already exists.

const crypto = require('crypto');
const docs = require('../docs');
const auth = require('./auth');

const PASSWORD = 'demo-pass-123';
const USERS = [
  ['admin', 'Office Admin (demo)', 'admin@demo.kareiq', null],
  ['family', 'Priya Nair (demo)', 'family@demo.kareiq', '+919800000001'],
  ['family', 'Rahul Menon (demo)', 'rahul@demo.kareiq', '+919800000002'],
  ['family', 'Arjun Iyer (demo)', 'arjun@demo.kareiq', '+919800000003'],   // bought Kare@Home only
  ['family', 'Meena Das (demo)', 'meena@demo.kareiq', '+919800000004'],    // bought KareNest (Kare@Home is included)
  ['caregiver', 'Nurse Anjali (demo)', 'nurse@demo.kareiq', '+919800000011'],
  ['caregiver', 'Joseph, KareNest care team (demo)', 'nest@demo.kareiq', '+919800000012']
];

function rand(seed) { let s = seed; return () => { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }

async function seed() {
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
  await link('nurse', 'P-DEMO03', 'caregiver');
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

  await docs.insert('app_audit', { id: 'demo-seed', at: iso(), userId: null, action: 'demo.seed', personId: null, detail: null });
  console.log('[app] demo accounts created (password: demo-pass-123): admin@demo.kareiq, family@demo.kareiq (both), arjun@demo.kareiq (Kare@Home only), meena@demo.kareiq (KareNest, includes Kare@Home), rahul@demo.kareiq (being set up), nurse@demo.kareiq, nest@demo.kareiq');
}

module.exports = { seed, PASSWORD, USERS };
