'use strict';
// Customer photos: when one is due, nurse reminders, and the "with Nestu" cartoon for the family Home.
//
// Photo rule: every onboarded customer with an active package should have a photo that is at most
// 6 months (182 days) old. Their assigned nurses are reminded once for each photo that falls due
// (missing, or older than 6 months): when the nurse opens the portal, and by an hourly check.
//
// Cartoon: after a nurse saves a new photo, the photo and Nestu (the KareNest mascot) are sent to an
// AI image service, which returns an animated illustration of the customer with Nestu side-hugging
// them. It is switched off until a provider is set in the environment:
//   CARTOON_PROVIDER = openai | gemini        (anything else, or unset: off)
//   OPENAI_API_KEY   (openai)  or  GEMINI_API_KEY (gemini)
//   CARTOON_MODEL    optional: default gpt-image-1.5 (openai) / gemini-3.1-flash-image (gemini)
//   CARTOON_BASE_URL optional: another endpoint with the same API (used by the tests)
// The latest cartoon is kept per person (app_files, kind "cartoon"); a new photo replaces it and removing
// the photo removes it. Failures are recorded on the person and retried (up to 3 tries per photo).
const fs = require('fs');
const path = require('path');

const PHOTO_DAYS = 182;
const DAY = 86400000;
const NESTU = path.join(__dirname, '..', '..', 'public', 'karenest', 'images', 'mascot.webp');
const PROMPT = [
  'Create a warm, friendly 3D animated illustration in a soft Pixar-like style for a senior-care app.',
  'Image 1 is a real photo of our customer, an older person. Turn them into the animated style while keeping them clearly recognisable:',
  'the same face shape, skin tone, hair, glasses (if any), expression and clothing colours. Keep their age; do not make them younger.',
  'Image 2 is Nestu, our mascot: a young cartoon girl. Keep Nestu exactly as she looks (hair, glasses, outfit, colours).',
  'Show both together from the waist up, smiling. Nestu stands beside the customer and gives them a warm, gentle side hug.',
  'Soft pastel mint and pink background with a few leaves and gentle light. Wide landscape framing with the two of them on the right half.',
  'No text, no words, no logos, no watermark.'
].join(' ');

function create(ctx) {
  const { docs, uid, now } = ctx;
  const provider = () => {
    const p = String(process.env.CARTOON_PROVIDER || '').toLowerCase();
    if (p === 'openai' && process.env.OPENAI_API_KEY) return 'openai';
    if (p === 'gemini' && process.env.GEMINI_API_KEY) return 'gemini';
    return null;
  };

  // ------------------------------------------------------------------ the 6-month photo rule
  function due(person, at) {
    const t = person && person.photoAt ? Date.parse(person.photoAt) : NaN;
    if (!t) return { due: true, reason: 'missing', dueOn: null };
    const dueOn = new Date(t + PHOTO_DAYS * DAY).toISOString().slice(0, 10);
    return { due: (at || Date.now()) - t >= PHOTO_DAYS * DAY, reason: 'old', dueOn, takenAt: person.photoAt };
  }
  // the customers whose photos this nurse looks after: assigned, onboarded, package active or paused
  async function customersOf(nurseId) {
    const links = await docs.find('app_links', { userId: nurseId, kind: 'caregiver' });
    const out = [];
    for (const l of links) {
      const person = await docs.findOne('app_people', { id: l.personId });
      if (!person || person.active === false) continue;
      if (!(await docs.findOne('app_onboarding', { id: 'onb-' + person.id }))) continue;
      const plans = await docs.find('app_plans', { personId: person.id });
      if (!plans.some((p) => p.status === 'active' || p.status === 'paused')) continue;
      out.push(person);
    }
    return out;
  }
  // one reminder per nurse, per customer, per photo that fell due ("none" while there is no photo)
  async function remind(nurseId) {
    let sent = 0;
    for (const person of await customersOf(nurseId)) {
      const d = due(person);
      if (!d.due) continue;
      const key = person.id + '|' + (person.photoAt || 'none');
      if (await docs.findOne('app_notifications', { userId: nurseId, kind: 'photo-due', photoKey: key })) continue;
      await ctx.scheduler.notify([nurseId], {
        kind: 'photo-due', photoKey: key, personId: person.id,
        title: d.reason === 'missing' ? 'Customer photo needed' : 'Time for a new photo',
        body: d.reason === 'missing' ? `${person.name} has no photo yet. Take one at your next visit.` : `${person.name}'s photo is more than 6 months old. Take a new one at your next visit.`,
        link: '#/nurse/customer?p=' + encodeURIComponent(person.id)
      });
      sent++;
    }
    return sent;
  }
  async function remindAll() {
    const nurses = await docs.find('app_users', { role: 'caregiver', active: true });
    let sent = 0;
    for (const n of nurses) sent += await remind(n.id);
    return sent;
  }

  // ------------------------------------------------------------------ the cartoon with Nestu
  const running = new Set();
  function view(person) {
    const prov = provider();
    if (!person) return { status: 'none' };
    if (person.cartoonId && person.cartoonFor === person.photoId) return { status: 'ready', at: person.cartoonAt };
    if (!person.photoId) return { status: 'none' };
    if (!prov) return { status: 'off' };
    return { status: person.cartoonStatus === 'failed' ? 'failed' : 'pending' };
  }
  // called after a new photo is saved; runs in the background (the nurse does not wait for it)
  async function afterPhoto(personId) {
    const person = await docs.findOne('app_people', { id: personId });
    if (!person) return;
    // the old cartoon showed the old photo
    if (person.cartoonId) await docs.remove('app_files', person.cartoonId);
    await docs.update('app_people', personId, { cartoonId: null, cartoonAt: null, cartoonFor: null, cartoonStatus: provider() ? 'pending' : 'off', cartoonTries: 0, cartoonError: null });
    if (provider()) setImmediate(() => { make(personId).catch((e) => console.error('[cartoon]', e.message)); });
  }
  async function afterRemove(personId) {
    const person = await docs.findOne('app_people', { id: personId });
    if (person && person.cartoonId) await docs.remove('app_files', person.cartoonId);
    await docs.update('app_people', personId, { cartoonId: null, cartoonAt: null, cartoonFor: null, cartoonStatus: null, cartoonTries: 0, cartoonError: null });
  }
  async function make(personId) {
    if (running.has(personId)) return { ok: false, busy: true };
    running.add(personId);
    try {
      const prov = provider();
      const person = await docs.findOne('app_people', { id: personId });
      if (!prov || !person || !person.photoId) return { ok: false };
      const photo = await docs.findOne('app_files', { id: person.photoId });
      if (!photo) return { ok: false };
      const forPhoto = person.photoId, tries = (person.cartoonTries || 0) + 1;
      await docs.update('app_people', personId, { cartoonStatus: 'pending', cartoonTries: tries });
      let out;
      try {
        out = await (prov === 'openai' ? openai : gemini)(Buffer.from(photo.data, 'base64'), photo.mime || 'image/jpeg', fs.readFileSync(NESTU));
      } catch (e) {
        await docs.update('app_people', personId, { cartoonStatus: 'failed', cartoonError: String(e.message || e).slice(0, 300) });
        console.error('[cartoon] ' + personId + ':', e.message);
        return { ok: false, error: e.message };
      }
      // a newer photo may have been saved while this one was being drawn
      const now2 = await docs.findOne('app_people', { id: personId });
      if (!now2 || now2.photoId !== forPhoto) return { ok: false, stale: true };
      const fileId = uid(), at = now();
      await docs.insert('app_files', { id: fileId, personId, kind: 'cartoon', mime: out.mime, data: out.buf.toString('base64'), provider: prov, createdAt: at });
      if (now2.cartoonId) await docs.remove('app_files', now2.cartoonId);
      await docs.update('app_people', personId, { cartoonId: fileId, cartoonAt: at, cartoonFor: forPhoto, cartoonStatus: 'ready', cartoonError: null });
      if (ctx.audit) await ctx.audit('system', 'cartoon.made', personId, { provider: prov });
      return { ok: true };
    } finally { running.delete(personId); }
  }
  // after a restart (or a failure): finish what is waiting, up to 3 tries per photo
  async function resume() {
    if (!provider()) return 0;
    const rows = (await docs.find('app_people', {})).filter((p) => p.photoId && p.cartoonFor !== p.photoId && (p.cartoonStatus === 'pending' || p.cartoonStatus === 'failed') && (p.cartoonTries || 0) < 3);
    for (const p of rows) await make(p.id).catch(() => null);
    return rows.length;
  }

  // ------------------------------------------------------------------ providers
  const timeout = (ms) => { const c = new AbortController(); setTimeout(() => c.abort(), ms).unref(); return c.signal; };
  async function openai(photo, mime, nestu) {
    const base = (process.env.CARTOON_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');
    const form = new FormData();
    form.append('model', process.env.CARTOON_MODEL || 'gpt-image-1.5');
    form.append('image[]', new Blob([photo], { type: mime }), 'customer.' + (mime.split('/')[1] || 'jpg'));
    form.append('image[]', new Blob([nestu], { type: 'image/webp' }), 'nestu.webp');
    form.append('prompt', PROMPT);
    form.append('size', '1536x1024');
    form.append('input_fidelity', 'high');
    form.append('output_format', 'webp');
    form.append('n', '1');
    const r = await fetch(base + '/images/edits', { method: 'POST', headers: { Authorization: 'Bearer ' + process.env.OPENAI_API_KEY }, body: form, signal: timeout(180000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('OpenAI ' + r.status + ': ' + ((j.error && j.error.message) || 'request failed'));
    const b64 = j.data && j.data[0] && j.data[0].b64_json;
    if (!b64) throw new Error('OpenAI returned no image');
    return { buf: Buffer.from(b64, 'base64'), mime: 'image/webp' };
  }
  async function gemini(photo, mime, nestu) {
    const base = (process.env.CARTOON_BASE_URL || 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
    const model = process.env.CARTOON_MODEL || 'gemini-3.1-flash-image';
    const body = {
      contents: [{ role: 'user', parts: [
        { text: PROMPT },
        { inlineData: { mimeType: mime, data: photo.toString('base64') } },
        { inlineData: { mimeType: 'image/webp', data: nestu.toString('base64') } }
      ] }],
      generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: '3:2' } }
    };
    const r = await fetch(base + '/models/' + encodeURIComponent(model) + ':generateContent', { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': process.env.GEMINI_API_KEY }, body: JSON.stringify(body), signal: timeout(180000) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error('Gemini ' + r.status + ': ' + ((j.error && j.error.message) || 'request failed'));
    const parts = (((j.candidates || [])[0] || {}).content || {}).parts || [];
    const img = parts.map((p) => p.inlineData || p.inline_data).find((x) => x && x.data);
    if (!img) throw new Error('Gemini returned no image');
    return { buf: Buffer.from(img.data, 'base64'), mime: img.mimeType || img.mime_type || 'image/png' };
  }

  return { PHOTO_DAYS, due, remind, remindAll, view, afterPhoto, afterRemove, make, resume, provider };
}

module.exports = { create, PHOTO_DAYS, PROMPT };
