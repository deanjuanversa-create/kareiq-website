// Risk trends and the registration-date boundary for health history.
//
// Risk trend: each risk check is compared with the previous assessment of the same test.
// The direction follows the test's own scoring rules (src/app/risk.js):
//   1. when both results have a category (good / ok / warn / bad), a better category is
//      "improving", a worse one "worsening", and the same category "stable" (the score may still
//      have moved a little within that category; the change is shown, but it does not count as
//      a trend, because the scoring rules only define the categories);
//   2. when a result has no category (e.g. the kidney score is "discuss with the doctor"), the
//      score itself decides, using which way is better for that test.
// Nothing is estimated: without an earlier assessment there is no trend.

const RANK = { good: 0, ok: 1, warn: 2, bad: 3 };
// which way is better for each test's number
const BETTER = {
  cvd: 'lower', kidney: 'lower', fib4: 'lower', nfs: 'lower', elf: 'lower', idrs: 'lower', psqi: 'lower', phq9: 'lower', gad7: 'lower',
  tug: 'lower', snehita: 'lower', mmse: 'higher', balance4: 'higher', reach: 'higher', chair30: 'higher', bmi: 'range'
};
// tests where a percentage change means something (positive measurements, not points on a questionnaire)
const PCT = new Set(['cvd', 'kidney', 'fib4', 'elf', 'tug', 'reach', 'chair30', 'bmi']);
const UNIT = { cvd: 'percentage points', kidney: 'percentage points', tug: 'seconds', reach: 'cm', chair30: 'stands', bmi: 'kg/m²', balance4: 'stages' };
const NO_HISTORY = 'Not enough historical data to determine your risk trend yet.';
// chart axis for each test: the scale its score is reported on (null = from the data)
const AXIS = {
  cvd: [0, null, '%'], kidney: [0, null, '%'], fib4: [0, null, ''], nfs: [null, null, ''], elf: [null, null, ''], idrs: [0, 100, 'points'],
  psqi: [0, 21, 'points'], phq9: [0, 27, 'points'], gad7: [0, 21, 'points'], mmse: [0, 30, 'points'], tug: [0, null, 'seconds'],
  balance4: [0, 4, 'stages'], reach: [0, null, 'cm'], chair30: [0, null, 'stands'], snehita: [0, 1, ''], bmi: [null, null, 'kg/m²']
};

const decimals = (v) => { const s = String(v); return s.includes('.') ? s.split('.')[1].length : 0; };
const roundTo = (v, d) => Math.round(v * 10 ** d) / 10 ** d;

// a: current, b: previous (each { value, level, band, at })
function compare(test, a, b) {
  if (!b) return { direction: 'none', text: NO_HISTORY };
  const d = Math.max(decimals(a.value), decimals(b.value));
  const change = typeof a.value === 'number' && typeof b.value === 'number' ? roundTo(a.value - b.value, Math.min(d, 3)) : null;
  const pct = change != null && PCT.has(test) && b.value > 0 ? roundTo((change / b.value) * 100, 1) : null;
  const unit = UNIT[test] || 'points';
  const moved = change == null || change === 0 ? 'The score is unchanged.' : `The score ${change > 0 ? 'rose' : 'fell'} by ${Math.abs(change)} ${unit}.`;
  let direction;
  let why;
  if (RANK[a.level] != null && RANK[b.level] != null) {
    const diff = RANK[a.level] - RANK[b.level];
    direction = diff < 0 ? 'improving' : diff > 0 ? 'worsening' : 'stable';
    why = diff === 0 ? `Still in the same category (${a.band}). ${moved}` : `Moved from "${b.band}" to "${a.band}". ${moved}`;
  } else if (change != null && BETTER[test] && BETTER[test] !== 'range') {
    direction = change === 0 ? 'stable' : (change < 0) === (BETTER[test] === 'lower') ? 'improving' : 'worsening';
    why = `${moved} For this test a ${BETTER[test]} number is better.`;
  } else {
    direction = 'stable';
    why = moved;
  }
  return { direction, change, pct, unit, text: why };
}

// risk history (newest first) -> one trend per test, using only assessments from fromMs onwards
function riskTrends(risks, bmiReadings, fromMs, describe) {
  const byTest = {};
  for (const r of risks) {
    const ms = Date.parse(r.at);
    if (!(ms >= fromMs)) continue;
    (byTest[r.test] = byTest[r.test] || []).push({ ...r, ms });
  }
  if (bmiReadings.length) {
    byTest.bmi = bmiReadings.filter((r) => r.measuredMs >= fromMs).map((r) => ({ ...describe.bmi(r.value), test: 'bmi', at: r.measuredAt, ms: r.measuredMs }));
  }
  const out = [];
  for (const test of Object.keys(byTest)) {
    const list = byTest[test].sort((x, y) => y.ms - x.ms);
    // repeated timestamps count once (the newest entry)
    const uniq = list.filter((x, i) => i === 0 || x.ms !== list[i - 1].ms);
    const cur = uniq[0], prev = uniq[1] || null;
    const t = compare(test, cur, prev);
    // every assessment from registration onwards, oldest first, for the history chart
    const history = uniq.slice().reverse().map((x) => ({ value: typeof x.value === 'number' ? x.value : null, display: x.display, band: x.band, level: x.level || null, at: x.at, ms: x.ms }));
    const numeric = history.every((h) => h.value != null);
    out.push({
      test, title: describe.title(test), history, kind: numeric ? 'numeric' : 'categorical', axis: AXIS[test] || [null, null, ''],
      current: { value: cur.value, display: cur.display, band: cur.band, level: cur.level || null, at: cur.at },
      previous: prev ? { value: prev.value, display: prev.display, band: prev.band, level: prev.level || null, at: prev.at } : null,
      assessments: uniq.length, ...t
    });
  }
  return out;
}

// India time: the start of the day of a date or timestamp
function dayStartIST(isoOrMs) {
  const ms = typeof isoOrMs === 'number' ? isoOrMs : Date.parse(isoOrMs);
  if (Number.isNaN(ms)) return null;
  const ist = new Date(ms + 5.5 * 3600000).toISOString().slice(0, 10);
  return Date.parse(ist + 'T00:00:00+05:30');
}
// a person's registration date (the earliest point of their history)
function registeredMs(person) { return dayStartIST(person.registeredAt || person.createdAt || 0) || 0; }

// readings newest first -> one reading per metric and timestamp (repeated entries count once)
function dedupe(readings) {
  const seen = new Set();
  return readings.filter((r) => { const k = r.metric + '|' + r.measuredMs; if (seen.has(k)) return false; seen.add(k); return true; });
}

module.exports = { AXIS, compare, riskTrends, registeredMs, dayStartIST, dedupe, NO_HISTORY, BETTER, RANK };
