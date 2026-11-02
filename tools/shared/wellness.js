// KareWellness and Bystander: the single source for programme wording, package inclusions and
// prices used by all three websites and the server.
//
//   KareWellness  its own website: full KareBalance and KareMind detail      -> tools/karewellness/build.js
//   KareIQ        /bystander (Bystander booking form)                          -> tools/kareiq/build.js
//   KareNest      short wellness introductions (no Bystander)                  -> tools/karenest/build.js
//   Kare@Home     short wellness introductions, /kare-at-home/bystander        -> tools/karehome/build.js
//
// Change a price or a line here, then rebuild all three:
//   node tools/karewellness/build.js && node tools/kareiq/build.js && node tools/karenest/build.js && node tools/karehome/build.js
// The server checks enquiries and bookings against the same ids (src/catalog.js reads this file).

// Approved pricing, 30 Oct 2026 (KareBalance Plus and Premium updated 2 Nov 2026). Every price is inclusive of GST and all other service charges.
const INCL = 'Inclusive of GST and all other service charges';

const KB_FINE = 'Final pricing may vary based on assessment complexity, session frequency, home-visit requirements and service location. Clinical suitability should be established before beginning supervised training. KareBalance is a fall risk reduction and mobility support programme and does not guarantee the prevention of falls.';

// ---------------------------------------------------------------- KareBalance
const karebalance = {
  id: 'karebalance', name: 'KareBalance', kicker: 'Fall prevention & mobility',
  headline: ['Better Balance.', 'Stronger Steps.', 'Fewer Falls.'],
  short: 'A personalised fall prevention and mobility programme that helps older adults stay steady, active, and independent.',
  // the short introduction shown on KareNest and Kare@Home
  brief: 'Fall prevention, better mobility and everyday physical wellness. A personalised programme of assessment and supervised balance and strength training that helps older adults stay steady, active and independent.',
  intro: [
    'Falls are one of the most common reasons older adults lose confidence and independence, and many of them can be anticipated. KareBalance starts with a comprehensive fall risk assessment and builds a programme around the person: their balance, strength, walking, fall history, medicines and home.',
    'Supervised training then works on the movements that matter most in daily life, such as standing up, turning, walking and climbing stairs, while home safety recommendations and family guidance make every day a little safer.'
  ],
  objectives: [
    ['balance', 'Improve Balance & Stability', 'Build better control while standing, turning and walking.'],
    ['strength', 'Build Strength', 'Strengthen leg and core muscles for everyday activities.'],
    ['walk', 'Move with Confidence', 'Practise walking, stair climbing and sit-to-stand transitions.'],
    ['shield', 'Identify Fall Risks', 'Assess personal risk factors, medication-related concerns and home safety hazards.'],
    ['people', 'Stay Independent', 'Develop safer movement habits and confidence in daily life.']
  ],
  services: [
    'Comprehensive fall risk assessment',
    'Balance, strength and mobility testing',
    'Review of fall history and relevant risk factors',
    'Supervised, progressive balance and strength training',
    'Walking, turning and sit-to-stand practice',
    'Home visits, home safety review and recommendations',
    'Family coaching and caregiver guidance',
    'Progress monitoring, reassessments and family reports'
  ],
  features: [
    ['Personalised from day one', 'Every programme starts with an assessment, so training matches the person, not a template.'],
    ['Supervised sessions', 'Exercises are guided and progressed safely, step by step.'],
    ['Home-aware', 'Home safety reviews turn the assessment into practical changes at home.'],
    ['Family in the loop', 'Progress reports and caregiver guidance keep the family informed and involved.']
  ],
  whoFor: [
    'Have experienced a fall or near-fall.',
    'Fear falling and have started avoiding everyday activities.',
    'Feel unsteady while walking, turning or climbing stairs.',
    'Are recovering mobility after an illness, hospitalisation or a period of inactivity.',
    'Have reduced leg strength, balance or mobility.',
    'Want to maintain their balance, strength and independence as they age.'
  ],
  // what the packages do not cover (please review: written from the programme wording above)
  excludes: [
    'Medical diagnosis or treatment of underlying conditions, and medicines',
    'Walking aids, mobility equipment or home modifications (recommended, not supplied)',
    'Sessions or home visits beyond those included in the chosen package',
    'A guarantee that falls will be prevented: KareBalance reduces fall risk'
  ],
  terms: [
    'All prices are ' + INCL.replace(/^Inclusive/, 'inclusive') + '.',
    KB_FINE
  ]
};

// ---------------------------------------------------------------- KareMind
const karemind = {
  id: 'karemind', name: 'KareMind', kicker: 'Mental wellbeing',
  headline: ['Nurture Your Mind.', 'Enhance Your Wellbeing.'],
  short: 'A structured mental wellness program supporting emotional wellbeing, stress management, healthy sleep, resilience and social connection.',
  brief: 'Mental wellness and cognitive wellbeing. A structured, personal program for emotional balance, stress, healthy sleep, resilience and staying socially connected, with one-to-one support from qualified professionals.',
  intro: [
    "Mental wellbeing is an essential part of healthy ageing. At KareMind, we believe that everyone deserves the opportunity to feel emotionally balanced, stay socially connected, and navigate life's challenges with confidence and dignity.",
    'KareMind is a structured mental wellness program designed to support emotional wellbeing, stress management, healthy sleep habits, resilience, and meaningful social connections. Through personalised assessments, one-to-one support from qualified professionals, and practical strategies for everyday life, the program helps individuals better understand their emotional needs and build healthier routines.',
    'Whether you are experiencing everyday stress, adjusting to life changes, feeling socially disconnected, or simply looking to prioritise your mental wellbeing, KareMind offers support tailored to your individual needs.'
  ],
  quote: ['Our approach is personal, compassionate, and focused on you.', 'With ongoing guidance, progress reviews, and referrals to appropriate mental health professionals when needed, KareMind helps you take meaningful steps towards a healthier, more balanced life.'],
  objectives: [
    ['heart', 'Emotional wellbeing', 'Understand emotional needs and feel more balanced day to day.'],
    ['leaf', 'Stress management', 'Practical coping strategies for everyday stress and life changes.'],
    ['moon', 'Healthy sleep', 'Guidance on sleep routines, relaxation and healthy daily habits.'],
    ['spark', 'Resilience', 'Build coping skills, confidence and healthier routines.'],
    ['people', 'Social connection', 'Support for staying connected and adjusting to life changes.']
  ],
  services: [
    'Structured mental wellness and lifestyle assessment',
    'Validated screening questionnaires, administered by trained professionals',
    'Individual counselling or wellbeing sessions with qualified professionals',
    'Personalised stress-management and coping plan',
    'Guidance on sleep routines, relaxation and healthy habits',
    'Progress reviews and reassessments',
    'Family education session, with participant consent',
    'Referral coordination for psychological or psychiatric care when indicated'
  ],
  features: [
    ['Assessment first', 'Every program begins with a structured assessment and a written action plan.'],
    ['One-to-one support', 'Sessions with appropriately qualified professionals, matched to assessed needs.'],
    ['Measured progress', 'Progress reviews and reassessments show what is changing.'],
    ['Connected care', 'Referrals to a clinical psychologist or psychiatrist when further care is indicated.']
  ],
  terms: [
    'All prices are ' + INCL.replace(/^Inclusive/, 'inclusive') + '.',
    'Sessions are delivered by appropriately qualified professionals according to assessed needs.',
    'Clinician reviews in KareMind Premium are subject to the agreed service scope and individual needs.',
    'Family education sessions take place only with the participant\'s consent and where appropriate.',
    'KareMind is a wellness program. Where further psychological or psychiatric evaluation is indicated, we recommend and coordinate referrals; KareMind is not an emergency service.'
  ],
  excludes: [
    'Psychiatric treatment and medicines (we recommend and coordinate referrals when indicated)',
    'Sessions beyond those included in the chosen package',
    'Emergency or crisis support: KareMind is a planned wellness program'
  ],
  tagline: 'Because your mental wellbeing matters at every stage of life.'
};

// ---------------------------------------------------------------- packages
// id: the plan id sent with enquiries and bookings (also used by the KareIQ app).
const packages = [
  {
    id: 'kb-base', group: 'karebalance', slug: 'base', name: 'KareBalance Base', type: 'Assessment & Report',
    tagline: 'Assessment & Report', price: 8999, unit: '', unitText: 'One-time fee', color: 'teal',
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
    tagline: 'Structured Training & Prevention', price: 49999, unit: '', unitText: '24 supervised training sessions', color: 'rose',
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
    tagline: 'Comprehensive Six-Month Support', price: 84999, unit: '', unitText: 'Six-month programme', color: 'violet',
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

const rupees = (n) => '₹' + Number(n).toLocaleString('en-IN');
const priceOf = (id) => rupees(packages.find((p) => p.id === id).price);

const mindCompare = {
  title: 'Package comparison',
  cols: ['Base', 'Plus', 'Premium'],
  rows: [
    ['Duration', 'One-time', '3 months', '6 months'],
    ['Price', priceOf('km-base'), priceOf('km-plus'), priceOf('km-premium')],
    ['Initial assessment', 'Yes', 'Yes', 'Yes'],
    ['Individual sessions', '1 initial consultation', '6 sessions', '12 sessions'],
    ['Personalised wellbeing plan', 'Yes', 'Yes', 'Ongoing updates'],
    ['Progress reassessment', 'Initial', 'End of program', 'Periodic + final'],
    ['Family education', '—', 'As appropriate', '1 session'],
    ['Referral coordination', 'If indicated', 'If indicated', 'If indicated']
  ]
};

const balanceCompare = {
  title: 'Programme comparison',
  cols: ['Base', 'Plus', 'Premium'],
  rows: [
    ['Duration', 'One-time', '24 sessions', 'Six months'],
    ['Price', priceOf('kb-base'), priceOf('kb-plus'), priceOf('kb-premium')],
    ['Fall risk assessment', 'Comprehensive', 'Initial', 'Comprehensive + quarterly'],
    ['Supervised training', '—', '24 sessions', 'Weekly'],
    ['Home safety', 'Recommendations', 'Home safety review', 'Home visits + recommendations'],
    ['Family support', 'Assessment report', 'Family report', 'Coaching + caregiver guidance'],
    ['Progress tracking', '—', 'Yes', 'Ongoing, with programme adjustments']
  ]
};

// ---------------------------------------------------------------- Bystander
// Approved 30 Oct 2026. Do not change the durations or prices without approval.
const bystander = {
  id: 'bystander', name: 'Bystander', kicker: 'Caregiving Support',
  title: 'Bystander — Caregiving Support',
  short: 'A trained caregiver to stay with your loved one for half a day, a full day or round the clock.',
  intro: 'When your loved one needs someone by their side, a Bystander from the KareIQ family stays with them and supports their everyday needs and comfort, so that the family can work, rest or travel with peace of mind. Choose the length of support that suits the day.',
  options: [
    { id: 'by-half', name: 'Half Day', hours: 4, label: '4 hours', price: 799 },
    { id: 'by-full', name: 'Full Day', hours: 8, label: '8 hours', price: 1299 },
    { id: 'by-24', name: 'Round the Clock', hours: 24, label: '24 hours', price: 2499 }
  ],
  longTerm: 'Long-term services can be discussed and customised on a case-by-case basis.'
};

const groups = { karebalance, karemind };
const byGroup = (g) => packages.filter((p) => p.group === g);

// KareWellness is its own website (tools/karewellness/build.js): /karewellness locally,
// its own domain when deployed (js/sites.js: KARE_SITES.karewellness). Pages: /karebalance, /karemind.
const WELLNESS_PATH = 'karewellness';
// After signing in, the KareIQ app opens the booking for a package. KareBalance is delivered by
// Kare@Home and KareMind by KareNest (src/app/products.js), so each package names its brand.
const bookPath = (p) => (p ? `#/plans?brand=${p.group === 'karebalance' ? 'karehome' : 'karenest'}&plan=${p.id}` : '#/plans');

module.exports = { INCL, KB_FINE, groups, karebalance, karemind, packages, byGroup, mindCompare, balanceCompare, bystander, rupees, WELLNESS_PATH, bookPath };
