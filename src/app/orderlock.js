// One change at a time per order, and one order per payment transaction number.
//
// Recording a payment is several writes (the plan, the payment row, the order). Two office admins
// clicking "Record payment" at the same moment, or a double-click, used to both pass the "is it
// still awaiting payment?" check and activate the package twice. Now:
//   withOrderLock(id, fn)  runs fn while holding a lock record for that order (insertOnce: atomic on
//                          every storage mode); a second caller gets { busy: true } straight away.
//                          A lock left by a crashed request expires after LOCK_MS.
//   claimRef(ref, orderId) reserves a transaction/receipt number for one order, permanently
//                          (atomic too), so the same number can never be recorded on two orders.
// Status changes themselves use docs.updateIf (compare-and-set), so a late "cancel" or "decline"
// can never overwrite a paid order.

const docs = require('../docs');

const LOCK_MS = 2 * 60 * 1000;

async function withOrderLock(orderId, fn) { return withLock('order:' + orderId, fn); }

// the same lock for anything else that must change one step at a time: an invoice ('invoice:<planId>')
// or an add-on bill ('addon:<billId>') while a payment or refund is checked against what is owed
async function withLock(id, fn) {
  let got = await docs.insertOnce('app_order_locks', { id, at: Date.now() });
  if (!got) {
    const held = await docs.findOne('app_order_locks', { id });
    if (held && Date.now() - held.at > LOCK_MS) { await docs.remove('app_order_locks', id); got = await docs.insertOnce('app_order_locks', { id, at: Date.now() }); }
  }
  if (!got) return { busy: true };
  try { return { value: await fn() }; } finally { await docs.remove('app_order_locks', id); }
}

const refKey = (ref) => 'ref:' + String(ref || '').trim().toLowerCase().replace(/\s+/g, '');

// true: reserved for this order (or already reserved by it); false: used by another order
async function claimRef(ref, orderId) {
  const id = refKey(ref);
  if (await docs.insertOnce('app_payment_refs', { id, orderId, at: new Date().toISOString() })) return true;
  const row = await docs.findOne('app_payment_refs', { id });
  return Boolean(row && row.orderId === orderId);
}
async function releaseRef(ref, orderId) {
  const id = refKey(ref);
  const row = await docs.findOne('app_payment_refs', { id });
  if (row && row.orderId === orderId) await docs.remove('app_payment_refs', id);
}

module.exports = { withOrderLock, withLock, claimRef, releaseRef, LOCK_MS };
