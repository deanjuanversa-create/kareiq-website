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
    const id = crypto.randomUUID();
    ids[email.split('@')[0]] = id;
    await docs.insert('app_users', { id, name, email, phone, role, passwordHash: hash, active: true, createdAt: iso() });
  }
  const people = [
    { id: 'P-DEMO01', name: 'Lakshmi Nair', birthYear: 1951 },
    { id: 'P-DEMO02', name: 'Gopal Nair', birthYear: 1947 },
    { id: 'P-DEMO03', name: 'Saraswathi Menon', birthYear: 1955 },
    { id: 'P-DEMO04', name: 'Kamala Iyer', birthYear: 1949 },
    { id: 'P-DEMO05', name: 'Mohan Das', birthYear: 1944 }
  ];
  for (const x of people) await docs.insert('app_people', { ...x, active: true, createdAt: iso() });

  const link = (user, personId, kind, relation) => docs.insert('app_links', { id: crypto.randomUUID(), userId: ids[user], personId, kind, relation: relation || null, createdAt: iso() });
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
    id: crypto.randomUUID(), personId, product, planId, status, startDate: status === 'pending' ? null : start,
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
      const visitId = crypto.randomUUID();
      const rows = [
        { metric: 'bp', systolic: Math.round(base.sys + (r() - 0.5) * 14), diastolic: Math.round(base.dia + (r() - 0.5) * 8) },
        { metric: 'hr', value: Math.round(base.hr + (r() - 0.5) * 10) },
        { metric: 'spo2', value: Math.round(96 + r() * 3) }
      ];
      if (n % 4 === 0) rows.push({ metric: 'glucose', value: Math.round(base.glu + (r() - 0.5) * 20), context: 'fasting' });
      if (n % 14 === 0) { const w = Math.round((base.w + (r() - 0.5)) * 10) / 10; rows.push({ metric: 'weight', value: w }, { metric: 'bmi', value: Math.round(w / ((base.h / 100) ** 2) * 10) / 10, calc: true }); }
      if (n === 56) rows.push({ metric: 'height', value: base.h }, { metric: 'chol', value: base.chol });
      if (n % 6 === 0) rows.push({ metric: 'temp', value: Math.round((36.4 + r() * 0.6) * 10) / 10 });
      for (const row of rows) {
        const { calc, ...data } = row;
        await docs.insert('app_readings', { id: crypto.randomUUID(), personId, product, ...data, measuredAt: at.toISOString(), measuredMs: at.getTime(), source: calc ? 'calculated' : 'caregiver_visit', enteredBy: by, enteredAt: at.toISOString(), visitId, voided: false });
      }
      const notes = product === 'karenest'
        ? ['Joined the morning yoga circle and enjoyed it.', 'Ate well at lunch; walked in the garden for 20 minutes.', 'Played carrom with friends in the evening.', null, null, 'Slept well. Asked about the music evening on Friday.']
        : ['Took all morning medicines on time.', 'Did the KareBalance exercises for 15 minutes.', 'Walked to the gate and back with support.', null, null, 'Good appetite today. Reminded about the eye check-up.'];
      await docs.insert('app_visits', { id: visitId, personId, product, by, at: at.toISOString(), note: notes[Math.floor(r() * notes.length)], metrics: [...new Set(rows.map((x) => x.metric))], createdAt: at.toISOString() });
    }
  };
  await write('P-DEMO01', 'karehome', ids.nurse, 11, { sys: 136, dia: 84, hr: 76, glu: 112, w: 61, h: 156, chol: 212 });
  await write('P-DEMO02', 'karenest', ids.nest, 29, { sys: 128, dia: 80, hr: 72, glu: 104, w: 70, h: 168, chol: 190 });
  await write('P-DEMO04', 'karehome', ids.nurse, 47, { sys: 142, dia: 88, hr: 80, glu: 126, w: 58, h: 152, chol: 224 });
  await write('P-DEMO05', 'karenest', ids.nest, 53, { sys: 124, dia: 78, hr: 70, glu: 98, w: 66, h: 170, chol: 180 });

  await docs.insert('app_audit', { id: crypto.randomUUID(), at: iso(), userId: null, action: 'demo.seed', personId: null, detail: null });
  console.log('[app] demo accounts created (password: demo-pass-123): admin@demo.kareiq, family@demo.kareiq (both), arjun@demo.kareiq (Kare@Home only), meena@demo.kareiq (KareNest, includes Kare@Home), rahul@demo.kareiq (being set up), nurse@demo.kareiq, nest@demo.kareiq');
}

module.exports = { seed, PASSWORD, USERS };
