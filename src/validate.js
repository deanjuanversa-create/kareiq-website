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

module.exports = { validateBooking, validateEnquiry, normalisePhone };
