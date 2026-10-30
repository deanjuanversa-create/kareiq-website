// Single source of truth for what people can book or ask about.
// The website forms send these ids; the server rejects anything else.

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
  'not-sure': 'Not sure yet, please guide me'
};

const packages = {
  'homestart': { name: 'HomeStart', mrp: 3499 },
  'homeplus': { name: 'HomePlus', mrp: 6999 },
  'homeelite': { name: 'HomeElite', mrp: 12999 },
  'customized': { name: 'Customised plan' },
  'kb-base': { name: 'KareBalance Base', mrp: 7999 },
  'kb-plus': { name: 'KareBalance Plus', mrp: 39999 },
  'kb-premium': { name: 'KareBalance Premium', mrp: 90000 },
  'undecided': { name: 'Not decided yet' }
};

// Payment plan length in months (all packages run for a year)
const billingPlans = {
  '1': 'Monthly (1 month)',
  '3': 'Quarterly (3 months)',
  '6': 'Half-yearly (6 months)',
  '12': 'Annual (12 months)'
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
  'karenest-visit': 'KareNest: day visit',
  'karenest-join': 'KareNest: join the community',
  'karenest-live': 'KareNest: live with us',
  'karenest-karebalance': 'KareNest: KareBalance',
  'karenest-pass': 'KareNest: visitor pass',
  'karenest-karemind': 'KareNest: KareMind',
  'karenest-general': 'KareNest: help me choose a package',
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
  'km-base': { name: 'KareMind Base', price: 8999, unit: 'one-time' },
  'km-plus': { name: 'KareMind Plus', price: 44999, unit: '3 months' },
  'km-premium': { name: 'KareMind Premium', price: 79999, unit: '6 months' }
};

// The package an enquiry is about: a KareNest package or a KareBalance one.
function enquiryPlan(id) {
  if (karenestPlans[id]) return { id, ...karenestPlans[id] };
  if (/^kb-/.test(id) && packages[id]) return { id, name: packages[id].name, price: packages[id].mrp };
  return null;
}

module.exports = { services, packages, billingPlans, timeSlots, careFor, interests, karenestPlans, enquiryPlan };
