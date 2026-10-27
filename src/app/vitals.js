// Health readings: what can be recorded, typing-mistake limits, and visit validation.
// Ported from the KareNest dashboard (app/config.py + app/visits.py).
//
// Safety rules carried over:
// - The limits below only catch typing mistakes (1200 instead of 120). They say nothing about
//   whether a value is healthy. No "normal / high" labels are shown until clinical sign-off.
// - Readings are never deleted. A wrong one is removed WITH a reason and stays in the record.

const METRICS = {
  bp: { label: 'Blood pressure', unit: 'mmHg', series: [['systolic', 'Systolic'], ['diastolic', 'Diastolic']], connectDays: 1 },
  hr: { label: 'Heart rate', unit: 'bpm', series: [['value', 'Heart rate']], connectDays: 1 },
  glucose: { label: 'Blood sugar', unit: 'mg/dL', series: [['value', 'Blood sugar']], connectDays: 3 },
  spo2: { label: 'Oxygen level', unit: '%', series: [['value', 'SpO2']], connectDays: 1 },
  temp: { label: 'Temperature', unit: '°C', series: [['value', 'Temperature']], connectDays: 1 },
  weight: { label: 'Weight', unit: 'kg', series: [['value', 'Weight']], connectDays: 0 },
  height: { label: 'Height', unit: 'cm', series: [['value', 'Height']], connectDays: 0 },
  bmi: { label: 'BMI', unit: 'kg/m²', series: [['value', 'BMI']], connectDays: 0 },
  chol: { label: 'Total cholesterol', unit: 'mg/dL', series: [['value', 'Total cholesterol']], connectDays: 0 }
};

const LIMITS = {
  systolic: [50, 260], diastolic: [30, 160], hr: [20, 250], glucose: [20, 600], chol: [50, 500],
  spo2: [50, 100], temp: [30, 45], weight: [2, 300], height: [40, 250]
};
const GLUCOSE_CONTEXTS = { fasting: 'Fasting', post_meal: 'After meal', random: 'Random' };
const MAX_BACKDATE_DAYS = 7;
const STALE_AFTER_DAYS = 30;
const CARDS = ['bp', 'hr', 'glucose', 'spo2', 'temp', 'bmi', 'weight', 'chol']; // order on the family dashboard
const ALWAYS_SHOW = ['bp', 'hr', 'glucose', 'spo2'];
const TRENDS = ['bp', 'hr', 'glucose', 'spo2', 'weight'];
const PERIODS = { '7d': ['Last 7 days', 7], '1m': ['Month', 30], '6m': ['6 months', 182], '1y': ['1 year', 365] };
const IST_OFFSET = '+05:30';

function number(raw, name, errors, integer) {
  const s = String(raw ?? '').trim().replace(',', '.');
  if (s === '') return null;
  const v = Number(s);
  if (!Number.isFinite(v)) { errors[name] = 'Please enter a number'; return null; }
  if (integer && !Number.isInteger(v)) { errors[name] = 'Please enter a whole number'; return null; }
  const [lo, hi] = LIMITS[name];
  if (v < lo || v > hi) { errors[name] = `This looks like a typing mistake (expected ${lo}–${hi})`; return null; }
  return integer ? v : Math.round(v * 10) / 10;
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

// Turns one visit form into a list of readings, or errors shown next to each field.
function parseVisit(body, lastHeight) {
  const errors = {};
  const sys = number(body.systolic, 'systolic', errors, true);
  const dia = number(body.diastolic, 'diastolic', errors, true);
  const hr = number(body.hr, 'hr', errors, true);
  const glucose = number(body.glucose, 'glucose', errors, false);
  const spo2 = number(body.spo2, 'spo2', errors, true);
  const temp = number(body.temp, 'temp', errors, false);
  const weight = number(body.weight, 'weight', errors, false);
  const height = number(body.height, 'height', errors, false);
  const chol = number(body.chol, 'chol', errors, false);
  const when = measuredAt(body.date, body.time, errors);
  const note = typeof body.note === 'string' ? body.note.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim() : '';

  if ((sys === null) !== (dia === null) && !errors.systolic && !errors.diastolic) {
    errors[dia === null ? 'diastolic' : 'systolic'] = 'Enter both blood pressure numbers';
  }
  if (sys !== null && dia !== null && sys <= dia) errors.systolic = 'The top number should be higher than the bottom number';
  const ctx = body.glucoseContext || null;
  if (glucose !== null && !GLUCOSE_CONTEXTS[ctx]) errors.glucoseContext = 'Choose when the sugar was measured';
  if (note.length > 1000) errors.note = 'Note is too long (max 1000 characters)';

  const any = [sys, hr, glucose, spo2, temp, weight, height, chol].some((v) => v !== null);
  if (!any && !note && !Object.keys(errors).length) errors.form = 'Enter at least one reading, or a note about the visit';
  if (Object.keys(errors).length) return { errors };

  const readings = [];
  if (sys !== null) readings.push({ metric: 'bp', systolic: sys, diastolic: dia });
  for (const [metric, value] of [['hr', hr], ['spo2', spo2], ['temp', temp], ['weight', weight], ['height', height], ['chol', chol]]) {
    if (value !== null) readings.push({ metric, value });
  }
  if (glucose !== null) readings.push({ metric: 'glucose', value: glucose, context: ctx });
  if (weight !== null) {
    const h = height !== null ? height : lastHeight;
    if (h) readings.push({ metric: 'bmi', value: Math.round((weight / ((h / 100) ** 2)) * 10) / 10, calculated: true });
  }
  return { errors: null, when, note: note || null, readings };
}

module.exports = { METRICS, LIMITS, GLUCOSE_CONTEXTS, MAX_BACKDATE_DAYS, STALE_AFTER_DAYS, CARDS, ALWAYS_SHOW, TRENDS, PERIODS, parseVisit, measuredAt };
