// Single source of truth for what people can book or ask about.
// The website forms send these ids; the server rejects anything else.
// KareBalance, KareMind and Bystander prices come from tools/shared/wellness.js.
const W = require('../tools/shared/wellness');
const wp = (id) => W.packages.find((p) => p.id === id).price;

const services = {
  'home-care': 'Home Care Support',
  'health-monitoring': 'Health Monitoring & Management',
  'health-screening': 'Preventive Health Screenings',
  'nutrition': 'Nutrition & Diet Support',
  'medication': 'Medication Management',
  'physiotherapy': 'Physiotherapy & Mobility Support',
  'companionship': 'Companionship & Emotional Well-being',
  'personal-care': 'Personal Care Assistance',
  'karebalance': 'KareBalance: fall prevention & mobility',
  'bystander': 'Bystander: caregiving support',
  'not-sure': 'Not sure yet, please guide me'
};

const packages = {
  'homestart': { name: 'HomeStart', mrp: 4499 },
  'homeplus': { name: 'HomePlus', mrp: 6499 },
  'homeelite': { name: 'HomeElite', mrp: 11999 },
  'customized': { name: 'Customised plan' },
  'kb-base': { name: 'KareBalance Base', mrp: wp('kb-base') },
  'kb-plus': { name: 'KareBalance Plus', mrp: wp('kb-plus') },
  'kb-premium': { name: 'KareBalance Premium', mrp: wp('kb-premium') },
  // Bystander: caregiving support, priced per visit
  ...Object.fromEntries(W.bystander.options.map((o) => [o.id, { name: `Bystander ${o.name} (${o.label})`, mrp: o.price }])),
  'by-long': { name: 'Bystander long-term (to be discussed)' },
  'undecided': { name: 'Not decided yet' }
};

// Payment plan length in months (all packages run for a year)
const billingPlans = {
  '1': 'Monthly (1 month)',
  '3': 'Quarterly (3 months)',
  '6': 'Half-yearly (6 months)',
  '12': 'Annual (12 months)'
};

// Bystander booking form (KareIQ and Kare@Home websites)
const bystander = {
  gender: { female: 'Female', male: 'Male', other: 'Other', none: 'Prefer not to say' },
  mobility: { independent: 'Walks independently', assisted: 'Needs help to walk', wheelchair: 'Uses a wheelchair', bedbound: 'Mostly in bed' },
  location: { home: 'At home', hospital: 'In hospital', other: 'Somewhere else' }
};

// visit slots (the nurse scheduler uses the same two): morning 8 AM to 12 PM, evening 2 PM to 6 PM
const timeSlots = {
  'morning': 'Morning (8am to 12pm)',
  'evening': 'Evening (2pm to 6pm)'
};

const careFor = {
  'parent': 'My parent',
  'grandparent': 'My grandparent',
  'spouse': 'My spouse',
  'self': 'Myself',
  'other': 'Someone else'
};

const interests = {
  'karehome': 'Kare@Home: care at home',
  'karenest': 'KareNest: community living',
  'karenest-visit': 'KareNest: free day pass (first visit)',
  'karenest-join': 'KareNest: join the community',
  'karenest-live': 'KareNest: live with us',
  'karenest-karebalance': 'KareNest: KareBalance',
  'karenest-pass': 'KareNest: visitor pass',
  'karenest-karemind': 'KareNest: KareMind',
  'karenest-general': 'KareNest: help me choose a package',
  'bystander': 'Bystander: caregiving support',
  'karewellness': 'KareWellness: wellness programmes',
  'karebalance': 'KareWellness: KareBalance',
  'karemind': 'KareWellness: KareMind',
  'partnership': 'Partnership or careers',
  'general': 'Not sure yet, guide me'
};

// KareNest packages (website: tools/karenest/data.js). An enquiry may name one of these, or a
// KareBalance package above. Prices include GST, as published on the website.
const karenestPlans = {
  'kareplus': { name: 'KarePlus (shared living)', price: 55000, unit: 'month' },
  'karepremium': { name: 'KarePremium (private room)', price: 99000, unit: 'month' },
  'bloom': { name: 'KareNest Bloom (day pass)', price: 1499, unit: 'day' },
  'flourish': { name: 'KareNest Flourish (weekly pass)', price: 8499, unit: 'week' },
  'thrive': { name: 'KareNest Thrive (monthly pass)', price: 24999, unit: 'month' },
  'km-base': { name: 'KareMind Base', price: wp('km-base'), unit: 'one-time' },
  'km-plus': { name: 'KareMind Plus', price: wp('km-plus'), unit: '3 months' },
  'km-premium': { name: 'KareMind Premium', price: wp('km-premium'), unit: '6 months' }
};

// The package an enquiry is about: a KareNest package, a KareBalance one or a Bystander option.
function enquiryPlan(id) {
  if (karenestPlans[id]) return { id, ...karenestPlans[id] };
  if (/^(kb|by)-/.test(id) && packages[id]) return { id, name: packages[id].name, price: packages[id].mrp };
  return null;
}

module.exports = { services, packages, billingPlans, timeSlots, careFor, interests, karenestPlans, enquiryPlan, bystander };
