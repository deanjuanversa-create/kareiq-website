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

  // ---------------------------------------------------------------- cover
  newPage();
  text('KareIQ', M, y - 4, 11, bold, C.brand);
  y -= 30;
  text('Health report', M, y, 22, bold);
  y -= 22;
  text(data.person.name + (data.person.id ? '  (' + data.person.id + ')' : ''), M, y, 13, bold);
  y -= 16;
  const facts = [data.person.age ? data.person.age + ' years' : null, data.person.sexName, data.plans || null].filter(Boolean).join(' | ');
  if (facts) { text(facts, M, y, 10, font, C.muted); y -= 14; }
  text(`Period: ${data.periodLabel} (${data.from} to ${data.to})`, M, y, 10, font, C.muted); y -= 14;
  text(`Created ${data.createdAt} by ${data.createdBy}`, M, y, 10, font, C.muted); y -= 10;

  // ---------------------------------------------------------------- latest readings
  heading('Latest readings');
  const cols = [M, M + 112, M + 190, M + 312, M + 428];
  [['Reading', 0], ['Value', 1], ['Status', 2], ['Standard range', 3], ['Measured', 4]].forEach(([h, i]) => text(h, cols[i], y, 8.5, bold, C.muted));
  y -= 14;
  if (!data.latest.length) { text('No readings yet.', M, y, 10); y -= 14; }
  for (const r of data.latest) {
    need(16);
    text(fit(r.label, 9.5, 108, bold), cols[0], y, 9.5, bold);
    text(fit(r.value, 9.5, 74), cols[1], y, 9.5);
    if (r.level) dot(cols[2] + 3, y + 3.2, r.level);
    text(fit(r.status || '-', 9, 108), cols[2] + (r.level ? 10 : 0), y, 9, font, r.level ? C[r.level] : C.muted);
    text(fit(r.range || '-', 8, 112), cols[3], y, 8, font, C.muted);
    text(fit(r.at, 8, W - M - cols[4]), cols[4], y, 8, font, C.muted);
    y -= 15;
  }

  // ---------------------------------------------------------------- risk scores
  if (data.risks.length) {
    heading('Risk scores');
    for (const r of data.risks) {
      need(30);
      if (r.level) dot(M + 3, y + 3.2, r.level);
      text(fit(r.title, 10, 300, bold), M + 12, y, 10, bold);
      text(fit(r.display + '  -  ' + r.band, 9.5, 200), M + 320, y, 9.5, font, r.level ? C[r.level] : C.ink);
      y -= 12;
      text(fit(r.at + (r.scale ? '  |  ' + r.scale : ''), 8, W - 2 * M - 12), M + 12, y, 8, font, C.muted);
      y -= 15;
    }
    text('Risk scores support, and do not replace, a doctor\'s review.', M, y, 8, font, C.muted); y -= 6;
  }

  // ---------------------------------------------------------------- trends
  for (const m of data.series) {
    need(210);
    heading(m.label + (m.unit ? ' (' + m.unit + ')' : ''));
    const avgLine = `Average ${m.average}${m.unit ? ' ' + m.unit : ''} from ${m.rows.length} reading${m.rows.length === 1 ? '' : 's'}` + (m.status ? `  -  ${m.status}` : '');
    if (m.level) dot(M + 3, y + 3.2, m.level);
    text(avgLine, M + (m.level ? 12 : 0), y, 10, bold, m.level ? C[m.level] : C.ink);
    y -= 12;
    // chart
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
    // readings table, three columns, newest first
    const list = m.rows.slice().reverse();
    const colW = (W - 2 * M) / 3;
    for (let i = 0; i < list.length; i += 3) {
      need(13);
      for (let j = 0; j < 3 && i + j < list.length; j++) {
        const r = list[i + j];
        const x = M + j * colW;
        if (r.level) dot(x + 3, y + 2.8, r.level);
        text(fit(r.at, 7.5, 80), x + 9, y, 7.5, font, C.muted);
        text(fit(r.text, 8.5, colW - 95), x + 90, y, 8.5, bold);
      }
      y -= 12;
    }
  }

  // ---------------------------------------------------------------- notes
  if (data.notes.length) {
    heading('Notes from the care team');
    for (const v of data.notes) {
      const lines = wrap(v.note, 9, W - 2 * M);
      need(14 + lines.length * 12);
      text(v.at + '  |  ' + v.by, M, y, 8.5, bold, C.muted); y -= 12;
      for (const l of lines) { text(l, M, y, 9); y -= 12; }
      y -= 4;
    }
  }

  // ---------------------------------------------------------------- footers
  const pages = doc.getPages();
  pages.forEach((pg, i) => {
    const foot = safe(`KareIQ health report for ${data.person.name}  |  Page ${i + 1} of ${pages.length}  |  A guide for families, not a diagnosis. Talk to the doctor about any concern.`);
    pg.drawText(foot, { x: M, y: 24, size: 7, font, color: rgb(C.muted[0], C.muted[1], C.muted[2]) });
  });
  return Buffer.from(await doc.save());
}

module.exports = { build, available: () => Boolean(PDF), LEVEL_TEXT };
