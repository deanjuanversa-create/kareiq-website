// Storage for bookings, enquiries and website content.
//
// - On your own computer / a normal server: JSON files in the /data folder.
// - On Vercel (or anywhere) with Upstash Redis connected: Redis. Vercel's
//   Upstash integration sets KV_REST_API_URL + KV_REST_API_TOKEN; adding
//   UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN yourself works too.
// - On Vercel WITHOUT Redis: a temporary folder that Vercel wipes regularly.
//   The admin page shows a warning in that case.

const fsp = require('fs/promises');
const path = require('path');

const REDIS_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL || '';
const REDIS_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN || '';
const PREFIX = process.env.KV_PREFIX || 'kareiq:';

const mode = REDIS_URL && REDIS_TOKEN ? 'redis' : process.env.VERCEL ? 'temporary' : 'file';
const DATA_DIR = mode === 'temporary' ? path.join('/tmp', 'kareiq-data') : path.join(__dirname, '..', 'data');

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
  const text = JSON.stringify(value, null, mode === 'redis' ? 0 : 2);
  if (mode === 'redis') { await redis('SET', PREFIX + key, text); return; }
  await fsp.mkdir(DATA_DIR, { recursive: true });
  const target = file(key);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fsp.writeFile(tmp, text, 'utf8');
  await fsp.rename(tmp, target); // atomic replace
}

async function del(key) {
  if (mode === 'redis') { await redis('DEL', PREFIX + key); return; }
  try { await fsp.unlink(file(key)); } catch { /* not there */ }
}

// Keep the last N versions of something (used for content backups).
async function pushHistory(key, value, keep = 20) {
  const text = JSON.stringify(value);
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
async function hashAll(key) { const vals = (await redis('HVALS', PREFIX + key)) || []; return vals.map((v) => { try { return JSON.parse(v); } catch { return null; } }).filter(Boolean); }

module.exports = { mode, getJSON, setJSON, del, pushHistory, hashSet, hashGet, hashAll };
