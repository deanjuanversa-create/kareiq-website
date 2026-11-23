// Checks the Finance Manager, HR, Operations Manager and Sales Executive dashboards.
// 1. Without a server: the permission table (src/app/access.js) and the CSV / statement helpers.
// 2. Against a fresh demo server (APP_DEMO=true, empty data folder):
//      APP_DEMO=true node server.js        then:   node tools/check-teams.js http://localhost:3000
//    every role's own APIs, cross-role refusals (403), no clinical data for team roles, and the
//    workflows: expenses (no self-approval), reconciliation, credentials, attendance, leave balances,
//    rescheduling, service issues, lead follow-ups (no package approval by Sales). Existing Admin,
//    Nurse and Family access is checked to be unchanged.
const access = require('../src/app/access');
const teams = require('../src/app/teams');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };

// ---------------------------------------------------------------- 1. without a server
const A = (role, path, method) => access.allows(role, path, method || 'GET');
ok(A('admin', 'anything/at/all', 'DELETE'), 'admin keeps every office permission');
ok(!A('family', 'fin/overview') && !A('caregiver', 'customers'), 'family and nurse logins have no office permissions');
ok(A('finance', 'fin/overview') && A('finance', 'finance/invoices') && A('finance', 'finance/payments', 'POST') && A('finance', 'analytics/revenue'), 'finance: its own modules');
ok(!A('finance', 'employees') && !A('finance', 'customers') && !A('finance', 'leads') && !A('finance', 'summary') && !A('finance', 'risk/rules') && !A('finance', 'documents'), 'finance: no HR, customers, leads or clinical pages');
ok(A('hr', 'employees') && A('hr', 'employees/u1', 'PATCH') && A('hr', 'leave/u1/l1/approve', 'POST') && A('hr', 'hr/attendance', 'POST'), 'hr: employees, leave and hr/*');
ok(!A('hr', 'finance/invoices') && !A('hr', 'customers') && !A('hr', 'scheduler/visits') && !A('hr', 'summary'), 'hr: no finance, customers, scheduling or clinical pages');
ok(A('operations', 'customers') && A('operations', 'customers/P-1') && A('operations', 'scheduler/visits/v1/assign', 'POST') && A('operations', 'ops/issues', 'POST'), 'operations: customers, scheduler and ops/*');
ok(A('operations', 'leave') && !A('operations', 'leave', 'POST') && !A('operations', 'leave/u1/l1/approve', 'POST'), 'operations: leave records read only');
ok(!A('operations', 'finance/invoices') && !A('operations', 'employees') && !A('operations', 'records/review') && !A('operations', 'risk/rules') && !A('operations', 'summary'), 'operations: no finance, HR or clinical pages');
ok(A('sales', 'leads') && A('sales', 'leads/overview') && A('sales', 'leads/enquiry/x', 'PATCH') && A('sales', 'leads/enquiry/x/assign', 'POST') && A('sales', 'sales/overview'), 'sales: lead management and sales/*');
ok(!A('sales', 'leads/enquiry/x/approve', 'POST') && !A('sales', 'leads/enquiry/x/reject', 'POST'), 'sales cannot approve or decline a package request');
ok(!A('sales', 'orders') && !A('sales', 'orders/o1/paid', 'POST') && !A('sales', 'finance/payments', 'POST') && !A('sales', 'activate', 'POST'), 'sales cannot confirm payments or activate packages');
ok(!A('sales', 'customers') && !A('sales', 'fin/overview') && !A('sales', 'users'), 'sales: no customers, finance or logins');
for (const r of Object.keys(access.TEAM_ROLES)) ok(!A(r, 'users', 'POST') && !A(r, 'users') && !A(r, 'people', 'POST') && !A(r, 'plans', 'POST'), r + ': cannot create logins, people or plans');
ok(access.teamMayUse('password') && !access.teamMayUse('people') && !access.teamMayUse('people/P-1/dashboard') && !access.teamMayUse('records'), 'team logins: only their account and notifications outside the office API');
ok(teams.csvCell('=1+1') === "'=1+1" && teams.csvCell('-42') === '-42' && teams.csvCell('a,b') === '"a,b"', 'CSV cells: formulas neutralised, numbers kept, commas quoted');
const st = teams.statementRows('Date,UTR,Amount,Status\n2026-11-01,ABC123,"1,500.00",captured\n02/11/2026,XYZ9,200,failed\n');
ok(st.rows && st.rows.length === 2 && st.rows[0].amount === 1500 && st.rows[1].date === '2026-11-02' && st.rows[1].status === 'failed', 'gateway statement: references, amounts, dates and statuses read');
ok(teams.statementRows('just one line').error, 'a statement without a header and rows is refused');

// ---------------------------------------------------------------- 2. the server
const URL0 = process.argv[2];
async function server() {
  const BASE = URL0.replace(/\/$/, '') + '/api/app/';
  async function login(id) {
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
    const r = await call('POST', 'login', { id, password: 'demo-pass-123' });
    if (r.status !== 200) throw new Error('login failed for ' + id);
    csrf = (await call('GET', 'session')).body.csrf;
    return call;
  }
  const [admin, fin, fin2, hr, ops, sales, nurse, fam] = await Promise.all(['admin', 'finance', 'admin', 'hr', 'ops', 'sales', 'nurse', 'family'].map((x) => login(x + '@demo.kareiq')));
  const sess = (await fin('GET', 'session')).body;
  ok(sess.user.role === 'finance' && sess.user.roleName === 'Finance Manager', 'a team login signs in with its role');

  // ---- every role reaches its own landing data
  for (const [c, p, name] of [[fin, 'admin/fin/overview', 'finance'], [hr, 'admin/hr/overview', 'hr'], [ops, 'admin/ops/overview', 'operations'], [sales, 'admin/sales/overview', 'sales']]) {
    const r = await c('GET', p);
    ok(r.status === 200 && r.body.kpis, name + ' landing data: ' + r.status);
  }
  // ---- reused admin modules
  for (const [c, p] of [[fin, 'admin/finance/invoices'], [fin, 'admin/finance/due'], [fin, 'admin/analytics/revenue'], [hr, 'admin/employees'], [hr, 'admin/leave'], [ops, 'admin/customers'], [ops, 'admin/scheduler/nurses'], [ops, 'admin/scheduler/visits'], [sales, 'admin/leads'], [sales, 'admin/leads/overview'], [sales, 'admin/leads/members']]) {
    ok((await c('GET', p)).status === 200, 'reused module ' + p);
  }
  // ---- cross-role refusals, also by typing the address or changing the method
  const refuse = [[fin, 'GET', 'admin/employees'], [fin, 'GET', 'admin/customers'], [fin, 'GET', 'admin/leads'], [fin, 'GET', 'admin/hr/overview'], [fin, 'GET', 'admin/ops/overview'], [fin, 'GET', 'admin/sales/overview'],
    [hr, 'GET', 'admin/fin/overview'], [hr, 'GET', 'admin/finance/invoices'], [hr, 'GET', 'admin/customers'], [hr, 'POST', 'admin/scheduler/visits'], [hr, 'GET', 'admin/sales/overview'],
    [ops, 'GET', 'admin/fin/overview'], [ops, 'GET', 'admin/employees'], [ops, 'GET', 'admin/leads'], [ops, 'POST', 'admin/leave'], [ops, 'GET', 'admin/hr/attendance'], [ops, 'GET', 'admin/summary'], [ops, 'GET', 'admin/risk/rules'],
    [sales, 'GET', 'admin/fin/overview'], [sales, 'GET', 'admin/customers'], [sales, 'GET', 'admin/orders'], [sales, 'POST', 'admin/finance/payments'], [sales, 'GET', 'admin/ops/visits'], [sales, 'GET', 'admin/users'],
    [nurse, 'GET', 'admin/fin/overview'], [nurse, 'GET', 'admin/hr/overview'], [fam, 'GET', 'admin/ops/overview'], [fam, 'GET', 'admin/sales/overview']];
  for (const [c, m, p] of refuse) ok((await c(m, p, m === 'GET' ? undefined : {})).status === 403, 'refused: ' + m + ' ' + p);
  // ---- no clinical information for team roles
  for (const [c, name] of [[fin, 'finance'], [hr, 'hr'], [ops, 'operations'], [sales, 'sales']]) {
    for (const p of ['people', 'people/P-DEMO01/dashboard', 'people/P-DEMO01/records', 'people/P-DEMO01/risk', 'people/P-DEMO01/details', 'home?product=karehome']) ok((await c('GET', p)).status === 403, name + ': no access to ' + p);
    ok((await c('POST', 'plans/request', { product: 'karehome' })).status === 403, name + ': cannot request a plan as a family would');
  }
  const cl = await ops('GET', 'admin/customers');
  ok(cl.status === 200 && cl.body.rows.length && cl.body.rows.every((x) => !('risk' in x)), 'operations: the customer list has no risk category');
  const cp = await ops('GET', 'admin/customers/P-DEMO01');
  ok(cp.status === 200 && cp.body.operational && !('risk' in cp.body.customer) && !('bloodGroup' in cp.body.details) && !('dob' in cp.body.details), 'operations: the customer profile has no health details or risk');
  const ap = await admin('GET', 'admin/customers/P-DEMO01');
  ok(ap.status === 200 && !ap.body.operational && 'risk' in ap.body.customer, 'admin: the full customer profile is unchanged');

  // ---- Finance: overview from real records, payments ledger, expenses with separate approval
  const fo = (await fin('GET', 'admin/fin/overview')).body;
  const inv = (await fin('GET', 'admin/finance/invoices?size=100')).body;
  ok(fo.kpis.outstanding === inv.totals.outstanding, 'finance overview: outstanding equals the invoices\' outstanding (' + fo.kpis.outstanding + ')');
  const pays = (await fin('GET', 'admin/fin/payments?size=100')).body;
  ok(pays.totals.received - pays.totals.refunded === fo.kpis.collected, 'finance overview: collected equals payments minus refunds');
  const ex = await fin('POST', 'admin/fin/expenses', { date: new Date().toISOString().slice(0, 10), category: 'supplies', amount: '1200', vendor: 'Test supplier', description: 'Gloves' });
  ok(ex.status === 201, 'finance records an expense');
  ok((await fin('POST', 'admin/fin/expenses/' + ex.body.id + '/approve', {})).status === 403, 'finance cannot approve its own expense');
  ok((await fin('POST', 'admin/fin/expenses', { date: '2099-01-01', category: 'x', amount: '0' })).status === 400, 'an expense in the future, without category or amount is refused');
  ok((await fin2('POST', 'admin/fin/expenses/' + ex.body.id + '/approve', { note: 'OK' })).status === 200, 'another approver approves it');
  ok((await fin('POST', 'admin/fin/expenses/' + ex.body.id + '/paid', { ref: 'NEFT-001' })).status === 200, 'the approved expense is marked paid');
  const el = (await fin('GET', 'admin/fin/expenses')).body;
  const mine = el.rows.find((x) => x.id === ex.body.id);
  ok(mine && mine.status === 'paid' && mine.history.length === 3, 'expense history kept: submitted, approved, paid');
  // ---- reconciliation
  const known = pays.rows.find((x) => x.kind === 'payment' && x.ref && pays.rows.filter((y) => y.ref === x.ref).length === 1); // references are unique when recorded
  const csv = 'Date,Transaction ID,Amount,Status\n' + (known ? `${known.receivedAt.slice(0, 10)},${known.ref},${known.amount},captured\n${known.receivedAt.slice(0, 10)},${known.ref},${known.amount},captured\n` : '') + '2026-11-01,UNKNOWN-1,999,captured\n2026-11-01,FAILED-1,50,failed\n';
  const rc = await fin('POST', 'admin/fin/recon', { source: 'Test gateway', fileName: 't.csv', csv });
  ok(rc.status === 201, 'a statement is reconciled');
  if (known) ok(rc.body.counts.matched === 1 && rc.body.counts.duplicate === 1, 'reconciliation: matched and duplicate rows found');
  ok(rc.body.counts.missing_in_kareiq === 1 && rc.body.counts.failed === 1, 'reconciliation: unmatched and failed transactions found');
  const run = (await fin('GET', 'admin/fin/recon/' + rc.body.id)).body.run;
  const exc = run.items.find((i) => i.status !== 'matched');
  ok((await fin('POST', 'admin/fin/recon/' + rc.body.id + '/items/' + exc.n + '/resolve', { note: 'Checked with the bank' })).status === 200, 'an exception is marked resolved');
  ok((await fin('GET', 'admin/fin/recon')).body.rows.some((r) => r.id === rc.body.id && r.resolved === 1), 'reconciliation history kept');
  const rep = await fin('GET', 'admin/fin/reports/revenue-package.csv');
  ok(rep.status === 200 && /text\/csv/.test(rep.type) && /Package/.test(rep.text), 'financial report downloads as CSV');
  ok((await sales('GET', 'admin/fin/reports/invoices.csv')).status === 403, 'sales cannot download financial reports');

  // ---- HR: credentials, onboarding, attendance, leave balances, history
  const emps = (await hr('GET', 'admin/employees')).body.rows;
  ok(emps.some((x) => x.role === 'finance') && emps.some((x) => x.role === 'caregiver'), 'employees include the team roles and the nurses');
  const nurseEmp = emps.find((x) => x.role === 'caregiver');
  const cr = await hr('POST', 'admin/hr/employees/' + nurseEmp.userId + '/credentials', { type: 'certification', name: 'Basic Life Support', expiresOn: new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10) });
  ok(cr.status === 201, 'HR records a certification');
  const crl = (await hr('GET', 'admin/hr/credentials?status=expiring')).body;
  ok(crl.rows.some((c) => c.id === cr.body.id), 'a certification expiring within 30 days is flagged');
  const ed = await hr('PATCH', 'admin/employees/' + nurseEmp.userId, { designation: 'Senior Staff Nurse' });
  ok(ed.status === 200, 'HR changes a designation');
  const det = (await hr('GET', 'admin/hr/employees/' + nurseEmp.userId)).body.employee;
  ok(det.designation === 'Senior Staff Nurse' && det.history.some((h) => h.changes.some((c) => c.field === 'designation')), 'employment history keeps the change');
  ok(det.onboarding && det.onboarding.steps.length >= 4, 'onboarding checklist worked out');
  const day = new Date().toISOString().slice(0, 10);
  const at = await hr('POST', 'admin/hr/attendance', { date: day, rows: [{ userId: nurseEmp.userId, status: 'present' }] });
  ok(at.status === 200 && at.body.saved === 1, 'HR marks attendance');
  ok((await hr('POST', 'admin/hr/attendance', { date: '2099-01-01', rows: [] })).status === 400, 'attendance cannot be marked for a future day');
  ok((await hr('GET', 'admin/hr/attendance/summary')).body.rows.find((r) => r.userId === nurseEmp.userId).counts.present >= 1, 'attendance summary counts it');
  ok((await hr('POST', 'admin/hr/leave/policy', { allowances: { casual: 12, sick: 10 } })).status === 200, 'HR sets the yearly leave allowance');
  const bal = (await hr('GET', 'admin/hr/leave/balances')).body;
  ok(bal.policySet && bal.rows.length && bal.rows[0].types.casual.allowance === 12, 'leave balances use the allowance');
  ok((await ops('POST', 'admin/hr/leave/policy', { allowances: { casual: 99 } })).status === 403, 'operations cannot change the leave policy');

  // ---- Operations: visits, rescheduling through the scheduler, capacity, onboarding, issues
  const vis = (await ops('GET', 'admin/ops/visits')).body;
  ok(vis.rows.length > 0, 'operations sees the visits');
  const movable = vis.rows.find((v) => ['assigned', 'accepted', 'awaiting_assignment'].includes(v.status) && v.date >= day);
  if (movable) {
    const nd = new Date(Date.now() + 9 * 86400000).toISOString().slice(0, 10);
    const rs = await ops('POST', 'admin/ops/visits/' + movable.id + '/reschedule', { date: nd, slot: 'morning', note: 'Family asked to move it' });
    ok(rs.status === 200, 'operations reschedules a visit: ' + (rs.body.message || rs.status));
    const after = (await ops('GET', 'admin/ops/visits?from=' + nd + '&to=' + nd + '&flag=rescheduled')).body.rows;
    ok(after.some((v) => v.id === movable.id), 'the visit is shown as rescheduled on its new day');
    ok((await ops('POST', 'admin/ops/visits/' + movable.id + '/reschedule', { date: '2000-01-01', slot: 'morning', note: 'x' })).status === 400, 'a visit cannot be moved into the past');
  }
  const cap = (await ops('GET', 'admin/ops/capacity')).body;
  ok(cap.rows.length > 0 && cap.rows.every((n) => typeof n.availableMinutes === 'number'), 'nurse capacity worked out');
  const onb = (await ops('GET', 'admin/ops/onboarding')).body;
  ok(onb.rows.length > 0 && onb.rows.every((c) => c.stage), 'customer onboarding stages worked out');
  const is = await ops('POST', 'admin/ops/issues', { type: 'complaint', title: 'Late arrival', personId: 'P-DEMO01' });
  ok(is.status === 201, 'operations logs a complaint');
  ok((await ops('PATCH', 'admin/ops/issues/' + is.body.id, { status: 'resolved' })).status === 400, 'resolving needs a note');
  ok((await ops('PATCH', 'admin/ops/issues/' + is.body.id, { status: 'resolved', note: 'Apologised; nurse briefed' })).status === 200, 'the complaint is resolved with a note');
  ok((await ops('POST', 'admin/ops/issues', { type: 'feedback', title: 'Call after first month', rating: 4, personId: 'P-DEMO01' })).status === 201, 'customer feedback recorded');
  ok((await ops('GET', 'admin/ops/issues')).body.satisfaction.responses >= 1, 'satisfaction summary only from recorded feedback');
  ok((await ops('GET', 'admin/ops/reports/summary.csv')).status === 200, 'operations report downloads');

  // ---- Sales: follow-ups, contact history, pipeline; no approval or payment confirmation
  const leads = (await sales('GET', 'admin/leads?size=50')).body.rows;
  const lead = leads.find((l) => l.status !== 'converted' && l.status !== 'lost');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const act = await sales('POST', 'admin/sales/leads/' + lead.type + '/' + lead.id + '/activity', { kind: 'call', outcome: 'Interested', note: 'Asked for prices', followUpAt: tomorrow + 'T11:00', nextAction: 'Send prices', package: 'homeplus' });
  ok(act.status === 200, 'sales logs a call with a follow-up');
  const fu = (await sales('GET', 'admin/sales/followups')).body;
  ok(fu.upcoming.some((l) => l.id === lead.id && l.nextAction === 'Send prices'), 'the follow-up is listed');
  ok((await sales('POST', 'admin/sales/leads/' + lead.type + '/' + lead.id + '/activity', { followUpAt: '2000-01-01' })).status === 400, 'a follow-up in the past is refused');
  const ld = (await sales('GET', 'admin/leads/' + lead.type + '/' + lead.id)).body.lead;
  ok(ld.history.some((h) => h.action === 'contact' && h.channel === 'call'), 'contact history kept on the lead');
  const so = (await sales('GET', 'admin/sales/overview')).body;
  ok(so.kpis.pipeline > 0 && so.stageConversion.length === 4, 'pipeline value and stage conversion worked out');
  const req = leads.find((l) => l.requestKind);
  if (req) {
    ok((await sales('POST', 'admin/leads/' + req.type + '/' + req.id + '/approve', {})).status === 403, 'sales cannot approve a package request');
    ok((await sales('POST', 'admin/leads/' + req.type + '/' + req.id + '/reject', { note: 'no' })).status === 403, 'sales cannot decline a package request');
  }
  const members = (await sales('GET', 'admin/leads/members')).body.rows;
  ok(members.some((m) => m.name.includes('Sales')), 'sales executives can be given leads');
  ok((await sales('GET', 'admin/sales/reports/pipeline.csv')).status === 200, 'sales report downloads');

  // ---- integration: an action in one dashboard shows in the others (one set of records)
  const D = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
  // Finance records a payment -> the invoice, the admin's revenue, Finance's overview and Operations' onboarding all follow
  const owed = (await admin('GET', 'admin/finance/invoices?size=100')).body.rows.find((i) => i.outstanding > 0);
  if (owed) {
    const before = (await fin('GET', 'admin/fin/overview')).body.kpis.collected;
    const pr = await fin('POST', 'admin/finance/payments', { planId: owed.planId, method: 'upi', ref: 'INTEG-' + Date.now(), amount: String(owed.outstanding) });
    ok(pr.status === 201, 'integration: Finance records a payment on ' + owed.number);
    const inv2 = (await admin('GET', 'admin/finance/invoices?q=' + owed.number)).body.rows[0];
    ok(inv2.status === 'paid' && inv2.outstanding === 0, 'integration: the admin\'s invoice list shows it paid');
    ok((await fin('GET', 'admin/fin/overview')).body.kpis.collected === before + owed.outstanding, 'integration: Finance overview collected rises by the payment');
    ok((await admin('GET', 'admin/analytics/revenue')).body.kpis.collected === before + owed.outstanding, 'integration: the admin\'s revenue analytics shows the same figure');
    const ob = (await ops('GET', 'admin/ops/onboarding')).body.rows.find((c) => c.id === owed.personId);
    ok(!ob || !ob.reasons.some((x) => /payment for the package is not confirmed/.test(x)), 'integration: Operations no longer sees the payment as missing for that customer');
    ok((await fin('GET', 'admin/fin/payments?q=' + owed.number)).body.rows.length >= 1, 'integration: the payment is in Finance\'s ledger');
  }
  // HR approves a nurse's leave -> the scheduler moves the visit, Operations' capacity shows the leave, the nurse's portal drops the visit
  const nurseId = 'demo-u-nurse';
  const upcoming = (await ops('GET', 'admin/ops/visits?from=' + D(1) + '&to=' + D(20) + '&nurse=' + nurseId)).body.rows.find((v) => ['assigned', 'accepted'].includes(v.status));
  if (upcoming) {
    const lv = await hr('POST', 'admin/leave', { nurseId, from: upcoming.date, to: upcoming.date, type: 'casual', status: 'approved', reason: 'Integration check' });
    ok(lv.status === 201, 'integration: HR records approved leave on ' + upcoming.date);
    const moved = (await ops('GET', 'admin/ops/visits?from=' + upcoming.date + '&to=' + upcoming.date)).body.rows.find((v) => v.id === upcoming.id);
    ok(moved && moved.nurseId !== nurseId, 'integration: Operations sees the visit moved off the nurse on leave (' + (moved && moved.statusName) + ')');
    const capN = (await ops('GET', 'admin/ops/capacity?from=' + upcoming.date + '&to=' + upcoming.date)).body.rows.find((n) => n.id === nurseId);
    ok(capN && capN.leaveDays === 1 && capN.availableMinutes === 0, 'integration: Operations\' capacity shows the leave day and no hours');
    const nv = (await nurse('GET', 'nurse/visits?from=' + upcoming.date + '&to=' + upcoming.date)).body;
    ok(!JSON.stringify(nv).includes(upcoming.id), 'integration: the visit leaves the nurse\'s own portal');
    ok((await hr('GET', 'admin/hr/leave/balances')).body.rows.find((r) => r.userId === nurseId).types.casual.used >= 1, 'integration: HR\'s leave balance counts the day');
    ok((await admin('GET', 'admin/leave')).body.rows.some((l) => l.from === upcoming.date && l.nurseId === nurseId), 'integration: the admin\'s leave records show it');
  }
  // Operations reschedules -> the admin's visit board and the customer's visit history follow
  const mv = (await ops('GET', 'admin/ops/visits?from=' + D(0) + '&to=' + D(20))).body.rows.find((v) => ['assigned', 'accepted', 'awaiting_assignment'].includes(v.status) && v.personId);
  if (mv) {
    const nd = D(12);
    ok((await ops('POST', 'admin/ops/visits/' + mv.id + '/reschedule', { date: nd, slot: 'evening', note: 'Integration check' })).status === 200, 'integration: Operations reschedules ' + mv.reference);
    ok((await admin('GET', 'admin/scheduler/visits?from=' + nd + '&to=' + nd)).body.rows.some((v) => v.id === mv.id && v.date === nd), 'integration: the admin\'s visit board shows the new day');
    ok((await admin('GET', 'admin/customers/' + mv.personId)).body.visits.some((v) => v.id === mv.id && v.date === nd), 'integration: the customer profile shows the new day');
  }
  // Sales logs a contact -> the admin sees it on the enquiry and in the follow-ups
  const sl = (await sales('GET', 'admin/leads?size=50')).body.rows.find((l) => l.status !== 'converted' && l.status !== 'lost');
  await sales('POST', 'admin/sales/leads/' + sl.type + '/' + sl.id + '/activity', { kind: 'whatsapp', note: 'Integration check', followUpAt: D(2) + 'T10:00' });
  ok((await admin('GET', 'admin/leads/' + sl.type + '/' + sl.id)).body.lead.history.some((h) => h.channel === 'whatsapp' && h.note === 'Integration check'), 'integration: the admin sees the contact Sales logged');
  ok((await admin('GET', 'admin/sales/followups')).body.upcoming.some((l) => l.id === sl.id), 'integration: the admin sees the follow-up');
  // Operations logs a complaint -> the admin sees it, and it is in the customer's activity
  const ci = await ops('POST', 'admin/ops/issues', { type: 'service', title: 'Integration check', personId: 'P-DEMO02' });
  ok((await admin('GET', 'admin/ops/issues')).body.rows.some((x) => x.id === ci.body.id), 'integration: the admin sees the issue Operations logged');
  ok((await admin('GET', 'admin/customers/P-DEMO02')).body.activity.some((a) => a.action === 'issue.add'), 'integration: it is in the customer\'s activity');
  // HR edits an employee -> the scheduler and Employees show it
  ok((await hr('PATCH', 'admin/employees/' + nurseId, { designation: 'Charge Nurse' })).status === 200, 'integration: HR changes the nurse\'s designation');
  ok((await admin('GET', 'admin/employees/' + nurseId)).body.employee.designation === 'Charge Nurse', 'integration: the admin\'s employee record shows it');
  // Expenses -> Finance overview and reports
  const ov3 = (await fin('GET', 'admin/fin/overview')).body;
  ok(ov3.monthly[ov3.monthly.length - 1].expenses >= 1200, 'integration: the paid expense is in Finance\'s monthly figures');
  ok(/Test supplier/.test((await admin('GET', 'admin/fin/reports/expenses.csv')).text), 'integration: and in the expenses report the admin downloads');

  // ---- existing access unchanged
  ok((await admin('GET', 'admin/summary')).status === 200 && (await admin('GET', 'admin/risk/rules')).status === 200 && (await admin('GET', 'admin/fin/overview')).status === 200, 'admin: existing pages and the team dashboards');
  ok((await nurse('GET', 'nurse/customers')).status === 200, 'nurse portal unchanged');
  ok((await fam('GET', 'people')).status === 200 && (await fam('GET', 'people/P-DEMO01/dashboard')).status === 200, 'family pages unchanged');
}

(async () => {
  if (URL0) await server();
  console.log(`check-teams: PASS ${pass} FAIL ${fail}` + (URL0 ? '' : ' (rules only; pass a server address for the API checks)'));
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
