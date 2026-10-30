// Nurse scheduling: visits booked through Kare@Home and KareNest are given to an available nurse.
//
// Two visit slots a day: Morning 8 AM to 12 PM and Evening 2 PM to 6 PM. Each visit gets an exact
// start time inside its slot, from its service's length plus the nurse's travel buffer, so a nurse
// never has two visits that overlap.
//
// Choosing a nurse (availability always first, then fairness):
//   1. eligible: a nurse (caregiver login) who is active, works that weekday and slot, is not on
//      leave, the day is not a holiday, and does that brand and service;
//   2. available: the slot still has room for this visit without overlapping their other visits
//      (with travel buffer) and under their per-slot limit;
//   3. among the available ones: the fewest visits that week, then that day, then the one who was
//      given a visit least recently (round robin), then a nurse who already looks after the person.
// All assignment happens inside one lock and re-checks availability before saving; with MongoDB a
// unique index on the nurse+day+start key also refuses a double booking from a second server.
// When nobody is available the visit waits ("Awaiting assignment") and the office is told.

const SLOTS = {
  morning: { name: 'Morning', from: '08:00', to: '12:00', label: 'Morning (8 AM to 12 PM)' },
  evening: { name: 'Evening', from: '14:00', to: '18:00', label: 'Evening (2 PM to 6 PM)' }
};
// older bookings used a third slot; they are treated as the nearest current slot
const LEGACY_SLOT = { afternoon: 'evening' };
const SERVICE_MINUTES = { bystander: 240, physiotherapy: 60, teleconsultation: 30, spongebath: 45, 'blood-collection': 30, dressing: 30, 'home-visit': 60, 'first-visit': 60 };
const SERVICE_NAMES = { 'home-visit': 'Home visit', 'first-visit': 'First visit (assessment)' };
const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const DEFAULT_DAYS = { mon: ['morning', 'evening'], tue: ['morning', 'evening'], wed: ['morning', 'evening'], thu: ['morning', 'evening'], fri: ['morning', 'evening'], sat: ['morning', 'evening'], sun: [] };
const STATUS = {
  awaiting_assignment: 'Awaiting assignment', assigned: 'Nurse assigned', accepted: 'Accepted by nurse',
  in_progress: 'In progress', completed: 'Completed', cancelled: 'Cancelled'
};
const ACTIVE = ['assigned', 'accepted', 'in_progress'];
const STEP = 15; // minutes between possible start times

const toMin = (hm) => { const [h, m] = String(hm).split(':').map(Number); return h * 60 + m; };
const toHM = (n) => String(Math.floor(n / 60)).padStart(2, '0') + ':' + String(n % 60).padStart(2, '0');
const weekday = (date) => DAYS[new Date(date + 'T12:00:00Z').getUTCDay()];
function weekOf(date) { // Monday..Sunday containing date
  const d = new Date(date + 'T12:00:00Z'); const back = (d.getUTCDay() + 6) % 7;
  const mon = new Date(d.getTime() - back * 86400000).toISOString().slice(0, 10);
  const sun = new Date(d.getTime() + (6 - back) * 86400000).toISOString().slice(0, 10);
  return [mon, sun];
}

function create(ctx) {
  const { docs, uid, now, store } = ctx;
  let chain = Promise.resolve();
  // one assignment at a time in this server (atomic check-and-save)
  function locked(fn) { const run = chain.then(fn, fn); chain = run.catch(() => {}); return run; }

  async function settings() {
    const s = (await docs.findOne('app_settings', { id: 'scheduling' })) || {};
    return { holidays: Array.isArray(s.holidays) ? s.holidays : [] };
  }
  function profileDefaults(p) {
    const a = (p && p.availability) || {};
    return {
      days: a.days && typeof a.days === 'object' ? a.days : DEFAULT_DAYS,
      bufferMin: Number.isFinite(a.bufferMin) ? a.bufferMin : 30,
      maxPerSlot: Number.isFinite(a.maxPerSlot) && a.maxPerSlot > 0 ? a.maxPerSlot : null,
      services: Array.isArray(a.services) ? a.services : null, // null = every service
      brands: Array.isArray(a.brands) && a.brands.length ? a.brands : ['karehome', 'karenest']
    };
  }
  async function nurses() {
    const users = await docs.find('app_users', { role: 'caregiver' });
    const profiles = await docs.find('app_staff', { userId: { $in: users.map((u) => u.id) } });
    return users.map((u) => ({ user: u, profile: profiles.find((p) => p.userId === u.id) || null }));
  }
  function onLeave(profile, date) {
    return ((profile && profile.leave) || []).some((l) => l.from <= date && date <= l.to);
  }

  // Can this nurse take this visit? Returns { ok, start, why }
  function fit(n, visit, theirVisits, holidays) {
    const a = profileDefaults(n.profile);
    if (!n.user.active) return { ok: false, why: 'login switched off' };
    if (n.profile && n.profile.status === 'inactive') return { ok: false, why: 'not working at present' };
    if (holidays.some((h) => h.date === visit.date)) return { ok: false, why: 'holiday' };
    if (onLeave(n.profile, visit.date)) return { ok: false, why: 'on leave' };
    if (!(a.days[weekday(visit.date)] || []).includes(visit.slot)) return { ok: false, why: 'does not work this slot' };
    if (!a.brands.includes(visit.product)) return { ok: false, why: 'does not work for this brand' };
    if (a.services && !a.services.includes(visit.service)) return { ok: false, why: 'does not do this service' };
    const slot = SLOTS[visit.slot];
    const mine = theirVisits.filter((v) => v.id !== visit.id && v.date === visit.date && ACTIVE.includes(v.status) && v.start);
    if (a.maxPerSlot && mine.filter((v) => v.slot === visit.slot).length >= a.maxPerSlot) return { ok: false, why: 'slot is full' };
    const busy = mine.map((v) => [toMin(v.start), toMin(v.end) + a.bufferMin]);
    for (let s = toMin(slot.from); s + visit.minutes <= toMin(slot.to); s += STEP) {
      const e = s + visit.minutes + a.bufferMin;
      if (!busy.some(([x, y]) => s < y && x < e)) return { ok: true, start: toHM(s) };
    }
    return { ok: false, why: 'no free time in this slot' };
  }

  async function candidates(visit) {
    const [list, { holidays }] = await Promise.all([nurses(), settings()]);
    const [w0, w1] = weekOf(visit.date);
    const week = await docs.find('app_schedule', { nurseId: { $in: list.map((n) => n.user.id) }, date: { $gte: w0, $lte: w1 } });
    const linked = visit.personId ? (await docs.find('app_links', { personId: visit.personId, kind: 'caregiver' })).map((l) => l.userId) : [];
    return list.map((n) => {
      const theirs = week.filter((v) => v.nurseId === n.user.id);
      const f = fit(n, visit, theirs, holidays);
      const lastAt = theirs.reduce((m, v) => (v.assignedAt && v.assignedAt > m ? v.assignedAt : m), '');
      return {
        nurse: n, ...f,
        weekLoad: theirs.filter((v) => v.status !== 'cancelled').length,
        dayLoad: theirs.filter((v) => v.status !== 'cancelled' && v.date === visit.date).length,
        lastAt, linked: linked.includes(n.user.id)
      };
    });
  }
  const fairOrder = (a, b) => a.weekLoad - b.weekLoad || a.dayLoad - b.dayLoad || (a.lastAt < b.lastAt ? -1 : a.lastAt > b.lastAt ? 1 : 0) || (b.linked - a.linked) || (a.nurse.user.id < b.nurse.user.id ? -1 : 1);

  async function notify(userIds, n) {
    for (const userId of [...new Set(userIds)]) await docs.insert('app_notifications', { id: uid(), userId, ...n, readAt: null, createdAt: now() });
  }
  async function admins() { return (await docs.find('app_users', { role: 'admin', active: true })).map((u) => u.id); }
  function pushHistory(v, entry) { return [...(v.history || []), { at: now(), ...entry }]; }

  // Give a waiting visit to a nurse: the fairest available one, or the one asked for (office).
  // Returns { ok, visit, why }
  async function assign(visitId, opts) {
    const o = opts || {};
    return locked(async () => {
      const v = await docs.findOne('app_schedule', { id: visitId });
      if (!v) return { ok: false, why: 'Visit not found.' };
      if (v.status === 'cancelled' || v.status === 'completed') return { ok: false, why: 'This visit is ' + STATUS[v.status].toLowerCase() + '.' };
      if (!o.nurseId && v.nurseId && ACTIVE.includes(v.status)) return { ok: true, visit: v };
      const list = await candidates(v);
      let pool = list.filter((c) => c.ok);
      if (o.nurseId) {
        const want = list.find((c) => c.nurse.user.id === o.nurseId);
        if (!want) return { ok: false, why: 'Choose a nurse.' };
        if (!want.ok) return { ok: false, why: `${want.nurse.user.name} is not available for this visit (${want.why}).` };
        pool = [want];
      } else pool.sort(fairOrder);
      for (const c of pool) {
        const start = c.start, end = toHM(toMin(start) + v.minutes);
        const changes = {
          nurseId: c.nurse.user.id, start, end, status: 'assigned', assignedAt: now(), updatedAt: now(),
          slotKey: `${c.nurse.user.id}|${v.date}|${start}`,
          history: pushHistory(v, { by: o.by || 'system', byRole: o.byRole || 'system', action: v.nurseId && v.nurseId !== c.nurse.user.id ? 'reassigned' : 'assigned', from: v.nurseId || null, to: c.nurse.user.id, note: o.note || (o.nurseId ? 'Assigned by the office' : 'Assigned automatically to an available nurse') })
        };
        try {
          const saved = await docs.update('app_schedule', v.id, changes);
          if (v.nurseId && v.nurseId !== c.nurse.user.id) await notify([v.nurseId], { kind: 'visit-removed', title: 'Visit moved to another nurse', body: `${v.serviceName} for ${v.customerName} on ${v.date} (${SLOTS[v.slot].name}) is no longer yours.`, link: '#/nurse/schedule' });
          await notify([c.nurse.user.id], { kind: 'visit-assigned', title: 'New visit assigned', body: `${v.serviceName} for ${v.customerName} on ${v.date}, ${SLOTS[v.slot].name} at ${start}.`, link: '#/nurse/visits?d=' + v.date });
          await syncSource(saved);
          return { ok: true, visit: saved };
        } catch (e) {
          if (!/E11000|duplicate key/i.test(String(e && e.message))) throw e; // taken by another server a moment ago: try the next nurse
        }
      }
      // nobody free: keep it waiting and tell the office (once per visit)
      if (!v.officeToldAt) {
        await docs.update('app_schedule', v.id, { status: 'awaiting_assignment', officeToldAt: now(), updatedAt: now(), history: pushHistory(v, { by: 'system', byRole: 'system', action: 'waiting', note: 'No nurse is available for this slot' }) });
        await notify(await admins(), { kind: 'visit-unassigned', title: 'Visit needs a nurse', body: `${v.serviceName} for ${v.customerName} on ${v.date} (${SLOTS[v.slot].name}): no nurse is available.`, link: '#/office/scheduler?tab=unassigned' });
      }
      return { ok: false, visit: await docs.findOne('app_schedule', { id: v.id }), why: 'No nurse is available for this slot.' };
    });
  }

  // a booking (app service, website first visit) becomes a visit; the same booking only once
  async function createVisit(input) {
    const slot = SLOTS[input.slot] ? input.slot : LEGACY_SLOT[input.slot] || 'morning';
    const sourceKey = input.source ? `${input.source.type}:${input.source.id}` : null;
    const made = await locked(async () => {
      if (sourceKey) {
        const same = await docs.findOne('app_schedule', { sourceKey });
        if (same) return same;
      }
      const v = {
        id: uid(), reference: store.makeReference('KV'), personId: input.personId || null, customerName: input.customerName || 'Customer',
        product: input.product === 'karenest' ? 'karenest' : 'karehome', service: input.service, serviceName: input.serviceName || SERVICE_NAMES[input.service] || ((require('./care').SERVICES[input.service] || {}).name) || input.service,
        date: input.date, slot, start: null, end: null, minutes: SERVICE_MINUTES[input.service] || 60, location: input.location || '',
        status: 'awaiting_assignment', nurseId: null, slotKey: null, sourceKey, source: input.source || null, note: input.note || '',
        history: [{ at: now(), by: input.by || 'system', byRole: input.byRole || 'system', action: 'booked', note: input.bookedNote || 'Booked' }], createdAt: now()
      };
      try { await docs.insert('app_schedule', v); } catch (e) {
        if (/E11000|duplicate key/i.test(String(e && e.message))) return docs.findOne('app_schedule', { sourceKey });
        throw e;
      }
      return v;
    });
    if (made.status !== 'awaiting_assignment' || made.nurseId) return { ok: true, visit: made };
    return assign(made.id);
  }

  // the booking a visit came from shows its progress to the family
  async function syncSource(v) {
    if (!v || !v.source || !v.source.id) return;
    const col = v.source.type === 'booking' ? 'bookings' : v.source.type === 'service' ? 'enquiries' : null;
    if (!col) return;
    try { await store.update(col, v.source.id, { visitId: v.id, visitStatus: v.status, visitStart: v.start || null, ...(ACTIVE.includes(v.status) ? { status: 'scheduled' } : v.status === 'completed' || v.status === 'cancelled' ? { status: 'closed' } : {}) }); } catch { /* the booking may have been removed */ }
  }

  // status changes: nurses move their own visits forward; the office can also cancel
  const NEXT = { assigned: ['accepted', 'in_progress'], accepted: ['in_progress'], in_progress: ['completed'] };
  async function setStatus(visitId, user, status, note) {
    return locked(async () => {
      const v = await docs.findOne('app_schedule', { id: visitId });
      if (!v) return { ok: false, code: 404, why: 'Visit not found.' };
      const office = user.role === 'admin';
      if (!office && v.nurseId !== user.id) return { ok: false, code: 404, why: 'Visit not found.' };
      if (status === 'cancelled') {
        if (!office) return { ok: false, code: 403, why: 'Only the office can cancel a visit.' };
        if (v.status === 'completed' || v.status === 'cancelled') return { ok: false, code: 409, why: 'This visit is already ' + STATUS[v.status].toLowerCase() + '.' };
      } else if (!(NEXT[v.status] || []).includes(status)) return { ok: false, code: 409, why: `A visit that is "${STATUS[v.status]}" cannot become "${STATUS[status] || status}".` };
      const changes = { status, updatedAt: now(), history: pushHistory(v, { by: user.id, byRole: user.role, action: status, from: v.status, to: status, note: String(note || '').slice(0, 300) }) };
      if (status === 'cancelled') changes.slotKey = null;
      if (status === 'completed') changes.completedAt = now();
      const saved = await docs.update('app_schedule', v.id, changes);
      if (status === 'cancelled' && v.nurseId && v.nurseId !== user.id) await notify([v.nurseId], { kind: 'visit-cancelled', title: 'Visit cancelled', body: `${v.serviceName} for ${v.customerName} on ${v.date} (${SLOTS[v.slot].name}) was cancelled.`, link: '#/nurse/schedule' });
      await syncSource(saved);
      return { ok: true, visit: saved };
    });
  }

  // Who could take this visit? (for the office's manual assignment)
  async function options(visitId) {
    const v = await docs.findOne('app_schedule', { id: visitId });
    if (!v) return null;
    return (await candidates(v)).sort((a, b) => (b.ok - a.ok) || fairOrder(a, b)).map((c) => ({ id: c.nurse.user.id, name: c.nurse.user.name, ok: c.ok, start: c.start || null, why: c.ok ? null : c.why, weekLoad: c.weekLoad, current: v.nurseId === c.nurse.user.id }));
  }

  // Visits that clash (should never happen; shown to the office if data was changed by hand)
  async function conflicts(from, to) {
    const rows = (await docs.find('app_schedule', { date: { $gte: from, $lte: to } })).filter((v) => ACTIVE.includes(v.status) && v.nurseId && v.start);
    const list = await nurses(); const out = [];
    for (const v of rows) {
      const n = list.find((x) => x.user.id === v.nurseId);
      if (n && onLeave(n.profile, v.date)) out.push({ visitId: v.id, kind: 'leave', why: `${n.user.name} is on leave that day` });
      const clash = rows.find((o) => o.id !== v.id && o.nurseId === v.nurseId && o.date === v.date && toMin(o.start) < toMin(v.end) && toMin(v.start) < toMin(o.end));
      if (clash && v.id < clash.id) out.push({ visitId: v.id, other: clash.id, kind: 'overlap', why: 'Two visits overlap for the same nurse' });
    }
    return out;
  }

  return { SLOTS, STATUS, ACTIVE, SERVICE_MINUTES, DEFAULT_DAYS, DAYS, assign, createVisit, setStatus, options, conflicts, nurses, profileDefaults, settings, notify, admins, weekOf, locked };
}

module.exports = { create, SLOTS, STATUS, ACTIVE, SERVICE_MINUTES, DEFAULT_DAYS, DAYS, LEGACY_SLOT };
