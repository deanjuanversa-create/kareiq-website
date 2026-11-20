// The customer lifecycle from a package request to nurse onboarding, enforced on the server:
//
//   1. the customer asks for a package (an order "Waiting for approval", or a plan request) -> an
//      enquiry in the office's Enquiry database
//   2. the KareIQ Operations Team (office logins) records the customer's General Information on the
//      enquiry; it is saved in the customer's own details record (app_details), with a version entry
//      naming the enquiry, so there is one customer record and the nurse sees it without re-entering it
//   3. the office approves the requested package (only after step 2) -> the order waits for payment
//   4. the payment is verified (the existing order payment check, or a payment recorded on the invoice)
//      and the package is active
//   5. only then is the customer eligible for onboarding by an assigned nurse
//   6. the nurse submits the one-time onboarding (features.js); the customer's page under the nurse's
//      Assigned customers shows the completed details
//
// Nothing here trusts the screens: eligibility is worked out from the stored plan, its approval and
// the payments recorded against its invoice.

const firstvisit = require('./firstvisit');

// General Information: the fields the Operations Team captures (the workbook's own names and lists)
const GENERAL_KEYS = ['name', 'dob', 'gender', 'bloodGroup', 'qualification', 'languages', 'address', 'email', 'phone1', 'phone2'];
const GENERAL_LABELS = { name: 'Name', dob: 'Date of Birth', age: 'Age', gender: 'Gender', bloodGroup: 'Blood Group', qualification: 'Qualifications', languages: 'Languages Spoken', address: 'Address', email: 'Email', phone1: 'Primary Contact Number', phone2: 'Secondary Contact Number' };
const REQUIRED = ['name', 'phone1'];

// the General Information fields, in order, as the forms show them (Age is worked out from the date of birth)
function generalFields() {
  return ['name', 'dob', 'age', 'gender', 'bloodGroup', 'qualification', 'languages', 'address', 'email', 'phone1', 'phone2'].map((k) => {
    const f = firstvisit.BY_KEY[k] || { k, type: 'computed' };
    return { ...f, k, label: GENERAL_LABELS[k], required: REQUIRED.includes(k) };
  });
}

// validate only the General Information fields; the other details stay as they are
function validateGeneral(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const only = {};
  for (const k of GENERAL_KEYS) if (src[k] !== undefined) only[k] = src[k];
  const v = firstvisit.validate(only);
  const errors = { ...(v.errors || {}) };
  const data = v.data || {};
  for (const k of REQUIRED) if (!data[k] && !errors[k]) errors[k] = GENERAL_LABELS[k] + ' is required';
  return Object.keys(errors).length ? { errors } : { data: Object.fromEntries(GENERAL_KEYS.filter((k) => data[k] != null).map((k) => [k, data[k]])) };
}

const STAGES = {
  requested: 'Request received',
  info: 'General information captured',
  approved: 'Package approved, waiting for payment',
  active: 'Paid, package active',
  onboarded: 'Onboarding completed',
  rejected: 'Request declined',
  cancelled: 'Cancelled'
};

function create(ctx) {
  const { docs, finance, todayIST } = ctx;

  // has the payment for this plan been confirmed? (its invoice is fully paid from recorded payments)
  // (an order paid in full and verified by the office, or the plan's invoice paid in full from recorded payments)
  async function paymentConfirmed(plan, invoices) {
    if (plan.orderId) {
      const o = await docs.findOne('app_orders', { id: plan.orderId });
      if (o && o.status === 'paid' && o.payment && o.payment.verifiedBy && Math.round(o.payment.amount) === Math.round(o.amount)) {
        const refunds = (await docs.find('app_payments', { planId: plan.id, kind: 'refund' })).reduce((n, x) => n + x.amount, 0);
        if (refunds < o.amount) return true;
      }
    }
    const inv = (invoices || await finance.invoices({ personId: plan.personId })).find((i) => i.planId === plan.id);
    return Boolean(inv && inv.amount > 0 && inv.status === 'paid');
  }

  // Is this customer eligible for onboarding? An active, unexpired package that the office approved and
  // whose payment is confirmed. Returns the reasons when not.
  async function eligibility(personId) {
    const today = todayIST();
    const plans = (await docs.find('app_plans', { personId })).filter((p) => !p.included && p.planId);
    const invoices = await finance.invoices({ personId });
    const reasons = new Set();
    let best = null;
    for (const pl of plans) {
      if (pl.status === 'pending') { reasons.add(pl.approval && pl.approval.status === 'approved' ? 'The package is approved; the payment is not confirmed yet.' : 'The package request has not been approved by the office yet.'); continue; }
      if (pl.status !== 'active' || (pl.endDate && pl.endDate < today)) continue;
      if (!pl.approval || pl.approval.status !== 'approved') { reasons.add('The package was not approved by the office through a package request.'); continue; }
      if (!(await paymentConfirmed(pl, invoices))) { reasons.add('The payment for the package is not confirmed yet.'); continue; }
      best = pl;
      break;
    }
    if (!plans.length) reasons.add('No package has been requested yet.');
    const orders = await docs.find('app_orders', { personId });
    if (!best && orders.some((o) => o.status === 'awaiting_approval')) reasons.add('The package request has not been approved by the office yet.');
    if (!best && orders.some((o) => o.status === 'awaiting_payment')) reasons.add('The package is approved; the payment is not confirmed yet.');
    // the step furthest along first (an approved, unpaid package matters more than an older waiting request)
    const rank = (x) => (/payment/.test(x) ? 0 : /not approved by the office through/.test(x) ? 1 : /not been approved/.test(x) ? 2 : 3);
    return best ? { eligible: true, plan: best, reasons: [] } : { eligible: false, plan: null, reasons: [...reasons].sort((a, b) => rank(a) - rank(b)) };
  }

  // Where a request stands (for the office's enquiry and the customer's own view)
  async function requestState(enq) {
    if (!enq) return null;
    const order = enq.orderId ? await docs.findOne('app_orders', { id: enq.orderId }) : null;
    let plan = enq.appPlanId ? await docs.findOne('app_plans', { id: enq.appPlanId }) : null;
    const linked = order && !order.requestPlanId && order.planRowId ? await docs.findOne('app_plans', { id: order.planRowId }) : null;
    if (!plan && linked) plan = linked;
    const ord = order || (plan && plan.orderId ? await docs.findOne('app_orders', { id: plan.orderId }) : null);
    const info = enq.generalInfo || null;
    let stage = 'requested';
    if (info) stage = 'info';
    const approval = (ord && ord.approval) || (plan && plan.approval) || null;
    if (ord && ['awaiting_payment', 'paid'].includes(ord.status)) stage = 'approved';
    if (plan && plan.approval && plan.approval.status === 'approved' && plan.status === 'pending') stage = 'approved';
    if ((ord && ord.status === 'paid') || (plan && plan.status === 'active' && plan.approval)) stage = 'active';
    if (ord && ord.status === 'rejected') stage = 'rejected';
    if (ord && ord.status === 'cancelled' && stage !== 'active') stage = 'cancelled';
    if (plan && plan.approval && plan.approval.status === 'rejected') stage = 'rejected';
    const personId = enq.personId || (ord && ord.personId) || (plan && plan.personId) || null;
    if (stage === 'active' && personId && await docs.findOne('app_onboarding', { id: 'onb-' + personId })) stage = 'onboarded';
    const elig = personId ? await eligibility(personId) : { eligible: false, reasons: [] };
    return {
      kind: enq.kind, stage, stageName: STAGES[stage], personId, generalInfo: info,
      order: ord ? { id: ord.id, reference: ord.reference, status: ord.status, amount: ord.amount, amountText: ord.amountText, planId: ord.planId, name: ord.name } : null,
      plan: plan ? { id: plan.id, planId: plan.planId, status: plan.status, months: plan.months || null } : null,
      approval, eligible: elig.eligible, eligibilityReasons: elig.reasons,
      canApprove: Boolean(info) && ((ord && ord.status === 'awaiting_approval') || (!ord && plan && plan.status === 'pending' && !(plan.approval && plan.approval.status === 'approved'))),
      canReject: (ord && ord.status === 'awaiting_approval') || (!ord && plan && plan.status === 'pending' && !(plan.approval && plan.approval.status === 'approved'))
    };
  }

  // once a customer becomes eligible, their assigned nurses are told (once)
  async function announce(personId) {
    if (!personId || await docs.findOne('app_onboarding', { id: 'onb-' + personId })) return false;
    const el = await eligibility(personId);
    if (!el.eligible) return false;
    const nurses = (await docs.find('app_links', { personId, kind: 'caregiver' })).map((l) => l.userId);
    const person = await docs.findOne('app_people', { id: personId });
    const told = await docs.find('app_notifications', { kind: 'onboarding-ready' });
    const fresh = [...new Set(nurses)].filter((id) => !told.some((n) => n.userId === id && n.personId === personId));
    if (fresh.length && ctx.scheduler) await ctx.scheduler.notify(fresh, { kind: 'onboarding-ready', personId, title: 'Ready for onboarding', body: `${person ? person.name : personId}: the package is approved and paid. Complete the onboarding at the first visit.`, link: '#/nurse/onboarding' });
    return true;
  }

  return { eligibility, paymentConfirmed, requestState, announce };
}

module.exports = { create, GENERAL_KEYS, GENERAL_LABELS, REQUIRED, STAGES, generalFields, validateGeneral };
