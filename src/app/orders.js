// Buying a package in the app.
//
// An order holds the package, payment plan and the price worked out on the server from the published
// prices (packinfo). It is marked paid only after the payment is verified, and only then does the
// package become active. There is no online card/UPI gateway in this project yet, so payments are
// verified by the KareIQ office (the team sends a secure payment link or takes a bank transfer, then
// records the payment reference and amount here). A gateway can be added in verifyPayment() later.
//
// Statuses: awaiting_payment -> paid (package active) | failed | cancelled

const ORDER_STATUS = { awaiting_payment: 'Awaiting payment', paid: 'Paid, package active', failed: 'Payment failed', cancelled: 'Cancelled' };
const METHODS = { upi: 'UPI', card: 'Card', netbanking: 'Net banking', bank: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' };
const PAYMENT_MODE = process.env.PAYMENT_PROVIDER || 'manual';

// can this package be bought straight away? (packages priced "on call" need the team first)
function purchasable(pk) { return Boolean(pk && (pk.model === 'tiers' || pk.model === 'monthly' || pk.model === 'fixed')); }

// how long a bought package runs: { months, endDate } from the start date
function runFor(pk, months, startDate, addMonths) {
  if (pk.model === 'tiers' || pk.model === 'monthly') return { months, endDate: addMonths(startDate, months) };
  const len = String(pk.length || '').toLowerCase();
  const m = len.match(/(\d+)\s*month/);
  if (m) return { months: Number(m[1]), endDate: addMonths(startDate, Number(m[1])) };
  // Bystander visits (for 4, 8 or 24 hours): that day; round the clock runs into the next day
  const h = len.match(/(\d+)\s*hour/);
  if (h) { if (Number(h[1]) < 24) return { months: null, endDate: startDate }; const d = new Date(startDate + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 1); return { months: null, endDate: d.toISOString().slice(0, 10) }; }
  if (/day/.test(len)) return { months: null, endDate: startDate };
  if (/week/.test(len)) { const d = new Date(startDate + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + 6); return { months: null, endDate: d.toISOString().slice(0, 10) }; }
  return { months: null, endDate: null }; // one-time packages have no end date
}

function view(o, extra) {
  return {
    id: o.id, reference: o.reference, personId: o.personId, planId: o.planId, product: o.product, name: o.name, months: o.months || null, billing: o.billing,
    amount: o.amount, amountText: o.amountText, gst: o.gst || null, status: o.status, statusName: ORDER_STATUS[o.status] || o.status,
    createdAt: o.createdAt, updatedAt: o.updatedAt || null, paidAt: o.paidAt || null, failedNote: o.failedNote || null, ...(extra || {})
  };
}

module.exports = { ORDER_STATUS, METHODS, PAYMENT_MODE, purchasable, runFor, view };
