// End-to-end checks for the KareIQ app. Start the server with the demo data (no MONGODB_URI, fresh data folder), then: npm run check:app
const BASE = process.argv[2] || 'http://localhost:3999';
let fails = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) fails++; };

function client() {
  let cookie = '', csrf = '';
  const call = async (method, path, body, extra = {}) => {
    const headers = { 'X-Requested-With': 'kareiq', ...extra };
    if (cookie) headers.Cookie = cookie;
    if (csrf) headers['X-CSRF'] = csrf;
    if (body !== undefined) headers['Content-Type'] = 'application/json';
    Object.assign(headers, extra);
    const r = await fetch(BASE + path, { method, headers, body: body !== undefined ? JSON.stringify(body) : undefined, redirect: 'manual' });
    const sc = r.headers.get('set-cookie');
    if (sc) cookie = sc.split(';')[0];
    let data = null; try { data = await r.json(); } catch {}
    return { status: r.status, data };
  };
  return {
    call,
    async login(id, password = 'demo-pass-123') {
      const r = await call('POST', '/api/app/login', { id, password });
      const s = await call('GET', '/api/app/session');
      csrf = s.data && s.data.csrf;
      return { r, s };
    },
    refresh: async () => { const s = await call('GET', '/api/app/session'); csrf = s.data && s.data.csrf; return s; },
    get cookie() { return cookie; }
  };
}

(async () => {
  // --- family with both brands
  const fam = client();
  const { r, s } = await fam.login('family@demo.kareiq');
  ok(r.status === 200, 'family signs in');
  ok(s.data.products.map((p) => p.id).join() === 'karehome,karenest', 'family sees both brands (picker)');
  const bad = client();
  ok((await bad.call('POST', '/api/app/login', { id: 'family@demo.kareiq', password: 'nope' })).status === 401, 'wrong password refused');
  ok((await bad.call('POST', '/api/app/login', { id: '9800000001', password: 'demo-pass-123' })).status === 200, 'sign in with mobile number');

  const home = await fam.call('GET', '/api/app/home?product=karehome');
  ok(home.status === 200 && home.data.people.map((x) => x.id).sort().join() === 'P-DEMO01,P-DEMO02', 'Kare@Home shows Mother and Father (KareNest includes Kare@Home)');
  ok(home.data.people.find((x) => x.id === 'P-DEMO02').plan.included === true, 'Father is marked "included with KareNest"');
  const nest = await fam.call('GET', '/api/app/home?product=karenest');
  ok(nest.data.people.length === 1 && nest.data.people[0].id === 'P-DEMO02', 'KareNest shows only Father (a Kare@Home plan does not open KareNest)');
  // one brand bought
  const arjun = client(); const ar = (await arjun.login('arjun@demo.kareiq')).s;
  ok(ar.data.products.map((p) => p.id).join() === 'karehome', 'Kare@Home only: Arjun sees just Kare@Home');
  ok((await arjun.call('GET', '/api/app/home?product=karenest')).status === 404, 'Arjun cannot open KareNest');
  ok((await arjun.call('GET', '/api/app/people/P-DEMO04?product=karenest')).status === 404, 'Arjun\'s mother is not visible in KareNest');
  const meena = client(); const me2 = (await meena.login('meena@demo.kareiq')).s;
  ok(me2.data.products.map((p) => p.id).join() === 'karehome,karenest', 'KareNest bought: Meena gets KareNest and Kare@Home');
  ok(me2.data.products.find((p) => p.id === 'karehome').includedWith === 'KareNest', 'Kare@Home shows as included with KareNest');
  const md = await meena.call('GET', '/api/app/people/P-DEMO05?product=karehome');
  ok(md.status === 200 && md.data.plan.included && md.data.latest.bp, 'Meena opens her father\'s Kare@Home dashboard with his readings');
  const dash = await fam.call('GET', '/api/app/people/P-DEMO01?product=karehome&period=1m');
  ok(dash.status === 200 && dash.data.latest.bp && dash.data.trend.length > 10, 'dashboard has latest + trend');
  ok(dash.data.canRecord === false, 'family cannot record visits');
  ok((await fam.call('GET', '/api/app/people/P-DEMO01?product=karenest')).status === 404, 'Mother not visible in KareNest');
  ok((await fam.call('GET', '/api/app/people/P-DEMO03?product=karehome')).status === 404, 'other family\'s person is 404');
  ok((await fam.call('GET', '/api/app/admin/overview')).status === 403, 'family blocked from admin');
  ok((await fam.call('POST', '/api/app/people/P-DEMO01/visits?product=karehome', { hr: 70 })).status === 403, 'family cannot post a visit');
  const reqd = await fam.call('POST', '/api/app/requests', { product: 'karehome', personId: 'P-DEMO01', kind: 'visit', date: '2026-11-02', message: 'Please send the physio' });
  ok(reqd.status === 201, 'family sends a request');
  const noCsrf = await fam.call('POST', '/api/app/requests', { product: 'karehome', kind: 'question', message: 'x' }, { 'X-CSRF': 'wrong' });
  ok(noCsrf.status === 403, 'request without CSRF token refused');

  // --- rahul: one brand, pending plan
  const rahul = client();
  const rs = (await rahul.login('rahul@demo.kareiq')).s;
  ok(rs.data.products.length === 1 && rs.data.products[0].status === 'pending', 'Rahul: one brand, plan being set up');

  // --- caregiver
  const nurse = client();
  const ns = (await nurse.login('nurse@demo.kareiq')).s;
  ok(ns.data.products.map((p) => p.id).join() === 'karehome', 'nurse sees Kare@Home only (pending person hidden)');
  const v = await nurse.call('POST', '/api/app/people/P-DEMO01/visits?product=karehome', { systolic: '132', diastolic: '84', hr: '74', glucose: '118', glucoseContext: 'fasting', weight: '61.2', note: 'Good day' });
  ok(v.status === 201 && v.data.saved.includes('bmi'), 'nurse saves a visit (BMI from stored height)');
  const v2 = await nurse.call('POST', '/api/app/people/P-DEMO01/visits?product=karehome', { systolic: '80', diastolic: '120', hr: '1200' });
  ok(v2.status === 400 && v2.data.errors.systolic && v2.data.errors.hr, 'typing mistakes caught');
  ok((await nurse.call('POST', '/api/app/people/P-DEMO03/visits?product=karehome', { hr: 70 })).status === 404, 'cannot record for pending plan');
  ok((await nurse.call('POST', '/api/app/people/P-DEMO02/visits?product=karenest', { hr: 70 })).status === 404, 'nurse cannot see KareNest resident');
  const recent = await nurse.call('GET', '/api/app/people/P-DEMO01/recent?product=karehome');
  const mine = recent.data.rows.find((x) => x.mine);
  ok((await nurse.call('POST', `/api/app/readings/${mine.id}/remove`, { reason: '' })).status === 400, 'remove needs a reason');
  ok((await nurse.call('POST', `/api/app/readings/${mine.id}/remove`, { reason: 'Wrong patient' })).status === 200, 'nurse removes own reading with reason');

  // --- website booking -> account -> admin activates
  const site = client();
  const bk = await site.call('POST', '/api/bookings', { name: 'Meera Pillai', phone: '98111 22334', email: 'meera@example.com', area: 'Kochi', service: 'home-care', package: 'homeelite', billing: '6', careFor: 'parent', consent: true });
  ok(bk.status === 201, 'website booking saved: ' + (bk.data && bk.data.reference));
  const ref = bk.data.reference;
  const chk = await site.call('POST', '/api/app/start', { reference: ref.toLowerCase(), phone: '9811122334', check: true });
  ok(chk.status === 200 && chk.data.product === 'karehome' && chk.data.planName === 'HomeElite', 'booking found by reference + phone');
  ok((await site.call('POST', '/api/app/start', { reference: ref, phone: '9811122335', check: true })).status === 404, 'wrong phone refused');
  const st = await site.call('POST', '/api/app/start', { reference: ref, phone: '9811122334', name: 'Meera Pillai', personName: 'Radha Pillai', relation: 'Mother', password: 'kochi-sunrise-7' });
  ok(st.status === 201, 'family creates their account from the booking');
  const ms = await site.refresh();
  ok(ms.data.signedIn && ms.data.products[0].status === 'pending', 'new account sees Kare@Home "being set up"');
  ok((await client().call('POST', '/api/app/start', { reference: ref, phone: '9811122334', check: true })).status === 409, 'second account for same booking refused');

  const admin = client();
  const as = (await admin.login('admin@demo.kareiq')).s;
  ok(as.data.products.length === 2, 'admin sees both brands');
  const reqs = await admin.call('GET', '/api/app/admin/requests?product=karehome');
  const row = reqs.data.rows.find((x) => x.reference === ref);
  ok(row && row.accountUserId && row.personId, 'admin sees booking already linked to the account');
  ok(reqs.data.rows.some((x) => x.kind === 'visit'), 'admin sees the family\'s extra-visit request');
  const nurseId = (await admin.call('GET', '/api/app/admin/users')).data.rows.find((u) => u.email === 'nurse@demo.kareiq').id;
  const act = await admin.call('POST', '/api/app/admin/activate', { requestKind: 'booking', requestId: row.id, product: 'karehome', planId: 'homeelite', months: 6, startDate: '2026-10-25', familyName: 'Meera Pillai', familyPhone: '9811122334', personName: 'Radha Pillai', relation: 'Mother', caregiverId: nurseId });
  ok(act.status === 200 && act.data.plan.status === 'active' && !act.data.link, 'admin activates the plan (no link needed, they have a password)');
  const ms2 = await site.refresh();
  ok(ms2.data.products[0].status === 'active', 'family now sees the active plan');
  const ns2 = await nurse.refresh();
  ok(ns2.data.products[0].people.some((x) => x.name === 'Radha Pillai'), 'assigned nurse now sees Radha');

  // walk-in KareNest family, no booking
  const act2 = await admin.call('POST', '/api/app/admin/activate', { product: 'karenest', planId: 'kareplus', months: 12, familyName: 'Anil Kumar', familyPhone: '9822233344', personName: 'Kamala Kumar', relation: 'Mother' });
  ok(act2.status === 200 && act2.data.link && act2.data.whatsapp.includes('wa.me/919822233344'), 'walk-in: welcome link + WhatsApp share');
  const token = act2.data.link.split('/link/')[1];
  const anil = client();
  ok((await anil.call('POST', '/api/app/login', { id: '9822233344', password: 'whatever1' })).data.needsSetup === true, 'login before setting password explains what to do');
  const li = await anil.call('GET', '/api/app/link?token=' + token);
  ok(li.status === 200 && li.data.name === 'Anil Kumar', 'welcome link shows their name');
  ok((await anil.call('POST', '/api/app/link', { token, password: '1234' })).status === 400, 'short password refused');
  ok((await anil.call('POST', '/api/app/link', { token, password: 'garden-tea-time' })).status === 200, 'password set from link');
  const as2 = await anil.refresh();
  ok(as2.data.products.map((p) => p.id).join() === 'karehome,karenest', 'Anil (KareNest) gets KareNest and Kare@Home');
  ok((await client().call('POST', '/api/app/link', { token, password: 'garden-tea-time' })).status === 404, 'link works only once');

  const ov = await admin.call('GET', '/api/app/admin/overview');
  ok(ov.data.per.karehome.active >= 2 && ov.data.per.karenest.active >= 2, 'overview counts per brand');
  const ppl = await admin.call('GET', '/api/app/admin/people?product=karenest');
  ok(ppl.data.rows.every((x) => x.plans.some((p) => p.product === 'karenest')), 'people filter by brand');
  const act3 = await admin.call('GET', '/api/app/admin/activity');
  ok(act3.data.rows.length > 5, 'activity log');
  // website editor opens with the app admin session
  const ed = await fetch(BASE + '/api/admin/content', { headers: { Cookie: admin.cookie } });
  ok(ed.status === 200, 'website editor accepts the app admin sign-in');
  const ed2 = await fetch(BASE + '/api/admin/content', { headers: { Cookie: fam.cookie } });
  ok(ed2.status === 401, 'website editor refuses a family sign-in');

  // --- open sign-up, then choose a plan in the app
  const nu = client();
  const su = await nu.call('POST', '/api/app/signup', { name: 'Divya Raj', phone: '9844455566', email: 'divya@example.com', password: 'green-tea-morning' });
  ok(su.status === 201, 'anyone can create a family account');
  const nus = await nu.refresh();
  ok(nus.data.signedIn && nus.data.products.length === 0, 'new account has no plan yet');
  ok((await client().call('POST', '/api/app/signup', { name: 'X Y', phone: '9844455566', password: 'another-pass-1' })).data.errors.phone, 'same mobile number cannot sign up twice');
  const opts = await nu.call('GET', '/api/app/plans/options');
  ok(opts.data.products.length === 2 && opts.data.products[0].plans.some((x) => x.priceText), 'plan choices with prices');
  const pr = await nu.call('POST', '/api/app/plans/request', { product: 'karenest', planId: 'kareplus', personName: 'Usha Raj', relation: 'Mother', note: 'From January' });
  ok(pr.status === 201, 'family chooses a KareNest plan in the app');
  const nus2 = await nu.refresh();
  ok(nus2.data.products.length === 2 && nus2.data.products.every((p) => p.status === 'pending'), 'KareNest (and included Kare@Home) show "being set up"');
  const dup = await nu.call('POST', '/api/app/plans/request', { product: 'karehome', personId: pr.data.personId });
  ok(dup.status === 409 && /included/.test(dup.data.message), 'asking for Kare@Home for a KareNest resident says it is already included');
  ok((await nu.call('POST', '/api/app/plans/request', { product: 'karenest', personId: pr.data.personId })).status === 409, 'same person cannot ask twice for the same brand');
  const rq2 = (await admin.call('GET', '/api/app/admin/requests')).data.rows.find((x) => x.reference === pr.data.reference);
  ok(rq2 && rq2.kind === 'plan-request' && rq2.product === 'karenest', 'plan request is in the office inbox');
  const a3 = await admin.call('POST', '/api/app/admin/activate', { requestKind: 'enquiry', requestId: rq2.id, product: 'karenest', planId: 'kareplus', months: 12, familyName: 'Divya Raj', familyPhone: '9844455566', personName: 'Usha Raj', relation: 'Mother' });
  ok(a3.status === 200 && a3.data.plan.status === 'active', 'office activates the app request (no confirmation needed: it is their own)');
  ok((await nu.refresh()).data.products[0].status === 'active', 'family now sees KareNest active');
  // someone signs up with a number that later books on the website: office must confirm before linking
  const sq = client();
  await sq.call('POST', '/api/app/signup', { name: 'Not The Booker', phone: '9855566677', password: 'squat-pass-123' });
  const bk2 = await site.call('POST', '/api/bookings', { name: 'Real Booker', phone: '9855566677', area: 'Kochi', service: 'home-care', package: 'homestart', careFor: 'parent', consent: true });
  const row2 = (await admin.call('GET', '/api/app/admin/requests')).data.rows.find((x) => x.reference === bk2.data.reference);
  const a4 = await admin.call('POST', '/api/app/admin/activate', { requestKind: 'booking', requestId: row2.id, product: 'karehome', planId: 'homestart', familyName: 'Real Booker', familyPhone: '9855566677', personName: 'Amma' });
  ok(a4.status === 409 && a4.data.needsConfirm, 'unverified self-made account is not linked without the office confirming');
  ok((await sq.refresh()).data.products.length === 0, 'that account still sees nothing');
  const a5 = await admin.call('POST', '/api/app/admin/activate', { requestKind: 'booking', requestId: row2.id, product: 'karehome', planId: 'homestart', familyName: 'Real Booker', familyPhone: '9855566677', personName: 'Amma', confirmAccount: true });
  ok(a5.status === 200, 'linked after the office ticks "confirmed on the phone"');
  // existing account adds a website booking with its reference
  const bk3 = await site.call('POST', '/api/bookings', { name: 'Divya Raj', phone: '9844455566', area: 'Kochi', service: 'physiotherapy', package: 'kb-base', careFor: 'parent', consent: true });
  ok((await site.call('POST', '/api/app/start', { reference: bk3.data.reference, phone: '9844455566', check: true })).status === 409, 'website set-up tells an existing account to sign in instead');
  const cl = await nu.call('POST', '/api/app/claim', { reference: bk3.data.reference, personName: 'Raj Kumar', relation: 'Father' });
  ok(cl.status === 201 && cl.data.product === 'karehome', 'signed-in family adds the website booking');
  ok((await nu.refresh()).data.products.length === 2, 'now both brands (picker)');
  ok((await rahul.call('POST', '/api/app/claim', { reference: bk3.data.reference, personName: 'X Y' })).status === 404, 'cannot add someone else\'s booking');

  await fam.call('POST', '/api/app/logout', {});
  ok((await fam.call('GET', '/api/app/home?product=karehome')).status === 401, 'signed out');
  console.log(fails ? `\n${fails} FAILED` : '\nALL PASSED');
  process.exit(fails ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
