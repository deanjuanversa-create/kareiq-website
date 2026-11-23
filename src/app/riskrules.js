// The KareIQ risk rules, translated from the workbook "Draft Data Collection by Caregivers"
// (Copy_of_Draft_Data_Collection_by_Caregivers_2.xlsx). Nothing here is a generic medical rule.
//
// The owner confirmed that the workbook's formulas, bands and thresholds are clinically approved,
// so every indicator is calculated exactly as written and is active without a separate approval.
//
// Where the workbook contradicts itself or leaves a gap, that is a DECISION (a technical
// inconsistency in the workbook, with the cells involved and the alternatives). Nothing is chosen
// silently. Instead each result is calculated under every alternative of every open decision:
//   - when all alternatives give the same result, the workbook is unambiguous for that value and
//     the result is used (for example a TUG of 8 s is "Normal mobility" on both sheets);
//   - when they differ, the result is "unresolved" for that value: it is shown as such, it never
//     counts towards the overall category, and so it can never make anyone Green.
// Decisions with affects: 'all' (two different formulas or methods) are unresolved for every value.
// The owner can record an answer under Office > Settings > Risk rules; it is kept with a name and date.
//
// Band categories apply the wording agreed with the owner ("very high" -> Red; "elevated,
// moderate, medium, intermediate, high" -> Amber; normal/low/good/standard -> Green). Bands whose
// workbook wording does not fall under that agreement have no category (proposed: null): their
// results are shown, never counted, and never Green, until the owner records a category.

const ln = Math.log;
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const pct = (v) => round(v, 1) + '%';

// ---------------------------------------------------------------- inputs the nurse records
// Stored as readings (app_readings) with kind 'assessment', so corrections keep a reason and
// nothing is ever deleted. min/max only catch typing mistakes; they say nothing about health.
const INPUTS = {
  // blood tests (lab reports)
  hdl: { label: 'HDL cholesterol', unit: 'mg/dL', kind: 'lab', min: 5, max: 200, step: 0.1 },
  crp: { label: 'hs-CRP', unit: 'mg/L', kind: 'lab', min: 0.01, max: 300, step: 0.01 },
  hba1c: { label: 'HbA1c', unit: '%', kind: 'lab', min: 3, max: 20, step: 0.1 },
  egfr: { label: 'Estimated GFR (eGFR)', unit: 'ml/min/1.73 m²', kind: 'lab', min: 1, max: 200, step: 0.1 },
  acr: { label: 'Urine albumin creatinine ratio (ACR)', unit: 'mg/g', kind: 'lab', min: 0.1, max: 30000, step: 0.1, altUnit: { unit: 'mg/mmol', factor: 11.3, ref: '5Y Kidney Risk!E5:F5' } },
  ast: { label: 'AST', unit: 'U/L', kind: 'lab', min: 1, max: 5000, step: 1 },
  alt: { label: 'ALT', unit: 'U/L', kind: 'lab', min: 1, max: 5000, step: 1 },
  plt: { label: 'Platelet count', unit: '×10⁹/L', kind: 'lab', min: 1, max: 2000, step: 1 },
  alb: { label: 'Serum albumin', unit: 'g/dL', kind: 'lab', min: 0.5, max: 7, step: 0.1 },
  ha: { label: 'Hyaluronic acid (HA)', unit: 'ng/mL', kind: 'lab', min: 0.1, max: 10000, step: 0.1 },
  p3np: { label: 'PIIINP', unit: 'ng/mL', kind: 'lab', min: 0.1, max: 1000, step: 0.1 },
  timp1: { label: 'TIMP-1', unit: 'ng/mL', kind: 'lab', min: 1, max: 10000, step: 0.1 },
  // questionnaire totals
  psqi: { label: 'PSQI total (sleep)', unit: 'points', kind: 'questionnaire', min: 0, max: 21, step: 1, integer: true },
  idrs: { label: 'IDRS total (diabetes risk)', unit: 'points', kind: 'questionnaire', min: 0, max: 100, step: 1, integer: true },
  phq9: { label: 'PHQ-9 total (mood)', unit: 'points', kind: 'questionnaire', min: 0, max: 27, step: 1, integer: true },
  gad7: { label: 'GAD-7 total (anxiety)', unit: 'points', kind: 'questionnaire', min: 0, max: 21, step: 1, integer: true },
  mmse: { label: 'MMSE total (memory)', unit: 'points', kind: 'questionnaire', min: 0, max: 30, step: 1, integer: true },
  // home tests (falls)
  tug: { label: 'Timed Up and Go', unit: 'seconds', kind: 'home', min: 1, max: 300, step: 0.1 },
  balanceStage: { label: '4-Stage Balance: last stage held for 10 seconds', unit: 'stage', kind: 'home', min: 0, max: 4, step: 1, integer: true, options: { 0: 'None', 1: 'Stage 1: feet side by side', 2: 'Stage 2: one foot half ahead', 3: 'Stage 3: tandem (heel to toe)', 4: 'Stage 4: one leg (all four held)' } },
  balanceSeconds: { label: '4-Stage Balance: seconds held', unit: 'seconds', kind: 'home', min: 0, max: 300, step: 0.1 },
  reach: { label: 'Functional Reach', unit: 'cm', kind: 'home', min: 0, max: 80, step: 0.5 },
  chair30: { label: '30-Second Chair Stand', unit: 'stands', kind: 'home', min: 0, max: 60, step: 1, integer: true }
};
const INPUT_GROUPS = [
  ['lab', 'Blood and urine test results', 'From the latest lab report. Enter the date the sample was taken.'],
  ['questionnaire', 'Questionnaire totals', 'The total score from each completed questionnaire.'],
  ['home', 'Home tests (falls and mobility)', 'Results of the home-based tests done on the visit.']
];

// Facts about the person (they rarely change), kept on the person's record (app_people)
const FACTS = {
  smoker: { label: 'Smokes now?', type: 'yesno' },
  parentalMI: { label: 'A parent had a heart attack before 60?', type: 'yesno' },
  diabetic: { label: 'Has diabetes?', type: 'yesno' },
  impairedFastingGlucose: { label: 'Impaired fasting glucose (pre-diabetes) diagnosed?', type: 'yesno' },
  menarcheAge: { label: 'Age at first period (years)', type: 'number', min: 7, max: 20, women: true },
  irregularCycles: { label: 'Irregular menstrual cycles?', type: 'yesno', women: true },
  breastfed24: { label: 'Breastfed for 24 months or more in total?', type: 'yesno', women: true },
  familyBC: { label: 'Mother, sister or daughter had breast cancer?', type: 'yesno', women: true },
  breastBiopsy: { label: 'Ever had a breast biopsy?', type: 'yesno', women: true },
  firstBirth: { label: 'Age at first live birth', type: 'select', women: true, options: { under25: 'Under 25', '25to29': '25 to 29', none: 'No children (nulliparous)', '30plus': '30 or older' } }
};

// ---------------------------------------------------------------- decisions
// kind: 'choice' (pick one option), 'thresholds' (numbers the clinical team enters)
const D = (id, indicator, question, refs, options, extra) => ({ id, indicator, kind: 'choice', question, refs, options, ...(extra || {}) });
const DECISIONS = [
  D('boundary', '_global', 'A score exactly on a boundary that the workbook gives to two bands (for example Snehita 0.574 is the end of "0.4004–0.574 Moderate" and the start of "0.574–0.795 High"): which band does it belong to?',
    ['Risk and Other Indicators!F4'], [{ id: 'lower', label: 'The lower band' }, { id: 'higher', label: 'The higher band' }]),

  D('cvd-formula', 'cvd', 'Heart risk: which Reynolds formula is authoritative?',
    ['RiskCalculation&Formulas!A7', 'RiskCalculation&Formulas!A9', 'Heart Risk by Gender!A3:A9'],
    [{ id: 'gender', label: 'Separate men\'s and women\'s equations (Heart Risk by Gender sheet)', detail: 'Men: B = 4.385·ln(Age) + 2.607·ln(SBP) + 0.963·ln(TC) − 0.772·ln(HDL) + 0.102·ln(hs-CRP) + 0.405·Smoker + 0.541·ParentalMI; Risk = 100·(1 − 0.8990^exp(B − 33.097)). Women: B = 0.0799·Age + 3.137·ln(SBP) + 0.180·ln(hs-CRP) + 1.382·ln(TC) − 1.172·ln(HDL) + 0.134·HbA1c (if diabetic) + 0.818·Smoker + 0.438·ParentalMI; Risk = 100·(1 − 0.98634^exp(B − 22.325)).' },
      { id: 'combined', label: 'One equation for everyone (RiskCalculation&Formulas sheet)', detail: 'X = 0.0799·Age + 3.137·ln(SBP) + 0.180·ln(hs-CRP) + 1.382·ln(TC) − 1.172·ln(HDL) + 0.818·Smoking + 0.438·FamilyHistory; Risk = (1 − 0.98634^exp(X))·100. As written it has no "− 22.325" constant, so it gives close to 100% for every realistic input.' }], { affects: 'all' }),
  D('cvd-bands', 'cvd', 'Heart risk bands leave gaps (7.4–7.5% and 19.9–20%). Where do those values go?',
    ['Risk and Other Indicators!F3', 'RiskCalculation&Formulas!A19:A22'],
    [{ id: 'a', label: 'Below 5 low · 5 to under 7.5 borderline · 7.5 to under 20 intermediate · 20 or more high' },
      { id: 'b', label: 'Below 5 low · 5 to under 7.5 borderline · 7.5 to 20 intermediate · more than 20 high' }]),
  D('cvd-diabetic-men', 'cvd', 'The workbook says the men\'s equation was not validated for men with diabetes. For a diabetic man:',
    ['Heart Risk by Gender!A40', 'Heart Risk by Gender!D31'],
    [{ id: 'calculate', label: 'Calculate and show the warning' }, { id: 'skip', label: 'Do not calculate (Not assessed)' }]),

  D('kidney-acr-range', 'kidney', 'Kidney: the allowed ACR range cell was turned into a date by Excel ("Oct 3000"). Values outside the range are set to the nearest limit (cell D5). Which range?',
    ['5Y Kidney Risk!E2:F2', '5Y Kidney Risk!D5'],
    [{ id: '10-3000', label: '10 to 3000 mg/g (my reading of the corrupted cell)' }, { id: 'none', label: 'Do not limit ACR' }]),
  { id: 'kidney-cutoffs', indicator: 'kidney', kind: 'thresholds', question: 'Kidney: the workbook gives no risk bands, only the 5-year percentage (from "less than 5%" to "more than 70%"). Enter the cut-offs.',
    refs: ['5Y Kidney Risk!B15:C19', 'Risk and Other Indicators!F6'], fields: [['amberFrom', 'Needs attention (Amber) from', '%'], ['redFrom', 'Very high (Red) from', '%']] },

  D('fib4-formula', 'fib4', 'FIB-4: the two sheets give different formulas. Which is correct?',
    ['Risk and Other Indicators!D9', 'RiskCalculation&Formulas!A36'],
    [{ id: 'divide', label: '(Age × AST) / (Platelets × √ALT) (Risk and Other Indicators)' }, { id: 'multiply', label: 'Age × AST × Platelets × √ALT (RiskCalculation&Formulas)' }], { affects: 'all' }),
  D('fib4-low', 'fib4', 'FIB-4: the low band reads "<1.3 - 1.45 - Low risk". What is the low cut-off?',
    ['Risk and Other Indicators!F9'],
    [{ id: '1.3', label: 'Below 1.3 low, 1.3 to 2.67 intermediate' }, { id: '1.45', label: 'Below 1.45 low, 1.45 to 2.67 intermediate' }]),

  D('elf-formula', 'elf', 'ELF: is the 0.394 coefficient on ln(TIMP-1) included?',
    ['Risk and Other Indicators!D11', 'RiskCalculation&Formulas!A44'],
    [{ id: 'with', label: '2.278 + 0.851·ln(HA) + 0.751·ln(PIIINP) + 0.394·ln(TIMP-1)' }, { id: 'without', label: '2.278 + 0.851·ln(HA) + 0.751·ln(PIIINP) + ln(TIMP-1)' }], { affects: 'all' }),
  D('elf-9.8', 'elf', 'ELF: "7.7 to <9.8 moderate" and ">9.8 high" leave exactly 9.8 uncovered. Where does 9.8 go?',
    ['Risk and Other Indicators!F11'], [{ id: 'moderate', label: 'Moderate' }, { id: 'high', label: 'High' }]),

  D('idrs-gap', 'idrs', 'IDRS: "30–50 Medium" and ">60 High" leave 51–60 uncovered. Where do 51–60 go?',
    ['Risk and Other Indicators!F7'],
    [{ id: 'a', label: '30–59 medium, 60 or more high' }, { id: 'b', label: '30–50 medium, 51 or more high' }, { id: 'c', label: '30–60 medium, more than 60 high' }]),

  D('mmse-scale', 'mmse', 'MMSE has two scales in the workbook. Which one decides the band?',
    ['Risk and Other Indicators!F14:F15'],
    [{ id: 'cognitive', label: 'Cognitive impairment: 0–17 severe, 18–23 mild, 24–30 none' },
      { id: 'dementia', label: 'Dementia odds: below 21 increased odds, above 25 decreased odds (21–25 is not covered and gets its own band to map)' }], { affects: 'all' }),

  D('tug-bands', 'tug', 'TUG: the two sheets band it differently, and "10–19" / ">20" / ">30" leave 19–20 s and exactly 30 s uncovered. Which bands?',
    ['Risk and Other Indicators!F16', 'Standard Range!C34:E34'],
    [{ id: 'a', label: 'Indicators sheet: under 10 normal · 10 to under 20 good · 20 to 30 possible fall risk · more than 30 high fall risk' },
      { id: 'b', label: 'Indicators sheet: under 10 normal · 10 to under 20 good · 20 to under 30 possible fall risk · 30 or more high fall risk' },
      { id: 'c', label: 'Standard Range sheet: under 10 normal mobility · 10 to under 20 good mobility · 20 or more increased fall risk' }]),

  D('balance-method', 'balance4', '4-Stage Balance: one sheet bands it by seconds, the other by which stage can be held. Which method?',
    ['Risk and Other Indicators!F17', 'Standard Range!C38:D39'],
    [{ id: 'stage', label: 'By stage held for 10 seconds (Standard Range): all four held = normal; stage 3 or stage 4 not held = increased fall risk' },
      { id: 'seconds', label: 'By seconds held (Risk and Other Indicators): under 10 s high fall risk, over 21 s low fall risk (10–21 s is not covered and gets its own band to map)' }], { affects: 'all' }),

  D('reach-method', 'reach', 'Functional Reach: one sheet bands it in inches, the other gives single cm values by sex with no bands. Which?',
    ['Risk and Other Indicators!F18', 'Standard Range!C40:D41'],
    [{ id: 'inches', label: 'Inches: over 10 low risk, 6–10 moderate risk, under 6 high risk (cm ÷ 2.54)' },
      { id: 'cm', label: 'cm by sex: at or above 38.1 cm (men) / 35.1 cm (women) normal, below it increased risk (my reading of single values; needs clinical confirmation)' }], { affects: 'all' }),

  D('bp-std', 'bp_std', 'Blood pressure: "Standard 120 / 80" and "Elevated 120–129" both include 120. Which?',
    ['Standard Range!C2:J2'],
    [{ id: 'a', label: 'Standard below 120 and below 80 · Elevated 120–129 and below 80 · Stage 1 130–139 or 80–89 · Stage 2 140+ or 90+' },
      { id: 'b', label: 'Standard up to 120 and up to 80 · Elevated 121–129 and below 80 · Stage 1 130–139 or 81–89 · Stage 2 140+ or 90+' }]),
  D('spo2-gap', 'spo2_std', 'Oxygen: "95–100% Standard" and "88–92% Risky" leave 93–94% uncovered. Where do 93–94% go?',
    ['Standard Range!C4:H4'], [{ id: 'risky', label: 'Risky' }, { id: 'standard', label: 'Standard' }, { id: 'own', label: 'Their own band (to map)' }]),
  D('pi-1', 'pi_std', 'Perfusion index: "> 1 good" and "< 1 weak" leave exactly 1 uncovered. Where does 1 go?',
    ['Standard Range!C8:F8'], [{ id: 'weak', label: 'Weak blood flow' }, { id: 'good', label: 'Good blood flow' }])
];
const DECISION = Object.fromEntries(DECISIONS.map((x) => [x.id, x]));

// ---------------------------------------------------------------- helpers for bands
function pickBand(bands, key) { const b = bands.find((x) => x.key === key); return b ? { key: b.key, label: b.label } : null; }
const yes = (v) => v === true;

// ---------------------------------------------------------------- the indicators
// needs: inputs (readings) the calculation uses; facts: person facts; base: sex/age/vitals
// calc(x, c) returns { value, display, bandKey } or { unresolved: decisionId } or { skip: reason }.
// A bandKey of null with gap: decisionId means the value sits in a gap that is not decided yet.
const INDICATORS = [
  {
    id: 'cvd', group: 'heart', title: 'Heart disease risk (Reynolds 10-year)', short: 'Heart (10-year CVD)',
    refs: ['Risk and Other Indicators!A3:F3', 'RiskCalculation&Formulas!A4:A22', 'Heart Risk by Gender!A1:D48'],
    base: ['sex', 'age', 'sbp', 'chol'], needs: ['hdl', 'crp'], optional: ['hba1c'], facts: ['smoker', 'parentalMI', 'diabetic'],
    decisions: ['cvd-formula', 'cvd-bands', 'cvd-diabetic-men'],
    bands: [{ key: 'low', label: 'Low risk', proposed: 'green' }, { key: 'borderline', label: 'Borderline risk', proposed: null }, { key: 'intermediate', label: 'Intermediate risk', proposed: 'amber' }, { key: 'high', label: 'High risk', proposed: 'amber' }],
    calc(x, c) {
      if (!c['cvd-formula']) return { unresolved: 'cvd-formula' };
      let risk, note = null;
      const smoker = x.smoker ? 1 : 0, pmi = x.parentalMI ? 1 : 0;
      if (c['cvd-formula'] === 'combined') {
        const X = 0.0799 * x.age + 3.137 * ln(x.sbp) + 0.180 * ln(x.crp) + 1.382 * ln(x.chol) - 1.172 * ln(x.hdl) + 0.818 * smoker + 0.438 * pmi;
        risk = (1 - Math.pow(0.98634, Math.exp(X))) * 100;
      } else if (x.sex === 'male') {
        if (x.diabetic) {
          if (!c['cvd-diabetic-men']) return { unresolved: 'cvd-diabetic-men' };
          if (c['cvd-diabetic-men'] === 'skip') return { skip: 'The men\'s equation is not validated for men with diabetes (Heart Risk by Gender!A40).' };
          note = 'The men\'s equation was not validated for men with diabetes.';
        }
        const b = 4.385 * ln(x.age) + 2.607 * ln(x.sbp) + 0.963 * ln(x.chol) - 0.772 * ln(x.hdl) + 0.102 * ln(x.crp) + 0.405 * smoker + 0.541 * pmi;
        risk = 100 * (1 - Math.pow(0.8990, Math.exp(b - 33.097)));
      } else {
        if (x.diabetic && x.hba1c == null) return { missing: ['hba1c'] };
        const b = 0.0799 * x.age + 3.137 * ln(x.sbp) + 0.180 * ln(x.crp) + 1.382 * ln(x.chol) - 1.172 * ln(x.hdl) + (x.diabetic ? 0.134 * x.hba1c : 0) + 0.818 * smoker + 0.438 * pmi;
        risk = 100 * (1 - Math.pow(0.98634, Math.exp(b - 22.325)));
        note = 'The women\'s equation was developed in healthy US women aged 45 and over; it is not validated for Indian populations.';
      }
      // as written: <5 low, 5–7.4 borderline, 7.5–19.9 intermediate, >20 high; the gaps need the decision
      let key = null, gap = null;
      const inGap = (risk > 7.4 && risk < 7.5) || (risk > 19.9 && risk <= 20);
      if (risk < 5) key = 'low';
      else if (risk <= 7.4) key = 'borderline';
      else if (risk >= 7.5 && risk <= 19.9) key = 'intermediate';
      else if (risk > 20) key = 'high';
      else if (inGap && !c['cvd-bands']) gap = 'cvd-bands';
      else if (risk < 7.5) key = 'borderline';
      else if (risk < 20) key = 'intermediate';
      else key = c['cvd-bands'] === 'a' ? 'high' : 'intermediate'; // exactly 20
      return { value: round(risk, 2), display: pct(risk), bandKey: key, gap, note, unit: '%' };
    }
  },
  {
    id: 'kidney', group: 'kidney', title: 'Kidney failure risk (KFRE, 5-year)', short: 'Kidney (5-year)',
    refs: ['5Y Kidney Risk!A1:F19'], base: ['sex', 'age'], needs: ['egfr', 'acr'], decisions: ['kidney-acr-range', 'kidney-cutoffs'],
    bands: [{ key: 'below', label: 'Below the attention cut-off', proposed: 'green' }, { key: 'attention', label: 'At or above the attention cut-off', proposed: 'amber' }, { key: 'veryhigh', label: 'At or above the very-high cut-off', proposed: 'red' }],
    calc(x, c) {
      if (!c['kidney-acr-range']) return { unresolved: 'kidney-acr-range' };
      // exactly as the sheet: eGFR limited to 10–60 (F1, D4), ACR to its range (D5), sex m=1 f=0
      const egfr = Math.min(60, Math.max(10, x.egfr));
      const acr = c['kidney-acr-range'] === '10-3000' ? Math.min(3000, Math.max(10, x.acr)) : x.acr;
      const betaX = 0.2694 * (x.sex === 'male' ? 1 : 0) + -0.2167 * (x.age / 10) + -0.55418 * (egfr / 5) + 0.45608 * ln(acr);
      const betaXbar = 0.2694 * 0.5642 + -0.2167 * 7.0355 + -0.55418 * 7.2216 + 0.45608 * 5.2774;
      const risk = 1 - Math.pow(0.924, Math.exp(betaX - betaXbar)); // B15 uses the baseline in B17 (0.924)
      const report = Math.min(0.7, risk);                                // B16
      const display = report === 0.7 ? 'Greater than 70%' : report < 0.05 ? 'Less than 5%' : pct(report * 100); // C19
      const note = x.egfr > 60 ? 'eGFR is above 60; the sheet sets it to 60 for this equation.' : null;
      const t = c['kidney-cutoffs'];
      let key = null, gap = null;
      if (!t) gap = 'kidney-cutoffs';
      else { const v = report * 100; key = v >= t.redFrom ? 'veryhigh' : v >= t.amberFrom ? 'attention' : 'below'; }
      return { value: round(report * 100, 2), display, bandKey: key, gap, note, unit: '%' };
    }
  },
  {
    id: 'fib4', group: 'liver', title: 'Liver scarring (FIB-4 index)', short: 'Liver (FIB-4)',
    refs: ['Risk and Other Indicators!C9:F9', 'RiskCalculation&Formulas!A35:B41'], base: ['age'], needs: ['ast', 'alt', 'plt'], decisions: ['fib4-formula', 'fib4-low'],
    bands: [{ key: 'low', label: 'Low risk', proposed: 'green' }, { key: 'intermediate', label: 'Intermediate risk', proposed: 'amber' }, { key: 'high', label: 'High risk', proposed: 'amber' }],
    calc(x, c) {
      if (!c['fib4-formula']) return { unresolved: 'fib4-formula' };
      const v = c['fib4-formula'] === 'divide' ? (x.age * x.ast) / (x.plt * Math.sqrt(x.alt)) : x.age * x.ast * x.plt * Math.sqrt(x.alt);
      let key = null, gap = null;
      if (v > 2.67) key = 'high';
      else if (v < 1.3) key = 'low';
      else if (v >= 1.45) key = 'intermediate';
      else if (!c['fib4-low']) gap = 'fib4-low'; // 1.3 to under 1.45
      else key = c['fib4-low'] === '1.45' ? 'low' : 'intermediate';
      return { value: round(v, 2), display: String(round(v, 2)), bandKey: key, gap };
    }
  },
  {
    id: 'nfs', group: 'liver', title: 'Fatty liver fibrosis (NAFLD Fibrosis Score)', short: 'Liver (NAFLD)',
    refs: ['Risk and Other Indicators!C10:F10', 'RiskCalculation&Formulas!A25:B33'], base: ['age', 'bmi'], needs: ['ast', 'alt', 'plt', 'alb'], facts: ['diabetic', 'impairedFastingGlucose'], decisions: [],
    bands: [{ key: 'low', label: 'Low probability of advanced fibrosis', proposed: 'green' }, { key: 'intermediate', label: 'Intermediate probability', proposed: 'amber' }, { key: 'high', label: 'High probability of advanced fibrosis', proposed: 'amber' }],
    calc(x) {
      const ifg = x.diabetic || x.impairedFastingGlucose ? 1 : 0;
      const v = -1.675 + 0.037 * x.age + 0.094 * x.bmi + 1.13 * ifg + 0.99 * (x.ast / x.alt) - 0.013 * x.plt - 0.66 * x.alb;
      const key = v < -1.455 ? 'low' : v <= 0.676 ? 'intermediate' : 'high';
      return { value: round(v, 3), display: String(round(v, 3)), bandKey: key };
    },
    // IFG/diabetes is 1 if either is yes; it is only unknown when diabetes is not yes and either answer is missing
    factsReady(x) { return x.diabetic === true || x.impairedFastingGlucose === true || (x.diabetic === false && x.impairedFastingGlucose === false); }
  },
  {
    id: 'elf', group: 'liver', title: 'Enhanced Liver Fibrosis (ELF) score', short: 'Liver (ELF)',
    refs: ['Risk and Other Indicators!C11:F11', 'RiskCalculation&Formulas!A43:B48'], needs: ['ha', 'p3np', 'timp1'], decisions: ['elf-formula', 'elf-9.8'],
    bands: [{ key: 'low', label: 'Low risk', proposed: 'green' }, { key: 'moderate', label: 'Moderate risk', proposed: 'amber' }, { key: 'high', label: 'High risk', proposed: 'amber' }, { key: 'veryhigh', label: 'Very high risk', proposed: 'red' }],
    calc(x, c) {
      if (!c['elf-formula']) return { unresolved: 'elf-formula' };
      const v = 2.278 + 0.851 * ln(x.ha) + 0.751 * ln(x.p3np) + (c['elf-formula'] === 'with' ? 0.394 : 1) * ln(x.timp1);
      let key = null, gap = null;
      if (v < 7.7) key = 'low';
      else if (v < 9.8) key = 'moderate';
      else if (v > 11.3) key = 'veryhigh';
      else if (v > 9.8) key = 'high';
      else if (!c['elf-9.8']) gap = 'elf-9.8';
      else key = c['elf-9.8'];
      return { value: round(v, 2), display: String(round(v, 2)), bandKey: key, gap };
    }
  },
  {
    id: 'snehita', group: 'breast', title: 'Breast cancer risk (Snehita)', short: 'Breast (Snehita)', women: true,
    refs: ['Risk and Other Indicators!A4:F4', 'RiskCalculation&Formulas!A50:B62'], base: ['age'], needs: [], facts: ['menarcheAge', 'irregularCycles', 'breastfed24', 'familyBC', 'breastBiopsy', 'firstBirth'], decisions: ['boundary'],
    bands: [{ key: 'normal', label: 'Normal risk', proposed: 'green' }, { key: 'moderate', label: 'Moderate risk', proposed: 'amber' }, { key: 'high', label: 'High risk', proposed: 'amber' }, { key: 'veryhigh', label: 'Very high risk', proposed: 'red' }],
    calc(x, c) {
      const logit = -0.140 + 0.027 * x.age - 0.082 * x.menarcheAge + 0.453 * (x.irregularCycles ? 1 : 0) - 0.892 * (x.breastfed24 ? 1 : 0) + 0.810 * (x.familyBC ? 1 : 0)
        + 1.420 * (x.breastBiopsy ? 1 : 0) + 0.811 * (x.firstBirth === '25to29' || x.firstBirth === 'none' ? 1 : 0) + 1.035 * (x.firstBirth === '30plus' ? 1 : 0);
      const p = 1 / (1 + Math.exp(-logit));
      let key = null, gap = null;
      if (p < 0.4004) key = 'normal';
      else if (p < 0.574) key = 'moderate';
      else if (p > 0.795) key = 'veryhigh';
      else if (p > 0.574) key = 'high';
      else if (!c.boundary) gap = 'boundary'; // exactly 0.574
      else key = c.boundary === 'lower' ? 'moderate' : 'high';
      return { value: round(p, 4), display: String(round(p, 3)), bandKey: key, gap };
    }
  },
  {
    id: 'bmi', group: 'weight', title: 'Obesity (Body Mass Index)', short: 'Weight (BMI)',
    refs: ['Risk and Other Indicators!A5:F5', 'RiskCalculation&Formulas!A64:B68', 'Standard Range!C11:F12'], base: ['bmi'], needs: [], decisions: [],
    bands: [{ key: 'under', label: 'Underweight', proposed: null }, { key: 'normal', label: 'Normal weight', proposed: 'green' }, { key: 'over', label: 'Overweight', proposed: null },
      { key: 'obese1', label: 'Obese (class I)', proposed: null }, { key: 'obese2', label: 'Obese (class II)', proposed: null }, { key: 'obese3', label: 'Obese (class III)', proposed: null }],
    // BMI is stored to one decimal (weight ÷ height², from the visit), so 24.9/25 and similar steps meet exactly
    calc(x) {
      const v = x.bmi;
      const key = v < 18.5 ? 'under' : v <= 24.9 ? 'normal' : v <= 29.9 ? 'over' : v <= 34.9 ? 'obese1' : v <= 39.9 ? 'obese2' : 'obese3';
      return { value: v, display: v + ' kg/m²', bandKey: key };
    }
  },
  {
    id: 'idrs', group: 'diabetes', title: 'Diabetes risk (IDRS)', short: 'Diabetes (IDRS)',
    refs: ['Risk and Other Indicators!A7:F7'], needs: ['idrs'], decisions: ['idrs-gap'],
    bands: [{ key: 'low', label: 'Low risk', proposed: 'green' }, { key: 'medium', label: 'Medium risk', proposed: 'amber' }, { key: 'high', label: 'High risk', proposed: 'amber' }],
    calc(x, c) {
      const v = x.idrs;
      let key = null, gap = null;
      if (v < 30) key = 'low';
      else if (v <= 50) key = 'medium';
      else if (v > 60) key = 'high';
      else if (!c['idrs-gap']) gap = 'idrs-gap';
      else key = c['idrs-gap'] === 'a' ? (v >= 60 ? 'high' : 'medium') : c['idrs-gap'] === 'b' ? 'high' : 'medium';
      return { value: v, display: v + ' / 100', bandKey: key, gap };
    }
  },
  {
    id: 'psqi', group: 'sleep', title: 'Sleep quality (PSQI)', short: 'Sleep (PSQI)',
    refs: ['Risk and Other Indicators!A2:F2'], needs: ['psqi'], decisions: [],
    bands: [{ key: 'good', label: 'Good sleep quality', proposed: 'green' }, { key: 'poor', label: 'Poor sleep quality', proposed: null }],
    calc(x) { return { value: x.psqi, display: x.psqi + ' / 21', bandKey: x.psqi <= 5 ? 'good' : 'poor' }; }
  },
  {
    id: 'phq9', group: 'mood', title: 'Depression (PHQ-9)', short: 'Mood (PHQ-9)',
    refs: ['Risk and Other Indicators!A12:F12'], needs: ['phq9'], decisions: [],
    bands: [{ key: 'minimal', label: 'Minimal or no depression', proposed: 'green' }, { key: 'mild', label: 'Mild depression', proposed: null }, { key: 'moderate', label: 'Moderate depression', proposed: 'amber' },
      { key: 'modsevere', label: 'Moderately severe depression', proposed: null }, { key: 'severe', label: 'Severe depression', proposed: null }],
    calc(x) { const v = x.phq9; return { value: v, display: v + ' / 27', bandKey: v <= 4 ? 'minimal' : v <= 9 ? 'mild' : v <= 14 ? 'moderate' : v <= 19 ? 'modsevere' : 'severe' }; }
  },
  {
    id: 'gad7', group: 'mood', title: 'Anxiety (GAD-7)', short: 'Anxiety (GAD-7)',
    refs: ['Risk and Other Indicators!A13:F13'], needs: ['gad7'], decisions: [],
    bands: [{ key: 'minimal', label: 'Minimal anxiety', proposed: 'green' }, { key: 'mild', label: 'Mild anxiety', proposed: null }, { key: 'moderate', label: 'Moderate anxiety', proposed: 'amber' }, { key: 'severe', label: 'Severe anxiety', proposed: null }],
    calc(x) { const v = x.gad7; return { value: v, display: v + ' / 21', bandKey: v <= 4 ? 'minimal' : v <= 9 ? 'mild' : v <= 14 ? 'moderate' : 'severe' }; }
  },
  {
    id: 'mmse', group: 'memory', title: 'Memory and thinking (MMSE)', short: 'Memory (MMSE)',
    refs: ['Risk and Other Indicators!A14:F15'], needs: ['mmse'], decisions: ['mmse-scale'],
    bands: [{ key: 'none', label: 'No cognitive impairment', proposed: 'green', scale: 'cognitive' }, { key: 'mild', label: 'Mild cognitive impairment', proposed: null, scale: 'cognitive' }, { key: 'severe', label: 'Severe cognitive impairment', proposed: null, scale: 'cognitive' },
      { key: 'decreased', label: 'Decreased odds of dementia', proposed: 'green', scale: 'dementia' }, { key: 'between', label: '21–25 (not covered by the workbook)', proposed: null, scale: 'dementia' }, { key: 'increased', label: 'Increased odds of dementia', proposed: null, scale: 'dementia' }],
    bandsDecision: 'mmse-scale',
    bandsFor: (c) => (c['mmse-scale'] ? (b) => b.scale === c['mmse-scale'] : null),
    calc(x, c) {
      if (!c['mmse-scale']) return { unresolved: 'mmse-scale' };
      const v = x.mmse;
      const key = c['mmse-scale'] === 'cognitive' ? (v <= 17 ? 'severe' : v <= 23 ? 'mild' : 'none') : (v < 21 ? 'increased' : v > 25 ? 'decreased' : 'between');
      return { value: v, display: v + ' / 30', bandKey: key };
    }
  },
  {
    id: 'tug', group: 'falls', title: 'Timed Up and Go (TUG)', short: 'Falls (TUG)',
    refs: ['Risk and Other Indicators!C16:F16', 'Standard Range!A34:E34'], needs: ['tug'], decisions: ['tug-bands'],
    bands: [{ key: 'normal', label: 'Normal mobility', proposed: 'green' }, { key: 'good', label: 'Good mobility (can go out alone)', proposed: null },
      { key: 'potential', label: 'Potential risk of falls (limited mobility)', proposed: null, notIn: ['c'] }, { key: 'high', label: 'High risk of falls (needs help with mobility)', proposed: 'amber', notIn: ['c'] },
      { key: 'increased', label: 'Increased fall risk (mobility issues)', proposed: null, onlyIn: ['c'] }],
    bandsDecision: 'tug-bands',
    bandsFor: (c) => (c['tug-bands'] ? (b) => (!b.notIn || !b.notIn.includes(c['tug-bands'])) && (!b.onlyIn || b.onlyIn.includes(c['tug-bands'])) : null),
    calc(x, c) {
      const o = c['tug-bands'];
      if (!o) return { unresolved: 'tug-bands' };
      const v = x.tug;
      let key;
      if (v < 10) key = 'normal';
      else if (v < 20) key = 'good';
      else if (o === 'c') key = 'increased';
      else if (o === 'a') key = v > 30 ? 'high' : 'potential';
      else key = v >= 30 ? 'high' : 'potential';
      return { value: v, display: round(v, 1) + ' s', bandKey: key };
    }
  },
  {
    id: 'balance4', group: 'falls', title: '4-Stage Balance test', short: 'Falls (balance)',
    refs: ['Risk and Other Indicators!C17:F17', 'Standard Range!A38:D39'], needs: [], decisions: ['balance-method'],
    needsFor: (c) => (c['balance-method'] === 'seconds' ? ['balanceSeconds'] : c['balance-method'] === 'stage' ? ['balanceStage'] : []),
    bands: [{ key: 'normal', label: 'Holds all four stages (normal)', proposed: 'green', method: 'stage' }, { key: 'stage4', label: 'Cannot hold stage 4 for 10 s (increased fall risk)', proposed: null, method: 'stage' }, { key: 'stage3', label: 'Cannot hold stage 3 for 10 s (increased fall risk)', proposed: null, method: 'stage' },
      { key: 'low', label: 'Over 21 s: low fall risk', proposed: 'green', method: 'seconds' }, { key: 'between', label: '10–21 s (not covered by the workbook)', proposed: null, method: 'seconds' }, { key: 'highrisk', label: 'Under 10 s: high fall risk', proposed: 'amber', method: 'seconds' }],
    bandsDecision: 'balance-method',
    bandsFor: (c) => (c['balance-method'] ? (b) => b.method === c['balance-method'] : null),
    calc(x, c) {
      const m = c['balance-method'];
      if (!m) return { unresolved: 'balance-method' };
      if (m === 'stage') { const s = x.balanceStage; return { value: s, display: s >= 4 ? 'All 4 stages' : s ? 'Up to stage ' + s : 'No stage held', bandKey: s >= 4 ? 'normal' : s === 3 ? 'stage4' : 'stage3' }; }
      const v = x.balanceSeconds;
      return { value: v, display: round(v, 1) + ' s', bandKey: v < 10 ? 'highrisk' : v > 21 ? 'low' : 'between' };
    }
  },
  {
    id: 'reach', group: 'falls', title: 'Functional Reach test', short: 'Falls (reach)',
    refs: ['Risk and Other Indicators!C18:F18', 'Standard Range!A40:D41'], base: ['sex'], needs: ['reach'], decisions: ['reach-method'],
    bands: [{ key: 'low', label: 'Low fall risk (over 10 in)', proposed: 'green', method: 'inches' }, { key: 'moderate', label: 'Moderate fall risk (6–10 in)', proposed: 'amber', method: 'inches' }, { key: 'high', label: 'High fall risk (under 6 in)', proposed: 'amber', method: 'inches' },
      { key: 'atref', label: 'At or above the reference for their sex', proposed: 'green', method: 'cm' }, { key: 'belowref', label: 'Below the reference for their sex', proposed: null, method: 'cm' }],
    bandsDecision: 'reach-method',
    bandsFor: (c) => (c['reach-method'] ? (b) => b.method === c['reach-method'] : null),
    calc(x, c) {
      const m = c['reach-method'];
      if (!m) return { unresolved: 'reach-method' };
      const inch = x.reach / 2.54;
      if (m === 'inches') return { value: x.reach, display: round(x.reach, 1) + ' cm (' + round(inch, 1) + ' in)', bandKey: inch > 10 ? 'low' : inch >= 6 ? 'moderate' : 'high' };
      const ref = x.sex === 'male' ? 38.1 : 35.1;
      return { value: x.reach, display: round(x.reach, 1) + ' cm', bandKey: x.reach >= ref ? 'atref' : 'belowref' };
    }
  },
  {
    id: 'chair30', group: 'falls', title: '30-Second Chair Stand test', short: 'Falls (chair stand)',
    refs: ['Risk and Other Indicators!C19:J32'], base: ['sex', 'age'], needs: ['chair30'], decisions: [],
    bands: [{ key: 'below', label: 'Below average (lower-body weakness)', proposed: null }, { key: 'average', label: 'Average', proposed: 'green' }, { key: 'above', label: 'Above average', proposed: 'green' }],
    // norms from Risk and Other Indicators!F19:G32 (ages 60–94 only)
    norms: {
      male: [[60, 64, 14, 19], [65, 69, 12, 18], [70, 74, 12, 17], [75, 79, 11, 17], [80, 84, 10, 15], [85, 89, 8, 14], [90, 94, 7, 12]],
      female: [[60, 64, 12, 17], [65, 69, 11, 16], [70, 74, 10, 15], [75, 79, 10, 15], [80, 84, 9, 14], [85, 89, 8, 13], [90, 94, 4, 11]]
    },
    applies(x) { return x.age >= 60 && x.age <= 94 ? null : 'The workbook has norms for ages 60–94 only.'; },
    calc(x) {
      const row = this.norms[x.sex].find((r) => x.age >= r[0] && x.age <= r[1]);
      const key = x.chair30 < row[2] ? 'below' : x.chair30 > row[3] ? 'above' : 'average';
      return { value: x.chair30, display: x.chair30 + ' stands', bandKey: key, note: `Average for ${x.sex === 'male' ? 'men' : 'women'} ${row[0]}–${row[1]}: ${row[2]}–${row[3]}` };
    }
  },
  {
    id: 'copd', group: 'lungs', title: 'COPD / asthma (UCAP or CAT)', short: 'Lungs (COPD)', blocked: 'The workbook has no formula or bands for COPD (Risk and Other Indicators!F8: "I don\'t have access to formula"; RiskCalculation&Formulas!A77 names CAT, the Indicators sheet names UCAP).',
    refs: ['Risk and Other Indicators!A8:F8', 'RiskCalculation&Formulas!A76:B77'], needs: [], decisions: [], bands: [], calc() { return { skip: 'No formula in the workbook.' }; }
  },
  // ---- single vitals from the "Standard Range" sheet (only if the clinical team includes them)
  {
    id: 'bp_std', group: 'vitals', title: 'Blood pressure (Standard Range)', short: 'Blood pressure', vital: true,
    refs: ['Standard Range!A1:J2'], base: ['bp'], needs: [], decisions: ['bp-std'],
    bands: [{ key: 'standard', label: 'Standard', proposed: 'green' }, { key: 'elevated', label: 'Elevated', proposed: 'amber' }, { key: 'stage1', label: 'High, stage 1', proposed: 'amber' }, { key: 'stage2', label: 'High, stage 2', proposed: 'amber' }],
    calc(x, c) {
      if (!c['bp-std']) return { unresolved: 'bp-std' };
      const s = x.bp.systolic, d = x.bp.diastolic, a = c['bp-std'] === 'a';
      const key = s >= 140 || d >= 90 ? 'stage2' : s >= 130 || (a ? d >= 80 : d >= 81) ? 'stage1' : (a ? s >= 120 : s >= 121) ? 'elevated' : 'standard';
      return { value: s, display: s + '/' + d + ' mmHg', bandKey: key };
    }
  },
  {
    id: 'spo2_std', group: 'vitals', title: 'Oxygen saturation (Standard Range)', short: 'Oxygen (SpO2)', vital: true,
    refs: ['Standard Range!A3:H4'], base: ['spo2'], needs: [], decisions: ['spo2-gap'],
    bands: [{ key: 'standard', label: 'Standard (95–100%)', proposed: 'green' }, { key: 'between', label: '93–94% (not covered by the workbook)', proposed: null, only: 'own' }, { key: 'risky', label: 'Risky (88–92%)', proposed: 'amber' }, { key: 'critical', label: 'Critical (below 88%)', proposed: null }],
    bandsDecision: 'spo2-gap',
    bandsFor: (c) => (c['spo2-gap'] ? (b) => !b.only || b.only === c['spo2-gap'] : null),
    calc(x, c) {
      const v = x.spo2;
      let key = null, gap = null;
      if (v >= 95) key = 'standard';
      else if (v >= 88 && v <= 92) key = 'risky';
      else if (v < 88) key = 'critical';
      else if (!c['spo2-gap']) gap = 'spo2-gap';
      else key = c['spo2-gap'] === 'own' ? 'between' : c['spo2-gap'];
      return { value: v, display: v + '%', bandKey: key, gap };
    }
  },
  {
    id: 'pulse_std', group: 'vitals', title: 'Pulse (Standard Range)', short: 'Pulse', vital: true,
    refs: ['Standard Range!A5:D6', 'Standard Range!A29:D30'], base: ['hr'], needs: [], decisions: [],
    bands: [{ key: 'standard', label: 'Standard (60–100)', proposed: 'green' }, { key: 'outside', label: 'Outside 60–100 (no band in the workbook)', proposed: null }],
    calc(x) { return { value: x.hr, display: x.hr + ' bpm', bandKey: x.hr >= 60 && x.hr <= 100 ? 'standard' : 'outside' }; }
  },
  {
    id: 'pi_std', group: 'vitals', title: 'Perfusion index (Standard Range)', short: 'Perfusion index', vital: true,
    refs: ['Standard Range!A7:F8'], base: ['pi'], needs: [], decisions: ['pi-1'],
    bands: [{ key: 'good', label: 'High PI (good blood flow)', proposed: 'green' }, { key: 'weak', label: 'Low PI (weak blood flow)', proposed: null }],
    calc(x, c) {
      const v = x.pi;
      let key = null, gap = null;
      if (v > 1) key = 'good'; else if (v < 1) key = 'weak'; else if (!c['pi-1']) gap = 'pi-1'; else key = c['pi-1'];
      return { value: v, display: String(v), bandKey: key, gap };
    }
  },
  {
    id: 'glucose_std', group: 'vitals', title: 'Blood glucose (Standard Range)', short: 'Blood glucose', vital: true,
    refs: ['Standard Range!A9:F10'], base: ['glucose'], needs: [], decisions: [],
    bands: [{ key: 'fnormal', label: 'Fasting 70–99 (normal)', proposed: 'green' }, { key: 'fpre', label: 'Fasting 100–125 (pre-diabetic)', proposed: null }, { key: 'fdiab', label: 'Fasting 126 or higher (diabetic)', proposed: null },
      { key: 'flow', label: 'Fasting below 70 (not covered by the workbook)', proposed: null }, { key: 'pnormal', label: 'After a meal below 140 (normal)', proposed: 'green' }, { key: 'phigh', label: 'After a meal 140 or higher (not covered by the workbook)', proposed: null }],
    applies(x) { return x.glucose.context === 'random' ? 'The workbook has ranges for fasting and after-meal sugar only.' : null; },
    calc(x) {
      const g = x.glucose, v = g.value;
      const key = g.context === 'fasting' ? (v < 70 ? 'flow' : v <= 99 ? 'fnormal' : v <= 125 ? 'fpre' : 'fdiab') : (v < 140 ? 'pnormal' : 'phigh');
      return { value: v, display: v + ' mg/dL (' + (g.context === 'fasting' ? 'fasting' : 'after a meal') + ')', bandKey: key };
    }
  }
];
const BY_ID = Object.fromEntries(INDICATORS.map((x) => [x.id, x]));
const GROUPS = { heart: 'Heart', kidney: 'Kidney', liver: 'Liver', breast: 'Breast health', weight: 'Weight', diabetes: 'Diabetes', sleep: 'Sleep', mood: 'Mood', memory: 'Memory', falls: 'Falls and mobility', lungs: 'Lungs', vitals: 'Single vitals' };

// The bands that apply under the chosen options (for mapping on the approval screen)
function bandsOf(ind, choices) {
  const f = ind.bandsFor ? ind.bandsFor(choices || {}) : null;
  if (ind.bandsFor && !f) return []; // depends on a decision that is not made yet
  return f ? ind.bands.filter(f) : ind.bands;
}
function inputsOf(ind, choices) { return [...(ind.needs || []), ...(ind.needsFor ? ind.needsFor(choices || {}) : [])]; }
function decisionsOf(ind) { return (ind.decisions || []).map((id) => DECISION[id]).filter(Boolean); }

// Calculate an indicator under every alternative of its open (unanswered) choice decisions.
// Same result under all of them: the workbook is unambiguous for this value, use it.
// Different results: { unresolved: [decision ids] }. Thresholds decisions (kidney cut-offs) are
// not enumerated; the calculation reports them as a gap instead.
function consensus(ind, x, choices) {
  const c = choices || {};
  const open = decisionsOf(ind).filter((d) => d.kind === 'choice' && !c[d.id]);
  if (open.some((d) => d.affects === 'all')) return { unresolved: open.filter((d) => d.affects === 'all').map((d) => d.id) };
  let combos = [{}];
  for (const d of open) combos = combos.flatMap((cmb) => d.options.map((o) => ({ ...cmb, [d.id]: o.id })));
  const results = combos.map((cmb) => { try { return ind.calc.call(ind, x, { ...c, ...cmb }); } catch (e) { return { error: e.message }; } });
  const sig = (r) => JSON.stringify([r.value ?? null, r.bandKey ?? null, r.gap ?? null, r.skip ?? null, r.missing ?? null, r.unresolved ?? null, r.error ?? null]);
  const first = sig(results[0]);
  if (results.every((r) => sig(r) === first)) return results[0];
  return { unresolved: open.filter((d) => {
    // the decisions whose alternatives change this result
    const byOpt = d.options.map((o) => results.filter((r, i) => combos[i][d.id] === o.id).map(sig).join('|'));
    return new Set(byOpt).size > 1;
  }).map((d) => d.id) };
}

// The owner confirmed (23 Nov 2026) that risk follows the "Risk and Other Indicators" sheet. Where
// the workbook's sheets disagree and that sheet decides it, its answer is the default; the office
// can still record another answer in Settings > Risk rules (a recorded answer always wins).
//   tug-bands      Indicators sheet: under 10 normal, 10-19 good, 20-30 possible, more than 30 high
//   balance-method seconds held: under 10 s high fall risk, over 21 s low fall risk
//   reach-method   inches: over 10 low, 6-10 moderate, under 6 high
//   fib4-formula   (Age x AST) / (Platelets x square root of ALT), as written in D9
const SHEET_CHOICES = { 'tug-bands': 'a', 'balance-method': 'seconds', 'reach-method': 'inches', 'fib4-formula': 'divide' };
// The overall risk is calculated from the sheet's purposes only (sleep, heart, breast, weight,
// kidney, diabetes, COPD, liver, depression, anxiety, memory, falls). Single vitals keep their
// colours on the charts but do not decide the overall category.
const IN_OVERALL = (ind) => !ind.vital;

const CATEGORIES = { red: 'Red – Very High Risk', amber: 'Amber – Lower Risk / Needs Attention', green: 'Green – No Risk', grey: 'Grey – Not Assessed' };
const RANK = { red: 3, amber: 2, green: 1, grey: 0 };

module.exports = { SHEET_CHOICES, IN_OVERALL, INPUTS, INPUT_GROUPS, FACTS, DECISIONS, DECISION, INDICATORS, BY_ID, GROUPS, CATEGORIES, RANK, bandsOf, inputsOf, decisionsOf, pickBand, consensus, yes };
