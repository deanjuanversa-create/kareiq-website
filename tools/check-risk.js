// node tools/check-risk.js
// Unit checks for the workbook risk rules (src/app/riskrules.js): the workbook's own worked example,
// unresolved decisions staying unresolved, the gaps between bands, and no indicator ever proposing
// a category for a band the workbook leaves uncategorised. No server needed.
const R = require('../src/app/riskrules.js');
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// ---- structure
ok(R.INDICATORS.length === 22, 'workbook indicators: ' + R.INDICATORS.length);
ok(R.DECISIONS.length === 18, 'unresolved decisions recorded: ' + R.DECISIONS.length);
for (const d of R.DECISIONS) {
  ok(d.question && d.refs && d.refs.length, 'decision has a question and workbook references: ' + d.id);
  ok(d.kind === 'thresholds' ? d.fields && d.fields.length : d.options && d.options.length >= 2, 'decision has alternatives: ' + d.id);
}
for (const i of R.INDICATORS) {
  ok(typeof i.calc === 'function' || i.blocked, 'indicator calculates or is blocked: ' + i.id);
  for (const b of R.bandsOf(i, {})) ok(b.proposed === null || ['red', 'amber', 'green'].includes(b.proposed), 'band proposal is a category or open: ' + i.id + '/' + b.key);
}
ok(Boolean(R.BY_ID.copd.blocked), 'COPD stays blocked (no formula in the workbook)');
ok(R.RANK.red > R.RANK.amber && R.RANK.amber > R.RANK.green, 'worst case order red > amber > green');

// ---- the workbook's kidney example: female, 50, eGFR 15, ACR 300 mg/g → "Greater than 70%"
const kidney = R.BY_ID.kidney;
const kx = { sex: 'female', age: 50, egfr: 15, acr: 300 };
ok(kidney.calc(kx, {}).unresolved === 'kidney-acr-range', 'kidney waits for the ACR range decision');
const k = kidney.calc(kx, { 'kidney-acr-range': '10-3000' });
ok(k.display === 'Greater than 70%', 'workbook kidney example: ' + k.display);
ok(k.bandKey === null && k.gap === 'kidney-cutoffs', 'kidney band waits for the cut-offs decision');
const k2 = kidney.calc(kx, { 'kidney-acr-range': '10-3000', 'kidney-cutoffs': { amberFrom: 10, redFrom: 40 } });
ok(k2.bandKey === 'veryhigh', 'kidney band once cut-offs are approved: ' + k2.bandKey);

// ---- PHQ-9: within range, band keys from the workbook
const phq = R.BY_ID.phq9;
ok(phq.calc({ phq9: 3 }, {}).bandKey === 'minimal' && phq.calc({ phq9: 12 }, {}).bandKey === 'moderate', 'PHQ-9 bands');
ok(R.bandsOf(phq, {}).filter((b) => b.proposed === null).length > 0, 'PHQ-9 has bands the workbook leaves uncategorised');

// ---- CVD: the 7.4–7.5 and 19.9–20 gaps are not silently placed in a band
const cvd = R.BY_ID.cvd;
ok(cvd.calc({ sex: 'female', age: 60, sbp: 130, crp: 1, chol: 200, hdl: 50 }, {}).unresolved, 'CVD waits for the formula decision');

// ---- inputs: typing-mistake limits exist for every assessment input
for (const [k, v] of Object.entries(R.INPUTS)) ok(v.label && (v.options || (Number.isFinite(v.min) && Number.isFinite(v.max))), 'input has limits: ' + k);

// ---- consensus: a value is used only where every reading of an inconsistent workbook agrees
const tugI = R.BY_ID.tug;
ok(R.consensus(tugI, { tug: 8 }, {}).bandKey === 'normal', 'TUG 8 s: Normal mobility on both sheets');
ok(R.consensus(tugI, { tug: 25 }, {}).unresolved, 'TUG 25 s: the sheets disagree, unresolved');
ok(R.consensus(tugI, { tug: 25 }, { 'tug-bands': 'a' }).bandKey === 'potential', 'TUG 25 s once an answer is recorded');
ok(R.consensus(kidney, kx, {}).display === 'Greater than 70%', 'kidney: ACR 300 is inside both ACR ranges, so the range question does not matter');
ok(R.consensus(kidney, { ...kx, acr: 5 }, {}).unresolved, 'kidney: ACR 5 is outside one range, unresolved');
const bp = R.BY_ID.bp_std;
ok(R.consensus(bp, { bp: { systolic: 118, diastolic: 76 } }, {}).bandKey === 'standard', 'BP 118/76 Standard under both readings');
ok(R.consensus(bp, { bp: { systolic: 120, diastolic: 76 } }, {}).unresolved, 'BP 120/76 sits on the boundary both bands include: unresolved');
ok(R.consensus(bp, { bp: { systolic: 145, diastolic: 92 } }, {}).bandKey === 'stage2', 'BP 145/92 High, stage 2');
ok(R.consensus(R.BY_ID.idrs, { idrs: 55 }, {}).unresolved && R.consensus(R.BY_ID.idrs, { idrs: 20 }, {}).bandKey === 'low', 'IDRS: 51–60 gap unresolved, 20 low');
ok(R.consensus(R.BY_ID.cvd, { sex: 'male', age: 60, sbp: 130, chol: 200, hdl: 50, crp: 1 }, {}).unresolved, 'heart risk: two formulas, unresolved for every value');
ok(R.consensus(R.BY_ID.spo2_std, { spo2: 93 }, {}).unresolved && R.consensus(R.BY_ID.spo2_std, { spo2: 97 }, {}).bandKey === 'standard', 'SpO2 93% gap unresolved, 97% standard');
ok(R.consensus(R.BY_ID.snehita, { age: 50, menarcheAge: 13, irregularCycles: false, breastfed24: true, familyBC: false, breastBiopsy: false, firstBirth: 'under25' }, {}).bandKey, 'Snehita calculates away from the 0.574 boundary');
ok(R.DECISIONS.filter((d) => d.affects === 'all').map((d) => d.id).sort().join() === 'balance-method,cvd-formula,elf-formula,fib4-formula,mmse-scale,reach-method', 'six decisions are whole-indicator conflicts');
// agreed wording: "very high" Red; "elevated, moderate, medium, intermediate, high" Amber; normal/low/good/standard Green
for (const i of R.INDICATORS) for (const b of i.bands) {
  if (!b.proposed) continue;
  const w = b.label.toLowerCase();
  const exp = /very[ -]high/.test(w) ? 'red' : /elevated|moderate|medium|intermediate|high|risky|at or above the attention|under 10/.test(w) && !/high pi/.test(w) ? 'amber' : 'green';
  ok(b.proposed === exp, 'agreed wording for ' + i.id + '/' + b.key + ' (' + b.label + '): ' + b.proposed + ' expected ' + exp);
}
// ---- the owner's choice: the "Risk and Other Indicators" sheet decides where the sheets disagree
const SC = R.SHEET_CHOICES;
ok(SC['tug-bands'] === 'a' && SC['balance-method'] === 'seconds' && SC['reach-method'] === 'inches' && SC['fib4-formula'] === 'divide', 'sheet defaults: TUG bands, balance in seconds, reach in inches, FIB-4 divided');
ok(R.consensus(tugI, { tug: 25 }, SC).bandKey === 'potential' && R.consensus(tugI, { tug: 31 }, SC).bandKey === 'high', 'TUG with the sheet: 25 s possible fall risk, 31 s high');
ok(R.consensus(R.BY_ID.balance4, { balanceSeconds: 24 }, SC).bandKey === 'low' && R.consensus(R.BY_ID.balance4, { balanceSeconds: 8 }, SC).bandKey === 'highrisk', 'balance with the sheet: 24 s low, 8 s high');
ok(R.consensus(R.BY_ID.reach, { reach: 25 }, SC).bandKey === 'moderate', 'reach with the sheet: 25 cm (9.8 in) moderate');
ok(!R.INDICATORS.filter((i) => i.vital).some(R.IN_OVERALL) && R.INDICATORS.filter((i) => !i.vital).every(R.IN_OVERALL), 'the overall uses the sheet purposes only, not single vitals');
console.log(`check-risk: PASS ${pass} FAIL ${fail}`);
process.exit(fail ? 1 : 0);
