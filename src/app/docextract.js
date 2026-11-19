// Document intelligence, step 2: from the text of a medical document (PDF text layer, or the
// Tesseract LSTM OCR output with its word confidences) to structured, checked values.
//
//   classify(pages)        what kind of document it is (lab report, vitals record, ...)
//   findDates(pages)       test / collection date, report date and issue date, kept apart
//   extract(pages)         every supported value: field, value, unit, page, line, section, confidence
//   validate(items, dates) accept automatically, or send to human review (with the reasons)
//
// Only fields KareIQ already stores are extracted: the vitals (app_readings metrics) and the risk
// engine's inputs (riskrules.INPUTS). Values are converted only with fixed unit factors (for
// example mmol/L glucose x 18.016, lakhs/cumm platelets x 100, the workbook's own ACR factor);
// anything else (non-linear conversions, missing units, "<" values, plain CRP instead of hs-CRP,
// sugar without fasting/after-meal, low confidence, no test date) goes to review. Nothing here
// calculates risk; the risk engine does that from the stored readings.

const { candidates } = require('./reportdate');
const R = require('./riskrules');
const vitals = require('./vitals');

// The owner asked for values to be stored automatically. Below this confidence the reading is too
// unreliable to be a number at all (OCR noise); above it, a lower confidence is kept as a note.
const AUTO_ACCEPT = 0.6;
const NOTE_BELOW = 0.85;

// ---------------------------------------------------------------- the fields KareIQ can store
const U = (re, f, note) => ({ re, f: f === null ? null : typeof f === 'function' ? f : (v) => v * f, factor: typeof f === 'number' ? f : null, note: note || null });
const NUM = '(?:mg\\s*\\/\\s*dl|mg%)';
const MMOL = 'mmol\\s*\\/\\s*l';
const FIELDS = [
  // vitals: app_readings with these metric names (the Vitals and Body composition pages)
  { field: 'bp', kind: 'reading', name: 'Blood pressure', native: 'mmHg', special: 'bp', labels: [[/\b(?:b\.?\s?p\.?|blood\s*pressure)\b/i, 1]] },
  { field: 'hr', kind: 'reading', name: 'Heart rate', native: 'bpm', unitOptional: true, labels: [[/\b(?:pulse(?:\s*rate)?|heart\s*rate)\b/i, 1]], units: [U(/^(?:bpm|b\.p\.m|beats?\s*\/?\s*(?:per\s*)?min(?:ute)?|\/\s*min)/i, 1)] },
  { field: 'spo2', kind: 'reading', name: 'Oxygen saturation', native: '%', unitOptional: true, labels: [[/\b(?:sp\s?o\s?2|oxygen\s*saturation|o2\s*sat(?:uration)?)\b/i, 1]], units: [U(/^%/, 1)] },
  { field: 'pi', kind: 'reading', name: 'Perfusion index', native: '', unitOptional: true, labels: [[/\bperfusion\s*index\b/i, 1]], units: [U(/^%/, 1)] },
  { field: 'temp', kind: 'reading', name: 'Temperature', native: '°C', labels: [[/\b(?:body\s*)?temp(?:erature)?\b/i, 1]],
    units: [U(/^°?\s*c\b|^deg(?:ree)?s?\s*c\b|^celsius/i, 1), U(/^°?\s*f\b|^deg(?:ree)?s?\s*f\b|^fahrenheit/i, (v) => Math.round(((v - 32) * 5 / 9) * 10) / 10, '°F converted to °C')] },
  { field: 'weight', kind: 'reading', name: 'Weight', native: 'kg', labels: [[/\b(?:body\s*)?weight\b/i, 1]], exclude: /standard|ideal|birth|molecular|gain|loss/i,
    units: [U(/^kgs?\b/i, 1), U(/^(?:lbs?|pounds?)\b/i, 0.45359, 'lb converted to kg')] },
  { field: 'height', kind: 'reading', name: 'Height', native: 'cm', labels: [[/\bheight\b/i, 1]], units: [U(/^cms?\b/i, 1), U(/^m\b|^metres?\b|^meters?\b/i, 100, 'm converted to cm')] },
  { field: 'glucose', kind: 'reading', name: 'Blood sugar', native: 'mg/dL', context: true,
    labels: [[/\b(?:fasting\s*(?:blood|plasma)?\s*(?:sugar|glucose)|(?:blood|plasma)?\s*(?:sugar|glucose)\s*[-,(]?\s*fasting|f\.?b\.?s\.?)\b/i, 1, 'fasting'],
      [/\b(?:post[\s-]*prandial\s*(?:blood|plasma)?\s*(?:sugar|glucose)|(?:blood|plasma)?\s*(?:sugar|glucose)\s*[-,(]?\s*(?:post[\s-]*prandial|pp|2\s*h(?:rs?|ours?)?)|p\.?p\.?b\.?s\.?)\b/i, 1, 'post_meal'],
      [/\b(?:random\s*(?:blood|plasma)?\s*(?:sugar|glucose)|(?:blood|plasma)?\s*(?:sugar|glucose)\s*[-,(]?\s*random|r\.?b\.?s\.?)\b/i, 1, 'random'],
      [/\b(?:blood|plasma|serum)?\s*(?:sugar|glucose)\b/i, 0.95, null]],
    exclude: /urine|hba1c|glycated|average|estimated/i,
    units: [U(new RegExp('^' + NUM, 'i'), 1), U(new RegExp('^' + MMOL, 'i'), 18.016, 'mmol/L converted to mg/dL (x 18.016)')] },
  { field: 'chol', kind: 'reading', name: 'Total cholesterol', native: 'mg/dL', labels: [[/\b(?:total\s*cholesterol|cholesterol[\s,-]*total|serum\s*cholesterol|s\.?\s*cholesterol)\b/i, 1], [/^\s*cholesterol\b/i, 0.95]],
    exclude: /hdl|ldl|vldl|non[\s-]*hdl|ratio/i, units: [U(new RegExp('^' + NUM, 'i'), 1), U(new RegExp('^' + MMOL, 'i'), 38.67, 'mmol/L converted to mg/dL (x 38.67)')] },
  // the risk engine's inputs (riskrules.INPUTS): stored as assessment readings, as a nurse's entry would be
  { field: 'hdl', kind: 'input', labels: [[/\bhdl(?:[\s-]*c(?:holesterol)?)?\b|\bhigh[\s-]*density\s*lipoprotein\b/i, 1]], exclude: /non[\s-]*hdl|ratio|\/\s*hdl|hdl\s*\//i,
    units: [U(new RegExp('^' + NUM, 'i'), 1), U(new RegExp('^' + MMOL, 'i'), 38.67, 'mmol/L converted to mg/dL (x 38.67)')] },
  { field: 'crp', kind: 'input', labels: [[/\b(?:hs[\s-]*crp|high[\s-]*sensitiv\w*\s*c[\s-]*reactive\s*protein|c[\s-]*reactive\s*protein[\s,(-]*(?:high[\s-]*sensitiv\w*|hs))\b/i, 1], [/\b(?:crp|c[\s-]*reactive\s*protein)\b/i, 0.9, 'plain']],
    units: [U(/^mg\s*\/\s*l\b/i, 1), U(/^mg\s*\/\s*dl\b/i, 10, 'mg/dL converted to mg/L (x 10)')] },
  { field: 'hba1c', kind: 'input', labels: [[/\b(?:hba1c|hb\s*a1c|a1c|glycated\s*ha?emoglobin|glycosylated\s*ha?emoglobin)\b/i, 1], [/\bhba[il|]c\b/i, 0.85]],
    units: [U(/^%/, 1), U(/^mmol\s*\/\s*mol/i, null, 'mmol/mol: no fixed factor')] },
  { field: 'egfr', kind: 'input', labels: [[/\b(?:e[\s-]*gfr|estimated\s*gfr|estimated\s*glomerular\s*filtration\s*rate)\b/i, 1]],
    units: [U(/^m[l|]\s*\/\s*min(?:\s*\/\s*1\.73\s*m(?:2|²|\^2)?)?/i, 1)] },
  { field: 'acr', kind: 'input', labels: [[/\b(?:(?:urine\s*)?(?:micro)?albumin\s*(?:to|\/|:)?\s*creatinine\s*ratio|u?acr)\b/i, 1]],
    units: [U(/^(?:mg\s*\/\s*g|µg\s*\/\s*mg|ug\s*\/\s*mg|mcg\s*\/\s*mg)/i, 1), U(/^mg\s*\/\s*mmol/i, 11.3, 'mg/mmol converted to mg/g (x 11.3, the workbook factor)')] },
  { field: 'ast', kind: 'input', labels: [[/\b(?:sgot|ast|aspartate\s*(?:amino)?transaminase|aspartate\s*aminotransferase)\b/i, 1]], exclude: /\bast\s*\/\s*alt|ratio/i,
    units: [U(/^(?:i?u\s*\/\s*l|units?\s*\/\s*l)/i, 1)] },
  { field: 'alt', kind: 'input', labels: [[/\b(?:sgpt|alt|alanine\s*(?:amino)?transaminase|alanine\s*aminotransferase)\b/i, 1]], exclude: /ast\s*\/\s*alt|ratio/i,
    units: [U(/^(?:i?u\s*\/\s*l|units?\s*\/\s*l)/i, 1)] },
  { field: 'plt', kind: 'input', labels: [[/\b(?:platelet\s*count|platelets?|plt)\b/i, 1]], exclude: /mean\s*platelet|mpv|pdw|pct|distribution/i,
    units: [U(/^(?:x\s*)?10\s*(?:\^|\*)?\s*9\s*\/\s*l|^×\s*10⁹\s*\/\s*l/i, 1), U(/^(?:x\s*)?10\s*(?:\^|\*)?\s*3\s*\/\s*(?:µ|u|mc)l|^k\s*\/\s*(?:µ|u)l|^thou(?:sand)?\s*\/\s*(?:µ|u|mm3|cumm)/i, 1, '10^3/µL is the same as 10^9/L'),
      U(/^lakhs?\s*\/\s*(?:cumm|mm3|cu\.?\s*mm|µl|ul)/i, 100, 'lakhs/cumm converted to 10^9/L (x 100)'),
      U(/^(?:\/\s*(?:cumm|mm3|cu\.?\s*mm|µl|ul)|cells\s*\/\s*(?:cumm|mm3|µl|ul))/i, 0.001, '/cumm converted to 10^9/L (÷ 1000)')] },
  { field: 'alb', kind: 'input', labels: [[/\b(?:serum\s*albumin|albumin)\b/i, 1]], exclude: /creatinine|micro|globulin|ratio|urine|\ba\s*\/\s*g\b/i,
    units: [U(/^g\s*\/\s*dl\b|^gm\s*\/\s*dl\b|^g%/i, 1), U(/^g\s*\/\s*l\b/i, 0.1, 'g/L converted to g/dL (÷ 10)')] },
  { field: 'ha', kind: 'input', labels: [[/\bhyaluronic\s*acid\b/i, 1]], units: [U(/^ng\s*\/\s*ml/i, 1)] },
  { field: 'p3np', kind: 'input', labels: [[/\b(?:piiinp|p3np|procollagen\s*(?:iii|3)\s*(?:n[\s-]*terminal\s*)?(?:pro)?peptide)\b/i, 1]], units: [U(/^ng\s*\/\s*ml/i, 1)] },
  { field: 'timp1', kind: 'input', labels: [[/\b(?:timp[\s-]*1|tissue\s*inhibitor\s*of\s*metalloproteinase[\s-]*1)\b/i, 1]], units: [U(/^ng\s*\/\s*ml/i, 1)] },
  { field: 'phq9', kind: 'input', score: true, labels: [[/\bphq[\s-]*9\b(?:\s*(?:total|score))*/i, 1]] },
  { field: 'gad7', kind: 'input', score: true, labels: [[/\bgad[\s-]*7\b(?:\s*(?:total|score))*/i, 1]] },
  { field: 'psqi', kind: 'input', score: true, labels: [[/\b(?:psqi|pittsburgh\s*sleep\s*quality\s*index)\b(?:\s*(?:global|total|score))*/i, 1]] },
  { field: 'idrs', kind: 'input', score: true, labels: [[/\b(?:idrs|indian\s*diabetes\s*risk\s*score)\b(?:\s*(?:total|score))*/i, 1]] },
  { field: 'mmse', kind: 'input', score: true, labels: [[/\b(?:mmse|mini[\s-]*mental\s*state\s*exam(?:ination)?)\b(?:\s*(?:total|score))*/i, 1]] },
  { field: 'tug', kind: 'input', labels: [[/\b(?:timed\s*up\s*(?:and|&)\s*go|tug)\b(?:\s*test)?/i, 1]], units: [U(/^(?:s|sec|secs|seconds?)\b/i, 1)] },
  { field: 'chair30', kind: 'input', score: true, labels: [[/\b30[\s-]*s(?:ec(?:ond)?)?[\s-]*chair[\s-]*stand(?:\s*test)?\b/i, 1]] }
];
for (const f of FIELDS) {
  if (f.kind === 'input') { const d = R.INPUTS[f.field]; f.name = d.label; f.native = d.unit === 'points' ? '' : d.unit; f.limits = [d.min, d.max]; f.integer = Boolean(d.integer); }
  else if (f.field === 'bp') f.limits = null;
  else f.limits = vitals.LIMITS[f.field];
  if (f.score) f.unitOptional = true;
}
const BY_FIELD = Object.fromEntries(FIELDS.map((f) => [f.field, f]));

// ---------------------------------------------------------------- what kind of document
const TYPES = [
  ['lab_report', 'Laboratory report', [/\b(?:test\s*name|investigation|result|biological\s*ref|reference\s*(?:range|interval)|specimen|sample|laborator|pathology|haematology|biochemistry)\b/gi]],
  ['vitals_record', 'Vitals record', [/\b(?:vital\s*signs?|blood\s*pressure|pulse|spo2|temperature|respiratory\s*rate)\b/gi]],
  ['prescription', 'Prescription', [/\b(?:rx|prescription|tab\.?|cap\.?|syrup|once\s*daily|twice\s*daily|od|bd|tds|after\s*food|before\s*food)\b/gi]],
  ['discharge_summary', 'Discharge summary', [/\b(?:discharge\s*summary|date\s*of\s*admission|course\s*in\s*hospital|diagnosis\s*at\s*discharge)\b/gi]],
  ['imaging', 'Imaging report', [/\b(?:x[\s-]*ray|ultrasound|usg|ct\s*scan|mri|echocardiograph|impression|radiolog)\b/gi]],
  ['assessment', 'Questionnaire or assessment', [/\b(?:phq[\s-]*9|gad[\s-]*7|psqi|mmse|idrs|questionnaire|timed\s*up\s*and\s*go|chair\s*stand)\b/gi]]
];
const SECTION = /^\s*([A-Z][A-Z0-9 &/(),.-]{3,60})\s*$/;
const PANELS = /(lipid|liver|kidney|renal|blood\s*count|ha?emogram|cbc|glyc|diabet|sugar|urine|thyroid|vital|biochem|ha?ematolog|fibrosis|elf|electrolyte|panel|profile|function)/i;

function classify(pages) {
  const text = (pages || []).map((p) => p.text || '').join('\n');
  const scores = TYPES.map(([id, label, res]) => ({ id, label, score: res.reduce((n, re) => n + (text.match(re) || []).length, 0) })).sort((a, b) => b.score - a.score);
  const top = scores[0];
  if (!top || top.score < 2) return { type: 'other', label: 'Other document', scores };
  return { type: top.id, label: top.label, scores, confidence: Math.min(1, top.score / (top.score + (scores[1] ? scores[1].score : 0) + 1)) };
}

// ---------------------------------------------------------------- dates, kept apart by kind
const TEST_KINDS = ['Collection date', 'Test date', 'Visit date'];
function findDates(pages) {
  const all = candidates(pages).filter((c) => c.score > -20);
  const pick = (kinds) => {
    const list = all.filter((c) => kinds.includes(c.label));
    const distinct = [...new Set(list.map((c) => c.date))];
    if (!list.length) return null;
    const first = list.find((c) => c.date === distinct[0]);
    return { date: distinct.length === 1 ? distinct[0] : null, values: distinct, raw: first.raw, label: first.label, page: first.page, line: first.line, context: first.context, twoDigitYear: list.some((c) => c.twoDigitYear), ambiguous: distinct.length > 1 };
  };
  const test = pick(TEST_KINDS), report = pick(['Report date']), issue = pick(['Printed date', 'Date']);
  // the measurement date is the test / collection date only; the report or upload date is never used instead
  let measured = null, status = 'unknown', reason = 'No test or collection date in the document.';
  let note = null;
  if (test && test.ambiguous) { status = 'ambiguous'; reason = 'The document shows more than one test or collection date (' + test.values.join(', ') + ').'; }
  else if (test) { measured = test.date; status = 'found'; reason = null; if (test.twoDigitYear) note = 'Two-digit year "' + test.raw + '" read as ' + test.date.slice(0, 4) + '.'; }
  else if (report) reason = 'Only a report date (' + report.raw + ') is shown, not the test or collection date.';
  return { measured, status, reason, note, test, report, issue, all: all.slice(0, 12).map((c) => ({ date: c.date, label: c.label || 'Date', raw: c.raw, page: c.page, line: c.line })) };
}

// ---------------------------------------------------------------- values
const NUMBER = /(?<![\d.,])([<>≤≥]=?\s*)?(\d{1,6}(?:[.,]\d+)?)(?![\d])/;
// one line of a page: text plus, for OCR, the words with Tesseract's confidence
function wordsConf(line, from, to) {
  if (!line.words) return line.conf != null ? line.conf : 100;
  let pos = 0; const cs = [];
  for (const [w, c] of line.words) {
    const s = line.text.indexOf(w, pos); if (s < 0) continue;
    const e = s + w.length; pos = e;
    if (e > from && s < to) cs.push(c);
  }
  return cs.length ? Math.min(...cs) : line.conf || 0;
}
function labelMatches(text) {
  const out = [];
  for (const f of FIELDS) {
    if (f.exclude && f.exclude.test(text)) continue;
    for (const [re, strength, tag] of f.labels) {
      const m = new RegExp(re.source, re.flags.replace('g', '')).exec(text);
      if (m) { out.push({ f, at: m.index, end: m.index + m[0].length, label: m[0].trim(), strength, tag: tag === undefined ? null : tag }); break; }
    }
  }
  // overlapping labels: keep the longer one (e.g. "HDL Cholesterol" is HDL, not total cholesterol)
  out.sort((a, b) => a.at - b.at || (b.end - b.at) - (a.end - a.at));
  const keep = [];
  for (const m of out) if (!keep.some((k) => m.at < k.end && k.at < m.end)) keep.push(m);
  return keep.sort((a, b) => a.at - b.at);
}

function extract(pages) {
  const items = [];
  for (const pg of pages || []) {
    const lines = (pg.lines && pg.lines.length ? pg.lines : String(pg.text || '').split('\n').map((t) => ({ text: t, conf: pg.source === 'text' ? 100 : 0 })));
    let section = null;
    lines.forEach((ln, i) => {
      const text = String(ln.text || '').replace(/[–—]/g, '-').replace(/ /g, ' ');
      if (!text.trim()) return;
      if (SECTION.test(text) && PANELS.test(text) && !/\d/.test(text)) { section = text.trim(); return; }
      const labels = labelMatches(text);
      labels.forEach((lm, j) => {
        const end = j + 1 < labels.length ? labels[j + 1].at : text.length;
        const seg = text.slice(lm.end, end);
        const base = { field: lm.f.field, kind: lm.f.kind, name: lm.f.name, label: lm.label, page: pg.page, line: i + 1, section, source: pg.source || null, rawLine: text.trim().replace(/\s+/g, ' ').slice(0, 200), reasons: [] };
        const labelConf = wordsConf(Object.assign({}, ln, { text }), lm.at, lm.end) / 100;
        if (lm.f.special === 'bp') {
          const m = /(\d{2,3})\s*\/\s*(\d{2,3})\s*(mm\s*hg)?/i.exec(seg);
          if (!m) return;
          const at = lm.end + m.index;
          const vConf = wordsConf(Object.assign({}, ln, { text }), at, at + m[0].length) / 100;
          const sys = Number(m[1]), dia = Number(m[2]);
          const it = { ...base, systolic: sys, diastolic: dia, value: sys, rawValue: m[1] + '/' + m[2], rawUnit: m[3] || null, unit: 'mmHg', conversion: null, refRange: null };
          it.confidence = round2(Math.min(1, vConf) * Math.min(1, labelConf) * lm.strength * (m[3] ? 1 : 0.97));
          items.push(it);
          return;
        }
        const m = NUMBER.exec(seg);
        if (!m) return;
        const rest = seg.slice(m.index + m[0].length);
        // a reference range ("40 - 60") right where the result should be: no result on this line
        if (/^\s*-\s*\d/.test(rest)) return;
        const at = lm.end + m.index + (m[1] ? m[1].length : 0);
        const vConf = wordsConf(Object.assign({}, ln, { text }), at, at + m[2].length) / 100;
        const raw = m[2].replace(',', '.');
        let value = Number(raw);
        // the unit is the text right after the number
        const tail = rest.replace(/^\s*(?:\(?[hl]\)?(?=\s|$)|high\b|low\b|\*)?\s*/i, '');
        let unit = null, conversion = null, unitConf = 1;
        for (const u of lm.f.units || []) {
          const um = u.re.exec(tail.trim());
          if (um) {
            unit = um[0].trim();
            const uat = text.indexOf(unit, at + m[2].length);
            unitConf = uat >= 0 ? wordsConf(Object.assign({}, ln, { text }), uat, uat + unit.length) / 100 : 1;
            if (u.f === null) { conversion = 'none'; break; } // no fixed factor: kept as written, sent to review
            if (u.factor !== 1 || u.note) conversion = u.note;
            value = u.f(value);
            break;
          }
        }
        const refM = /(\d+(?:\.\d+)?)\s*-\s*(\d+(?:\.\d+)?)/.exec(rest);
        const it = { ...base, rawValue: (m[1] || '').replace(/\s/g, '') + raw, value: Number.isFinite(value) ? round4(value) : null, rawUnit: unit, unit: conversion === 'none' ? unit : lm.f.native, conversion, qualifier: m[1] ? m[1].trim() : null, refRange: refM ? refM[0] : (/[<>]\s*\d+(?:\.\d+)?/.exec(rest) || [null])[0] };
        if (lm.f.context) it.context = lm.tag;
        if (lm.f.field === 'crp' && lm.tag === 'plain') it.plainCrp = true;
        const unitScore = unit ? (unitConf >= 0.5 ? 1 : 0.85) : lm.f.unitOptional ? 0.97 : 0.6;
        it.confidence = round2(Math.min(1, vConf) * Math.min(1, labelConf) * lm.strength * unitScore);
        it.unitMissing = !unit && !lm.f.unitOptional;
        items.push(it);
      });
    });
  }
  return items;
}
const round2 = (v) => Math.round(v * 100) / 100;
const round4 = (v) => Math.round(v * 10000) / 10000;

// ---------------------------------------------------------------- checks: accept, or review (with reasons)
function validate(items, dates) {
  const byField = {};
  for (const it of items) { it._k = it.field + (it.context ? ':' + it.context : ''); (byField[it._k] = byField[it._k] || []).push(it); }
  for (const it of items) it.notes = it.notes || [];
  for (const it of items) {
    const f = BY_FIELD[it.field], r = it.reasons;
    if (it.field === 'bp') {
      const [ls, hs] = vitals.LIMITS.systolic, [ld, hd] = vitals.LIMITS.diastolic;
      if (it.systolic < ls || it.systolic > hs || it.diastolic < ld || it.diastolic > hd) r.push(`Outside the possible range for blood pressure (${ls}–${hs} / ${ld}–${hd})`);
      if (it.systolic <= it.diastolic) r.push('The first number should be higher than the second');
    } else {
      if (it.value == null) r.push('The value could not be read as a number');
      else if (f.limits && it.conversion !== 'none' && (it.value < f.limits[0] || it.value > f.limits[1])) r.push(`Outside the possible range for ${f.name} (${f.limits[0]}–${f.limits[1]} ${f.native})`);
      if (f.integer && it.value != null && !Number.isInteger(it.value)) r.push('Expected a whole number');
      if (it.qualifier) r.push(`Reported as "${it.qualifier} ${it.rawValue.replace(/^[<>≤≥=]+/, '')}", not an exact value`);
      if (it.unitMissing) r.push('No unit shown next to the value');
      if (it.conversion === 'none') r.push(`Unit ${it.rawUnit} has no fixed conversion to ${f.native}`);
      if (it.plainCrp) r.push('Reported as CRP, not stated as high-sensitivity CRP (the risk rules use hs-CRP)');
      if (f.context && !it.context) { it.context = 'random'; it.notes.push('Timing not stated in the document (fasting / after a meal), so it is stored as random'); }
    }
    const same = byField[it._k];
    if (same.length > 1 && new Set(same.map((x) => x.field === 'bp' ? x.rawValue : x.value)).size > 1) r.push('The document shows different values for this test');
    if (it.confidence < AUTO_ACCEPT) r.push(`Reading confidence too low to trust the number (${Math.round(it.confidence * 100)}%)`);
    else if (it.confidence < NOTE_BELOW) it.notes.push(`Stored with a lower reading confidence (${Math.round(it.confidence * 100)}%)`);
    if (dates.note) it.notes.push(dates.note);
    if (!dates.measured) r.push(dates.reason || 'The test date is not known');
    it.measuredDate = dates.measured;
    it.status = r.length ? 'needs_review' : 'accepted';
  }
  // the same value written twice in one document is one measurement
  const seen = new Set();
  return items.filter((it) => { const k = [it.field, it.context || '', it.field === 'bp' ? it.rawValue : it.value, it.unit].join('|'); if (seen.has(k)) return false; seen.add(k); return true; });
}

module.exports = { FIELDS, BY_FIELD, AUTO_ACCEPT, NOTE_BELOW, classify, findDates, extract, validate };
