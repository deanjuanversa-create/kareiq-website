// "Personal and health details": the fields from the KareIQ workbook "Data Collection - Caregiver
// First Visit", sheet by sheet, in the workbook's order. The sheet "General Checklist" (consents,
// KYC, photo, ID card, GPS location) is left out on purpose.
// Option lists are the workbook's own drop-down lists (data validations). A few labels have
// obvious spelling fixes, listed in REVIEW below so nothing is changed silently.
// The same definitions drive the family page, the caregiver page and the server checks.

const S = (k, label, options, extra) => ({ k, label, type: 'select', options, ...(extra || {}) });
const T = (k, label, extra) => ({ k, label, type: 'text', max: 200, ...(extra || {}) });
const M = (k, label, options, extra) => ({ k, label, type: 'multi', options, ...(extra || {}) });

const GENDER = ['Male', 'Female', 'Transgender', 'Do not want to disclose'];
const contact = (n) => ({
  title: 'Emergency Contact ' + n,
  fields: [
    T(`ec${n}Name`, 'Name', { max: 120 }),
    S(`ec${n}Gender`, 'Gender', GENDER),
    T(`ec${n}Relation`, 'Relationship with Client', { max: 80 }),
    T(`ec${n}Email`, 'Email', { format: 'email', max: 160 }),
    T(`ec${n}Phone`, 'Contact Number', { format: 'phone', max: 20 }),
    T(`ec${n}Languages`, 'Languages Spoken', { max: 160 })
  ]
});

const SECTIONS = [
  {
    id: 'general', title: 'General Information', sheet: 'General Information',
    groups: [{
      fields: [
        T('name', 'Name', { max: 120 }),
        { k: 'dob', label: 'Date of Birth', type: 'date' },
        { k: 'age', label: 'Age', type: 'computed', from: 'dob', help: 'Worked out from the date of birth' },
        S('gender', 'Gender', GENDER),
        T('bloodGroup', 'Blood Group', { max: 12, hint: 'For example O+, A−, B+, AB+' }),
        S('qualification', 'Qualifications', ['Did not Attend School', 'Primary Education', '10th Pass', '10+2', 'Degree', 'Masters', 'MPhil/PhD etc']),
        T('languages', 'Languages Spoken', { max: 160 }),
        { k: 'address', label: 'Address', type: 'textarea', max: 500 },
        T('email', 'Email', { format: 'email', max: 160 }),
        T('phone1', 'Primary Contact Number', { format: 'phone', max: 20 }),
        T('phone2', 'Secondary Contact Number', { format: 'phone', max: 20 }),
        S('smoking', 'Smoking', ['Never', 'Once in a While', 'At least once a week', 'Daily']),
        S('smokingAmount', 'Smoking: how much', ['<1 pack per week', '1 Pack per week', '2-5 packs per week', '>5 packs per week'], { showIf: ['smoking', 'notNever'] }),
        S('drinking', 'Drinking', ['Never', 'Social Drinking', 'Regular', 'Daily']),
        S('drinkingAmount', 'Drinking: how much', ['1-2 drinks/day', '3-5 drinks/day', '>5 drinks/day', 'Non-drinker'], { showIf: ['drinking', 'notNever'] })
      ]
    }]
  },
  { id: 'emergency', title: 'Emergency Contact', sheet: 'Emergency Contact', groups: [contact(1), contact(2)] },
  {
    id: 'doctors', title: 'Doctors Contact', sheet: 'Doctors Contact',
    groups: [
      { title: 'Family Doctor', fields: [T('fdName', 'Name', { max: 120 }), { k: 'fdAddress', label: 'Address', type: 'textarea', max: 500 }, T('fdPhone', 'Phone Number', { format: 'phone', max: 20 })] },
      {
        title: 'Specialist Consultant Doctor',
        fields: [T('sdName', 'Name', { max: 120 }), { k: 'sdAddress', label: 'Address', type: 'textarea', max: 500 }, T('sdPhone', 'Phone Number', { format: 'phone', max: 20 }),
          T('sdHospital', 'Hospital', { max: 160 }), T('sdHospitalPhone', 'Hospital Contact Number', { format: 'phone', max: 20 })]
      }
    ]
  },
  {
    id: 'allergies', title: 'Allergies', sheet: 'Allergies',
    groups: [{
      fields: [
        M('alGeneral', 'General Allergies', ['Allergic rhinitis (Hay fever)', 'Prawn and shellfish allergies', 'Insect and cockroach allergies', 'Dust mites']),
        M('alFood', 'Food Allergies', ['Peanuts', 'Tree nuts', 'Milk', 'Eggs', 'Wheat', 'Soy', 'Seafood', 'Other (Specify)']),
        M('alDrug', 'Drug Allergies', ['Antibiotics (like penicillin)', 'NSAIDs', 'Chemotherapy drugs', 'Other (Specify)'])
      ]
    }]
  },
  {
    id: 'conditions', title: 'Pre-existing Health Conditions', sheet: 'Pre-existing Health Conditions',
    groups: [{
      fields: [
        M('pcCardio', 'Cardiovascular Disease', ['Coronary artery disease', 'Atherosclerosis', 'High blood pressure (hypertension)', 'Previous heart attacks or strokes']),
        M('pcCancer', 'Cancer', ['Lung Cancer', 'Breast Cancer (Women)', 'Cervical Cancer (Women)', 'Prostate cancer (Men)', 'Oral Cancer', 'Colorectal Cancer', 'Other (Specify)']),
        S('pcDiabetes', 'Diabetes', ['Type 1', 'Type 2']),
        M('pcRespiratory', 'Respiratory Illness', ['Asthma', 'Breathlessness', 'Chronic obstructive pulmonary disease (COPD)', 'Emphysema', 'Diphtheria', 'Other (specify)']),
        M('pcAutoimmune', 'Autoimmune Disorders', ['Lupus', 'Multiple sclerosis', 'Rheumatoid arthritis', "Crohn's disease", 'Other (specify)']),
        M('pcNeuro', 'Neurological Conditions', ["Parkinson's disease", 'Epilepsy', 'Migraines']),
        M('pcKidneyLiver', 'Kidney and Liver Disease', ['Hepatitis', 'Fatty Liver', 'Cirrhosis', 'Other (specify)']),
        M('pcEndocrine', 'Endocrine Disorders', ['Hypothyroidism', 'Hyperthyroidism', 'Other (Specify)']),
        S('pcObesity', 'Obesity', ['Yes', 'No']),
        M('pcEye', 'Eye Problems', ['Myopia (Near-sightedness)', 'Hyperopia (Far-sightedness)', 'Astigmatism (Blurry Vision)', 'Cataract', 'Glaucoma', 'Age-related macular degeneration (AMD)', 'Diabetic retinopathy', 'Strabismus (eyes are misaligned and do not point in the same direction)', 'Retinal detachment', 'Other (specify)']),
        M('pcSleep', 'Sleep Disorders', ['Sleep apnea', 'Sleep walking', 'Insomnia', 'Others (Specify)']),
        M('pcEar', 'Ear Problems', ['Age-related hearing loss (Presbycusis)', 'Middle ear infections', 'Chronic Suppurative Otitis Media (CSOM)', 'Serous otitis media', 'Noise-induced hearing loss (NIHL)', 'Congenital and genetic hearing loss', 'Other (Specify)']),
        M('pcContagious', 'Contagious Diseases', ['HIV/AIDS', 'Tuberculosis', 'Leprosy', 'Hepatitis', 'Viral Hepatitis']),
        M('pcMental', 'Mental and Behavioral Health', ['Dementia', "Alzheimer's", 'Obsessive Compulsive Disorders', 'Depression', 'Bipolar', 'Anxiety disorders (Specify)', 'Psychotic disorders (specify)', 'Substance abuse disorders', 'Other (specify)']),
        { k: 'pcOther', label: 'Other (Specify)', type: 'textarea', max: 500 }
      ]
    }]
  }
];

// options that ask for more detail get a "Please specify" box, stored as <field>Specify
const needsSpecify = (o) => /\(specify\)/i.test(o);
const FIELDS = [];
for (const s of SECTIONS) for (const g of s.groups) for (const f of g.fields) {
  f.section = s.id;
  if (f.options && f.options.some(needsSpecify)) f.specify = f.k + 'Specify';
  FIELDS.push(f);
}
const BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.k, f]));

// Points in the workbook to confirm with the KareIQ team (shown in the hand-over notes, not to families)
const REVIEW = [
  'Spelling fixed: "Nuerological Conditions" shown as "Neurological Conditions"; "Atleast once a week" as "At least once a week".',
  'The workbook drop-downs allow one choice per cell. Allergies and health conditions accept several ticks, because a person can have more than one; Diabetes and Obesity stay single choices.',
  'Age has no formula in the workbook; it is worked out from the Date of Birth.',
  'Blood Group has no drop-down in the workbook, so it is a short text box.',
  '"Kidney and Liver Disease" lists only liver conditions (Hepatitis, Fatty Liver, Cirrhosis, Other). Kidney conditions can be written under "Other (specify)".',
  '"Contagious Diseases" lists both "Hepatitis" and "Viral Hepatitis"; both are kept as in the workbook.',
  'The workbook marks no field as required, so a form can be saved partly filled.',
  'Columns C and D of "Pre-existing Health Conditions" are empty in the workbook and are not used.'
];

const EMAIL = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/;
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
const cleanBlock = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u0009\u000b-\u001f\u007f]/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);

// Checks and tidies what was sent. Unknown keys are dropped. Returns { data } or { errors }.
function validate(raw) {
  const data = {}, errors = {};
  const src = raw && typeof raw === 'object' ? raw : {};
  for (const f of FIELDS) {
    if (f.type === 'computed') continue;
    // a follow-up question counts only when it applies (e.g. "how much" when Smoking is not "Never")
    if (f.showIf && f.showIf[1] === 'notNever' && (!data[f.showIf[0]] || data[f.showIf[0]] === 'Never')) continue;
    const v = src[f.k];
    if (f.type === 'multi') {
      if (v == null || v === '') continue;
      const list = (Array.isArray(v) ? v : [v]).map(String);
      const bad = list.filter((x) => !f.options.includes(x));
      if (bad.length) { errors[f.k] = 'Please choose from the list'; continue; }
      if (list.length) data[f.k] = [...new Set(list)];
    } else if (f.type === 'select') {
      if (v == null || v === '') continue;
      if (!f.options.includes(String(v))) { errors[f.k] = 'Please choose from the list'; continue; }
      data[f.k] = String(v);
    } else if (f.type === 'date') {
      if (v == null || v === '') continue;
      const s = String(v);
      const ms = Date.parse(s + 'T00:00:00Z');
      if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || Number.isNaN(ms) || new Date(ms).toISOString().slice(0, 10) !== s) { errors[f.k] = 'Enter a valid date'; continue; }
      if (s < '1900-01-01' || ms > Date.now()) { errors[f.k] = 'The date of birth must be in the past'; continue; }
      data[f.k] = s;
    } else {
      const s = f.type === 'textarea' ? cleanBlock(v, f.max) : clean(v, f.max);
      if (!s) continue;
      if (f.format === 'email' && !EMAIL.test(s)) { errors[f.k] = 'Enter a valid email address'; continue; }
      if (f.format === 'phone') {
        const d = s.replace(/[\s()-]/g, '');
        if (!/^(\+?\d{1,3})?\d{10}$/.test(d) && !/^0\d{9,11}$/.test(d)) { errors[f.k] = 'Enter a valid phone number (10 digits)'; continue; }
      }
      data[f.k] = s;
    }
    if (f.specify) {
      const chosen = [].concat(data[f.k] || []);
      const sp = clean(src[f.specify], 300);
      if (chosen.some(needsSpecify) && sp) data[f.specify] = sp;
    }
  }
  return Object.keys(errors).length ? { errors } : { data };
}

const ageFrom = (dob) => {
  if (!dob) return null;
  const now = new Date(), d = new Date(dob + 'T00:00:00Z');
  let a = now.getUTCFullYear() - d.getUTCFullYear();
  const m = now.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && now.getUTCDate() < d.getUTCDate())) a--;
  return a;
};

// which fields differ between two saved versions
function changed(before, after) {
  const keys = new Set([...Object.keys(before || {}), ...Object.keys(after || {})]);
  return [...keys].filter((k) => JSON.stringify((before || {})[k] ?? null) !== JSON.stringify((after || {})[k] ?? null));
}

// counts of filled fields per section, for the caregiver list
function progress(data) {
  const out = {};
  for (const s of SECTIONS) {
    const fs = FIELDS.filter((f) => f.section === s.id && f.type !== 'computed' && !f.showIf);
    out[s.id] = { filled: fs.filter((f) => data && data[f.k] != null && String(data[f.k]).length).length, total: fs.length };
  }
  return out;
}

function definitions() {
  return {
    source: 'Data Collection - Caregiver First Visit',
    excluded: ['General Checklist'],
    sections: SECTIONS.map((s) => ({ id: s.id, title: s.title, groups: s.groups.map((g) => ({ title: g.title || null, fields: g.fields.map((f) => ({ ...f, section: undefined })) })) }))
  };
}

module.exports = { SECTIONS, FIELDS, BY_KEY, REVIEW, validate, ageFrom, changed, progress, definitions };
