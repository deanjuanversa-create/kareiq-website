// Document intelligence, the pipeline: one place that processes every medical document, whether a
// nurse or a customer uploaded it (POST people/:id/records).
//
//   Uploaded -> Processing -> Extracted -> Completed | Needs Review | Failed
//
// 1. Check the stored file again (type by content, size, SHA-256).
// 2. Read it: the PDF text layer, or OpenCV + Tesseract's pretrained LSTM OCR (ocr/report_reader.py),
//    with the confidence of every word.
// 3. Classify the document, find its dates by kind, extract the supported values (docextract.js).
// 4. Values that pass every check and have a known test date become readings (app_readings, source
//    'document'), linked to the document and the line they came from; the same measurement already
//    stored is never stored twice. Everything else waits for the office in the review queue.
// 5. The risk engine recalculates from the stored readings (it is never asked to trust the document).
// Failures that may pass (reader busy, timeout, reader not installed yet) are retried automatically
// with a growing delay, three times; the office can retry later.

const crypto = require('crypto');
const X = require('./docextract');
const R = require('./riskrules');
const vitals = require('./vitals');
const trends = require('./trends');
const reportreader = require('./reportreader');

const STATUS = { uploaded: 'Uploaded', processing: 'Processing', extracted: 'Extracted', needs_review: 'Needs Review', completed: 'Completed', failed: 'Failed' };
const RETRY_DELAYS = [30e3, 120e3, 600e3];
const MAX_ATTEMPTS = 3;
// the extraction rules a document was processed with; documents waiting for review under older rules are read again
const RULES = 'capture-all-1'; // every result captured, nothing waits for review (owner's decision, 20 Nov 2026)
const IST = '+05:30';
const sha256 = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

function sniff(buf) {
  if (buf.slice(0, 5).toString('latin1') === '%PDF-') return 'application/pdf';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'image/png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'image/webp';
  return null;
}

function create(ctx) {
  const { docs, uid, now, audit, risk } = ctx;
  const reader = ctx.reader || reportreader; // tests may pass a reader that fails on purpose
  const timers = new Map();
  let queue = Promise.resolve();

  function enqueue(id, opts) {
    const job = queue.then(() => processNow(id, opts || {}));
    queue = job.catch(() => {});
    return job;
  }
  function schedule(id, attempts) {
    if (attempts >= MAX_ATTEMPTS || process.env.APP_STATELESS === 'true') return null;
    const delay = Number(process.env.DOC_RETRY_MS) || RETRY_DELAYS[Math.min(attempts - 1, RETRY_DELAYS.length - 1)];
    clearTimeout(timers.get(id));
    const t = setTimeout(() => { timers.delete(id); enqueue(id, { retry: true }); }, delay);
    if (t.unref) t.unref();
    timers.set(id, t);
    return new Date(Date.now() + delay).toISOString();
  }
  async function setProc(id, changes) {
    const rec = await docs.findOne('app_records', { id });
    const proc = { ...(rec.processing || {}), ...changes, updatedAt: now() };
    await docs.update('app_records', id, { processing: proc });
    return proc;
  }

  // ---------------------------------------------------------------- one document
  async function processNow(id, opts) {
    const rec = await docs.findOne('app_records', { id });
    if (!rec || rec.removed) return null;
    const st = rec.processing && rec.processing.status;
    if (!opts.force && ['completed', 'needs_review', 'extracted'].includes(st)) return rec.processing; // already done
    if (opts.force && st === 'completed') return rec.processing; // a completed document is never read again
    const attempts = ((rec.processing && rec.processing.attempts) || 0) + 1;
    await setProc(id, { status: 'processing', attempts, startedAt: now(), lastError: null, retryable: false, nextRetryAt: null });
    const fail = async (message, retryable) => {
      const next = retryable ? schedule(id, attempts) : null;
      await setProc(id, { status: 'failed', lastError: message, retryable: Boolean(retryable), nextRetryAt: next, finishedAt: now() });
      if (rec.dateStatus === 'processing') await docs.update('app_records', id, { dateStatus: 'review', dateNote: message });
      await audit(null, 'document.failed', rec.personId, { record: id, attempts, retryable: Boolean(retryable) });
      return null;
    };
    try {
      // 1. the stored file is still the file that was uploaded
      const file = await docs.findOne('app_files', { id: rec.fileId });
      if (!file) return fail('The stored file is missing.', false);
      const buf = Buffer.from(file.data, 'base64');
      if (buf.length !== rec.size || sniff(buf) !== rec.mime || (rec.sha256 && sha256(buf) !== rec.sha256)) return fail('The stored file does not match the upload (integrity check failed).', false);
      // 2. read it
      let read = await reader.readPages(buf, rec.mime, {});
      if (!read.ok) return fail(read.error || 'The document could not be read.', read.retryable !== false);
      let pages = read.pages || [];
      let items = X.extract(pages);
      if (!items.length && !X.extractOther(pages, []).length && pages.some((p) => p.source === 'ocr')) {
        const deep = await reader.readPages(buf, rec.mime, { deep: true });
        if (deep.ok) { const more = X.extract(deep.pages); if (more.length || X.extractOther(deep.pages, []).length) { pages = deep.pages; items = more; } }
      }
      // nothing readable at all (blank, damaged or unreadable file): a failure, never "Completed"
      const textChars = pages.reduce((n, p) => n + (String(p.text || '').match(/[A-Za-z0-9]/g) || []).length, 0);
      if (textChars < 8) return fail('No readable text was found in the document (it may be blank, damaged or a very poor photo).', false);
      const ocrLines = pages.filter((p) => p.source !== 'text').flatMap((p) => p.lines || []).filter((l) => String(l.text || '').trim());
      const ocrQuality = ocrLines.length ? Math.round(ocrLines.reduce((n, l) => n + (Number(l.conf) || 0), 0) / ocrLines.length) : null;
      const kind = X.classify(pages);
      const dates = X.findDates(pages);
      // the date the values are stored on (the test date, else a fallback that is noted on each value)
      const uploadDay = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date(rec.uploadedAt || rec.createdAt || Date.now()));
      const use = X.useDate(dates, uploadDay);
      items = X.validate(items, dates, use);
      // every other result in the document (not shown in Vitals): kept with the document
      const others = X.extractOther(pages, items).map((o) => ({ ...o, measuredDate: use.date, notes: use.note ? [use.note] : [], reasons: [] }));
      const engine = read.engine ? { opencv: read.engine.opencv || null, tesseract: read.engine.tesseract || null, sources: [...new Set(pages.map((p) => p.source))] } : null;
      // the record's own date (Medical records list): the report date, else the test date; never the upload date
      // the record's own date (Medical records list): the report date, else the date the values are stored on
      const shown = (dates.report && dates.report.date) || use.date || null;
      const shownLabel = dates.report && dates.report.date ? 'Report date' : use.basis === 'test' ? 'Test date' : use.basis === 'upload' ? 'Upload date' : 'Date on the report';
      await docs.update('app_records', id, { docType: kind.type, docTypeLabel: kind.label, sections: [...new Set(items.concat(others).map((i) => i.section).filter(Boolean))], dates: { measured: use.date, measuredBasis: use.basis, measuredStatus: dates.status, measuredNote: use.note || dates.reason || null, test: dates.test, report: dates.report, issue: dates.issue, all: dates.all },
        date: shown, dateStatus: shown ? 'detected' : 'review', dateLabel: shown ? shownLabel : null, dateNote: shown ? null : dates.reason, dateReadAt: now(), dateEngine: engine });
      await setProc(id, { status: 'extracted', extractedAt: now(), engine, pages: pages.length, found: items.length + others.length, ocrQuality });

      // 3. store each value: accepted ones become readings (never twice), the rest wait for review.
      // Values still waiting from an earlier reading of this document are replaced (kept, marked superseded).
      for (const old of await docs.find('app_extractions', { recordId: id, status: 'needs_review' })) await docs.update('app_extractions', old.id, { status: 'superseded', supersededAt: now() });
      const person = await docs.findOne('app_people', { id: rec.personId });
      let wrote = 0, n = 0;
      for (const it of items) {
        n++;
        const exId = 'ex-' + id + '-a' + attempts + '-' + n;
        const row = { id: exId, recordId: id, personId: rec.personId, field: it.field, kind: it.kind, name: it.name, label: it.label, value: it.value, systolic: it.systolic, diastolic: it.diastolic, context: it.context || null,
          unit: it.unit, rawValue: it.rawValue, rawUnit: it.rawUnit, conversion: it.conversion || null, qualifier: it.qualifier || null, refRange: it.refRange || null,
          page: it.page, line: it.line, section: it.section || null, source: it.source, rawLine: it.rawLine, confidence: it.confidence,
          measuredDate: it.measuredDate || null, dateText: dates.test ? dates.test.raw : null, status: it.status, reasons: it.reasons, notes: it.notes || [], readingId: null, createdAt: now(), uploadedBy: rec.uploadedBy };
        if (it.status === 'accepted') {
          const r = await storeReading(person, rec, row, it.measuredDate, n);
          row.readingId = r.id; if (r.duplicate) { row.status = 'duplicate'; row.reasons = ['This measurement is already stored (same test, date and value)']; } else wrote++;
        }
        await docs.insert('app_extractions', row);
      }
      // other results: kept with the document and the person (latest per test), never in Vitals or the risk engine
      let kept = 0;
      const earlier = await docs.find('app_extractions', { personId: rec.personId, kind: 'other', status: 'stored' });
      for (const o of others) {
        n++;
        const row = { id: 'ex-' + id + '-a' + attempts + '-' + n, recordId: id, personId: rec.personId, field: o.field, kind: 'other', name: o.name, label: o.label, value: o.value, text: o.text || null, context: null,
          unit: o.unit, rawValue: o.rawValue, rawUnit: o.rawUnit, conversion: null, qualifier: o.qualifier || null, refRange: o.refRange || null, flag: o.flag || null,
          page: o.page, line: o.line, section: o.section || null, source: o.source, rawLine: o.rawLine, confidence: o.confidence,
          measuredDate: o.measuredDate || null, dateText: dates.test ? dates.test.raw : null, status: 'stored', reasons: [], notes: o.notes || [], readingId: null, createdAt: now(), uploadedBy: rec.uploadedBy };
        const dup = earlier.find((x) => x.field === row.field && x.measuredDate === row.measuredDate && String(x.value != null ? x.value : x.text) === String(row.value != null ? row.value : row.text) && (x.unit || '') === (row.unit || ''));
        if (dup) { row.status = 'duplicate'; row.reasons = ['This result is already stored (same test, date and value)']; } else kept++;
        await docs.insert('app_extractions', row);
      }
      if (wrote) await risk.recalc(rec.personId, 'document', rec.uploadedBy);
      const pending = items.filter((i) => i.status === 'needs_review').length;
      const final = pending ? 'needs_review' : 'completed';
      const note = !items.length && !others.length ? 'No test results were found in this document.' + (ocrQuality != null && ocrQuality < 50 ? ' The scan or photo is of poor quality (average reading confidence ' + ocrQuality + '%).' : '') : null;
      await setProc(id, { status: final, finishedAt: now(), stored: wrote, kept, pending, note, rules: RULES });
      await audit(null, 'document.processed', rec.personId, { record: id, status: final, found: items.length + others.length, stored: wrote, kept, pending });
      return { status: final };
    } catch (e) {
      console.error('[documents] processing failed:', e.message);
      return fail('Processing failed: ' + e.message, true);
    }
  }

  // A reading from a document: dated by the test date (time unknown), linked to the document and
  // line. If the same measurement is already stored (from any source), nothing new is stored.
  async function storeReading(person, rec, ex, date, n) {
    const f = X.BY_FIELD[ex.field];
    const hour = ex.context === 'fasting' ? '08' : ex.context === 'post_meal' ? '10' : '12';
    const ms = Date.parse(`${date}T${hour}:00:00${IST}`) + (n % 60) * 1000; // distinct times keep same-day values apart on charts
    const dayFrom = Date.parse(`${date}T00:00:00${IST}`), dayTo = dayFrom + 86400000;
    const metric = ex.field;
    const same = (await docs.find('app_readings', { personId: person.id, metric, voided: false })).find((r) => r.measuredMs >= dayFrom && r.measuredMs < dayTo &&
      (metric === 'bp' ? r.systolic === ex.systolic && r.diastolic === ex.diastolic : Math.abs(Number(r.value) - Number(ex.value)) < 1e-6 && (metric !== 'glucose' || r.context === ex.context)));
    if (same) return { id: same.id, duplicate: true };
    const base = { id: 'docr-' + ex.id, personId: person.id, metric, measuredAt: new Date(ms).toISOString(), measuredMs: ms, timeKnown: false, source: 'document', recordId: rec.id, extractionId: ex.id, enteredBy: rec.uploadedBy, enteredAt: now(), voided: false };
    if (metric === 'bp') Object.assign(base, { systolic: ex.systolic, diastolic: ex.diastolic });
    else Object.assign(base, { value: ex.value });
    if (metric === 'glucose') base.context = ex.context;
    if (f.kind === 'input') base.kind = 'assessment';
    await docs.insert('app_readings', base);
    // BMI as the visit form works it out: from this weight and the latest height
    if (metric === 'weight') {
      const h = (await docs.find('app_readings', { personId: person.id, metric: 'height', voided: false }, { sort: { measuredAt: -1 }, limit: 1 }))[0];
      if (h && h.value) await docs.insert('app_readings', { ...base, id: base.id + '-bmi', metric: 'bmi', value: Math.round((ex.value / ((h.value / 100) ** 2)) * 10) / 10, source: 'calculated' });
    }
    return { id: base.id, duplicate: false };
  }

  // ---------------------------------------------------------------- the office's review
  async function review(exId, body, user) {
    const ex = await docs.findOne('app_extractions', { id: exId });
    if (!ex) return { status: 404, message: 'Not found.' };
    if (ex.status !== 'needs_review') return { status: 409, message: 'This value was already ' + ex.status.replace('_', ' ') + '.' };
    const errors = {};
    if (body.action === 'reject') {
      const why = String(body.note || '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 300);
      if (why.length < 3) return { status: 400, errors: { note: 'Say why this value is not used' } };
      await docs.update('app_extractions', ex.id, { status: 'rejected', reviewedBy: user.id, reviewedAt: now(), reviewNote: why });
      await audit(user.id, 'document.value.reject', ex.personId, { extraction: ex.id, field: ex.field });
      await settle(ex.recordId);
      return { status: 200 };
    }
    if (body.action !== 'accept') return { status: 400, errors: { action: 'Accept or reject' } };
    const f = X.BY_FIELD[ex.field];
    const date = String(body.date || ex.measuredDate || '');
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || date > today || date < '1990-01-01') errors.date = 'Enter the test date shown in the document';
    const fixed = { measuredDate: date };
    if (ex.field === 'bp') {
      const s = Number(body.systolic ?? ex.systolic), d = Number(body.diastolic ?? ex.diastolic);
      const [ls, hs] = vitals.LIMITS.systolic, [ld, hd] = vitals.LIMITS.diastolic;
      if (!(Number.isInteger(s) && s >= ls && s <= hs && Number.isInteger(d) && d >= ld && d <= hd && s > d)) errors.value = 'Enter both blood pressure numbers';
      Object.assign(fixed, { systolic: s, diastolic: d });
    } else {
      const v = Number(String(body.value ?? ex.value).replace(',', '.'));
      if (!Number.isFinite(v) || (f.limits && (v < f.limits[0] || v > f.limits[1]))) errors.value = `Enter the value in ${f.native || 'the scale'} (${f.limits ? f.limits[0] + '–' + f.limits[1] : ''})`;
      else if (f.integer && !Number.isInteger(v)) errors.value = 'Enter a whole number';
      fixed.value = v;
      if (f.context) { const c = body.context || ex.context; if (!vitals.GLUCOSE_CONTEXTS[c]) errors.context = 'Choose fasting, after a meal or random'; fixed.context = c; }
    }
    if (Object.keys(errors).length) return { status: 400, errors };
    const corrected = ['value', 'systolic', 'diastolic', 'context', 'measuredDate'].filter((k) => fixed[k] !== undefined && fixed[k] !== ex[k]);
    const person = await docs.findOne('app_people', { id: ex.personId });
    const rec = await docs.findOne('app_records', { id: ex.recordId });
    const r = await storeReading(person, rec, { ...ex, ...fixed }, fixed.measuredDate, Number(ex.id.split('-').pop()) || 1);
    await docs.update('app_extractions', ex.id, { status: r.duplicate ? 'duplicate' : 'accepted', readingId: r.id, reviewedBy: user.id, reviewedAt: now(), reviewNote: String(body.note || '').slice(0, 300) || null,
      corrected: corrected.length ? Object.fromEntries(corrected.map((k) => [k, { from: ex[k] ?? null, to: fixed[k] }])) : null });
    await audit(user.id, 'document.value.accept', ex.personId, { extraction: ex.id, field: ex.field, corrected });
    if (!r.duplicate) await risk.recalc(ex.personId, 'document reviewed', user.id);
    await settle(ex.recordId);
    return { status: 200, duplicate: r.duplicate };
  }
  // a document is Completed once no value is waiting for review
  async function settle(recordId) {
    const rows = await docs.find('app_extractions', { recordId });
    const pending = rows.filter((x) => x.status === 'needs_review').length;
    const live = rows.filter((x) => x.status !== 'superseded');
    const rec = await docs.findOne('app_records', { id: recordId });
    const final = pending || !live.length ? 'needs_review' : 'completed';
    if (rec && rec.processing && rec.processing.status !== final) await setProc(recordId, { status: final, pending, finishedAt: now() });
    else if (rec && rec.processing) await setProc(recordId, { pending });
  }
  // the office closes a document that has no usable values (e.g. a prescription)
  async function close(recordId, user, note) {
    const rec = await docs.findOne('app_records', { id: recordId });
    if (!rec) return { status: 404 };
    const rows = await docs.find('app_extractions', { recordId });
    if (rows.some((x) => x.status === 'needs_review')) return { status: 409, message: 'Accept or reject every value first.' };
    if (!rec.processing || !['needs_review', 'failed'].includes(rec.processing.status)) return { status: 409, message: 'Only a document waiting for review or failed can be closed.' };
    if (rec.processing.status === 'failed') return { status: 409, message: 'Retry a failed document instead.' };
    await setProc(recordId, { status: 'completed', closedBy: user.id, closedAt: now(), note: String(note || '').slice(0, 300) || 'Reviewed: no values to store.' });
    await audit(user.id, 'document.close', rec.personId, { record: recordId });
    return { status: 200 };
  }

  // ---------------------------------------------------------------- what each role sees
  function statusOf(rec) {
    const s = rec.processing ? rec.processing.status : null;
    return s ? { status: s, label: STATUS[s], at: rec.processing.updatedAt || null } : { status: 'not_processed', label: 'Not processed', at: null };
  }
  async function summary(rec) {
    const rows = (await docs.find('app_extractions', { recordId: rec.id }, { sort: { createdAt: 1 } })).filter((x) => x.status !== 'superseded');
    const c = (s) => rows.filter((x) => x.status === s).length;
    return { ...statusOf(rec), docType: rec.docTypeLabel || null, dates: rec.dates ? { test: rec.dates.measured, testStatus: rec.dates.measuredStatus, testNote: rec.dates.measuredNote, report: rec.dates.report ? rec.dates.report.date : null } : null,
      counts: { stored: c('accepted'), kept: c('stored') + c('captured'), review: c('needs_review'), duplicate: c('duplicate'), rejected: c('rejected') }, note: rec.processing ? rec.processing.note || null : null, error: rec.processing && rec.processing.status === 'failed' ? rec.processing.lastError : null,
      values: rows.map((x) => ({ name: x.name, value: x.field === 'bp' ? x.systolic + '/' + x.diastolic : x.value != null ? x.value : x.text, unit: x.unit, context: x.context, refRange: x.refRange || null, flag: x.flag || null, other: x.kind === 'other', date: x.measuredDate, status: x.status, notes: x.notes || [] })) };
  }

  // ---------------------------------------------------------------- after a restart
  async function resume() {
    const all = (await docs.find('app_records', {})).filter((r) => !r.removed && r.processing);
    const rows = all.filter((r) => ['uploaded', 'processing'].includes(r.processing.status) || (r.processing.status === 'failed' && r.processing.retryable && (r.processing.attempts || 0) < MAX_ATTEMPTS));
    for (const r of rows.slice(0, 50)) enqueue(r.id, { retry: true });
    // waiting for review under older, stricter rules, and nobody has reviewed any of its values yet: read again
    let again = 0;
    for (const r of all.filter((x) => x.processing.status === 'needs_review' && x.processing.rules !== RULES).slice(0, 50)) {
      const ex = await docs.find('app_extractions', { recordId: r.id });
      if (ex.some((x) => x.reviewedBy)) continue;
      enqueue(r.id, { force: true }); again++;
    }
    return rows.length + again;
  }

  return { enqueue, processNow, review, settle, close, summary, statusOf, resume, sha256, STATUS, MAX_ATTEMPTS, RULES };
}

module.exports = { create, STATUS, sha256 };
