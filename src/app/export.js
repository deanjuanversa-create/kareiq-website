// "Download trends": the health report the family chooses, built from the same filtered data the
// dashboard shows (src/app/api.js dashboardData). The dashboard's period decides the dates; the
// family chooses the vitals and what goes in; the format is PDF, Excel or CSV.
// Nothing is estimated: a vital with no readings in the period says so.

const vitals = require('./vitals');
const xlsx = require('./xlsx');
const report = require('./report');
const { RANK } = require('./trends');
const risk = require('./risk');
const RISK_IDS = risk.TESTS.map((t) => t.id);

const PARTS = ['charts', 'readings', 'averages', 'latest', 'risktrend'];
const PART_NAMES = { charts: 'Historical trend charts', readings: 'Recorded measurements', averages: 'Average values', latest: 'Latest measurements and status', risktrend: 'Trend summary' };
const FORMATS = { pdf: 'application/pdf', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', csv: 'text/csv; charset=utf-8' };

const tz = { timeZone: 'Asia/Kolkata' };
const fmtDate = new Intl.DateTimeFormat('en-CA', tz);                                   // 2026-10-29
const fmtTime = new Intl.DateTimeFormat('en-GB', { ...tz, hour: '2-digit', minute: '2-digit', hour12: false }); // 09:15
const fmtNice = new Intl.DateTimeFormat('en-IN', { ...tz, day: 'numeric', month: 'short', year: 'numeric' });
const fmtNiceTime = new Intl.DateTimeFormat('en-IN', { ...tz, day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
const nice = (iso) => fmtNice.format(new Date(iso)).replace('Sept', 'Sep');
const niceT = (iso) => fmtNiceTime.format(new Date(iso)).replace('Sept', 'Sep');
const valueOf = (metric, r) => (metric === 'bp' ? `${r.systolic}/${r.diastolic}` : String(r.value));
const ctx = (r) => (r.context ? vitals.GLUCOSE_CONTEXTS[r.context] || r.context : '');

// checks the request: returns { metrics, parts, format } or { error }
function parseOptions(q) {
  const all = vitals.TRENDS;
  const asked = String(q.get('metrics') || '').split(',').map((s) => s.trim());
  const metrics = asked.filter((k) => all.includes(k));
  const risks = [...new Set(asked.filter((k) => /^risk:/.test(k)).map((k) => k.slice(5)).filter((k) => RISK_IDS.includes(k)))];
  if (!metrics.length && !risks.length) return { error: 'Choose at least one vital or risk check to download.' };
  let parts = String(q.get('parts') || '').split(',').map((s) => s.trim());
  if (parts.includes('complete')) parts = PARTS.slice();
  parts = PARTS.filter((p) => parts.includes(p));
  if (!parts.length) return { error: 'Choose what the report should include.' };
  const format = FORMATS[q.get('format')] ? q.get('format') : null;
  if (!format) return { error: 'Choose PDF, Excel or CSV.' };
  return { metrics: [...new Set(metrics)].sort((a, b) => all.indexOf(a) - all.indexOf(b)), risks: risks.sort((a, b) => RISK_IDS.indexOf(a) - RISK_IDS.indexOf(b)), parts, format };
}

// the content shared by every format
function dataset(d, opts, user) {
  const pick = opts.metrics.map((k) => {
    const m = d.series.find((x) => x.metric === k);
    const def = vitals.METRICS[k];
    if (!m) return { metric: k, label: def.label, unit: def.unit, keys: def.series.map((s) => s[0]), names: def.series.map((s) => s[1]), rows: [], noData: true };
    const rows = m.rows;
    const first = rows[0], last = rows[rows.length - 1];
    let trend = null;
    if (rows.length >= 2 && RANK[first.level] != null && RANK[last.level] != null) {
      const diff = RANK[last.level] - RANK[first.level];
      trend = { direction: diff < 0 ? 'improving' : diff > 0 ? 'worsening' : 'stable', from: first, to: last };
    } else if (rows.length >= 2) trend = { direction: 'stable', from: first, to: last, unrated: true };
    return { ...m, noData: false, latest: last, firstRow: first, trend };
  });
  const fromMs = Date.parse(d.range.from + 'T00:00:00+05:30'), toMs = Date.parse(d.range.to + 'T23:59:59+05:30');
  const risks = (opts.risks || []).map((id) => {
    const t = (d.riskTrend || []).find((x) => x.test === id);
    const title = (risk.TESTS.find((x) => x.id === id) || {}).title || id;
    if (!t) return { test: id, title, none: true, inPeriod: [] };
    return { ...t, none: false, inPeriod: t.history.filter((h) => h.ms >= fromMs && h.ms <= toMs) };
  });
  const withData = pick.filter((m) => !m.noData);
  const allMs = withData.flatMap((m) => m.rows.map((r) => r.ms)).concat(risks.flatMap((r) => r.inPeriod.map((h) => h.ms)));
  return {
    person: d.person, generatedAt: niceT(new Date().toISOString()), generatedBy: user.name,
    period: { label: d.range.label, from: d.range.from, to: d.range.to, clamped: d.range.clamped, registeredOn: d.range.registeredOn, requestedFrom: d.range.requestedFrom },
    covered: allMs.length ? { from: nice(new Date(Math.min(...allMs)).toISOString()), to: nice(new Date(Math.max(...allMs)).toISOString()) } : null,
    metrics: pick, parts: opts.parts, risks
  };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function fileName(ds, opts) {
  const short = (id) => ({ cvd: 'heart-risk', kidney: 'kidney-risk', fib4: 'fib4', nfs: 'nfs', elf: 'elf', idrs: 'diabetes-risk', psqi: 'sleep-quality', phq9: 'phq9', gad7: 'gad7', mmse: 'mmse', tug: 'tug', balance4: 'balance', reach: 'reach', chair30: 'chair-stand', snehita: 'breast-risk' }[id] || id);
  const labels = opts.metrics.map((k) => slug(vitals.METRICS[k].label)).concat((opts.risks || []).map(short));
  const n = labels.length;
  const part = opts.metrics.length === vitals.TRENDS.length && !(opts.risks || []).length ? 'all-vitals' : n <= 3 ? labels.join('-') : n + '-items';
  return `health-trends-${part}-${ds.period.to}.${opts.format}`;
}

const periodLine = (ds) => `${ds.period.label}: ${nice(ds.period.from + 'T12:00:00+05:30')} to ${nice(ds.period.to + 'T12:00:00+05:30')}` +
  (ds.period.clamped ? ` (history begins on ${nice(ds.period.registeredOn + 'T12:00:00+05:30')}, the registration date)` : '');
const trendWord = { improving: 'Improving', worsening: 'Worsening', stable: 'Stable', none: 'Insufficient data' };

// ---------------------------------------------------------------- CSV
function csv(ds) {
  const q = (v) => {
    let s = v == null ? '' : String(v);
    if (/^[=+@]/.test(s) || /^-[^\d]/.test(s)) s = "'" + s;   // a cell must never run as a formula
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  const out = [['Section', 'Vital or test', 'Date', 'Time (IST)', 'Value', 'Unit', 'Context', 'Status', 'Details']];
  out.push(['Report', 'KareIQ health trends', '', '', ds.person.name, '', '', '', `Generated ${ds.generatedAt}; ${periodLine(ds)}`]);
  if (ds.parts.includes('charts')) out.push(['Note', '', '', '', '', '', '', '', 'Trend charts cannot be included in a CSV file. Choose PDF or Excel for charts.']);
  for (const m of ds.metrics) {
    if (m.noData) { out.push(['No data', m.label, '', '', '', m.unit, '', '', 'No measurements recorded in this period.']); continue; }
    if (ds.parts.includes('readings')) for (const r of m.rows) out.push(['Measurement', m.label, fmtDate.format(new Date(r.ms)), fmtTime.format(new Date(r.ms)), valueOf(m.metric, r), m.unit, ctx(r), r.status || '', '']);
    if (ds.parts.includes('averages')) out.push(['Average', m.label, ds.period.from, '', m.average, m.unit, m.averageNote || '', m.status || '', `From ${m.rows.length} measurement${m.rows.length === 1 ? '' : 's'} between ${ds.period.from} and ${ds.period.to}`]);
    if (ds.parts.includes('latest')) out.push(['Latest', m.label, fmtDate.format(new Date(m.latest.ms)), fmtTime.format(new Date(m.latest.ms)), valueOf(m.metric, m.latest), m.unit, ctx(m.latest), m.latest.status || '', 'Most recent measurement in this period']);
    if (ds.parts.includes('risktrend')) out.push(['Trend in period', m.label, '', '', '', '', '', m.trend ? trendWord[m.trend.direction] : 'Not enough data', vitalTrendText(m)]);
  }
  for (const t of ds.risks) {
    if (t.none) { out.push(['No data', t.title, '', '', '', '', '', '', 'No assessments recorded yet.']); continue; }
    if (ds.parts.includes('readings')) {
      if (!t.inPeriod.length) out.push(['No data', t.title, '', '', '', '', '', '', 'No assessments in this period.']);
      for (const h of t.inPeriod) out.push(['Assessment', t.title, fmtDate.format(new Date(h.ms)), fmtTime.format(new Date(h.ms)), h.display, t.axis[2] || '', '', h.band || '', '']);
    }
    if (ds.parts.includes('averages')) out.push(['Note', t.title, '', '', '', '', '', '', 'Averages are not given for risk scores; each assessment stands on its own.']);
    if (ds.parts.includes('latest')) {
      const h = t.inPeriod[t.inPeriod.length - 1];
      out.push(h ? ['Latest assessment', t.title, fmtDate.format(new Date(h.ms)), fmtTime.format(new Date(h.ms)), h.display, t.axis[2] || '', '', h.band || '', 'Most recent assessment in this period']
        : ['Latest assessment', t.title, fmtDate.format(new Date(t.current.at)), '', t.current.display, '', '', t.current.band || '', 'No assessment in this period; this is the latest one, from before it']);
    }
    if (ds.parts.includes('risktrend')) out.push(['Risk trend', t.title, fmtDate.format(new Date(t.current.at)), '', t.current.display, '', '', trendWord[t.direction], (t.previous ? `Previous ${t.previous.display} (${t.previous.band}) on ${fmtDate.format(new Date(t.previous.at))}. ` : '') + t.text]);
  }
  return Buffer.from('﻿' + out.map((r) => r.map(q).join(',')).join('\r\n') + '\r\n', 'utf8');
}

function vitalTrendText(m) {
  if (m.noData) return 'No measurements recorded in this period.';
  if (!m.trend) return 'Only one measurement in this period, so there is no trend yet.';
  const a = m.trend.from, b = m.trend.to;
  if (m.trend.unrated) return `First ${valueOf(m.metric, a)} on ${nice(a.at)}, latest ${valueOf(m.metric, b)} on ${nice(b.at)}. This reading has no standard range, so no direction is given.`;
  return `First ${valueOf(m.metric, a)} (${a.status || 'no status'}) on ${nice(a.at)}; latest ${valueOf(m.metric, b)} (${b.status || 'no status'}) on ${nice(b.at)}.`;
}

// ---------------------------------------------------------------- Excel
function excel(ds) {
  const sheets = [];
  const has = (p) => ds.parts.includes(p);
  const summary = [
    [{ v: 'KareIQ health trends', s: 2 }], [],
    ['Person', ds.person.name + (ds.person.id ? ' (' + ds.person.id + ')' : '')],
    ['Generated', ds.generatedAt + ' by ' + ds.generatedBy],
    ['Reporting period', periodLine(ds)],
    ['Data covered', ds.covered ? `${ds.covered.from} to ${ds.covered.to}` : 'No measurements for the chosen vitals in this period'],
    ['Vitals', ds.metrics.length ? ds.metrics.map((m) => m.label).join(', ') : 'None chosen'],
    ['Risk checks', ds.risks.length ? ds.risks.map((t) => t.title).join(', ') : 'None chosen'],
    ['Includes', ds.parts.map((p) => PART_NAMES[p]).join(', ')], []
  ];
  for (const m of ds.metrics) if (m.noData) summary.push([m.label, { v: 'No measurements recorded in this period.', s: 3 }]);
  summary.push([], [{ v: 'Times are India Standard Time. Colours and statuses compare readings with KareIQ\'s standard ranges; they are a guide, not a diagnosis.', s: 3 }]);
  sheets.push({ name: 'Summary', rows: summary, widths: [22, 90] });

  // measurement tables: one sheet per vital (also the source of the charts)
  const dataSheet = (m, name) => {
    const head = ['When (IST)', 'Date', 'Time', ...m.names.map((n) => n + (m.unit ? ' (' + m.unit + ')' : '')), ...(m.metric === 'glucose' ? ['Context'] : []), 'Status'];
    const rows = [head, ...m.rows.map((r) => [fmtDate.format(new Date(r.ms)).slice(5) + ' ' + fmtTime.format(new Date(r.ms)), fmtDate.format(new Date(r.ms)), fmtTime.format(new Date(r.ms)), ...m.keys.map((k) => (r[k] == null ? null : Number(r[k]))), ...(m.metric === 'glucose' ? [ctx(r)] : []), r.status || ''])];
    return { name, rows, header: 0, widths: [14, 12, 8, ...m.keys.map(() => 16), ...(m.metric === 'glucose' ? [12] : []), 20] };
  };
  const withData = ds.metrics.filter((m) => !m.noData);
  const charts = [];
  let hiddenRows = null;
  for (const m of withData) {
    let sheet;
    if (has('readings')) { sheet = dataSheet(m, m.label); sheets.push(sheet); }
    if (has('charts')) {
      if (!sheet) { // charts only: their numbers live on a hidden sheet
        if (!hiddenRows) { hiddenRows = { name: 'Chart data', rows: [], hidden: true }; }
        const start = hiddenRows.rows.length;
        const t = dataSheet(m, 'Chart data');
        hiddenRows.rows.push(...t.rows, []);
        charts.push({ m, sheet: 'Chart data', r0: start });
      } else charts.push({ m, sheet: sheet.name, r0: 0 });
    }
  }
  if (hiddenRows) sheets.push(hiddenRows);
  if (charts.length) {
    const chartSheet = { name: 'Charts', rows: [[{ v: 'Trend charts: ' + periodLine(ds), s: 2 }]], widths: [], charts: [] };
    charts.forEach((c, i) => {
      const n = c.m.rows.length;
      chartSheet.charts.push({ title: c.m.label, unit: c.m.unit, sheet: c.sheet, cat: [0, c.r0 + 1, c.r0 + n], series: c.m.keys.map((k, j) => ({ name: c.m.names[j], col: 3 + j, r1: c.r0 + 1, r2: c.r0 + n })), anchor: [i % 2 ? 10 : 0, 2 + Math.floor(i / 2) * 20] });
    });
    // put the chart sheet straight after the summary
    sheets.splice(1, 0, chartSheet);
  }
  // risk checks: one sheet with every assessment in the period (also the source of their charts)
  const riskWith = ds.risks.filter((t) => !t.none && t.inPeriod.length);
  if (ds.risks.length && (has('readings') || has('charts'))) {
    const rows = [['Risk check', 'When (IST)', 'Date', 'Score', 'Shown as', 'Category']];
    const blocks = [];
    for (const t of ds.risks) {
      if (t.none || !t.inPeriod.length) { rows.push([t.title, '', '', null, t.none ? 'No assessments recorded yet' : 'No assessments in this period', '']); continue; }
      const r0 = rows.length;
      for (const h of t.inPeriod) rows.push([t.title, fmtDate.format(new Date(h.ms)).slice(5) + ' ' + fmtTime.format(new Date(h.ms)), fmtDate.format(new Date(h.ms)), h.value, h.display, h.band || '']);
      blocks.push({ t, r0, r1: rows.length - 1 });
    }
    const sheet = { name: 'Risk checks', rows, header: 0, widths: [44, 14, 12, 10, 22, 34], hidden: !has('readings') };
    sheets.push(sheet);
    if (has('charts')) {
      const cs = sheets.find((x) => x.name === 'Charts') || (() => { const c = { name: 'Charts', rows: [[{ v: 'Trend charts: ' + periodLine(ds), s: 2 }]], widths: [], charts: [] }; sheets.splice(1, 0, c); return c; })();
      blocks.filter((b) => b.t.kind === 'numeric').forEach((b) => {
        const i = cs.charts.length;
        cs.charts.push({ title: b.t.title, unit: b.t.axis[2] || '', sheet: 'Risk checks', cat: [1, b.r0, b.r1], series: [{ name: 'Score', col: 3, r1: b.r0, r2: b.r1 }], anchor: [i % 2 ? 10 : 0, 2 + Math.floor(i / 2) * 20] });
      });
    }
  }
  if (has('averages')) sheets.push({ name: 'Averages', header: 0, widths: [24, 14, 10, 22, 24, 12, 40], rows: [['Vital', 'Average', 'Unit', 'Status', 'Based on', 'Readings', 'Period'],
    ...ds.metrics.map((m) => (m.noData ? [m.label, '', m.unit, '', '', 0, 'No measurements recorded in this period'] : [m.label, m.metric === 'bp' ? m.average : Number(m.average), m.unit, m.status || '', m.averageNote || 'all readings', m.rows.length, `${ds.period.from} to ${ds.period.to}`]))] });
  if (has('latest')) sheets.push({ name: 'Latest', header: 0, widths: [34, 16, 10, 12, 30, 22], rows: [['Vital or risk check', 'Latest value', 'Unit', 'Context', 'Status', 'Measured (IST)'],
    ...ds.metrics.map((m) => (m.noData ? [m.label, 'No data', m.unit, '', '', ''] : [m.label, m.metric === 'bp' ? valueOf('bp', m.latest) : Number(m.latest.value), m.unit, ctx(m.latest), m.latest.status || '', niceT(m.latest.at)])),
    ...ds.risks.map((t) => { const h = t.inPeriod && t.inPeriod[t.inPeriod.length - 1]; return t.none ? [t.title, 'No data', '', '', '', ''] : h ? [t.title, h.display, t.axis[2] || '', '', h.band || '', niceT(h.at)] : [t.title, t.current.display + ' (before this period)', t.axis[2] || '', '', t.current.band || '', niceT(t.current.at)]; })] });
  if (has('risktrend')) {
    const rows = [['Vital or test', 'Trend', 'Current', 'Current category', 'Measured', 'Previous', 'Previous category', 'Measured', 'Change', 'Change %', 'Explanation']];
    for (const m of ds.metrics) rows.push([m.label + ' (this period)', m.noData ? 'No data' : m.trend ? trendWord[m.trend.direction] : 'Not enough data', m.noData ? '' : valueOf(m.metric, m.latest), m.noData ? '' : m.latest.status || '', m.noData ? '' : nice(m.latest.at), m.trend ? valueOf(m.metric, m.trend.from) : '', m.trend ? m.trend.from.status || '' : '', m.trend ? nice(m.trend.from.at) : '', '', '', vitalTrendText(m)]);
    for (const t of ds.risks) rows.push(t.none ? [t.title, 'No data', '', '', '', '', '', '', '', '', 'No assessments recorded yet.'] : [t.title, trendWord[t.direction], t.current.display, t.current.band, nice(t.current.at), t.previous ? t.previous.display : '', t.previous ? t.previous.band : '', t.previous ? nice(t.previous.at) : '', t.change == null ? '' : t.change, t.pct == null ? '' : t.pct, t.text]);
    sheets.push({ name: 'Risk trend', header: 0, widths: [34, 14, 14, 26, 14, 14, 26, 14, 9, 9, 70], rows });
  }
  return xlsx.build(sheets);
}

// ---------------------------------------------------------------- PDF
async function pdf(ds) {
  return report.build({
    person: { id: ds.person.id, name: ds.person.name, age: ds.person.age, sexName: ds.person.sex === 'male' ? 'Male' : ds.person.sex === 'female' ? 'Female' : null },
    periodLine: periodLine(ds), covered: ds.covered, createdAt: ds.generatedAt, createdBy: ds.generatedBy,
    fromMs: Date.parse(ds.period.from + 'T00:00:00+05:30'), toMs: Date.parse(ds.period.to + 'T23:59:59+05:30'),
    fmtShort: (ms) => new Intl.DateTimeFormat('en-IN', { ...tz, day: 'numeric', month: 'short' }).format(new Date(ms)),
    parts: ds.parts, partNames: ds.parts.map((p) => PART_NAMES[p]),
    metrics: ds.metrics.map((m) => ({
      label: m.label, unit: m.unit, noData: m.noData, average: m.average, averageNote: m.averageNote, status: m.status, level: m.level, series: m.keys, names: m.names,
      rows: m.rows.map((r) => ({ ...r, at: niceT(r.at), text: valueOf(m.metric, r) + (r.context ? ' ' + ctx(r).toLowerCase() : '') })),
      latest: m.latest ? { text: valueOf(m.metric, m.latest) + (m.unit ? ' ' + m.unit : ''), status: m.latest.status, level: m.latest.level, at: niceT(m.latest.at) } : null,
      trend: m.noData ? null : { word: m.trend ? trendWord[m.trend.direction] : 'Not enough data', direction: m.trend ? m.trend.direction : 'none', text: vitalTrendText(m) }
    })),
    riskTrend: ds.risks.filter((t) => !t.none).map((t) => ({ ...t, word: trendWord[t.direction], at: nice(t.current.at), prevAt: t.previous ? nice(t.previous.at) : null })),
    risks: ds.risks.map((t) => ({ title: t.title, none: t.none, kind: t.kind, axis: t.axis, direction: t.direction, word: t.none ? 'No data' : trendWord[t.direction],
      current: t.current || null, currentAt: t.current ? nice(t.current.at) : null,
      rows: (t.inPeriod || []).map((h) => ({ ms: h.ms, value: h.value, display: h.display, band: h.band, level: h.level, at: niceT(h.at) })) }))
  });
}

async function build(d, opts, user) {
  const ds = dataset(d, opts, user);
  const body = opts.format === 'csv' ? csv(ds) : opts.format === 'xlsx' ? excel(ds) : await pdf(ds);
  return { body, type: FORMATS[opts.format], name: fileName(ds, opts), dataset: ds };
}

module.exports = { build, parseOptions, PARTS, PART_NAMES, FORMATS };
