// Risk scores from the KareIQ sheet "Draft Data Collection by Caregivers":
//   "Risk and Other Indicators", "RiskCalculation&Formulas", "Heart Risk by Gender",
//   "5Y Kidney Risk" and "Standard Range".
// Each test lists the inputs the care team enters and turns them into a score and a band.
// Scores support, and never replace, a doctor's review.
//
// Not included: the COPD / asthma score (UCAP / CAT). The sheet notes its formula is not
// available yet ("need to check if we can integrate this calculator").

const ln = Math.log;
const round = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;
const pct = (v) => round(v, 1) + '%';
const G = 'good', OK = 'ok', W = 'warn', B = 'bad';

const YES_NO = { type: 'yesno' };
const n = (k, label, min, max, unit, extra) => ({ k, label, type: 'number', min, max, unit: unit || '', ...(extra || {}) });

// Groups shown as cards on the dashboard, in this order
const GROUPS = {
  heart: 'Heart (10-year risk)',
  kidney: 'Kidney (5-year risk)',
  liver: 'Liver',
  diabetes: 'Diabetes risk',
  weight: 'Weight (BMI)',
  sleep: 'Sleep quality',
  mood: 'Mood',
  memory: 'Memory',
  falls: 'Falls and mobility',
  breast: 'Breast health'
};

const CHAIR_NORMS = {
  male: [[60, 64, 14, 19], [65, 69, 12, 18], [70, 74, 12, 17], [75, 79, 11, 17], [80, 84, 10, 15], [85, 89, 8, 14], [90, 94, 7, 12]],
  female: [[60, 64, 12, 17], [65, 69, 11, 16], [70, 74, 10, 15], [75, 79, 10, 15], [80, 84, 9, 14], [85, 89, 8, 13], [90, 94, 4, 11]]
};

const TESTS = [
  // ---------------------------------------------------------------- heart
  {
    id: 'cvd', group: 'heart', kind: 'lab', title: 'Heart disease risk (Reynolds Risk Score)',
    help: '10-year chance of a heart attack or stroke. Needs a recent blood test (cholesterol, HDL, hs-CRP).',
    inputs: [
      { k: 'sex', label: 'Sex', type: 'sex', prefill: 'sex' },
      n('age', 'Age', 30, 100, 'years', { prefill: 'age' }),
      n('sbp', 'Systolic (upper) blood pressure', 80, 250, 'mmHg', { prefill: 'sbp' }),
      n('tc', 'Total cholesterol', 80, 500, 'mg/dL', { prefill: 'chol' }),
      n('hdl', 'HDL cholesterol', 10, 150, 'mg/dL'),
      n('crp', 'hs-CRP', 0.01, 50, 'mg/L', { step: 0.01 }),
      { k: 'smoker', label: 'Smokes now?', ...YES_NO, prefill: 'smoker' },
      { k: 'parentMI', label: 'A parent had a heart attack before 60?', ...YES_NO, prefill: 'parentalMI' },
      { k: 'diabetic', label: 'Has diabetes?', ...YES_NO, prefill: 'diabetic' },
      n('hba1c', 'HbA1c (women with diabetes)', 3, 20, '%', { step: 0.1, optional: true })
    ],
    calc(x) {
      let risk, note = null;
      if (x.sex === 'male') {
        const b = 4.385 * ln(x.age) + 2.607 * ln(x.sbp) + 0.963 * ln(x.tc) - 0.772 * ln(x.hdl) + 0.102 * ln(x.crp) + 0.405 * x.smoker + 0.541 * x.parentMI;
        risk = 100 * (1 - Math.pow(0.8990, Math.exp(b - 33.097)));
        if (x.diabetic) note = 'The men\'s formula was not tested in men with diabetes, so treat this result with care.';
      } else {
        if (x.diabetic && !x.hba1c) return { error: { hba1c: 'Enter HbA1c for a woman with diabetes' } };
        const b = 0.0799 * x.age + 3.137 * ln(x.sbp) + 0.180 * ln(x.crp) + 1.382 * ln(x.tc) - 1.172 * ln(x.hdl) + (x.diabetic ? 0.134 * x.hba1c : 0) + 0.818 * x.smoker + 0.438 * x.parentMI;
        risk = 100 * (1 - Math.pow(0.98634, Math.exp(b - 22.325)));
        note = 'The women\'s formula was built on healthy women aged 45 and over in the US; it is not yet validated for Indian populations.';
      }
      const band = risk < 5 ? [G, 'Low risk'] : risk < 7.5 ? [OK, 'Borderline risk'] : risk < 20 ? [W, 'Intermediate risk'] : [B, 'High risk'];
      return { value: round(risk, 1), display: pct(risk), level: band[0], band: band[1], note, scale: 'Below 5% low, 5–7.4% borderline, 7.5–19.9% intermediate, 20% or more high' };
    }
  },
  // ---------------------------------------------------------------- kidney
  {
    id: 'kidney', group: 'kidney', kind: 'lab', title: 'Kidney failure risk (Kidney Failure Risk Equation)',
    help: '5-year chance of kidney failure, from eGFR and urine albumin (ACR) in a recent test.',
    inputs: [
      { k: 'sex', label: 'Sex', type: 'sex', prefill: 'sex' },
      n('age', 'Age', 18, 110, 'years', { prefill: 'age' }),
      n('egfr', 'Estimated GFR (eGFR)', 1, 150, 'ml/min/1.73 m²'),
      n('acr', 'Urine albumin creatinine ratio (ACR)', 0.1, 10000, '', { step: 0.1 }),
      { k: 'acrUnit', label: 'ACR unit', type: 'select', options: { 'mg/g': 'mg/g', 'mg/mmol': 'mg/mmol' }, default: 'mg/g' }
    ],
    calc(x) {
      // the equation is valid for eGFR 10-60 and ACR 10-3000 mg/g; values outside are clamped, as in the sheet
      let acr = x.acrUnit === 'mg/mmol' ? x.acr * 11.3 : x.acr;
      const egfr = Math.min(60, Math.max(10, x.egfr));
      acr = Math.min(3000, Math.max(10, acr));
      const betaX = 0.2694 * (x.sex === 'male' ? 1 : 0) - 0.2167 * (x.age / 10) - 0.55418 * (egfr / 5) + 0.45608 * ln(acr);
      const betaXbar = 0.2694 * 0.5642 - 0.2167 * 7.0355 - 0.55418 * 7.2216 + 0.45608 * 5.2774;
      const risk = Math.min(0.7, 1 - Math.pow(0.924, Math.exp(betaX - betaXbar)));
      const display = risk >= 0.7 ? 'More than 70%' : risk < 0.05 ? 'Less than 5%' : pct(risk * 100);
      const note = x.egfr > 60 ? 'eGFR is above 60, where this equation is not meant to be used; the result is a rough guide only.' : null;
      return { value: round(risk * 100, 1), display, level: null, band: 'Discuss with the doctor', note, scale: 'Reported between "less than 5%" and "more than 70%"' };
    }
  },
  // ---------------------------------------------------------------- liver
  {
    id: 'fib4', group: 'liver', kind: 'lab', title: 'Liver scarring (FIB-4 index)',
    help: 'From age, AST, ALT and platelet count in a recent blood test.',
    inputs: [n('age', 'Age', 18, 110, 'years', { prefill: 'age' }), n('ast', 'AST', 1, 2000, 'U/L'), n('alt', 'ALT', 1, 2000, 'U/L'), n('plt', 'Platelet count', 5, 1500, '×10⁹/L')],
    calc(x) {
      const v = (x.age * x.ast) / (x.plt * Math.sqrt(x.alt));
      const band = v < 1.3 ? [G, 'Low risk'] : v <= 2.67 ? [W, 'Intermediate risk'] : [B, 'High risk'];
      return { value: round(v, 2), display: String(round(v, 2)), level: band[0], band: band[1], scale: 'Below 1.3 low, 1.3–2.67 intermediate, above 2.67 high' };
    }
  },
  {
    id: 'nfs', group: 'liver', kind: 'lab', title: 'Fatty liver fibrosis (NAFLD Fibrosis Score)',
    help: 'From age, BMI, blood sugar status, AST, ALT, platelets and albumin.',
    inputs: [
      n('age', 'Age', 18, 110, 'years', { prefill: 'age' }), n('bmi', 'BMI', 10, 70, 'kg/m²', { step: 0.1, prefill: 'bmi' }),
      { k: 'ifg', label: 'Impaired fasting sugar or diabetes?', ...YES_NO, prefill: 'diabetic' },
      n('ast', 'AST', 1, 2000, 'U/L'), n('alt', 'ALT', 1, 2000, 'U/L'), n('plt', 'Platelet count', 5, 1500, '×10⁹/L'), n('alb', 'Albumin', 1, 7, 'g/dL', { step: 0.1 })
    ],
    calc(x) {
      const v = -1.675 + 0.037 * x.age + 0.094 * x.bmi + 1.13 * x.ifg + 0.99 * (x.ast / x.alt) - 0.013 * x.plt - 0.66 * x.alb;
      const band = v < -1.455 ? [G, 'Low probability of advanced fibrosis'] : v <= 0.676 ? [W, 'Intermediate probability'] : [B, 'High probability of advanced fibrosis'];
      return { value: round(v, 3), display: String(round(v, 3)), level: band[0], band: band[1], scale: 'Below −1.455 low, −1.455 to 0.676 intermediate, above 0.676 high' };
    }
  },
  {
    id: 'elf', group: 'liver', kind: 'lab', title: 'Enhanced Liver Fibrosis (ELF) score',
    help: 'From three special blood markers: HA, PIIINP and TIMP-1.',
    inputs: [n('ha', 'Hyaluronic acid (HA)', 0.1, 5000, 'ng/mL', { step: 0.1 }), n('p3np', 'PIIINP', 0.1, 500, 'ng/mL', { step: 0.1 }), n('timp1', 'TIMP-1', 1, 5000, 'ng/mL', { step: 0.1 })],
    calc(x) {
      const v = 2.278 + 0.851 * ln(x.ha) + 0.751 * ln(x.p3np) + 0.394 * ln(x.timp1);
      const band = v < 7.7 ? [G, 'Low risk'] : v < 9.8 ? [W, 'Moderate risk'] : v <= 11.3 ? [B, 'High risk'] : [B, 'Very high risk'];
      return { value: round(v, 2), display: String(round(v, 2)), level: band[0], band: band[1], scale: 'Below 7.7 low, 7.7–9.7 moderate, 9.8 or more high, above 11.3 very high' };
    }
  },
  // ---------------------------------------------------------------- questionnaires
  {
    id: 'idrs', group: 'diabetes', kind: 'questionnaire', title: 'Indian Diabetes Risk Score (IDRS)',
    help: 'Total score from the IDRS questionnaire (0–100).',
    inputs: [n('score', 'IDRS score', 0, 100, 'points')],
    calc(x) {
      const v = x.score;
      const band = v < 30 ? [G, 'Low risk'] : v < 60 ? [OK, 'Medium risk'] : [B, 'High risk'];
      return { value: v, display: v + ' / 100', level: band[0], band: band[1], scale: 'Below 30 low, 30–50 medium, 60 or more high' };
    }
  },
  {
    id: 'psqi', group: 'sleep', kind: 'questionnaire', title: 'Sleep quality (PSQI)',
    help: 'Total from the Pittsburgh Sleep Quality Index questionnaire (0–21).',
    inputs: [n('score', 'PSQI score', 0, 21, 'points')],
    calc(x) {
      const good = x.score <= 5;
      return { value: x.score, display: x.score + ' / 21', level: good ? G : W, band: good ? 'Good sleep quality' : 'Poor sleep quality', scale: '0–5 good, above 5 poor' };
    }
  },
  {
    id: 'phq9', group: 'mood', kind: 'questionnaire', title: 'Depression check (PHQ-9)',
    help: 'Total from the PHQ-9 questionnaire (0–27).',
    inputs: [n('score', 'PHQ-9 score', 0, 27, 'points')],
    calc(x) {
      const v = x.score;
      const band = v <= 4 ? [G, 'Minimal or no depression'] : v <= 9 ? [OK, 'Mild depression'] : v <= 14 ? [W, 'Moderate depression'] : v <= 19 ? [B, 'Moderately severe depression'] : [B, 'Severe depression'];
      return { value: v, display: v + ' / 27', level: band[0], band: band[1], scale: '0–4 minimal, 5–9 mild, 10–14 moderate, 15–19 moderately severe, 20–27 severe' };
    }
  },
  {
    id: 'gad7', group: 'mood', kind: 'questionnaire', title: 'Anxiety check (GAD-7)',
    help: 'Total from the GAD-7 questionnaire (0–21).',
    inputs: [n('score', 'GAD-7 score', 0, 21, 'points')],
    calc(x) {
      const v = x.score;
      const band = v <= 4 ? [G, 'Minimal anxiety'] : v <= 9 ? [OK, 'Mild anxiety'] : v <= 14 ? [W, 'Moderate anxiety'] : [B, 'Severe anxiety'];
      return { value: v, display: v + ' / 21', level: band[0], band: band[1], scale: '0–4 minimal, 5–9 mild, 10–14 moderate, 15–21 severe' };
    }
  },
  {
    id: 'mmse', group: 'memory', kind: 'questionnaire', title: 'Memory and thinking (MMSE)',
    help: 'Total from the Mini-Mental State Examination (0–30).',
    inputs: [n('score', 'MMSE score', 0, 30, 'points')],
    calc(x) {
      const v = x.score;
      const band = v >= 24 ? [G, 'No cognitive impairment'] : v >= 18 ? [W, 'Mild cognitive impairment'] : [B, 'Severe cognitive impairment'];
      const note = v < 21 ? 'A score below 21 means increased odds of dementia.' : v > 25 ? 'A score above 25 means decreased odds of dementia.' : null;
      return { value: v, display: v + ' / 30', level: band[0], band: band[1], note, scale: '24–30 none, 18–23 mild, 0–17 severe' };
    }
  },
  // ---------------------------------------------------------------- home tests (falls)
  {
    id: 'tug', group: 'falls', kind: 'home', title: 'Timed Up and Go (TUG) test',
    help: 'Seconds to stand up, walk 3 metres, turn, walk back and sit down.',
    inputs: [n('seconds', 'Time taken', 1, 300, 'seconds', { step: 0.1 })],
    calc(x) {
      const v = x.seconds;
      const band = v < 10 ? [G, 'Normal mobility'] : v < 20 ? [G, 'Good mobility, can go out alone'] : v < 30 ? [W, 'Possible fall risk (limited mobility)'] : [B, 'High fall risk, needs help moving'];
      return { value: v, display: round(v, 1) + ' s', level: band[0], band: band[1], scale: 'Under 10 s normal, 10–19 s good, 20 s or more fall risk, 30 s or more high risk' };
    }
  },
  {
    id: 'balance4', group: 'falls', kind: 'home', title: '4-Stage Balance test',
    help: 'The last stage held for 10 seconds without moving the feet or holding on.',
    inputs: [{ k: 'stage', label: 'Last stage held for 10 seconds', type: 'select', options: { 0: 'None', 1: 'Stage 1: feet side by side', 2: 'Stage 2: one foot half ahead', 3: 'Stage 3: tandem (heel to toe)', 4: 'Stage 4: one leg' } }],
    calc(x) {
      const s = Number(x.stage);
      const band = s >= 4 ? [G, 'Normal balance'] : s === 3 ? [W, 'Increased fall risk'] : [B, 'Increased fall risk'];
      return { value: s, display: s >= 4 ? 'All 4 stages' : s ? 'Up to stage ' + s : 'None held', level: band[0], band: band[1], scale: 'Not holding stage 3 or stage 4 for 10 seconds means increased fall risk' };
    }
  },
  {
    id: 'reach', group: 'falls', kind: 'home', title: 'Functional Reach test',
    help: 'How far they can reach forward while standing, without stepping.',
    inputs: [n('cm', 'Reach', 1, 80, 'cm', { step: 0.5 })],
    calc(x) {
      const inch = x.cm / 2.54;
      const band = inch > 10 ? [G, 'Low fall risk'] : inch >= 6 ? [W, 'Moderate fall risk'] : [B, 'High fall risk'];
      return { value: x.cm, display: round(x.cm, 1) + ' cm (' + round(inch, 1) + ' in)', level: band[0], band: band[1], scale: 'Over 10 in (25 cm) low, 6–10 in moderate, under 6 in (15 cm) high' };
    }
  },
  {
    id: 'chair30', group: 'falls', kind: 'home', title: '30-Second Chair Stand test',
    help: 'Times they stand up and sit down in 30 seconds, arms crossed.',
    inputs: [{ k: 'sex', label: 'Sex', type: 'sex', prefill: 'sex' }, n('age', 'Age', 60, 110, 'years', { prefill: 'age' }), n('count', 'Number of stands', 0, 60, 'times')],
    calc(x) {
      const row = (CHAIR_NORMS[x.sex] || []).find((r) => x.age >= r[0] && x.age <= r[1]);
      if (!row) return { value: x.count, display: x.count + ' stands', level: null, band: 'No reference range for this age (60–94 only)', scale: '' };
      const band = x.count < row[2] ? [W, 'Below average: lower-body weakness'] : x.count > row[3] ? [G, 'Above average'] : [G, 'Average'];
      return { value: x.count, display: x.count + ' stands', level: band[0], band: band[1], scale: `Average for ${x.sex === 'male' ? 'men' : 'women'} ${row[0]}–${row[1]}: ${row[2]}–${row[3]}` };
    }
  },
  // ---------------------------------------------------------------- breast (women)
  {
    id: 'snehita', group: 'breast', kind: 'questionnaire', women: true, title: 'Breast cancer risk (Snehita)',
    help: 'For women. From age, periods, children, breastfeeding and family history.',
    inputs: [
      n('age', 'Age', 18, 110, 'years', { prefill: 'age' }), n('menarche', 'Age at first period', 7, 20, 'years'),
      { k: 'irregular', label: 'Irregular periods?', ...YES_NO }, { k: 'bf24', label: 'Breastfed for 24 months or more in total?', ...YES_NO },
      { k: 'fdr', label: 'Mother, sister or daughter had breast cancer?', ...YES_NO }, { k: 'biopsy', label: 'Ever had a breast biopsy?', ...YES_NO },
      { k: 'birth', label: 'Age at first child', type: 'select', options: { under25: 'Under 25', '25to29': '25–29', none: 'No children', '30plus': '30 or older' } }
    ],
    calc(x) {
      const logit = -0.140 + 0.027 * x.age - 0.082 * x.menarche + 0.453 * x.irregular - 0.892 * x.bf24 + 0.810 * x.fdr + 1.420 * x.biopsy
        + 0.811 * (x.birth === '25to29' || x.birth === 'none' ? 1 : 0) + 1.035 * (x.birth === '30plus' ? 1 : 0);
      const p = 1 / (1 + Math.exp(-logit));
      const band = p < 0.4004 ? [G, 'Normal risk'] : p < 0.574 ? [OK, 'Moderate risk'] : p <= 0.795 ? [W, 'High risk'] : [B, 'Very high risk'];
      return { value: round(p, 3), display: String(round(p, 3)), level: band[0], band: band[1], scale: 'Below 0.40 normal, 0.40–0.57 moderate, 0.57–0.80 high, above 0.80 very high' };
    }
  }
];
const BY_ID = Object.fromEntries(TESTS.map((t) => [t.id, t]));

// BMI is not entered: it comes from the latest weight and height
function bmiRisk(v) {
  const band = v < 18.5 ? [W, 'Underweight'] : v < 25 ? [G, 'Normal weight'] : v < 30 ? [OK, 'Overweight'] : v < 35 ? [W, 'Obese (class I)'] : v < 40 ? [B, 'Obese (class II)'] : [B, 'Obese (class III)'];
  return { value: v, display: v + ' kg/m²', level: band[0], band: band[1], scale: 'Below 18.5 underweight, 18.5–24.9 normal, 25–29.9 overweight, 30 or more obese' };
}

// Checks and converts the entered values, then calculates. Returns { result } or { errors }.
function evaluate(id, raw) {
  const t = BY_ID[id];
  if (!t) return { errors: { test: 'Choose a test' } };
  const x = {}, errors = {};
  for (const f of t.inputs) {
    const v = raw ? raw[f.k] : undefined;
    if (f.type === 'number') {
      const s = String(v ?? '').trim().replace(',', '.');
      if (s === '') { if (!f.optional) errors[f.k] = 'Required'; continue; }
      const num = Number(s);
      if (!Number.isFinite(num) || num < f.min || num > f.max) { errors[f.k] = `Enter ${f.min}–${f.max}`; continue; }
      x[f.k] = num;
    } else if (f.type === 'yesno') {
      if (v === 'yes' || v === true || v === 1 || v === '1') x[f.k] = 1;
      else if (v === 'no' || v === false || v === 0 || v === '0') x[f.k] = 0;
      else errors[f.k] = 'Choose yes or no';
    } else if (f.type === 'sex') {
      if (v === 'male' || v === 'female') x[f.k] = v; else errors[f.k] = 'Choose male or female';
    } else if (f.type === 'select') {
      const val = v === undefined || v === '' ? f.default : String(v);
      if (val !== undefined && Object.prototype.hasOwnProperty.call(f.options, val)) x[f.k] = val; else errors[f.k] = 'Choose one';
    }
  }
  if (Object.keys(errors).length) return { errors };
  const result = t.calc(x);
  if (result.error) return { errors: result.error };
  return { inputs: x, result };
}

// What the app needs to draw the entry forms (no functions)
function forms() {
  return TESTS.map((t) => ({ id: t.id, group: t.group, groupName: GROUPS[t.group], kind: t.kind, title: t.title, help: t.help, women: Boolean(t.women), inputs: t.inputs }));
}

module.exports = { TESTS, GROUPS, evaluate, forms, bmiRisk, CHAIR_NORMS };
