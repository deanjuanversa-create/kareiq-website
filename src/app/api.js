// KareIQ app API (/api/app/*): one sign-in for families, caregivers and the office team,
// across both brands. After signing in, people only see the brand(s) whose plan they bought:
//   one brand  -> straight into Kare@Home or KareNest
//   both       -> a "choose where to go" screen (like choosing a profile on Netflix)
//   office     -> both brands plus the admin space
//
// Who can see what (checked on the server for every request):
//   family     people they are linked to, in brands where that person has a plan
//   caregiver  people assigned to them; may record visits while the plan is active
//   admin      everyone, both brands
// Unknown or not-allowed people answer 404, so ids cannot be probed.

const crypto = require('crypto');
const docs = require('../docs');
const store = require('../store');
const auth = require('./auth');
const vitals = require('./vitals');
const { PRODUCTS, INCLUDES, PLAN_STATUS, planName, plansFor, productOfRequest } = require('./products');
const { normalisePhone } = require('../validate');
const { sendMail, mailReady } = require('../notify');
const db = require('../db');
const content = require('../content');
const catalog = require('../catalog');
const { createOAuth, safeNext } = require('./oauth');
const risk = require('./risk');
const care = require('./care');
const report = require('./report');
const packinfo = require('./packinfo');

const ROLES = { family: 'Family', caregiver: 'Caregiver', admin: 'Office admin' };
const RELATIONS_MAX = 40;
const REQUEST_KINDS = {
  visit: 'Extra visit request',
  question: 'Question from family',
  plan: 'Plan change or renewal',
  'family-visit': 'Family wants to visit',
  'signin-help': 'Needs help signing in'
};

const now = () => new Date().toISOString();
const uid = () => crypto.randomUUID();
const bad = (message, errors) => Object.assign(new Error(message), { status: 400, errors });
const notFound = () => Object.assign(new Error('Not found.'), { status: 404 });
const forbidden = () => Object.assign(new Error('You do not have access to this.'), { status: 403 });

function clean(v, max = 120) {
  return typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '';
}
const cleanEmail = (v) => clean(v, 120).toLowerCase();
const validEmail = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v);
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
function addMonths(isoDate, months) {
  const d = new Date(isoDate + 'T00:00:00Z');
  d.setUTCMonth(d.getUTCMonth() + Number(months));
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function publicUser(u) {
  return { id: u.id, name: u.name, email: u.email || null, phone: u.phone || null, role: u.role, roleName: ROLES[u.role], active: u.active, hasPassword: Boolean(u.passwordHash), createdAt: u.createdAt, lastLoginAt: u.lastLoginAt || null };
}

async function audit(userId, action, personId, detail) {
  await docs.insert('app_audit', { id: uid(), at: now(), userId: userId || null, action, personId: personId || null, detail: detail || null });
}

// ---------- first admin + demo data ----------
let ready = null;
function ensureReady() {
  if (!ready) ready = setup().catch((e) => { ready = null; throw e; });
  return ready;
}
async function setup() {
  await docs.ensureIndexes();
  const admins = await docs.count('app_users', { role: 'admin' });
  const demo = String(process.env.APP_DEMO || (db.mode === 'file' ? 'true' : 'false')) === 'true';
  if (!admins && demo && !(await docs.count('app_users'))) {
    await require('./demo').seed();
    return;
  }
  if (!admins && process.env.ADMIN_PASSWORD) {
    await docs.insert('app_users', {
      id: uid(), name: 'Office admin', email: adminEmail(), phone: null, role: 'admin',
      passwordHash: auth.hashPassword(process.env.ADMIN_PASSWORD), active: true, createdAt: now()
    });
    console.log(`[app] created the first admin login: ${adminEmail()} (password = ADMIN_PASSWORD)`);
  }
}
// On a public demo site (APP_DEMO=true) the shared demo logins cannot be changed or turned off
const demoLocked = (u) => String(process.env.APP_DEMO || '') === 'true' && /@demo\.kareiq$/i.test(String((u && u.email) || ''));
const DEMO_LOCKED = 'This is a shared demo login, so its details cannot be changed here. Add a new login to try this.';
const adminEmail = () => cleanEmail(process.env.ADMIN_EMAIL || 'admin@karenest.co.in');

// ---------- who sees what ----------
async function linksOf(userId, kind) { return docs.find('app_links', { userId, kind }); }

async function plansOfPeople(personIds) {
  if (!personIds.length) return [];
  return docs.find('app_plans', { personId: { $in: personIds } }, { sort: { createdAt: -1 } });
}

const STATUS_RANK = { active: 3, paused: 2, pending: 1, ended: 0 };

// Real plans plus the brands they include (e.g. a KareNest plan also opens Kare@Home).
// Included entries carry included: true and point at the plan they come from.
function withIncluded(plans) {
  const out = [...plans];
  for (const p of plans) {
    for (const extra of INCLUDES[p.product] || []) {
      out.push({ ...p, id: p.id + ':' + extra, product: extra, included: true, viaProduct: p.product });
    }
  }
  return out;
}
// The plan that decides access to one brand: the strongest status, a real plan before an included one.
function bestPlan(plans, product) {
  return withIncluded(plans).filter((p) => p.product === product && p.status !== 'ended')
    .sort((a, b) => (STATUS_RANK[b.status] - STATUS_RANK[a.status]) || (Number(Boolean(a.included)) - Number(Boolean(b.included))))[0] || null;
}

// The brands this user can open, each with the people in it.
async function productsFor(user) {
  const out = { karehome: { ...brand('karehome'), people: [] }, karenest: { ...brand('karenest'), people: [] } };
  if (user.role === 'admin') {
    for (const p of await docs.find('app_plans', { status: { $ne: 'ended' } })) {
      if (out[p.product]) out[p.product].count = (out[p.product].count || 0) + 1;
    }
    return Object.values(out).map((b) => ({ ...b, status: 'active' }));
  }
  const kind = user.role === 'caregiver' ? 'caregiver' : 'family';
  const links = await linksOf(user.id, kind);
  const ids = links.map((l) => l.personId);
  const people = ids.length ? await docs.find('app_people', { id: { $in: ids } }) : [];
  const plans = await plansOfPeople(ids);
  for (const person of people) {
    if (person.active === false) continue;
    const link = links.find((l) => l.personId === person.id);
    for (const product of Object.keys(out)) {
      const plan = bestPlan(plans.filter((p) => p.personId === person.id), product);
      if (!plan) continue;
      if (kind === 'caregiver' && plan.status === 'pending') continue;
      out[product].people.push({ id: person.id, name: person.name, relation: link.relation || null, plan: planView(plan) });
    }
  }
  return Object.values(out).filter((b) => b.people.length).map((b) => {
    const best = b.people.reduce((m, p) => Math.max(m, STATUS_RANK[p.plan.status]), 0);
    const includedOnly = b.people.every((p) => p.plan.included);
    return { ...b, status: Object.keys(STATUS_RANK).find((k) => STATUS_RANK[k] === best), includedWith: includedOnly ? PRODUCTS[b.people[0].plan.viaProduct].name : null };
  });
}

function brand(id) { const p = PRODUCTS[id]; return { id, name: p.name, tagline: p.tagline }; }

function planView(p) {
  if (!p) return null;
  const own = p.planId ? planName(p.planId) : 'Plan to be confirmed';
  return {
    id: p.id, product: p.product, productName: PRODUCTS[p.product].name, planId: p.planId,
    name: p.included ? `Included with ${PRODUCTS[p.viaProduct].name}` : own,
    included: Boolean(p.included), viaProduct: p.viaProduct || null, viaName: p.included ? PRODUCTS[p.viaProduct].name : null, viaPlan: p.included ? own : null,
    status: p.status, statusName: PLAN_STATUS[p.status], startDate: p.startDate || null, endDate: p.endDate || null,
    months: p.months || null, bookingRef: p.bookingRef || null, createdAt: p.createdAt
  };
}

// Throws 404 unless this user may see this person in this brand.
async function visiblePerson(user, personId, product) {
  if (typeof personId !== 'string' || personId.length > 40) throw notFound();
  const person = await docs.findOne('app_people', { id: personId });
  if (!person) throw notFound();
  if (product && !PRODUCTS[product]) throw notFound();
  if (user.role === 'admin') return person;
  const kind = user.role === 'caregiver' ? 'caregiver' : 'family';
  const link = await docs.findOne('app_links', { userId: user.id, personId, kind });
  if (!link || person.active === false) throw notFound();
  if (!product && kind === 'caregiver') {
    const plans = await docs.find('app_plans', { personId });
    if (!plans.some((p) => p.status === 'active' || p.status === 'paused')) throw notFound();
  }
  if (product) {
    const plan = bestPlan(await docs.find('app_plans', { personId }), product);
    if (!plan || (kind === 'caregiver' && plan.status === 'pending')) throw notFound();
  }
  person.relation = link.relation || null;
  return person;
}

async function canRecord(user, personId, product) {
  if (user.role === 'admin') return true;
  if (user.role !== 'caregiver') return false;
  const plan = bestPlan(await docs.find('app_plans', { personId }), product);
  return Boolean(plan && plan.status === 'active');
}

// ---------- the person dashboard ----------
async function personView(user, person, product, period) {
  const [plans, links, readingsAll, visits] = await Promise.all([
    docs.find('app_plans', { personId: person.id }, { sort: { createdAt: -1 } }),
    docs.find('app_links', { personId: person.id }),
    docs.find('app_readings', { personId: person.id, voided: false }, { sort: { measuredAt: -1 } }),
    docs.find('app_visits', { personId: person.id }, { sort: { at: -1 }, limit: 12 })
  ]);
  const userIds = [...new Set([...links.map((l) => l.userId), ...visits.map((v) => v.by)])];
  const users = userIds.length ? await docs.find('app_users', { id: { $in: userIds } }) : [];
  const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || 'Care team';

  const latest = {};
  for (const r of readingsAll) if (!latest[r.metric]) latest[r.metric] = r;
  const days = (vitals.PERIODS[period] || vitals.PERIODS['1m'])[1];
  const from = new Date(Date.now() - days * 86400 * 1000).toISOString();
  const trend = readingsAll.filter((r) => vitals.TRENDS.includes(r.metric) && r.measuredMs >= Date.parse(from)).reverse();

  const caregivers = links.filter((l) => l.kind === 'caregiver').map((l) => {
    const u = users.find((x) => x.id === l.userId);
    return u && u.active ? { id: u.id, name: u.name, phone: user.role === 'family' ? null : u.phone } : null;
  }).filter(Boolean);
  const family = user.role === 'family' ? [] : links.filter((l) => l.kind === 'family').map((l) => {
    const u = users.find((x) => x.id === l.userId);
    return u ? { id: u.id, name: u.name, relation: l.relation, phone: u.phone, email: u.email } : null;
  }).filter(Boolean);

  const plan = product ? bestPlan(plans, product) : null;
  return {
    person: { id: person.id, name: person.name, birthYear: person.birthYear || null, sex: person.sex || null, relation: person.relation || null },
    plan: planView(plan),
    plans: user.role === 'admin' ? plans.map(planView) : undefined,
    canRecord: product ? await canRecord(user, person.id, product) : false,
    latest: Object.fromEntries(Object.entries(latest).map(([k, r]) => [k, readingOut(r)])),
    trend: trend.map(readingOut),
    period: vitals.PERIODS[period] ? period : '1m',
    visits: visits.map((v) => ({ id: v.id, at: v.at, by: nameOf(v.by), note: v.note, metrics: v.metrics || [], product: v.product })),
    caregivers, family
  };
}

function readingOut(r) {
  const o = { id: r.id, metric: r.metric, at: r.measuredAt };
  for (const k of ['value', 'systolic', 'diastolic', 'context']) if (r[k] !== undefined && r[k] !== null) o[k] = r[k];
  if (r.source === 'calculated') o.calculated = true;
  return o;
}

// A website booking or enquiry becomes "being set up" in this family's account:
// the person receiving care, the family link and a pending plan for the office to activate.
async function attachRequest(user, kind, row, personName, relation) {
  const product = productOfRequest(kind, row);
  const planId = requestPlanId(product, row);
  const person = { id: store.makeReference('P'), name: personName, active: true, createdAt: now() };
  await docs.insert('app_people', person);
  await docs.insert('app_links', { id: uid(), userId: user.id, personId: person.id, kind: 'family', relation: relation || (row.careFor === 'self' ? 'Myself' : null), createdAt: now() });
  let planRow = null;
  if (product) {
    planRow = { id: uid(), personId: person.id, product, planId, status: 'pending', bookingRef: row.reference, months: row.billing ? Number(row.billing) : null, createdAt: now() };
    await docs.insert('app_plans', planRow);
  }
  await store.update(kind === 'booking' ? 'bookings' : 'enquiries', row.id, { accountUserId: user.id, personId: person.id, appPlanId: planRow ? planRow.id : null });
  return { person, planRow, product };
}
function requestPlanId(product, row) {
  if (row.package && row.package !== 'undecided') return row.package;
  if (product !== 'karenest') return null;
  if (row.plan && PRODUCTS.karenest.plans.includes(row.plan)) return row.plan; // the package named on the website
  return null; // day visit, community or "help me choose": the office picks the plan when activating
}

// Plans a family can choose in the app: every package of each brand with what is included and its prices
async function planChoices() {
  const list = await packinfo.all();
  const fmt = (n) => '₹' + Number(n).toLocaleString('en-IN');
  return Object.values(PRODUCTS).map((pr) => ({
    ...brand(pr.id),
    plans: pr.plans.map((id) => {
      const pk = list.find((x) => x.id === id);
      if (!pk) return { id, name: planName(id), price: null };
      const price = pk.model === 'tiers' || pk.model === 'monthly' ? 'from ' + fmt(Math.min(...Object.values(pk.prices).map((x) => x.perMonth))) + ' a month'
        : pk.model === 'fixed' ? fmt(pk.price) + ' ' + pk.length : null;
      return { ...pk, price };
    })
  }));
}

// ================================================================================================
// The dashboard (one page per person, across Kare@Home and KareNest)

const RECORD_CATEGORIES = { cardiac: 'Cardiac', sugar: 'Blood Sugar', general: 'General', imaging: 'Imaging', prescription: 'Prescriptions', others: 'Others' };
const historyAllowed = (user) => user.role === 'admin' || user.role === 'family';

// Office and assigned caregivers may enter readings, risk scores and records
async function careTeam(user, personId) {
  if (user.role === 'admin') return true;
  if (user.role !== 'caregiver') return false;
  return Boolean(await docs.findOne('app_links', { userId: user.id, personId, kind: 'caregiver' }));
}

// The brand a visit or booking belongs to: the person's own active plan first (KareNest before
// the Kare@Home it includes), else any plan.
function productOf(plans) {
  const live = plans.filter((p) => p.status === 'active' || p.status === 'paused');
  const pick = live.find((p) => p.product === 'karenest') || live[0] || plans.find((p) => p.status !== 'ended') || plans[0];
  return pick ? pick.product : 'karehome';
}

async function peopleFor(user) {
  let links = [];
  let people;
  if (user.role === 'admin') {
    people = await docs.find('app_people', { active: { $ne: false } }, { sort: { name: 1 } });
  } else {
    const kind = user.role === 'caregiver' ? 'caregiver' : 'family';
    links = await linksOf(user.id, kind);
    const ids = links.map((l) => l.personId);
    people = ids.length ? (await docs.find('app_people', { id: { $in: ids } }, { sort: { name: 1 } })).filter((x) => x.active !== false) : [];
  }
  const plans = await plansOfPeople(people.map((x) => x.id));
  const out = [];
  for (const x of people) {
    const mine = plans.filter((pl) => pl.personId === x.id);
    const open = mine.filter((pl) => pl.status !== 'ended');
    if (user.role === 'caregiver' && !open.some((pl) => pl.status === 'active')) continue;
    if (user.role === 'admin' && !open.length) continue;
    const link = links.find((l) => l.personId === x.id);
    out.push({
      id: x.id, name: x.name, relation: link ? link.relation || null : null,
      plans: open.map(planView), product: productOf(open),
      status: open.some((pl) => pl.status === 'active') ? 'active' : open.some((pl) => pl.status === 'paused') ? 'paused' : open.length ? 'pending' : 'none'
    });
  }
  return out;
}

const fmtDay = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric' });
const fmtDayTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const fmtShortDay = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' });
const istDate = (ms) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(ms));

// ?period=7d|1m|6m|1y, or ?from=YYYY-MM-DD&to=YYYY-MM-DD (the calendar), at most 2 years
function rangeOf(url) {
  const from = url.searchParams.get('from'), to = url.searchParams.get('to');
  const iso = /^\d{4}-\d{2}-\d{2}$/;
  if (from && to && iso.test(from) && iso.test(to) && from <= to) {
    const fromMs = Date.parse(from + 'T00:00:00+05:30'), toMs = Math.min(Date.now(), Date.parse(to + 'T23:59:59+05:30'));
    if (toMs - fromMs <= 731 * 86400000) return { key: 'custom', label: `${fmtDay.format(new Date(fromMs))} to ${fmtDay.format(new Date(toMs))}`, fromMs, toMs, from, to: istDate(toMs) };
  }
  const key = vitals.PERIODS[url.searchParams.get('period')] ? url.searchParams.get('period') : '7d';
  const toMs = Date.now(), fromMs = toMs - vitals.PERIODS[key][1] * 86400000;
  return { key, label: vitals.PERIODS[key][0], fromMs, toMs, from: istDate(fromMs), to: istDate(toMs) };
}

const ageOf = (person) => (person.birthYear ? new Date().getFullYear() - person.birthYear : null);
const valueText = (metric, r) => (metric === 'bp' ? `${r.systolic}/${r.diastolic}` : String(r.value));

async function dashboardData(user, person, range) {
  const [plans, readingsAll, visits, risks] = await Promise.all([
    docs.find('app_plans', { personId: person.id }, { sort: { createdAt: -1 } }),
    docs.find('app_readings', { personId: person.id, voided: false }, { sort: { measuredAt: -1 } }),
    docs.find('app_visits', { personId: person.id }, { sort: { at: -1 }, limit: 60 }),
    docs.find('app_risks', { personId: person.id }, { sort: { at: -1 } })
  ]);
  const sex = person.sex || null;
  const byIds = [...new Set([...visits.map((v) => v.by), ...risks.map((r) => r.enteredBy)])];
  const users = byIds.length ? await docs.find('app_users', { id: { $in: byIds } }) : [];
  const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || 'Care team';

  // latest of each reading, with its status against the standard range
  const latest = {};
  for (const r of readingsAll) if (!latest[r.metric]) latest[r.metric] = r;
  const latestOut = Object.keys(latest).filter((k) => vitals.METRICS[k]).map((k) => {
    const r = latest[k];
    const c = vitals.classify(k, r, sex);
    return { metric: k, label: vitals.METRICS[k].label, unit: vitals.METRICS[k].unit, value: valueText(k, r), context: r.context || null, at: r.measuredAt, level: c.level, status: c.label, range: c.range, group: vitals.METRICS[k].group || 'vitals' };
  });
  const order = [...vitals.CARDS, 'height', ...vitals.BODY];
  latestOut.sort((a, b) => order.indexOf(a.metric) - order.indexOf(b.metric));

  // each metric in the chosen period, oldest first, with an average and its status
  const inRange = readingsAll.filter((r) => r.measuredMs >= range.fromMs && r.measuredMs <= range.toMs).reverse();
  const series = [];
  for (const k of vitals.TRENDS) {
    const rows = inRange.filter((r) => r.metric === k);
    if (!rows.length) continue;
    const m = vitals.METRICS[k];
    const keys = m.series.map((s) => s[0]);
    const avg = {};
    for (const key of keys) { const v = rows.map((r) => r[key]).filter((x) => x != null); avg[key] = v.reduce((a, b) => a + b, 0) / v.length; }
    let avgFor = avg;
    if (k === 'glucose') {
      const fasting = rows.filter((r) => r.context === 'fasting');
      const use = fasting.length ? fasting : rows;
      avgFor = { value: use.reduce((a, r) => a + r.value, 0) / use.length, context: fasting.length ? 'fasting' : 'post_meal' };
    }
    const rounded = Object.fromEntries(Object.entries(avgFor).map(([a, b]) => [a, typeof b === 'number' ? Math.round(b * (k === 'bp' || k === 'hr' || k === 'spo2' ? 1 : 10)) / (k === 'bp' || k === 'hr' || k === 'spo2' ? 1 : 10) : b]));
    const c = vitals.classify(k, rounded, sex);
    series.push({
      metric: k, label: m.label, unit: m.unit, names: m.series.map((s) => s[1]), keys, group: m.group || 'vitals',
      average: k === 'bp' ? `${rounded.systolic}/${rounded.diastolic}` : String(rounded.value), averageNote: k === 'glucose' ? (avgFor.context === 'fasting' ? 'fasting readings' : 'all readings') : null,
      level: c.level, status: c.label, range: c.range,
      rows: rows.map((r) => {
        const rc = vitals.classify(k, r, sex);
        const o = { id: r.id, at: r.measuredAt, ms: r.measuredMs, level: rc.level };
        for (const key of keys) o[key] = r[key];
        if (r.context) o.context = r.context;
        return o;
      })
    });
  }

  // risk scores: the latest of each test, plus BMI from the latest weight and height
  const riskLatest = [];
  const seen = new Set();
  for (const r of risks) {
    if (seen.has(r.test)) continue;
    seen.add(r.test);
    const t = risk.TESTS.find((x) => x.id === r.test);
    if (!t) continue;
    riskLatest.push({ id: r.id, test: r.test, group: t.group, groupName: risk.GROUPS[t.group], title: t.title, value: r.value, display: r.display, level: r.level, band: r.band, note: r.note || null, scale: r.scale || '', at: r.at, by: nameOf(r.enteredBy) });
  }
  if (latest.bmi) {
    const b = risk.bmiRisk(latest.bmi.value);
    riskLatest.push({ id: 'bmi', test: 'bmi', group: 'weight', groupName: risk.GROUPS.weight, title: 'Obesity (Body Mass Index)', ...b, note: null, at: latest.bmi.measuredAt, by: 'From the latest weight and height' });
  }
  const groupOrder = Object.keys(risk.GROUPS);
  riskLatest.sort((a, b) => groupOrder.indexOf(a.group) - groupOrder.indexOf(b.group));

  // the latest wellbeing checks (food, toilet, sleep...) and notes from visits
  const lastObs = visits.find((v) => v.obs && Object.keys(v.obs).length);
  const obs = lastObs ? {
    at: lastObs.at, by: nameOf(lastObs.by), flags: vitals.obsFlags(lastObs.obs),
    groups: vitals.OBS_GROUPS.map(([title, keys]) => ({ title, items: keys.filter((k) => lastObs.obs[k] !== undefined).map((k) => ({ k, label: vitals.OBS[k].label, text: vitals.obsText(k, lastObs.obs[k]), flag: vitals.obsFlags({ [k]: lastObs.obs[k] }).length > 0 })) })).filter((g) => g.items.length)
  } : null;
  const open = plans.filter((pl) => pl.status !== 'ended');
  return {
    person: { id: person.id, name: person.name, birthYear: person.birthYear || null, age: ageOf(person), sex, smoker: person.smoker ?? null, parentalMI: person.parentalMI ?? null, diabetic: person.diabetic ?? null, relation: person.relation || null },
    plans: open.map(planView), product: productOf(open),
    range: { key: range.key, label: range.label, from: range.from, to: range.to },
    latest: latestOut, series, risks: riskLatest, obs,
    notes: visits.filter((v) => v.note).slice(0, 8).map((v) => ({ at: v.at, by: nameOf(v.by), note: v.note, product: v.product })),
    lastVisit: visits[0] ? { at: visits[0].at, by: nameOf(visits[0].by) } : null,
    canRecord: await careTeam(user, person.id) && open.some((pl) => pl.status === 'active'),
    canAssess: await careTeam(user, person.id)
  };
}

const fmtRowTime = new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hour12: true });
function reportInput(d, range, user) {
  const day = (iso) => fmtDayTime.format(new Date(iso)).replace('Sept', 'Sep');
  const row = (iso) => fmtRowTime.format(new Date(iso)).replace('Sept', 'Sep');
  const textOf = (m, r) => (m.metric === 'bp' ? `${r.systolic}/${r.diastolic}` : String(r.value)) + (r.context ? ' ' + (vitals.GLUCOSE_CONTEXTS[r.context] || '').toLowerCase() : '');
  return {
    person: { id: d.person.id, name: d.person.name, age: d.person.age, sexName: d.person.sex === 'male' ? 'Male' : d.person.sex === 'female' ? 'Female' : null },
    plans: d.plans.map((p) => (p.included ? p.productName + ' (included)' : p.name)).join(', '),
    periodLabel: range.label, from: fmtDay.format(new Date(range.fromMs)), to: fmtDay.format(new Date(range.toMs)), fromMs: range.fromMs, toMs: range.toMs,
    createdAt: fmtDayTime.format(new Date()), createdBy: user.name,
    fmtShort: (ms) => fmtShortDay.format(new Date(ms)),
    latest: d.latest.map((r) => ({ label: r.label, value: r.value + (r.unit ? ' ' + r.unit : ''), level: r.level, status: r.status, range: r.range, at: day(r.at) })),
    risks: d.risks.map((r) => ({ title: r.title, display: r.display, band: r.band, level: r.level, scale: r.scale, at: fmtDay.format(new Date(r.at)) })),
    series: d.series.map((m) => ({
      label: m.label, unit: m.unit, average: m.average, status: m.status, level: m.level, series: m.keys, names: m.names,
      rows: m.rows.map((r) => ({ ...r, at: row(r.at), text: textOf(m, r) }))
    })),
    notes: d.notes.map((v) => ({ at: day(v.at), by: v.by, note: v.note }))
  };
}

async function riskPrefill(person) {
  const rows = await docs.find('app_readings', { personId: person.id, voided: false, metric: { $in: ['bp', 'chol', 'bmi'] } }, { sort: { measuredAt: -1 } });
  const last = (m) => rows.find((r) => r.metric === m);
  const yn = (v) => (v === true ? 'yes' : v === false ? 'no' : undefined);
  return {
    sex: person.sex || undefined, age: ageOf(person) || undefined,
    sbp: last('bp') ? last('bp').systolic : undefined, chol: last('chol') ? last('chol').value : undefined, bmi: last('bmi') ? last('bmi').value : undefined,
    smoker: yn(person.smoker), parentalMI: yn(person.parentalMI), diabetic: yn(person.diabetic)
  };
}

// The year a plan's free sessions belong to: from its start date, in 12-month steps
function planYear(plan) {
  if (!plan.startDate) return null;
  let start = plan.startDate;
  const today = todayIST();
  while (addMonths(start, 12) < today) { const n = addMonths(start, 12); start = new Date(Date.parse(n + 'T00:00:00Z') + 86400000).toISOString().slice(0, 10); }
  return { start, end: addMonths(start, 12) };
}

async function packageData(person) {
  const plans = (await docs.find('app_plans', { personId: person.id }, { sort: { createdAt: -1 } })).filter((pl) => pl.status !== 'ended');
  const catalogList = await packinfo.all();
  const out = [];
  for (const pl of plans) {
    const pk = catalogList.find((x) => x.id === pl.planId) || null;
    const charge = packinfo.priceOf(pk, pl.months);
    out.push({
      ...planView(pl), group: pk ? pk.group : care.groupOf(pl.planId), charge,
      tagline: pk ? pk.tagline : '', listTitle: pk ? pk.listTitle : '', includes: pk ? pk.includes : [], notes: pk ? pk.notes : [], best: pk ? pk.best : null,
      monitoring: care.monitoringFor(pl.planId), freeSessions: care.FREE[pl.planId] || 0, discount: care.DISCOUNT[pl.planId] || 0
    });
  }
  // KareNest residents also get Kare@Home
  const included = withIncluded(plans).filter((pl) => pl.included).map(planView);
  const main = out.find((pl) => pl.status === 'active') || out[0] || null;
  const paid = out.filter((pl) => pl.status === 'active' || pl.status === 'paused').reduce((s, pl) => s + (pl.charge.amount || 0), 0);
  return { person: { id: person.id, name: person.name }, plans: out, included, catalog: catalogList, groupOrder: packinfo.GROUP_ORDER, periods: packinfo.PERIOD, summary: main ? { startDate: main.startDate, endDate: main.endDate, paid, paidText: paid ? care.fmt(paid) : null, activatedAt: main.startDate } : null };
}

async function servicesData(user, person) {
  const plans = (await docs.find('app_plans', { personId: person.id }, { sort: { createdAt: -1 } })).filter((pl) => pl.status !== 'ended');
  const tier = plans.find((pl) => care.FREE[pl.planId] && (pl.status === 'active' || pl.status === 'paused'));
  const nest = plans.some((pl) => pl.product === 'karenest' && pl.status !== 'pending');
  const bookings = (await docs.find('enquiries', { personId: person.id, kind: 'service' }, { sort: { createdAt: -1 } }));
  let free = null;
  if (tier) {
    const year = planYear(tier);
    const used = bookings.filter((b) => b.free && year && b.createdAt.slice(0, 10) >= year.start && b.createdAt.slice(0, 10) <= year.end).length;
    const total = care.FREE[tier.planId];
    free = { total, used, left: Math.max(0, total - used), plan: planName(tier.planId), until: year ? year.end : null };
  }
  const discount = tier ? care.DISCOUNT[tier.planId] : 0;
  const item = (id) => ({ id, name: care.SERVICES[id].name, text: care.SERVICES[id].text, free: Boolean(care.SERVICES[id].free && free) });
  const included = free ? ['bystander', 'physiotherapy'].map(item) : [];
  const additional = ['teleconsultation', 'spongebath', 'blood-collection', 'dressing', ...(free ? [] : ['bystander', 'physiotherapy']), ...(nest ? ['family-visit'] : [])].map((id) => ({ ...item(id), free: false }));
  const names = { new: 'Sent', contacted: 'We are on it', scheduled: 'Arranged', closed: 'Done' };
  const list = bookings.slice(0, 20).map((b) => ({ reference: b.reference, service: b.service, name: (care.SERVICES[b.service] || {}).name || 'Service', free: Boolean(b.free), date: b.date || null, time: b.time ? catalog.timeSlots[b.time] : null, status: b.status || 'new', statusName: names[b.status] || 'Sent', createdAt: b.createdAt }));
  return { person: { id: person.id, name: person.name }, product: productOf(plans), free, discount, included, additional, last: list[0] || null, bookings: list, canBook: user.role !== 'caregiver' && plans.some((pl) => pl.status === 'active' || pl.status === 'paused') };
}

async function invoicesData(person) {
  const plans = (await docs.find('app_plans', { personId: person.id }, { sort: { createdAt: -1 } })).filter((pl) => pl.status !== 'pending');
  const rows = [];
  for (const pl of plans) {
    const charge = await care.chargeOf(pl);
    rows.push({
      number: 'KQ-' + (pl.startDate || pl.createdAt.slice(0, 10)).replace(/-/g, '') + '-' + pl.id.replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase(),
      date: pl.startDate || pl.createdAt.slice(0, 10), plan: planName(pl.planId), productName: PRODUCTS[pl.product].name,
      period: pl.startDate ? { from: pl.startDate, to: pl.endDate } : null, months: pl.months || null,
      amount: charge.amount, amountText: charge.amount ? care.fmt(charge.amount) : null, description: charge.text, gst: charge.gst || null, status: pl.status, statusName: PLAN_STATUS[pl.status]
    });
  }
  const total = rows.reduce((s, r) => s + (r.amount || 0), 0);
  return { person: { id: person.id, name: person.name }, rows, total, totalText: total ? care.fmt(total) : null };
}

// ---------- helpers for links in messages ----------
function appUrl(req, isHttps) {
  if (process.env.APP_URL) return process.env.APP_URL.replace(/\/+$/, '');
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
  return `${isHttps(req) ? 'https' : 'http'}://${host}/app`;
}

function welcomeText(user, link, products) {
  const brands = products && products.length ? products.join(' and ') : 'KareIQ';
  return `Hello ${user.name.split(' ')[0]}, welcome to ${brands}! Open this link to set your password and see your family's care updates: ${link} (the link works once and expires in 7 days).`;
}

// Counts failed sign-ins (in memory, per server).
const failures = {
  map: new Map(),
  recent(k) { const t = Date.now(); const list = (this.map.get(k) || []).filter((x) => t - x < 600000); this.map.set(k, list); return list; },
  over(k, max) { return this.recent(k).length >= max; },
  add(k) { this.recent(k).push(Date.now()); if (this.map.size > 5000) this.map.clear(); }
};

// ================================================================================================
function createAppApi({ json, readJson, limited, isHttps, clientIp }) {
  const clientKey = (req) => (clientIp ? clientIp(req) : req.socket.remoteAddress);

  function setCookie(res, value, req, maxAge) {
    res.setHeader('Set-Cookie', auth.cookieHeader(value, isHttps(req), maxAge));
  }

  async function signIn(req, res, user) {
    const { token, maxAgeSec } = await auth.startSession(user.id);
    await docs.update('app_users', user.id, { lastLoginAt: now() });
    setCookie(res, token, req, maxAgeSec);
  }

  // Sign-in from another website (the KareNest popup): instead of a cookie the browser could
  // not keep across sites, answer with a one-time link (2 minutes). Opening it on this server
  // signs the person in here and continues to `next` inside the app.
  function apiBase(req) {
    if (process.env.OAUTH_REDIRECT_BASE) return process.env.OAUTH_REDIRECT_BASE.replace(/\/+$/, '');
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000').split(',')[0].trim();
    return `${isHttps(req) ? 'https' : 'http'}://${host}`;
  }
  async function handoff(req, user, next) {
    if (auth.STATELESS) return `${apiBase(req)}/api/app/handoff?t=${auth.sign({ h: user.id, n: safeNext(next), c: Date.now() })}`;
    const t = crypto.randomBytes(32).toString('base64url');
    await docs.removeWhere('app_handoff', { createdAt: { $lt: Date.now() - 120000 } }).catch(() => {});
    await docs.insert('app_handoff', { id: auth.sha(t), userId: user.id, next: safeNext(next), createdAt: Date.now() });
    return `${apiBase(req)}/api/app/handoff?t=${t}`;
  }

  async function me(user, session) {
    const products = await productsFor(user);
    return {
      ok: true, signedIn: true, csrf: session.csrf,
      user: publicUser(user), products,
      mail: mailReady
    };
  }

  async function findUserByLogin(id) {
    const v = clean(id, 120);
    if (!v) return null;
    if (v.toLowerCase() === 'admin') return docs.findOne('app_users', { email: adminEmail() });
    if (v.includes('@')) return docs.findOne('app_users', { email: v.toLowerCase() });
    const phone = normalisePhone(v);
    return phone ? docs.findOne('app_users', { phone }) : null;
  }

  async function findRequest(reference) {
    const ref = clean(reference, 20).toUpperCase().replace(/\s+/g, '');
    if (!/^(KH|KQ)-[A-Z0-9]{6}$/.test(ref)) return null;
    const kind = ref.startsWith('KH') ? 'booking' : 'enquiry';
    const row = await docs.findOne(kind === 'booking' ? 'bookings' : 'enquiries', { reference: ref });
    return row ? { kind, row } : null;
  }

  // ---------------------------------------------------------------- public (signed-out) actions
  async function publicRoute(req, res, p, url) {
    if (p === 'session' && req.method === 'GET') return null; // handled by caller
    if (req.method === 'POST' && req.headers['x-requested-with'] !== 'kareiq') return json(res, 400, { ok: false, message: 'Please use the KareIQ app page.' });

    if (p === 'login' && req.method === 'POST') {
      const body = await readJson(req);
      const who = clean(body.id, 120).toLowerCase();
      // only wrong passwords count: 20 per device and 10 per account in 10 minutes
      if (failures.over('ip:' + clientKey(req), 20) || failures.over('id:' + who, 10)) return json(res, 429, { ok: false, message: 'Too many tries. Please wait a few minutes, or tap "Forgot password".' });
      const user = await findUserByLogin(body.id);
      const ok = user && user.active && user.passwordHash && auth.checkPassword(String(body.password || ''), user.passwordHash);
      if (!ok) {
        failures.add('ip:' + clientKey(req)); failures.add('id:' + who);
        if (user && user.active && !user.passwordHash) return json(res, 401, { ok: false, needsSetup: true, message: 'Your account is ready but has no password yet. Open the welcome link we sent you, or tap "Forgot password" to get a new one.' });
        await new Promise((r) => setTimeout(r, 350));
        return json(res, 401, { ok: false, message: 'That email/mobile number and password do not match. Check for typos, or tap "Forgot password".' });
      }
      if (body.handoff) {
        await audit(user.id, 'signin');
        return json(res, 200, { ok: true, go: await handoff(req, user, body.next) });
      }
      await signIn(req, res, user);
      await audit(user.id, 'signin');
      return json(res, 200, { ok: true });
    }

    if (p === 'link' && req.method === 'GET') {
      const found = await auth.readLink(url.searchParams.get('token'));
      if (!found) return json(res, 404, { ok: false, message: 'This link has expired or was already used. Ask us for a new one, or tap "Forgot password".' });
      return json(res, 200, { ok: true, purpose: found.row.purpose, name: found.user.name, login: found.user.email || found.user.phone });
    }

    if (p === 'link' && req.method === 'POST') {
      if (limited(req, 'app-link')) return json(res, 429, { ok: false, message: 'Too many tries. Please wait a few minutes.' });
      const body = await readJson(req);
      const found = await auth.readLink(body.token);
      if (!found) return json(res, 404, { ok: false, message: 'This link has expired or was already used. Ask us for a new one.' });
      const problem = auth.passwordProblem(body.password);
      if (problem) return json(res, 400, { ok: false, message: problem, errors: { password: problem } });
      await docs.update('app_users', found.user.id, { passwordHash: auth.hashPassword(body.password), passwordSetAt: now() });
      await auth.useLink(found.row);
      await auth.endAllSessions(found.user.id);
      await signIn(req, res, found.user);
      await audit(found.user.id, found.row.purpose === 'setup' ? 'password.set' : 'password.reset');
      return json(res, 200, { ok: true });
    }

    if (p === 'forgot' && req.method === 'POST') {
      if (limited(req, 'app-forgot')) return json(res, 429, { ok: false, message: 'Too many tries. Please wait a few minutes, or message us on WhatsApp.' });
      const body = await readJson(req);
      const user = await findUserByLogin(body.id);
      let emailed = false;
      if (user && user.active) {
        if (user.email && mailReady) {
          const { token } = await auth.makeLink(user.id, user.passwordHash ? 'reset' : 'setup');
          const link = `${appUrl(req, isHttps)}/#/link/${token}`;
          emailed = await sendMail(user.email, 'Your KareIQ sign-in link', `Hello ${user.name},\n\nOpen this link to choose a new password:\n${link}\n\nIt works once and expires in 24 hours. If you did not ask for this, you can ignore this email.\n\nKareIQ`);
        }
        if (!emailed) {
          await store.add('enquiries', 'KQ', {
            name: user.name, phone: user.phone || '', email: user.email || '', interest: 'app-signin-help', interestName: REQUEST_KINDS['signin-help'],
            message: 'Asked for a new sign-in link from the app.', source: 'app', product: null, userId: user.id, kind: 'signin-help'
          });
        }
        await audit(user.id, 'password.help');
      }
      return json(res, 200, { ok: true, message: emailed
        ? 'Done. If this matches an account, a sign-in link is on its way to your email.'
        : 'Thank you. If this matches an account, our team will send you a new sign-in link on WhatsApp shortly.' });
    }

    // Anyone can create a family account, then choose a plan inside the app.
    // The mobile number is not checked by SMS, so the office confirms it on the welcome call
    // before a plan from someone else's booking can be attached to this account (see activate).
    if (p === 'signup' && req.method === 'POST') {
      if (limited(req, 'app-signup')) return json(res, 429, { ok: false, message: 'Too many tries. Please wait a few minutes, or message us on WhatsApp.' });
      const body = await readJson(req);
      const name = clean(body.name, 80);
      const phone = normalisePhone(body.phone);
      const email = cleanEmail(body.email || '');
      const errors = {};
      if (name.length < 2) errors.name = 'Please enter your name.';
      if (!phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
      if (email && !validEmail(email)) errors.email = 'This email address looks incomplete.';
      const problem = auth.passwordProblem(body.password);
      if (problem) errors.password = problem;
      if (phone && await docs.findOne('app_users', { phone })) errors.phone = 'This number already has an account. Sign in, or tap "Forgot password".';
      if (email && await docs.findOne('app_users', { email })) errors.email = 'This email already has an account. Sign in, or tap "Forgot password".';
      if (Object.keys(errors).length) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors });
      const user = { id: uid(), name, email: email || null, phone, role: 'family', passwordHash: auth.hashPassword(body.password), active: true, selfSignup: true, verified: false, createdAt: now(), passwordSetAt: now() };
      await docs.insert('app_users', user);
      await audit(user.id, 'account.signup');
      if (body.handoff) return json(res, 201, { ok: true, go: await handoff(req, user, body.next) });
      await signIn(req, res, user);
      return json(res, 201, { ok: true });
    }

    // Create an account from a website booking: reference + the mobile number used to book.
    if (p === 'start' && req.method === 'POST') {
      if (limited(req, 'app-start')) return json(res, 429, { ok: false, message: 'Too many tries. Please wait a few minutes, or message us on WhatsApp.' });
      const body = await readJson(req);
      const found = await findRequest(body.reference);
      const phone = normalisePhone(body.phone);
      if (!found || !phone || found.row.phone !== phone) {
        await new Promise((r) => setTimeout(r, 300));
        return json(res, 404, { ok: false, message: 'We could not find a booking with that reference and mobile number. The reference is on your booking confirmation (it looks like KH-7F3K2Q).' });
      }
      const { kind, row } = found;
      const product = productOfRequest(kind, row);
      const existing = await docs.findOne('app_users', { phone }) || (row.email ? await docs.findOne('app_users', { email: row.email.toLowerCase() }) : null);
      if (existing && existing.passwordHash) return json(res, 409, { ok: false, exists: true, message: 'You already have a KareIQ account. Sign in, then tap "Add a plan or booking" and enter ' + row.reference + '.' });
      const planId = requestPlanId(product, row);
      const info = {
        ok: true, reference: row.reference, product, productName: product ? PRODUCTS[product].name : 'KareIQ',
        name: row.name, email: row.email || '', planName: planId ? planName(planId) : null,
        careFor: row.careFor || null, claimed: Boolean(row.accountUserId)
      };
      if (body.check) return json(res, 200, info);

      if (row.accountUserId && !(existing && existing.id === row.accountUserId)) return json(res, 409, { ok: false, message: 'An account was already created for this booking. Please sign in, or tap "Forgot password".' });
      const name = clean(body.name, 80) || row.name;
      const email = cleanEmail(body.email || row.email || '');
      const personName = clean(body.personName, 80);
      const relation = clean(body.relation, RELATIONS_MAX);
      const errors = {};
      if (name.length < 2) errors.name = 'Please enter your name.';
      if (email && !validEmail(email)) errors.email = 'This email address looks incomplete.';
      if (personName.length < 2) errors.personName = row.careFor === 'self' ? 'Please enter your name as it should appear on care records.' : 'Please enter the name of the person receiving care.';
      const problem = auth.passwordProblem(body.password);
      if (problem) errors.password = problem;
      if (email && (await docs.findOne('app_users', { email })) && !(existing && existing.email === email)) errors.email = 'This email already has an account. Please sign in instead.';
      if (Object.keys(errors).length) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors });

      let user = existing;
      if (user) {
        await docs.update('app_users', user.id, { name, email: email || user.email || null, passwordHash: auth.hashPassword(body.password), passwordSetAt: now() });
        user = await docs.findOne('app_users', { id: user.id });
      } else {
        user = { id: uid(), name, email: email || null, phone, role: 'family', passwordHash: auth.hashPassword(body.password), active: true, createdAt: now(), passwordSetAt: now() };
        await docs.insert('app_users', user);
      }
      const { person } = await attachRequest(user, kind, row, personName, relation);
      await audit(user.id, 'account.created-from-booking', person.id, { reference: row.reference });
      await signIn(req, res, user);
      return json(res, 201, { ok: true, product });
    }

    return undefined;
  }

  // ---------------------------------------------------------------- signed-in actions
  async function signedInRoute(req, res, parts, url, user, session) {
    const p = parts.join('/');
    const product = url.searchParams.get('product') || undefined;
    const body = req.method === 'GET' ? {} : await readJson(req);

    if (p === 'logout' && req.method === 'POST') {
      await auth.endSession(req);
      setCookie(res, '', req, 0);
      return json(res, 200, { ok: true });
    }
    // public demo site: the shared demo logins keep their details so the next visitor can sign in too
    if ((p === 'password' || p === 'profile') && req.method === 'POST' && demoLocked(user)) return json(res, 403, { ok: false, message: DEMO_LOCKED });
    if (p === 'password' && req.method === 'POST') {
      if (!auth.checkPassword(String(body.current || ''), user.passwordHash)) return json(res, 400, { ok: false, message: 'Your current password is not right.', errors: { current: 'Not right' } });
      const problem = auth.passwordProblem(body.next);
      if (problem) return json(res, 400, { ok: false, message: problem, errors: { next: problem } });
      await docs.update('app_users', user.id, { passwordHash: auth.hashPassword(body.next), passwordSetAt: now() });
      await auth.endAllSessions(user.id, session.id);
      await audit(user.id, 'password.changed');
      return json(res, 200, { ok: true, message: 'Password changed. Other devices have been signed out.' });
    }
    if (p === 'profile' && req.method === 'POST') {
      const name = clean(body.name, 80);
      const email = cleanEmail(body.email || '');
      const errors = {};
      if (name.length < 2) errors.name = 'Please enter your name.';
      if (email && !validEmail(email)) errors.email = 'This email address looks incomplete.';
      if (email && email !== user.email && await docs.findOne('app_users', { email })) errors.email = 'This email is used by another account.';
      if (Object.keys(errors).length) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors });
      await docs.update('app_users', user.id, { name, email: email || null });
      return json(res, 200, { ok: true });
    }

    // brand home: people in this brand for this user
    if (parts[0] === 'home' && req.method === 'GET') {
      if (!PRODUCTS[product]) throw notFound();
      let mine = (await productsFor(user)).find((b) => b.id === product);
      if (user.role === 'admin') {
        const plans = withIncluded(await docs.find('app_plans', { status: { $ne: 'ended' } })).filter((pl) => pl.product === product);
        const ppl = plans.length ? await docs.find('app_people', { id: { $in: [...new Set(plans.map((x) => x.personId))] } }, { sort: { name: 1 } }) : [];
        mine = { people: ppl.map((x) => ({ id: x.id, name: x.name, relation: null, plan: planView(bestPlan(plans.filter((pl) => pl.personId === x.id), product)) })) };
      }
      if (!mine) throw notFound();
      const ids = mine.people.map((x) => x.id);
      const [visits, latest] = await Promise.all([
        ids.length ? docs.find('app_visits', { personId: { $in: ids } }, { sort: { at: -1 }, limit: 50 }) : [],
        ids.length ? docs.find('app_readings', { personId: { $in: ids }, voided: false }, { sort: { measuredAt: -1 }, limit: 400 }) : []
      ]);
      const people = mine.people.map((x) => ({
        ...x,
        lastVisit: (visits.find((v) => v.personId === x.id) || {}).at || null,
        lastBp: historyAllowed(user) ? readingOutOrNull(latest.find((r) => r.personId === x.id && r.metric === 'bp')) : null
      }));
      return json(res, 200, { ok: true, product: brand(product), people });
    }

    if (parts[0] === 'people' && parts[1] && parts.length === 2 && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1], product);
      const view = await personView(user, person, product, url.searchParams.get('period') || '1m');
      if (!historyAllowed(user)) Object.assign(view, { latest: {}, trend: [], visits: [] }); // health history: family and office only
      return json(res, 200, { ok: true, ...view });
    }

    if (parts[0] === 'people' && parts[2] === 'visits' && req.method === 'POST') {
      const person = await visiblePerson(user, parts[1], PRODUCTS[product] ? product : undefined);
      const prod = PRODUCTS[product] ? product : productOf((await docs.find('app_plans', { personId: person.id })).filter((pl) => pl.status !== 'ended'));
      if (!(await canRecord(user, person.id, prod))) throw forbidden();
      const last = (await docs.find('app_readings', { personId: person.id, metric: 'height', voided: false }, { sort: { measuredAt: -1 }, limit: 1 }))[0];
      const parsed = vitals.parseVisit(body, last ? last.value : null);
      if (parsed.errors) return json(res, 400, { ok: false, message: parsed.errors.form || 'Please check the highlighted fields.', errors: parsed.errors });
      const visitId = uid();
      const at = parsed.when;
      for (const r of parsed.readings) {
        const { calculated, ...data } = r;
        await docs.insert('app_readings', {
          id: uid(), personId: person.id, product: prod, ...data, measuredAt: new Date(at).toISOString(), measuredMs: Date.parse(at),
          source: calculated ? 'calculated' : 'caregiver_visit', enteredBy: user.id, enteredAt: now(), visitId, voided: false
        });
      }
      const metrics = [...new Set(parsed.readings.map((r) => r.metric))];
      await docs.insert('app_visits', { id: visitId, personId: person.id, product: prod, by: user.id, at: new Date(at).toISOString(), note: parsed.note, metrics, obs: parsed.obs, createdAt: now() });
      await audit(user.id, 'visit.save', person.id, { metrics, product: prod });
      return json(res, 201, { ok: true, saved: metrics });
    }

    if (parts[0] === 'readings' && parts[2] === 'remove' && req.method === 'POST') {
      const r = await docs.findOne('app_readings', { id: String(parts[1]) });
      if (!r || r.voided) throw notFound();
      await visiblePerson(user, r.personId, r.product);
      if (user.role !== 'admin' && !(user.role === 'caregiver' && r.enteredBy === user.id)) throw forbidden();
      const reason = clean(body.reason, 300);
      if (reason.length < 3) return json(res, 400, { ok: false, message: 'Please say why this reading is wrong.', errors: { reason: 'Required' } });
      await docs.update('app_readings', r.id, { voided: true, voidReason: reason, voidedBy: user.id, voidedAt: now() });
      await audit(user.id, 'reading.remove', r.personId, { metric: r.metric, reason });
      return json(res, 200, { ok: true });
    }

    // recent readings a caregiver may correct
    if (parts[0] === 'people' && parts[2] === 'recent' && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1], product);
      let rows = await docs.find('app_readings', { personId: person.id, voided: false }, { sort: { measuredAt: -1 }, limit: 60 });
      if (!historyAllowed(user)) rows = rows.filter((r) => r.enteredBy === user.id && Date.now() - Date.parse(r.enteredAt) < 86400000);
      return json(res, 200, { ok: true, rows: rows.filter((r) => r.source !== 'calculated').slice(0, 20).map((r) => ({ ...readingOut(r), mine: r.enteredBy === user.id || user.role === 'admin' })) });
    }

    // ================================================================ the dashboard (all brands)
    // People this user can open: family -> their relatives, caregiver -> assigned people with an
    // active plan, office -> everyone with a plan.
    if (p === 'people' && req.method === 'GET') {
      return json(res, 200, { ok: true, people: await peopleFor(user) });
    }

    // Health history (readings, trends, risk scores, notes): office and family only.
    if (parts[0] === 'people' && parts[2] === 'dashboard' && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1]);
      if (!historyAllowed(user)) throw Object.assign(new Error('Health history is shared with the family and the office team only.'), { status: 403 });
      const range = rangeOf(url);
      return json(res, 200, { ok: true, ...(await dashboardData(user, person, range)) });
    }
    if (parts[0] === 'people' && parts[2] === 'report.pdf' && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1]);
      if (!historyAllowed(user)) throw forbidden();
      const range = rangeOf(url);
      const d = await dashboardData(user, person, range);
      const pdf = await report.build(reportInput(d, range, user));
      await audit(user.id, 'report.download', person.id, { period: range.key });
      const name = 'KareIQ-health-report-' + person.name.replace(/[^A-Za-z0-9]+/g, '-').replace(/^-|-$/g, '') + '-' + range.to + '.pdf';
      res.writeHead(200, { 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${name}"`, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' });
      res.end(pdf);
      return true;
    }

    // the visit form: readings, smart-scale fields and the wellbeing checks
    if (p === 'forms/visit' && req.method === 'GET') {
      return json(res, 200, { ok: true, obs: vitals.OBS, groups: vitals.OBS_GROUPS, body: vitals.BODY.map((k) => ({ k, label: vitals.METRICS[k].label, unit: vitals.METRICS[k].unit })), contexts: vitals.GLUCOSE_CONTEXTS });
    }

    // ----- risk scores: forms for the care team, saving a result
    if (p === 'risk/forms' && req.method === 'GET') {
      const forms = risk.forms();
      let prefill = {};
      const pid = url.searchParams.get('person');
      if (pid) {
        const person = await visiblePerson(user, pid);
        prefill = await riskPrefill(person);
      }
      return json(res, 200, { ok: true, forms, prefill });
    }
    if (parts[0] === 'people' && parts[2] === 'risks' && req.method === 'POST') {
      const person = await visiblePerson(user, parts[1]);
      if (!(await careTeam(user, person.id))) throw forbidden();
      const out = risk.evaluate(String(body.test || ''), body.inputs || {});
      if (out.errors) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors: out.errors });
      const at = body.date && /^\d{4}-\d{2}-\d{2}$/.test(body.date) && body.date <= todayIST() ? body.date + 'T12:00:00+05:30' : now();
      const row = { id: uid(), personId: person.id, test: body.test, inputs: out.inputs, ...out.result, at: new Date(at).toISOString(), enteredBy: user.id, createdAt: now() };
      await docs.insert('app_risks', row);
      // remember sex and risk factors on the person, so the next form is filled in
      const keep = {};
      if (out.inputs.sex && !person.sex) keep.sex = out.inputs.sex;
      if (out.inputs.smoker !== undefined) keep.smoker = Boolean(out.inputs.smoker);
      if (out.inputs.parentMI !== undefined) keep.parentalMI = Boolean(out.inputs.parentMI);
      if (out.inputs.diabetic !== undefined) keep.diabetic = Boolean(out.inputs.diabetic);
      if (Object.keys(keep).length) await docs.update('app_people', person.id, keep);
      await audit(user.id, 'risk.save', person.id, { test: body.test });
      return json(res, 201, { ok: true, result: out.result });
    }
    if (parts[0] === 'people' && parts[2] === 'profile' && req.method === 'POST') {
      const person = await visiblePerson(user, parts[1]);
      if (!(await careTeam(user, person.id))) throw forbidden();
      const keep = {};
      if (body.sex === 'male' || body.sex === 'female') keep.sex = body.sex;
      const by = Number(body.birthYear);
      if (body.birthYear !== undefined && body.birthYear !== '') {
        if (!Number.isInteger(by) || by < 1900 || by > new Date().getFullYear()) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors: { birthYear: 'Enter a year like 1950' } });
        keep.birthYear = by;
      }
      for (const k of ['smoker', 'parentalMI', 'diabetic']) if (body[k] === 'yes' || body[k] === 'no') keep[k] = body[k] === 'yes';
      if (Object.keys(keep).length) await docs.update('app_people', person.id, keep);
      await audit(user.id, 'person.edit', person.id, { fields: Object.keys(keep) });
      return json(res, 200, { ok: true });
    }

    // ----- medical records
    if (parts[0] === 'people' && parts[2] === 'records' && parts.length === 3 && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1]);
      let rows = await docs.find('app_records', { personId: person.id, removed: { $ne: true } }, { sort: { date: -1 } });
      if (!historyAllowed(user)) rows = rows.filter((r) => r.uploadedBy === user.id); // caregivers see only what they added
      const ids = [...new Set(rows.map((r) => r.uploadedBy))];
      const users = ids.length ? await docs.find('app_users', { id: { $in: ids } }) : [];
      return json(res, 200, { ok: true, categories: RECORD_CATEGORIES, canUpload: true, canSeeAll: historyAllowed(user), rows: rows.map((r) => ({
        id: r.id, name: r.name, category: r.category, date: r.date, size: r.size, type: r.mime, uploadedAt: r.uploadedAt,
        by: (users.find((u) => u.id === r.uploadedBy) || {}).name || 'KareIQ', mine: r.uploadedBy === user.id, canRemove: user.role === 'admin' || r.uploadedBy === user.id
      })) });
    }
    if (parts[0] === 'records' && parts[2] === 'remove' && req.method === 'POST') {
      const r = await docs.findOne('app_records', { id: String(parts[1]) });
      if (!r || r.removed) throw notFound();
      await visiblePerson(user, r.personId);
      if (user.role !== 'admin' && r.uploadedBy !== user.id) throw forbidden();
      await docs.update('app_records', r.id, { removed: true, removedBy: user.id, removedAt: now() });
      await audit(user.id, 'record.remove', r.personId, { name: r.name });
      return json(res, 200, { ok: true });
    }

    // ----- package information, services and invoices
    if (parts[0] === 'people' && parts[2] === 'package' && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1]);
      return json(res, 200, { ok: true, ...(await packageData(person)) });
    }
    if (parts[0] === 'people' && parts[2] === 'services' && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1]);
      return json(res, 200, { ok: true, ...(await servicesData(user, person)) });
    }
    if (parts[0] === 'people' && parts[2] === 'services' && req.method === 'POST') {
      const person = await visiblePerson(user, parts[1]);
      if (user.role === 'caregiver') throw forbidden();
      const svc = care.SERVICES[body.service] ? body.service : null;
      const errors = {};
      if (!svc) errors.service = 'Choose a service.';
      const date = clean(body.date, 10);
      if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < todayIST()) errors.date = 'Choose today or a later date.';
      const slot = catalog.timeSlots[body.time] ? body.time : null;
      const note = typeof body.note === 'string' ? body.note.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim().slice(0, 1000) : '';
      if (Object.keys(errors).length) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors });
      const sd = await servicesData(user, person);
      const item = sd.included.concat(sd.additional).find((x) => x.id === svc);
      if (!item) return json(res, 400, { ok: false, message: 'This service is not available for this plan.', errors: { service: 'Not available' } });
      const free = Boolean(item.free && sd.free && sd.free.left > 0);
      if (limited(req, 'app-request')) return json(res, 429, { ok: false, message: 'You have sent several requests just now. Please wait a few minutes, or message us on WhatsApp.' });
      const row = await store.add('enquiries', 'KQ', {
        name: user.name, phone: user.phone || '', email: user.email || '', interest: 'app-service', interestName: 'Service booking: ' + care.SERVICES[svc].name + (free ? ' (free session)' : ''),
        message: [`Date: ${date}`, slot ? `Time: ${catalog.timeSlots[slot]}` : '', note].filter(Boolean).join('\n'), source: 'app', product: sd.product,
        userId: user.id, personId: person.id, personName: person.name, kind: 'service', service: svc, free, date, time: slot
      });
      await audit(user.id, 'service.booked', person.id, { service: svc, free, reference: row.reference });
      return json(res, 201, { ok: true, reference: row.reference, free });
    }
    if (parts[0] === 'people' && parts[2] === 'invoices' && req.method === 'GET') {
      const person = await visiblePerson(user, parts[1]);
      if (user.role === 'caregiver') throw forbidden();
      return json(res, 200, { ok: true, ...(await invoicesData(person)) });
    }

    // ----- families choosing a plan in the app
    if (p === 'plans/options' && req.method === 'GET') {
      const links = user.role === 'family' ? await linksOf(user.id, 'family') : [];
      const people = links.length ? await docs.find('app_people', { id: { $in: links.map((l) => l.personId) } }) : [];
      return json(res, 200, { ok: true, products: await planChoices(), people: people.map((x) => ({ id: x.id, name: x.name, relation: (links.find((l) => l.personId === x.id) || {}).relation || null })) });
    }
    if (p === 'plans/request' && req.method === 'POST') {
      if (user.role !== 'family') throw forbidden();
      const prod = PRODUCTS[body.product] ? body.product : null;
      const errors = {};
      if (!prod) errors.product = 'Choose Kare@Home or KareNest.';
      const planId = body.planId === 'undecided' ? null : clean(body.planId, 40);
      if (prod && planId && !PRODUCTS[prod].plans.includes(planId)) errors.planId = 'Choose a plan.';
      let person = null;
      if (body.personId) person = await visiblePerson(user, String(body.personId));
      const personName = clean(body.personName, 80);
      const relation = clean(body.relation, RELATIONS_MAX);
      if (!person && personName.length < 2) errors.personName = 'Please enter the name of the person receiving care.';
      const startDate = clean(body.startDate, 10);
      if (startDate && (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || startDate < todayIST())) errors.startDate = 'Choose today or a later date.';
      const note = typeof body.note === 'string' ? body.note.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim().slice(0, 1000) : '';
      // accounts made with Google or Facebook have no mobile number yet: the team needs one to call
      let newPhone = null;
      if (!user.phone) {
        newPhone = normalisePhone(body.phone);
        if (!newPhone) errors.phone = 'Enter a 10-digit mobile number so our team can call you.';
        else if (await docs.findOne('app_users', { phone: newPhone })) errors.phone = 'This number already has an account. Sign in with it, or use another number.';
      }
      if (Object.keys(errors).length) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors });
      if (newPhone) { await docs.update('app_users', user.id, { phone: newPhone }); user.phone = newPhone; }
      const already = person && bestPlan(await docs.find('app_plans', { personId: person.id }), prod);
      if (already && (already.status === 'pending' || already.status === 'active')) {
        return json(res, 409, { ok: false, message: already.included
          ? `${PRODUCTS[prod].name} is already included with ${person.name}'s ${already.viaName || PRODUCTS[already.viaProduct].name} plan. Open ${PRODUCTS[prod].name} from the top of the page to book visits.`
          : `${person.name} already has a ${PRODUCTS[prod].name} plan. To change it, open ${PRODUCTS[prod].name} and tap "Change or renew the plan".` });
      }
      if (limited(req, 'app-plan')) return json(res, 429, { ok: false, message: 'You have sent several requests just now. Please wait a few minutes, or message us on WhatsApp.' });
      if (!person) {
        person = { id: store.makeReference('P'), name: personName, active: true, createdAt: now() };
        await docs.insert('app_people', person);
        await docs.insert('app_links', { id: uid(), userId: user.id, personId: person.id, kind: 'family', relation: relation || null, createdAt: now() });
      }
      // payment plan: monthly, quarterly, half-yearly or yearly for packages priced by the month
      const pk = planId ? await packinfo.byId(planId) : null;
      const months = pk && packinfo.durationOf(pk) ? (packinfo.MONTHS.includes(String(body.months)) ? Number(body.months) : (pk.model === 'tiers' ? 12 : 1)) : null;
      const charge = pk ? packinfo.priceOf(pk, months) : null;
      const planRow = { id: uid(), personId: person.id, product: prod, planId, status: 'pending', bookingRef: null, months, createdAt: now() };
      await docs.insert('app_plans', planRow);
      const row = await store.add('enquiries', 'KQ', {
        name: user.name, phone: user.phone || '', email: user.email || '', interest: 'app-plan-request', interestName: 'New plan from the app',
        message: [planId ? 'Plan: ' + planName(planId) : 'Plan: not decided, please guide', months ? `Payment plan: ${packinfo.PERIOD[months]} (${months === 1 ? '1 month' : months + ' months'})` : '',
          charge && charge.amount ? 'Price shown: Rs ' + Number(charge.amount).toLocaleString('en-IN') + (charge.gst ? ' (' + charge.gst.replace(/\.$/, '') + ')' : '') : '', startDate ? 'Would like to start: ' + startDate : '', note].filter(Boolean).join('\n'),
        source: 'app', product: prod, package: planId || 'undecided', billing: months ? String(months) : null, date: startDate || null, userId: user.id, accountUserId: user.id,
        personId: person.id, personName: person.name, relation: relation || null, appPlanId: planRow.id, kind: 'plan-request'
      });
      await docs.update('app_plans', planRow.id, { bookingRef: row.reference });
      await audit(user.id, 'plan.requested', person.id, { product: prod, planId, reference: row.reference });
      return json(res, 201, { ok: true, product: prod, reference: row.reference, personId: person.id });
    }
    // add a website booking to an account that already exists (same mobile number)
    if (p === 'claim' && req.method === 'POST') {
      if (user.role !== 'family') throw forbidden();
      if (limited(req, 'app-start')) return json(res, 429, { ok: false, message: 'Too many tries. Please wait a few minutes, or message us on WhatsApp.' });
      const found = await findRequest(body.reference);
      if (!found || !user.phone || found.row.phone !== user.phone) {
        return json(res, 404, { ok: false, message: 'We could not find a booking with that reference made with your mobile number ' + (user.phone || '') + '. If you booked with a different number, message us on WhatsApp.', errors: { reference: 'Not found' } });
      }
      if (found.row.accountUserId) {
        if (found.row.accountUserId === user.id) return json(res, 409, { ok: false, message: 'This booking is already in your account.' });
        return json(res, 409, { ok: false, message: 'This booking is linked to another account. Please message us on WhatsApp.' });
      }
      const personName = clean(body.personName, 80);
      if (personName.length < 2) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors: { personName: 'Please enter the name of the person receiving care.' } });
      const { person, product: prod } = await attachRequest(user, found.kind, found.row, personName, clean(body.relation, RELATIONS_MAX));
      await audit(user.id, 'booking.added', person.id, { reference: found.row.reference });
      return json(res, 201, { ok: true, product: prod });
    }

    // a family member asks for something
    if (p === 'requests' && req.method === 'POST') {
      if (!PRODUCTS[body.product]) throw notFound();
      const kind = REQUEST_KINDS[body.kind] && body.kind !== 'signin-help' ? body.kind : 'question';
      let person = null;
      if (body.personId) person = await visiblePerson(user, String(body.personId), body.product);
      const message = typeof body.message === 'string' ? body.message.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim().slice(0, 1000) : '';
      const date = clean(body.date, 10);
      if (kind !== 'plan' && message.length < 2 && !date) return json(res, 400, { ok: false, message: 'Please tell us a little about what you need.', errors: { message: 'Required' } });
      if (limited(req, 'app-request')) return json(res, 429, { ok: false, message: 'You have sent several requests just now. Please wait a few minutes, or message us on WhatsApp.' });
      const row = await store.add('enquiries', 'KQ', {
        name: user.name, phone: user.phone || '', email: user.email || '', interest: 'app-' + kind, interestName: REQUEST_KINDS[kind],
        message: [date ? `Preferred date: ${date}` : '', message].filter(Boolean).join('\n'), source: 'app', product: body.product,
        userId: user.id, personId: person ? person.id : null, personName: person ? person.name : null, kind
      });
      await audit(user.id, 'request.sent', person && person.id, { kind, reference: row.reference });
      return json(res, 201, { ok: true, reference: row.reference });
    }
    if (p === 'requests' && req.method === 'GET') {
      const rows = (await docs.find('enquiries', { userId: user.id }, { sort: { createdAt: -1 }, limit: 30 }))
        .filter((r) => !product || r.product === product)
        .map((r) => ({ reference: r.reference, kind: r.kind, title: r.interestName, personName: r.personName, message: r.message, status: r.status, createdAt: r.createdAt }));
      return json(res, 200, { ok: true, rows });
    }

    if (parts[0] === 'admin') {
      if (user.role !== 'admin') throw forbidden();
      return adminRoute(req, res, parts.slice(1), url, user, body);
    }
    return undefined;
  }

  function readingOutOrNull(r) { return r ? readingOut(r) : null; }

  // ---------------------------------------------------------------- admin
  async function adminRoute(req, res, parts, url, admin, body) {
    const p = parts.join('/');
    const product = PRODUCTS[url.searchParams.get('product')] ? url.searchParams.get('product') : null;

    if (p === 'catalog' && req.method === 'GET') {
      return json(res, 200, { ok: true, products: Object.values(PRODUCTS).map((x) => ({ ...brand(x.id), plans: plansFor(x.id) })), statuses: PLAN_STATUS, roles: ROLES, mail: mailReady });
    }

    if (p === 'overview' && req.method === 'GET') {
      const [plans, users, requests] = await Promise.all([docs.find('app_plans'), docs.find('app_users'), allRequests()]);
      const per = {};
      for (const id of Object.keys(PRODUCTS)) {
        const mine = plans.filter((x) => x.product === id);
        per[id] = {
          active: mine.filter((x) => x.status === 'active').length,
          pending: mine.filter((x) => x.status === 'pending').length,
          paused: mine.filter((x) => x.status === 'paused').length,
          newRequests: requests.filter((r) => r.product === id && r.status === 'new').length
        };
      }
      return json(res, 200, {
        ok: true, per,
        caregivers: users.filter((u) => u.role === 'caregiver' && u.active).length,
        families: users.filter((u) => u.role === 'family' && u.active).length,
        waitingSetup: users.filter((u) => u.active && !u.passwordHash).length,
        generalRequests: requests.filter((r) => !r.product && r.status === 'new').length
      });
    }

    if (p === 'requests' && req.method === 'GET') {
      let rows = await allRequests();
      if (product) rows = rows.filter((r) => r.product === product);
      return json(res, 200, { ok: true, rows: rows.slice(0, 300), statuses: ['new', 'contacted', 'scheduled', 'closed'] });
    }
    if (parts[0] === 'requests' && parts.length === 3 && req.method === 'PATCH') {
      const name = parts[1] === 'booking' ? 'bookings' : parts[1] === 'enquiry' ? 'enquiries' : null;
      if (!name) throw notFound();
      const changes = {};
      if (body.status !== undefined) {
        if (!['new', 'contacted', 'scheduled', 'closed'].includes(body.status)) throw bad('Unknown status.');
        changes.status = body.status;
      }
      if (typeof body.adminNote === 'string') changes.adminNote = body.adminNote.slice(0, 1000);
      const row = await store.update(name, parts[2], changes);
      if (!row) throw notFound();
      return json(res, 200, { ok: true });
    }

    // Turn a website booking/enquiry (or nothing, for walk-ins) into an active plan + family login.
    if (p === 'activate' && req.method === 'POST') {
      const errors = {};
      const prod = PRODUCTS[body.product] ? body.product : null;
      if (!prod) errors.product = 'Choose Kare@Home or KareNest.';
      const planId = clean(body.planId, 40);
      if (prod && !PRODUCTS[prod].plans.includes(planId)) errors.planId = 'Choose a plan.';
      const startDate = clean(body.startDate, 10) || todayIST();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) errors.startDate = 'Choose a start date.';
      const months = Number(body.months || 12);
      if (![1, 3, 6, 12].includes(months)) errors.months = 'Choose how long the plan runs.';
      const familyName = clean(body.familyName, 80);
      const familyEmail = cleanEmail(body.familyEmail || '');
      const familyPhone = body.familyPhone ? normalisePhone(body.familyPhone) : null;
      if (familyName.length < 2) errors.familyName = 'Enter the family member\'s name.';
      if (body.familyPhone && !familyPhone) errors.familyPhone = 'Enter a 10-digit Indian mobile number.';
      if (familyEmail && !validEmail(familyEmail)) errors.familyEmail = 'This email address looks incomplete.';
      if (!familyEmail && !familyPhone) errors.familyPhone = 'Enter a mobile number or email so they can sign in.';
      const personName = clean(body.personName, 80);
      if (!body.personId && personName.length < 2) errors.personName = 'Enter the name of the person receiving care.';
      if (Object.keys(errors).length) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors });

      let reqRow = null; let reqName = null;
      if (body.requestKind && body.requestId) {
        reqName = body.requestKind === 'booking' ? 'bookings' : 'enquiries';
        reqRow = await docs.findOne(reqName, { id: String(body.requestId) });
        if (!reqRow) throw notFound();
      }

      // the family login: reuse an existing one with the same phone/email
      let family = (reqRow && reqRow.accountUserId && await docs.findOne('app_users', { id: reqRow.accountUserId }))
        || (familyPhone && await docs.findOne('app_users', { phone: familyPhone }))
        || (familyEmail && await docs.findOne('app_users', { email: familyEmail }));
      const ownRequest = Boolean(family && reqRow && reqRow.accountUserId === family.id);
      if (family && family.selfSignup && !family.verified && !ownRequest && !body.confirmAccount) {
        return json(res, 409, { ok: false, needsConfirm: true, message: `${family.name} created an account with this ${familyPhone && family.phone === familyPhone ? 'mobile number' : 'email'} in the app. Mobile numbers are not checked by SMS, so confirm on your call that it is really them, then tick the box and activate again.` });
      }
      if (family && family.role !== 'family') return json(res, 400, { ok: false, message: `That ${familyPhone ? 'mobile number' : 'email'} belongs to a ${ROLES[family.role]} login. Use a different one for the family.`, errors: { familyPhone: 'In use' } });
      if (!family) {
        if (familyEmail && await docs.findOne('app_users', { email: familyEmail })) return json(res, 400, { ok: false, message: 'That email is used by another login.', errors: { familyEmail: 'In use' } });
        family = { id: uid(), name: familyName, email: familyEmail || null, phone: familyPhone, role: 'family', passwordHash: null, active: true, createdAt: now() };
        await docs.insert('app_users', family);
      } else {
        const fix = { verified: true };
        if (!family.email && familyEmail) fix.email = familyEmail;
        if (!family.phone && familyPhone) fix.phone = familyPhone;
        if (Object.keys(fix).length) await docs.update('app_users', family.id, fix);
      }

      // the person receiving care
      let person = null;
      const existingPersonId = body.personId || (reqRow && reqRow.personId);
      if (existingPersonId) person = await docs.findOne('app_people', { id: String(existingPersonId) });
      if (!person) {
        person = { id: store.makeReference('P'), name: personName, birthYear: Number(body.birthYear) || null, active: true, createdAt: now() };
        await docs.insert('app_people', person);
      } else if (personName && personName !== person.name) {
        await docs.update('app_people', person.id, { name: personName });
      }
      const relation = clean(body.relation, RELATIONS_MAX) || null;
      const link = await docs.findOne('app_links', { userId: family.id, personId: person.id, kind: 'family' });
      if (!link) await docs.insert('app_links', { id: uid(), userId: family.id, personId: person.id, kind: 'family', relation, createdAt: now() });
      else if (relation) await docs.update('app_links', link.id, { relation });

      // the plan: activate the waiting one from the booking, or add a new one
      const endDate = addMonths(startDate, months);
      const waiting = (reqRow && reqRow.appPlanId && await docs.findOne('app_plans', { id: reqRow.appPlanId }))
        || (await docs.find('app_plans', { personId: person.id, product: prod, status: 'pending' }))[0];
      let plan;
      if (waiting) {
        plan = await docs.update('app_plans', waiting.id, { product: prod, planId, status: 'active', startDate, endDate, months, activatedBy: admin.id, updatedAt: now() });
      } else {
        plan = { id: uid(), personId: person.id, product: prod, planId, status: 'active', startDate, endDate, months, bookingRef: reqRow ? reqRow.reference : null, activatedBy: admin.id, createdAt: now() };
        await docs.insert('app_plans', plan);
      }
      if (body.caregiverId) {
        const cg = await docs.findOne('app_users', { id: String(body.caregiverId), role: 'caregiver' });
        if (cg && !(await docs.findOne('app_links', { userId: cg.id, personId: person.id, kind: 'caregiver' }))) {
          await docs.insert('app_links', { id: uid(), userId: cg.id, personId: person.id, kind: 'caregiver', createdAt: now() });
        }
      }
      if (reqRow) await store.update(reqName, reqRow.id, { status: 'scheduled', accountUserId: family.id, personId: person.id, appPlanId: plan.id });
      await audit(admin.id, 'plan.activate', person.id, { product: prod, planId, reference: reqRow ? reqRow.reference : null });

      family = await docs.findOne('app_users', { id: family.id });
      const result = { ok: true, person: { id: person.id, name: person.name }, family: publicUser(family), plan: planView(plan) };
      if (!family.passwordHash) Object.assign(result, await welcomeLink(req, family));
      return json(res, 200, result);
    }

    // people + plans
    if (p === 'people' && req.method === 'GET') {
      const [people, plans, links, users] = await Promise.all([docs.find('app_people', {}, { sort: { createdAt: -1 } }), docs.find('app_plans'), docs.find('app_links'), docs.find('app_users')]);
      const nameOf = (id) => (users.find((u) => u.id === id) || {});
      let rows = people.map((x) => ({
        id: x.id, name: x.name, birthYear: x.birthYear || null, active: x.active !== false, createdAt: x.createdAt,
        plans: plans.filter((pl) => pl.personId === x.id).sort((a, b) => STATUS_RANK[b.status] - STATUS_RANK[a.status]).map(planView),
        family: links.filter((l) => l.personId === x.id && l.kind === 'family').map((l) => ({ id: l.userId, linkId: l.id, name: nameOf(l.userId).name, relation: l.relation, phone: nameOf(l.userId).phone, hasPassword: Boolean(nameOf(l.userId).passwordHash) })),
        caregivers: links.filter((l) => l.personId === x.id && l.kind === 'caregiver').map((l) => ({ id: l.userId, linkId: l.id, name: nameOf(l.userId).name }))
      }));
      if (product) rows = rows.filter((x) => x.plans.some((pl) => pl.product === product));
      return json(res, 200, { ok: true, rows });
    }
    if (p === 'people' && req.method === 'POST') {
      const name = clean(body.name, 80);
      if (name.length < 2) return json(res, 400, { ok: false, message: 'Enter a name.', errors: { name: 'Required' } });
      const person = { id: store.makeReference('P'), name, birthYear: Number(body.birthYear) || null, active: true, createdAt: now() };
      await docs.insert('app_people', person);
      await audit(admin.id, 'person.add', person.id);
      return json(res, 201, { ok: true, person });
    }
    if (parts[0] === 'people' && parts.length === 2 && req.method === 'PATCH') {
      const person = await docs.findOne('app_people', { id: parts[1] });
      if (!person) throw notFound();
      const changes = {};
      if (body.name !== undefined) { const n = clean(body.name, 80); if (n.length < 2) throw bad('Enter a name.'); changes.name = n; }
      if (body.birthYear !== undefined) changes.birthYear = Number(body.birthYear) || null;
      if (body.active !== undefined) changes.active = Boolean(body.active);
      await docs.update('app_people', person.id, changes);
      await audit(admin.id, 'person.edit', person.id, changes);
      return json(res, 200, { ok: true });
    }

    if (p === 'plans' && req.method === 'POST') {
      const person = await docs.findOne('app_people', { id: String(body.personId || '') });
      if (!person) throw notFound();
      const prod = PRODUCTS[body.product] ? body.product : null;
      if (!prod) throw bad('Choose Kare@Home or KareNest.');
      if (!PRODUCTS[prod].plans.includes(body.planId)) throw bad('Choose a plan.');
      const months = [1, 3, 6, 12].includes(Number(body.months)) ? Number(body.months) : 12;
      const startDate = /^\d{4}-\d{2}-\d{2}$/.test(body.startDate || '') ? body.startDate : todayIST();
      const plan = { id: uid(), personId: person.id, product: prod, planId: body.planId, status: 'active', startDate, endDate: addMonths(startDate, months), months, activatedBy: admin.id, createdAt: now() };
      await docs.insert('app_plans', plan);
      await audit(admin.id, 'plan.add', person.id, { product: prod, planId: body.planId });
      return json(res, 201, { ok: true, plan: planView(plan) });
    }
    if (parts[0] === 'plans' && parts.length === 2 && req.method === 'PATCH') {
      const plan = await docs.findOne('app_plans', { id: parts[1] });
      if (!plan) throw notFound();
      const changes = { updatedAt: now() };
      if (body.status !== undefined) { if (!PLAN_STATUS[body.status]) throw bad('Unknown status.'); changes.status = body.status; }
      if (body.planId !== undefined) { if (!PRODUCTS[plan.product].plans.includes(body.planId)) throw bad('Choose a plan.'); changes.planId = body.planId; }
      if (body.endDate !== undefined) { if (body.endDate && !/^\d{4}-\d{2}-\d{2}$/.test(body.endDate)) throw bad('Choose a valid date.'); changes.endDate = body.endDate || null; }
      if (changes.status === 'active' && !plan.startDate) { changes.startDate = todayIST(); changes.endDate = changes.endDate || addMonths(changes.startDate, plan.months || 12); }
      await docs.update('app_plans', plan.id, changes);
      await audit(admin.id, 'plan.edit', plan.personId, { product: plan.product, ...changes });
      return json(res, 200, { ok: true });
    }

    // logins
    if (p === 'users' && req.method === 'GET') {
      const [users, links] = await Promise.all([docs.find('app_users', {}, { sort: { createdAt: -1 } }), docs.find('app_links')]);
      return json(res, 200, { ok: true, rows: users.map((u) => ({ ...publicUser(u), people: links.filter((l) => l.userId === u.id).length })) });
    }
    if (p === 'users' && req.method === 'POST') {
      const role = ROLES[body.role] ? body.role : null;
      const name = clean(body.name, 80);
      const email = cleanEmail(body.email || '');
      const phone = body.phone ? normalisePhone(body.phone) : null;
      const errors = {};
      if (!role) errors.role = 'Choose a role.';
      if (name.length < 2) errors.name = 'Enter a name.';
      if (email && !validEmail(email)) errors.email = 'This email address looks incomplete.';
      if (body.phone && !phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
      if (!email && !phone) errors.phone = 'Enter a mobile number or email; it is what they sign in with.';
      if (email && await docs.findOne('app_users', { email })) errors.email = 'Another login already uses this email.';
      if (phone && await docs.findOne('app_users', { phone })) errors.phone = 'Another login already uses this mobile number.';
      if (Object.keys(errors).length) return json(res, 400, { ok: false, message: 'Please check the highlighted fields.', errors });
      const user = { id: uid(), name, email: email || null, phone, role, passwordHash: null, active: true, createdAt: now() };
      await docs.insert('app_users', user);
      await audit(admin.id, 'user.add', null, { role, name });
      return json(res, 201, { ok: true, user: publicUser(user), ...(await welcomeLink(req, user)) });
    }
    if (parts[0] === 'users' && parts[2] === 'link' && req.method === 'POST') {
      const user = await docs.findOne('app_users', { id: parts[1] });
      if (!user) throw notFound();
      if (demoLocked(user)) throw bad(DEMO_LOCKED);
      await audit(admin.id, 'user.link', null, { name: user.name });
      return json(res, 200, { ok: true, user: publicUser(user), ...(await welcomeLink(req, user)) });
    }
    if (parts[0] === 'users' && parts.length === 2 && req.method === 'PATCH') {
      const user = await docs.findOne('app_users', { id: parts[1] });
      if (!user) throw notFound();
      if (demoLocked(user)) throw bad(DEMO_LOCKED);
      const changes = {};
      if (body.active !== undefined) {
        if (user.id === admin.id && !body.active) throw bad('You cannot turn off your own login.');
        changes.active = Boolean(body.active);
      }
      if (body.name !== undefined) { const n = clean(body.name, 80); if (n.length < 2) throw bad('Enter a name.'); changes.name = n; }
      if (body.phone !== undefined) {
        const ph = body.phone ? normalisePhone(body.phone) : null;
        if (body.phone && !ph) throw bad('Enter a 10-digit Indian mobile number.');
        if (ph && ph !== user.phone && await docs.findOne('app_users', { phone: ph })) throw bad('Another login already uses this mobile number.');
        changes.phone = ph;
      }
      if (body.email !== undefined) {
        const em = cleanEmail(body.email || '');
        if (em && !validEmail(em)) throw bad('This email address looks incomplete.');
        if (em && em !== user.email && await docs.findOne('app_users', { email: em })) throw bad('Another login already uses this email.');
        changes.email = em || null;
      }
      await docs.update('app_users', user.id, changes);
      if (changes.active === false) await auth.endAllSessions(user.id);
      await audit(admin.id, 'user.edit', null, { name: user.name, ...changes });
      return json(res, 200, { ok: true });
    }

    // who sees whom
    if (p === 'links' && req.method === 'POST') {
      const user = await docs.findOne('app_users', { id: String(body.userId || '') });
      const person = await docs.findOne('app_people', { id: String(body.personId || '') });
      if (!user || !person) throw bad('Choose a login and a person.');
      if (user.role === 'admin') throw bad('Office admins already see everyone.');
      const kind = user.role === 'caregiver' ? 'caregiver' : 'family';
      if (await docs.findOne('app_links', { userId: user.id, personId: person.id, kind })) return json(res, 200, { ok: true, already: true });
      await docs.insert('app_links', { id: uid(), userId: user.id, personId: person.id, kind, relation: kind === 'family' ? (clean(body.relation, RELATIONS_MAX) || null) : null, createdAt: now() });
      await audit(admin.id, kind === 'caregiver' ? 'caregiver.assign' : 'family.link', person.id, { name: user.name });
      return json(res, 201, { ok: true });
    }
    if (parts[0] === 'links' && parts[2] === 'remove' && req.method === 'POST') {
      const link = await docs.findOne('app_links', { id: parts[1] });
      if (!link) throw notFound();
      await docs.remove('app_links', link.id);
      await audit(admin.id, link.kind === 'caregiver' ? 'caregiver.unassign' : 'family.unlink', link.personId);
      return json(res, 200, { ok: true });
    }

    if (p === 'activity' && req.method === 'GET') {
      const [rows, users, people] = await Promise.all([docs.find('app_audit', {}, { sort: { at: -1 }, limit: 150 }), docs.find('app_users'), docs.find('app_people')]);
      return json(res, 200, { ok: true, rows: rows.map((r) => ({
        at: r.at, action: r.action, who: (users.find((u) => u.id === r.userId) || {}).name || 'System',
        person: (people.find((x) => x.id === r.personId) || {}).name || null, detail: r.detail
      })) });
    }
    return undefined;
  }

  async function welcomeLink(req, user) {
    const { token, expiresAt } = await auth.makeLink(user.id, user.passwordHash ? 'reset' : 'setup');
    const link = `${appUrl(req, isHttps)}/#/link/${token}`;
    const products = (await productsFor(user)).map((b) => b.name);
    const text = user.passwordHash
      ? `Hello ${user.name.split(' ')[0]}, here is your new KareIQ sign-in link: ${link} (it works once and expires in 24 hours).`
      : welcomeText(user, link, products);
    let emailed = false;
    if (user.email && mailReady) emailed = await sendMail(user.email, user.passwordHash ? 'Your KareIQ sign-in link' : 'Welcome to KareIQ', text);
    return { link, linkExpiresAt: expiresAt, message: text, emailed, whatsapp: user.phone ? `https://wa.me/${user.phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}` : `https://wa.me/?text=${encodeURIComponent(text)}` };
  }

  async function allRequests() {
    const [bookings, enquiries] = await Promise.all([store.readAll('bookings'), store.readAll('enquiries')]);
    const rows = [
      ...bookings.map((r) => ({ type: 'booking', r })),
      ...enquiries.map((r) => ({ type: 'enquiry', r }))
    ].map(({ type, r }) => ({
      type, id: r.id, reference: r.reference, status: r.status, createdAt: r.createdAt, product: productOfRequest(type, r),
      kind: r.kind || (type === 'booking' ? 'booking' : 'enquiry'),
      title: type === 'booking' ? (r.packageName && r.package !== 'undecided' ? `${r.packageName} · ${r.serviceName}` : r.serviceName) : r.interestName,
      name: r.name, phone: r.phone, email: r.email, area: r.area || null, careFor: r.careForName || null,
      package: r.package || null, billing: r.billing || null, date: r.date || null, timeName: r.timeName || null,
      message: r.notes || r.message || '', source: r.source || (type === 'booking' ? 'kare-at-home' : 'kareiq'),
      personId: r.personId || null, personName: r.personName || null, accountUserId: r.accountUserId || null, userId: r.userId || null,
      appPlanId: r.appPlanId || null, adminNote: r.adminNote || '', relation: r.relation || null
    }));
    return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }

  // ---------------------------------------------------------------- medical record files
  const MAX_FILE = 5 * 1024 * 1024;
  const FILE_TYPES = { 'application/pdf': 'pdf', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };
  function sniff(buf) {
    if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
    if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
    if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
    if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
    return null;
  }
  function readRaw(req) {
    if (Buffer.isBuffer(req.body)) return Promise.resolve(req.body);
    return new Promise((resolve, reject) => {
      let size = 0; const chunks = [];
      req.on('data', (c) => {
        size += c.length;
        if (size > MAX_FILE) { reject(Object.assign(new Error('That file is larger than 5 MB. Please send a smaller file or a photo.'), { status: 413 })); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }
  async function uploadRecord(req, res, personId, user) {
    const person = await visiblePerson(user, personId);
    if (!(historyAllowed(user) || await careTeam(user, person.id))) throw forbidden();
    if (failures.over('upload:' + user.id, 40)) return json(res, 429, { ok: false, message: 'You have uploaded many files just now. Please wait a few minutes.' });
    failures.add('upload:' + user.id);
    const buf = await readRaw(req);
    if (!buf.length) return json(res, 400, { ok: false, message: 'Choose a file to upload.' });
    if (buf.length > MAX_FILE) return json(res, 413, { ok: false, message: 'That file is larger than 5 MB. Please send a smaller file or a photo.' });
    const mime = sniff(buf);
    if (!mime) return json(res, 415, { ok: false, message: 'Please upload a PDF or a photo (JPG, PNG or WEBP).' });
    let name = '';
    try { name = decodeURIComponent(String(req.headers['x-file-name'] || '')); } catch { name = ''; }
    name = clean(name.replace(/\.[A-Za-z0-9]{2,5}$/, ''), 80) || 'Report';
    const category = RECORD_CATEGORIES[req.headers['x-category']] ? String(req.headers['x-category']) : 'others';
    let date = String(req.headers['x-date'] || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > todayIST()) date = todayIST();
    const fileId = uid();
    await docs.insert('app_files', { id: fileId, personId: person.id, data: buf.toString('base64'), createdAt: now() });
    const row = { id: uid(), personId: person.id, name, category, date, mime, ext: FILE_TYPES[mime], size: buf.length, fileId, uploadedBy: user.id, uploadedAt: now() };
    await docs.insert('app_records', row);
    await audit(user.id, 'record.add', person.id, { name, category });
    return json(res, 201, { ok: true, id: row.id });
  }
  async function downloadRecord(req, res, id, user, url) {
    const r = await docs.findOne('app_records', { id: String(id) });
    if (!r || r.removed) throw notFound();
    await visiblePerson(user, r.personId);
    if (!historyAllowed(user) && r.uploadedBy !== user.id) throw notFound();
    const f = await docs.findOne('app_files', { id: r.fileId });
    if (!f) throw notFound();
    const buf = Buffer.from(f.data, 'base64');
    const file = (r.name.replace(/[^A-Za-z0-9 _-]+/g, '').trim().replace(/\s+/g, '-') || 'record') + '.' + (r.ext || 'pdf');
    const inline = url.searchParams.get('view') === '1';
    res.writeHead(200, { 'Content-Type': r.mime, 'Content-Length': buf.length, 'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${file}"`, 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff' });
    res.end(buf);
    return true;
  }

  const oauth = createOAuth({ json, isHttps, signIn, audit, uid, now });

  // ---------------------------------------------------------------- entry point
  return async function handleAppApi(req, res, parts, url) {
    await ensureReady();
    const p = parts.join('/');
    if (parts[0] === 'auth') return oauth(req, res, parts, url); // Google / Facebook sign-in
    if (p === 'handoff' && req.method === 'GET') {
      const t = url.searchParams.get('t') || '';
      let row = null;
      if (auth.STATELESS) { const d = t.length < 600 ? auth.unsign(t) : null; if (d && d.h) row = { userId: d.h, next: d.n, createdAt: d.c }; }
      else {
        row = t ? await docs.findOne('app_handoff', { id: auth.sha(t) }) : null;
        if (row) await docs.remove('app_handoff', row.id);
      }
      const user = row && Date.now() - row.createdAt < 120000 ? await docs.findOne('app_users', { id: row.userId }) : null;
      if (!user || !user.active) { res.writeHead(302, { Location: '/app/#/signin?error=' + encodeURIComponent('That sign-in link has expired. Please sign in again.'), 'Cache-Control': 'no-store' }); return res.end(); }
      await signIn(req, res, user);
      res.writeHead(302, { Location: '/app/' + (row.next || '#/'), 'Cache-Control': 'no-store' });
      return res.end();
    }
    const s = await auth.sessionOf(req);
    const signed = s && s.user ? s : null;

    if (p === 'session' && req.method === 'GET') {
      if (!signed) return json(res, 200, { ok: true, signedIn: false, expired: Boolean(s && s.expired), mail: mailReady });
      return json(res, 200, await me(signed.user, signed.session));
    }
    if (!signed || ['login', 'link', 'forgot', 'start', 'signup'].includes(p)) {
      const handled = await publicRoute(req, res, p, url);
      if (handled !== undefined) return;
      if (!signed) return json(res, 401, { ok: false, signedOut: true, expired: Boolean(s && s.expired), message: s && s.expired ? 'You were signed out after a while without activity, to keep health information safe. Please sign in again.' : 'Please sign in.' });
    }
    if (req.method !== 'GET' && req.headers['x-csrf'] !== signed.session.csrf) {
      return json(res, 403, { ok: false, message: 'Please refresh the page and try again.' });
    }
    try {
      // medical record files are sent as raw bytes (not JSON) and downloaded as files
      if (parts[0] === 'people' && parts[2] === 'records' && parts.length === 3 && req.method === 'POST') return await uploadRecord(req, res, parts[1], signed.user);
      if (parts[0] === 'records' && parts[2] === 'file' && req.method === 'GET') return await downloadRecord(req, res, parts[1], signed.user, url);
      const handled = await signedInRoute(req, res, parts, url, signed.user, signed.session);
      if (handled === undefined && !res.headersSent) return json(res, 404, { ok: false, message: 'Not found.' });
    } catch (err) {
      if (err.status === 400) return json(res, 400, { ok: false, message: err.message, errors: err.errors });
      if (err.status === 403 || err.status === 404 || err.status === 413 || err.status === 415 || err.status === 503) return json(res, err.status, { ok: false, message: err.message });
      throw err;
    }
  };
}

module.exports = { createAppApi, productsFor };
