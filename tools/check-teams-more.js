// Checks the last round of the team dashboards (src/app/teamsmore.js).
// 1. Without a server: the permission table.
// 2. Against a fresh demo server (APP_DEMO=true, empty data folder):
//      APP_DEMO=true node server.js        then:   node tools/check-teams-more.js http://localhost:3000
//    Finance: renewals, vendor bills, the accounts export (journal and Tally XML).
//    HR: salaries and payslips (own payslips only), the exit checklist, recruitment to employee, probation and reviews.
//    Operations: nurse suggestions, actual visit times, supplies with low-stock alerts.
//    Sales: pipeline, renewal leads, message templates, commission (rate set by the admin only).
const access = require('../src/app/access');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// ---------------------------------------------------------------- 1. without a server
const A = (role, path, method) => access.allows(role, path, method || 'GET');
ok(A('finance', 'fin/bills', 'POST') && A('finance', 'fin/export') && A('finance', 'fin/renewals'), 'finance: bills, export, renewals');
ok(!A('finance', 'hr/salaries') && !A('finance', 'hr/payslips') && !A('sales', 'hr/payslips') && !A('operations', 'hr/salaries'), 'salaries and payslips are HR\'s only');
ok(A('hr', 'hr/payslips/issue', 'POST') && A('hr', 'hr/exits/u1/step', 'POST') && A('hr', 'hr/candidates', 'POST') && A('hr', 'hr/reviews/u1/add', 'POST'), 'hr: payslips, exits, recruitment, reviews');
ok(A('operations', 'ops/supplies', 'POST') && A('operations', 'ops/suggestions') && !A('operations', 'fin/bills') && !A('sales', 'ops/supplies'), 'operations: supplies and suggestions; others not');
ok(A('sales', 'sales/pipeline') && A('sales', 'sales/templates', 'POST') && A('sales', 'sales/commission'), 'sales: pipeline, templates, commission');
ok(access.teamMayUse('me/payslips') && access.teamMayUse('me/payslips/x/pdf') && !access.teamMayUse('me/other'), 'team logins: their own payslips');

// ---------------------------------------------------------------- 2. the server
const URL0 = process.argv[2];
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
async function server() {
  const BASE = URL0.replace(/\/$/, '') + '/api/app/';
  function client() {
    let cookie = '', csrf = '';
    const call = async (method, p, body) => {
      const h = { 'X-Requested-With': 'kareiq', cookie };
      if (csrf) h['X-CSRF'] = csrf;
      if (body) h['Content-Type'] = 'application/json';
      const r = await fetch(BASE + p, { method, headers: h, body: body ? JSON.stringify(body) : undefined });
      const sc = r.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
      const t = await r.text(); let j; try { j = JSON.parse(t); } catch (e) { j = t; }
      return { status: r.status, body: j, text: t, type: r.headers.get('content-type') || '' };
    };
    call.session = async () => { csrf = (await call('GET', 'session')).body.csrf; };
    return call;
  }
  async function login(id) {
    const call = client();
    const r = await call('POST', 'login', { id, password: 'demo-pass-123' });
    if (r.status !== 200) throw new Error('login failed for ' + id + ': ' + r.text);
    await call.session();
    return call;
  }
  const [admin, fin, hr, ops, sales, nurse, fam] = await Promise.all(['admin', 'finance', 'hr', 'ops', 'sales', 'nurse', 'family'].map((x) => login(x + '@demo.kareiq')));
  const me = async (c) => (await c('GET', 'session')).body.user;
  const hrMe = await me(hr), salesMe = await me(sales), nurseMe = await me(nurse);

  // ======================================== Finance
  const person = (await admin('POST', 'admin/people', { name: 'Renewal Check Customer' })).body.person;
  const pl = await admin('POST', 'admin/plans', { personId: person.id, product: 'karehome', planId: 'homeplus', months: 1, startDate: addDays(today, -20) });
  ok(pl.status === 201 || pl.status === 200, 'admin adds a package that ends soon');
  const rn = await fin('GET', 'admin/fin/renewals');
  const mine = rn.body.rows && rn.body.rows.find((r) => r.personId === person.id);
  ok(rn.status === 200 && mine && mine.daysLeft >= 0 && mine.daysLeft <= 30 && !mine.lead, 'finance: the ending package is listed for renewal, no lead yet');
  ok((await sales('GET', 'admin/fin/renewals')).status === 403 && (await hr('GET', 'admin/fin/renewals')).status === 403, 'renewals list is not for sales or HR');
  const mk = await sales('POST', 'admin/sales/renewal-leads', {});
  ok(mk.status === 200 && mk.body.made >= 1, 'sales: renewal leads are made for ending packages');
  ok((await sales('POST', 'admin/sales/renewal-leads', {})).body.made === 0, 'a renewal lead is made only once per package');
  const rn2 = (await fin('GET', 'admin/fin/renewals')).body.rows.find((r) => r.personId === person.id);
  ok(rn2 && rn2.lead && /^KQ-/.test(rn2.lead.enquiryId), 'finance sees the renewal lead on the ending package');
  const pipe = await sales('GET', 'admin/sales/pipeline');
  const rcard = pipe.body.columns && pipe.body.columns.find((c) => c.key === 'new').cards.find((c) => c.renewal && c.enquiryId === rn2.lead.enquiryId);
  ok(pipe.status === 200 && pipe.body.columns.length === 5 && rcard && rcard.sourceName === 'Package renewal', 'sales: the pipeline board has 5 columns and the renewal lead under New');
  const famHome = (await fin('GET', 'admin/fin/overview')).body;
  ok(famHome.todo && famHome.todo.some((t) => /packages ending/.test(t.label)), 'finance: "Needs your attention" counts packages ending soon');

  // vendor bills
  const b0 = await fin('POST', 'admin/fin/bills', { vendor: 'MedSupply Co', billNo: 'MS-101', amount: '5,000', date: addDays(today, -40), dueDate: addDays(today, -10), category: 'supplies', description: 'Gloves and strips' });
  ok(b0.status === 201, 'finance records a supplier bill');
  ok((await fin('POST', 'admin/fin/bills', { vendor: 'MedSupply Co', billNo: 'ms-101', amount: '10', date: today, dueDate: today, category: 'supplies' })).status === 400, 'the same supplier bill number cannot be recorded twice');
  ok((await fin('POST', 'admin/fin/bills', { vendor: 'X', billNo: '', amount: '0', date: addDays(today, 3), dueDate: '', category: 'nope' })).body.errors.billNo, 'a bill without its details is refused');
  let bl = (await fin('GET', 'admin/fin/bills')).body;
  let bill = bl.rows.find((b) => b.id === b0.body.id);
  ok(bill && bill.status === 'unpaid' && bill.overdueDays === 10 && bl.totals.overdue >= 5000, 'the bill is unpaid and 10 days overdue');
  ok((await fin('POST', 'admin/fin/bills/' + bill.id + '/pay', { amount: 6000, date: today, method: 'bank' })).status === 400, 'cannot pay more than is owed');
  ok((await fin('POST', 'admin/fin/bills/' + bill.id + '/pay', { amount: 2000, date: today, method: 'upi', ref: 'UPI-1' })).status === 200, 'a part payment is recorded');
  bill = (await fin('GET', 'admin/fin/bills')).body.rows.find((b) => b.id === b0.body.id);
  ok(bill.status === 'partial' && bill.due === 3000, 'the bill is part paid with 3000 owed');
  ok((await fin('POST', 'admin/fin/bills/' + bill.id + '/cancel', { reason: 'mistake' })).status === 400, 'a bill with payments cannot be cancelled');
  ok((await sales('GET', 'admin/fin/bills')).status === 403 && (await ops('POST', 'admin/fin/bills', {})).status === 403, 'bills are Finance\'s only');
  const rep = await fin('GET', 'admin/fin/reports/bills.csv');
  ok(rep.status === 200 && /MedSupply Co,MS-101/.test(rep.text), 'vendor bills report');

  // accounts export
  const ex = await fin('GET', 'admin/fin/export?from=2020-01-01&to=' + today);
  ok(ex.status === 200 && ex.body.count > 0 && ex.body.byType.some((t) => t.type === 'Purchase') && ex.body.byType.some((t) => t.type === 'Receipt') && ex.body.ledgers.includes('Creditor - MedSupply Co'), 'export summary: sales, receipts, purchases and ledgers');
  const csv = await fin('GET', 'admin/fin/export?from=2020-01-01&to=' + today + '&format=csv');
  const lines = csv.text.trim().split('\n').slice(1).map((l) => l.split(','));
  const sum = (i) => lines.reduce((s, l) => s + (Number(l[i]) || 0), 0);
  ok(csv.status === 200 && /^Date,Voucher type/.test(csv.text) && Math.abs(sum(4) - sum(5)) < 0.01, 'journal CSV: debits equal credits');
  const xml = await fin('GET', 'admin/fin/export?from=2020-01-01&to=' + today + '&format=tally');
  ok(xml.status === 200 && /xml/.test(xml.type) && /<TALLYREQUEST>Import Data<\/TALLYREQUEST>/.test(xml.text) && /<VOUCHER VCHTYPE="Purchase"/.test(xml.text) && /<AMOUNT>-5000.00<\/AMOUNT>/.test(xml.text), 'Tally XML: vouchers with debits negative');
  ok((await hr('GET', 'admin/fin/export')).status === 403, 'export is Finance\'s only');

  // ======================================== HR
  const sal = await hr('GET', 'admin/hr/salaries');
  ok(sal.status === 200 && sal.body.rows.some((r) => r.userId === nurseMe.id && !r.salary), 'hr: salaries list, nurse without a salary yet');
  ok((await hr('POST', 'admin/hr/salaries/' + nurseMe.id, { earnings: {}, effectiveFrom: today })).body.errors.e_basic, 'a salary needs at least the basic');
  ok((await hr('POST', 'admin/hr/salaries/' + nurseMe.id, { earnings: { basic: 10000 }, deductions: { other: 20000 }, effectiveFrom: today })).body.errors.d_other, 'deductions cannot exceed the salary');
  ok((await hr('POST', 'admin/hr/salaries/' + nurseMe.id, { earnings: { basic: '18,000', hra: 6000, special: 6000 }, deductions: { pf: 1800, pt: 200 }, pan: 'abcde1234f', bank: 'SBI 123456789012', effectiveFrom: today.slice(0, 8) + '01' })).status === 200, 'hr sets the nurse\'s salary');
  const sl = (await hr('GET', 'admin/hr/salaries')).body.rows.find((r) => r.userId === nurseMe.id).salary;
  ok(sl.gross === 30000 && sl.deductionsTotal === 2000 && sl.net === 28000 && sl.pan === 'ABCDE1234F' && /x+9012$/.test(sl.bank), 'salary totals; PAN upper-cased; bank account masked');
  ok((await fin('GET', 'admin/hr/salaries')).status === 403 && (await ops('GET', 'admin/hr/payslips')).status === 403, 'finance and operations cannot see salaries');
  const m0 = today.slice(0, 7);
  const ps = await hr('GET', 'admin/hr/payslips?month=' + m0);
  const nrow = ps.body.rows.find((r) => r.userId === nurseMe.id);
  ok(ps.status === 200 && nrow && nrow.salarySet && nrow.draft && nrow.draft.gross > 0 && !nrow.issued, 'the payslip draft is worked out from the salary and attendance');
  ok(nrow.draft.net === Math.round((nrow.draft.gross - 2000) * 100) / 100 && nrow.draft.paidDays === nrow.draft.daysInMonth - nrow.draft.notEmployed - nrow.draft.lop, 'net = pro-rated earnings less deductions; paid days = days employed less loss of pay');
  ok((await hr('POST', 'admin/hr/payslips/issue', { month: addDays(today, 40).slice(0, 7) })).status === 400, 'no payslips for a future month');
  const iss = await hr('POST', 'admin/hr/payslips/issue', { month: m0, userIds: [nurseMe.id], lop: { [nurseMe.id]: 2 } });
  ok(iss.status === 200 && iss.body.issued === 1, 'hr issues the payslip (2 days loss of pay)');
  ok((await hr('POST', 'admin/hr/payslips/issue', { month: m0, userIds: [nurseMe.id] })).body.issued === 0, 'a payslip is issued once a month');
  const mys = await nurse('GET', 'me/payslips');
  ok(mys.status === 200 && mys.body.rows.length === 1 && mys.body.rows[0].month === m0, 'the nurse sees their own payslip');
  const pdf = await nurse('GET', 'me/payslips/' + mys.body.rows[0].id + '/pdf');
  ok(pdf.status === 200 && /pdf/.test(pdf.type) && pdf.text.startsWith('%PDF'), 'the nurse downloads their payslip as a PDF');
  ok((await sales('GET', 'me/payslips/' + mys.body.rows[0].id + '/pdf')).status === 404 && (await sales('GET', 'me/payslips')).body.rows.length === 0, 'nobody else can open the nurse\'s payslip');
  ok((await fam('GET', 'me/payslips')).status === 403, 'a family login has no payslips');
  ok((await hr('GET', 'admin/hr/reports/payslips.csv?month=' + m0)).text.includes('PS-'), 'payslips report lists the issued payslip');
  const nurseNotes = (await nurse('GET', 'notifications')).body;
  ok(JSON.stringify(nurseNotes).includes('payslip'), 'the nurse is told the payslip is ready');

  // recruitment
  ok((await hr('POST', 'admin/hr/candidates', { name: 'A', source: 'x' })).status === 400, 'a candidate needs a name, contact and source');
  const cd = await hr('POST', 'admin/hr/candidates', { name: 'Bindu Candidate', phone: '9800155551', source: 'referral', position: 'Staff Nurse', qualification: 'GNM', experienceYears: 3 });
  ok(cd.status === 201, 'hr adds a candidate');
  ok((await hr('POST', 'admin/hr/candidates', { name: 'Bindu again', phone: '9800155551', source: 'walkin' })).status === 400, 'the same person cannot be added twice while in recruitment');
  ok((await hr('POST', 'admin/hr/candidates/' + cd.body.id + '/hire', {})).status === 400, 'cannot hire before an offer');
  ok((await hr('POST', 'admin/hr/candidates/' + cd.body.id + '/stage', { stage: 'interview' })).status === 400, 'an interview needs a date and time');
  ok((await hr('POST', 'admin/hr/candidates/' + cd.body.id + '/stage', { stage: 'interview', interviewAt: addDays(today, 1) + 'T11:00' })).status === 200, 'interview booked');
  ok((await hr('GET', 'admin/hr/overview')).body.todo.some((t) => /interviews/.test(t.label)), 'hr: "Needs your attention" counts interviews coming up');
  ok((await hr('POST', 'admin/hr/candidates/' + cd.body.id + '/stage', { stage: 'offered' })).status === 200, 'offer made');
  const hire = await hr('POST', 'admin/hr/candidates/' + cd.body.id + '/hire', { joinDate: today, probationMonths: 3 });
  ok(hire.status === 201 && /^EMP-/.test(hire.body.employeeId) && hire.body.link, 'the candidate becomes an employee with a welcome link');
  const cands = (await hr('GET', 'admin/hr/candidates?all=1')).body.rows;
  ok(cands.find((c) => c.id === cd.body.id).stage === 'joined', 'the candidate is marked as joined');
  const rv = await hr('GET', 'admin/hr/reviews');
  const newbie = rv.body.rows.find((r) => r.userId === hire.body.userId);
  ok(newbie && newbie.probation && newbie.probation.status === 'on' && newbie.probation.endDate > today, 'the new employee starts on 3 months\' probation');
  ok((await hr('POST', 'admin/hr/reviews/' + hire.body.userId + '/probation', { status: 'extended' })).body.errors.endDate, 'extending probation needs a new end date');
  ok((await hr('POST', 'admin/hr/reviews/' + hire.body.userId + '/probation', { status: 'confirmed', note: 'Good work' })).status === 200, 'hr confirms the employee');
  ok((await hr('POST', 'admin/hr/reviews/' + nurseMe.id + '/add', { rating: 6, period: '2026' })).status === 400, 'a review rating is 1 to 5');
  ok((await hr('POST', 'admin/hr/reviews/' + nurseMe.id + '/add', { rating: 4, period: '2026', strengths: 'Kind and punctual', improve: 'Report writing' })).status === 201, 'hr records a yearly review');
  ok((await hr('GET', 'admin/hr/reviews')).body.rows.find((r) => r.userId === nurseMe.id).lastReview.rating === 4, 'the review is on the employee');
  ok((await hr('POST', 'admin/hr/reviews/' + hrMe.id + '/add', { rating: 5, period: '2026', strengths: 'Me' })).status === 400, 'HR cannot review themselves');

  // exit checklist
  ok((await hr('POST', 'admin/hr/exits/' + (await me(admin)).id, { exitDate: today, reason: 'resigned' })).status === 400, 'HR cannot start the admin\'s exit');
  const leaver = hire.body.userId;
  ok((await hr('POST', 'admin/hr/exits/' + leaver, { exitDate: addDays(today, 5), reason: 'resigned', note: 'Moving city' })).status === 201, 'hr starts an exit');
  ok((await hr('POST', 'admin/hr/exits/' + leaver, { exitDate: today, reason: 'resigned' })).status === 400, 'only one exit at a time');
  ok((await hr('POST', 'admin/hr/exits/' + leaver + '/step', { step: 'login' })).status === 400, 'the login is not switched off before the last day');
  ok((await hr('POST', 'admin/hr/exits/' + leaver + '/step', { step: 'handover' })).status === 200, 'a checklist step is ticked');
  let exits = (await hr('GET', 'admin/hr/exits')).body.rows;
  let ex1 = exits.find((x) => x.userId === leaver);
  ok(ex1 && ex1.done === 1 && ex1.total === 6 && ex1.steps.find((s) => s.key === 'handover').byName, 'the exit shows 1 of 6 steps, who ticked it');
  ok((await hr('POST', 'admin/hr/exits/' + leaver + '/cancel', {})).status === 200, 'an exit can be withdrawn');
  ok((await hr('POST', 'admin/hr/exits/' + leaver, { exitDate: today, reason: 'contract_end' })).status === 201, 'a new exit with today as the last day');
  ok((await hr('POST', 'admin/hr/exits/' + leaver + '/step', { step: 'login' })).status === 200, 'on the last day the login is switched off');
  ok((await (client())('POST', 'login', { id: '9800155551', password: 'x' })).status !== 200 && (await admin('GET', 'admin/users')).body.rows.find((u) => u.id === leaver).active === false, 'the leaver\'s login is off');
  ok((await hr('POST', 'admin/hr/exits/' + leaver + '/step', { step: 'login', undo: true })).status === 400, 'HR cannot switch the login back on');

  // ======================================== Operations
  const sp = await ops('POST', 'admin/ops/supplies', { name: 'Glucometer strips', unit: 'strips', category: 'consumable', reorderLevel: 50, opening: 60, location: 'Office store' });
  ok(sp.status === 201, 'operations adds a supply with opening stock');
  ok((await ops('POST', 'admin/ops/supplies', { name: 'glucometer strips', category: 'consumable' })).status === 400, 'the same item cannot be added twice');
  ok((await ops('POST', 'admin/ops/supplies/' + sp.body.id + '/move', { kind: 'issued', qty: 100 })).status === 400, 'cannot issue more than is in stock');
  const iss2 = await ops('POST', 'admin/ops/supplies/' + sp.body.id + '/move', { kind: 'issued', qty: 15, nurseId: nurseMe.id, note: 'Weekly kit' });
  ok(iss2.status === 200 && iss2.body.stock === 45, 'issuing 15 leaves 45');
  let sup = (await ops('GET', 'admin/ops/supplies')).body;
  ok(sup.rows.find((s) => s.id === sp.body.id).low && sup.totals.low >= 1, 'the item is low (45 at or below 50)');
  ok(JSON.stringify((await ops('GET', 'notifications')).body).includes('running low'), 'operations is told it is running low');
  ok((await ops('GET', 'admin/ops/overview')).body.todo.some((t) => /supplies low/.test(t.label)), 'operations: "Needs your attention" counts low supplies');
  ok((await ops('POST', 'admin/ops/supplies/' + sp.body.id + '/move', { kind: 'adjusted', counted: 40 })).status === 400, 'a count correction needs a reason');
  ok((await ops('POST', 'admin/ops/supplies/' + sp.body.id + '/move', { kind: 'adjusted', counted: 40, note: '5 damaged' })).body.stock === 40, 'a stock count sets the stock to what was counted');
  ok((await ops('POST', 'admin/ops/supplies/' + sp.body.id + '/move', { kind: 'received', qty: 200, supplier: 'MedSupply Co' })).body.stock === 240, 'received stock adds up');
  const hist = (await ops('GET', 'admin/ops/supplies/' + sp.body.id + '/history')).body;
  ok(hist.moves.length === 4 && hist.moves[0].after === 240 && hist.moves[2].toName, 'stock history, newest first, with the nurse it was issued to');
  ok((await fin('GET', 'admin/ops/supplies')).status === 403 && (await sales('POST', 'admin/ops/supplies', {})).status === 403, 'supplies are Operations\' only');
  const sg = await ops('GET', 'admin/ops/suggestions');
  ok(sg.status === 200 && Array.isArray(sg.body.rows) && sg.body.rows.every((r) => r.suggestions.every((s) => s.ok && s.reasons.length)), 'nurse suggestions: only free nurses, each with reasons');
  const vt = await ops('GET', 'admin/ops/visit-times?from=2020-01-01&to=' + today);
  ok(vt.status === 200 && vt.body.totals && Array.isArray(vt.body.rows), 'actual visit times from the nurses\' start and complete taps');
  ok((await ops('GET', 'admin/ops/reports/supplies.csv')).text.includes('Glucometer strips'), 'supplies report');

  // ======================================== Sales
  ok((await sales('POST', 'admin/sales/templates', { name: 'Hi', channel: 'whatsapp', body: 'Hello {nam}' })).body.errors.body, 'an unknown placeholder is refused');
  const tp = await sales('POST', 'admin/sales/templates', { name: 'Renewal reminder', channel: 'whatsapp', body: 'Hello {name}, your {package} with {company} is ending. Reply to renew. – {agent}, ref {enquiryId}' });
  ok(tp.status === 200, 'sales saves a message template');
  const lead = rn2.lead;
  const fl = await sales('POST', 'admin/sales/templates/fill', { templateId: tp.body.id, leadId: lead.id, type: lead.type });
  ok(fl.status === 200 && fl.body.text.includes('HomePlus') && fl.body.text.includes(lead.enquiryId) && fl.body.text.includes('KareIQ') && !/\{\w+\}/.test(fl.body.text), 'the template is filled in for the lead');
  ok((await sales('POST', 'admin/sales/templates/' + tp.body.id + '/archive', {})).status === 200 && !(await sales('GET', 'admin/sales/templates')).body.rows.some((t) => t.id === tp.body.id), 'a template can be removed');
  ok((await sales('POST', 'admin/sales/commission', { ratePct: 5 })).status === 403, 'sales cannot set the commission rate');
  ok((await admin('POST', 'admin/sales/commission', { ratePct: 80 })).status === 400 && (await admin('POST', 'admin/sales/commission', { ratePct: 5 })).status === 200, 'the admin sets the rate (0 to 50%)');
  const cm = await sales('GET', 'admin/sales/commission');
  ok(cm.status === 200 && cm.body.ratePct === 5 && cm.body.rows.length === 1 && cm.body.rows[0].userId === salesMe.id, 'a sales executive sees only their own commission');
  const cma = await admin('GET', 'admin/sales/commission');
  ok(cma.body.rows.length >= 1 && cma.body.rows.every((r) => r.commission === Math.round(r.revenue * 5) / 100), 'commission = paid revenue x rate');
  ok((await fin('GET', 'admin/sales/commission')).status === 403, 'commission is not for finance');
  ok((await sales('PATCH', 'admin/leads/' + lead.type + '/' + lead.id, { status: 'contacted' })).status === 200, 'moving a pipeline card changes the lead status');
  ok((await sales('GET', 'admin/sales/pipeline')).body.columns.find((c) => c.key === 'contacted').cards.some((c) => c.id === lead.id), 'the card is now under Contacted');

}

(URL0 ? server() : Promise.resolve()).then(() => {
  console.log((fail ? '' : 'ALL PASSED  ') + 'check-teams-more: PASS ' + pass + ' FAIL ' + fail + (URL0 ? '' : ' (rules only; pass a server address for the API checks)'));
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
