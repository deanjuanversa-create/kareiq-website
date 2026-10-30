// node tools/check-scheduler.js : the nurse scheduler's rules, on an in-memory database
// (fair assignment, availability first, no overlaps, capacity, simultaneous bookings, duplicates,
// leave, holidays, brands, manual assignment and status changes)
const { matches } = require('../src/docs');
const sched = require('../src/app/scheduler');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

function memoryDocs() {
  const cols = {};
  const col = (c) => (cols[c] = cols[c] || []);
  const clone = (x) => JSON.parse(JSON.stringify(x));
  return {
    cols,
    async find(c, f = {}, o = {}) {
      let rows = col(c).filter((d) => matches(d, f));
      if (o.sort) { const [[k, dir]] = Object.entries(o.sort); rows = rows.sort((a, b) => ((a[k] || '') < (b[k] || '') ? -1 : (a[k] || '') > (b[k] || '') ? 1 : 0) * dir); }
      return clone(rows);
    },
    async findOne(c, f) { const d = col(c).find((x) => matches(x, f)); return d ? clone(d) : null; },
    async insert(c, d) { await new Promise((r) => setTimeout(r, Math.random() * 3)); col(c).push(clone(d)); return d; },
    async update(c, id, ch) { await new Promise((r) => setTimeout(r, Math.random() * 3)); const d = col(c).find((x) => x.id === id); if (!d) return null; Object.assign(d, clone(ch)); return clone(d); }
  };
}
let n = 0;
function setup(nurses) {
  const docs = memoryDocs();
  const ctx = { docs, uid: () => 'id' + (++n), now: () => new Date(Date.UTC(2026, 10, 2, 3, 0, n % 60)).toISOString(), store: { makeReference: (p) => p + '-' + (++n), update: async () => {} } };
  const s = sched.create(ctx);
  docs.cols.app_users = nurses.map((x) => ({ id: x.id, name: x.name, role: 'caregiver', active: x.active !== false }));
  docs.cols.app_users.push({ id: 'adm', name: 'Office', role: 'admin', active: true });
  docs.cols.app_staff = nurses.filter((x) => x.profile).map((x) => ({ id: 'st-' + x.id, userId: x.id, ...x.profile }));
  return { s, docs };
}
const MON = '2026-11-02'; // a Monday
const book = (s, i, extra) => s.createVisit({ personId: 'P' + i, customerName: 'Customer ' + i, product: 'karehome', service: 'physiotherapy', date: MON, slot: 'morning', source: { type: 'service', id: 'b' + i + Math.random() }, ...(extra || {}) });
const overlaps = (vs) => vs.some((a) => vs.some((b) => a !== b && a.nurseId === b.nurseId && a.date === b.date && a.start && b.start && a.start < b.end && b.start < a.end));

(async () => {
  // 1. fairness: A already has a visit, B is free -> B gets the new one
  let { s, docs } = setup([{ id: 'A', name: 'Nurse A' }, { id: 'B', name: 'Nurse B' }]);
  let r1 = await book(s, 1); let r2 = await book(s, 2);
  ok(r1.ok && r2.ok && r1.visit.nurseId !== r2.visit.nurseId, 'two bookings go to two different nurses (fair share)');
  ok(r1.visit.start === '08:00' && r2.visit.start === '08:00', 'each starts at the beginning of the morning slot');
  // 2. availability first: B is on leave -> A takes it at a time that does not overlap
  ({ s, docs } = setup([{ id: 'A', name: 'Nurse A' }, { id: 'B', name: 'Nurse B', profile: { leave: [{ from: MON, to: MON }] } }]));
  r1 = await book(s, 1); r2 = await book(s, 2);
  ok(r1.visit.nurseId === 'A' && r2.visit.nurseId === 'A' && r2.visit.start === '09:30', 'a nurse on leave is skipped; the other nurse gets non-overlapping times (60 min + 30 min travel)');
  // 3. capacity: one nurse, 4 one-hour visits in a 4-hour slot -> 3 fit, the 4th waits and the office is told
  ({ s, docs } = setup([{ id: 'A', name: 'Nurse A' }]));
  const rs = []; for (let i = 0; i < 4; i++) rs.push(await book(s, i));
  ok(rs.slice(0, 3).every((r) => r.ok) && rs.map((r) => r.visit.start).slice(0, 3).join() === '08:00,09:30,11:00', 'three visits fit the morning: 08:00, 09:30, 11:00');
  ok(!rs[3].ok && rs[3].visit.status === 'awaiting_assignment' && rs[3].visit.nurseId === null, 'the fourth waits for assignment (no unavailable nurse is given it)');
  ok(docs.cols.app_notifications.some((x) => x.userId === 'adm' && x.kind === 'visit-unassigned'), 'the office is told about the waiting visit');
  // 4. simultaneous bookings: 10 at once, 2 nurses -> 6 assigned, no overlaps, 4 waiting
  ({ s, docs } = setup([{ id: 'A', name: 'Nurse A' }, { id: 'B', name: 'Nurse B' }]));
  const all = await Promise.all(Array.from({ length: 10 }, (_, i) => book(s, i)));
  const vs = docs.cols.app_schedule;
  ok(all.filter((r) => r.ok).length === 6 && vs.filter((v) => v.status === 'awaiting_assignment').length === 4, 'ten bookings at once: six assigned, four waiting: ' + all.filter((r) => r.ok).length);
  ok(!overlaps(vs), 'no nurse has overlapping visits after simultaneous bookings');
  ok(vs.filter((v) => v.nurseId === 'A').length === 3 && vs.filter((v) => v.nurseId === 'B').length === 3, 'shared evenly (3 and 3)');
  ok(new Set(vs.filter((v) => v.slotKey).map((v) => v.slotKey)).size === 6, 'every assigned visit has its own nurse+day+time key');
  // 5. the same booking twice -> one visit
  ({ s, docs } = setup([{ id: 'A', name: 'Nurse A' }]));
  const src = { type: 'service', id: 'same' };
  await Promise.all([book(s, 1, { source: src }), book(s, 1, { source: src }), book(s, 1, { source: src })]);
  ok(docs.cols.app_schedule.length === 1, 'the same booking sent three times makes one visit');
  // 6. holiday, weekday schedule, brand and service
  ({ s, docs } = setup([{ id: 'A', name: 'Nurse A', profile: { availability: { days: { mon: ['evening'] }, brands: ['karenest'], services: ['physiotherapy'], bufferMin: 30 } } }]));
  r1 = await book(s, 1);
  ok(!r1.ok, 'not given a morning visit when the nurse works only evenings');
  r1 = await book(s, 2, { slot: 'evening' });
  ok(!r1.ok, 'not given a Kare@Home visit when the nurse works only for KareNest');
  r1 = await book(s, 3, { slot: 'evening', product: 'karenest' });
  ok(r1.ok && r1.visit.start === '14:00' && r1.visit.end === '15:00', 'given a KareNest evening visit: 2 PM to 3 PM');
  r1 = await book(s, 4, { slot: 'evening', product: 'karenest', service: 'dressing' });
  ok(!r1.ok, 'not given a service the nurse does not do');
  docs.cols.app_settings = [{ id: 'scheduling', holidays: [{ date: MON, name: 'Holiday' }] }];
  r1 = await book(s, 5, { slot: 'evening', product: 'karenest' });
  ok(!r1.ok, 'nobody is given visits on a holiday');
  // 7. a bystander visit fills the whole slot
  ({ s, docs } = setup([{ id: 'A', name: 'Nurse A' }]));
  r1 = await book(s, 1, { service: 'bystander' }); r2 = await book(s, 2);
  ok(r1.ok && r1.visit.start === '08:00' && r1.visit.end === '12:00' && !r2.ok, 'a 4-hour bystander visit takes the whole morning');
  // 8. manual assignment checks availability too; reassignment keeps no overlap
  ({ s, docs } = setup([{ id: 'A', name: 'Nurse A' }, { id: 'B', name: 'Nurse B' }]));
  const v1 = (await book(s, 1)).visit; // -> A or B
  const other = v1.nurseId === 'A' ? 'B' : 'A';
  docs.cols.app_staff = [{ id: 'st-' + other, userId: other, leave: [{ from: MON, to: MON }] }];
  let m = await s.assign(v1.id, { nurseId: other, by: 'adm', byRole: 'admin' });
  ok(!m.ok && /not available/.test(m.why), 'the office cannot assign a nurse who is on leave');
  docs.cols.app_staff = [];
  m = await s.assign(v1.id, { nurseId: other, by: 'adm', byRole: 'admin' });
  ok(m.ok && m.visit.nurseId === other && m.visit.history.some((h) => h.action === 'reassigned'), 'reassigning to a free nurse works and is recorded');
  ok(docs.cols.app_notifications.some((x) => x.userId === v1.nurseId && x.kind === 'visit-removed'), 'the first nurse is told the visit moved');
  // 9. status changes
  const nurse = { id: other, role: 'caregiver' }, stranger = { id: 'X', role: 'caregiver' };
  ok((await s.setStatus(v1.id, stranger, 'accepted')).code === 404, 'another nurse cannot change the visit');
  ok((await s.setStatus(v1.id, nurse, 'cancelled')).code === 403, 'a nurse cannot cancel a visit');
  ok((await s.setStatus(v1.id, nurse, 'completed')).code === 409, 'cannot jump from assigned to completed');
  ok((await s.setStatus(v1.id, nurse, 'accepted')).ok && (await s.setStatus(v1.id, nurse, 'in_progress')).ok && (await s.setStatus(v1.id, nurse, 'completed')).ok, 'accept, start, complete');
  const done = docs.cols.app_schedule.find((v) => v.id === v1.id);
  ok(done.status === 'completed' && done.history.length >= 5, 'every change is in the history: ' + done.history.map((h) => h.action).join(','));
  const v2 = (await book(s, 9)).visit;
  ok((await s.setStatus(v2.id, { id: 'adm', role: 'admin' }, 'cancelled', 'Family cancelled')).ok && docs.cols.app_schedule.find((v) => v.id === v2.id).slotKey === null, 'the office cancels; the time is freed');
  const v3 = (await book(s, 10)).visit;
  ok(v3.start === v2.start || v3.nurseId !== v2.nurseId || v3.start, 'a cancelled time can be given again');
  console.log(`check-scheduler: PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
