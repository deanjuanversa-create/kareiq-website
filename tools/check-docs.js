// node tools/check-docs.js [http://localhost:3000]
// Medical document intelligence: real documents (tools/fixtures/make_docs.py: PDFs with a text
// layer, scanned images read by OpenCV + Tesseract LSTM OCR, a poor photo, a broken PDF) go through
// the real pipeline. Nothing about the extraction is mocked.
//   Part 1 (no server): failures and retries, with a reader that fails on purpose before handing over
//           to the real reader; integrity check.
//   Part 2 (a fresh demo server, APP_DEMO=true, empty data folder): nurse and customer uploads, values
//           and actual test dates, Vitals and Risk Trends updates, duplicates, missing and ambiguous
//           dates, invalid and low-confidence values, review, history, and what nurses can see.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const istDay = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
const daysAgo = (n) => istDay(new Date(Date.now() - n * 86400000));
const D = { d9: '2019-03-15', d1: daysAgo(7), d1r: daysAgo(6), d2: daysAgo(5), d3: daysAgo(9), d4: daysAgo(11), d5: daysAgo(10), d6: daysAgo(8), d7: daysAgo(4), d8: daysAgo(3) };

const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'kq-docs-'));
execFileSync('python3', [path.join(__dirname, 'fixtures', 'make_docs.py'), DIR, JSON.stringify(D)]);
const file = (n) => fs.readFileSync(path.join(DIR, n));

// ---------------------------------------------------------------- part 1: retries and failures
async function partOne() {
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'kq-docs-data-'));
  process.env.DATA_DIR = data;
  process.env.DOC_RETRY_MS = '300';
  const docs = require('../src/docs');
  const crypto = require('crypto');
  const uid = () => crypto.randomUUID();
  const now = () => new Date().toISOString();
  const risk = require('../src/app/riskengine').create({ docs, uid, now });
  const real = require('../src/app/reportreader');
  const docintel = require('../src/app/docintel');
  await docs.insert('app_people', { id: 'P-T1', name: 'Retry Test', sex: 'female', birthYear: 1950, createdAt: '2026-01-01T00:00:00Z' });
  const add = async (id, buf, mime) => {
    await docs.insert('app_files', { id: 'f-' + id, personId: 'P-T1', mime, data: buf.toString('base64'), createdAt: now() });
    await docs.insert('app_records', { id, personId: 'P-T1', name: id, category: 'general', mime, size: buf.length, sha256: docintel.sha256(buf), fileId: 'f-' + id, uploadedBy: 'u-test', uploadedAt: now(), processing: { status: 'uploaded', attempts: 0 } });
  };
  const proc = async (id) => (await docs.findOne('app_records', { id })).processing;
  const waitFor = async (id, test, ms) => { const t0 = Date.now(); for (;;) { const p = await proc(id); if (test(p)) return p; if (Date.now() - t0 > ms) return p; await sleep(250); } };

  // a transient failure first, then the real reader: retried automatically and finished
  let calls = 0;
  const flaky = { readPages: (buf, mime, o) => (++calls === 1 ? Promise.resolve({ ok: false, error: 'The document reader is busy.', retryable: true }) : real.readPages(buf, mime, o)) };
  const A = docintel.create({ docs, uid, now, audit: async () => {}, risk, reader: flaky });
  await add('rec-flaky', file('lab_text.pdf'), 'application/pdf');
  await A.enqueue('rec-flaky');
  let p = await proc('rec-flaky');
  ok(p.status === 'failed' && p.retryable && p.nextRetryAt && p.attempts === 1, 'transient failure: Failed, retry scheduled (' + p.status + ', attempt ' + p.attempts + ')');
  p = await waitFor('rec-flaky', (x) => x.status === 'completed' || x.status === 'needs_review', 60000);
  ok(p.status === 'completed' && p.attempts === 2 && p.stored === 11, 'retried automatically and completed on attempt 2, 11 values stored (' + p.status + ', ' + p.stored + ')');
  const rr = await docs.find('app_readings', { personId: 'P-T1', recordId: 'rec-flaky' });
  ok(rr.length >= 11 && rr.every((r) => r.source === 'document' && istDay(new Date(r.measuredAt)) === D.d1 && r.extractionId), 'readings carry the document, the extraction and the collection date ' + D.d1);
  const snaps = await docs.find('app_risk_status', { personId: 'P-T1' });
  ok(snaps.some((s) => s.trigger === 'document'), 'the risk engine recalculated after the values were stored');

  // a failure that keeps happening: three attempts, then it stops (never Completed)
  const down = { readPages: () => Promise.resolve({ ok: false, error: 'Reading the document took too long.', retryable: true }) };
  const B = docintel.create({ docs, uid, now, audit: async () => {}, risk, reader: down });
  await add('rec-down', file('lab_text.pdf'), 'application/pdf');
  await B.enqueue('rec-down');
  p = await waitFor('rec-down', (x) => x.attempts >= 3 && x.status === 'failed' && !x.nextRetryAt, 20000);
  ok(p.status === 'failed' && p.attempts === 3 && !p.nextRetryAt, 'persistent failure: 3 attempts, then left Failed for the office (attempts ' + p.attempts + ')');

  // documents left waiting under the older, stricter rules are read again after a restart
  const E = docintel.create({ docs, uid, now, audit: async () => {}, risk });
  await add('rec-old-rules', file('vitals_scan.png'), 'image/png');
  await docs.update('app_records', 'rec-old-rules', { processing: { status: 'needs_review', attempts: 1, pending: 1 } });
  await docs.insert('app_extractions', { id: 'ex-rec-old-rules-1', recordId: 'rec-old-rules', personId: 'P-T1', field: 'spo2', status: 'needs_review', reasons: ['Low reading confidence (76%)'], createdAt: now() });
  const n = await E.resume();
  p = await waitFor('rec-old-rules', (x) => x.rules === E.RULES, 120000);
  const exs = await docs.find('app_extractions', { recordId: 'rec-old-rules' });
  ok(n >= 1 && p.rules === E.RULES && exs.find((x) => x.id === 'ex-rec-old-rules-1').status === 'superseded' && exs.some((x) => x.status === 'accepted'), 'after a restart, a document waiting under the old rules is read again (' + p.status + ', ' + exs.filter((x) => x.status === 'accepted').length + ' stored)');

  // the stored file changed after upload: integrity check, not retried
  const C = docintel.create({ docs, uid, now, audit: async () => {}, risk });
  await add('rec-tamper', file('lab_text.pdf'), 'application/pdf');
  const f = await docs.findOne('app_files', { id: 'f-rec-tamper' });
  const bad = Buffer.from(f.data, 'base64'); bad[bad.length - 5] ^= 0xff;
  await docs.update('app_files', 'f-rec-tamper', { data: bad.toString('base64') });
  await C.enqueue('rec-tamper');
  p = await proc('rec-tamper');
  ok(p.status === 'failed' && /integrity/.test(p.lastError) && !p.retryable, 'a changed file fails the integrity check and is not retried');
  ok(!(await docs.find('app_readings', { recordId: 'rec-tamper' })).length, 'nothing stored from a failed document');
}

// ---------------------------------------------------------------- part 2: the server
async function partTwo(URL0) {
  const BASE = URL0.replace(/\/$/, '') + '/api/app/';
  async function login(id) {
    let cookie = '', csrf = '';
    const call = async (method, p, body, raw) => {
      const h = { 'X-Requested-With': 'kareiq', cookie };
      if (csrf) h['X-CSRF'] = csrf;
      if (body) h['Content-Type'] = 'application/json';
      if (raw) Object.assign(h, raw.headers);
      const r = await fetch(BASE + p, { method, headers: h, body: raw ? raw.body : body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; }
      return { status: r.status, body: j, text: t };
    };
    await call('POST', 'login', { id, password: 'demo-pass-123' });
    csrf = (await call('GET', 'session')).body.csrf;
    return call;
  }
  const nurse = await login('nurse@demo.kareiq'), nest = await login('nest@demo.kareiq'), office = await login('admin@demo.kareiq'), fam = await login('family@demo.kareiq');
  const NP = 'P-DEMO04';
  const FP = (await fam('GET', 'people')).body.people.map((x) => x.id).find((x) => x === 'P-DEMO01') || (await fam('GET', 'people')).body.people[0].id;
  const upload = (who, pid, name, mime) => who('POST', 'people/' + pid + '/records', null, { headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(name), 'X-Category': 'general' }, body: file(name) });
  const base = (n) => n.replace(/\.[^.]+$/, ''); // the record keeps the name without the extension
  const findDoc = async (pid, name) => (await office('GET', 'admin/documents?status=all')).body.rows.filter((r) => r.personId === pid && r.name === base(name));
  const settled = async (pid, name, ms) => {
    const t0 = Date.now();
    for (;;) {
      const row = (await findDoc(pid, name))[0];
      if (row && !['uploaded', 'processing', 'extracted'].includes(row.processing.status)) return (await office('GET', 'admin/documents/' + row.id)).body;
      if (Date.now() - t0 > (ms || 240000)) return row ? (await office('GET', 'admin/documents/' + row.id)).body : null;
      await sleep(1000);
    }
  };
  const readingsOf = async (pid) => {
    // every reading the office can see for the person over a year (Vitals series) and the risk inputs
    const d = (await office('GET', 'people/' + pid + '/dashboard?period=1y')).body;
    return d;
  };
  const before = await readingsOf(NP);
  const beforeRows = before.series.flatMap((m) => m.rows.map((r) => m.metric + ':' + r.id));

  // ---- nurse upload: a laboratory report with a text layer
  let r = await upload(nurse, NP, 'lab_text.pdf');
  ok(r.status === 201 && r.body.receipt && !r.body.id && !('processing' in r.body) && !/"value"|"values"/.test(r.text), 'nurse upload: a receipt with the processing status, no values (' + r.status + ')');
  let doc = await settled(NP, 'lab_text.pdf');
  const ex = doc.extractions;
  ok(doc.record.status.status === 'completed', 'lab report Completed (' + doc.record.status.status + ')');
  ok(doc.record.docType === 'Laboratory report' && doc.record.dates.measured === D.d1 && doc.record.dates.report.date === D.d1r, 'type, collection date ' + D.d1 + ' and report date ' + D.d1r + ' kept apart');
  const want = { hdl: 48, chol: 190, ast: 32, alt: 28, alb: 4.2, plt: 250, hba1c: 6.1, glucose: 104, crp: 1.8, egfr: 72, acr: 25 };
  ok(Object.entries(want).every(([k, v]) => ex.some((x) => x.field === k && x.value === v && x.status === 'accepted')), 'all 11 values extracted and stored, with units converted (2.5 lakhs/cumm platelets = 250 x10^9/L)');
  ok(ex.every((x) => x.page === 1 && x.line > 0 && x.rawLine && x.confidence >= 0.85 && x.measuredDate === D.d1), 'each value traceable to page and line, with its confidence and test date');
  ok(ex.find((x) => x.field === 'glucose').context === 'fasting' && ex.find((x) => x.field === 'hdl').section === 'LIPID PROFILE', 'fasting sugar recognised; section recorded');
  const after1 = await readingsOf(NP);
  const chol = after1.series.find((m) => m.metric === 'chol'), glu = after1.series.find((m) => m.metric === 'glucose');
  ok(chol && chol.rows.some((x) => x.value === 190 && istDay(new Date(x.at)) === D.d1) && glu.rows.some((x) => x.value === 104 && x.context === 'fasting'), 'Vitals: cholesterol and fasting sugar appear on ' + D.d1 + ' (the collection date, not the upload date)');
  let rk = (await office('GET', 'people/' + NP + '/risk')).body.status;
  const kid = rk.indicators.find((i) => i.id === 'kidney');
  ok(kid && kid.status === 'calculated' && kid.inputs.some((x) => x.k === 'egfr' && x.value === 72) && kid.inputs.some((x) => x.k === 'acr' && x.value === 25), 'Risk Trends: the kidney indicator calculated by the engine from the extracted eGFR and ACR');
  ok((await office('GET', 'people/' + NP + '/risk/history')).body.rows.some((s) => s.trigger === 'document'), 'a risk snapshot recorded with the document as trigger');

  // ---- what the nurse can and cannot see
  ok((await nurse('GET', 'people/' + NP + '/risk')).status === 403, 'nurse API: no risk result (403)');
  ok((await nurse('GET', 'people/' + NP + '/records/' + doc.record.id + '/extraction')).status === 403, 'nurse API: no extracted values (403)');
  ok((await nurse('GET', 'people/' + NP + '/dashboard')).status === 403 && (await nurse('GET', 'people/' + NP + '/records')).status === 403, 'nurse API: no health history and no records list');
  r = await nurse('GET', 'people/' + NP + '/recent');
  ok(r.status === 200 && r.body.rows.every((x) => !['hdl', 'crp', 'hba1c', 'egfr', 'acr', 'ast', 'alt', 'plt', 'alb'].includes(x.metric)) && !r.body.rows.some((x) => (x.metric === 'chol' && x.value === 190) || (x.metric === 'glucose' && x.value === 104)),
    'nurse "readings today" shows only the visit readings the nurse typed: no lab result and no value read from the document');
  r = await nurse('GET', 'nurse/submissions');
  const sub = r.body.rows.find((x) => x.documentName === 'lab_text');
  ok(sub && sub.status === 'Completed' && Object.keys(sub).sort().join() === 'category,customerId,documentName,processing,status,submittedAt', 'nurse submissions: processing status only (' + (sub && sub.status) + ')');
  ok(!/"value"|"display"|"band"|"category":"(red|amber|green)"/.test(r.text), 'nurse submissions carry no values or risk categories');
  r = await nurse('POST', 'people/' + NP + '/assessments', { date: D.d7, values: { phq9: 5 } });
  ok(r.status === 201 && !('risk' in r.body), 'nurse assessment response carries no risk result');
  ok([403, 404].includes((await upload(nest, NP, 'no_date.pdf')).status), 'a nurse not assigned to the customer cannot upload');

  // ---- nurse upload: a scanned image (OCR)
  r = await upload(nurse, NP, 'vitals_scan.png');
  doc = await settled(NP, 'vitals_scan.png');
  const ocr = doc.extractions;
  ok(doc.record.processing.engine && doc.record.processing.engine.sources.includes('ocr') && /tesseract/i.test(doc.record.processing.engine.tesseract || ''), 'scan read by OCR (' + (doc.record.processing.engine && doc.record.processing.engine.tesseract) + ')');
  ok(doc.record.dates.measured === D.d2, 'visit date read from the scan: ' + doc.record.dates.measured);
  const bp = ocr.find((x) => x.field === 'bp');
  ok(bp && bp.systolic === 134 && bp.diastolic === 86 && ocr.some((x) => x.field === 'hr' && x.value === 78), 'blood pressure 134/86 and pulse 78 read from the image');
  ok(ocr.every((x) => x.confidence < 0.6 ? x.status === 'needs_review' : x.status !== 'needs_review' || x.reasons.length), 'OCR values: below 60% confidence never stored; above it stored automatically');
  ok(ocr.filter((x) => x.confidence >= 0.6 && x.confidence < 0.85 && x.status === 'accepted').every((x) => x.notes.some((n) => /lower reading confidence/.test(n))), 'values stored with 60–85% confidence carry a note');
  ok(['completed', 'needs_review'].includes(doc.record.status.status) && (doc.record.status.status === 'completed') === !ocr.some((x) => x.status === 'needs_review'), 'scan status follows its values (' + doc.record.status.status + ')');
  const after2 = await readingsOf(NP);
  if (bp.status === 'accepted') ok(after2.series.find((m) => m.metric === 'bp').rows.some((x) => x.systolic === 134 && istDay(new Date(x.at)) === D.d2), 'Vitals: blood pressure from the scan on ' + D.d2);
  const tempx = ocr.find((x) => x.field === 'temp');
  ok(!tempx || (tempx.value === 37 && /°F converted/.test(tempx.conversion || '')), '98.6 °F stored as 37 °C, with the conversion recorded');

  // ---- duplicates
  const recsBefore = (await findDoc(NP, 'lab_text.pdf')).length;
  r = await upload(nurse, NP, 'lab_text.pdf');
  ok(r.status === 200 && r.body.duplicate && (await findDoc(NP, 'lab_text.pdf')).length === recsBefore, 'the same file again: recognised, not added twice');
  const many = await Promise.all([1, 2, 3].map(() => upload(nurse, NP, 'repeat_value.pdf')));
  ok((await findDoc(NP, 'repeat_value.pdf')).length === 1 && many.filter((x) => x.status === 201).length === 1, 'three simultaneous uploads of one file: one document (' + many.map((x) => x.status).join(',') + ')');
  doc = await settled(NP, 'repeat_value.pdf');
  const rep = doc.extractions.find((x) => x.field === 'hdl');
  ok(rep && rep.status === 'duplicate' && rep.readingId, 'the same measurement in another document is linked, not stored twice');
  ok(doc.record.status.status === 'completed', 'a document whose values are all already stored is Completed');

  // ---- dates: missing, report date only, two collection dates
  await upload(nurse, NP, 'no_date.pdf');
  doc = await settled(NP, 'no_date.pdf');
  ok(doc.record.status.status === 'needs_review' && doc.record.dates.measured === null && doc.record.dates.measuredStatus === 'unknown', 'no date in the document: test date unknown, Needs Review');
  ok(doc.extractions.every((x) => x.status === 'needs_review' && !x.readingId && x.reasons.some((y) => /date/i.test(y))), 'nothing stored without a test date; the reason is given');
  await upload(nurse, NP, 'report_only.pdf');
  doc = await settled(NP, 'report_only.pdf');
  ok(doc.record.dates.measured === null && doc.record.dates.report.date === D.d3 && /report date/i.test(doc.record.dates.measuredNote), 'only a report date: it is kept as the report date and not used as the test date');
  ok(doc.extractions.every((x) => !x.readingId), 'nothing stored from it');
  await upload(nurse, NP, 'two_dates.pdf');
  doc = await settled(NP, 'two_dates.pdf');
  ok(doc.record.dates.measuredStatus === 'ambiguous' && doc.record.dates.test.values.length === 2 && doc.extractions.every((x) => x.status === 'needs_review'), 'two different collection dates: ambiguous, flagged for review');

  // ---- invalid values
  await upload(nurse, NP, 'invalid.pdf');
  doc = await settled(NP, 'invalid.pdf');
  const inv = Object.fromEntries(doc.extractions.map((x) => [x.field, x]));
  ok(inv.hdl && /possible range/.test(inv.hdl.reasons.join()) && inv.plt && /No unit/.test(inv.plt.reasons.join()) && inv.crp && /high-sensitivity/.test(inv.crp.reasons.join())
    && inv.hba1c && /no fixed conversion/.test(inv.hba1c.reasons.join()) && inv.egfr && /not an exact value/.test(inv.egfr.reasons.join()), 'out of range, missing unit, plain CRP, unknown unit and "<" values flagged');
  ok(doc.extractions.filter((x) => x.field !== 'glucose').every((x) => x.status === 'needs_review' && !x.readingId), 'none of those stored');
  ok(inv.glucose && inv.glucose.status === 'accepted' && inv.glucose.context === 'random' && inv.glucose.notes.some((n) => /Timing not stated/.test(n)), 'sugar without timing stored automatically as random, with a note');

  // ---- review by the office
  r = await office('POST', 'admin/extractions/' + inv.crp.id, { action: 'reject' });
  ok(r.status === 400, 'rejecting needs a reason');
  r = await office('POST', 'admin/extractions/' + inv.hdl.id, { action: 'accept', value: 60, date: D.d6, note: 'Typo in report: 60 confirmed with the lab' });
  ok(r.status === 200, 'office accepts a value with a correction');
  const hdlAcc = (await office('GET', 'admin/documents/' + doc.record.id)).body.extractions.find((x) => x.id === inv.hdl.id);
  ok(hdlAcc.status === 'accepted' && hdlAcc.corrected && hdlAcc.corrected.value.from === 900 && hdlAcc.corrected.value.to === 60 && hdlAcc.reviewedBy, 'the correction is recorded (900 → 60) with the reviewer');
  ok((await nurse('POST', 'admin/extractions/' + inv.plt.id, { action: 'accept', value: 210 })).status === 403 && (await fam('POST', 'admin/extractions/' + inv.plt.id, { action: 'accept', value: 210 })).status === 403, 'only the office reviews values');
  for (const x of doc.extractions.filter((y) => y.id !== inv.hdl.id && y.status === 'needs_review')) await office('POST', 'admin/extractions/' + x.id, { action: 'reject', note: 'Not usable as written' });
  doc = (await office('GET', 'admin/documents/' + doc.record.id)).body;
  ok(doc.record.status.status === 'completed', 'Completed once every value is accepted or rejected');

  // ---- read again: a document waiting for review can be read again by the office (still no date: still waiting)
  const nd = (await findDoc(NP, 'no_date.pdf'))[0];
  r = await office('POST', 'admin/documents/' + nd.id + '/retry', {});
  ok(r.status === 202, 'the office can read a waiting document again');
  await sleep(2500);
  doc = await settled(NP, 'no_date.pdf');
  const live = doc.extractions;
  ok(doc.record.status.status === 'needs_review' && live.length === 1 && live[0].status === 'needs_review', 'read again: one current value, still waiting (earlier values kept, marked superseded)');

  // ---- a document that cannot be read
  await upload(nurse, NP, 'broken.pdf');
  doc = await settled(NP, 'broken.pdf');
  ok(doc.record.status.status === 'failed' && doc.record.processing.lastError, 'an unreadable PDF is Failed, never Completed (' + doc.record.processing.lastError + ')');
  r = await office('POST', 'admin/documents/' + doc.record.id + '/retry', {});
  ok(r.status === 202, 'the office can process it again');
  await sleep(1500);
  doc = await settled(NP, 'broken.pdf');
  ok(doc.record.status.status === 'failed' && doc.record.processing.attempts >= 1, 'still Failed after the retry, never marked Completed');
  ok((await office('POST', 'admin/documents/' + doc.record.id + '/close', {})).status === 409, 'a failed document cannot be closed as reviewed');
  r = await nurse('POST', 'people/' + NP + '/records', null, { headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': 'notes.txt', 'X-Category': 'general' }, body: Buffer.from('just some text, not a PDF or an image') });
  ok(r.status >= 400 && r.status < 500, 'a file that is not a PDF or an image is refused at upload (' + r.status + ')');

  // ---- history kept
  const after = await readingsOf(NP);
  const afterRows = new Set(after.series.flatMap((m) => m.rows.map((x) => m.metric + ':' + x.id)));
  ok(beforeRows.every((k) => afterRows.has(k)), 'every earlier reading is still there (' + beforeRows.length + ' before, ' + afterRows.size + ' after)');

  // ---- customer upload
  const famBefore = (await fam('GET', 'people/' + FP + '/dashboard?period=1y')).body;
  r = await upload(fam, FP, 'assessment.pdf');
  ok(r.status === 201 && r.body.id && r.body.processing, 'customer upload accepted (' + r.status + ')');
  doc = await settled(FP, 'assessment.pdf');
  ok(doc.record.status.status === 'completed' && doc.record.uploadedByRole === 'family', 'customer document processed by the same pipeline and Completed');
  const famEx = (await fam('GET', 'people/' + FP + '/records/' + r.body.id + '/extraction')).body;
  ok(famEx.ok && famEx.values.some((v) => v.name === 'PHQ-9 total (mood)' && v.value === 12 && v.status === 'accepted') && famEx.dates.test === D.d7, 'the customer sees what was read and the test date ' + D.d7);
  const famRisk = (await fam('GET', 'people/' + FP + '/risk')).body.status;
  const phq = famRisk.indicators.find((i) => i.id === 'phq9');
  ok(phq && phq.status === 'calculated' && phq.value === 12 && phq.band === 'Moderate depression' && phq.category === 'amber', 'Risk Trends for the customer: PHQ-9 12 calculated by the engine (Moderate depression, Amber)');
  const famDash = (await fam('GET', 'people/' + FP + '/dashboard?period=1y')).body;
  ok(famDash.series.find((m) => m.metric === 'bp').rows.some((x) => x.systolic === 118 && x.diastolic === 76 && istDay(new Date(x.at)) === D.d7), 'customer Vitals: blood pressure 118/76 on the test date');
  ok(famDash.risks.some((x) => x.test === 'phq9' && x.value === 12), 'customer Risk Trends lists the PHQ-9 result');
  ok(famBefore.series.every((m) => m.rows.every((x) => famDash.series.find((y) => y.metric === m.metric).rows.some((z) => z.id === x.id))), 'the customer\'s earlier readings are all kept');
  ok([403, 404].includes((await fam('GET', 'people/' + NP + '/records/' + (await findDoc(NP, 'lab_text.pdf'))[0].id + '/extraction')).status), 'a customer cannot open another person\'s document');
  r = await upload(fam, FP, 'assessment.pdf');
  ok(r.body.duplicate === true, 'the customer\'s repeated upload is recognised as a duplicate');

  // ---- an old report from before registration, with a two-digit year: stored and shown
  r = await upload(fam, FP, 'old_report.pdf');
  doc = await settled(FP, 'old_report.pdf');
  const oldEx = doc.extractions;
  ok(doc.record.status.status === 'completed' && doc.record.dates.measured === D.d9, 'two-digit year read as ' + doc.record.dates.measured + ' and stored automatically');
  ok(oldEx.every((x) => x.notes.some((n) => /Two-digit year/.test(n))), 'the two-digit year is noted on each value');
  const allDash = (await fam('GET', 'people/' + FP + '/dashboard?period=all')).body;
  ok(allDash.range.registeredOn === D.d9 && allDash.series.find((m) => m.metric === 'glucose').rows.some((x) => x.value === 98 && istDay(new Date(x.at)) === D.d9), 'Vitals "All": history now starts at the old report (' + allDash.range.registeredOn + ') and shows its fasting sugar');
  const oldRisk = (await fam('GET', 'people/' + FP + '/risk')).body.status.indicators.find((i) => i.id === 'psqi');
  ok(oldRisk && oldRisk.status === 'calculated' && oldRisk.value === 4 && oldRisk.band === 'Good sleep quality', 'Risk: the PSQI from the old report is used by the engine (Good sleep quality)');
}

(async () => {
  await partOne();
  const URL0 = process.argv[2];
  if (URL0) await partTwo(URL0); else console.log('(no server URL given: part 2 skipped)');
  console.log(`check-docs: PASS ${pass} FAIL ${fail}`);
  fs.rmSync(DIR, { recursive: true, force: true });
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERROR', e); process.exit(1); });
