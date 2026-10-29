// "Download trends": a PDF health report for one person and period (family and office only).
// Uses pdf-lib (pure JavaScript, no system tools). Standard PDF fonts only understand basic
// Western characters, so a few symbols are swapped for plain text (₹ -> Rs, ² -> 2).

let PDF = null;
try { PDF = require('pdf-lib'); } catch { /* reported to the user if missing */ }

const W = 595.28, H = 841.89, M = 42;
const C = {
  ink: [0.07, 0.17, 0.24], muted: [0.38, 0.45, 0.52], line: [0.85, 0.88, 0.92], brand: [0.05, 0.4, 0.38],
  s1: [0.31, 0.71, 0.93], s2: [0.11, 0.2, 0.75],
  good: [0.13, 0.55, 0.27], ok: [0.85, 0.65, 0.05], warn: [0.9, 0.45, 0.05], bad: [0.72, 0.1, 0.1], none: [0.5, 0.55, 0.6]
};
const LEVEL_TEXT = { good: 'Normal', ok: 'Watch', warn: 'Attention', bad: 'High' };

function safe(s) {
  return String(s == null ? '' : s)
    .replace(/₹/g, 'Rs ').replace(/[²]/g, '2').replace(/⁹/g, '9').replace(/[−]/g, '-').replace(/[…]/g, '...')
    .replace(/[^\x20-\x7E -ÿ–—‘’“”•]/g, '');
}

async function build(data) {
  if (!PDF) throw Object.assign(new Error('The PDF report is not available on this server yet (run npm install).'), { status: 503 });
  const { PDFDocument, StandardFonts, rgb } = PDF;
  const doc = await PDFDocument.create();
  doc.setTitle(safe(`Health report - ${data.person.name}`));
  doc.setAuthor('KareIQ');
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const col = (a) => rgb(a[0], a[1], a[2]);
  let page, y;

  function newPage() {
    page = doc.addPage([W, H]);
    y = H - M;
  }
  function need(h) { if (y - h < M + 30) newPage(); }
  function text(s, x, yy, size, f, color) { page.drawText(safe(s), { x, y: yy, size, font: f || font, color: col(color || C.ink) }); }
  function width(s, size, f) { return (f || font).widthOfTextAtSize(safe(s), size); }
  function fit(s, size, max, f) { let t = safe(s); while (t.length > 3 && width(t, size, f) > max) t = t.slice(0, -2); return t === safe(s) ? t : t + '...'; }
  function wrap(s, size, max, f) {
    const words = safe(s).split(/\s+/); const lines = []; let cur = '';
    for (const w of words) { const next = cur ? cur + ' ' + w : w; if (width(next, size, f) > max && cur) { lines.push(cur); cur = w; } else cur = next; }
    if (cur) lines.push(cur);
    return lines;
  }
  function hr() { page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.7, color: col(C.line) }); }
  function heading(s) { need(40); y -= 22; text(s, M, y, 13, bold, C.brand); y -= 8; hr(); y -= 14; }
  function dot(x, yy, level) { page.drawCircle({ x, y: yy, size: 3.2, color: col(C[level] || C.none) }); }

  const has = (p) => (data.parts || []).includes(p);
  const arrow = { improving: 'Improving', worsening: 'Worsening', stable: 'Stable', none: 'No trend yet' };
  const trendColor = { improving: C.good, worsening: C.bad, stable: C.muted, none: C.muted };

  // ---------------------------------------------------------------- cover
  newPage();
  text('KareIQ', M, y - 4, 11, bold, C.brand);
  y -= 30;
  text('Health trends report', M, y, 22, bold);
  y -= 22;
  text(data.person.name + (data.person.id ? '  (' + data.person.id + ')' : ''), M, y, 13, bold);
  y -= 16;
  const facts = [data.person.age ? data.person.age + ' years' : null, data.person.sexName].filter(Boolean).join(' | ');
  if (facts) { text(facts, M, y, 10, font, C.muted); y -= 14; }
  for (const l of wrap('Reporting period: ' + data.periodLine, 10, W - 2 * M)) { text(l, M, y, 10, font, C.muted); y -= 13; }
  text('Data covered: ' + (data.covered ? data.covered.from + ' to ' + data.covered.to : 'no measurements for the chosen vitals in this period'), M, y, 10, font, C.muted); y -= 13;
  for (const l of wrap('Vitals: ' + data.metrics.map((m) => m.label).join(', '), 10, W - 2 * M)) { text(l, M, y, 10, font, C.muted); y -= 13; }
  for (const l of wrap('Includes: ' + data.partNames.join(', '), 10, W - 2 * M)) { text(l, M, y, 10, font, C.muted); y -= 13; }
  text(`Created ${data.createdAt} by ${data.createdBy}`, M, y, 10, font, C.muted); y -= 6;

  // ---------------------------------------------------------------- latest measurements in the period
  if (has('latest')) {
    heading('Latest measurements and status');
    const cols = [M, M + 150, M + 270, M + 390];
    [['Vital', 0], ['Latest value', 1], ['Status', 2], ['Measured', 3]].forEach(([h, i]) => text(h, cols[i], y, 8.5, bold, C.muted));
    y -= 14;
    for (const m of data.metrics) {
      need(16);
      text(fit(m.label, 9.5, 145, bold), cols[0], y, 9.5, bold);
      if (!m.latest) { text('No measurements in this period', cols[1], y, 9, font, C.muted); y -= 15; continue; }
      text(fit(m.latest.text, 9.5, 115), cols[1], y, 9.5);
      if (m.latest.level) dot(cols[2] + 3, y + 3.2, m.latest.level);
      text(fit(m.latest.status || '-', 9, 110), cols[2] + (m.latest.level ? 10 : 0), y, 9, font, m.latest.level ? C[m.latest.level] : C.muted);
      text(fit(m.latest.at, 8, W - M - cols[3]), cols[3], y, 8, font, C.muted);
      y -= 15;
    }
  }

  // ---------------------------------------------------------------- trend summary
  if (has('risktrend')) {
    heading('Risk trend summary');
    text('Vitals in this period (first and latest measurement)', M, y, 9.5, bold, C.muted); y -= 14;
    for (const m of data.metrics) {
      const lines = wrap(m.trend ? m.trend.text : 'No measurements recorded in this period.', 8.5, W - 2 * M - 190);
      need(14 + lines.length * 11);
      text(fit(m.label, 9.5, 120, bold), M, y, 9.5, bold);
      text(m.trend ? m.trend.word : 'No data', M + 125, y, 9.5, bold, m.trend ? trendColor[m.trend.direction] || C.muted : C.muted);
      lines.forEach((l, k) => text(l, M + 190, y - k * 11, 8.5, font, C.ink));
      y -= Math.max(14, lines.length * 11 + 4);
    }
    y -= 4;
    text('Risk checks (each compared with its previous assessment)', M, y, 9.5, bold, C.muted); y -= 14;
    if (!data.riskTrend.length) { text('No risk checks recorded yet.', M, y, 9.5); y -= 14; }
    for (const t of data.riskTrend) {
      const detail = `Now ${t.current.display} (${t.current.band}) on ${t.at}` + (t.previous ? `; before ${t.previous.display} (${t.previous.band}) on ${t.prevAt}` : '') +
        (t.change != null && t.previous ? `; change ${t.change > 0 ? '+' : ''}${t.change}${t.pct != null ? ' (' + (t.pct > 0 ? '+' : '') + t.pct + '%)' : ''}` : '') + '. ' + t.text;
      const lines = wrap(detail, 8.5, W - 2 * M - 12);
      need(16 + lines.length * 11);
      text(fit(t.title, 10, 330, bold), M, y, 10, bold);
      text(t.word, M + 345, y, 10, bold, trendColor[t.direction] || C.muted);
      y -= 12;
      lines.forEach((l) => { text(l, M + 12, y, 8.5, font, C.ink); y -= 11; });
      y -= 5;
    }
    text('Risk scores support, and do not replace, a doctor\'s review.', M, y, 8, font, C.muted); y -= 6;
  }

  // ---------------------------------------------------------------- each vital
  if (has('charts') || has('readings') || has('averages')) for (const m of data.metrics) {
    need(m.noData ? 60 : has('charts') ? 210 : 70);
    heading(m.label + (m.unit ? ' (' + m.unit + ')' : ''));
    if (m.noData) { text('No measurements recorded in this period.', M, y, 10, font, C.muted); y -= 14; continue; }
    if (has('averages')) {
      const avgLine = `Average ${m.average}${m.unit ? ' ' + m.unit : ''}${m.averageNote ? ' (' + m.averageNote + ')' : ''} from ${m.rows.length} measurement${m.rows.length === 1 ? '' : 's'}` + (m.status ? `  -  ${m.status}` : '');
      if (m.level) dot(M + 3, y + 3.2, m.level);
      text(avgLine, M + (m.level ? 12 : 0), y, 10, bold, m.level ? C[m.level] : C.ink);
      y -= 12;
    }
    if (has('charts')) {
      const cx = M + 30, cw = W - 2 * M - 40, ch = 110, cy = y - ch - 6;
      const vals = m.rows.flatMap((r) => m.series.map((s) => r[s]).filter((v) => v != null));
      let lo = Math.min(...vals), hi = Math.max(...vals);
      const pad = Math.max((hi - lo) * 0.15, 2); lo -= pad; hi += pad;
      const t0 = data.fromMs, t1 = data.toMs;
      const X = (t) => cx + cw * Math.min(1, Math.max(0, (t - t0) / (t1 - t0)));
      const Y = (v) => cy + ch * ((v - lo) / (hi - lo));
      page.drawRectangle({ x: cx, y: cy, width: cw, height: ch, borderColor: col(C.line), borderWidth: 0.7 });
      [lo + pad, (lo + hi) / 2, hi - pad].forEach((v) => {
        page.drawLine({ start: { x: cx, y: Y(v) }, end: { x: cx + cw, y: Y(v) }, thickness: 0.4, color: col(C.line), dashArray: [2, 3] });
        const lab = String(Math.round(v * 10) / 10);
        text(lab, cx - 4 - width(lab, 7.5), Y(v) - 2.5, 7.5, font, C.muted);
      });
      [t0, (t0 + t1) / 2, t1].forEach((t, i) => {
        const lab = data.fmtShort(t); const w = width(lab, 7.5);
        text(lab, i === 0 ? cx : i === 1 ? X(t) - w / 2 : cx + cw - w, cy - 11, 7.5, font, C.muted);
      });
      m.series.forEach((s, si) => {
        const pts = m.rows.filter((r) => r[s] != null).map((r) => [X(r.ms), Y(r[s])]);
        const color = col(si ? C.s2 : C.s1);
        for (let i = 1; i < pts.length; i++) page.drawLine({ start: { x: pts[i - 1][0], y: pts[i - 1][1] }, end: { x: pts[i][0], y: pts[i][1] }, thickness: 1.3, color });
        for (const p of pts) page.drawCircle({ x: p[0], y: p[1], size: pts.length > 60 ? 1.2 : 2, color });
      });
      if (m.series.length > 1) {
        page.drawRectangle({ x: cx, y: cy - 24, width: 7, height: 7, color: col(C.s1) }); text(m.names[0], cx + 10, cy - 23, 8, font, C.muted);
        page.drawRectangle({ x: cx + 70, y: cy - 24, width: 7, height: 7, color: col(C.s2) }); text(m.names[1], cx + 80, cy - 23, 8, font, C.muted);
      }
      y = cy - (m.series.length > 1 ? 36 : 24);
    }
    if (has('readings')) {
      // measurements, three columns, newest first
      const list = m.rows.slice().reverse();
      const colW = (W - 2 * M) / 3;
      for (let i = 0; i < list.length; i += 3) {
        need(13);
        for (let j = 0; j < 3 && i + j < list.length; j++) {
          const r = list[i + j];
          const x = M + j * colW;
          if (r.level) dot(x + 3, y + 2.8, r.level);
          text(fit(r.at, 7.5, 92), x + 9, y, 7.5, font, C.muted);
          text(fit(r.text, 8.5, colW - 105), x + 102, y, 8.5, bold);
        }
        y -= 12;
      }
    }
  }

  // ---------------------------------------------------------------- footers
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const foot = safe(`KareIQ health trends for ${data.person.name}  |  Page ${i + 1} of ${pages.length}  |  A guide for families, not a diagnosis. Talk to the doctor about any concern.`);
    pg.drawText(foot, { x: M, y: 24, size: 7, font, color: rgb(C.muted[0], C.muted[1], C.muted[2]) });
  });
  return Buffer.from(await doc.save());
}

module.exports = { build, available: () => Boolean(PDF), LEVEL_TEXT };
