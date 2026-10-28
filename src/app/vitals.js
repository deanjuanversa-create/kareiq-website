// Health readings: what can be recorded, typing-mistake limits, visit validation and the
// standard ranges used to colour readings.
//
// - LIMITS only catch typing mistakes (1200 instead of 120). They say nothing about health.
// - RANGES come from the KareIQ "Standard Range" sheet (Draft Data Collection by Caregivers):
//   blood pressure, oxygen, pulse, perfusion index, blood sugar, BMI and body composition.
//   Cholesterol (below 200 mg/dL) follows the dashboard design; temperature uses the usual
//   36.1–37.5 °C. Colours are a guide for families, not a diagnosis.
// - Readings are never deleted. A wrong one is removed WITH a reason and stays in the record.
// - OBSERVATIONS are the non-number checks caregivers collect on visits (food, water, toilet,
//   sleep, pain, medicines...), from the "Standard Preventive Packages" sheet.

const METRICS = {
  bp: { label: 'Blood pressure', unit: 'mmHg', series: [['systolic', 'Upper'], ['diastolic', 'Lower']] },
  hr: { label: 'Heart rate', unit: 'bpm', series: [['value', 'Heart rate']] },
  spo2: { label: 'Oxygen level', unit: '%', series: [['value', 'SpO2']] },
  pi: { label: 'Perfusion index', unit: '', series: [['value', 'Perfusion index']] },
  glucose: { label: 'Blood sugar', unit: 'mg/dL', series: [['value', 'Blood sugar']] },
  temp: { label: 'Temperature', unit: '°C', series: [['value', 'Temperature']] },
  weight: { label: 'Weight', unit: 'kg', series: [['value', 'Weight']] },
  height: { label: 'Height', unit: 'cm', series: [['value', 'Height']] },
  bmi: { label: 'Body Mass Index', unit: 'kg/m²', series: [['value', 'BMI']] },
  chol: { label: 'Cholesterol', unit: 'mg/dL', series: [['value', 'Total cholesterol']] },
  bodyfat: { label: 'Body fat', unit: '%', series: [['value', 'Body fat']], group: 'body' },
  moisture: { label: 'Body moisture', unit: '%', series: [['value', 'Body moisture']], group: 'body' },
  visceral: { label: 'Visceral fat', unit: 'level', series: [['value', 'Visceral fat']], group: 'body' },
  bone: { label: 'Bone mass', unit: '%', series: [['value', 'Bone mass']], group: 'body' },
  bmr: { label: 'BMR', unit: 'kcal', series: [['value', 'BMR']], group: 'body' },
  protein: { label: 'Protein', unit: '%', series: [['value', 'Protein']], group: 'body' },
  subfat: { label: 'Subcutaneous fat', unit: '%', series: [['value', 'Subcutaneous fat']], group: 'body' },
  lean: { label: 'Lean body mass', unit: '%', series: [['value', 'Lean body mass']], group: 'body' }
};
const BODY = ['bodyfat', 'moisture', 'visceral', 'bone', 'bmr', 'protein', 'subfat', 'lean'];

const LIMITS = {
  systolic: [50, 260], diastolic: [30, 160], hr: [20, 250], glucose: [20, 600], chol: [50, 500],
  spo2: [50, 100], pi: [0.02, 20], temp: [30, 45], weight: [2, 300], height: [40, 250],
  bodyfat: [2, 70], moisture: [20, 80], visceral: [1, 60], bone: [0.5, 15], bmr: [500, 4000], protein: [5, 40], subfat: [2, 70], lean: [20, 100]
};
const GLUCOSE_CONTEXTS = { fasting: 'Fasting', post_meal: 'After meal', random: 'Random' };
const MAX_BACKDATE_DAYS = 7;
const STALE_AFTER_DAYS = 30;
const CARDS = ['bp', 'hr', 'glucose', 'spo2', 'pi', 'temp', 'bmi', 'weight', 'chol']; // order on the dashboard
const ALWAYS_SHOW = ['bp', 'hr', 'glucose', 'spo2'];
const TRENDS = ['bp', 'glucose', 'hr', 'spo2', 'pi', 'temp', 'weight', 'bmi', 'chol', ...BODY];
const PERIODS = { '7d': ['Last 7 days', 7], '1m': ['Month', 30], '6m': ['6 months', 182], '1y': ['1 year', 365] };
const IST_OFFSET = '+05:30';

// ---------------------------------------------------------------- standard ranges
const G = (label) => ({ level: 'good', label });
const OK = (label) => ({ level: 'ok', label });
const W = (label) => ({ level: 'warn', label });
const B = (label) => ({ level: 'bad', label });
const between = (v, lo, hi) => v >= lo && v <= hi;

// Returns { level: good|ok|warn|bad|null, label, range } for one reading (or an average).
function classify(metric, r, sex) {
  const v = r.value;
  const male = sex === 'male', female = sex === 'female';
  const bySex = (m, f) => (male ? m : female ? f : null);
  switch (metric) {
    case 'bp': {
      const s = r.systolic, d = r.diastolic;
      const range = 'Standard 120/80 mmHg';
      if (s >= 140 || d >= 90) return { ...B('High (stage 2)'), range };
      if (s >= 130 || d >= 80) return { ...W('High (stage 1)'), range };
      if (s >= 120) return { ...OK('Elevated'), range };
      return { ...G('Normal range'), range };
    }
    case 'spo2': {
      const range = '95–100%';
      if (v >= 95) return { ...G('Normal range'), range };
      if (v >= 93) return { ...OK('Slightly low'), range };
      if (v >= 88) return { ...W('Risky'), range };
      return { ...B('Critical'), range };
    }
    case 'hr': {
      const range = '60–100 bpm';
      if (between(v, 60, 100)) return { ...G('Normal range'), range };
      return { ...W(v < 60 ? 'Low' : 'High'), range };
    }
    case 'pi': {
      const range = 'above 1 (good blood flow)';
      return v > 1 ? { ...G('Good blood flow'), range } : { ...W('Weak blood flow'), range };
    }
    case 'glucose': {
      if (r.context === 'fasting') {
        const range = '70–99 mg/dL (fasting)';
        if (v < 70) return { ...W('Low'), range };
        if (v <= 99) return { ...G('Normal range'), range };
        if (v <= 125) return { ...W('Pre-diabetic range'), range };
        return { ...B('Diabetic range'), range };
      }
      const range = 'below 140 mg/dL (after a meal)';
      if (v < 70) return { ...W('Low'), range };
      if (v < 140) return { ...G('Normal range'), range };
      if (v < 200) return { ...W('High'), range };
      return { ...B('Very high'), range };
    }
    case 'bmi': {
      const range = '18.5–24.9 kg/m²';
      if (v < 18.5) return { ...W('Underweight'), range };
      if (v < 25) return { ...G('Normal weight'), range };
      if (v < 30) return { ...OK('Overweight'), range };
      if (v < 35) return { ...W('Obese (class I)'), range };
      if (v < 40) return { ...B('Obese (class II)'), range };
      return { ...B('Obese (class III)'), range };
    }
    case 'chol': {
      const range = 'below 200 mg/dL';
      if (v < 200) return { ...G('Normal range'), range };
      if (v < 240) return { ...W('Borderline high'), range };
      return { ...B('High'), range };
    }
    case 'temp': {
      const range = '36.1–37.5 °C';
      if (v < 36) return { ...W('Low'), range };
      if (v <= 37.5) return { ...G('Normal range'), range };
      if (v <= 38) return { ...OK('Slightly high'), range };
      return { ...B('Fever'), range };
    }
    case 'bodyfat': return sexRange(v, bySex([13, 24], [25, 31]), 'Men 13–24%, women 25–31%');
    case 'moisture': return sexRange(v, bySex([55, 60], [50, 55]), 'Men 55–60%, women 50–55%');
    case 'subfat': return sexRange(v, bySex([8, 25], [20, 35]), 'Men 8–25%, women 20–35%');
    case 'bone': return sexRange(v, [3, 5], '3–5% of body weight');
    case 'lean': return sexRange(v, [60, 90], '60–90%');
    case 'bmr': return { level: null, label: '', range: 'Men 1600–1800 kcal, women about 1400 kcal' };
    default: return { level: null, label: '', range: '' };
  }
}
function sexRange(v, lohi, text) {
  if (!lohi) return { level: null, label: '', range: text };
  if (between(v, lohi[0], lohi[1])) return { level: 'good', label: 'Normal range', range: text };
  return { level: 'warn', label: v < lohi[0] ? 'Below range' : 'Above range', range: text };
}

// ---------------------------------------------------------------- observations (no numbers)
const OBS = {
  meals: { label: 'Meals today', options: { 1: '1 meal', 2: '2 meals', 3: '3 meals', 4: 'More than 3' } },
  foods: { label: 'Food eaten', multi: true, options: { rice: 'Rice', millet: 'Millet', wheat: 'Wheat', meat: 'Meat', fish: 'Fish', lentils: 'Lentils', vegetables: 'Vegetables', fruits: 'Fruits' } },
  cooking: { label: 'Cooked as', multi: true, options: { fried: 'Fried', steamed: 'Steamed', raw: 'Raw' } },
  spice: { label: 'Spice', options: { low: 'Low', medium: 'Medium', high: 'High' } },
  salt: { label: 'Salt', options: { low: 'Low', average: 'Average', high: 'High' } },
  sugar: { label: 'Sugar (approx.)', text: 40 },
  lastMeal: { label: 'Last meal of the day', text: 80 },
  lastMealHours: { label: 'Last meal, hours before bed', number: [0, 12] },
  waterL: { label: 'Water (litres a day)', number: [0, 8] },
  waterFreq: { label: 'Drinks water', options: { hourly: 'Every hour', often: 'A few times a day', meals: 'After meals', rarely: 'Rarely' } },
  cognitive: { label: 'Memory', options: { clear: 'Clear', mild: 'Mild memory issues', severe: 'Severe memory issues' }, flag: ['severe'] },
  stoolTimes: { label: 'Stools a day', number: [0, 10] },
  stoolColor: { label: 'Stool colour', options: { brown: 'Normal brown', dark: 'Dark or black', pale: 'Pale', red: 'Red', green: 'Green' }, flag: ['dark', 'red'] },
  constipation: { label: 'Constipation', options: { no: 'No', mild: 'Mild', severe: 'Severe' }, flag: ['severe'] },
  stoolBlood: { label: 'Blood in stool', options: { no: 'No', yes: 'Yes' }, flag: ['yes'] },
  stoolPain: { label: 'Pain passing stool', options: { no: 'No', yes: 'Yes' }, flag: ['yes'] },
  stoolType: { label: 'Stool type', options: { normal: 'Normal', hard: 'Hard', flaky: 'Flaky', mushy: 'Mushy', watery: 'Watery' } },
  urineTimes: { label: 'Urine, times a day', number: [0, 30] },
  urineColor: { label: 'Urine colour', options: { clear: 'Pale or clear', yellow: 'Yellow', dark: 'Dark yellow', brown: 'Brown', red: 'Red' }, flag: ['brown', 'red'] },
  urineBlood: { label: 'Blood in urine', options: { no: 'No', yes: 'Yes' }, flag: ['yes'] },
  urinePain: { label: 'Pain passing urine', options: { no: 'No', yes: 'Yes' }, flag: ['yes'] },
  bedTime: { label: 'Goes to bed at', time: true },
  sleepHours: { label: 'Hours of sleep', number: [0, 16] },
  sleepQuality: { label: 'Sleep', options: { good: 'Good', fair: 'Fair', poor: 'Poor' }, flag: ['poor'] },
  lifestyle: { label: 'Activity', options: { sedentary: 'Sedentary', moderate: 'Moderately active', active: 'Highly active' } },
  pains: { label: 'Pain or discomfort', multi: true, options: { back: 'Back pain', knee: 'Knee or joint pain', dizziness: 'Dizziness', toothache: 'Toothache', headache: 'Headache' }, flagAny: true },
  medicines: { label: 'Medicines', options: { taken: 'All taken', missed: 'Missed some', none: 'No medicines' }, flag: ['missed'] },
  medNote: { label: 'Medicine note', text: 200 },
  eyesight: { label: 'Eye sight check', options: { normal: 'Normal', check: 'Needs a check-up' }, flag: ['check'] },
  ecg: { label: 'ECG (home)', options: { normal: 'Normal', abnormal: 'Needs review', notdone: 'Not done' }, flag: ['abnormal'] }
};
const OBS_GROUPS = [
  ['Food and water', ['meals', 'foods', 'cooking', 'spice', 'salt', 'sugar', 'lastMeal', 'lastMealHours', 'waterL', 'waterFreq']],
  ['Toilet', ['stoolTimes', 'stoolColor', 'constipation', 'stoolBlood', 'stoolPain', 'stoolType', 'urineTimes', 'urineColor', 'urineBlood', 'urinePain']],
  ['Sleep, activity and memory', ['bedTime', 'sleepHours', 'sleepQuality', 'lifestyle', 'cognitive']],
  ['Pain and medicines', ['pains', 'medicines', 'medNote']],
  ['Monthly and yearly checks', ['eyesight', 'ecg']]
];

function parseObs(src, errors) {
  const out = {};
  const o = src && typeof src === 'object' ? src : {};
  for (const [k, f] of Object.entries(OBS)) {
    const v = o[k];
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) continue;
    if (f.multi) {
      const list = (Array.isArray(v) ? v : String(v).split(',')).map(String).filter((x) => f.options[x]);
      if (list.length) out[k] = [...new Set(list)];
    } else if (f.options) {
      if (f.options[String(v)]) out[k] = String(v); else errors['obs.' + k] = 'Choose one of the options';
    } else if (f.number) {
      const n = Number(String(v).replace(',', '.'));
      if (!Number.isFinite(n) || n < f.number[0] || n > f.number[1]) errors['obs.' + k] = `Enter ${f.number[0]}–${f.number[1]}`;
      else out[k] = Math.round(n * 10) / 10;
    } else if (f.time) {
      if (/^\d{2}:\d{2}$/.test(String(v))) out[k] = String(v); else errors['obs.' + k] = 'Enter a time';
    } else if (f.text) {
      const t = String(v).replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, f.text);
      if (t) out[k] = t;
    }
  }
  return out;
}
// Which observations need attention (blood in stool, missed medicines, pain...)
function obsFlags(obs) {
  const out = [];
  for (const [k, v] of Object.entries(obs || {})) {
    const f = OBS[k];
    if (!f) continue;
    if (f.flagAny && Array.isArray(v) && v.length) out.push(k);
    else if (f.flag && f.flag.includes(v)) out.push(k);
  }
  return out;
}
function obsText(k, v) {
  const f = OBS[k];
  if (!f) return String(v);
  if (f.multi) return v.map((x) => f.options[x]).join(', ');
  if (f.options) return f.options[v] || v;
  return String(v);
}

// ---------------------------------------------------------------- visit form
function number(raw, name, errors, integer) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '') return null;
  const v = Number(s);
  if (!Number.isFinite(v)) { errors[name] = 'Please enter a number'; return null; }
  if (integer && !Number.isInteger(v)) { errors[name] = 'Please enter a whole number'; return null; }
  const [lo, hi] = LIMITS[name];
  if (v < lo || v > hi) { errors[name] = `This looks like a typing mistake (expected ${lo}–${hi})`; return null; }
  return integer ? v : Math.round(v * 100) / 100;
}

// "2026-10-24" + "09:30" in India time -> ISO string with +05:30
function measuredAt(date, time, errors, now = new Date()) {
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(now);
  const nowHm = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(now);
  const d = date || today;
  const t = time || nowHm;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !/^\d{2}:\d{2}$/.test(t)) { errors.when = 'Please enter a valid date and time'; return null; }
  const iso = `${d}T${t}:00${IST_OFFSET}`;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) { errors.when = 'Please enter a valid date and time'; return null; }
  if (ms > now.getTime() + 5 * 60 * 1000) { errors.when = 'The visit time cannot be in the future'; return null; }
  if (now.getTime() - ms > MAX_BACKDATE_DAYS * 86400 * 1000) { errors.when = `Visits older than ${MAX_BACKDATE_DAYS} days need the office team`; return null; }
  return iso;
}

// Turns one visit form into a list of readings plus observations, or errors shown next to each field.
function parseVisit(body, lastHeight) {
  const errors = {};
  const sys = number(body.systolic, 'systolic', errors, true);
  const dia = number(body.diastolic, 'diastolic', errors, true);
  const vals = {};
  for (const k of ['hr', 'spo2']) vals[k] = number(body[k], k, errors, true);
  for (const k of ['glucose', 'pi', 'temp', 'weight', 'height', 'chol', ...BODY]) vals[k] = number(body[k], k, errors, false);
  const when = measuredAt(body.date, body.time, errors);
  const note = typeof body.note === 'string' ? body.note.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim() : '';
  const obs = parseObs(body.obs, errors);

  if ((sys === null) !== (dia === null) && !errors.systolic && !errors.diastolic) {
    errors[dia === null ? 'diastolic' : 'systolic'] = 'Enter both blood pressure numbers';
  }
  if (sys !== null && dia !== null && sys <= dia) errors.systolic = 'The top number should be higher than the bottom number';
  const ctx = body.glucoseContext || null;
  if (vals.glucose !== null && !GLUCOSE_CONTEXTS[ctx]) errors.glucoseContext = 'Choose when the sugar was measured';
  if (note.length > 1000) errors.note = 'Note is too long (max 1000 characters)';

  const any = sys !== null || Object.values(vals).some((v) => v !== null) || Object.keys(obs).length;
  if (!any && !note && !Object.keys(errors).length) errors.form = 'Enter at least one reading, a check, or a note about the visit';
  if (Object.keys(errors).length) return { errors };

  const readings = [];
  if (sys !== null) readings.push({ metric: 'bp', systolic: sys, diastolic: dia });
  for (const k of ['hr', 'spo2', 'pi', 'temp', 'weight', 'height', 'chol', ...BODY]) {
    if (vals[k] !== null) readings.push({ metric: k, value: vals[k] });
  }
  if (vals.glucose !== null) readings.push({ metric: 'glucose', value: vals.glucose, context: ctx });
  if (vals.weight !== null) {
    const h = vals.height !== null ? vals.height : lastHeight;
    if (h) readings.push({ metric: 'bmi', value: Math.round((vals.weight / ((h / 100) ** 2)) * 10) / 10, calculated: true });
  }
  return { errors: null, when, note: note || null, readings, obs };
}

module.exports = {
  METRICS, BODY, LIMITS, GLUCOSE_CONTEXTS, MAX_BACKDATE_DAYS, STALE_AFTER_DAYS, CARDS, ALWAYS_SHOW, TRENDS, PERIODS,
  OBS, OBS_GROUPS, classify, parseVisit, parseObs, obsFlags, obsText, measuredAt
};
