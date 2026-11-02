// Editable website content: contact details, headlines and Kare@Home pricing.
// Saved to data/content.json by the admin page. Defaults below are used until
// the first save, and to fill any field missing from an older saved file.

const db = require('./db');
// KareNest, KareBalance and KareMind packages (names, wording and starting prices)
const NEST = require('../tools/karenest/data');

const KEY = 'content';
const KEEP_HISTORY = 20;
const CACHE_MS = 15000; // other servers (e.g. Vercel instances) pick up edits within 15 s

const COMMON = [
  'Access to medical health records and prescriptions',
  'AI-driven insights to prevent health issues',
  'Ongoing monitoring of vitals: BP, blood sugar etc.'
];

const DEFAULTS = {
  contact: {
    phone: '+918129345178',
    phoneDisplay: '+91 81293 45178',
    whatsapp: '918129345178',
    // every "WhatsApp" button on the websites and in the app opens this community link
    whatsappGroup: 'https://chat.whatsapp.com/GAl7KV4ZxtY5FzKHkRZgyM',
    email: 'support@kareiq.co.in',
    instagram: 'ikareiq'
  },
  kareiq: {
    heroTitle: 'A better way to care for the people who',
    heroHighlight: 'cared for us.',
    heroLead: 'KareIQ is building a connected eldercare ecosystem that supports older adults at home and in community, with dignity, wellbeing and connection.'
  },
  karehome: {
    heroLine1: 'Compassionate care.',
    heroLine2: 'Right where you are.',
    heroLead: 'Kare@Home brings trusted, preventive healthcare and everyday support to your doorstep, helping seniors live healthier, safer and more independently, from the comfort of home.'
  },
  pricing: {
    annualNote: 'All our packages are designed for annual duration. Choose the payment plan that works best for you.',
    gstNote: 'Inclusive of all',
    savings: { 1: 0, 3: 0, 6: 0, 12: 0 }, // no discounts are shown (30 Oct 2026)
    packages: [
      {
        key: 'homestart', name: 'HomeStart', mrp: 4499, offer: true, popular: false,
        prices: { 1: [4499, 4499], 3: [4139, 12419], 6: [4049, 24299], 12: [3958, 47499] },
        includes: [
          'Weekly home visit by a nurse',
          '4 free physiotherapy or bystander services per year',
          'Hospitalisation insurance coverage for up to 180 days each year, with a benefit of ₹1,000 per day',
          ...COMMON
        ]
      },
      {
        key: 'homeplus', name: 'HomePlus', mrp: 6499, offer: true, popular: true,
        prices: { 1: [6499, 6499], 3: [5979, 17939], 6: [5833, 34999], 12: [5719, 68629] },
        includes: [
          '3 home visits a week by a nurse',
          '6 free physiotherapy or bystander services per year',
          'Hospitalisation insurance coverage for up to 180 days each year, with a benefit of ₹2,000 per day',
          'Pause option available for up to 2 weeks per year',
          ...COMMON,
          'All other benefits included in the HomeStart package'
        ]
      },
      {
        key: 'homeelite', name: 'HomeElite', mrp: 11999, offer: true, popular: false,
        prices: { 1: [11999, 11999], 3: [11039, 33119], 6: [10798, 64789], 12: [10558, 126699] },
        includes: [
          'Daily home visit by a nurse',
          '8 free physiotherapy or bystander services per year',
          'Hospitalisation insurance coverage for up to 180 days each year, with a benefit of ₹3,000 per day',
          'Pause option available for up to 4 weeks per year',
          ...COMMON,
          'All other benefits included in the HomePlus package'
        ]
      }
    ],
    customized: {
      lead: 'Need a tailored plan?',
      text: "Call us and we'll help create the perfect care package for you."
    }
  },
  // KareNest website and app: one price per package (GST included). Monthly packages
  // (KarePlus, KarePremium, Thrive) can be paid for 1, 3, 6 or 12 months with these savings.
  nest: {
    prices: Object.fromEntries(NEST.packages.map((p) => [p.id, p.price])),
    savings: { 1: 0, 3: 0, 6: 0, 12: 0 } // no discounts on KareNest packages (30 Oct 2026)
  }
};
const NEST_IDS = NEST.packages.map((p) => p.id);

const PLANS = ['1', '3', '6', '12'];
const PACKAGE_KEYS = DEFAULTS.pricing.packages.map((p) => p.key);

// billed totals (3, 6, 12 months) published until 2 Nov 2026
const OLD_KH = { homestart: [7159, 13999, 27499], homeplus: [13759, 26999, 52899], homeelite: [27549, 53999, 105799] };

let cache = null;

function clone(o) { return JSON.parse(JSON.stringify(o)); }

// Deep-merge saved values over defaults so new fields always exist.
function merge(base, over) {
  if (Array.isArray(base)) return Array.isArray(over) ? over : base;
  if (base && typeof base === 'object') {
    const out = {};
    for (const k of Object.keys(base)) out[k] = over && k in over ? merge(base[k], over[k]) : clone(base[k]);
    return out;
  }
  return over === undefined || over === null ? base : over;
}

let cachedAt = 0;

function fromSaved(saved) {
  if (!saved) return clone(DEFAULTS);
  const c = merge(DEFAULTS, saved);
  // prices are now shown inclusive of all GST: replace the old default note if it was never changed
  if (c.contact && c.contact.instagram === 'kareiq') c.contact.instagram = 'ikareiq'; // the KareIQ account is @ikareiq
  if (c.pricing && /^All prices are (ex|in)clusive of (all )?GST\.?$/i.test(c.pricing.gstNote || '')) c.pricing.gstNote = DEFAULTS.pricing.gstNote; // 30 Oct: "Inclusive of all"
  // KareBalance prices approved on 30 Oct and 2 Nov 2026 replace the old published ones if they were never changed
  const OLD_KB = { 'kb-base': [7999], 'kb-plus': [39999, 44999], 'kb-premium': [90000, 99000] };
  if (c.nest && c.nest.prices) for (const id of Object.keys(OLD_KB)) if (OLD_KB[id].includes(Number(c.nest.prices[id]))) c.nest.prices[id] = DEFAULTS.nest.prices[id];
  // packages are matched by key so a saved copy can never drop or rename one
  c.pricing.packages = PACKAGE_KEYS.map((key) => {
    const def = DEFAULTS.pricing.packages.find((p) => p.key === key);
    const s = (saved.pricing && Array.isArray(saved.pricing.packages) && saved.pricing.packages.find((p) => p && p.key === key)) || {};
    const p = merge(def, s);
    // Kare@Home prices approved on 2 Nov 2026 replace the old published ones if they were never changed
    const old = OLD_KH[key], tot = (m) => p.prices && p.prices[m] && Number(p.prices[m][1]);
    if (old && tot(3) === old[0] && tot(6) === old[1] && tot(12) === old[2]) { p.prices = clone(def.prices); p.mrp = def.mrp; }
    return p;
  });
  // 30 Oct 2026: no discounts on Kare@Home or KareNest packages: no payment-plan savings (KareNest
  // monthly packages cost the monthly price for every month) and no add-on discount lines
  c.pricing.savings = clone(DEFAULTS.pricing.savings);
  c.nest.savings = clone(DEFAULTS.nest.savings);
  c.pricing.packages.forEach((p) => { p.includes = (p.includes || []).filter((line) => !/discount on (all )?add-on/i.test(line)); });
  c.updatedAt = saved.updatedAt || null;
  return c;
}

async function get() {
  if (cache && Date.now() - cachedAt < CACHE_MS) return cache;
  try {
    cache = fromSaved(await db.getJSON(KEY, null));
  } catch (err) {
    console.error('[content] could not load saved content, using defaults:', err.message);
    if (!cache) cache = clone(DEFAULTS);
  }
  cachedAt = Date.now();
  return cache;
}

// ---------- validation ----------
const str = (v, max) => (typeof v === 'string' ? v.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, max) : '');
const int = (v) => (Number.isFinite(+v) && +v >= 0 && +v <= 10000000 ? Math.round(+v) : NaN);

function validate(input) {
  const errors = [];
  const c = merge(DEFAULTS, input || {});
  const out = clone(DEFAULTS);

  // contact
  const digits = String(c.contact.phone || '').replace(/\D/g, '');
  const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2) : digits;
  if (!/^[6-9]\d{9}$/.test(local)) errors.push('Contact phone must be a 10-digit Indian mobile number.');
  out.contact.phone = '+91' + local;
  out.contact.phoneDisplay = str(c.contact.phoneDisplay, 30) || `+91 ${local.slice(0, 5)} ${local.slice(5)}`;
  const wa = String(c.contact.whatsapp || '').replace(/\D/g, '');
  out.contact.whatsapp = wa.length === 10 ? '91' + wa : wa;
  if (!/^91[6-9]\d{9}$/.test(out.contact.whatsapp)) errors.push('WhatsApp number must be a 10-digit Indian mobile number.');
  out.contact.email = str(c.contact.email, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(out.contact.email)) errors.push('Contact email looks incomplete.');
  out.contact.instagram = str(c.contact.instagram, 60).replace(/^@/, '').replace(/[^A-Za-z0-9._]/g, '');
  out.contact.whatsappGroup = str(c.contact.whatsappGroup, 200) || DEFAULTS.contact.whatsappGroup;
  if (!/^https:\/\/(chat\.whatsapp\.com|wa\.me|whatsapp\.com)\/[A-Za-z0-9/?=&._%+-]+$/.test(out.contact.whatsappGroup)) errors.push('WhatsApp link must start with https://chat.whatsapp.com/ (a community or group invite) or https://wa.me/.');

  // headlines
  for (const [sec, fields] of Object.entries({ kareiq: ['heroTitle', 'heroHighlight', 'heroLead'], karehome: ['heroLine1', 'heroLine2', 'heroLead'] })) {
    for (const f of fields) {
      out[sec][f] = str(c[sec][f], f.endsWith('Lead') ? 400 : 120);
      if (!out[sec][f]) errors.push(`${sec === 'kareiq' ? 'KareIQ' : 'Kare@Home'} headline field "${f}" cannot be empty.`);
    }
  }

  // pricing
  out.pricing.annualNote = str(c.pricing.annualNote, 300);
  out.pricing.gstNote = str(c.pricing.gstNote, 200);
  for (const m of PLANS) {
    const s = int(c.pricing.savings[m]);
    if (Number.isNaN(s) || s > 90) errors.push(`Saving for the ${m}-month plan must be between 0 and 90%.`);
    out.pricing.savings[m] = Number.isNaN(s) ? 0 : s;
  }
  const inPkgs = Array.isArray(c.pricing.packages) ? c.pricing.packages : [];
  out.pricing.packages = PACKAGE_KEYS.map((key) => {
    const def = DEFAULTS.pricing.packages.find((p) => p.key === key);
    const p = merge(def, inPkgs.find((x) => x && x.key === key) || {});
    const name = str(p.name, 40) || def.name;
    const pkg = { key, name, mrp: int(p.mrp), offer: !!p.offer, popular: !!p.popular, prices: {}, includes: [] };
    if (Number.isNaN(pkg.mrp)) errors.push(`${name}: original price must be a number.`);
    for (const m of PLANS) {
      const pair = Array.isArray(p.prices[m]) ? p.prices[m] : [];
      const pm = int(pair[0]); const total = int(pair[1]);
      if (Number.isNaN(pm) || pm === 0) errors.push(`${name}: per-month price for the ${m}-month plan must be a number above 0.`);
      if (Number.isNaN(total) || total === 0) errors.push(`${name}: billed amount for the ${m}-month plan must be a number above 0.`);
      pkg.prices[m] = [Number.isNaN(pm) ? 0 : pm, Number.isNaN(total) ? 0 : total];
    }
    pkg.includes = (Array.isArray(p.includes) ? p.includes : []).map((x) => str(x, 200)).filter(Boolean).slice(0, 20);
    if (!pkg.includes.length) errors.push(`${name}: add at least one "Includes" line.`);
    return pkg;
  });
  if (out.pricing.packages.filter((p) => p.popular).length > 1) errors.push('Only one package can be marked "Most popular".');
  // KareNest, KareBalance and KareMind prices + savings for monthly KareNest packages
  for (const id of NEST_IDS) {
    const v = int(c.nest && c.nest.prices ? c.nest.prices[id] : NaN);
    const name = (NEST.packages.find((x) => x.id === id) || {}).name || id;
    if (Number.isNaN(v) || v === 0) errors.push(`${name}: price must be a number above 0.`);
    out.nest.prices[id] = Number.isNaN(v) || v === 0 ? DEFAULTS.nest.prices[id] : v;
  }
  for (const m of PLANS) {
    const sv = int(c.nest && c.nest.savings ? c.nest.savings[m] : NaN);
    if (Number.isNaN(sv) || sv > 90) errors.push(`KareNest saving for the ${m}-month plan must be between 0 and 90%.`);
    out.nest.savings[m] = Number.isNaN(sv) ? 0 : sv;
  }
  out.pricing.customized.lead = str(c.pricing.customized.lead, 80) || DEFAULTS.pricing.customized.lead;
  out.pricing.customized.text = str(c.pricing.customized.text, 200) || DEFAULTS.pricing.customized.text;

  return { errors, value: out };
}

async function save(value) {
  const prev = await db.getJSON(KEY, null);
  if (prev) await db.pushHistory('content-history', prev, KEEP_HISTORY).catch(() => {});
  await db.setJSON(KEY, { ...value, updatedAt: new Date().toISOString() });
  cache = null;
  return get();
}

async function reset() {
  const prev = await db.getJSON(KEY, null);
  if (prev) await db.pushHistory('content-history', prev, KEEP_HISTORY).catch(() => {});
  await db.del(KEY);
  cache = null;
  return get();
}

// name of a package in the given content (falls back to the default name)
function packageName(key, c) {
  const p = (c || cache || DEFAULTS).pricing.packages.find((x) => x.key === key);
  return p ? p.name : null;
}

module.exports = { get, validate, save, reset, packageName, DEFAULTS };
