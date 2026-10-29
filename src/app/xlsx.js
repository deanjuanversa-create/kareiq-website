// A small Excel (.xlsx) writer with no dependencies: sheets of text and numbers, a bold header
// row, column widths, frozen header, and native Excel line charts. Enough for the health-trends
// export; it is not a general spreadsheet library.

const zlib = require('zlib');

// ---------------------------------------------------------------- zip (deflate, no encryption)
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (let i = 0; i < buf.length; i++) c = CRC[(c ^ buf[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function zip(files) {
  const parts = [], central = []; let offset = 0;
  const time = 0, date = ((2026 - 1980) << 9) | (1 << 5) | 1;
  for (const [name, content] of files) {
    const data = Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf8');
    const comp = zlib.deflateRawSync(data), nameB = Buffer.from(name, 'utf8'), crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0x0800, 6); local.writeUInt16LE(8, 8);
    local.writeUInt16LE(time, 10); local.writeUInt16LE(date, 12); local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameB.length, 26); local.writeUInt16LE(0, 28);
    parts.push(local, nameB, comp);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(0x0800, 8); cen.writeUInt16LE(8, 10);
    cen.writeUInt16LE(time, 12); cen.writeUInt16LE(date, 14); cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(comp.length, 20); cen.writeUInt32LE(data.length, 24);
    cen.writeUInt16LE(nameB.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, nameB);
    offset += 30 + nameB.length + comp.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(files.length, 8); end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cd, end]);
}

// ---------------------------------------------------------------- workbook
const esc = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
const sheetRef = (name) => "'" + String(name).replace(/'/g, "''") + "'";
// Excel sheet names: up to 31 characters, none of []:*?/\ and unique
function sheetName(name, used) {
  let base = String(name).replace(/[[\]:*?/\\]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Sheet';
  let n = base, i = 2;
  while (used.has(n.toLowerCase())) { const suf = ' (' + i++ + ')'; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n.toLowerCase());
  return n;
}

// style ids: 0 normal, 1 bold header, 2 title, 3 muted note, 4 number with 1 decimal
const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="1"><numFmt numFmtId="164" formatCode="0.0##"/></numFmts>
<fonts count="4"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="15"/><color rgb="FF0D6B5A"/><name val="Calibri"/></font><font><i/><sz val="10"/><color rgb="FF5F6B76"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6F2EF"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FFB7C4C1"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="5"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/><xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

// sheet = { name, rows: [[cell...]], widths: [..], header: rowIndex|null, hidden, charts: [{ title, cat: [col,r1,r2], series: [{ name, col, r1, r2 }], anchor: [col,row] }] }
// cell = string | number | null | { v, s }  (s = style id)
function build(sheets) {
  const used = new Set();
  sheets.forEach((s) => { s.name = sheetName(s.name, used); });
  const files = [];
  let chartN = 0, drawingN = 0;
  const ct = ['<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>', '<Default Extension="xml" ContentType="application/xml"/>',
    '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>',
    '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>',
    '<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>'];
  sheets.forEach((s, si) => {
    const n = si + 1;
    ct.push(`<Override PartName="/xl/worksheets/sheet${n}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`);
    const rowsXml = s.rows.map((row, ri) => '<row r="' + (ri + 1) + '">' + row.map((cell, ci) => {
      if (cell == null || cell === '') return '';
      const c = typeof cell === 'object' ? cell : { v: cell };
      const style = c.s != null ? c.s : (s.header === ri ? 1 : 0);
      const ref = colName(ci) + (ri + 1);
      if (typeof c.v === 'number' && Number.isFinite(c.v)) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${c.v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${esc(c.v)}</t></is></c>`;
    }).join('') + '</row>').join('');
    const cols = (s.widths || []).length ? '<cols>' + s.widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('') + '</cols>' : '';
    const freeze = s.header != null ? `<sheetViews><sheetView workbookViewId="0"${si === 0 ? ' tabSelected="1"' : ''}><pane ySplit="${s.header + 1}" topLeftCell="A${s.header + 2}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`
      : `<sheetViews><sheetView workbookViewId="0"${si === 0 ? ' tabSelected="1"' : ''}/></sheetViews>`;
    let drawing = '';
    if (s.charts && s.charts.length) {
      drawingN++;
      drawing = '<drawing r:id="rId1"/>';
      files.push([`xl/worksheets/_rels/sheet${n}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingN}.xml"/></Relationships>`]);
      ct.push(`<Override PartName="/xl/drawings/drawing${drawingN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawing+xml"/>`);
      const anchors = [], rels = [];
      s.charts.forEach((ch, k) => {
        chartN++;
        ct.push(`<Override PartName="/xl/charts/chart${chartN}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/>`);
        rels.push(`<Relationship Id="rId${k + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart${chartN}.xml"/>`);
        const [c0, r0] = ch.anchor;
        anchors.push(`<xdr:twoCellAnchor><xdr:from><xdr:col>${c0}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r0}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>${c0 + 9}</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>${r0 + 18}</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:to>` +
          `<xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="${k + 2}" name="Chart ${k + 1}"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/></xdr:xfrm>` +
          `<a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" r:id="rId${k + 1}"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor>`);
        files.push([`xl/charts/chart${chartN}.xml`, chartXml(ch)]);
      });
      files.push([`xl/drawings/drawing${drawingN}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${anchors.join('')}</xdr:wsDr>`]);
      files.push([`xl/drawings/_rels/drawing${drawingN}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rels.join('')}</Relationships>`]);
    }
    files.push([`xl/worksheets/sheet${n}.xml`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${freeze}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rowsXml}</sheetData>${drawing}</worksheet>`]);
  });
  files.unshift(['[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${ct.join('')}</Types>`]);
  files.push(['_rels/.rels', '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>']);
  files.push(['docProps/core.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>KareIQ health trends</dc:title><dc:creator>KareIQ</dc:creator><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString().slice(0, 19)}Z</dcterms:created></cp:coreProperties>`]);
  files.push(['xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><bookViews><workbookView/></bookViews><sheets>${sheets.map((s, i) => `<sheet name="${esc(s.name)}" sheetId="${i + 1}"${s.hidden ? ' state="hidden"' : ''} r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`]);
  files.push(['xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((s, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`]);
  files.push(['xl/styles.xml', STYLES]);
  return zip(files);

  // a line chart: categories (dates) and one or two series, read from a sheet
  function chartXml(ch) {
    const ref = (sheet, col, r1, r2) => `${sheetRef(sheet)}!$${colName(col)}$${r1 + 1}:$${colName(col)}$${r2 + 1}`;
    const colors = ['4FB5ED', '1C33BF'];
    const sers = ch.series.map((se, i) => `<c:ser><c:idx val="${i}"/><c:order val="${i}"/><c:tx><c:v>${esc(se.name)}</c:v></c:tx>` +
      `<c:spPr><a:ln w="22225"><a:solidFill><a:srgbClr val="${colors[i % 2]}"/></a:solidFill></a:ln></c:spPr><c:marker><c:symbol val="circle"/><c:size val="5"/><c:spPr><a:solidFill><a:srgbClr val="${colors[i % 2]}"/></a:solidFill></c:spPr></c:marker>` +
      `<c:cat><c:strRef><c:f>${esc(ref(ch.sheet, ch.cat[0], ch.cat[1], ch.cat[2]))}</c:f></c:strRef></c:cat><c:val><c:numRef><c:f>${esc(ref(ch.sheet, se.col, se.r1, se.r2))}</c:f></c:numRef></c:val><c:smooth val="0"/></c:ser>`).join('');
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">` +
      `<c:roundedCorners val="0"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:p><a:pPr><a:defRPr sz="1200" b="1"/></a:pPr><a:r><a:rPr lang="en-IN" sz="1200" b="1"/><a:t>${esc(ch.title)}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title>` +
      `<c:autoTitleDeleted val="0"/><c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/><c:varyColors val="0"/>${sers}<c:marker val="1"/><c:axId val="500001"/><c:axId val="500002"/></c:lineChart>` +
      `<c:catAx><c:axId val="500001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="500002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/><c:noMultiLvlLbl val="0"/></c:catAx>` +
      `<c:valAx><c:axId val="500002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:delete val="0"/><c:axPos val="l"/><c:majorGridlines><c:spPr><a:ln><a:solidFill><a:srgbClr val="E3E8EE"/></a:solidFill></a:ln></c:spPr></c:majorGridlines><c:title><c:tx><c:rich><a:bodyPr rot="-5400000"/><a:p><a:r><a:t>${esc(ch.unit || '')}</a:t></a:r></a:p></c:rich></c:tx><c:overlay val="0"/></c:title><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="500001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx>` +
      `</c:plotArea><c:legend><c:legendPos val="b"/><c:overlay val="0"/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
  }
}

module.exports = { build, zip, crc32 };
