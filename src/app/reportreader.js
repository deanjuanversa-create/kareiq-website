// Runs the report reader (ocr/report_reader.py: OpenCV + Tesseract, PDF text layer first) on one
// uploaded file and finds the report date in what it read. One file at a time, so a burst of
// uploads cannot exhaust the server's memory. The file is written to a private temporary folder
// for the reader and removed straight after; the text is not logged or stored in full.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const crypto = require('crypto');
const { findReportDate } = require('./reportdate');

const SCRIPT = path.join(__dirname, '..', '..', 'ocr', 'report_reader.py');
// The Python that runs the reader: OCR_PYTHON if set, else the project's own virtual environment
// (.venv, where OpenCV is installed for local development) when there is one, else python3 on the
// PATH (the Docker image). Without this a server started outside the venv (e.g. plain `npm start`)
// picked up a system python3 without OpenCV and every document failed.
const VENV_PY = path.join(__dirname, '..', '..', '.venv', process.platform === 'win32' ? 'Scripts' : 'bin', process.platform === 'win32' ? 'python.exe' : 'python3');
const PY = process.env.OCR_PYTHON || (fs.existsSync(VENV_PY) ? VENV_PY : 'python3');
const TIMEOUT = Number(process.env.OCR_TIMEOUT_MS || 150000);
let ready = null; // Promise<{ ok, why }>; only a successful check is kept

function exec(cmd, args, opts) {
  return new Promise((resolve) => {
    execFile(cmd, args, { timeout: 20000, maxBuffer: 8 * 1024 * 1024, ...opts }, (err, stdout) => resolve({ err, stdout: String(stdout || '') }));
  });
}

// can this server read reports? (python3 with OpenCV, and the Tesseract program)
function available() {
  if (process.env.OCR_DISABLED === 'true') return Promise.resolve({ ok: false, why: 'Automatic reading is switched off on this server.' });
  if (!ready) {
    ready = (async () => {
      if (!fs.existsSync(SCRIPT)) return { ok: false, why: 'The report reader is not installed on this server.' };
      const cv = await exec(PY, ['-c', 'import cv2, numpy; print(cv2.__version__)']);
      if (cv.err) return { ok: false, why: 'Automatic reading is not available on this server yet (OpenCV is not installed).' };
      const t = await exec('tesseract', ['--version']);
      if (t.err) return { ok: false, why: 'Automatic reading is not available on this server yet (the OCR engine is not installed).' };
      return { ok: true, opencv: cv.stdout.trim() };
    })();
    // a missing reader is retryable (docintel retries it): check again next time instead of
    // remembering the failure for the life of the process
    const check = ready;
    check.then((r) => {
      if (r.ok) return;
      console.warn('[reportreader] reading unavailable with ' + PY + ': ' + r.why);
      if (ready === check) ready = null;
    });
  }
  return ready;
}

// One upload is read twice: first for its report date, then by the document extraction. The OCR is
// the slow part (about a minute on a small server), so a successful read of the same file is kept in
// memory for a short while and reused. Only this server's memory; nothing is written anywhere.
const CACHE_MS = 15 * 60 * 1000, CACHE_MAX = 8;
const cache = new Map();
const keyOf = (buf, mime, deep) => crypto.createHash('sha256').update(buf).digest('hex') + '|' + mime + '|' + (deep ? 'deep' : 'std');
function cached(key) {
  const c = cache.get(key);
  if (!c) return null;
  if (Date.now() - c.at > CACHE_MS) { cache.delete(key); return null; }
  return c.out;
}
function remember(key, out) {
  if (!out || !out.ok) return;
  cache.delete(key);
  cache.set(key, { at: Date.now(), out });
  while (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value);
}
// runs the reader on the file (or reuses the last read of the same file); parsed JSON, or null
async function runReader(file, buf, mime, deep) {
  const key = keyOf(buf, mime, deep);
  const hit = cached(key);
  if (hit) return { out: hit, err: null };
  const r = await exec(PY, [SCRIPT, file, mime].concat(deep ? ['deep'] : []), { timeout: TIMEOUT });
  let out = null; try { out = JSON.parse(r.stdout); } catch { out = null; }
  remember(key, out);
  return { out, err: r.err };
}

let queue = Promise.resolve();
function read(buf, mime, category) {
  const job = queue.then(() => readNow(buf, mime, category));
  queue = job.catch(() => {});
  return job;
}

async function readNow(buf, mime, category) {
  const can = await available();
  if (!can.ok) return { status: 'unavailable', date: null, candidates: [], reason: can.why, engine: null };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kq-up-'));
  try {
    fs.chmodSync(dir, 0o700);
    const file = path.join(dir, 'report' + (mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg'));
    fs.writeFileSync(file, buf, { mode: 0o600 });
    const pass = async (deep) => (await runReader(file, buf, mime, deep)).out;
    let out = await pass(false);
    if (!out || !out.ok) {
      const why = out && out.error === 'timeout' ? 'Reading the report took too long.' : 'The report could not be read automatically.';
      return { status: 'notfound', date: null, candidates: [], reason: why, engine: out && out.engine };
    }
    let found = findReportDate(out.pages, { category });
    let deep = false;
    // nothing usable on scanned pages: read them again more thoroughly before giving up
    if (found.status !== 'detected' && out.pages.some((p) => p.source === 'ocr')) {
      const more = await pass(true);
      if (more && more.ok) {
        deep = true;
        const again = findReportDate(out.pages.concat(more.pages.map((p) => ({ ...p, source: 'ocr-deep' }))), { category });
        if (again.status === 'detected') found = again;
      }
    }
    const sources = [...new Set(out.pages.map((p) => p.source))].concat(deep ? ['ocr-deep'] : []);
    return { ...found, pages: out.pages.length, sources, engine: out.engine };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

// The pages of one document with their lines (and, for OCR, the word confidences), for the
// document extraction. Same queue and private temporary folder as read(); a second, deeper OCR pass
// is made when asked. Returns { ok, pages, engine } or { ok: false, error, retryable }.
function readPages(buf, mime, opts) {
  const job = queue.then(() => readPagesNow(buf, mime, opts || {}));
  queue = job.catch(() => {});
  return job;
}
async function readPagesNow(buf, mime, opts) {
  const can = await available();
  if (!can.ok) return { ok: false, error: can.why, retryable: true };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'kq-up-'));
  try {
    fs.chmodSync(dir, 0o700);
    const file = path.join(dir, 'doc' + (mime === 'application/pdf' ? '.pdf' : mime === 'image/png' ? '.png' : mime === 'image/webp' ? '.webp' : '.jpg'));
    fs.writeFileSync(file, buf, { mode: 0o600 });
    const r = await runReader(file, buf, mime, Boolean(opts.deep));
    const out = r.out;
    if (!out) return { ok: false, error: r.err && r.err.killed ? 'Reading the document took too long.' : 'The document reader did not answer.', retryable: true };
    if (!out.ok) return { ok: false, error: out.error === 'timeout' ? 'Reading the document took too long.' : out.error === 'unreadable-image' ? 'The file could not be opened as an image.' : 'The document could not be read (' + out.error + ').', retryable: out.error === 'timeout', engine: out.engine };
    return { ok: true, pages: out.pages, engine: out.engine };
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

module.exports = { available, read, readPages };
