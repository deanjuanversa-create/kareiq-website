#!/usr/bin/env node
// Checks the data behind the family Home page against a running demo server (fresh data folder):
// the care team and upcoming visits (GET people/:id/care), who may read them, and the other sources
// Home reads (package, services, dashboard, records) for a customer with and without data.
//   APP_DEMO=true node server.js      (fresh data folder), then:
//   node tools/check-home.js http://localhost:3000
const URL0 = process.argv[2] || 'http://localhost:3000';
const BASE = URL0.replace(/\/$/, '') + '/api/app/';
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('PASS ', msg); } else { fail++; console.log('FAIL ', msg); } };
const todayIST = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

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
  if (id) {
    const r = await call('POST', 'login', { id, password: 'demo-pass-123' });
    if (r.status !== 200) throw new Error('login failed for ' + id);
    csrf = (await call('GET', 'session')).body.csrf;
  }
  return call;
}

(async () => {
  const fam = await login('family@demo.kareiq'), office = await login('admin@demo.kareiq'), nurse = await login('nurse@demo.kareiq');
  const meena = await login('meena@demo.kareiq'), rahul = await login('rahul@demo.kareiq'), anon = await login(null);
  const today = todayIST();

  // ---------------------------------------------------------------- care team and upcoming visits
  let r = await fam('GET', 'people/P-DEMO01/care');
  ok(r.status === 200 && r.body.ok, 'family reads their mother\'s care team and visits (200)');
  const c = r.body;
  ok(c.team.length === 1 && c.team[0].name === 'Nurse Anjali (demo)' && c.team[0].role === 'Nurse', 'care team = the nurse assigned to this customer');
  ok(!/phone|email|"id"/i.test(JSON.stringify(c.team)), 'no nurse phone, email or user id is sent to the family');
  ok(c.upcoming.length >= 1 && c.upcoming.every((v) => v.date >= today), 'only visits from today on');
  ok(c.upcoming.every((v) => ['assigned', 'accepted', 'in_progress', 'awaiting_assignment'].includes(v.status)), 'completed and cancelled visits are left out');
  ok(c.upcoming.every((v, i, a) => !i || (a[i - 1].date + (a[i - 1].start || '99')) <= (v.date + (v.start || '99'))), 'visits are in date and time order');
  const physio = c.upcoming.find((v) => v.service === 'physiotherapy' && v.confirmed);
  ok(physio && physio.nurse === 'Anjali' && physio.routine === false, 'a booked service shows the nurse\'s first name, without title or note ("Anjali")');
  ok(c.upcoming.some((v) => v.routine && v.service === 'home-visit'), 'routine home visits are marked routine (not a booking)');
  const waiting = c.upcoming.find((v) => v.status === 'awaiting_assignment');
  ok(waiting && waiting.confirmed === false && waiting.nurse === null, 'a visit still waiting for a nurse is not confirmed');

  r = await fam('GET', 'people/P-DEMO02/care');
  ok(r.status === 200 && r.body.upcoming.filter((v) => v.nurse).every((v) => /^[A-Za-z]+$/.test(v.nurse)), 'a nurse named "Joseph, KareNest care team" shows as "Joseph" (no comma): ' + r.body.upcoming.map((v) => v.nurse).filter(Boolean).join(', '));
  r = await meena('GET', 'people/P-DEMO05/care');
  ok(r.status === 200 && r.body.upcoming.every((v) => v.routine), 'Meena\'s father: only routine visits, so Home shows "No upcoming booking"');

  r = await rahul('GET', 'people/P-DEMO03/care');
  ok(r.status === 200 && r.body.team.length === 0, 'no package bought: no care team yet (empty state)');

  // ---------------------------------------------------------------- who may read it
  r = await fam('GET', 'people/P-DEMO04/care');
  ok(r.status === 404, 'a family cannot read another customer\'s care team (404)');
  r = await nurse('GET', 'people/P-DEMO01/care');
  ok(r.status === 403, 'nurses do not use this family page (403)');
  r = await office('GET', 'people/P-DEMO01/care');
  ok(r.status === 200 && r.body.team.length === 1, 'the office can read it (200)');
  r = await anon('GET', 'people/P-DEMO01/care');
  ok(r.status === 401, 'signed out: refused (401)');
  r = await fam('POST', 'people/P-DEMO01/care', {});
  ok(r.status !== 200, 'read-only: POST is not accepted');

  // ---------------------------------------------------------------- the other Home sources, with and without data
  r = await fam('GET', 'people/P-DEMO01/dashboard?period=7d');
  ok(r.status === 200 && r.body.latest.some((x) => x.level === 'bad' || x.level === 'warn') && r.body.riskStatus && r.body.riskStatus.category, 'customer with readings: levels and risk category for insights');
  r = await rahul('GET', 'people/P-DEMO03/dashboard?period=7d');
  ok(r.status === 200 ? !(r.body.latest || []).length : r.status === 404 || r.status === 403, 'customer with no readings: nothing to build insights from (empty state)');
  r = await fam('GET', 'people/P-DEMO01/package');
  ok(r.status === 200 && r.body.plans.some((p) => p.status === 'active' && p.name), 'package: the active package and its name');
  r = await fam('GET', 'people/P-DEMO01/records');
  ok(r.status === 200 && Array.isArray(r.body.rows), 'records: list for the Medical Records card');

  console.log(`\ncheck-home: PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
