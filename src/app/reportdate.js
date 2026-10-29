// Finds the date of a medical report in its text (from the PDF text layer or OCR).
//
// Every date in the text is found (DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, DD-MMM-YYYY, 12 Mar 2026,
// Mar 12, 2026, 2026-03-12 and two-digit years), then scored by the words just before it:
//   report date / reported on            strongest
//   collection, sample, test, scan date  strong
//   registration, received               medium
//   a plain "Date:"                       weak
//   date of birth, follow-up, next visit, bill, invoice, expiry, appointment   rejected
// Numbers after ID, UHID, MRN, Lab No, phone, etc. are never dates. Days that cannot exist,
// years before 1990 and future dates are ignored. Indian order (day first) is used when both
// readings are possible.
// The date is always chosen automatically (see the rules below); when the report has no usable date
// at all the result is "notfound": nothing is invented and the upload date is never used.

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };
const MON = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sept?(?:ember)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';
const SEP = '[\\/\\-.]';

// [pattern, weight, kind] - checked against the words just before a date (and the line above
// when a date stands alone under its label)
const LABELS = [
  [/(report(?:ed|ing)?\s*(?:date|dt|on|time)|date\s*of\s*report|rep(?:ort)?\.?\s*dt|reported)\b/, 10, 'Report date'],
  [/(collect(?:ed|ion)\s*(?:date|dt|on|at|time)?|sample\s*(?:date|dt|collected|drawn|received|collection)?|specimen\s*(?:date|collected)?|drawn\s*on)/, 8, 'Collection date'],
  [/((?:test|investigation|exam(?:ination)?|study|scan|procedure|imaging|echo|ecg|x-?ray|ultrasound)\s*(?:date|dt|on)|date\s*of\s*(?:test|investigation|exam(?:ination)?|study|scan|procedure|service))/, 8, 'Test date'],
  [/((?:consultation|visit|opd)\s*(?:date|dt|on)|date\s*of\s*(?:consultation|visit))/, 7, 'Visit date'],
  [/(discharge\s*(?:date|dt|on)|date\s*of\s*discharge)/, 6, 'Discharge date'],
  [/(regist(?:ered|ration)\s*(?:date|dt|on)?|reg\.?\s*(?:date|dt)|received\s*(?:on|date)|accession\s*date)/, 5, 'Registration date'],
  [/(printed\s*on|print\s*date|generated\s*on)/, 2, 'Printed date']
];
const PRESCRIPTION = [/(prescri(?:bed|ption)\s*(?:date|dt|on)|rx\s*date)/, 'Prescription date'];
const NEGATIVE = [
  /(d\.?\s*o\.?\s*b|date\s*of\s*birth|birth\s*date|born|\bage\b|\byrs?\b)/,
  /(follow[\s-]*up|next\s*(?:visit|review|appointment|due|date)|review\s*(?:on|after|date)|revisit|recall|appointment|come\s*back|repeat\s*(?:on|after))/,
  /(bill(?:ing)?\s*(?:date|dt|no)?|invoice|receipt|payment|paid|due\s*date|amount)/,
  /(expir|exp\.?\s*date|valid\s*(?:till|upto|up\s*to|until)|mfg|manufactur|batch|best\s*before)/,
  /(admi(?:ssion|tted)\s*(?:date|on)?|date\s*of\s*admission|doa\b)/,
  /(lmp|last\s*menstrual|edd|expected\s*date)/
];
const ID_LABEL = /(\bid\b|uhid|mrn|\bmr\s*no|ip\s*no|op\s*no|lab\s*no|ref(?:erence)?\s*no|reg(?:istration)?\s*no|sample\s*no|barcode|phone|mob(?:ile)?|tel|ph\b|pin\s*code|aadhaar|bill\s*no|invoice\s*no|\bno\.?\s*[:#]?\s*$)/;

function pad(n) { return String(n).padStart(2, '0'); }
function realDate(y, m, d) {
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31)) return null;
  const t = new Date(Date.UTC(y, m - 1, d));
  if (t.getUTCFullYear() !== y || t.getUTCMonth() !== m - 1 || t.getUTCDate() !== d) return null;
  return `${y}-${pad(m)}-${pad(d)}`;
}
function year(s, todayY) {
  let y = Number(s);
  if (s.length === 2) y = y + 2000 > todayY ? 1900 + y : 2000 + y;
  return y;
}

// every date in one line: { iso, at, end, twoDigitYear }
function datesIn(line, todayY) {
  const out = [];
  const add = (iso, m, two) => { if (iso) out.push({ iso, at: m.index, end: m.index + m[0].length, raw: m[0], twoDigitYear: two }); };
  const notPart = '(?<![\\d\\/\\-.])';
  const notMore = '(?![\\d]|[\\/\\-.]\\d)';
  let m;
  const ymd = new RegExp(notPart + '(\\d{4})' + SEP + '(\\d{1,2})' + SEP + '(\\d{1,2})' + notMore, 'g');
  while ((m = ymd.exec(line))) add(realDate(Number(m[1]), Number(m[2]), Number(m[3])), m, false);
  const dmy = new RegExp(notPart + '(\\d{1,2})\\s?' + SEP + '\\s?(\\d{1,2})\\s?' + SEP + '\\s?(\\d{4}|\\d{2})' + notMore, 'g');
  while ((m = dmy.exec(line))) {
    if (out.some((x) => m.index >= x.at && m.index < x.end)) continue;
    const a = Number(m[1]), b = Number(m[2]), y = year(m[3], todayY);
    // day first (India); month first only when the first number cannot be a month day pair otherwise
    const iso = a > 12 || b <= 12 ? realDate(y, b, a) : realDate(y, a, b);
    add(iso, m, m[3].length === 2);
  }
  const dmonY = new RegExp(notPart + '(\\d{1,2})(?:st|nd|rd|th)?[\\s\\-\\/.,]*' + MON + '[a-z]*\\.?[\\s\\-\\/.,]*(\\d{4}|\\d{2})' + notMore, 'gi');
  while ((m = dmonY.exec(line))) add(realDate(year(m[3], todayY), MONTHS[m[2].toLowerCase().slice(0, 3)] || MONTHS[m[2].toLowerCase().slice(0, 4)], Number(m[1])), m, m[3].length === 2);
  const monDY = new RegExp('\\b' + MON + '[a-z]*\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{4})' + notMore, 'gi');
  while ((m = monDY.exec(line))) add(realDate(Number(m[3]), MONTHS[m[1].toLowerCase().slice(0, 3)], Number(m[2])), m, false);
  return out.sort((x, y) => x.at - y.at);
}

function scoreLabel(ctx, category) {
  const c = ctx.toLowerCase();
  for (const re of NEGATIVE) if (re.test(c)) return { score: -20, label: 'Not the report date' };
  if (PRESCRIPTION[0].test(c)) return category === 'prescriptions' ? { score: 9, label: PRESCRIPTION[1] } : { score: -8, label: PRESCRIPTION[1] };
  for (const [re, w, name] of LABELS) if (re.test(c)) return { score: w, label: name };
  if (/\b(date|dt|dated|on)\s*[:.\-]?\s*$/.test(c) || /\bdate\b/.test(c)) return { score: 4, label: 'Date' };
  return { score: 0, label: '' };
}

// pages: [{ page, text }]; returns { status, date, label, page, confidence, candidates, reason }
function findReportDate(pages, opts) {
  const o = opts || {};
  const today = o.today || new Date(Date.now() + 5.5 * 3600e3).toISOString().slice(0, 10);
  const todayY = Number(today.slice(0, 4));
  const cands = [];
  for (const pg of pages || []) {
    const lines = String(pg.text || '').replace(/\r/g, '').split('\n');
    lines.forEach((line, i) => {
      for (const d of datesIn(line, todayY)) {
        if (d.iso < '1990-01-01' || d.iso > today) continue;
        const before = line.slice(Math.max(0, d.at - 48), d.at);
        // the nearest label: after the previous date on the same line, if any
        const prevDate = datesIn(before, todayY).pop();
        const near = prevDate ? before.slice(prevDate.end) : before;
        if (ID_LABEL.test(near.toLowerCase().slice(-18))) continue; // an identifier or phone number, not a date
        let ctx = near;
        // a date alone on its line: its label is usually on the line above (table layouts)
        if (!near.trim() && i > 0) ctx = lines[i - 1].slice(-60);
        let s = scoreLabel(ctx, o.category);
        // "Date: 12/03/2026" style labels a little further back on the same line
        if (s.score === 0 && !prevDate) s = scoreLabel(before, o.category);
        cands.push({ date: d.iso, score: s.score - (d.twoDigitYear ? 1 : 0), label: s.label, page: pg.page, context: (ctx.trim() + ' ' + d.raw).replace(/\s+/g, ' ').trim().slice(-70) });
      }
    });
  }
  const shown = cands.filter((c) => c.score > -20).sort((a, b) => b.score - a.score || a.page - b.page).slice(0, 6).map(({ date, label, page, context, score }) => ({ date, label, page, context, score }));
  if (!cands.length) return { status: 'notfound', date: null, candidates: [], reason: 'No date could be read in the report.' };
  const usable = cands.filter((c) => c.score > -20);
  if (!usable.length) return { status: 'notfound', date: null, candidates: [], reason: 'The only dates in the report are a birth date, follow-up, bill or similar.' };
  // The date is always decided automatically, with fixed rules (nobody types it in):
  //  1. the highest label wins (report > collection/test > visit > discharge > registration > "Date")
  //  2. several dates with that same label: the one written most often, then the latest (amended reports)
  //  3. no labelled date: the plain date written most often, then the latest
  const top = Math.max(...usable.map((c) => c.score));
  const pool = usable.filter((c) => c.score === top);
  const count = {};
  pool.forEach((c) => { count[c.date] = (count[c.date] || 0) + 1; });
  const pick = Object.keys(count).sort((x, y) => count[y] - count[x] || (y > x ? 1 : -1))[0];
  const best = pool.find((c) => c.date === pick);
  const others = new Set(usable.filter((c) => c.score >= Math.max(top, 4) && c.date !== pick).map((c) => c.date));
  const confidence = top >= 8 && !others.size ? 'high' : top >= 4 ? 'medium' : 'low';
  const how = top >= 4 ? best.label : 'Date found in the report';
  const rule = others.size ? (count[pick] > 1 ? 'written most often' : 'the latest') : '';
  return { status: 'detected', date: pick, label: how, page: best.page, confidence, rule, candidates: shown };
}

module.exports = { findReportDate, datesIn };
