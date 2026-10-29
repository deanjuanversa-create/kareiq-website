#!/usr/bin/env node
// Checks the risk trend rules, the registration-date boundary, the "Download trends" exports and the
// Personal and health details API. Part 1 needs nothing; part 2 needs a local demo server:
//   APP_DEMO=true node server.js        (in another terminal, with a fresh data folder)
//   node tools/check-trends.js http://localhost:3000
const assert = require('assert');
const path = require('path');
const trends = require(path.join(__dirname, '../src/app/trends'));
const firstvisit = require(path.join(__dirname, '../src/app/firstvisit'));
const risk = require(path.join(__dirname, '../src/app/risk'));

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL ' + m); } };

// ---------------------------------------------------------------- 1. rules (no server)
const R = (test, value, level, band, at) => ({ test, value, level, band, display: String(value), at });
const day = (n) => new Date(Date.UTC(2026, 9, 29) - n * 86400000).toISOString();
const desc = { bmi: (v) => risk.bmiRisk(v), title: (t) => t };
// only one assessment
let t = trends.riskTrends([R('phq9', 6, 'ok', 'Mild', day(1))], [], 0, desc)[0];
ok(t.direction === 'none' && t.text === trends.NO_HISTORY && t.previous === null, 'one assessment: no trend, standard message');
// improving / worsening / stable by category
ok(trends.compare('phq9', R('phq9', 6, 'ok', 'Mild'), R('phq9', 11, 'warn', 'Moderate')).direction === 'improving', 'better category: improving');
ok(trends.compare('tug', R('tug', 21, 'warn', 'Fall risk'), R('tug', 17, 'good', 'Good')).direction === 'worsening', 'worse category: worsening');
const st = trends.compare('tug', R('tug', 14.5, 'good', 'Good'), R('tug', 16.8, 'good', 'Good'));
ok(st.direction === 'stable' && st.change === -2.3 && st.pct === -13.7, 'same category: stable with the real change ' + JSON.stringify(st));
// higher is better (MMSE, chair stand) handled by category, and by the number when there is no category
ok(trends.compare('mmse', R('mmse', 26, 'good', 'None'), R('mmse', 20, 'ok', 'Mild')).direction === 'improving', 'MMSE up a category: improving');
ok(trends.compare('chair30', R('chair30', 14, null, 'No reference'), R('chair30', 12, null, 'No reference')).direction === 'improving', 'no category, higher better: improving');
ok(trends.compare('kidney', R('kidney', 8, null, 'Discuss'), R('kidney', 5, null, 'Discuss')).direction === 'worsening', 'no category, lower better: worsening');
ok(trends.compare('kidney', R('kidney', 5, null, 'Discuss'), R('kidney', 5, null, 'Discuss')).direction === 'stable', 'no change: stable');
ok(trends.compare('phq9', R('phq9', 6, 'ok', 'Mild'), R('phq9', 11, 'warn', 'Moderate')).pct === null, 'no percentage for questionnaire points');
// several checks in the last 7 days: newest against the one before it
t = trends.riskTrends([R('gad7', 4, 'good', 'Minimal', day(1)), R('gad7', 8, 'ok', 'Mild', day(3)), R('gad7', 12, 'warn', 'Moderate', day(6))], [], 0, desc)[0];
ok(t.current.value === 4 && t.previous.value === 8 && t.assessments === 3 && t.direction === 'improving', 'multiple in 7 days: compares the two newest');
// repeated timestamps count once
t = trends.riskTrends([R('gad7', 4, 'good', 'Minimal', day(1)), R('gad7', 9, 'ok', 'Mild', day(1)), R('gad7', 8, 'ok', 'Mild', day(5))], [], 0, desc)[0];
ok(t.previous.value === 8 && t.assessments === 2, 'repeated timestamp counted once');
// history for the chart: oldest first, real values, the test's own scale; text results become a list
t = trends.riskTrends([R('gad7', 4, 'good', 'Minimal', day(1)), R('gad7', 8, 'ok', 'Mild', day(3)), R('gad7', 12, 'warn', 'Moderate', day(6))], [], 0, desc)[0];
ok(t.history.map((h) => h.value).join() === '12,8,4' && t.history[0].ms < t.history[2].ms && t.kind === 'numeric' && t.axis[0] === 0 && t.axis[1] === 21, 'history oldest first with the GAD-7 scale');
t = trends.riskTrends([R('balance4', 'Up to stage 2', 'warn', 'Fall risk', day(1)), R('balance4', 'All 4 stages', 'good', 'Normal', day(9))], [], 0, desc)[0];
ok(t.kind === 'categorical' && t.history.length === 2 && t.history[0].value === null && t.direction === 'worsening', 'text results: categorical history, trend by category');
// assessments before registration are ignored
t = trends.riskTrends([R('gad7', 4, 'good', 'Minimal', day(1)), R('gad7', 15, 'bad', 'Severe', day(90))], [], Date.parse(day(30)), desc)[0];
ok(t.direction === 'none', 'assessment before registration not used');
// BMI from weight readings
t = trends.riskTrends([], [{ value: 25, measuredMs: Date.parse(day(1)), measuredAt: day(1) }, { value: 24.9, measuredMs: Date.parse(day(14)), measuredAt: day(14) }], 0, desc)[0];
ok(t.test === 'bmi' && t.direction === 'worsening', 'BMI normal to overweight: worsening');
// dedupe readings
ok(trends.dedupe([{ metric: 'hr', measuredMs: 1 }, { metric: 'hr', measuredMs: 1 }, { metric: 'bp', measuredMs: 1 }]).length === 2, 'duplicate readings removed');
// registration day boundary in India time
ok(trends.registeredMs({ registeredAt: '2026-10-01T03:00:00Z' }) === Date.parse('2026-10-01T00:00:00+05:30'), 'registration counted from the start of that day (IST)');

// workbook definitions
const titles = firstvisit.SECTIONS.map((s) => s.title);
ok(titles.join('|') === 'General Information|Emergency Contact|Doctors Contact|Allergies|Pre-existing Health Conditions', 'workbook sections: ' + titles.join('|'));
ok(!JSON.stringify(firstvisit.definitions().sections).match(/KYC|GPS|Consent|Checklist|ID Type|Photo/) && firstvisit.definitions().excluded[0] === 'General Checklist', 'General Checklist excluded');
ok(firstvisit.FIELDS.length === 53, 'every workbook field present (' + firstvisit.FIELDS.length + ')');
ok(firstvisit.validate({ email: 'x@' }).errors.email, 'email checked');
ok(firstvisit.validate({ phone1: '12' }).errors.phone1, 'phone checked');
ok(firstvisit.validate({ dob: '2999-01-01' }).errors.dob, 'future date of birth refused');
ok(firstvisit.validate({ gender: 'Robot' }).errors.gender, 'drop-down values checked');
ok(firstvisit.validate({ hacked: '<script>' }).data && !('hacked' in firstvisit.validate({ hacked: 1 }).data), 'unknown fields dropped');
ok(firstvisit.validate({ smoking: 'Never', smokingAmount: 'Daily' }).data && !('smokingAmount' in firstvisit.validate({ smoking: 'Never', smokingAmount: 'Daily' }).data), 'follow-up ignored when it does not apply');

// ---------------------------------------------------------------- 2. API (needs a demo server)
const base = process.argv[2];
(async () => {
  if (base) {
    async function login(email) {
      let r = await fetch(base + '/api/app/session');
      let ck = r.headers.getSetCookie().map((c) => c.split(';')[0]).join('; ');
      const csrf = (await r.json()).csrf;
      r = await fetch(base + '/api/app/login', { method: 'POST', headers: { 'content-type': 'application/json', 'x-csrf': csrf, 'x-requested-with': 'kareiq', cookie: ck }, body: JSON.stringify({ id: email, password: 'demo-pass-123' }) });
      const c2 = r.headers.getSetCookie().map((c) => c.split(';')[0]); if (c2.length) ck = c2.join('; ');
      const s = await (await fetch(base + '/api/app/session', { headers: { cookie: ck } })).json();
      return (p, opt = {}) => fetch(base + '/api/app/' + p, { method: opt.method || 'GET', headers: { 'content-type': 'application/json', 'x-csrf': s.csrf, 'x-requested-with': 'kareiq', cookie: ck }, body: opt.body ? JSON.stringify(opt.body) : undefined });
    }
    const fam = await login('family@demo.kareiq');
    // registration boundary: 6 months and 1 year start at the registration date, nothing earlier
    for (const period of ['7d', '1m', '6m', '1y']) {
      const d = await (await fam('people/P-DEMO01/dashboard?period=' + period)).json();
      const minMs = Date.parse(d.range.from + 'T00:00:00+05:30');
      const rows = d.series.flatMap((m) => m.rows);
      ok(rows.every((r) => r.ms >= minMs && r.ms >= Date.parse(d.range.registeredOn + 'T00:00:00+05:30')), period + ': no data before the start or the registration date');
      ok(period === '6m' || period === '1y' ? d.range.clamped === true : d.range.clamped === false, period + ': clamped=' + d.range.clamped);
      const ids = rows.map((r) => r.id); ok(new Set(ids).size === ids.length, period + ': no duplicate readings');
    }
    // export contents match the dashboard and only the chosen vitals and dates
    const d7 = await (await fam('people/P-DEMO01/dashboard?period=7d')).json();
    let r = await fam('people/P-DEMO01/export?period=7d&metrics=hr&parts=readings,averages&format=csv');
    let csv = await r.text();
    const lines = csv.trim().split(/\r\n/).slice(1);
    const meas = lines.filter((l) => l.startsWith('Measurement'));
    ok(meas.length === d7.series.find((m) => m.metric === 'hr').rows.length, 'CSV: one row per heart-rate reading in 7 days (' + meas.length + ')');
    ok(lines.every((l) => !/^(Measurement|Average|Latest),(Blood|Oxygen|Weight)/.test(l)), 'CSV: only heart rate');
    ok(meas.every((l) => l.split(',')[2] >= d7.range.from && l.split(',')[2] <= d7.range.to), 'CSV: dates inside the period');
    const avgLine = lines.find((l) => l.startsWith('Average')); ok(avgLine && avgLine.split(',')[4] === d7.series.find((m) => m.metric === 'hr').average, 'CSV average matches the dashboard');
    ok(r.headers.get('content-disposition').includes('health-trends-heart-rate-'), 'CSV filename');
    // a vital with no data in the period says so
    csv = await (await fam('people/P-DEMO01/export?period=7d&metrics=chol&parts=readings&format=csv')).text();
    ok(/No data,Cholesterol/.test(csv), 'no data for the period is stated');
    // charts are not available in CSV and the file says so
    csv = await (await fam('people/P-DEMO01/export?period=1m&metrics=bp&parts=charts,readings&format=csv')).text();
    ok(/cannot be included in a CSV/.test(csv), 'CSV explains charts are not possible');
    // PDF and Excel
    r = await fam('people/P-DEMO01/export?period=1m&metrics=bp,hr,glucose,spo2&parts=complete&format=pdf');
    let buf = Buffer.from(await r.arrayBuffer()); ok(r.status === 200 && buf.slice(0, 5).toString() === '%PDF-', 'complete PDF');
    r = await fam('people/P-DEMO01/export?period=1m&metrics=glucose,spo2&parts=averages,latest&format=xlsx');
    buf = Buffer.from(await r.arrayBuffer()); ok(r.status === 200 && buf.slice(0, 2).toString() === 'PK', 'Excel workbook');
    // refused requests
    ok((await fam('people/P-DEMO01/export?period=7d&metrics=&parts=readings&format=pdf')).status === 400, 'no vital chosen: refused');
    ok((await fam('people/P-DEMO01/export?period=7d&metrics=bp&parts=readings&format=exe')).status === 400, 'unknown format: refused');
    const nurse = await login('nurse@demo.kareiq');
    ok((await nurse('people/P-DEMO01/export?period=7d&metrics=bp&parts=readings&format=csv')).status === 403, 'caregiver cannot export health history');
    const other = await login('arjun@demo.kareiq');
    ok((await other('people/P-DEMO01/export?period=7d&metrics=bp&parts=readings&format=csv')).status === 404, 'another family cannot export');
    // details: save, reload, conflict, permissions
    const g = await (await fam('people/P-DEMO05/details')).json();
    ok(g.status === 403 || g.ok === false, 'family cannot open someone else\'s details');
    const v0 = (await (await fam('people/P-DEMO01/details')).json()).meta.version;
    // families only read their details; the care team keeps them up to date
    ok((await fam('people/P-DEMO01/details', { method: 'POST', body: { version: v0, data: { name: 'Changed by family' } } })).status === 403, 'family cannot change details');
    ok((await fam('people/P-DEMO01/details', { method: 'POST', body: { version: v0, status: 'complete', data: {} } })).status === 403, 'family cannot change the status either');
    r = await nurse('people/P-DEMO01/details', { method: 'POST', body: { version: v0, data: { name: 'Lakshmi Nair', fdName: 'Dr. Varma', alGeneral: ['Dust mites'] } } });
    const saved = await r.json(); ok(saved.ok && saved.version === v0 + 1, 'caregiver saves details');
    ok((await nurse('people/P-DEMO01/details', { method: 'POST', body: { version: v0, data: { name: 'x' } } })).status === 409, 'stale copy refused, no overwrite');
    const back = await (await fam('people/P-DEMO01/details')).json();
    ok(back.data.fdName === 'Dr. Varma' && back.data.alGeneral[0] === 'Dust mites' && back.data.name === 'Lakshmi Nair' && back.canEdit === false, 'family reads the saved details (read-only)');
    ok((await nurse('people/P-DEMO01/details')).status === 200, 'assigned caregiver can open details');
    // risk checks in the download
    r = await fam('people/P-DEMO01/export?period=6m&metrics=risk:phq9&parts=readings,risktrend&format=csv');
    const rc = await r.text(); ok(r.status === 200 && /Depression check \(PHQ-9\)/.test(rc) && /Improving/.test(rc) && !/Heart disease/.test(rc), 'download with a risk check only');
    ok((await fam('people/P-DEMO01/export?period=6m&metrics=risk:unknown&format=csv')).status === 400, 'unknown risk check: refused');
    const nest = await login('nest@demo.kareiq');
    ok((await nest('people/P-DEMO01/details')).status === 404, 'unassigned caregiver cannot open details');
    const list = await (await nurse('details')).json();
    ok(list.people.length === new Set(list.people.map((p) => p.id)).size && list.people.find((p) => p.id === 'P-DEMO01').status === 'draft', 'caregiver list: one entry per person');
    ok((await fam('details')).status === 403, 'family cannot open the caregiver list');
  }
  console.log(`check-trends: PASS ${pass} FAIL ${fail}${base ? '' : ' (rules only; pass a server address for the API checks)'}`);
  process.exit(fail ? 1 : 0);
})();
