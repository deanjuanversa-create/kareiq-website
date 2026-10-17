// Bookings and enquiries.
// Files mode: one JSON array per collection in /data, writes queued so two
// submissions at the same moment never corrupt a file.
// Redis mode (Vercel): one hash per collection, one field per record.

const crypto = require('crypto');
const db = require('./db');

const queues = {};
const byNewest = (a, b) => (a.createdAt < b.createdAt ? 1 : a.createdAt > b.createdAt ? -1 : 0);

async function readAll(collection) {
  if (db.mode === 'redis') return (await db.hashAll(collection)).sort(byNewest);
  const rows = await db.getJSON(collection, []);
  return Array.isArray(rows) ? rows : [];
}

// Run fn(rows) -> result, one at a time per collection (file mode).
function mutate(collection, fn) {
  const prev = queues[collection] || Promise.resolve();
  const next = prev.catch(() => {}).then(async () => {
    const rows = await readAll(collection);
    const result = await fn(rows);
    await db.setJSON(collection, rows);
    return result;
  });
  queues[collection] = next;
  return next;
}

function makeReference(prefix) {
  // e.g. KH-7F3K2Q: short, readable over the phone (no 0/O, 1/I)
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let ref = '';
  for (const b of bytes) ref += alphabet[b % alphabet.length];
  return `${prefix}-${ref}`;
}

async function add(collection, prefix, record) {
  const row = {
    id: crypto.randomUUID(),
    reference: makeReference(prefix),
    status: 'new',
    createdAt: new Date().toISOString(),
    ...record
  };
  if (db.mode === 'redis') { await db.hashSet(collection, row.id, row); return row; }
  return mutate(collection, (rows) => { rows.unshift(row); return row; });
}

async function update(collection, id, changes) {
  if (db.mode === 'redis') {
    const row = await db.hashGet(collection, id);
    if (!row) return null;
    Object.assign(row, changes, { updatedAt: new Date().toISOString() });
    await db.hashSet(collection, id, row);
    return row;
  }
  return mutate(collection, (rows) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, changes, { updatedAt: new Date().toISOString() });
    return row;
  });
}

module.exports = { readAll, add, update };
