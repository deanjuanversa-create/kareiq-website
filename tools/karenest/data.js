// KareNest packages: the single source for every package card, table and detail page.
// Prices and wording come from the approved documents ("Karenest community.docx" for
// resident living and visitor passes). KareBalance and KareMind live in tools/shared/wellness.js
// (shown in full on the KareIQ KareWellness page; KareNest shows short introductions). Change prices here, then rebuild:
//   node tools/karenest/build.js
// The server keeps its own list of the same plan ids in src/catalog.js (KARENEST_PLANS)
// so that an enquiry can only name a real package.

const GST_LIVE = 'Inclusive of all'; // 30 Oct 2026: pricing notes read "Inclusive of all"
const GST_VISIT = 'Inclusive of all. Pass usage is subject to operating hours, scheduled activities, availability and capacity limits.';
const W = require('../shared/wellness');
const KB_FINE = 'Note: ' + W.KB_FINE;

const NOT_INCLUDED = [
  'Hospitalization and inpatient hospital expenses',
  'Medicines and prescribed medical supplies',
  'Specialist consultations outside the included preventive check-up plan',
  'Personal attendants and dedicated one-to-one caregiving',
  'Emergency transport and ambulance services'
];

const groups = {
  live: {
    id: 'live', path: '/live-with-us', name: 'Live With Us', kicker: 'Resident living',
    interest: 'karenest-live', color: 'teal', image: 'exp1.webp',
    imageAlt: 'A resident couple chatting in the KareNest garden',
    short: 'For active living, support, care and a vibrant community.'
  },
  visit: {
    id: 'visit', path: '/visit-and-participate', name: 'Visit & Participate', kicker: 'Visitor passes',
    interest: 'karenest-pass', color: 'violet', image: 'exp2.webp',
    imageAlt: 'Day visitors joining a group session at KareNest',
    short: 'Join activities, wellness programmes and community experiences during the day.'
  },
  karebalance: {
    id: 'karebalance', path: '/karebalance', name: 'KareBalance', kicker: 'Fall prevention & mobility',
    interest: 'karenest-karebalance', color: 'blue', image: 'yoga.webp',
    imageAlt: 'KareNest members doing a balance and stretching session on the lawn',
    short: 'A personalised fall prevention and mobility programme that helps older adults stay steady, active, and independent.'
  },
  karemind: {
    id: 'karemind', path: '/karemind', name: 'KareMind', kicker: 'Mental wellbeing',
    interest: 'karenest-karemind', color: 'rose', image: 'c1.webp',
    imageAlt: 'Friends chatting together around a garden table',
    short: 'A structured mental wellness program supporting emotional wellbeing, stress management, healthy sleep, resilience and social connection.'
  }
};

// slug: the page under the group path. id: the plan id sent with enquiries.
const packages = [
  // ---------- Live With Us ----------
  {
    id: 'kareplus', group: 'live', slug: 'kareplus', name: 'KarePlus', type: 'Shared Living',
    tagline: 'Comfortable Living. Thoughtful Care. Meaningful Connections.',
    price: 55000, unit: 'month', note: GST_LIVE, color: 'teal',
    listTitle: 'Package highlights',
    includes: [
      'Air-conditioned twin-sharing accommodation',
      'Five daily food and beverage services: bed tea, breakfast, lunch, evening tea and snacks, dinner',
      'Personalized diet plan',
      'Kare@Home HomeStart preventive check-up plan',
      'Complimentary KareNest community membership'
    ],
    cta: 'Enquire About KarePlus'
  },
  {
    id: 'karepremium', group: 'live', slug: 'karepremium', name: 'KarePremium', type: 'Private Room',
    tagline: 'Private Living. Enhanced Wellness. Personal Space.',
    price: 99000, unit: 'month', note: GST_LIVE, color: 'violet',
    listTitle: 'Everything in KarePlus, with',
    includes: [
      'Private, air-conditioned single-occupancy accommodation',
      'Personalized diet plan',
      'Enhanced preventive check-up plan through Kare@Home HomePlus',
      'Complimentary KareNest community membership',
      'Greater privacy and personal space'
    ],
    cta: 'Enquire About KarePremium'
  },
  // ---------- Visit & Participate ----------
  {
    id: 'bloom', group: 'visit', slug: 'bloom', name: 'KareNest Bloom', short: 'Bloom', type: 'Day pass',
    tagline: 'One Day of Wellness & Connection',
    price: 1499, unit: 'day', note: 'All-inclusive', color: 'teal',
    desc: 'Ideal for first-time visitors who want to experience KareNest and enjoy a day of activities, meals and social interaction.',
    cta: 'Choose Bloom'
  },
  {
    id: 'flourish', group: 'visit', slug: 'flourish', name: 'KareNest Flourish', short: 'Flourish', type: 'Weekly pass',
    tagline: 'Seven Days of Wellness & Discovery',
    price: 8499, unit: 'week', note: 'All-inclusive', color: 'violet',
    desc: 'Designed for seniors who want a week of yoga, training programmes, monitored activities, balanced meals and community engagement.',
    cta: 'Choose Flourish'
  },
  {
    id: 'thrive', group: 'visit', slug: 'thrive', name: 'KareNest Thrive', short: 'Thrive', type: 'Monthly pass',
    tagline: 'Month long Wellness & Belonging',
    price: 24999, unit: 'month', note: 'All-inclusive', color: 'rose',
    desc: 'For seniors who want to make KareNest part of their regular routine, with ongoing opportunities for wellness, activity and friendship.',
    cta: 'Choose Thrive'
  },
  // ---------- KareBalance and KareMind: tools/shared/wellness.js (shown in full on KareWellness) ----------
  ...W.packages
];

const liveCompare = {
  title: "What's included in your monthly price?",
  cols: ['KarePlus', 'KarePremium'],
  ids: ['kareplus', 'karepremium'],
  rows: [
    ['AC accommodation', 'Twin sharing', 'Single occupancy'],
    ['Preventive check-up plan', 'HomeStart', 'HomePlus'],
    ['Morning bed tea', 'Included', 'Included'],
    ['Breakfast, lunch and dinner', 'Included', 'Included'],
    ['Evening tea and snacks', 'Included', 'Included'],
    ['Personalized diet plan', 'Included', 'Included'],
    ['Community membership', 'Complimentary', 'Complimentary'],
    ['Inclusive of all', 'Yes', 'Yes']
  ]
};

const mindCompare = { ...W.mindCompare, ids: ['km-base', 'km-plus', 'km-premium'] };

const passIncludes = [
  ['Community access', 'Designated facilities and common areas', 'home'],
  ['Yoga and wellness', 'Scheduled yoga classes and monitored activities', 'yoga'],
  ['Training programmes', 'Access to included programmes', 'book'],
  ['Social activities', 'Scheduled recreation and community engagement', 'ppl'],
  ['Morning refreshments', 'Morning tea and snacks', 'cup'],
  ['Nutritious meals', 'Balanced lunch and evening tea with snacks', 'meal']
];

const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN');
const byGroup = (g) => packages.filter((p) => p.group === g);
const pathOf = (p) => groups[p.group].path + '/' + p.slug;
const unitLabel = (p) => (p.unit ? '/ ' + p.unit : p.unitText || '');

module.exports = { W, GST_LIVE, GST_VISIT, KB_FINE, NOT_INCLUDED, groups, packages, liveCompare, mindCompare, passIncludes, rupees, byGroup, pathOf, unitLabel };
