// Storage for bookings, enquiries and website content.
//
// - MongoDB Atlas (recommended for the live site on Render): set MONGODB_URI.
// - Upstash Redis: set KV_REST_API_URL + KV_REST_API_TOKEN (or UPSTASH_REDIS_REST_*).
// - On your own computer: JSON files in the /data folder (nothing to set up).
// - On Vercel WITHOUT a database: a temporary folder that Vercel wipes regularly.
//   The admin page shows a warning in that case.

const fsp = require('fs/promises');
const path = require('path');

const MONGO_URI = process.env.MONGODB_URI || '';
const MONGO_DB = process.env.MONGODB_DB || 'kareiq';
const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const PREFIX = process.env.KV_PREFIX || 'kareiq:';

const mode = MONGO_URI ? 'mongo' : REDIS_URL && REDIS_TOKEN ? 'redis' : process.env.VERCEL ? 'temporary' : 'file';
const DATA_DIR = mode === 'temporary' ? path.join('/tmp', 'kareiq-data') : path.join(__dirname, '..', 'data');

// ---------- MongoDB (one shared connection, opened on first use) ----------
let mongoDbPromise = null;
function mongo() {
  if (!mongoDbPromise) {
    const { MongoClient } = require('mongodb'); // installed from package.json on Render
    const client = new MongoClient(MONGO_URI, { maxPoolSize: 5, serverSelectionTimeoutMS: 10000 });
    mongoDbPromise = client.connect()
      .then((c) => c.db(MONGO_DB))
      .catch((err) => { mongoDbPromise = null; throw err; }); // retry on the next request
  }
  return mongoDbPromise;
}
const col = async (name) => (await mongo()).collection(name);
// Settings and content live in one small collection: { _id: key, value: "<json>" }
const KV = 'settings';
const HISTORY = 'history';

async function ping() {
  if (mode !== 'mongo') return true;
  await (await mongo()).command({ ping: 1 });
  return true;
}

// ---------- Redis ----------
async function redis(...args) {
  const res = await fetch(REDIS_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${REDIS_TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(args)
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) throw new Error(`Redis error: ${data.error || res.status}`);
  return data.result;
}

const file = (key) => path.join(DATA_DIR, `${key}.json`);

async function getJSON(key, fallback) {
  if (mode === 'mongo') {
    const doc = await (await col(KV)).findOne({ _id: key });
    if (!doc) return fallback;
    try { return JSON.parse(doc.value); } catch { return fallback; }
  }
  if (mode === 'redis') {
    const raw = await redis('GET', PREFIX + key);
    if (raw == null) return fallback;
    try { return JSON.parse(raw); } catch { return fallback; }
  }
  try { return JSON.parse(await fsp.readFile(file(key), 'utf8')); } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

async function setJSON(key, value) {
  if (mode === 'mongo') {
    await (await col(KV)).updateOne({ _id: key }, { $set: { value: JSON.stringify(value), updatedAt: new Date() } }, { upsert: true });
    return;
  }
  const text = JSON.stringify(value, null, mode === 'redis' ? 0 : 2);
  if (mode === 'redis') { await redis('SET', PREFIX + key, text); return; }
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const target = file(key);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, target); // atomic replace
}

async function del(key) {
  if (mode === 'mongo') { await (await col(KV)).deleteOne({ _id: key }); return; }
  if (mode === 'redis') { await redis('DEL', PREFIX + key); return; }
  try { await fsp.unlink(file(key)); } catch { /* not there */ }
}

// Keep the last N versions of something (used for content backups).
async function pushHistory(key, value, keep = 20) {
  const text = JSON.stringify(value);
  if (mode === 'mongo') {
    const h = await col(HISTORY);
    await h.insertOne({ key, value: text, at: new Date() });
    const old = await h.find({ key }, { projection: { _id: 1 } }).sort({ at: -1 }).skip(keep).toArray();
    if (old.length) await h.deleteMany({ _id: { $in: old.map((d) => d._id) } });
    return;
  }
  if (mode === 'redis') {
    await redis('LPUSH', PREFIX + key, text);
    await redis('LTRIM', PREFIX + key, 0, keep - 1);
    return;
  }
  const dir = path.join(DATA_DIR, key);
  await fsp.mkdir(dir, { recursive: true });
  await fsp.writeFile(path.join(dir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`), text);
  const files = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  for (const f of files.slice(0, Math.max(0, files.length - keep))) await fsp.unlink(path.join(dir, f));
}

// Redis hash helpers: one field per record, so two submissions at the same
// moment on different servers can never overwrite each other.
async function hashSet(key, field, value) { await redis('HSET', PREFIX + key, field, JSON.stringify(value)); }
async function hashGet(key, field) { const raw = await redis('HGET', PREFIX + key, field); return raw == null ? null : JSON.parse(raw); }
async function hashDel(key, field) { await redis('HDEL', PREFIX + key, field); }
async function hashAll(key) { const vals = (await redis('HVALS', PREFIX + key)) || []; return vals.map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean); }

// MongoDB record helpers: one document per booking / enquiry (_id = the record id).
const NO_ID = { projection: { _id: 0 } };
async function recordInsert(collection, row) { await (await col(collection)).insertOne({ _id: row.id, ...row }); }
async function recordAll(collection) { return (await col(collection)).find({}, NO_ID).sort({ createdAt: -1 }).toArray(); }
async function recordUpdate(collection, id, changes) {
  const c = await col(collection);
  const r = await c.updateOne({ _id: id }, { $set: changes });
  if (!r.matchedCount) return null;
  return c.findOne({ _id: id }, NO_ID);
}

module.exports = { mode, col, ping, getJSON, setJSON, del, pushHistory, hashSet, hashGet, hashAll, hashDel, recordInsert, recordAll, recordUpdate };
