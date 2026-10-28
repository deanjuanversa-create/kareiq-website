// Package details for the family dashboard: what each package monitors and how often,
// free sessions, add-on services, plan groups and the charges ("invoices") of each plan.
//
// Monitoring list and frequencies: KareIQ sheet "Standard Preventive Packages" (Draft Data
// Collection by Caregivers). Where a cell is blank for a higher package, it has the same
// frequency as the package before it (HomePlus and HomeElite include everything in HomeStart).
// Diabetic Care tests: sheet "Diabetic Care Package".
// Free sessions and add-on discounts: the Kare@Home website packages.

const catalog = require('../catalog');
const content = require('../content');

// [category, item, HomeStart, HomePlus, HomeElite, note]
const MONITORING = [
  ['Vitals', 'Blood pressure', 'Every visit', 'Every visit'],
  ['Vitals', 'Oxygen saturation (SpO2)', 'Every visit', 'Every visit'],
  ['Vitals', 'Heart rate (pulse)', 'Every visit', 'Every visit'],
  ['Vitals', 'Perfusion index', 'Every visit', 'Every visit'],
  ['Vitals', 'Blood sugar', 'Every visit', 'Every visit'],
  ['Vitals', 'Body temperature', 'Every visit', 'Every visit'],
  ['Food and water', 'Meals, type of food, salt, spice and sugar', 'Every visit', 'Every visit'],
  ['Food and water', 'Last meal of the day and time before bed', 'Every visit', 'Every visit'],
  ['Food and water', 'Water intake', 'Every visit', 'Every visit'],
  ['Wellbeing', 'Memory (cognitive state)', 'Every visit', 'Every visit'],
  ['Wellbeing', 'Stool and urine details', 'Every visit', 'Every visit'],
  ['Wellbeing', 'Back, knee and joint pain, dizziness, toothache, headache', 'Every visit', 'Every visit'],
  ['Wellbeing', 'Medicines taken or missed', 'Every visit', 'Every visit', 'Every visit'],
  ['Wellbeing', 'Sleep and activity level', 'Every visit'],
  ['Body', 'Height', 'Yearly', 'Yearly'],
  ['Body', 'Weight, standard weight and BMI', 'Monthly', 'Monthly'],
  ['Body', 'Body composition (body fat, moisture, visceral fat, bone mass, BMR, protein, lean mass)', 'Monthly', 'Weekly', 'Weekly'],
  ['Checks', 'Eye sight (simple check)', 'Yearly', 'Yearly', 'Every 6 months'],
  ['Checks', 'ECG at home', 'Monthly', 'Monthly', 'Monthly'],
  ['Checks', 'Fall risk tests (TUG, balance, reach, chair stand)', 'Every 6 months', 'Every quarter', 'Monthly'],
  ['Checks', 'Mental health questionnaire', 'Every 6 months', 'Every quarter', 'Monthly'],
  ['Records', 'New diagnostic reports and prescriptions scanned', 'Every visit', 'Every visit', 'Every visit']
];
const TIERS = ['homestart', 'homeplus', 'homeelite'];

function monitoringFor(planId) {
  if (planId === 'diabetic') {
    return [
      { category: 'Diabetic care tests', item: 'HbA1c', freq: 'Every 3 months' },
      { category: 'Diabetic care tests', item: 'Lipid profile', freq: 'Every 3 months' },
      { category: 'Diabetic care tests', item: 'Kidney function test', freq: 'Every 3 months' },
      { category: 'Diabetic care tests', item: 'Urine albumin test', freq: 'Every 3 months' },
      { category: 'Diabetic care tests', item: 'Glycated haemoglobin', freq: 'Monthly' }
    ];
  }
  const tier = TIERS.indexOf(planId);
  if (tier < 0) return [];
  return MONITORING.map((r) => {
    let freq = null;
    for (let i = 0; i <= tier; i++) if (r[2 + i]) freq = r[2 + i];
    return freq ? { category: r[0], item: r[1], freq } : null;
  }).filter(Boolean);
}

// Free physiotherapy or bystander sessions a year, and add-on discount, per Kare@Home package
const FREE = { homestart: 4, homeplus: 6, homeelite: 8 };
const DISCOUNT = { homestart: 10, homeplus: 15, homeelite: 20 };

const SERVICES = {
  bystander: { name: 'Bystander', text: 'A trained person to help with daily activities at home or in hospital.', free: true },
  physiotherapy: { name: 'Physiotherapy', text: 'A physiotherapy session at home for strength, balance and pain.', free: true },
  teleconsultation: { name: 'Teleconsultation', text: 'A video or phone consultation with a doctor.' },
  spongebath: { name: 'Sponge bath', text: 'Gentle bathing and grooming support for someone who cannot shower.' },
  'blood-collection': { name: 'Blood collection', text: 'A blood sample taken at home for lab tests.' },
  dressing: { name: 'Dressing session', text: 'Wound dressing by a trained nurse.' },
  'family-visit': { name: 'Family visit to KareNest', text: 'Plan a visit to spend time with your loved one at KareNest.', nest: true }
};

// How plans are grouped on "Package information"
function groupOf(planId) {
  if (TIERS.includes(planId) || planId === 'customized') return 'Preventive package';
  if (/^kb-|^km-/.test(planId) || planId === 'diabetic') return 'Focused care package';
  if (catalog.karenestPlans[planId] || /^nest-/.test(planId)) return 'Community living';
  return 'Other';
}

const fmt = (n) => 'Rs ' + Number(Math.round(n)).toLocaleString('en-IN');

// What a plan costs, from the website prices. Returns { amount, text, gst } or { amount: null }.
async function chargeOf(plan) {
  const id = plan.planId;
  if (!id) return { amount: null, text: 'Plan to be confirmed' };
  const c = await content.get();
  const web = c.pricing && c.pricing.packages ? c.pricing.packages.find((x) => x.key === id) : null;
  if (web && web.prices) {
    const m = String(plan.months || 12);
    const row = web.prices[m] || web.prices['12'];
    if (row) return { amount: row[1], text: `${web.name}, ${m === '1' ? '1 month' : m + ' months'}`, gst: c.pricing.gstNote || 'Prices exclude GST.' };
  }
  const k = catalog.karenestPlans[id];
  if (k) {
    const months = Number(plan.months) || 1;
    const amount = k.unit === 'month' ? k.price * months : k.price;
    return { amount, text: k.unit === 'month' ? `${k.name}, ${months} month${months === 1 ? '' : 's'}` : `${k.name} (${k.unit})`, gst: 'KareNest prices include GST.' };
  }
  const p = catalog.packages[id];
  if (p && p.mrp) return { amount: p.mrp, text: p.name, gst: 'Prices exclude GST.' };
  return { amount: null, text: 'Price confirmed by our team' };
}

module.exports = { MONITORING, monitoringFor, FREE, DISCOUNT, SERVICES, groupOf, chargeOf, fmt, TIERS };
