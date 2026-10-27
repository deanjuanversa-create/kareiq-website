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

const timeSlots = {
  'morning': 'Morning (8am to 12pm)',
  'afternoon': 'Afternoon (12pm to 4pm)',
  'evening': 'Evening (4pm to 8pm)'
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
  'partnership': 'Partnership or careers',
  'general': 'Not sure yet, guide me'
};

module.exports = { services, packages, billingPlans, timeSlots, careFor, interests };
