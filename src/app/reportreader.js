// Runs the report reader (ocr/report_reader.py: OpenCV + Tesseract, PDF text layer first) on one
// uploaded file and finds the report date in what it read. One file at a time, so a burst of
// uploads cannot exhaust the server's memory. The file is written to a private temporary folder
// for the reader and removed straight after; the text is not logged or stored in full.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFile } = require('child_process');
const { findReportDate } = require('./reportdate');

const SCRIPT = path.join(__dirname, '..', '..', 'ocr', 'report_reader.py');
const PY = process.env.OCR_PYTHON || 'python3';
const TIMEOUT = Number(process.env.OCR_TIMEOUT_MS || 150000);
let ready = null; // Promise<{ ok, why }>

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
  }
  return ready;
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
    const pass = async (deep) => {
      const r = await exec(PY, [SCRIPT, file, mime].concat(deep ? ['deep'] : []), { timeout: TIMEOUT });
      try { return JSON.parse(r.stdout); } catch { return null; }
    };
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

module.exports = { available, read };
