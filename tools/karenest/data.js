// KareNest packages: the single source for every package card, table and detail page.
// Prices and wording come from the approved documents ("Karenest community.docx" for
// resident living and visitor passes, "KareMind.docx" for KareMind) and, for KareBalance,
// from the programme already published on the website. Change prices here, then rebuild:
//   node tools/karenest/build.js
// The server keeps its own list of the same plan ids in src/catalog.js (KARENEST_PLANS)
// so that an enquiry can only name a real package.

const GST_LIVE = 'Inclusive of all GST and applicable service charges.';
const GST_VISIT = 'All visitor prices are inclusive of all GST. Pass usage is subject to operating hours, scheduled activities, availability and capacity limits.';
const KB_FINE = 'Note: Final pricing may vary based on assessment complexity, session frequency, home-visit requirements and service location. Clinical suitability should be established before beginning supervised training. KareBalance is a fall risk reduction and mobility support programme and does not guarantee the prevention of falls.';

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
  // ---------- KareBalance (from the existing website programme) ----------
  {
    id: 'kb-base', group: 'karebalance', slug: 'base', name: 'KareBalance Base', type: 'Assessment & Report',
    tagline: 'Assessment & Report', price: 7999, unit: '', unitText: 'One-time fee', color: 'teal',
    listTitle: "What's included",
    includes: [
      'Comprehensive fall risk assessment',
      'Balance, strength and mobility testing',
      'Review of fall history and relevant risk factors',
      'Home safety recommendations',
      'Personalised assessment report with next steps'
    ],
    best: 'Understanding individual fall risks and prevention needs.',
    cta: 'Book Base'
  },
  {
    id: 'kb-plus', group: 'karebalance', slug: 'plus', name: 'KareBalance Plus', type: 'Structured Training & Prevention',
    tagline: 'Structured Training & Prevention', price: 39999, unit: '', unitText: '24 supervised training sessions', color: 'rose',
    listTitle: "What's included",
    includes: [
      'Initial fall risk assessment',
      '24 supervised training sessions',
      'Progressive balance and strength exercises',
      'Walking, turning and sit-to-stand practice',
      'Home safety review',
      'Progress monitoring and family report'
    ],
    best: 'Older adults with balance difficulties, reduced strength or a history of falls.',
    cta: 'Book Plus'
  },
  {
    id: 'kb-premium', group: 'karebalance', slug: 'premium', name: 'KareBalance Premium', type: 'Comprehensive Six-Month Support',
    tagline: 'Comprehensive Six-Month Support', price: 90000, unit: '', unitText: 'Six-month programme', color: 'violet',
    listTitle: "What's included",
    includes: [
      'Comprehensive initial assessment',
      'Weekly supervised balance and strength training',
      'Quarterly reassessments',
      'Home visits and safety recommendations',
      'Family coaching and caregiver guidance',
      'Ongoing progress tracking and personalised programme adjustments'
    ],
    best: 'Older adults needing continued support to maintain mobility, confidence and independence.',
    cta: 'Book Premium'
  },
  // ---------- KareMind (KareMind.docx) ----------
  {
    id: 'km-base', group: 'karemind', slug: 'base', name: 'KareMind Base', type: 'Mental Wellness Assessment',
    tagline: 'Mental Wellness Assessment', price: 8999, unit: '', unitText: 'One-time package', color: 'teal',
    flag: 'Recommended starting program',
    desc: 'For people who want to understand their emotional wellbeing and identify practical next steps.',
    listTitle: "What's included",
    includes: [
      'Structured mental wellness and lifestyle assessment.',
      'Discussion of stress, mood, sleep, social connection and daily functioning.',
      'Appropriate validated screening questionnaires, administered by trained professionals.',
      'One qualified professional consultation.',
      'Personalised wellbeing recommendations and written action plan.',
      'Referral recommendations if further psychological or psychiatric evaluation is indicated.'
    ],
    best: 'An initial assessment and a clear plan for improving wellbeing.',
    cta: 'Enquire About KareMind Base'
  },
  {
    id: 'km-plus', group: 'karemind', slug: 'plus', name: 'KareMind Plus', type: 'Guided Emotional Wellbeing',
    tagline: 'Guided Emotional Wellbeing', price: 44999, unit: '', unitText: '3 months', color: 'violet',
    desc: 'Structured support to build healthier coping strategies, manage everyday stress and improve emotional wellbeing.',
    listTitle: "What's included",
    includes: [
      'Everything included in KareMind Base.',
      'Six individual counselling or wellbeing sessions, delivered by appropriately qualified professionals according to assessed needs.',
      'Personalised stress-management and coping plan.',
      'Guidance on sleep routines, relaxation and healthy daily habits.',
      'Support for social connection and adjustment to life changes.',
      'Progress reviews and an end-of-program reassessment.',
      'Referral to a clinical psychologist or psychiatrist when indicated.'
    ],
    best: 'People who would benefit from regular professional support and guided habit changes.',
    cta: 'Enquire About KareMind Plus'
  },
  {
    id: 'km-premium', group: 'karemind', slug: 'premium', name: 'KareMind Premium', type: 'Comprehensive Wellbeing Support',
    tagline: 'Comprehensive Wellbeing Support', price: 79999, unit: '', unitText: '6 months', color: 'rose',
    desc: 'Longer-term support for participants who need a more sustained and coordinated approach to emotional wellbeing.',
    listTitle: "What's included",
    includes: [
      'Everything included in KareMind Plus.',
      'Twelve individual counselling or wellbeing sessions in total.',
      'Personalised wellbeing goals and periodic plan adjustments.',
      'Structured support for coping skills, resilience and healthy routines.',
      'Up to two planned reviews with an appropriately qualified clinician, subject to the agreed service scope and individual needs.',
      'Family education session, with participant consent and where appropriate.',
      'Six-month progress report and continuing-care recommendations.',
      'Coordinated referrals for further psychological or psychiatric care when needed.'
    ],
    best: 'People seeking sustained support, continuity and a longer-term wellbeing plan.',
    cta: 'Enquire About KareMind Premium'
  }
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
    ['GST and applicable service charges', 'Included', 'Included']
  ]
};

const mindCompare = {
  title: 'Package comparison',
  cols: ['Base', 'Plus', 'Premium'],
  ids: ['km-base', 'km-plus', 'km-premium'],
  rows: [
    ['Duration', 'One-time', '3 months', '6 months'],
    ['Price', '₹8,999', '₹44,999', '₹79,999'],
    ['Initial assessment', 'Yes', 'Yes', 'Yes'],
    ['Individual sessions', '1 initial consultation', '6 sessions', '12 sessions'],
    ['Personalised wellbeing plan', 'Yes', 'Yes', 'Ongoing updates'],
    ['Progress reassessment', 'Initial', 'End of program', 'Periodic + final'],
    ['Family education', '—', 'As appropriate', '1 session'],
    ['Referral coordination', 'If indicated', 'If indicated', 'If indicated']
  ]
};

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

module.exports = { GST_LIVE, GST_VISIT, KB_FINE, NOT_INCLUDED, groups, packages, liveCompare, mindCompare, passIncludes, rupees, byGroup, pathOf, unitLabel };
