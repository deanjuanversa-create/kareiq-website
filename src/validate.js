// Server-side validation. The browser checks the same things for a quick
// response, but these checks are the ones that count.

const catalog = require('./catalog');
const content = require('./content');

function clean(value, max = 200) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001F\u007F]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cleanMultiline(value, max = 1000) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, ' ').trim().slice(0, max);
}

// Accepts 98765 43210, +91 98765-43210, 098765 43210 ...
// Returns +919876543210 or null.
function normalisePhone(value) {
  const digits = String(value || '').replace(/\D/g, '');
  let local = digits;
  if (local.length === 12 && local.startsWith('91')) local = local.slice(2);
  else if (local.length === 11 && local.startsWith('0')) local = local.slice(1);
  if (!/^[6-9]\d{9}$/.test(local)) return null;
  return `+91${local}`;
}

function validEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

function todayInIndia() {
  // YYYY-MM-DD in Asia/Kolkata
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
}

function validateBooking(body) {
  const errors = {};
  const name = clean(body.name, 80);
  const phone = normalisePhone(body.phone);
  const email = clean(body.email, 120);
  const area = clean(body.area, 120);
  const service = clean(body.service, 40);
  const pkg = clean(body.package, 40);
  const billing = clean(String(body.billing ?? ''), 4);
  const date = clean(body.date, 10);
  let time = clean(body.time, 20);
  if (time === 'afternoon') time = 'evening'; // pages opened before the slots changed
  const careFor = clean(body.careFor, 20);
  const notes = cleanMultiline(body.notes, 1000);

  if (name.length < 2) errors.name = 'Please enter your name.';
  if (!phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
  if (email && !validEmail(email)) errors.email = 'This email address looks incomplete.';
  if (area.length < 2) errors.area = 'Tell us your area or city so we can send the nearest caregiver.';
  if (!catalog.services[service]) errors.service = 'Choose a service.';
  if (!catalog.packages[pkg]) errors.package = 'Choose a care package, or "Not decided yet".';
  if (billing && !catalog.billingPlans[billing]) errors.billing = 'Choose a payment plan.';
  if (!catalog.careFor[careFor]) errors.careFor = 'Tell us who the care is for.';
  if (time && !catalog.timeSlots[time]) errors.time = 'Choose a time slot.';
  if (date) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.date = 'Choose a valid date.';
    else if (date < todayInIndia()) errors.date = 'Choose today or a later date.';
  }
  if (body.consent !== true && body.consent !== 'on' && body.consent !== 'true') {
    errors.consent = 'Please agree to be contacted about your request.';
  }

  return {
    errors,
    value: {
      name, phone, email, area, careFor, careForName: catalog.careFor[careFor] || '', notes,
      service, serviceName: catalog.services[service] || '',
      package: pkg, packageName: content.packageName(pkg) || (catalog.packages[pkg] ? catalog.packages[pkg].name : ''),
      billing: billing || null, billingName: billing ? catalog.billingPlans[billing] : null,
      date: date || null,
      time: time || null,
      timeName: time ? catalog.timeSlots[time] : null
    }
  };
}

function validateEnquiry(body) {
  const errors = {};
  const name = clean(body.name, 80);
  const phone = normalisePhone(body.phone);
  const email = clean(body.email, 120);
  const interest = clean(body.interest, 40);
  const message = cleanMultiline(body.message, 1000);
  const source = clean(body.source, 40) || 'kareiq';
  const planId = clean(body.plan, 40);
  const plan = planId ? catalog.enquiryPlan(planId) : null;

  if (name.length < 2) errors.name = 'Please enter your name.';
  if (!phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
  if (email && !validEmail(email)) errors.email = 'This email address looks incomplete.';
  if (!catalog.interests[interest]) errors.interest = 'Choose what you are interested in.';
  if (planId && !plan) errors.plan = 'Choose one of the packages on the website.';
  if (body.consent !== true && body.consent !== 'on' && body.consent !== 'true') {
    errors.consent = 'Please agree to be contacted about your request.';
  }

  return {
    errors,
    value: { name, phone, email, interest, interestName: catalog.interests[interest] || '', plan: plan ? plan.id : '', planName: plan ? plan.name : '', message, source }
  };
}

// Bystander caregiving support: booked straight from the KareIQ or Kare@Home website, no sign-in.
function validateBystander(body) {
  const errors = {};
  const B = catalog.bystander;
  const name = clean(body.name, 80);
  const phone = normalisePhone(body.phone);
  const email = clean(body.email, 120);
  const careFor = clean(body.careFor, 20);
  const pkg = clean(body.package, 40);
  const date = clean(body.date, 10);
  const startTime = clean(body.startTime, 5);
  const patientName = clean(body.patientName, 80);
  const patientAge = parseInt(clean(String(body.patientAge ?? ''), 3), 10);
  const patientGender = clean(body.patientGender, 10);
  const mobility = clean(body.mobility, 20);
  const needs = cleanMultiline(body.needs, 600);
  const location = clean(body.location, 10);
  const address = cleanMultiline(body.address, 300);
  const area = clean(body.area, 80);
  const pincode = clean(body.pincode, 6);
  const altPhoneRaw = clean(body.altPhone, 20);
  const altPhone = altPhoneRaw ? normalisePhone(altPhoneRaw) : null;
  const notes = cleanMultiline(body.notes, 1000);
  const page = clean(body.page, 20) === 'kareiq' ? 'kareiq' : 'kare-at-home';

  if (!/^by-/.test(pkg) || !catalog.packages[pkg]) errors.package = 'Choose Half Day, Full Day, Round the Clock or long-term.';
  if (!date) errors.date = 'Choose the date you need the Bystander.';
  else if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date))) errors.date = 'Choose a valid date.';
  else if (date < todayInIndia()) errors.date = 'Choose today or a later date.';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(startTime)) errors.startTime = 'Choose a start time.';
  if (name.length < 2) errors.name = 'Please enter your name.';
  if (!phone) errors.phone = 'Enter a 10-digit Indian mobile number.';
  if (altPhoneRaw && !altPhone) errors.altPhone = 'Enter a 10-digit mobile number, or leave this empty.';
  if (email && !validEmail(email)) errors.email = 'This email address looks incomplete.';
  if (!catalog.careFor[careFor]) errors.careFor = 'Tell us who the Bystander is for.';
  if (patientName.length < 2) errors.patientName = "Please enter the patient's name.";
  if (!(patientAge >= 1 && patientAge <= 120)) errors.patientAge = "Please enter the patient's age.";
  if (patientGender && !B.gender[patientGender]) errors.patientGender = 'Choose one of the options.';
  if (!B.mobility[mobility]) errors.mobility = 'Tell us how the patient moves around.';
  if (!B.location[location]) errors.location = 'Tell us where the service is needed.';
  if (address.length < 8) errors.address = 'Please enter the full address, including house or room number.';
  if (area.length < 2) errors.area = 'Enter the area or city.';
  if (!/^\d{6}$/.test(pincode)) errors.pincode = 'Enter the 6-digit PIN code.';
  if (body.consent !== true && body.consent !== 'on' && body.consent !== 'true') errors.consent = 'Please agree to be contacted about your request.';

  const [hh, mm] = startTime.split(':').map(Number);
  const timeName = Number.isNaN(hh) ? null : `${((hh + 11) % 12) + 1}:${String(mm).padStart(2, '0')} ${hh < 12 ? 'AM' : 'PM'}`;
  const patient = { name: patientName, age: Number.isNaN(patientAge) ? null : patientAge, gender: B.gender[patientGender] || '', mobility: B.mobility[mobility] || '', needs };
  // one readable summary for the admin page and the email alert
  const summary = [
    `Patient: ${patient.name}${patient.age ? ', ' + patient.age : ''}${patient.gender ? ', ' + patient.gender : ''} · ${patient.mobility}`,
    `Where: ${B.location[location] || ''} · ${address}, ${area} ${pincode}`,
    `Starts: ${date} at ${timeName || startTime}`,
    altPhone ? `Other contact: ${altPhone}` : '',
    needs ? `Care needs: ${needs}` : '',
    notes ? `Notes: ${notes}` : ''
  ].filter(Boolean).join('\n');
  return {
    errors,
    value: {
      name, phone, email, altPhone, careFor, careForName: catalog.careFor[careFor] || '',
      service: 'bystander', serviceName: catalog.services.bystander,
      package: pkg, packageName: catalog.packages[pkg] ? catalog.packages[pkg].name : '',
      billing: null, billingName: null, date: date || null, time: startTime || null, timeName,
      patient, location, locationName: B.location[location] || '', address, area, pincode,
      notes: summary, customerNotes: notes, page
    }
  };
}

module.exports = { validateBooking, validateEnquiry, validateBystander, normalisePhone };
