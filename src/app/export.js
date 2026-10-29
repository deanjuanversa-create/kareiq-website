// "Download trends": the health report the family chooses, built from the same filtered data the
// dashboard shows (src/app/api.js dashboardData). The dashboard's period decides the dates; the
// family chooses the vitals and what goes in; the format is PDF, Excel or CSV.
// Nothing is estimated: a vital with no readings in the period says so.

const vitals = require('./vitals');
const xlsx = require('./xlsx');
const report = require('./report');
const { RANK } = require('./trends');

const PARTS = ['charts', 'readings', 'averages', 'latest', 'risktrend'];
const PART_NAMES = { charts: 'Historical trend charts', readings: 'Recorded measurements', averages: 'Average values', latest: 'Latest measurements and status', risktrend: 'Risk trend summary' };
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
  const metrics = String(q.get('metrics') || '').split(',').map((s) => s.trim()).filter((k) => all.includes(k));
  if (!metrics.length) return { error: 'Choose at least one vital to download.' };
  let parts = String(q.get('parts') || '').split(',').map((s) => s.trim());
  if (parts.includes('complete')) parts = PARTS.slice();
  parts = PARTS.filter((p) => parts.includes(p));
  if (!parts.length) return { error: 'Choose what the report should include.' };
  const format = FORMATS[q.get('format')] ? q.get('format') : null;
  if (!format) return { error: 'Choose PDF, Excel or CSV.' };
  return { metrics: [...new Set(metrics)].sort((a, b) => all.indexOf(a) - all.indexOf(b)), parts, format };
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
  const withData = pick.filter((m) => !m.noData);
  const allMs = withData.flatMap((m) => m.rows.map((r) => r.ms));
  return {
    person: d.person, generatedAt: niceT(new Date().toISOString()), generatedBy: user.name,
    period: { label: d.range.label, from: d.range.from, to: d.range.to, clamped: d.range.clamped, registeredOn: d.range.registeredOn, requestedFrom: d.range.requestedFrom },
    covered: allMs.length ? { from: nice(new Date(Math.min(...allMs)).toISOString()), to: nice(new Date(Math.max(...allMs)).toISOString()) } : null,
    metrics: pick, parts: opts.parts, riskTrend: d.riskTrend || []
  };
}

const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
function fileName(ds, opts) {
  const labels = opts.metrics.map((k) => vitals.METRICS[k].label);
  const part = opts.metrics.length === vitals.TRENDS.length ? 'all-vitals' : labels.length <= 3 ? labels.map(slug).join('-') : labels.length + '-vitals';
  return `health-trends-${part}-${ds.period.to}.${opts.format}`;
}

const periodLine = (ds) => `${ds.period.label}: ${nice(ds.period.from + 'T12:00:00+05:30')} to ${nice(ds.period.to + 'T12:00:00+05:30')}` +
  (ds.period.clamped ? ` (history begins on ${nice(ds.period.registeredOn + 'T12:00:00+05:30')}, the registration date)` : '');
const trendWord = { improving: 'Improving', worsening: 'Worsening', stable: 'Stable', none: 'No trend yet' };

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
  if (ds.parts.includes('risktrend')) {
    if (!ds.riskTrend.length) out.push(['Risk trend', '', '', '', '', '', '', '', 'No risk checks recorded yet.']);
    for (const t of ds.riskTrend) out.push(['Risk trend', t.title, fmtDate.format(new Date(t.current.at)), '', t.current.display, '', '', trendWord[t.direction], (t.previous ? `Previous ${t.previous.display} (${t.previous.band}) on ${fmtDate.format(new Date(t.previous.at))}. ` : '') + t.text]);
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
    ['Vitals', ds.metrics.map((m) => m.label).join(', ')],
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
  if (has('averages')) sheets.push({ name: 'Averages', header: 0, widths: [24, 14, 10, 22, 24, 12, 40], rows: [['Vital', 'Average', 'Unit', 'Status', 'Based on', 'Readings', 'Period'],
    ...ds.metrics.map((m) => (m.noData ? [m.label, '', m.unit, '', '', 0, 'No measurements recorded in this period'] : [m.label, m.metric === 'bp' ? m.average : Number(m.average), m.unit, m.status || '', m.averageNote || 'all readings', m.rows.length, `${ds.period.from} to ${ds.period.to}`]))] });
  if (has('latest')) sheets.push({ name: 'Latest', header: 0, widths: [24, 14, 10, 12, 22, 22], rows: [['Vital', 'Latest value', 'Unit', 'Context', 'Status', 'Measured (IST)'],
    ...ds.metrics.map((m) => (m.noData ? [m.label, 'No data', m.unit, '', '', ''] : [m.label, m.metric === 'bp' ? valueOf('bp', m.latest) : Number(m.latest.value), m.unit, ctx(m.latest), m.latest.status || '', niceT(m.latest.at)]))] });
  if (has('risktrend')) {
    const rows = [['Vital or test', 'Trend', 'Current', 'Current category', 'Measured', 'Previous', 'Previous category', 'Measured', 'Change', 'Change %', 'Explanation']];
    for (const m of ds.metrics) rows.push([m.label + ' (this period)', m.noData ? 'No data' : m.trend ? trendWord[m.trend.direction] : 'Not enough data', m.noData ? '' : valueOf(m.metric, m.latest), m.noData ? '' : m.latest.status || '', m.noData ? '' : nice(m.latest.at), m.trend ? valueOf(m.metric, m.trend.from) : '', m.trend ? m.trend.from.status || '' : '', m.trend ? nice(m.trend.from.at) : '', '', '', vitalTrendText(m)]);
    for (const t of ds.riskTrend) rows.push([t.title, trendWord[t.direction], t.current.display, t.current.band, nice(t.current.at), t.previous ? t.previous.display : '', t.previous ? t.previous.band : '', t.previous ? nice(t.previous.at) : '', t.change == null ? '' : t.change, t.pct == null ? '' : t.pct, t.text]);
    if (!ds.riskTrend.length) rows.push(['Risk checks', 'No trend yet', '', '', '', '', '', '', '', '', 'No risk checks recorded yet.']);
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
    riskTrend: ds.riskTrend.map((t) => ({ ...t, word: trendWord[t.direction], at: nice(t.current.at), prevAt: t.previous ? nice(t.previous.at) : null }))
  });
}

async function build(d, opts, user) {
  const ds = dataset(d, opts, user);
  const body = opts.format === 'csv' ? csv(ds) : opts.format === 'xlsx' ? excel(ds) : await pdf(ds);
  return { body, type: FORMATS[opts.format], name: fileName(ds, opts), dataset: ds };
}

module.exports = { build, parseOptions, PARTS, PART_NAMES, FORMATS };
