// The automatic risk engine.
//
// 1. Inputs: the latest valid reading of each vital and assessment (app_readings, never voided
//    ones, never before the registration date) and the person's facts (app_people, app_details).
// 2. Each indicator in riskrules.js is calculated exactly as the workbook says whenever its inputs
//    are there. The workbook rules are clinically approved, so they are active by default.
//    Where the workbook is inconsistent, a value is only used when every alternative gives the
//    same result (riskrules.consensus); otherwise that result is "unresolved" and never counts.
// 3. Office > Settings > Risk rules can record an answer to a workbook inconsistency, a category
//    for a band the workbook leaves uncategorised, how long a result stays valid, and whether an
//    indicator is required before a customer can be Green. Every change is kept (app_risk_rules).
// 4. Overall category from the sheet's purposes only (single vitals are shown, not counted), worst case first:
//      Red   - any counting indicator is Red
//      Amber - otherwise any counting indicator is Amber
//      Green - otherwise every REQUIRED applicable indicator for this person counts and is Green
//      Grey  - otherwise (missing, invalid, expired, unresolved or uncategorised data is never Green)
// 5. Every recalculation that changes something is kept as a snapshot (app_risk_status); each new
//    indicator result is kept in the risk history (app_risks, source 'auto'). All dashboards read
//    the same latest snapshot; none of them calculates risk itself.
const crypto = require('crypto');
const R = require('./riskrules');
const trends = require('./trends');

const DAY = 86400000;
const hash = (o) => crypto.createHash('sha256').update(JSON.stringify(o)).digest('hex').slice(0, 24);
const BASE_METRIC = { sbp: 'bp', chol: 'chol', bmi: 'bmi', bp: 'bp', hr: 'hr', spo2: 'spo2', pi: 'pi', glucose: 'glucose' };
const BASE_LABEL = { sex: 'Sex', age: 'Age', sbp: 'Systolic blood pressure', chol: 'Total cholesterol', bmi: 'BMI (weight and height)', bp: 'Blood pressure', hr: 'Pulse', spo2: 'Oxygen level', pi: 'Perfusion index', glucose: 'Blood sugar' };
const LEVEL = { red: 'bad', amber: 'warn', green: 'good' };
// Changing this makes every customer recalculate once (the rules version includes it).
const ENGINE = 'workbook-approved-3'; // 3: Risk and Other Indicators sheet defaults, overall from its purposes only
// Defaults while the owner has recorded nothing for an indicator: results do not expire (the
// workbook gives no validity period) and every applicable indicator is required for Green (so a
// customer is only Green when everything the workbook can assess for them is done and clear).
const DEFAULT_REQUIRED = { mode: 'all', packages: [] };

function create(ctx) {
  const { docs, uid, now } = ctx;
  const registeredMs = (p) => trends.registeredMs(p); // same start date as every chart and export

  // ---------------------------------------------------------------- rules in force
  // The workbook, plus whatever the owner recorded (the latest row per indicator; a withdrawn row
  // means "back to the workbook defaults").
  let cache = null;
  async function rules() {
    if (cache) return cache;
    const rows = await docs.find('app_risk_rules', {}, { sort: { at: -1 } });
    const latest = {};
    for (const r of rows) if (!latest[r.indicator]) latest[r.indicator] = r;
    const recorded = Object.fromEntries(Object.entries(latest).filter(([, r]) => r.approved));
    const choices = { ...R.SHEET_CHOICES };
    for (const r of Object.values(recorded)) Object.assign(choices, r.choices || {});
    const config = {};
    for (const ind of R.INDICATORS) config[ind.id] = effective(ind, recorded[ind.id], choices);
    const version = hash([ENGINE, Object.values(recorded).map((r) => r.id).sort()]);
    cache = { recorded, choices, config, version, rows };
    return cache;
  }
  function invalidate() { cache = null; }
  // the configuration actually used for an indicator
  function effective(ind, row, choices) {
    const mapping = {};
    for (const b of ind.bands) if (b.proposed) mapping[b.key] = b.proposed;
    for (const [k, v] of Object.entries((row && row.mapping) || {})) if (['red', 'amber', 'green'].includes(v) && ind.bands.some((b) => b.key === k)) mapping[k] = v;
    const open = R.decisionsOf(ind).filter((d) => (d.kind === 'thresholds' ? !choices[d.id] : !choices[d.id]));
    return { mapping, validityDays: row && row.validityDays >= 1 ? row.validityDays : null, required: (row && row.required) || DEFAULT_REQUIRED,
      open: open.map((d) => d.id), conflict: open.some((d) => d.affects === 'all'), recorded: Boolean(row) };
  }

  // ---------------------------------------------------------------- inputs for one person
  async function gather(person) {
    const [readings, details, plans] = await Promise.all([
      docs.find('app_readings', { personId: person.id, voided: false }, { sort: { measuredAt: -1 } }),
      docs.findOne('app_details', { id: 'det-' + person.id }),
      docs.find('app_plans', { personId: person.id })
    ]);
    // every valid reading counts, also one dated before registration (an older report uploaded later)
    const reg = trends.historyStartMs(person, readings);
    // newest first; two results at the same moment: the one entered last wins
    readings.sort((a, b) => (b.measuredMs - a.measuredMs) || String(b.enteredAt || b.createdAt || '').localeCompare(String(a.enteredAt || a.createdAt || '')));
    const latest = {};
    for (const r of readings) if (r.measuredMs >= reg && !latest[r.metric]) latest[r.metric] = r;
    // age in whole years: from the date of birth on the details form when there is one, else the birth year
    let age = null, ageFrom = null;
    const dob = details && details.data && /^\d{4}-\d{2}-\d{2}$/.test(details.data.dob || '') ? details.data.dob : null;
    if (dob) {
      const t = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
      age = Number(t.slice(0, 4)) - Number(dob.slice(0, 4)) - (t.slice(5) < dob.slice(5) ? 1 : 0); ageFrom = 'date of birth';
    } else if (person.birthYear) { age = new Date().getFullYear() - person.birthYear; ageFrom = 'birth year'; }
    const packages = plans.filter((p) => p.status === 'active' || p.status === 'paused').map((p) => p.planId).filter(Boolean);
    return { latest, age, ageFrom, sex: person.sex === 'male' || person.sex === 'female' ? person.sex : null, packages };
  }

  // ---------------------------------------------------------------- one indicator
  function evalIndicator(ind, person, g, rs) {
    const cfg = rs.config[ind.id];
    const c = rs.choices;
    const out = { id: ind.id, title: ind.title, short: ind.short, group: ind.group, groupName: R.GROUPS[ind.group], vital: Boolean(ind.vital), approved: !ind.blocked, inputs: [], missing: [] };
    if (ind.blocked) return { ...out, status: 'blocked', message: ind.blocked };
    if (ind.women && g.sex === 'male') return { ...out, status: 'not_applicable', message: 'For women only.' };
    if (cfg.conflict) {
      const ds = R.decisionsOf(ind).filter((d) => d.affects === 'all' && !c[d.id]);
      return { ...out, status: 'unresolved', decisions: ds.map((d) => d.id), message: 'The workbook gives two different ' + (ds.length > 1 ? 'rules' : 'rules') + ' for this indicator, so it cannot be calculated yet: ' + ds.map((d) => d.question).join(' ') };
    }
    const x = {};
    const used = [];
    // sex, age, vitals
    for (const k of ind.base || []) {
      if (k === 'sex') { if (!g.sex) out.missing.push('Sex'); else x.sex = g.sex; continue; }
      if (k === 'age') { if (g.age == null) out.missing.push('Age (date of birth)'); else x.age = g.age; continue; }
      const r = g.latest[BASE_METRIC[k]];
      if (!r) { out.missing.push(BASE_LABEL[k]); continue; }
      x[k] = k === 'sbp' ? r.systolic : k === 'bp' ? { systolic: r.systolic, diastolic: r.diastolic } : k === 'glucose' ? { value: r.value, context: r.context } : r.value;
      used.push(r);
      out.inputs.push({ k, label: BASE_LABEL[k], value: k === 'bp' || k === 'sbp' ? r.systolic + '/' + r.diastolic : r.value, at: r.measuredAt });
    }
    if (ind.women && !g.sex) return { ...out, status: 'missing', message: 'Sex is not recorded, so it is not known whether this check applies.', missing: ['Sex'] };
    // recorded assessments
    for (const k of [...R.inputsOf(ind, c), ...(ind.optional || [])]) {
      const r = g.latest[k];
      if (!r) { if (!(ind.optional || []).includes(k)) out.missing.push(R.INPUTS[k].label); continue; }
      x[k] = r.value; used.push(r);
      out.inputs.push({ k, label: R.INPUTS[k].label, value: r.value, unit: R.INPUTS[k].unit, at: r.measuredAt });
    }
    // facts about the person
    for (const k of ind.facts || []) {
      const v = person[k];
      x[k] = v;
      if (v === undefined || v === null || v === '') { if (!ind.factsReady) out.missing.push(R.FACTS[k].label.replace(/\?$/, '')); }
      else out.inputs.push({ k, label: R.FACTS[k].label, value: v === true ? 'Yes' : v === false ? 'No' : (R.FACTS[k].options || {})[v] || v });
    }
    if (ind.factsReady && !ind.factsReady(x)) out.missing.push('Diabetes and impaired fasting glucose answers');
    if (ind.applies && !out.missing.length) { const why = ind.applies(x); if (why) return { ...out, status: 'not_applicable', message: why }; }
    if (out.missing.length) return { ...out, status: 'missing', message: 'Needs: ' + out.missing.join(', ') + '.' };
    const res = R.consensus(ind, x, c);
    if (res.error) return { ...out, status: 'error', message: 'The calculation failed: ' + res.error };
    if (res.unresolved) return { ...out, status: 'unresolved', decisions: res.unresolved, message: 'This value falls where the workbook is inconsistent, so it is not classified: ' + res.unresolved.map((id) => R.DECISION[id].question).join(' ') };
    if (res.missing) return { ...out, status: 'missing', message: 'Needs: ' + res.missing.map((k) => R.INPUTS[k].label).join(', ') + '.', missing: res.missing.map((k) => R.INPUTS[k].label) };
    if (res.skip) return { ...out, status: 'skipped', message: res.skip };
    if (!Number.isFinite(res.value)) return { ...out, status: 'error', message: 'The inputs gave a result that is not a number.' };
    const times = used.map((r) => r.measuredMs).filter(Number.isFinite);
    const band = res.bandKey ? R.pickBand(ind.bands, res.bandKey) : null;
    const o = { ...out, status: 'calculated', value: res.value, display: res.display, unit: res.unit || '', note: res.note || null, band, gap: res.gap || null,
      gapQuestion: res.gap ? R.DECISION[res.gap].question : null,
      at: times.length ? new Date(Math.max(...times)).toISOString() : null, inputsFrom: times.length ? new Date(Math.min(...times)).toISOString() : null,
      inputsKey: hash({ r: used.map((r) => r.id).sort(), f: (ind.facts || []).map((k) => person[k]), base: [x.sex, x.age], ch: R.decisionsOf(ind).map((d) => c[d.id]) }) };
    o.category = band ? cfg.mapping[band.key] || null : null;
    if (!band) o.message = 'The workbook gives no band for this result: ' + o.gapQuestion;
    else if (!o.category) o.message = 'The workbook gives "' + band.label + '" no Red, Amber or Green category, so it is shown but not counted.';
    o.validityDays = cfg.validityDays;
    o.validUntil = cfg.validityDays && o.inputsFrom ? new Date(Date.parse(o.inputsFrom) + cfg.validityDays * DAY).toISOString() : null;
    o.expired = Boolean(o.validUntil && Date.parse(o.validUntil) < Date.now());
    o.counts = Boolean(o.category && !o.expired);
    if (o.expired) o.message = 'Out of date: valid for ' + cfg.validityDays + ' days from ' + o.inputsFrom.slice(0, 10) + '.';
    return o;
  }

  function requiredFor(cfg, g) {
    const r = cfg.required || DEFAULT_REQUIRED;
    if (r.mode === 'all') return true;
    if (r.mode === 'packages') return g.packages.some((p) => (r.packages || []).includes(p));
    return false;
  }

  // ---------------------------------------------------------------- one person, all indicators
  async function evaluate(person) {
    const rs = await rules();
    const g = await gather(person);
    const indicators = R.INDICATORS.map((ind) => {
      const r = evalIndicator(ind, person, g, rs);
      r.inOverall = R.IN_OVERALL(ind);
      r.required = r.inOverall && !ind.blocked && requiredFor(rs.config[ind.id], g) && r.status !== 'not_applicable';
      r.level = r.counts ? LEVEL[r.category] : null;
      r.categoryName = r.category ? R.CATEGORIES[r.category] : null;
      return r;
    });
    const counting = indicators.filter((i) => i.counts && i.inOverall);
    const reds = counting.filter((i) => i.category === 'red');
    const ambers = counting.filter((i) => i.category === 'amber');
    const required = indicators.filter((i) => i.required);
    let category, responsible, reason;
    if (reds.length) { category = 'red'; responsible = reds; reason = 'At least one assessed indicator is Very High Risk.'; }
    else if (ambers.length) { category = 'amber'; responsible = ambers; reason = 'No indicator is Very High Risk, but at least one needs attention.'; }
    else if (required.length && required.every((i) => i.counts && i.category === 'green')) { category = 'green'; responsible = required; reason = 'Every required assessment is complete, current and shows no risk.'; }
    else {
      category = 'grey'; responsible = [];
      if (!required.length) reason = 'No indicator is required for Green for this customer, and none shows a risk.';
      else {
        const gaps = required.filter((i) => !(i.counts && i.category === 'green'));
        const why = (i) => (i.status === 'calculated' ? (i.expired ? 'out of date' : !i.band ? 'no workbook band' : 'no category in the workbook') : i.status === 'missing' ? 'not done' : i.status === 'unresolved' ? 'workbook inconsistency' : i.status.replace('_', ' '));
        reason = 'Not assessed: ' + gaps.length + ' of ' + required.length + ' required indicator' + (required.length === 1 ? ' is' : 's are') + ' not complete and clear (' + gaps.slice(0, 6).map((i) => i.short + ': ' + why(i)).join(', ') + (gaps.length > 6 ? ', and ' + (gaps.length - 6) + ' more' : '') + ').';
      }
    }
    // the earliest moment a counting result expires: the category may change then
    const ends = counting.map((i) => i.validUntil).filter(Boolean).map(Date.parse);
    const validUntil = ends.length ? new Date(Math.min(...ends)).toISOString() : null;
    return { category, categoryName: R.CATEGORIES[category], reason, responsible: responsible.map((i) => ({ id: i.id, title: i.title, short: i.short, display: i.display || null, band: i.band ? i.band.label : null, category: i.category || null, at: i.at || null })),
      indicators, rulesVersion: rs.version, validUntil, age: g.age, ageFrom: g.ageFrom,
      flags: reds.length + ambers.length, counted: counting.length };
  }

  // ---------------------------------------------------------------- saving
  const locks = new Map();
  function locked(key, fn) { const prev = locks.get(key) || Promise.resolve(); const run = prev.then(fn, fn); locks.set(key, run.catch(() => {})); return run; }

  async function recalc(personId, trigger, by) {
    return locked(personId, async () => {
      const person = await docs.findOne('app_people', { id: personId });
      if (!person) return null;
      let ev;
      try { ev = await evaluate(person); } catch (e) {
        // never leave a stale status looking current: record the failure on the person
        console.error('[risk] recalculation failed for ' + personId + ':', e.message);
        await docs.update('app_people', personId, { riskError: { at: now(), message: e.message, trigger: trigger || null } });
        return { error: e.message };
      }
      // new indicator results go into the risk history (one row per distinct set of inputs)
      for (const i of ev.indicators.filter((x) => x.status === 'calculated')) {
        const id = 'auto-' + personId + '-' + i.id + '-' + i.inputsKey;
        if (await docs.findOne('app_risks', { id })) continue;
        await docs.insert('app_risks', { id, personId, test: i.id, source: 'auto', value: i.value, display: i.display, band: i.band ? i.band.label : 'Between workbook bands', bandKey: i.band ? i.band.key : null,
          level: i.level, category: i.category || null, approved: i.approved, note: i.note, inputs: i.inputs, inputsFrom: i.inputsFrom, at: i.at || now(), rulesVersion: ev.rulesVersion, createdAt: now() });
      }
      const fp = hash({ c: ev.category, r: ev.responsible.map((x) => x.id), i: ev.indicators.map((x) => [x.id, x.status, x.value ?? null, x.band ? x.band.key : null, x.category || null, x.counts || false, x.required || false]) });
      const last = person.riskSnapshotId ? await docs.findOne('app_risk_status', { id: person.riskSnapshotId }) : null;
      let snap = last;
      if (!last || last.fingerprint !== fp) {
        snap = { id: uid(), personId, category: ev.category, reason: ev.reason, responsible: ev.responsible, indicators: ev.indicators, rulesVersion: ev.rulesVersion,
          validUntil: ev.validUntil, flags: ev.flags, counted: ev.counted, fingerprint: fp, trigger: trigger || null, by: by || null, previous: last ? last.category : null, at: now(), checkedAt: now() };
        await docs.insert('app_risk_status', snap);
      } else {
        await docs.update('app_risk_status', last.id, { checkedAt: now(), validUntil: ev.validUntil, rulesVersion: ev.rulesVersion });
        snap = { ...last, checkedAt: now(), validUntil: ev.validUntil, rulesVersion: ev.rulesVersion };
      }
      await docs.update('app_people', personId, { riskCategory: ev.category, riskFlags: ev.flags, riskCounted: ev.counted, riskSnapshotId: snap.id, riskAt: snap.at, riskCheckedAt: now(), riskValidUntil: ev.validUntil, riskRulesVersion: ev.rulesVersion, riskError: null });
      return snap;
    });
  }

  // The current status; recalculated first when rules changed, a result expired or none exists yet
  async function status(personId) {
    const [person, rs] = await Promise.all([docs.findOne('app_people', { id: personId }), rules()]);
    if (!person) return null;
    const stale = !person.riskSnapshotId || person.riskRulesVersion !== rs.version || (person.riskValidUntil && Date.parse(person.riskValidUntil) < Date.now());
    const snap = stale ? await recalc(personId, stale && person.riskSnapshotId ? 'expiry or rules change' : 'first calculation') : await docs.findOne('app_risk_status', { id: person.riskSnapshotId });
    if (!snap || snap.error) return { error: (snap && snap.error) || 'Not calculated', category: 'grey', categoryName: R.CATEGORIES.grey };
    const p2 = stale ? await docs.findOne('app_people', { id: personId }) : person;
    return { ...snap, categoryName: R.CATEGORIES[snap.category], error: p2.riskError || null };
  }
  async function history(personId, limit) {
    return docs.find('app_risk_status', { personId }, { sort: { at: -1 }, limit: limit || 50 });
  }
  // results go out of date with time alone: anyone whose status has expired (or was never
  // calculated, or was calculated under other rules) is recalculated
  async function refreshStale() {
    const rs = await rules();
    const people = await docs.find('app_people');
    let n = 0;
    for (const p of people) {
      if (!p.riskSnapshotId || p.riskRulesVersion !== rs.version || (p.riskValidUntil && Date.parse(p.riskValidUntil) < Date.now())) { await recalc(p.id, p.riskSnapshotId ? 'expiry or rules change' : 'first calculation'); n++; }
    }
    return n;
  }
  async function recalcAll(trigger, by) {
    const people = await docs.find('app_people');
    let n = 0;
    for (const p of people) { await recalc(p.id, trigger, by); n++; }
    return n;
  }

  // ---------------------------------------------------------------- Risk rules screen (office)
  async function rulesView() {
    const rs = await rules();
    const users = await docs.find('app_users', { role: 'admin' });
    const nameOf = (id) => (users.find((u) => u.id === id) || {}).name || id;
    const view = (r) => (r ? { id: r.id, approved: r.approved, choices: r.choices || {}, mapping: r.mapping || {}, validityDays: r.validityDays || null, required: r.required || null, approverName: r.approverName || null, by: nameOf(r.by), at: r.at, note: r.note || null } : null);
    const latestAny = {};
    for (const r of rs.rows) if (!latestAny[r.indicator]) latestAny[r.indicator] = r;
    return {
      categories: R.CATEGORIES,
      defaults: { validityDays: null, required: DEFAULT_REQUIRED },
      global: { decisions: R.DECISIONS.filter((d) => d.indicator === '_global'), choices: rs.choices, rule: view(latestAny._global) },
      indicators: R.INDICATORS.map((ind) => {
        const cfg = rs.config[ind.id];
        const dec = R.decisionsOf(ind);
        const state = ind.blocked ? 'blocked' : cfg.conflict ? 'conflict' : cfg.open.length ? 'partial' : 'active';
        return { id: ind.id, title: ind.title, group: R.GROUPS[ind.group], vital: Boolean(ind.vital), women: Boolean(ind.women), blocked: ind.blocked || null, refs: ind.refs, state,
          inputs: [...(ind.base || []).map((k) => BASE_LABEL[k]), ...(ind.needs || []).map((k) => R.INPUTS[k].label), ...(ind.facts || []).map((k) => R.FACTS[k].label)],
          decisions: dec.filter((d) => d.indicator !== '_global'), usesGlobal: dec.some((d) => d.indicator === '_global'), open: cfg.open,
          bands: ind.bands.map((b) => ({ key: b.key, label: b.label, proposed: b.proposed, category: cfg.mapping[b.key] || null, scale: b.scale || b.method || null })),
          uncategorised: ind.bands.filter((b) => !cfg.mapping[b.key]).map((b) => b.label),
          validityDays: cfg.validityDays, required: cfg.required, choices: Object.fromEntries(dec.map((d) => [d.id, rs.choices[d.id] ?? null])),
          rule: view(latestAny[ind.id]) };
      })
    };
  }
  // The owner records answers to workbook inconsistencies, categories for uncategorised bands,
  // validity and required-for-Green. Every save is a new row with the name of the person deciding.
  async function saveRule(indicator, body, user) {
    const isGlobal = indicator === '_global';
    const ind = isGlobal ? null : R.BY_ID[indicator];
    if (!isGlobal && (!ind || ind.blocked)) return { error: 'This indicator cannot be configured: ' + (ind ? ind.blocked : 'unknown indicator') };
    const approverName = String(body.approverName || '').replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, 120);
    if (body.withdraw) {
      const row = { id: uid(), indicator, approved: false, note: String(body.note || '').slice(0, 300) || 'Back to the workbook defaults', by: user.id, approverName: approverName || null, at: now() };
      await docs.insert('app_risk_rules', row);
      invalidate();
      return { row };
    }
    if (approverName.length < 3) return { errors: { approverName: 'Enter the name of the person making this decision' } };
    if (body.confirm !== true) return { errors: { confirm: 'Confirm that this decision was made by the person named' } };
    const decs = isGlobal ? R.DECISIONS.filter((d) => d.indicator === '_global') : R.decisionsOf(ind).filter((d) => d.indicator !== '_global');
    const choices = {};
    const errors = {};
    for (const d of decs) {
      const v = (body.choices || {})[d.id];
      if (v === undefined || v === null || v === '') continue; // left open
      if (d.kind === 'thresholds') {
        const t = {};
        for (const f of d.fields) { const n = Number(v && v[f[0]]); if (Number.isFinite(n) && n >= 0 && n <= 100) t[f[0]] = n; }
        if (Object.keys(t).length === 0) continue;
        if (Object.keys(t).length !== d.fields.length) errors['c-' + d.id] = 'Enter both cut-offs, from 0 to 100';
        else if (t.redFrom < t.amberFrom) errors['c-' + d.id] = 'The Red cut-off must not be below the Amber cut-off';
        else choices[d.id] = t;
      } else if (d.options.some((o) => o.id === v)) choices[d.id] = v;
    }
    const row = { id: uid(), indicator, approved: true, choices, approverName, by: user.id, at: now(), note: String(body.note || '').slice(0, 300) || null };
    if (!isGlobal) {
      const mapping = {};
      for (const b of ind.bands) { const v = (body.mapping || {})[b.key]; if (['red', 'amber', 'green'].includes(v)) mapping[b.key] = v; }
      row.mapping = mapping;
      if (body.validityDays !== undefined && body.validityDays !== null && body.validityDays !== '') {
        const n = Number(body.validityDays);
        if (!(Number.isInteger(n) && n >= 1 && n <= 3650)) errors.validityDays = 'Enter whole days from 1 to 3650, or leave it empty for no expiry';
        else row.validityDays = n;
      } else row.validityDays = null;
      const mode = body.required && body.required.mode;
      if (mode && !['all', 'none', 'packages'].includes(mode)) errors.required = 'Choose who it is required for';
      row.required = mode ? { mode, packages: mode === 'packages' ? [].concat(body.required.packages || []).map(String).slice(0, 40) : [] } : null;
      if (mode === 'packages' && !row.required.packages.length) errors.required = 'Choose at least one package';
    }
    if (Object.keys(errors).length) return { errors };
    await docs.insert('app_risk_rules', row);
    invalidate();
    return { row };
  }

  return { rules, invalidate, evaluate, recalc, recalcAll, refreshStale, status, history, rulesView, saveRule };
}

// What each role may see of a status: nurses get the current result read-only, without the
// input values (they do not see health history); families and the office see everything.
function view(st, role) {
  if (!st) return null;
  const base = { category: st.category, categoryName: st.categoryName || R.CATEGORIES[st.category], reason: st.reason || null, responsible: st.responsible || [], at: st.at || null, checkedAt: st.checkedAt || null, validUntil: st.validUntil || null, error: st.error ? st.error.message || st.error : null };
  const indicators = (st.indicators || []).map((i) => ({ id: i.id, title: i.title, short: i.short, group: i.group, groupName: i.groupName, vital: i.vital, status: i.status, value: i.value ?? null, display: i.display || null, unit: i.unit || '',
    band: i.band ? i.band.label : null, gap: i.gap || null, gapQuestion: i.gapQuestion || null, category: i.category || null, categoryName: i.categoryName || null, level: i.level || null, counts: Boolean(i.counts), inOverall: i.inOverall !== false, approved: Boolean(i.approved), required: Boolean(i.required),
    at: i.at || null, validUntil: i.validUntil || null, expired: Boolean(i.expired), message: i.message || null, note: i.note || null, missing: i.missing || [], decisions: i.decisions || [],
    inputs: role === 'caregiver' ? undefined : i.inputs }));
  return { ...base, indicators };
}

module.exports = { create, LEVEL, view };
