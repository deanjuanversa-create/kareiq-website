// Small document store used by the KareIQ app (accounts, people, plans, readings ...).
// Works the same on all three storage modes:
//   MongoDB Atlas  one document per record (_id = id), filtered by the database
//   Redis          one hash per collection, filtered here
//   files          one JSON array per collection in /data, filtered here
// Filters support plain equality, { $in: [...] } and { $ne: value }.

const db = require('./db');
const { mutate } = require('./store');

const clone = (o) => (o == null ? o : JSON.parse(JSON.stringify(o)));

function matches(doc, filter) {
  return Object.entries(filter || {}).every(([k, v]) => {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      if ('$in' in v) return v.$in.includes(doc[k]);
      if ('$ne' in v) return doc[k] !== v.$ne;
      if ('$lt' in v) return doc[k] < v.$lt;
    }
    return doc[k] === v;
  });
}

function sortRows(rows, sort) {
  if (!sort) return rows;
  const keys = Object.entries(sort);
  return rows.sort((a, b) => {
    for (const [k, dir] of keys) {
      const x = a[k], y = b[k];
      if (x === y) continue;
      if (x === undefined || x === null) return 1;
      if (y === undefined || y === null) return -1;
      return (x < y ? -1 : 1) * dir;
    }
    return 0;
  });
}

async function all(col) {
  if (db.mode === 'redis') return db.hashAll(col);
  const rows = await db.getJSON(col, []);
  return Array.isArray(rows) ? rows : [];
}

const NO_ID = { projection: { _id: 0 } };

async function find(col, filter = {}, { sort, limit } = {}) {
  if (db.mode === 'mongo') {
    let cur = (await db.col(col)).find(filter, NO_ID);
    if (sort) cur = cur.sort(sort);
    if (limit) cur = cur.limit(limit);
    return cur.toArray();
  }
  let rows = (await all(col)).filter((d) => matches(d, filter));
  rows = sortRows(rows, sort);
  return clone(limit ? rows.slice(0, limit) : rows);
}

async function findOne(col, filter) {
  if (db.mode === 'mongo') return (await db.col(col)).findOne(filter, NO_ID);
  const d = (await all(col)).find((x) => matches(x, filter));
  return d ? clone(d) : null;
}

async function insert(col, doc) {
  if (!doc.id) throw new Error('documents need an id');
  if (db.mode === 'mongo') { await (await db.col(col)).insertOne({ _id: doc.id, ...doc }); return doc; }
  if (db.mode === 'redis') { await db.hashSet(col, doc.id, doc); return doc; }
  await mutate(col, (rows) => { rows.push(clone(doc)); });
  return doc;
}

async function update(col, id, changes) {
  if (db.mode === 'mongo') {
    const c = await db.col(col);
    const r = await c.updateOne({ _id: id }, { $set: changes });
    if (!r.matchedCount) return null;
    return c.findOne({ _id: id }, NO_ID);
  }
  if (db.mode === 'redis') {
    const row = await db.hashGet(col, id);
    if (!row) return null;
    Object.assign(row, changes);
    await db.hashSet(col, id, row);
    return row;
  }
  return mutate(col, (rows) => {
    const row = rows.find((r) => r.id === id);
    if (!row) return null;
    Object.assign(row, clone(changes));
    return clone(row);
  });
}

async function remove(col, id) {
  if (db.mode === 'mongo') { await (await db.col(col)).deleteOne({ _id: id }); return; }
  if (db.mode === 'redis') { await db.hashDel(col, id); return; }
  await mutate(col, (rows) => { const i = rows.findIndex((r) => r.id === id); if (i > -1) rows.splice(i, 1); });
}

// Remove every document matching filter (used to tidy up expired sessions).
async function removeWhere(col, filter) {
  if (db.mode === 'mongo') { await (await db.col(col)).deleteMany(filter); return; }
  if (db.mode === 'redis') { for (const d of await find(col, filter)) await remove(col, d.id); return; }
  await mutate(col, (rows) => { for (let i = rows.length - 1; i >= 0; i--) if (matches(rows[i], filter)) rows.splice(i, 1); });
}

async function count(col, filter = {}) {
  if (db.mode === 'mongo') return (await db.col(col)).countDocuments(filter);
  return (await all(col)).filter((d) => matches(d, filter)).length;
}

// Indexes for MongoDB (safe to call many times).
let indexed = false;
async function ensureIndexes() {
  if (db.mode !== 'mongo' || indexed) return;
  indexed = true;
  try {
    await (await db.col('app_users')).createIndex({ email: 1 });
    await (await db.col('app_users')).createIndex({ phone: 1 });
    await (await db.col('app_links')).createIndex({ userId: 1 });
    await (await db.col('app_links')).createIndex({ personId: 1 });
    await (await db.col('app_plans')).createIndex({ personId: 1 });
    await (await db.col('app_readings')).createIndex({ personId: 1, measuredAt: -1 });
    await (await db.col('app_audit')).createIndex({ at: -1 });
    await (await db.col('app_risks')).createIndex({ personId: 1, at: -1 });
    await (await db.col('app_records')).createIndex({ personId: 1, date: -1 });
  } catch (e) { indexed = false; console.error('[app] index setup failed:', e.message); }
}

module.exports = { find, findOne, insert, update, remove, removeWhere, count, matches, ensureIndexes };
