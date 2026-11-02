// Every package families can choose, with what is included and how it is priced.
// One place for the app (choosing a plan, "Package information", charges), built from:
//   - Kare@Home HomeStart / HomePlus / HomeElite: the admin-edited prices and lists (src/content.js)
//   - KareNest, KareBalance and KareMind: tools/karenest/data.js, with admin-edited prices
//   - Diabetic Care: the KareIQ sheet "Diabetic Care Package"
// Pricing models:
//   tiers   - Kare@Home packages: price per month and billed amount for 1, 3, 6 and 12 months
//   monthly - KareNest monthly packages: monthly price, with the KareNest savings for 3, 6, 12 months
//   fixed   - one price for a fixed length (a day, a week, one-time, 3 or 6 months)
//   quote   - price agreed with the team (customised, diabetic care)

const content = require('../content');
const NEST = require('../../tools/karenest/data');

const MONTHS = ['1', '3', '6', '12'];
const KAREHOME_MONTHS = ['1', '3', '6', '12'];
// the payment plans a package offers
const monthsOf = (pkg) => MONTHS.filter((m) => pkg && pkg.prices && pkg.prices[m]);
const GST = 'Inclusive of all GST.';
const withGst = (notes) => (notes.some((n) => /GST/i.test(n)) ? notes : [...notes, GST]);
const PERIOD = { 1: 'Monthly', 3: 'Quarterly', 6: 'Half-yearly', 12: 'Yearly' };
const GROUP_OF = { live: 'Community living', visit: 'KareNest passes', karebalance: 'Focused care package', karemind: 'Focused care package' };
const GROUP_ORDER = ['Preventive package', 'Focused care package', 'Bystander', 'Community living', 'KareNest passes'];

const DIABETIC = {
  id: 'diabetic', product: 'karehome', group: 'Focused care package', name: 'Diabetic Care', type: 'Focused care',
  tagline: 'Regular tests and monitoring to keep diabetes under control.',
  listTitle: "What's included",
  includes: ['HbA1c test every 3 months', 'Lipid profile every 3 months', 'Kidney function test every 3 months', 'Urine albumin test every 3 months', 'Glycated haemoglobin every month', 'Blood sugar checked on every visit, shared with your family'],
  model: 'quote', notes: ['Our team confirms the price with you, based on the tests and visits needed.', GST]
};

async function all() {
  const c = await content.get();
  const out = [];
  for (const p of c.pricing.packages) {
    out.push({
      id: p.key, product: 'karehome', group: 'Preventive package', name: p.name, type: 'Kare@Home', tagline: 'Preventive care at home',
      listTitle: 'Includes', includes: p.includes, mrp: p.mrp, model: 'tiers',
      // Kare@Home is paid for 3, 6 or 12 months (no 1-month plan since 30 Oct 2026)
      prices: Object.fromEntries(KAREHOME_MONTHS.map((m) => [m, { perMonth: p.prices[m][0], total: p.prices[m][1], saving: c.pricing.savings[m] || 0 }])),
      notes: withGst([c.pricing.annualNote, c.pricing.gstNote].filter(Boolean))
    });
  }
  out.push({ id: 'customized', product: 'karehome', group: 'Preventive package', name: 'Customised plan', type: 'Kare@Home', tagline: c.pricing.customized.lead, listTitle: '', includes: [c.pricing.customized.text], model: 'quote', notes: [GST] });
  out.push(DIABETIC);
  const passIncl = NEST.passIncludes.map((x) => `${x[0]}: ${x[1]}`);
  for (const p of NEST.packages) {
    const price = (c.nest && c.nest.prices && c.nest.prices[p.id]) || p.price;
    const item = {
      id: p.id, product: p.group === 'karebalance' ? 'karehome' : 'karenest', group: GROUP_OF[p.group], name: p.name, type: p.type || NEST.groups[p.group].name,
      tagline: p.tagline, listTitle: p.listTitle || "What's included", includes: p.includes && p.includes.length ? p.includes : passIncl,
      best: p.best || null, desc: p.desc || null, notes: withGst([p.note].filter(Boolean))
    };
    if (p.unit === 'month') {
      item.model = 'monthly';
      item.prices = Object.fromEntries(MONTHS.map((m) => {
        const s = (c.nest && c.nest.savings && c.nest.savings[m]) || 0;
        const perMonth = Math.round(price * (1 - s / 100));
        return [m, { perMonth, total: perMonth * Number(m), saving: s }];
      }));
    } else {
      item.model = 'fixed';
      item.price = price;
      item.length = p.unit ? 'per ' + p.unit : p.unitText || '';
    }
    out.push(item);
  }
  // Bystander caregiving support (Kare@Home): Half Day, Full Day, Round the Clock, priced per visit,
  // and long-term care agreed with the team. Wording and prices come from tools/shared/wellness.js.
  const BY = require('../../tools/shared/wellness').bystander;
  for (const o of BY.options) {
    out.push({
      id: o.id, product: 'karehome', group: 'Bystander', name: 'Bystander ' + o.name, type: 'Caregiving support', tagline: `${o.name}: ${o.label} of caregiving support`,
      listTitle: "What's included", includes: [`A trained caregiver stays with your loved one for ${o.label}`, 'Support with everyday needs and comfort', 'Our team calls to confirm the caregiver and the timing'],
      desc: BY.intro, best: null, model: 'fixed', price: o.price, length: 'for ' + o.label, notes: [], noGst: true // the website does not say whether GST is included
    });
  }
  out.push({ id: 'by-long', product: 'karehome', group: 'Bystander', name: 'Bystander long-term', type: 'Caregiving support', tagline: 'Long-term caregiving support',
    listTitle: '', includes: [BY.longTerm], desc: BY.intro, model: 'quote', notes: ['Our team agrees the length, the hours and the price with you.'], noGst: true });
  return out;
}

async function byId(id) { return (await all()).find((p) => p.id === id) || null; }

// What one plan costs for the chosen number of months: { amount, text, gst } or { amount: null, text }
function priceOf(pkg, months) {
  if (!pkg) return { amount: null, text: 'Plan to be confirmed' };
  const note = pkg.notes.find((n) => /GST/i.test(n)) || null;
  if (pkg.model === 'tiers' || pkg.model === 'monthly') {
    const ms = monthsOf(pkg);
    const m = ms.includes(String(months)) ? String(months) : (pkg.model === 'tiers' ? '12' : ms[0]);
    const pr = pkg.prices[m];
    return { amount: pr.total, perMonth: pr.perMonth, months: Number(m), saving: pr.saving, text: `${pkg.name}, ${PERIOD[m].toLowerCase()} (${m === '1' ? '1 month' : m + ' months'})`, gst: note };
  }
  if (pkg.model === 'fixed') return { amount: pkg.price, text: `${pkg.name} (${pkg.length})`, gst: note };
  return { amount: null, text: 'Price confirmed by our team' };
}

const durationOf = (pkg) => pkg && (pkg.model === 'tiers' || pkg.model === 'monthly');

module.exports = { all, byId, priceOf, durationOf, monthsOf, MONTHS, PERIOD, GROUP_ORDER };
