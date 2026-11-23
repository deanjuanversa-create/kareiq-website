#!/usr/bin/env node
// Health insights (app/insights.js): what each kind of record produces, and that nothing is made up.
// Runs on its own:  node tools/check-insights.js
const I = require('../app/insights.js');
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('PASS ', msg); } else { fail++; console.log('FAIL ', msg); } };
const DAY = 86400000, NOW = Date.parse('2026-11-21T06:00:00Z');
const ago = (d) => NOW - d * DAY;
const row = (d, v, level, status, extra) => ({ ms: ago(d), at: new Date(ago(d)).toISOString(), value: v, level, status, ...(extra || {}) });
const bp = (d, s, di, level, status) => ({ ms: ago(d), at: new Date(ago(d)).toISOString(), systolic: s, diastolic: di, level, status });
const series = (metric, label, unit, rows, extra) => ({ metric, label, unit, keys: metric === 'bp' ? ['systolic', 'diastolic'] : ['value'], range: extra && extra.range || 'Standard range', rows, ...(extra || {}) });
const build = (d) => I.build({ series: [], latest: [], ...d }, { now: NOW, q: '?p=P1' });
const one = (list, id) => list.find((x) => x.id === id);

// ---------------------------------------------------------------- no data, no insight
ok(build({}).length === 0, 'no records: no insights at all');
ok(build({ series: [series('hr', 'Heart rate', 'bpm', [])] }).length === 0, 'a measure with no readings gives nothing');

// ---------------------------------------------------------------- attention: latest outside the range
let L = build({ series: [series('bp', 'Blood pressure', 'mmHg', [
  bp(50, 128, 82, 'ok', 'Elevated'), bp(40, 126, 80, 'ok', 'Elevated'),
  bp(20, 138, 88, 'warn', 'High (stage 1)'), bp(10, 142, 90, 'bad', 'High (stage 2)'), bp(2, 136, 86, 'warn', 'High (stage 1)')
], { range: 'Standard 120/80 mmHg' })] });
let x = one(L, 'm-bp');
ok(x && x.kind === 'attention' && x.title === 'Blood pressure: High (stage 1)', 'latest outside range: "needs attention", titled with its existing status');
ok(x.tone === 'bad', 'a "bad" reading in the last 30 days makes it red');
ok(/^3 of 3 readings in the last 30 days were outside the standard range\./.test(x.summary), 'counts readings outside the range (3 of 3)');
ok(/Average higher than the 30 days before \(127\/81 mmHg\)/.test(x.summary), 'compares the 30-day average with the 30 days before (127/81 → higher)');
ok(JSON.stringify(x.facts) === JSON.stringify([['Latest', '136/86 mmHg · 19 Nov'], ['30-day average', '139/88 mmHg · 3 readings'], ['Standard range', '120/80 mmHg']]), 'facts: latest with date, 30-day average, standard range');
ok(x.href === '#/health/vitals?p=P1&m=bp' && x.spark.points.length === 5 && x.spark.points[3].level === 'bad', 'links to its trend; the small chart has every reading of the last 60 days with its level');

// ---------------------------------------------------------------- improving: more readings in range than the month before
L = build({ series: [series('glucose', 'Blood sugar', 'mg/dL', [row(55, 118, 'warn', 'Pre-diabetic'), row(45, 112, 'warn', 'Pre-diabetic'), row(35, 96, 'good', 'Normal'), row(20, 95, 'good', 'Normal'), row(10, 92, 'good', 'Normal'), row(3, 94, 'good', 'Normal')])] });
x = one(L, 'm-glucose');
ok(x && x.kind === 'improving' && x.tone === 'good', 'in range now and more often than before: "improving"');
ok(x.summary === '3 of 3 in range in the last 30 days, compared with 1 of 3 in the 30 days before.', 'says exactly how many were in range in each period');

// ---------------------------------------------------------------- going well
L = build({ series: [series('hr', 'Heart rate', 'bpm', [row(40, 78, 'good', 'Normal'), row(12, 72, 'good', 'Normal'), row(1, 74, 'good', 'Normal')])] });
x = one(L, 'm-hr');
ok(x && x.kind === 'good' && /^All 2 readings in the last 30 days were within the standard range\. Average lower than the 30 days before \(78 bpm\)\.$/.test(x.summary), 'all in range: "within range"; average 73 vs 78 bpm before is "lower"');
L = build({ series: [series('hr', 'Heart rate', 'bpm', [row(40, 75, 'good', 'Normal'), row(12, 74, 'good', 'Normal'), row(1, 76, 'good', 'Normal')])] });
ok(/About the same as the 30 days before \(75 bpm\)/.test(one(L, 'm-hr').summary), 'a 0 bpm difference is "about the same"');

// ---------------------------------------------------------------- slightly outside ("ok" level is not "within range")
L = build({ series: [series('bmi', 'Body Mass Index', 'kg/m²', [row(20, 24.6, 'good', 'Normal'), row(2, 25.1, 'ok', 'Overweight')])] });
x = one(L, 'm-bmi');
ok(x && x.kind === 'watch' && x.title === 'Body Mass Index: Overweight' && /the latest slightly/.test(x.summary), '"Overweight" (slightly outside) is worth watching, not "within range"');
ok(x.href === '#/health/body?p=P1&m=bmi', 'body measures link to Body composition');

// ---------------------------------------------------------------- an old reading outside the range, nothing newer
L = build({ series: [series('chol', 'Cholesterol', 'mg/dL', [row(56, 212, 'warn', 'Borderline high')])] });
x = one(L, 'm-chol');
ok(x && x.title === 'Cholesterol: Borderline high at the last check' && /^Last checked on 26 Sept \(212 mg\/dL\)\. There is no newer reading\.$/.test(x.summary), 'old result outside range: says when it was last checked');

// ---------------------------------------------------------------- a measure checked at every visit but not recently
L = build({ series: [series('spo2', 'Oxygen level', '%', [row(40, 97, 'good', 'Normal'), row(20, 98, 'good', 'Normal')])] });
x = one(L, 'gap-spo2');
ok(x && x.kind === 'gap' && x.title === 'Oxygen level: not checked for 20 days' && /last reading was on 1 Nov/.test(x.summary), 'not checked for 20 days: a gap insight with the last date');
L = build({ series: [series('spo2', 'Oxygen level', '%', [row(10, 97, 'good', 'Normal')])] });
ok(!one(L, 'gap-spo2'), 'checked 10 days ago: no gap');

// ---------------------------------------------------------------- weight (no standard range): only a clear change
L = build({ series: [series('weight', 'Weight', 'kg', [row(120, 62.0, null), row(60, 61.4, null), row(3, 60.8, null)])] });
x = one(L, 'change-weight');
ok(x && x.title === 'Weight: down 1.2 kg since 24 Jul' && /From 62 kg to 60\.8 kg on 18 Nov \(3 measurements\)/.test(x.summary), 'weight: the change since the first measurement in 6 months');
L = build({ series: [series('weight', 'Weight', 'kg', [row(60, 61.0, null), row(3, 61.2, null)])] });
ok(!one(L, 'change-weight'), 'a 0.2 kg difference is not reported');

// ---------------------------------------------------------------- overall risk category (from the risk engine, as stored)
L = build({ riskStatus: { category: 'red', categoryName: 'Red – High Risk', reason: 'One indicator is Very High Risk.', responsible: [{ short: 'Kidney', display: '45', band: 'Very high' }], at: new Date(ago(1)).toISOString() } });
x = one(L, 'risk');
ok(x && x.tone === 'bad' && x.rank === 0 && x.title === 'Overall risk: Critical' && x.summary === 'One indicator is Very High Risk.', 'red risk: "Critical", first, with the engine\'s own reason');
ok(one(build({ riskStatus: { category: 'amber', reason: 'r' } }), 'risk').title === 'Overall risk: Moderate' && one(build({ riskStatus: { category: 'green', reason: 'r' } }), 'risk').title === 'Overall risk: Good', 'amber is "Moderate", green is "Good" (no colour names)');
ok(x.facts[0][0] === 'Kidney' && x.facts[0][1] === '45 · Very high', 'names the indicators responsible');
ok(!build({ riskStatus: { category: 'none' } }).length, 'no category yet: no risk insight');

// ---------------------------------------------------------------- wellbeing checks
const check = (d, flags) => ({ at: new Date(ago(d)).toISOString(), by: 'Nurse Asha', groups: [{ title: 'Sleep', items: [{ label: 'Sleep', text: flags.includes('Sleep') ? 'Poor' : 'Good', flag: flags.includes('Sleep') }, { label: 'Pain', text: flags.includes('Pain') ? 'Knee, 6/10' : 'None', flag: flags.includes('Pain') }] }] });
x = one(build({ obsHistory: [check(1, ['Sleep']), check(4, ['Sleep', 'Pain']), check(8, [])] }), 'wb-repeat');
ok(x && x.title === 'Wellbeing: Sleep flagged more than once' && x.summary === 'Sleep in 2 of the last 3 checks.', 'an item flagged in several checks');
x = one(build({ obsHistory: [check(1, ['Pain']), check(4, [])] }), 'wb-latest');
ok(x && x.summary === 'Pain: Knee, 6/10.', 'items flagged at the latest check, with what was recorded');
x = one(build({ obsHistory: [check(1, [])] }), 'wb-ok');
ok(x && x.kind === 'good', 'nothing flagged: "nothing to watch"');
ok(!build({ obsHistory: [check(90, ['Pain'])] }).length, 'checks older than 60 days are not used');

// ---------------------------------------------------------------- regular recording
L = build({ series: [series('hr', 'Heart rate', 'bpm', [row(1, 74, 'good', 'Normal'), row(5, 72, 'good', 'Normal')]), series('temp', 'Temperature', '°C', [row(1, 36.8, 'good', 'Normal')])], lastVisit: { at: new Date(ago(1)).toISOString(), by: 'Nurse Asha' } });
x = one(L, 'tracking');
ok(x && x.title === 'Good progress: 3 readings in the last 30 days' && x.summary === 'Recorded on 2 days, most recently by Nurse Asha on 20 Nov.', 'counts readings and days actually recorded');

// ---------------------------------------------------------------- order and sections
L = build({ riskStatus: { category: 'amber', categoryName: 'Amber – Needs Attention', reason: 'r' }, series: [
  series('hr', 'Heart rate', 'bpm', [row(2, 74, 'good', 'Normal')]),
  series('glucose', 'Blood sugar', 'mg/dL', [row(2, 130, 'bad', 'Diabetic range')])] });
ok(L[0].id === 'm-glucose' && L[1].id === 'risk', 'most important first (a red reading, then the amber risk)');
const secs = I.sections(L);
ok(secs[0].title === 'Needs attention' && secs[0].items.length === 2 && secs[secs.length - 1].title === 'Going well', 'page sections: Needs attention first, Going well last');
ok(secs.reduce((n, s) => n + s.items.length, 0) === L.length, 'every insight appears once on the page');

console.log(`\ncheck-insights: PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
