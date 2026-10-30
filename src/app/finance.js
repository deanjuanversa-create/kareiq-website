// Invoices, payments and revenue.
//
// An invoice is raised for every confirmed package (one per plan; the number is stable). What has
// been paid comes only from recorded payments (app_payments): a payment verified when an order is
// paid, or one the office records after checking the bank or payment account. Refunds are recorded
// the same way with a negative effect. Nothing unpaid is ever counted as collected.
//   billed      = sum of invoice amounts
//   collected   = payments - refunds
//   outstanding = what is still owed on each invoice
// An invoice is due DUE_DAYS after its date.
const care = require('./care');
const packinfo = require('./packinfo');
const { PRODUCTS, planName } = require('./products');

const DUE_DAYS = 7;
const BRAND_OF = (planId, product) => (/^kb-|^km-/.test(planId || '') ? 'karewellness' : product);
const BRAND_NAMES = { karehome: 'Kare@Home', karenest: 'KareNest', karewellness: 'KareWellness' };

function invoiceNo(pl) { return 'KQ-' + (pl.startDate || pl.createdAt.slice(0, 10)).replace(/-/g, '') + '-' + pl.id.replace(/[^A-Za-z0-9]/g, '').slice(-5).toUpperCase(); }
function addDays(date, n) { const d = new Date(date + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function daysBetween(a, b) { return Math.round((Date.parse(b + 'T12:00:00Z') - Date.parse(a + 'T12:00:00Z')) / 86400000); }

function create(ctx) {
  const { docs, todayIST } = ctx;
  // every invoice (or one person's), with what was paid on it
  async function invoices(filter) {
    const plans = (await docs.find('app_plans', filter && filter.personId ? { personId: filter.personId } : {})).filter((pl) => pl.status !== 'pending' && !pl.included && pl.planId);
    const pays = await docs.find('app_payments', filter && filter.personId ? { personId: filter.personId } : {});
    const out = [];
    for (const pl of plans) {
      const charge = await care.chargeOf(pl);
      const date = pl.startDate || pl.createdAt.slice(0, 10);
      const mine = pays.filter((p) => p.planId === pl.id);
      const paid = mine.filter((p) => p.kind === 'payment').reduce((s, p) => s + p.amount, 0);
      const refunded = mine.filter((p) => p.kind === 'refund').reduce((s, p) => s + p.amount, 0);
      const amount = charge.amount || 0;
      const outstanding = Math.max(0, amount - paid);
      const due = addDays(date, DUE_DAYS);
      const status = !amount ? 'quote' : refunded && refunded >= paid ? 'refunded' : paid >= amount ? 'paid' : paid > 0 ? 'partial' : 'unpaid';
      out.push({
        number: invoiceNo(pl), planId: pl.id, personId: pl.personId, product: pl.product, brand: BRAND_OF(pl.planId, pl.product), packageId: pl.planId, packageName: planName(pl.planId),
        productName: PRODUCTS[pl.product] ? PRODUCTS[pl.product].name : pl.product, months: pl.months || null, date, dueDate: due,
        period: pl.startDate ? { from: pl.startDate, to: pl.endDate } : null, description: charge.text, gst: charge.gst || null,
        amount, paid, refunded, outstanding, status, overdueDays: outstanding > 0 && due < todayIST() ? daysBetween(due, todayIST()) : 0,
        planStatus: pl.status, payments: mine.map((p) => ({ id: p.id, kind: p.kind, amount: p.amount, method: p.method, receivedAt: p.receivedAt }))
      });
    }
    return out.sort((a, b) => (a.date < b.date ? 1 : -1));
  }

  // money in (and refunds out) between two dates, with the invoice each belongs to
  async function payments(from, to) {
    const q = {};
    if (from || to) q.receivedAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to + 'T23:59:59' } : {}) };
    return docs.find('app_payments', q, { sort: { receivedAt: -1 } });
  }

  return { invoices, payments, DUE_DAYS, BRAND_OF, BRAND_NAMES, invoiceNo };
}

module.exports = { create, DUE_DAYS, BRAND_OF, BRAND_NAMES, invoiceNo, daysBetween, addDays };
