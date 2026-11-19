// Nurse Dashboard > Assessment > Regular Checkup: the KareIQ workbook
// "Copy of Data Collection - Caregiver Regular Visits.xlsx", sheet by sheet, in the workbook's order:
// Sheet7, General Data, Vitals, Diet, Stool Details, Urine Details, Sleep, Nutrient Profile.
//
// Labels and drop-down options are the workbook's own text (cell labels and data-validation lists),
// kept exactly, including its spelling. Only leading/trailing spaces are trimmed ("Other ",
// "<7 hours "). Two list items contain a comma ("Pale, White or Clay Colour" and
// "Fluffy, Mushy or Regged Edges"); each is kept as ONE option (see REVIEW).
//
// Numeric measurements that KareIQ already records (height, weight, body composition, temperature,
// oxygen, pulse, perfusion index, glucose, blood pressure) are saved as readings (app_readings), so the
// Vitals and Body composition pages, downloads and the risk engine use them. Everything else from the
// workbook is saved with the visit (app_visits.checkup), so each checkup keeps its own history.

const YN = ['Yes', 'No'];

// type: select | text | time | number (a reading or a plain number) | computed | auto
const F = (k, label, type, extra) => ({ k, label, type, ...(extra || {}) });
const SEL = (k, label, options, extra) => F(k, label, 'select', { options, ...(extra || {}) });
const TXT = (k, label, max, extra) => F(k, label, 'text', { max: max || 120, ...(extra || {}) });
const READ = (k, label, metric, unit) => F(k, label, 'number', { metric, unit });

const SECTIONS = [
  {
    id: 'visit', title: 'Visit', sheet: 'Sheet7',
    fields: [
      F('inTime', 'In time', 'time'),
      F('outTime', 'Out time', 'time'),
      F('caregiverName', 'Name of Caregiver', 'auto', { help: 'The nurse signed in' })
    ]
  },
  {
    id: 'general', title: 'General Data', sheet: 'General Data', header: 'Parameter',
    fields: [
      READ('height', 'Height', 'height', 'cm'),
      READ('weight', 'Weight', 'weight', 'kg'),
      F('standardWeight', 'Standard Weight', 'number', { unit: 'kg', limits: [1, 400] }),
      F('bmi', 'BMI', 'computed', { help: 'Worked out from Height and Weight' }),
      READ('bodyfat', 'Body Fat rate', 'bodyfat', '%'),
      READ('moisture', 'Body mositure rate', 'moisture', '%'),
      READ('visceral', 'Visceral fat', 'visceral', 'level'),
      READ('bone', 'Bone mass', 'bone', '%'),
      READ('bmr', 'BMR', 'bmr', 'kcal'),
      READ('protein', 'Protein', 'protein', '%'),
      TXT('obesityLevel', 'Obesity Levels', 60),
      READ('subfat', 'Subcutaneous Fat%', 'subfat', '%'),
      READ('lean', 'Lean Body Mass', 'lean', '%'),
      TXT('bodyType', 'Body type', 60),
      READ('temp', 'Body Temperature', 'temp', '°C'),
      SEL('backPain', 'Back pain', YN),
      SEL('kneePain', 'Knee/joint Pain', YN),
      SEL('dizziness', 'Dizziness', YN),
      SEL('toothache', 'Toothache', YN),
      SEL('headache', 'Headache', ['No', 'Mild', 'Severe']),
      TXT('eyeSight', 'Eye Sight', 120),
      SEL('lifeStyle', 'Life style', ['Sedentary', 'Moderately Active', 'Highly Active']),
      SEL('cognitiveState', 'Cognitive State', ['Perfect', 'Mild Memory Issues', 'Severe Memory Issues']),
      SEL('medicineOnTime', 'Did they Consume medicine on Time', ['Yes', 'No', 'Irregular']),
      SEL('alcohol', 'Alchohol Consumption', YN),
      SEL('alcoholWeekly', 'Weekly Consumption', ['1', '2', '3', '4', 'More than 4'], { showIf: ['alcohol', 'Yes'], of: 'alcohol' }),
      SEL('smoking', 'Smoking', YN),
      SEL('smokingWeekly', 'Weekly Consumption', ['1 Pack', '2 Packs', '3 Packs', 'More than 3 packs'], { showIf: ['smoking', 'Yes'], of: 'smoking' })
    ]
  },
  {
    id: 'vitals', title: 'Vitals', sheet: 'Vitals',
    fields: [
      READ('spo2', 'Oxygen Saturation Levels', 'spo2', '%'),
      READ('hr', 'Heart Beat Rate (pulse rate)', 'hr', 'bpm'),
      READ('pi', 'Perfusion Index', 'pi', ''),
      READ('glucose', 'Blood Glucose', 'glucose', 'mg/dL'),
      F('bp', 'Blood Pressure', 'bp', { parts: [['systolic', 'Systolic'], ['diastolic', 'Diastolic']], unit: 'mmHg' })
    ]
  },
  {
    id: 'diet', title: 'Diet', sheet: 'Diet',
    fields: [
      SEL('mealsPerDay', 'Frequency of food Intake: # Meals per day', ['1', '2', '3', '4', '5', '>5'], { group: 'Frequency of food Intake', short: '# Meals per day' }),
      TXT('quantityPerMeal', 'Frequency of food Intake: Quantity per Meal', 60, { group: 'Frequency of food Intake', short: 'Quantity per Meal' }),
      SEL('lastMealTiming', 'Last Meal of the day', ['>2 hours before going to bed', 'Immediately Before going to Bed', '>30 Minutes and Less Than 2 Hours before going to bed']),
      SEL('lastMeal', 'What was the last meal?', ['Rice and Curries', 'Chappati and Curry', 'Fruits', 'Other']),
      SEL('waterPerDay', 'Water Intake Per day', ['1.6 Litres', '2 Litres', '<1.6 litres', '>2 Litres']),
      SEL('waterFrequency', 'Frequency of Water Consumption', ['Every hour', '2-3 times a day', 'After every meals only', '3-5 times a day', 'More than 5 times a day'])
    ],
    // "Type & Quantity of Food Consumed": Food Category | (choice) | Quantity/Day
    table: {
      title: 'Type & Quantity of Food Consumed', columns: ['Food Category', '', 'Quantity/Day'],
      rows: [
        { k: 'cereals', label: 'Cereals', options: ['Rice', 'Millet', 'Wheat'] },
        { k: 'meat', label: 'Meat', options: ['Red Meat', 'Poultry', 'Seafood', 'Game Meat'] },
        { k: 'lentils', label: 'Lentils & Pulses', options: null },
        { k: 'vegetables', label: 'Vegetables', options: ['Root', 'Stem', 'Leaf', 'Flower', 'Fruit Vegetables'] },
        { k: 'fruits', label: 'Fruits', options: ['Citrus', 'Tropical', 'Berries', 'Stone Fruits', 'Pome Fruits', 'Melons', 'Dry Fruits'] },
        { k: 'nuts', label: 'Nuts', options: ['Cashew', 'Almond', 'Peanuts', 'Pistachio', 'Walnut'] },
        { k: 'cookingMethod', label: 'Cooking Method', options: ['Steamed', 'Shallow Fried', 'Deep Fried', 'Raw', 'Pickled'] },
        { k: 'spice', label: 'Spice', options: ['Low', 'Medium', 'High'] },
        { k: 'salt', label: 'Salt', options: ['Low', 'Medium', 'High'] },
        { k: 'sugar', label: 'Sugar', options: ['No', 'Low', 'Medium', 'High'] },
        { k: 'diary', label: 'Diary', options: ['Milk', 'Cheese', 'Yogurt (Curd)', 'Cream', 'Butter & Ghee', 'Frozen Diary Products', 'Concentrated & Dried Milk'] }
      ]
    }
  },
  {
    id: 'stool', title: 'Stool Details', sheet: 'Stool Details',
    fields: [
      SEL('stoolFrequency', 'Frequency of Passing Stools', ['1', '2', '3', '>3']),
      SEL('stoolColor', 'Color', ['Brown', 'Green', 'Red', 'Black or Tarry', 'Pale, White or Clay Colour', 'Yellow']),
      SEL('constipation', 'Constipation', YN),
      SEL('constipationLevel', 'Constipation: how severe', ['Mild', 'Severe'], { showIf: ['constipation', 'Yes'], of: 'constipation' }),
      SEL('stoolBlood', 'Blood Stain', YN),
      SEL('stoolPain', 'Pain during passing of Stools', YN),
      SEL('stoolPainLevel', 'Pain during passing of Stools: how severe', ['Mild', 'Severe'], { showIf: ['stoolPain', 'Yes'], of: 'stoolPain' }),
      SEL('stoolType', 'Type of Stool', ['Separate Hard Lumps like Nuts', 'Sausage Shaped with Cracks', 'Sausage Shaped with Cracks on Surface', 'Smooth and Snake like', 'Soft Blobs with clear cut edges', 'Fluffy, Mushy or Regged Edges', 'Liquidy/Watery'])
    ]
  },
  {
    id: 'urine', title: 'Urine Details', sheet: 'Urine Details',
    fields: [
      SEL('urineFrequency', 'Frequency of Passing Urine', ['4-10 times/day', '<4 times a day', '>10 times a day']),
      SEL('urineColour', 'Colour of Urine', ['Clear or Pale Yellow', 'Dark Yellow or Amber', 'Orange', 'Pink or Red', 'Dark Brown or Tea/Cola Coloured', 'Blue or Green']),
      SEL('urineType', 'Type of Urine', ['Cloudy or Milky', 'Foamy or Frothy', 'Normal']),
      SEL('urineBlood', 'Blood Stain in Urine', YN),
      SEL('urinePain', 'Pain during urine passing', YN)
    ]
  },
  {
    id: 'sleep', title: 'Sleep', sheet: 'Sleep',
    fields: [
      F('bedTime', 'When (what time) do you go to bed?', 'time'),
      SEL('sleepHours', 'Number of Hours of sleep per day', ['7-8 Hours', '<7 hours', '>8 hours']),
      SEL('sleepQuality', 'How good is the sleep?', ['Good', 'Moderate', 'Bad']),
      SEL('phoneBeforeSleep', 'Do You watch phone before sleeping?', YN),
      TXT('phoneTime', 'If yes, How much time do you spend on the Phone?', 60, { showIf: ['phoneBeforeSleep', 'Yes'], of: 'phoneBeforeSleep' })
    ]
  },
  {
    id: 'nutrient', title: 'Nutrient Profile', sheet: 'Nutrient Profile', info: true,
    text: 'Measures the nutrient profile based on Food intake by careseekers',
    note: 'We need to use AI tools to extract this data from the recorded food intake',
    items: [['Calories', []], ['Macro Nutrients', ['Carbohydrates (Sugar)', 'Fat (Saturated, Unsaturated)', 'Proteins']],
      ['Micro Nutrients', ['Vitamins (Vitamin A, C, D, B-complex)', 'Minerals (Iron, Calcium, Potassium, Sodium)']],
      ['Other Essential Components', ['Dietary Fiber', 'Phytonutrients', 'Antioxidants', 'Water']]]
  }
];

// Points to confirm with the KareIQ team (reported, never shown to families)
const REVIEW = [
  'Two drop-down items contain a comma: "Pale, White or Clay Colour" (Stool Details > Color) and "Fluffy, Mushy or Regged Edges" (Type of Stool). Each is kept as one option, which gives the seven stool types of the stool chart.',
  'Sample values in the workbook (General Data B19 "No" for Dizziness; Diet C18 "Milk" with D18 = 2) are not used as defaults.',
  'Nutrient Profile is not something the nurse records: the sheet says the values are to be extracted with AI tools from the recorded food intake. It is shown as a note; nothing is calculated.',
  'BMI has no drop-down or formula; it is worked out from Height and Weight, as KareIQ already does.',
  'Units are not given in the workbook; the units KareIQ already uses for these readings are shown (cm, kg, %, kcal, °C, bpm, mg/dL, mmHg). Standard Weight is in kg.',
  'Obesity Levels, Body type, Eye Sight, Quantity per Meal, Quantity/Day, Lentils & Pulses and "If yes, how much time…" have no drop-down, so they are short text boxes.',
  'Column C of General Data (rows 27–28, headed "Weekly Consumption") and column C of Stool Details (Constipation and Pain: Mild/Severe) are shown when the answer in column B is "Yes".',
  'Each Diet food row is one choice per row, as in the workbook.',
  'Spelling is kept exactly as in the workbook (e.g. "Body mositure rate", "Alchohol Consumption", "Diary", "Regged").',
  'Blood sugar timing (fasting / after a meal / random), total cholesterol and the note for the family are not in this workbook. They are kept from the existing KareIQ visit form, in a separate box, because the vitals ranges and the risk engine use them.'
];

const FIELDS = [];
for (const s of SECTIONS) for (const f of s.fields || []) { f.section = s.id; FIELDS.push(f); }
const BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.k, f]));
const TABLE = SECTIONS.find((s) => s.table).table;
const READINGS = FIELDS.filter((f) => f.metric).map((f) => f.k); // posted under the reading names

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// The workbook answers (everything that is not a reading). Returns { data, errors }.
function parse(raw, errors) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const data = {};
  const err = (k, m) => { errors['ck.' + k] = m; };
  for (const f of FIELDS) {
    if (f.metric || f.type === 'computed' || f.type === 'auto' || f.type === 'bp') continue;
    const v = src[f.k];
    if (v === undefined || v === null || v === '') continue;
    if (f.showIf && src[f.showIf[0]] !== f.showIf[1]) continue; // a follow-up only counts when it applies
    if (f.type === 'select') { if (f.options.includes(String(v))) data[f.k] = String(v); else err(f.k, 'Choose one of the options'); }
    else if (f.type === 'time') { if (/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) data[f.k] = String(v); else err(f.k, 'Enter a time'); }
    else if (f.type === 'number') {
      const n = Number(String(v).trim().replace(',', '.'));
      if (!Number.isFinite(n) || n < f.limits[0] || n > f.limits[1]) err(f.k, `This looks like a typing mistake (expected ${f.limits[0]}–${f.limits[1]})`);
      else data[f.k] = Math.round(n * 100) / 100;
    } else { const t = clean(v, f.max); if (t) data[f.k] = t; }
  }
  const food = {};
  const fsrc = src.food && typeof src.food === 'object' ? src.food : {};
  for (const r of TABLE.rows) {
    const row = fsrc[r.k] && typeof fsrc[r.k] === 'object' ? fsrc[r.k] : {};
    const o = {};
    if (row.choice !== undefined && row.choice !== null && row.choice !== '') {
      if (r.options) { if (r.options.includes(String(row.choice))) o.choice = String(row.choice); else err('food.' + r.k + '.choice', 'Choose one of the options'); }
      else { const t = clean(row.choice, 120); if (t) o.choice = t; }
    }
    const q = clean(row.quantity, 40);
    if (q) o.quantity = q;
    if (Object.keys(o).length) food[r.k] = o;
  }
  if (Object.keys(food).length) data.food = food;
  if (data.inTime && data.outTime && data.outTime < data.inTime) err('outTime', 'Out time cannot be before In time');
  return data;
}

// The answers as label/value rows, section by section (for the Wellbeing checks page and exports)
function display(d) {
  if (!d) return [];
  const out = [];
  for (const s of SECTIONS) {
    if (s.info || s.id === 'vitals') continue;
    const items = [];
    for (const f of s.fields || []) {
      if (f.metric || f.type === 'computed' || f.type === 'auto') continue;
      if (d[f.k] === undefined) continue;
      items.push({ k: f.k, label: f.of ? BY_KEY[f.of].label + ': ' + f.label : f.label, text: String(d[f.k]) });
    }
    if (s.table && d.food) {
      for (const r of s.table.rows) {
        const x = d.food[r.k];
        if (x) items.push({ k: 'food.' + r.k, label: r.label, text: [x.choice, x.quantity ? 'Quantity/Day: ' + x.quantity : ''].filter(Boolean).join(' · ') });
      }
    }
    if (items.length) out.push({ title: s.title, items });
  }
  return out;
}

function definitions() {
  return { source: 'Copy of Data Collection - Caregiver Regular Visits.xlsx', sections: SECTIONS.map((s) => ({ ...s, fields: (s.fields || []).map((f) => ({ ...f, section: undefined })) })) };
}

module.exports = { SECTIONS, FIELDS, BY_KEY, TABLE, READINGS, REVIEW, parse, display, definitions };
