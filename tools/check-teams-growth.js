// Checks business growth for the team dashboards (src/app/teamsgrowth.js) against a fresh demo server:
//      APP_DEMO=true node server.js        then:   node tools/check-teams-growth.js http://localhost:3000
// Finance: add-on services billed once the visit is done (price less the package discount), package income, discounts.
// HR: nurse skills per service (the scheduler follows them), nurse performance from real work.
// Operations: package visits used against what each package includes, the same nurse for each family.
// Sales: upgrade suggestions (by package and time only), family referrals with rewards, campaign results.
const access = require('../src/app/access');

let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('FAIL', m); } };
const A = (role, path, method) => access.allows(role, path, method || 'GET');
ok(A('finance', 'fin/addons') && A('finance', 'fin/growth') && A('finance', 'fin/discounts') && !A('sales', 'fin/addons') && !A('hr', 'fin/growth'), 'add-ons, income and discounts are Finance\'s');
ok(A('hr', 'hr/skills/u1', 'POST') && A('hr', 'hr/performance') && !A('operations', 'hr/skills') && !A('finance', 'hr/performance'), 'skills and performance are HR\'s');
ok(A('operations', 'ops/visits-used') && A('operations', 'ops/continuity') && !A('sales', 'ops/visits-used'), 'package visits and continuity are Operations\'');
ok(A('sales', 'sales/upgrades', 'POST') && A('sales', 'sales/referrals') && A('sales', 'sales/campaigns', 'POST') && !A('finance', 'sales/campaigns'), 'upgrades, referrals and campaigns are Sales\'');

const URL0 = process.argv[2];
const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
const addDays = (d, n) => new Date(Date.parse(d + 'T12:00:00Z') + n * 86400000).toISOString().slice(0, 10);
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
  const [admin, fin, hr, ops, sales, nurse, fam] = await Promise.all(['admin', 'finance', 'hr', 'ops', 'sales', 'nurse', 'family'].map((x) => login(x + '@demo.kareiq')));
  const me = async (c) => (await c('GET', 'session')).body.user;
  const nurseMe = await me(nurse), salesMe = await me(sales);

  // ======================================== Finance: add-on services
  // the family books a paid add-on (teleconsultation) for P-DEMO01 (HomePlus: 15% off add-ons), the nurse does it
  const bk = await fam('POST', 'people/P-DEMO01/services', { service: 'teleconsultation', date: today, time: 'morning' });
  ok(bk.status === 201 && bk.body.free === false, 'the family books a paid add-on service');
  const vis = (await admin('GET', 'admin/scheduler/visits?from=' + today + '&to=' + today)).body.rows.find((v) => v.service === 'teleconsultation' && v.personId === 'P-DEMO01');
  ok(vis, 'the add-on became a visit');
  if (vis.nurseId !== nurseMe.id) await admin('POST', 'admin/scheduler/visits/' + vis.id + '/assign', { nurseId: nurseMe.id, note: 'test' });
  ok((await nurse('POST', 'nurse/visits/' + vis.id + '/status', { status: 'in_progress' })).status === 200 && (await nurse('POST', 'nurse/visits/' + vis.id + '/status', { status: 'completed' })).status === 200, 'the nurse starts and completes it');
  let ad = (await fin('GET', 'admin/fin/addons')).body;
  ok(ad.waitingPrice.some((w) => w.reference === bk.body.reference) && ad.totals.unbilledCount === 0, 'without a price it waits, nothing is charged');
  ok((await fin('POST', 'admin/fin/addons/prices', { prices: { teleconsultation: 'abc' } })).status === 400, 'a price must be in rupees');
  ok((await fin('POST', 'admin/fin/addons/prices', { prices: { teleconsultation: '400', dressing: 300 } })).status === 200, 'finance sets add-on prices');
  ad = (await fin('GET', 'admin/fin/addons')).body;
  const famRow = ad.families.find((f) => f.personId === 'P-DEMO01');
  const ch = famRow && famRow.charges.find((c) => c.reference === bk.body.reference);
  ok(ch && ch.listPrice === 400 && ch.discountPct === 15 && ch.amount === 340, 'charged ₹400 less the HomePlus 15% add-on discount = ₹340');
  ok((await fin('GET', 'admin/fin/overview')).body.todo.some((t) => /add-on services to bill/.test(t.label)), 'finance: "Needs your attention" counts families with add-ons to bill');
  const bill = await fin('POST', 'admin/fin/addons/bill', { personId: 'P-DEMO01' });
  ok(bill.status === 201 && /^AO-/.test(bill.body.number), 'finance bills the family\'s add-ons');
  ok((await fin('POST', 'admin/fin/addons/bill', { personId: 'P-DEMO01' })).status === 400, 'nothing left to bill twice');
  const pdf = await fin('GET', 'admin/fin/addons/bills/' + bill.body.id + '/pdf');
  ok(pdf.status === 200 && pdf.text.startsWith('%PDF'), 'the add-on bill downloads as a PDF');
  ok((await fin('POST', 'admin/fin/addons/bills/' + bill.body.id + '/pay', { amount: 500, method: 'upi', ref: 'AOTEST1' })).status === 400, 'cannot record more than is owed');
  ok((await fin('POST', 'admin/fin/addons/bills/' + bill.body.id + '/pay', { amount: 340, method: 'upi', ref: 'AOTEST1' })).status === 201, 'the payment is recorded');
  ad = (await fin('GET', 'admin/fin/addons')).body;
  ok(ad.bills.find((b) => b.id === bill.body.id).status === 'paid' && ad.totals.collected >= 340, 'the bill is paid');
  ok((await fin('GET', 'admin/fin/payments')).body.rows.some((p) => p.ref === 'AOTEST1' && p.invoiceNo === bill.body.number), 'the payment shows in the payments ledger');
  ok((await sales('GET', 'admin/fin/addons')).status === 403, 'add-on billing is not for sales');

  // package income and discounts
  const gr = await fin('GET', 'admin/fin/growth');
  ok(gr.status === 200 && gr.body.months.length === 12 && gr.body.current.active >= 3 && gr.body.byPackage.length >= 2, 'package income: 12 months, active packages and packages in use');
  ok(gr.body.months.every((m) => m.lost <= m.ended && m.perFamily === (m.payingFamilies ? Math.round(m.income / m.payingFamilies) : 0)), 'ended without renewal ≤ ended; spend per family = income ÷ paying families');
  const qt = await sales('POST', 'admin/sales/quotes', { name: 'Discount Check', phone: '9800177001', packageId: 'homeplus', months: 12, discount: 2000 });
  if (qt.body.id) await sales('POST', 'admin/sales/quotes/' + qt.body.id + '/status', { status: 'sent' });
  const ds = await fin('GET', 'admin/fin/discounts');
  ok(ds.status === 200 && ds.body.rows.some((r) => r.kind === 'addon' && r.amount === 60 && r.by === 'Package rule'), 'discounts: the ₹60 package discount on the add-on');
  ok(!qt.body.id || ds.body.rows.some((r) => r.kind === 'quote' && r.amount === 2000 && r.by), 'discounts: the quotation discount, with who gave it');
  ok(ds.body.total === Math.round(ds.body.rows.reduce((s, r) => s + r.amount, 0) * 100) / 100 && ds.body.byPerson.length >= 1, 'discounts: total and by person');
  ok((await fin('GET', 'admin/fin/reports/discounts.csv')).text.startsWith('Date,Kind'), 'discount report');

  // ======================================== HR: skills and performance
  const sk = await hr('GET', 'admin/hr/skills');
  const nrow = sk.body.rows.find((r) => r.userId === nurseMe.id);
  ok(sk.status === 200 && nrow && nrow.allServices, 'hr: skills list, the nurse may do every service so far');
  ok((await hr('POST', 'admin/hr/skills/' + nurseMe.id, { services: [] })).status === 400, 'at least one service');
  ok((await hr('POST', 'admin/hr/skills/' + nurseMe.id, { services: ['home-visit', 'first-visit', 'dressing'], assessments: ['falls', 'ecg', 'nonsense'] })).status === 200, 'hr sets the nurse\'s skills');
  const nrow2 = (await hr('GET', 'admin/hr/skills')).body.rows.find((r) => r.userId === nurseMe.id);
  ok(!nrow2.allServices && nrow2.services.length === 3 && nrow2.assessments.join() === 'falls,ecg', 'the skills are saved (unknown ones ignored)');
  // the scheduler follows the skills: the nurse is not offered for physiotherapy
  const bk2 = await fam('POST', 'people/P-DEMO01/services', { service: 'physiotherapy', date: addDays(today, 2), time: 'morning' });
  const v2 = (await admin('GET', 'admin/scheduler/visits?from=' + addDays(today, 2) + '&to=' + addDays(today, 2))).body.rows.find((v) => v.service === 'physiotherapy' && v.date === addDays(today, 2));
  const opt = v2 ? (await ops('GET', 'admin/scheduler/visits/' + v2.id + '/options')).body.rows.find((o) => o.id === nurseMe.id) : null;
  ok(bk2.status === 201 && opt && !opt.ok && /service/.test(opt.why), 'the scheduler no longer offers the nurse for a service she is not trained for');
  ok((await ops('GET', 'admin/hr/skills')).status === 403, 'skills are HR\'s to change');
  const pf = await hr('GET', 'admin/hr/performance');
  const mine = pf.body.rows.find((r) => r.userId === nurseMe.id);
  ok(pf.status === 200 && mine && mine.completed >= 1 && 'avgRating' in mine && 'onTimePct' in mine, 'performance: visits completed, rating and on-time for each nurse');

  // ======================================== Operations: package visits and continuity
  const vu = await ops('GET', 'admin/ops/visits-used');
  const p1 = vu.body.rows.find((r) => r.personId === 'P-DEMO01');
  ok(vu.status === 200 && p1 && p1.included === null && p1.state === 'not_set', 'package visits: "not set" until Operations says what each package includes');
  ok((await ops('POST', 'admin/ops/visits-used/allowance', { perMonth: { homeplus: 2.5 } })).status === 400, 'visits included must be a whole number');
  ok((await ops('POST', 'admin/ops/visits-used/allowance', { perMonth: { homeplus: 4, homestart: 2 } })).status === 200, 'operations sets the visits each package includes');
  const p1b = (await ops('GET', 'admin/ops/visits-used')).body.rows.find((r) => r.personId === 'P-DEMO01');
  ok(p1b.included === 4 && p1b.left === 4 - p1b.done - p1b.planned && p1b.free && p1b.free.total === 6, 'HomePlus: 4 a month; left = included − done − planned; 6 free sessions a year');
  const ct = await ops('GET', 'admin/ops/continuity?from=2020-01-01');
  ok(ct.status === 200 && ct.body.rows.every((r) => r.sharePct >= 0 && r.sharePct <= 100 && r.nurses >= 1), 'same nurse: share by the regular nurse for each family');
  ok((await fin('GET', 'admin/ops/continuity')).status === 403, 'continuity is not for finance');

  // ======================================== Sales: upgrades, referrals, campaigns
  const up = await sales('GET', 'admin/sales/upgrades?min=0');
  const u1 = up.body.rows.find((r) => r.personId === 'P-DEMO01');
  ok(up.status === 200 && u1 && u1.from === 'homeplus' && u1.to === 'homeelite' && u1.toPrice > u1.nowPrice, 'upgrade: HomePlus to HomeElite with the price difference');
  ok(JSON.stringify(up.body).match(/risk|reading|vital|bp|spo2/i) === null, 'upgrade suggestions carry no health data');
  const ul = await sales('POST', 'admin/sales/upgrades', { planId: u1.planId });
  ok(ul.status === 201 && /^KQ-/.test(ul.body.reference), 'sales turns the suggestion into a lead');
  ok((await sales('POST', 'admin/sales/upgrades', { planId: u1.planId })).status === 400, 'only one upgrade lead per customer');
  ok((await sales('GET', 'admin/sales/upgrades?min=0')).body.rows.find((r) => r.personId === 'P-DEMO01').lead.enquiryId === ul.body.reference, 'the suggestion shows its lead');
  // campaigns
  ok((await sales('POST', 'admin/sales/campaigns', { name: 'X', kind: 'nope' })).status === 400, 'a campaign needs a name, kind and date');
  ok((await sales('POST', 'admin/sales/campaigns', { name: 'Kakkanad senior health camp', kind: 'camp', date: today, place: 'Kakkanad', cost: '3,000' })).status === 201, 'sales adds a health camp');
  const camp = (await sales('GET', 'admin/sales/campaigns')).body.rows.find((c) => c.name === 'Kakkanad senior health camp');
  // referrals: find the referring family
  ok((await sales('GET', 'admin/sales/referrers?q=ab')).body.rows.length === 0, 'search needs 3 characters');
  const rf = (await sales('GET', 'admin/sales/referrers?q=demo')).body.rows;
  ok(rf.length >= 1 && rf.every((x) => x.personId && x.customer && !('phone' in x)), 'sales finds a family by name (no phone numbers shown)');
  const refId = rf[0].personId;
  const l1 = await sales('POST', 'admin/sales/leads', { name: 'Camp Visitor One', phone: '9800177101', source: 'event', campaignId: camp.id });
  const l2 = await sales('POST', 'admin/sales/leads', { name: 'Camp Visitor Two', phone: '9800177102', source: 'event', campaignId: camp.id });
  const l3 = await sales('POST', 'admin/sales/leads', { name: 'Referred Friend', phone: '9800177103', source: 'referral', referredBy: refId });
  ok(l1.status === 201 && l2.status === 201 && l3.status === 201, 'leads added with their campaign and referring family');
  ok((await sales('POST', 'admin/sales/leads', { name: 'Bad Campaign', phone: '9800177104', source: 'event', campaignId: 'nope' })).status === 400, 'an unknown campaign is refused');
  const cp = (await sales('GET', 'admin/sales/campaigns')).body.rows.find((c) => c.id === camp.id);
  ok(cp.leads === 2 && cp.cost === 3000 && cp.costPerLead === 1500 && cp.won === 0, 'campaign results: 2 leads, ₹1,500 a lead');
  ok((await sales('PATCH', 'admin/leads/enquiry/' + l1.body.id, { status: 'converted' })).status === 200, 'one camp lead joins');
  ok((await sales('GET', 'admin/sales/campaigns')).body.rows.find((c) => c.id === camp.id).won === 1 && (await sales('GET', 'admin/sales/campaigns')).body.rows.find((c) => c.id === camp.id).conversionPct === 50, 'the camp now shows 1 joined, 50%');
  let rr = (await sales('GET', 'admin/sales/referrals')).body;
  let g = rr.rows.find((x) => x.personId === refId);
  ok(g && g.referred === 1 && g.joined === 0, 'referrals: the family referred 1, none joined yet');
  ok((await sales('POST', 'admin/sales/referrals/reward', { type: 'enquiry', id: l3.body.id, reward: '₹500 off' })).status === 400, 'no reward before the referred family joins');
  await sales('PATCH', 'admin/leads/enquiry/' + l3.body.id, { status: 'converted' });
  rr = (await sales('GET', 'admin/sales/referrals')).body; g = rr.rows.find((x) => x.personId === refId);
  ok(g.joined === 1 && g.rewardsDue === 1 && rr.totals.rewardsDue >= 1, 'after joining, a reward is due');
  ok((await sales('POST', 'admin/sales/referrals/reward', { type: 'enquiry', id: l3.body.id, reward: '₹500 off the next renewal' })).status === 200, 'sales records the reward');
  ok((await sales('POST', 'admin/sales/referrals/reward', { type: 'enquiry', id: l3.body.id, reward: 'again' })).status === 400, 'a reward is recorded once');
  ok((await sales('POST', 'admin/sales/referrals/reward-rule', { text: '₹500 off' })).status === 403 && (await admin('POST', 'admin/sales/referrals/reward-rule', { text: '₹500 off the next renewal for each family that joins' })).status === 200, 'the admin sets the reward rule, not sales');
  ok((await sales('GET', 'admin/sales/referrals')).body.reward.includes('₹500'), 'sales sees the reward rule');
  ok((await sales('GET', 'admin/sales/reports/campaigns.csv')).text.includes('Kakkanad senior health camp'), 'campaign report');
  ok((await fin('GET', 'admin/sales/campaigns')).status === 403, 'campaigns are not for finance');
  void salesMe;
}

(URL0 ? server() : Promise.resolve()).then(() => {
  console.log((fail ? '' : 'ALL PASSED  ') + 'check-teams-growth: PASS ' + pass + ' FAIL ' + fail + (URL0 ? '' : ' (rules only; pass a server address for the API checks)'));
  process.exit(fail ? 1 : 0);
}).catch((e) => { console.error(e); process.exit(1); });
