// node tools/check-payments.js http://localhost:3000 [data folder]
// Payments recorded by the office, under concurrency (against a fresh demo server: APP_DEMO=true,
// empty data folder). With the server's data folder, it also counts the plans and payment rows in
// storage. Covers: simultaneous "Record payment" clicks, a cancel racing a payment, the same
// transaction number on two orders at once, states that must not go back, and legitimate retries.
const fs = require('fs');
const path = require('path');
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '') + '/api/app/';
const DATA = process.argv[3] || null;
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log('PASS  ' + m); } else { fail++; console.log('FAIL  ' + m); } };
const rows = (col) => { if (!DATA) return null; try { return JSON.parse(fs.readFileSync(path.join(DATA, col + '.json'), 'utf8')); } catch { return []; } };

async function login(id) {
  let cookie = '', csrf = '';
  const call = async (method, p, body) => {
    const h = { 'X-Requested-With': 'kareiq', cookie };
    if (csrf) h['X-CSRF'] = csrf;
    if (body) h['Content-Type'] = 'application/json';
    const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
    const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
    return { status: r.status, body: j };
  };
  const r = await call('POST', 'login', { id, password: 'demo-pass-123' });
  if (r.status !== 200) throw new Error('login failed for ' + id);
  csrf = (await call('GET', 'session')).body.csrf;
  return call;
}

(async () => {
  const office = await login('admin@demo.kareiq'), office2 = await login('admin@demo.kareiq'), rahul = await login('rahul@demo.kareiq');
  const P = 'P-DEMO03';
  const general = { name: 'Saraswathi Menon', dob: '1955-03-02', gender: 'Female', bloodGroup: 'A+', qualification: 'Degree', languages: 'Malayalam, English', address: '4 Lake View, Kochi (demo)', email: 'sara.demo@example.com', phone1: '9812300011', phone2: '9812300022' };
  // a customer request, approved by the office: an order waiting for its payment
  let n = 0;
  async function awaiting(planId) {
    const r = await rahul('POST', 'people/' + P + '/orders', { planId, months: '3', agree: true, idem: 'chk-pay-' + planId + '-' + (++n) });
    if (r.status !== 201) throw new Error('order for ' + planId + ': ' + r.status + ' ' + JSON.stringify(r.body).slice(0, 120));
    const order = r.body.order;
    const lead = (await office('GET', 'admin/leads?size=100')).body.rows.find((l) => l.enquiryId === order.enquiryRef);
    const g = (await office('GET', 'admin/leads/enquiry/' + lead.id)).body.general;
    await office('POST', 'admin/leads/enquiry/' + lead.id + '/general', { data: general, version: g ? g.version : 0 });
    const a = await office('POST', 'admin/leads/enquiry/' + lead.id + '/approve', { note: 'payments check' });
    if (a.status !== 200) throw new Error('approve ' + planId + ': ' + a.status + ' ' + JSON.stringify(a.body).slice(0, 160));
    return { ...order, leadId: lead.id };
  }
  const orderNow = async (id) => (await office('GET', 'admin/orders')).body.rows.find((o) => o.id === id);
  const verify = (who, o, ref, amount) => who('POST', 'admin/orders/' + o.id + '/verify', { method: 'upi', paymentRef: ref, amount: amount == null ? o.amount : amount });

  // ---- 1. six simultaneous "Record payment" requests for one order (two admin sessions)
  const A = await awaiting('homeplus');
  ok((await orderNow(A.id)).status === 'awaiting_payment', 'order A approved and waiting for payment');
  let rs = await Promise.all([0, 1, 2, 3, 4, 5].map((i) => verify(i % 2 ? office2 : office, A, 'UPI-RACE-A1')));
  const codes = rs.map((r) => r.status).sort().join(',');
  ok(rs.filter((r) => r.status === 200).length === 1 && rs.filter((r) => r.status === 409).length === 5, 'six simultaneous payments for one order: exactly one recorded, five refused (' + codes + ')');
  ok((await orderNow(A.id)).status === 'paid', 'order A is paid');
  if (DATA) {
    ok(rows('app_plans').filter((p) => p.orderId === A.id).length === 1, 'storage: exactly one plan activated for order A');
    ok(rows('app_payments').filter((p) => p.orderId === A.id).length === 1, 'storage: exactly one payment row for order A');
  }
  ok((await verify(office, A, 'UPI-RACE-A2')).status === 409, 'a paid order cannot be paid again (new transaction number)');
  // ---- 2. states never go back: cancel, fail and decline after payment
  ok((await office('POST', 'admin/orders/' + A.id + '/cancel', {})).status === 409 && (await office('POST', 'admin/orders/' + A.id + '/fail', {})).status === 409, 'office cancel / fail after payment refused');
  ok((await rahul('POST', 'orders/' + A.id + '/cancel', {})).status === 409, 'customer cancel after payment refused');
  ok((await office('POST', 'admin/leads/enquiry/' + A.leadId + '/reject', { note: 'too late to decline' })).status === 409, 'declining the request after payment refused');
  ok((await orderNow(A.id)).status === 'paid', 'order A is still paid');

  // ---- 3. a payment racing a cancel (office and customer): one consistent outcome
  const B = await awaiting('homeelite');
  rs = await Promise.all([verify(office, B, 'UPI-RACE-B1'), office2('POST', 'admin/orders/' + B.id + '/cancel', {}), rahul('POST', 'orders/' + B.id + '/cancel', {}), verify(office2, B, 'UPI-RACE-B1')]);
  const b = await orderNow(B.id);
  const planB = DATA ? rows('app_plans').filter((p) => p.orderId === B.id && p.status === 'active').length : null;
  const payB = DATA ? rows('app_payments').filter((p) => p.orderId === B.id).length : null;
  ok(['paid', 'cancelled'].includes(b.status) && rs.filter((r) => r.status === 200).length === 1, 'payment racing two cancels: exactly one action wins (' + rs.map((r) => r.status).join(',') + ' -> ' + b.status + ')');
  if (DATA) ok(b.status === 'paid' ? planB === 1 && payB === 1 : planB === 0 && payB === 0, 'storage matches the outcome (' + b.status + ': ' + planB + ' active plan, ' + payB + ' payment)');

  // ---- 4. the same transaction number on two orders at the same moment
  const C = await awaiting('homestart'), D = await awaiting('kareplus');
  rs = await Promise.all([verify(office, C, 'UPI-SHARED-1'), verify(office2, D, 'UPI-SHARED-1')]);
  ok(rs.filter((r) => r.status === 200).length === 1 && rs.some((r) => r.status === 409 && /already recorded/.test(r.body.message)), 'one transaction number, two orders at once: recorded on one only (' + rs.map((r) => r.status).join(',') + ')');
  const loser = rs[0].status === 200 ? D : C;
  // ---- 5. legitimate retries still work
  ok((await verify(office, loser, 'UPI-RETRY-1', 1)).status === 400, 'a wrong amount is refused (nothing recorded)');
  ok((await orderNow(loser.id)).status === 'awaiting_payment', 'the order is still waiting after the refused attempt');
  ok((await verify(office, loser, 'UPI-RETRY-1')).status === 200, 'retry with the right amount and its own transaction number: recorded');
  ok((await verify(office, A, 'UPI-RETRY-1')).status === 409, 'that number cannot be reused on another order either');
  if (DATA) ok(rows('app_payment_refs').length >= 3 && !rows('app_order_locks').length, 'storage: transaction numbers reserved, no order lock left behind');

  // ---- 6. invoice payments and refunds (Finance), at the same moment
  const fin = await login('finance@demo.kareiq'), fin2 = await login('finance@demo.kareiq');
  const invoices = async () => (await fin('GET', 'admin/finance/invoices?size=500')).body.rows || [];
  const open = (await invoices()).filter((i) => i.outstanding > 0);
  if (open.length < 2) ok(false, 'the demo data has two invoices with something outstanding (found ' + open.length + ')');
  else {
    const [i1, i2] = open;
    const pay = (who, inv, ref, amount) => who('POST', 'admin/finance/payments', { planId: inv.planId, method: 'bank', ref, amount: amount == null ? inv.outstanding : amount });
    rs = await Promise.all([0, 1, 2, 3].map((k) => pay(k % 2 ? fin2 : fin, i1, 'NEFT-SAME-1')));
    ok(rs.filter((r) => r.status === 201).length === 1, 'four simultaneous payments with one transaction number: one recorded (' + rs.map((r) => r.status).join(',') + ')');
    rs = await Promise.all([0, 1, 2].map((k) => pay(k % 2 ? fin2 : fin, i2, 'NEFT-DIFF-' + k)));
    const after2 = (await invoices()).find((i) => i.planId === i2.planId);
    ok(rs.filter((r) => r.status === 201).length === 1 && after2.outstanding === 0 && after2.paid <= after2.amount, 'three simultaneous full payments (different numbers): one recorded, the invoice is not overpaid (' + rs.map((r) => r.status).join(',') + ')');
    if (DATA) ok(rows('app_payments').filter((p) => p.planId === i2.planId && p.kind === 'payment' && /^NEFT-DIFF-/.test(p.ref)).length === 1, 'storage: one payment row for that invoice');
    const paidInv = (await invoices()).find((i) => i.planId === i2.planId);
    const can = paidInv.paid - paidInv.refunded;
    rs = await Promise.all([0, 1, 2].map((k) => (k % 2 ? fin2 : fin)('POST', 'admin/finance/refunds', { planId: paidInv.planId, amount: can, ref: 'RFND-' + k, reason: 'concurrency check' })));
    const afterR = (await invoices()).find((i) => i.planId === i2.planId);
    ok(rs.filter((r) => r.status === 201).length === 1 && afterR.refunded <= afterR.paid, 'three simultaneous full refunds: one recorded, never more than was paid (' + rs.map((r) => r.status).join(',') + ')');
    ok((await pay(fin, i1, 'NEFT-SAME-1', 1)).status === 409 || (await invoices()).find((i) => i.planId === i1.planId).outstanding === 0, 'a recorded transaction number is not accepted again');
  }

  // ---- 7. add-on bill payments (a paid add-on, done by the nurse, priced and billed: as in check-teams-growth)
  {
    const fam = await login('family@demo.kareiq'), nurse = await login('nurse@demo.kareiq');
    const day = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
    const bk = await fam('POST', 'people/P-DEMO01/services', { service: 'teleconsultation', date: day, time: 'morning' });
    const vis = bk.status === 201 ? ((await office('GET', 'admin/scheduler/visits?from=' + day + '&to=' + day)).body.rows || []).find((x) => x.service === 'teleconsultation' && x.personId === 'P-DEMO01') : null;
    if (vis) {
      const me = (await nurse('GET', 'session')).body.user;
      if (vis.nurseId !== me.id) await office('POST', 'admin/scheduler/visits/' + vis.id + '/assign', { nurseId: me.id, note: 'payments check' });
      await nurse('POST', 'nurse/visits/' + vis.id + '/status', { status: 'in_progress' });
      await nurse('POST', 'nurse/visits/' + vis.id + '/status', { status: 'completed' });
    }
  }
  await fin('POST', 'admin/fin/addons/prices', { prices: { teleconsultation: '400', dressing: '300' } });
  let ad = (await fin('GET', 'admin/fin/addons')).body;
  const famWith = (ad.families || []).find((f) => (f.charges || []).some((c) => c.status === 'unbilled' && c.amount > 0));
  if (famWith) await fin('POST', 'admin/fin/addons/bill', { personId: famWith.personId });
  ad = (await fin('GET', 'admin/fin/addons')).body;
  const bill = (ad.bills || []).find((x) => x.due > 0);
  if (!bill) console.log('SKIP  add-on bill payments: the demo data has no unbilled add-on charges to bill (code reviewed, not exercised)');
  else {
    rs = await Promise.all([0, 1, 2].map((k) => (k % 2 ? fin2 : fin)('POST', 'admin/fin/addons/bills/' + bill.id + '/pay', { amount: bill.due, method: 'upi', ref: 'AO-PAY-' + k })));
    const b2 = ((await fin('GET', 'admin/fin/addons')).body.bills || []).find((x) => x.id === bill.id);
    ok(rs.filter((r) => r.status === 201).length === 1 && b2.paid <= b2.amount + 0.001, 'three simultaneous full payments of one add-on bill: one recorded, not overpaid (' + rs.map((r) => r.status).join(',') + ')');
  }

  // ---- 8. expenses: approval racing a withdrawal, and "paid" twice
  const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const ex = await fin('POST', 'admin/fin/expenses', { date: today, category: 'supplies', amount: '1200', vendor: 'Concurrency Medical', description: 'check' });
  ok(ex.status === 201, 'finance records an expense');
  rs = await Promise.all([office('POST', 'admin/fin/expenses/' + ex.body.id + '/approve', {}), fin('POST', 'admin/fin/expenses/' + ex.body.id + '/cancel', {}), office2('POST', 'admin/fin/expenses/' + ex.body.id + '/approve', {})]);
  const exRow = ((await office('GET', 'admin/fin/expenses?size=500')).body.rows || []).find((x) => x.id === ex.body.id);
  ok(rs.filter((r) => r.status === 200).length === 1 && exRow && ['approved', 'cancelled'].includes(exRow.status), 'approval racing a withdrawal: exactly one applies (' + rs.map((r) => r.status).join(',') + ' -> ' + (exRow && exRow.status) + ')');
  if (exRow && exRow.status === 'approved') {
    rs = await Promise.all([office('POST', 'admin/fin/expenses/' + ex.body.id + '/paid', { ref: 'EXP-PAY-1' }), office2('POST', 'admin/fin/expenses/' + ex.body.id + '/paid', { ref: 'EXP-PAY-2' })]);
    const ex2 = ((await office('GET', 'admin/fin/expenses?size=500')).body.rows || []).find((x) => x.id === ex.body.id);
    ok(rs.filter((r) => r.status === 200).length === 1 && ex2.status === 'paid' && (ex2.history || []).filter((h) => h.action === 'paid').length <= 1, 'two simultaneous "paid" clicks: one applies (' + rs.map((r) => r.status).join(',') + ')');
  }
  console.log(`check-payments: PASS ${pass} FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.log('ERROR', e.message); process.exit(1); });
