#!/usr/bin/env node
// Customer photos: the 6-month rule, nurse reminders, the camera upload and the "with Nestu" cartoon.
// Part 1 runs on its own: the photo module with an in-memory store, and the cartoon request sent to
// local stand-ins for the OpenAI and Gemini image APIs (no real key, nothing leaves this machine).
// Part 2 needs a running demo server (fresh data folder):
//   APP_DEMO=true node server.js, then:   node tools/check-photos.js http://localhost:3000
const http = require('http');
const path = require('path');

const URL0 = process.argv[2] || 'http://localhost:3000';
const BASE = URL0.replace(/\/$/, '') + '/api/app/';
let pass = 0, fail = 0;
const ok = (c, msg) => { if (c) { pass++; console.log('PASS ', msg); } else { fail++; console.log('FAIL ', msg); } };
const DAY = 86400000;
// a real 1x1 JPEG and PNG (the server checks file contents)
const JPEG = Buffer.from('/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////2wBDAf//////////////////////////////////////////////////////////////////////////////////////wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAP/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/AKAP/9k=', 'base64');
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

// ------------------------------------------------------------------ an in-memory store like src/db.js
function memDocs() {
  const t = {};
  const col = (n) => (t[n] = t[n] || []);
  const match = (row, f) => Object.entries(f || {}).every(([k, v]) => (v && typeof v === 'object' && v.$in ? v.$in.includes(row[k]) : row[k] === v));
  return {
    t,
    find: async (n, f) => col(n).filter((r) => match(r, f)).map((r) => ({ ...r })),
    findOne: async (n, f) => { const r = col(n).find((x) => match(x, f)); return r ? { ...r } : null; },
    insert: async (n, row) => { col(n).push({ ...row }); return row; },
    update: async (n, id, ch) => { const r = col(n).find((x) => x.id === id); if (r) Object.assign(r, ch); return r; },
    remove: async (n, id) => { t[n] = col(n).filter((x) => x.id !== id); }
  };
}
let seq = 0;
function moduleWith(env) {
  for (const k of ['CARTOON_PROVIDER', 'OPENAI_API_KEY', 'GEMINI_API_KEY', 'CARTOON_BASE_URL', 'CARTOON_MODEL']) delete process.env[k];
  Object.assign(process.env, env || {});
  const docs = memDocs(), notes = [];
  const ctx = { docs, uid: () => 'id' + (++seq), now: () => new Date().toISOString(), audit: async () => {}, scheduler: { notify: async (ids, n) => { for (const u of ids) { notes.push({ userId: u, ...n }); await docs.insert('app_notifications', { id: 'n' + (++seq), userId: u, ...n }); } } } };
  return { photos: require('../src/app/photos').create(ctx), docs, notes };
}
// a stand-in for the AI image APIs: records what was sent, answers like the real one
function mockServer(handler) {
  return new Promise((resolve) => {
    const seen = [];
    const srv = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (c) => chunks.push(c));
      req.on('end', () => { const body = Buffer.concat(chunks); seen.push({ url: req.url, headers: req.headers, body }); handler(req, res, body, seen.length); });
    });
    srv.listen(0, '127.0.0.1', () => resolve({ srv, seen, url: 'http://127.0.0.1:' + srv.address().port }));
  });
}
const wait = async (fn, ms = 4000) => { const end = Date.now() + ms; while (Date.now() < end) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 40)); } return false; };

async function part1() {
  // ---------------------------------------------------------------- the 6-month rule
  let { photos, docs, notes } = moduleWith({});
  const now = Date.now();
  ok(photos.due({}).due && photos.due({}).reason === 'missing', 'no photo: due');
  ok(!photos.due({ photoAt: new Date(now - 30 * DAY).toISOString() }).due, '1 month old: not due');
  ok(!photos.due({ photoAt: new Date(now - 181 * DAY).toISOString() }).due, '181 days old: not due yet');
  ok(photos.due({ photoAt: new Date(now - 182 * DAY).toISOString() }).due, '182 days (6 months) old: due');
  ok(photos.due({ photoAt: '2026-01-10T06:00:00.000Z' }).dueOn === '2026-07-11', 'next due date = photo date + 182 days');

  // ---------------------------------------------------------------- reminders: once per photo that falls due
  await docs.insert('app_people', { id: 'P1', name: 'Asha', active: true });                       // onboarded, no photo
  await docs.insert('app_people', { id: 'P2', name: 'Biju', active: true, photoAt: new Date(now - 200 * DAY).toISOString() }); // onboarded, old photo
  await docs.insert('app_people', { id: 'P3', name: 'Chitra', active: true, photoAt: new Date(now - 10 * DAY).toISOString() }); // recent photo
  await docs.insert('app_people', { id: 'P4', name: 'Devi', active: true });                       // not onboarded yet
  await docs.insert('app_people', { id: 'P5', name: 'Eapen', active: true });                      // onboarded, package ended
  for (const id of ['P1', 'P2', 'P3', 'P4', 'P5']) await docs.insert('app_links', { id: 'l' + id, userId: 'N1', personId: id, kind: 'caregiver' });
  for (const id of ['P1', 'P2', 'P3', 'P5']) await docs.insert('app_onboarding', { id: 'onb-' + id, personId: id });
  for (const id of ['P1', 'P2', 'P3', 'P4']) await docs.insert('app_plans', { id: 'pl' + id, personId: id, status: 'active' });
  await docs.insert('app_plans', { id: 'plP5', personId: 'P5', status: 'expired' });
  await docs.insert('app_users', { id: 'N1', role: 'caregiver', active: true });
  let sent = await photos.remind('N1');
  ok(sent === 2 && notes.some((n) => n.personId === 'P1' && n.title === 'Customer photo needed') && notes.some((n) => n.personId === 'P2' && n.title === 'Time for a new photo'), 'nurse reminded for the missing photo and the 6-month-old photo (2)');
  ok(!notes.some((n) => ['P3', 'P4', 'P5'].includes(n.personId)), 'no reminder for a recent photo, a customer not onboarded, or an ended package');
  ok(notes.every((n) => n.kind === 'photo-due' && n.link === '#/nurse/customer?p=' + n.personId), 'the reminder opens that customer\'s page');
  sent = await photos.remind('N1');
  ok(sent === 0, 'reminders are not repeated (checked again: 0 new)');
  await docs.update('app_people', 'P2', { photoAt: new Date(now).toISOString() });
  ok(await photos.remind('N1') === 0, 'after a new photo there is nothing to remind');
  await docs.update('app_people', 'P2', { photoAt: new Date(now - 190 * DAY).toISOString() });
  ok(await photos.remind('N1') === 1, '6 months after that photo, a new reminder');
  ok(await photos.remindAll() === 0, 'hourly check for all nurses: nothing new');

  // ---------------------------------------------------------------- the cartoon: off by default
  ok(photos.provider() === null && photos.view({ id: 'P9', photoId: 'f1' }).status === 'off', 'no provider set: cartoon switched off');
  ok(photos.view({ id: 'P9' }).status === 'none', 'no photo: no cartoon');

  // ---------------------------------------------------------------- OpenAI image edits
  const oa = await mockServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [{ b64_json: PNG.toString('base64') }] })); });
  ({ photos, docs } = moduleWith({ CARTOON_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', CARTOON_BASE_URL: oa.url + '/v1' }));
  await docs.insert('app_files', { id: 'F1', personId: 'P1', kind: 'photo', mime: 'image/jpeg', data: JPEG.toString('base64') });
  await docs.insert('app_people', { id: 'P1', name: 'Asha', photoId: 'F1', photoAt: new Date().toISOString() });
  await photos.afterPhoto('P1');
  ok(await wait(async () => (await docs.findOne('app_people', { id: 'P1' })).cartoonStatus === 'ready'), 'OpenAI: cartoon made in the background after the photo');
  const q = oa.seen[0], text = q ? q.body.toString('latin1') : '';
  ok(q && q.url === '/v1/images/edits' && q.headers.authorization === 'Bearer sk-test', 'OpenAI: POST /v1/images/edits with the key');
  ok((text.match(/name="image\[\]"/g) || []).length === 2 && /filename="nestu\.webp"/.test(text) && /filename="customer\.jpeg"/.test(text), 'OpenAI: sends the customer photo and Nestu as two images');
  ok(/side hug/.test(text) && /recognisable/.test(text) && /No text/.test(text), 'OpenAI: the prompt asks for the customer, recognisable, side-hugged by Nestu, no text');
  ok(/name="model"\r\n\r\ngpt-image-1\.5/.test(text) && /1536x1024/.test(text), 'OpenAI: default model and a landscape size');
  let p1 = await docs.findOne('app_people', { id: 'P1' });
  const cf = await docs.findOne('app_files', { id: p1.cartoonId });
  ok(cf && cf.kind === 'cartoon' && cf.personId === 'P1' && Buffer.from(cf.data, 'base64').equals(PNG) && p1.cartoonFor === 'F1', 'the returned image is stored for this person and this photo');
  ok(photos.view(p1).status === 'ready', 'Home sees it as ready');
  // a new photo replaces the cartoon; removing the photo removes it
  await docs.insert('app_files', { id: 'F2', personId: 'P1', kind: 'photo', mime: 'image/jpeg', data: JPEG.toString('base64') });
  await docs.update('app_people', 'P1', { photoId: 'F2' });
  ok(photos.view(await docs.findOne('app_people', { id: 'P1' })).status === 'ready' === false, 'a new photo: the old cartoon no longer counts');
  await photos.afterPhoto('P1');
  ok(!(await docs.findOne('app_files', { id: cf.id })), 'a new photo deletes the old cartoon');
  ok(await wait(async () => (await docs.findOne('app_people', { id: 'P1' })).cartoonFor === 'F2'), 'and a new cartoon is made from the new photo');
  p1 = await docs.findOne('app_people', { id: 'P1' });
  await photos.afterRemove('P1');
  ok(!(await docs.findOne('app_files', { id: p1.cartoonId })) && !(await docs.findOne('app_people', { id: 'P1' })).cartoonId, 'removing the photo removes the cartoon');
  oa.srv.close();

  // ---------------------------------------------------------------- failures are recorded and retried
  const bad = await mockServer((req, res, body, n) => {
    if (n === 1) { res.writeHead(400, { 'Content-Type': 'application/json' }); return res.end(JSON.stringify({ error: { message: 'Your request was rejected by the safety system.' } })); }
    res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ data: [{ b64_json: PNG.toString('base64') }] }));
  });
  ({ photos, docs } = moduleWith({ CARTOON_PROVIDER: 'openai', OPENAI_API_KEY: 'sk-test', CARTOON_BASE_URL: bad.url }));
  await docs.insert('app_files', { id: 'F3', personId: 'P3', kind: 'photo', mime: 'image/jpeg', data: JPEG.toString('base64') });
  await docs.insert('app_people', { id: 'P3', name: 'Chitra', photoId: 'F3' });
  await photos.afterPhoto('P3');
  ok(await wait(async () => (await docs.findOne('app_people', { id: 'P3' })).cartoonStatus === 'failed'), 'a refused request is recorded as failed');
  let p3 = await docs.findOne('app_people', { id: 'P3' });
  ok(/OpenAI 400: .*safety/.test(p3.cartoonError) && photos.view(p3).status === 'failed', 'with the reason, and Home keeps the default picture');
  ok(await photos.resume() === 1 && (await docs.findOne('app_people', { id: 'P3' })).cartoonStatus === 'ready', 'the hourly check tries again and succeeds');
  await docs.update('app_people', 'P3', { cartoonStatus: 'failed', cartoonFor: null, cartoonTries: 3 });
  ok(await photos.resume() === 0, 'no more than 3 tries per photo');
  bad.srv.close();

  // ---------------------------------------------------------------- Gemini
  const gm = await mockServer((req, res) => { res.writeHead(200, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'Here it is' }, { inlineData: { mimeType: 'image/png', data: PNG.toString('base64') } }] } }] })); });
  ({ photos, docs } = moduleWith({ CARTOON_PROVIDER: 'gemini', GEMINI_API_KEY: 'g-test', CARTOON_BASE_URL: gm.url + '/v1beta' }));
  await docs.insert('app_files', { id: 'F4', personId: 'P4', kind: 'photo', mime: 'image/jpeg', data: JPEG.toString('base64') });
  await docs.insert('app_people', { id: 'P4', name: 'Devi', photoId: 'F4' });
  const r = await photos.make('P4');
  const g = gm.seen[0], gj = g ? JSON.parse(g.body.toString()) : {};
  ok(r.ok && (await docs.findOne('app_people', { id: 'P4' })).cartoonStatus === 'ready', 'Gemini: cartoon made and stored');
  ok(g && g.url === '/v1beta/models/gemini-3.1-flash-image:generateContent' && g.headers['x-goog-api-key'] === 'g-test', 'Gemini: generateContent on the default image model, key in the header');
  const parts = gj.contents[0].parts;
  ok(parts.length === 3 && /side hug/.test(parts[0].text) && parts[1].inlineData.mimeType === 'image/jpeg' && parts[2].inlineData.mimeType === 'image/webp', 'Gemini: the prompt, the customer photo and Nestu');
  ok(gj.generationConfig.responseModalities[0] === 'IMAGE' && gj.generationConfig.imageConfig.aspectRatio === '3:2', 'Gemini: asks for an image, landscape');
  gm.srv.close();
  ({ photos } = moduleWith({ CARTOON_PROVIDER: 'gemini' }));
  ok(photos.provider() === null, 'a provider without its key stays off');
  moduleWith({});
}

// ------------------------------------------------------------------ part 2: the running server
async function login(id) {
  let cookie = '', csrf = '';
  const call = async (method, p, body, raw) => {
    const h = { 'X-Requested-With': 'kareiq', cookie };
    if (csrf) h['X-CSRF'] = csrf;
    if (body && !raw) h['Content-Type'] = 'application/json';
    if (raw) h['Content-Type'] = raw;
    const r = await fetch(BASE + p, { method, headers: h, body: body ? (raw ? body : JSON.stringify(body)) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; }
    return { status: r.status, body: j, text: t };
  };
  const r = await call('POST', 'login', { id, password: 'demo-pass-123' });
  if (r.status !== 200) throw new Error('login failed for ' + id);
  csrf = (await call('GET', 'session')).body.csrf;
  return call;
}
async function part2() {
  try { await fetch(BASE + 'session'); } catch (e) { console.log('(part 2 skipped: no server at ' + URL0 + ')'); return; }
  const nurse = await login('nurse@demo.kareiq'), fam = await login('family@demo.kareiq'), nest = await login('nest@demo.kareiq');
  const P = 'P-DEMO01';
  // before onboarding there is no reminder; onboarding the customer makes a photo due
  let r = await nurse('GET', 'nurse/customers');
  ok(r.status === 200 && r.body.rows.find((x) => x.id === P).photoDue === false, 'not onboarded yet: no "photo due" flag');
  r = await nurse('POST', 'people/' + P + '/onboarding', { confirm: true, data: { name: 'Lakshmi Nair' } });
  ok(r.status === 201, 'nurse onboards the customer (201)');
  r = await nurse('GET', 'people/' + P + '/onboarding');
  ok(r.body.photoDue && r.body.photoDue.due && r.body.photoDue.reason === 'missing' && r.body.person.photo === null, 'onboarding page: photo needed');
  r = await nurse('GET', 'nurse/customers');
  ok(r.body.rows.find((x) => x.id === P).photoDue === true, 'Assigned customers flags "Photo needed"');
  r = await nurse('GET', 'notifications');
  const notes = r.body.rows.filter((n) => n.kind === 'photo-due' && n.personId === P);
  ok(notes.length === 1 && notes[0].title === 'Customer photo needed' && notes[0].link === '#/nurse/customer?p=' + P, 'the nurse gets one reminder that opens the customer');
  r = await nurse('GET', 'nurse/customers'); r = await nurse('GET', 'notifications');
  ok(r.body.rows.filter((n) => n.kind === 'photo-due' && n.personId === P).length === 1, 'opening the portal again does not repeat it');
  // the camera saves a JPEG
  r = await nurse('POST', 'people/' + P + '/photo', JPEG, 'image/jpeg');
  ok(r.status === 201 && r.body.photo && /^\d{4}-\d{2}-\d{2}$/.test(r.body.next), 'nurse saves the camera photo (201), next one due ' + r.body.next);
  const days = Math.round((Date.parse(r.body.next) - Date.parse(r.body.photo.slice(0, 10))) / DAY);
  ok(days === 182, 'the next photo is due in 6 months (182 days)');
  r = await nurse('GET', 'nurse/customers');
  ok(r.body.rows.find((x) => x.id === P).photoDue === false, 'with a fresh photo the flag goes away');
  r = await nurse('GET', 'nurse/customers/' + P);
  ok(r.body.customer.photoDue && r.body.customer.photoDue.due === false && r.body.customer.photoDue.dueOn, 'customer page shows the next due date');
  r = await nurse('POST', 'people/' + P + '/photo', Buffer.from('not an image'), 'image/jpeg');
  ok(r.status === 415, 'something that is not a photo is refused (415)');
  r = await nest('POST', 'people/' + P + '/photo', JPEG, 'image/jpeg');
  ok([403, 404].includes(r.status), 'a nurse not assigned to the customer cannot change the photo');
  r = await fam('POST', 'people/' + P + '/photo', JPEG, 'image/jpeg');
  ok(r.status === 403, 'families see the photo but do not take it (403)');
  // the cartoon for Home
  r = await fam('GET', 'people/' + P + '/care');
  const cz = r.body.cartoon;
  ok(r.body.photo === true && ['off', 'pending', 'ready', 'failed'].includes(cz.status), 'Home knows a photo exists; cartoon status: ' + cz.status);
  if (cz.status === 'off') {
    r = await fam('GET', 'people/' + P + '/cartoon');
    ok(r.status === 404, 'no AI provider set: no cartoon (404), Home keeps the default picture');
  }
  r = await fam('GET', 'people/P-DEMO04/cartoon');
  ok(r.status === 404, 'a family cannot open another customer\'s cartoon');
  r = await fam('GET', 'people/' + P + '/photo');
  ok(r.status === 200, 'the family sees the photo');
}

(async () => {
  await part1();
  await part2();
  console.log(`\ncheck-photos: PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
