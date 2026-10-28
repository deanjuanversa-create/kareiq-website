// The two KareIQ brands that families can buy, and the plans of each.
// Plan ids match the website booking forms (src/catalog.js), so a booking can become a plan in one click.

const catalog = require('../catalog');
const content = require('../content');

const PRODUCTS = {
  karehome: {
    id: 'karehome',
    name: 'Kare@Home',
    tagline: 'Care at home',
    plans: ['homestart', 'homeplus', 'homeelite', 'diabetic', 'customized', 'kb-base', 'kb-plus', 'kb-premium']
  },
  karenest: {
    id: 'karenest',
    name: 'KareNest',
    tagline: 'Community living',
    plans: ['kareplus', 'karepremium', 'bloom', 'flourish', 'thrive', 'kb-base', 'kb-plus', 'kb-premium', 'km-base', 'km-plus', 'km-premium', 'customized']
  }
};

// KareNest packages come from the website list in src/catalog.js. The two older ids are kept
// so plans created before the packages were named still show a sensible name.
const EXTRA_PLANS = {
  ...catalog.karenestPlans,
  'nest-living': { name: 'KareNest community living' },
  diabetic: { name: 'Diabetic Care' },
  'nest-respite': { name: 'KareNest short stay' }
};

// A plan for one brand also opens these brands. KareNest residents also get Kare@Home
// (home visits, readings and requests); a Kare@Home plan opens only Kare@Home.
// To change who gets what, edit only this line.
const INCLUDES = { karenest: ['karehome'] };

const PLAN_STATUS = {
  pending: 'Being set up',
  active: 'Active',
  paused: 'Paused',
  ended: 'Ended'
};

function planName(id) {
  if (EXTRA_PLANS[id]) return EXTRA_PLANS[id].name;
  return content.packageName(id) || (catalog.packages[id] ? catalog.packages[id].name : id);
}

function plansFor(product) {
  const p = PRODUCTS[product];
  return p ? p.plans.map((id) => ({ id, name: planName(id) })) : [];
}

// Which brand a website booking or enquiry belongs to.
function productOfRequest(kind, row) {
  if (row.product && PRODUCTS[row.product]) return row.product;
  if (kind === 'booking') return 'karehome';
  if (row.source === 'karenest' || /^karenest/.test(row.interest || '')) return 'karenest';
  if (row.interest === 'karehome' || row.source === 'karehome' || row.source === 'kare-at-home') return 'karehome';
  return null; // a general KareIQ enquiry
}

module.exports = { PRODUCTS, INCLUDES, PLAN_STATUS, planName, plansFor, productOfRequest };
