// Nurse Dashboard > Assessment > Onboarding Customer: the KareIQ workbook
// "Copy of Data Collection - Caregiver First Visit.xlsx", every sheet in the workbook's order:
// General Checklist, General Information, Emergency Contact, Doctors Contact, Allergies,
// Pre-existing Health Conditions.
//
// The last five sheets are the same fields KareIQ already keeps as the customer's "Personal and
// health details" (firstvisit.js, saved in app_details), so they are reused, not defined twice. The
// General Checklist sheet (consents, KYC, photo, ID card, location) is defined here.
//
// Onboarding happens once per customer. The submitted record (app_onboarding, id 'onb-' + personId)
// is written with an atomic insert-if-absent, so a second submission, even at the same moment, is
// refused by the database. It is never updated or deleted afterwards.

const firstvisit = require('./firstvisit');

const YN = ['Yes', 'No'];
const S = (k, label, options, extra) => ({ k, label, type: 'select', options, ...(extra || {}) });
const T = (k, label, extra) => ({ k, label, type: 'text', max: 200, ...(extra || {}) });

const CHECKLIST = {
  id: 'checklist', title: 'General Checklist', sheet: 'General Checklist',
  groups: [
    { fields: [
      S('ckPastRecords', 'Consent to share past health records', YN),
      S('ckPhysician', 'Consent to share the health data with Physician (Physical Form)', YN),
      S('ckFamilyDoctor', 'Consent to Share Family Doctor Contact', YN),
      S('ckSpecialist', 'Specialist Consultant Doctor Contact', YN)
    ] },
    { title: 'KYC Details', fields: [
      S('kycIdType', 'ID Type', ['Aadhar', 'Passport', 'Driver License', 'Ration Card', 'Voter ID Card']),
      T('kycIdNumber', 'ID Number', { max: 40, format: 'idnumber', sensitive: true })
    ] },
    { fields: [S('ckPhoto', 'Photo', YN), S('ckIdCopy', 'Copy of ID Card', YN)] },
    { title: 'Location Details', fields: [
      T('gpsCoordinates', 'GPS Coordinates', { max: 60, format: 'gps', hint: 'Latitude, longitude, e.g. 9.9312, 76.2673' }),
      T('gpsLink', 'GPS Link', { max: 500, format: 'url', hint: 'A maps link, starting with https://' })
    ] }
  ]
};

const SECTIONS = [CHECKLIST, ...firstvisit.SECTIONS];
const CK_FIELDS = CHECKLIST.groups.flatMap((g) => g.fields);
for (const f of CK_FIELDS) f.section = 'checklist';
const FIELDS = [...CK_FIELDS, ...firstvisit.FIELDS];
const BY_KEY = Object.fromEntries(FIELDS.map((f) => [f.k, f]));
const PHONE_KEYS = FIELDS.filter((f) => f.format === 'phone').map((f) => f.k);

const REVIEW = [
  'General Checklist B13 (the cell under "GPS Coordinates") has a Yes/No drop-down in the workbook. Coordinates are not a Yes/No answer, so GPS Coordinates and GPS Link are entry fields; please confirm what B13 was meant for.',
  'General Checklist rows 9–10 (Photo, Copy of ID Card) are Yes/No in the workbook: they record whether the photo and the ID copy were collected. No file is uploaded here.',
  'General Information C13 and C14 (how much the person smokes or drinks) have no heading in the workbook; they are shown as "Smoking: how much" and "Drinking: how much" when the answer is not "Never".',
  ...firstvisit.REVIEW
];

const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

// Checks a whole onboarding form. Returns { data } or { errors }.
function validate(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const data = {}, errors = {};
  for (const f of CK_FIELDS) {
    const v = src[f.k];
    if (v == null || v === '') continue;
    if (f.type === 'select') { if (f.options.includes(String(v))) data[f.k] = String(v); else errors[f.k] = 'Please choose from the list'; continue; }
    const s = clean(v, f.max);
    if (!s) continue;
    if (f.format === 'idnumber' && !/^[A-Za-z0-9][A-Za-z0-9 \/-]{2,39}$/.test(s)) { errors[f.k] = 'Enter the ID number (letters, numbers, spaces or dashes)'; continue; }
    if (f.format === 'gps') {
      const m = s.match(/^(-?\d{1,2}(?:\.\d+)?)\s*,\s*(-?\d{1,3}(?:\.\d+)?)$/);
      if (!m || Math.abs(Number(m[1])) > 90 || Math.abs(Number(m[2])) > 180) { errors[f.k] = 'Enter latitude, longitude (e.g. 9.9312, 76.2673)'; continue; }
      data[f.k] = Number(m[1]) + ', ' + Number(m[2]); continue;
    }
    if (f.format === 'url') { let u = null; try { u = new URL(s); } catch (e) { u = null; } if (!u || u.protocol !== 'https:') { errors[f.k] = 'Enter a link starting with https://'; continue; } data[f.k] = u.toString(); continue; }
    data[f.k] = s;
  }
  const fv = firstvisit.validate(src);
  if (fv.errors) Object.assign(errors, fv.errors); else Object.assign(data, fv.data);
  return Object.keys(errors).length ? { errors } : { data };
}

function definitions() {
  return {
    source: 'Copy of Data Collection - Caregiver First Visit.xlsx',
    sections: SECTIONS.map((s) => ({ id: s.id, title: s.title, sheet: s.sheet, groups: s.groups.map((g) => ({ title: g.title || null, fields: g.fields.map((f) => ({ ...f, section: undefined })) })) }))
  };
}

module.exports = { SECTIONS, CHECKLIST, FIELDS, BY_KEY, PHONE_KEYS, REVIEW, validate, definitions };
