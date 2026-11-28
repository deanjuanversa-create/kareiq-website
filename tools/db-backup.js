// Backup, verification and restore-test tool for the KareIQ database (see docs/BACKUP-RESTORE.md).
//
//   node tools/db-backup.js backup  --out <folder> [--allow-production-source]
//   node tools/db-backup.js verify  <folder>
//   node tools/db-backup.js restore <folder> --target-data-dir <empty folder>
//   node tools/db-backup.js restore <folder> --target-db <name>        (TARGET_MONGODB_URI in the environment)
//   node tools/db-backup.js selftest                                     (file mode, temporary folders only)
//
// Source: the server's own storage settings (MONGODB_URI + MONGODB_DB, or the data folder DATA_DIR).
// A backup only READS the source. Reading the production database needs --allow-production-source,
// so it is always a deliberate act. A RESTORE never writes to production: it refuses the live
// database name, the database the server itself is configured with, APP_ENV=production, and any
// target that already holds data (it only fills an empty, separate database or folder).
// Connection strings are never printed. Each backup has manifest.json with a SHA-256 and the number
// of records for every collection, which `verify` checks.

const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const runtime = require('../src/runtime');

const args = process.argv.slice(2);
const cmd = args[0];
const opt = (k) => { const i = args.indexOf(k); return i > -1 ? args[i + 1] : null; };
const flag = (k) => args.includes(k);
const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');
const die = (m) => { console.error('REFUSED: ' + m); process.exit(2); };

function source() {
  const storage = runtime.storageOf();
  if (storage === 'mongo') return { mode: 'mongo', db: process.env.MONGODB_DB || runtime.PROD_DB };
  if (storage === 'file') return { mode: 'file', dir: path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data')) };
  die('backups of ' + storage + ' storage are not supported by this tool (use the provider\'s own export).');
}
const isProductionDb = (name) => String(name || '').trim() === runtime.PROD_DB;

async function mongoClient(uri) {
  const { MongoClient } = require('mongodb');
  const c = new MongoClient(uri, { serverSelectionTimeoutMS: 10000 });
  await c.connect();
  return c;
}

// ---------------------------------------------------------------- backup (read-only)
async function backup(out) {
  if (!out) die('give --out <folder>.');
  const src = source();
  const prodSource = runtime.resolve().name === 'production' || (src.mode === 'mongo' && isProductionDb(src.db));
  if (prodSource && !flag('--allow-production-source')) die('the source is the production database. Add --allow-production-source to confirm a read-only backup of it.');
  if (fs.existsSync(out) && fs.readdirSync(out).length) die('the output folder is not empty.');
  fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  const files = [];
  if (src.mode === 'mongo') {
    const { EJSON } = require('mongodb').BSON;
    const client = await mongoClient(process.env.MONGODB_URI);
    try {
      const db = client.db(src.db);
      for (const { name } of await db.listCollections({}, { nameOnly: true }).toArray()) {
        if (name.startsWith('system.')) continue;
        const lines = [];
        for await (const d of db.collection(name).find({})) lines.push(EJSON.stringify(d, { relaxed: false }));
        const buf = Buffer.from(lines.join('\n') + (lines.length ? '\n' : ''));
        fs.writeFileSync(path.join(out, name + '.ndjson'), buf, { mode: 0o600 });
        files.push({ name: name + '.ndjson', collection: name, records: lines.length, sha256: sha(buf) });
      }
    } finally { await client.close(); }
  } else {
    if (!fs.existsSync(src.dir)) die('the data folder does not exist.');
    const walk = (dir, rel = '') => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const r = path.join(rel, e.name);
        if (e.isDirectory()) { fs.mkdirSync(path.join(out, r), { recursive: true, mode: 0o700 }); walk(path.join(dir, e.name), r); continue; }
        if (!e.name.endsWith('.json')) continue;
        const buf = fs.readFileSync(path.join(dir, e.name));
        let records = null; try { const j = JSON.parse(buf); records = Array.isArray(j) ? j.length : 1; } catch { /* kept as is */ }
        fs.writeFileSync(path.join(out, r), buf, { mode: 0o600 });
        files.push({ name: r, records, sha256: sha(buf) });
      }
    };
    walk(src.dir);
  }
  const manifest = { tool: 'kareiq db-backup', version: 1, createdAt: new Date().toISOString(), source: src.mode === 'mongo' ? { mode: 'mongo', database: src.db } : { mode: 'file' }, files };
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify(manifest, null, 2), { mode: 0o600 });
  console.log(`backup written: ${files.length} collection file(s), ${files.reduce((n, f) => n + (f.records || 0), 0)} record(s)`);
  return manifest;
}

// ---------------------------------------------------------------- verify
function verify(dir) {
  const mf = path.join(dir || '', 'manifest.json');
  if (!dir || !fs.existsSync(mf)) die('no manifest.json in that folder.');
  const m = JSON.parse(fs.readFileSync(mf, 'utf8'));
  const problems = [];
  for (const f of m.files) {
    const p = path.join(dir, f.name);
    if (!fs.existsSync(p)) { problems.push(f.name + ': missing'); continue; }
    const buf = fs.readFileSync(p);
    if (sha(buf) !== f.sha256) problems.push(f.name + ': checksum differs');
    if (f.name.endsWith('.ndjson')) { const n = buf.toString('utf8').split('\n').filter(Boolean).length; if (n !== f.records) problems.push(f.name + ': ' + n + ' records, manifest says ' + f.records); }
    else if (f.records != null) { try { const j = JSON.parse(buf); if ((Array.isArray(j) ? j.length : 1) !== f.records) problems.push(f.name + ': record count differs'); } catch { problems.push(f.name + ': not valid JSON'); } }
  }
  console.log(problems.length ? 'verify FAILED:\n  ' + problems.join('\n  ') : `verify OK: ${m.files.length} file(s) match the manifest (backup of ${m.createdAt})`);
  return problems;
}

// ---------------------------------------------------------------- restore (never into production)
async function restore(dir) {
  if (verify(dir).length) die('the backup does not verify; nothing restored.');
  if (runtime.resolve().name === 'production') die('APP_ENV/hosting says production: restores are only run on a separate test or staging setup.');
  const m = JSON.parse(fs.readFileSync(path.join(dir, 'manifest.json'), 'utf8'));
  const targetDir = opt('--target-data-dir'), targetDb = opt('--target-db');
  if (targetDir) {
    const t = path.resolve(targetDir);
    const current = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
    if (t === current) die('the target is the data folder this server is configured with.');
    if (fs.existsSync(t) && fs.readdirSync(t).length) die('the target folder is not empty.');
    if (m.source.mode !== 'file') die('this backup came from MongoDB: restore it with --target-db.');
    for (const f of m.files) { fs.mkdirSync(path.dirname(path.join(t, f.name)), { recursive: true }); fs.copyFileSync(path.join(dir, f.name), path.join(t, f.name)); }
    console.log(`restored ${m.files.length} file(s) into the empty folder`);
    return;
  }
  if (targetDb) {
    const uri = process.env.TARGET_MONGODB_URI;
    if (!uri) die('set TARGET_MONGODB_URI (the test or staging cluster) in the environment.');
    if (isProductionDb(targetDb) || /prod/i.test(targetDb)) die('the target database name is the live one.');
    if (uri === process.env.MONGODB_URI && targetDb === (process.env.MONGODB_DB || runtime.PROD_DB)) die('the target is the database this server is configured with.');
    if (m.source.mode !== 'mongo') die('this backup came from a data folder: restore it with --target-data-dir.');
    const { EJSON } = require('mongodb').BSON;
    const client = await mongoClient(uri);
    try {
      const db = client.db(targetDb);
      const existing = (await db.listCollections({}, { nameOnly: true }).toArray()).filter((c) => !c.name.startsWith('system.'));
      if (existing.length) die('the target database is not empty (' + existing.length + ' collections).');
      for (const f of m.files) {
        const docs = fs.readFileSync(path.join(dir, f.name), 'utf8').split('\n').filter(Boolean).map((l) => EJSON.parse(l, { relaxed: false }));
        if (docs.length) await db.collection(f.collection).insertMany(docs, { ordered: true });
      }
      console.log(`restored ${m.files.length} collection(s) into the empty target database`);
    } finally { await client.close(); }
    return;
  }
  die('give --target-data-dir <empty folder> or --target-db <name>.');
}

// ---------------------------------------------------------------- selftest (file mode, temp folders)
async function selftest() {
  const { execFileSync } = require('child_process');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'kq-backup-test-'));
  const src = path.join(base, 'data'), bak = path.join(base, 'backup'), dst = path.join(base, 'restored');
  fs.mkdirSync(path.join(src, 'content-history'), { recursive: true });
  fs.writeFileSync(path.join(src, 'bookings.json'), JSON.stringify([{ id: 'b1', reference: 'KH-TEST01' }, { id: 'b2', reference: 'KH-TEST02' }]));
  fs.writeFileSync(path.join(src, 'app_users.json'), JSON.stringify([{ id: 'u1', role: 'family' }]));
  fs.writeFileSync(path.join(src, 'content-history', 'v1.json'), JSON.stringify({ v: 1 }));
  const run = (a, extra = {}) => { try { return { code: 0, out: execFileSync(process.execPath, [__filename, ...a], { env: { PATH: process.env.PATH, DATA_DIR: src, ...extra }, encoding: 'utf8', stdio: 'pipe' }) }; } catch (e) { return { code: e.status, out: String(e.stdout) + String(e.stderr) }; } };
  let pass = 0, fail = 0; const ok = (c, m) => { c ? pass++ : fail++; console.log((c ? 'PASS ' : 'FAIL ') + m); };
  ok(run(['backup', '--out', bak]).code === 0, 'backup of a data folder');
  ok(run(['verify', bak]).code === 0, 'the backup verifies against its manifest');
  ok(run(['restore', bak, '--target-data-dir', dst]).code === 0, 'restore into an empty folder');
  const same = ['bookings.json', 'app_users.json', path.join('content-history', 'v1.json')].every((f) => fs.readFileSync(path.join(src, f)).equals(fs.readFileSync(path.join(dst, f))));
  ok(same, 'the restored files are byte-for-byte the originals');
  ok(run(['restore', bak, '--target-data-dir', dst]).code === 2, 'refuses to restore into a folder that already has data');
  ok(run(['restore', bak, '--target-data-dir', src]).code === 2, 'refuses to restore over the configured data folder');
  ok(run(['restore', bak, '--target-data-dir', path.join(base, 'x')], { APP_ENV: 'production' }).code === 2, 'refuses to restore when APP_ENV=production');
  ok(run(['restore', bak, '--target-db', 'kareiq'], { TARGET_MONGODB_URI: 'mongodb://127.0.0.1:1' }).code === 2, 'refuses the live database name as a restore target');
  ok(run(['backup', '--out', path.join(base, 'b2')], { APP_ENV: 'production' }).code === 2, 'refuses to read production without --allow-production-source');
  fs.appendFileSync(path.join(bak, 'bookings.json'), ' ');
  ok(run(['verify', bak]).code !== 0 || /FAILED/.test(run(['verify', bak]).out), 'a changed backup file fails verification');
  ok(run(['restore', bak, '--target-data-dir', path.join(base, 'y')]).code === 2, 'a backup that does not verify is never restored');
  fs.rmSync(base, { recursive: true, force: true });
  console.log(`db-backup selftest: PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
}

(async () => {
  if (cmd === 'backup') await backup(opt('--out'));
  else if (cmd === 'verify') process.exit(verify(args[1]).length ? 1 : 0);
  else if (cmd === 'restore') await restore(args[1]);
  else if (cmd === 'selftest') await selftest();
  else { console.log('usage: backup --out <dir> | verify <dir> | restore <dir> --target-data-dir <dir> | restore <dir> --target-db <name> | selftest'); process.exit(1); }
})().catch((e) => { console.error('ERROR: ' + e.message); process.exit(1); });
