/* KareIQ health insights: plain statements about one person's own records.
 *
 * Input: the person's health dashboard (GET people/:id/dashboard?period=6m): every reading with the
 * level and status KareIQ's standard ranges already gave it, the overall risk category, the wellbeing
 * checks and the last visit. Nothing here calculates a new clinical result. It counts, averages and
 * compares what is recorded (last 30 days against the 30 days before) and says what it shows. No reading,
 * date or advice is invented; a measure without data gives no insight.
 *
 * Output: a list of insights, most important first:
 *   { id, kind, tone, metric, title, summary, facts: [[label, value]], spark: { points, unit }, href, rank }
 *   kind: risk | attention | watch | improving | good | gap | change | wellbeing | tracking
 *   tone: bad | warn | ok | good | info
 * Used by the Home card (top three) and the Health Insights page (all of them).
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.KQInsights = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  var DAY = 86400000;
  var BODY = ['weight', 'bmi', 'bodyfat', 'moisture', 'visceral', 'bone', 'bmr', 'protein', 'subfat', 'lean', 'height'];
  var ONE_DECIMAL = ['temp', 'pi', 'weight', 'bmi', 'bodyfat', 'moisture', 'bone', 'protein', 'subfat', 'lean', 'visceral'];
  // a difference smaller than this is "about the same" (the measurement's own noise)
  var STEP = { bp: 3, hr: 3, glucose: 5, spo2: 1, temp: 0.3, pi: 0.3, weight: 0.5, bmi: 0.3, chol: 8 };
  // measures checked at every visit: a long gap is worth saying
  var EVERY_VISIT = ['bp', 'hr', 'spo2', 'glucose', 'temp', 'pi'];
  var GAP_DAYS = 14;
  // levels from KareIQ's standard ranges (src/app/vitals.js): good = within the range, ok = slightly
  // outside it (elevated, slightly low, overweight…), warn / bad = outside it
  var IN = { good: 1 }, MILD = { ok: 1 }, OUT = { warn: 1, bad: 1 };

  var fmtD = typeof Intl !== 'undefined' ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short' }) : null;
  function day(ms) { return fmtD ? fmtD.format(new Date(ms)) : new Date(ms).toISOString().slice(0, 10); }
  function round(metric, v) { var k = ONE_DECIMAL.indexOf(metric) > -1 ? 10 : 1; return Math.round(v * k) / k; }
  function num(metric, v) { return String(round(metric, v)); }
  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : (many || one + 's')); }
  function mean(a) { return a.length ? a.reduce(function (s, x) { return s + x; }, 0) / a.length : null; }

  function valueOf(m, row) {
    if (m.keys && m.keys.length === 2) return row[m.keys[0]] != null ? row[m.keys[0]] + '/' + row[m.keys[1]] : null;
    return row.value != null ? num(m.metric, row.value) : null;
  }
  function avgOf(m, rows) {
    if (!rows.length) return null;
    if (m.keys && m.keys.length === 2) {
      var a = mean(rows.map(function (r) { return r[m.keys[0]]; }).filter(isFinite)), b = mean(rows.map(function (r) { return r[m.keys[1]]; }).filter(isFinite));
      return a == null ? null : { main: a, text: Math.round(a) + '/' + Math.round(b) };
    }
    var v = mean(rows.map(function (r) { return r.value; }).filter(function (x) { return typeof x === 'number' && isFinite(x); }));
    return v == null ? null : { main: v, text: num(m.metric, v) };
  }
  function inRange(rows) { return rows.filter(function (r) { return IN[r.level]; }).length; }
  function rated(rows) { return rows.filter(function (r) { return IN[r.level] || MILD[r.level] || OUT[r.level]; }); }

  function build(d, opts) {
    opts = opts || {};
    var now = opts.now || Date.now();
    var q = opts.q || '';
    var out = [];
    var add = function (o) { out.push(o); };
    var trendHref = function (metric) { return (BODY.indexOf(metric) > -1 ? '#/health/body' : '#/health/vitals') + q + (q ? '&' : '?') + 'm=' + encodeURIComponent(metric); };

    // ---------------------------------------------------------------- overall risk category
    var rs = d && d.riskStatus;
    if (rs && rs.category && { red: 1, amber: 1, green: 1 }[rs.category]) {
      var rtone = rs.category === 'red' ? 'bad' : rs.category === 'amber' ? 'warn' : 'good';
      // plain words for the family; the card's colour (red, amber, green) shows the level
      add({ id: 'risk', kind: 'risk', tone: rtone, metric: null, rank: rtone === 'bad' ? 0 : rtone === 'warn' ? 1 : 7,
        title: 'Overall risk: ' + { red: 'Critical', amber: 'Moderate', green: 'Good' }[rs.category],
        summary: rs.reason || 'Calculated automatically from the recorded vitals and assessments.',
        facts: (rs.responsible || []).slice(0, 4).map(function (x) { return [x.short || x.title, (x.display || '') + (x.band ? ' · ' + x.band : '')]; }).concat(rs.at ? [['Checked', day(Date.parse(rs.at))]] : []),
        href: '#/health/risks' + q });
    }

    // ---------------------------------------------------------------- each measure: last 30 days against the 30 before
    (d && d.series || []).forEach(function (m) {
      var rows = (m.rows || []).filter(function (r) { return r.ms; }).slice().sort(function (a, b) { return a.ms - b.ms; });
      if (!rows.length) return;
      var last = rows[rows.length - 1];
      var recent = rows.filter(function (r) { return r.ms >= now - 30 * DAY; });
      var prior = rows.filter(function (r) { return r.ms < now - 30 * DAY && r.ms >= now - 60 * DAY; });
      var spark = { unit: m.unit, points: rows.filter(function (r) { return r.ms >= now - 60 * DAY; }).map(function (r) { return { ms: r.ms, v: m.keys && m.keys.length === 2 ? r[m.keys[0]] : r.value, level: r.level || null }; }).filter(function (p) { return typeof p.v === 'number'; }) };
      var unit = m.unit ? ' ' + m.unit : '';
      var latestFact = ['Latest', valueOf(m, last) + unit + ' · ' + day(last.ms)];
      var rangeFact = m.range ? ['Standard range', m.range.replace(/^Standard /, '')] : null;
      var avgR = avgOf(m, recent), avgP = avgOf(m, prior);
      var change = '';
      if (avgR && avgP) {
        var delta = avgR.main - avgP.main, step = STEP[m.metric] != null ? STEP[m.metric] : Math.abs(avgP.main) * 0.03;
        change = Math.abs(delta) < step ? 'About the same as the 30 days before (' + avgP.text + unit + ').' : 'Average ' + (delta > 0 ? 'higher' : 'lower') + ' than the 30 days before (' + avgP.text + unit + ').';
      }
      var facts = [latestFact].concat(avgR ? [['30-day average', avgR.text + unit + ' · ' + plural(recent.length, 'reading')]] : []).concat(rangeFact ? [rangeFact] : []);
      var rR = rated(recent), rP = rated(prior);
      var outR = rR.length - inRange(rR);

      // a measure checked at every visit but not for a while
      if (EVERY_VISIT.indexOf(m.metric) > -1 && now - last.ms > GAP_DAYS * DAY) {
        add({ id: 'gap-' + m.metric, kind: 'gap', tone: 'info', metric: m.metric, rank: 3.5,
          title: m.label + ': not checked for ' + plural(Math.floor((now - last.ms) / DAY), 'day'),
          summary: 'The last reading was on ' + day(last.ms) + '. It is usually checked at every visit.',
          facts: [latestFact], spark: spark, href: trendHref(m.metric) });
      }
      if (!last.level || !(IN[last.level] || MILD[last.level] || OUT[last.level])) {
        // no standard range (weight, BMR…): only a clear change is worth saying
        if (m.metric === 'weight' && rows.length > 1) {
          var first = rows.filter(function (r) { return r.ms >= now - 182 * DAY; })[0] || rows[0];
          var dw = last.value - first.value;
          if (first !== last && Math.abs(dw) >= STEP.weight) add({ id: 'change-weight', kind: 'change', tone: 'info', metric: 'weight', rank: 4,
            title: 'Weight: ' + (dw > 0 ? 'up ' : 'down ') + num('weight', Math.abs(dw)) + ' kg since ' + day(first.ms),
            summary: 'From ' + num('weight', first.value) + ' kg to ' + num('weight', last.value) + ' kg on ' + day(last.ms) + ' (' + plural(rows.length, 'measurement') + ').',
            facts: [latestFact], spark: spark, href: trendHref('weight') });
        }
        return;
      }
      var latestOut = !!OUT[last.level];
      if (!recent.length) {
        // the latest reading is older than 30 days: say what it was and when
        if (latestOut || MILD[last.level]) add({ id: 'm-' + m.metric, kind: latestOut ? 'attention' : 'watch', tone: latestOut ? 'warn' : 'ok', metric: m.metric, rank: latestOut ? 1.8 : 2.8,
          title: m.label + ': ' + last.status + ' at the last check',
          summary: 'Last checked on ' + day(last.ms) + ' (' + valueOf(m, last) + unit + '). There is no newer reading.',
          facts: [latestFact].concat(rangeFact ? [rangeFact] : []), spark: spark, href: trendHref(m.metric) });
        return;
      }
      if (latestOut || (rR.length >= 3 && outR / rR.length >= 0.5)) {
        add({ id: 'm-' + m.metric, kind: 'attention', tone: last.level === 'bad' || recent.some(function (r) { return r.level === 'bad'; }) ? 'bad' : 'warn', metric: m.metric,
          rank: last.level === 'bad' ? 0.5 : 1.5,
          title: m.label + ': ' + (latestOut || MILD[last.level] ? last.status : 'often outside the standard range'),
          summary: (rR.length ? plural(outR, 'of ' + rR.length + ' reading', 'of ' + rR.length + ' readings') + ' in the last 30 days ' + (outR === 1 ? 'was' : 'were') + ' outside the standard range. ' : '') + change,
          facts: facts, spark: spark, href: trendHref(m.metric) });
        return;
      }
      var shareR = rR.length ? inRange(rR) / rR.length : null, shareP = rP.length ? inRange(rP) / rP.length : null;
      if (shareR != null && shareP != null && rP.length >= 2 && shareR - shareP >= 0.25) {
        add({ id: 'm-' + m.metric, kind: 'improving', tone: 'good', metric: m.metric, rank: 3,
          title: m.label + ': more readings in range',
          summary: inRange(rR) + ' of ' + rR.length + ' in range in the last 30 days, compared with ' + inRange(rP) + ' of ' + rP.length + ' in the 30 days before.',
          facts: facts, spark: spark, href: trendHref(m.metric) });
        return;
      }
      if (rR.length && outR === 0) {
        add({ id: 'm-' + m.metric, kind: 'good', tone: 'good', metric: m.metric, rank: 6,
          title: m.label + ': within range',
          summary: (rR.length === 1 ? 'The reading' : 'All ' + rR.length + ' readings') + ' in the last 30 days ' + (rR.length === 1 ? 'was' : 'were') + ' within the standard range. ' + change,
          facts: facts, spark: spark, href: trendHref(m.metric) });
        return;
      }
      if (rR.length) {
        add({ id: 'm-' + m.metric, kind: 'watch', tone: 'ok', metric: m.metric, rank: 2.5,
          title: m.label + ': ' + (MILD[last.level] ? last.status.charAt(0).toUpperCase() + last.status.slice(1) : 'mostly in range'),
          summary: plural(outR, 'of ' + rR.length + ' reading', 'of ' + rR.length + ' readings') + ' in the last 30 days ' + (outR === 1 ? 'was' : 'were') + ' outside the standard range' + (MILD[last.level] ? ', the latest slightly. ' : '; the latest is within it. ') + change,
          facts: facts, spark: spark, href: trendHref(m.metric) });
      }
    });

    // ---------------------------------------------------------------- wellbeing checks
    var checks = (d && d.obsHistory || []).filter(function (o) { return o.at && Date.parse(o.at) >= now - 60 * DAY; }).slice(0, 5);
    if (checks.length) {
      var latestC = checks[0], flagged = [];
      (latestC.groups || []).forEach(function (g) { (g.items || []).forEach(function (it) { if (it.flag) flagged.push(it); }); });
      var counts = {};
      checks.forEach(function (c) { (c.groups || []).forEach(function (g) { (g.items || []).forEach(function (it) { if (it.flag) counts[it.label] = (counts[it.label] || 0) + 1; }); }); });
      var repeated = Object.keys(counts).filter(function (k) { return counts[k] >= 2 && checks.length >= 2; });
      if (repeated.length) add({ id: 'wb-repeat', kind: 'wellbeing', tone: 'warn', metric: null, rank: 2,
        title: 'Wellbeing: ' + repeated.slice(0, 2).join(' and ') + (repeated.length > 2 ? ' and more' : '') + ' flagged more than once',
        summary: repeated.map(function (k) { return k + ' in ' + counts[k] + ' of the last ' + checks.length + ' checks'; }).join('; ') + '.',
        facts: [['Latest check', day(Date.parse(latestC.at)) + (latestC.by ? ' · ' + latestC.by : '')]], href: '#/health/wellbeing' + q });
      else if (flagged.length) add({ id: 'wb-latest', kind: 'wellbeing', tone: 'warn', metric: null, rank: 2.2,
        title: 'Wellbeing: ' + plural(flagged.length, 'item') + ' to watch from the latest check',
        summary: flagged.slice(0, 3).map(function (it) { return it.label + ': ' + it.text; }).join('; ') + '.',
        facts: [['Checked', day(Date.parse(latestC.at)) + (latestC.by ? ' · ' + latestC.by : '')]], href: '#/health/wellbeing' + q });
      else add({ id: 'wb-ok', kind: 'good', tone: 'good', metric: null, rank: 6.5,
        title: 'Wellbeing: nothing to watch at the latest check',
        summary: 'Food, water, toilet, sleep, pain, memory and medicines were all fine on ' + day(Date.parse(latestC.at)) + '.',
        facts: [['Checked', day(Date.parse(latestC.at)) + (latestC.by ? ' · ' + latestC.by : '')]], href: '#/health/wellbeing' + q });
    }

    // ---------------------------------------------------------------- how regularly things are recorded
    var days30 = {}, n30 = 0;
    (d && d.series || []).forEach(function (m) { (m.rows || []).forEach(function (r) { if (r.ms >= now - 30 * DAY) { n30++; days30[day(r.ms)] = 1; } }); });
    var nd = Object.keys(days30).length;
    if (n30) add({ id: 'tracking', kind: 'tracking', tone: 'good', metric: null, rank: 6.8,
      title: 'Good progress: ' + plural(n30, 'reading') + ' in the last 30 days',
      summary: 'Recorded on ' + plural(nd, 'day') + (d.lastVisit && d.lastVisit.by ? ', most recently by ' + d.lastVisit.by + ' on ' + day(Date.parse(d.lastVisit.at)) : '') + '.',
      facts: [], href: '#/health/vitals' + q });

    return out.sort(function (a, b) { return a.rank - b.rank; });
  }

  // the sections of the Health Insights page, in order
  var SECTIONS = [
    ['attention', 'Needs attention', ['risk', 'attention', 'wellbeing'], function (x) { return x.tone === 'bad' || x.tone === 'warn'; }],
    ['watch', 'Worth watching', ['watch', 'gap', 'change'], null],
    ['improving', 'Improving', ['improving'], null],
    ['good', 'Going well', ['good', 'risk', 'tracking'], function (x) { return x.tone === 'good'; }]
  ];
  function sections(list) {
    var used = {};
    return SECTIONS.map(function (s) {
      var items = list.filter(function (x) { return !used[x.id] && s[2].indexOf(x.kind) > -1 && (!s[3] || s[3](x)); });
      items.forEach(function (x) { used[x.id] = 1; });
      return { key: s[0], title: s[1], items: items };
    }).filter(function (s) { return s.items.length; });
  }

  return { build: build, sections: sections, DAY: DAY, GAP_DAYS: GAP_DAYS };
}));
