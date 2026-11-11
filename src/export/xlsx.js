// Generador mínimo de .xlsx (Office Open XML). Las cadenas se escriben como texto en línea (inlineStr),
// por lo que Excel nunca las interpreta como fórmulas aunque empiecen con "=", "+", "-" o "@".
import { createZip } from './zip.js';

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">` +
  `<fonts count="7"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font>` +
  `<font><b/><sz val="16"/><color rgb="FF002060"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font>` +
  `<font><sz val="9"/><color rgb="FF545454"/><name val="Calibri"/></font><font><b/><sz val="10"/><name val="Calibri"/></font><font><b/><sz val="10"/><color rgb="FF664000"/><name val="Calibri"/></font></fonts>` +
  `<fills count="5"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FF002060"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5FA"/><bgColor indexed="64"/></patternFill></fill>` +
  `<fill><patternFill patternType="solid"><fgColor rgb="FFFFF2C7"/><bgColor indexed="64"/></patternFill></fill></fills>` +
  `<borders count="3"><border><left/><right/><top/><bottom/><diagonal/></border>` +
  `<border><left style="thin"><color rgb="FFD1D9E6"/></left><right style="thin"><color rgb="FFD1D9E6"/></right><top style="thin"><color rgb="FFD1D9E6"/></top><bottom style="thin"><color rgb="FFD1D9E6"/></bottom><diagonal/></border>` +
  `<border><left/><right/><top/><bottom style="thin"><color rgb="FF000000"/></bottom><diagonal/></border></borders>` +
  `<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="13">` +
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>` + // 0 normal
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>` + // 1 negritas
  `<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 2 título
  `<xf numFmtId="0" fontId="5" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 3 subtítulo
  `<xf numFmtId="0" fontId="3" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` + // 4 encabezado de tabla
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` + // 5 celda
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` + // 6 celda centrada
  `<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment vertical="center" wrapText="1"/></xf>` + // 7 celda alterna
  `<xf numFmtId="0" fontId="0" fillId="3" borderId="1" xfId="0" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>` + // 8 centrada alterna
  `<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>` + // 9 nota
  `<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyAlignment="1"><alignment vertical="center"/></xf>` + // 10 etiqueta
  `<xf numFmtId="0" fontId="6" fillId="4" borderId="0" xfId="0" applyFont="1" applyFill="1" applyAlignment="1"><alignment horizontal="center" vertical="center"/></xf>` + // 11 leyenda
  `<xf numFmtId="0" fontId="0" fillId="0" borderId="2" xfId="0" applyBorder="1"/>` + // 12 línea de firma
  `</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

const xmlEscape = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

function colName(i) {
  let s = '';
  for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  return s;
}

export function safeSheetName(name, used = new Set()) {
  let base = String(name).replace(/[\[\]:*?/\\]/g, ' ').trim().slice(0, 31) || 'Hoja';
  let n = base; let i = 2;
  while (used.has(n.toLowerCase())) { const suf = ` ${i++}`; n = base.slice(0, 31 - suf.length) + suf; }
  used.add(n.toLowerCase());
  return n;
}

/** Estilos disponibles (índice en cellXfs). Se usan con { v, s } en las celdas. */
export const XS = Object.freeze({ DEFAULT: 0, BOLD: 1, TITLE: 2, SUBTITLE: 3, TH: 4, TD: 5, TDC: 6, TDZ: 7, TDCZ: 8, NOTE: 9, LABEL: 10, LEGEND: 11, SIGN: 12 });

function sheetXml(sheet) {
  const rows = sheet.rows.map((row, r) => {
    const cells = row.map((raw, c) => {
      const cell = raw !== null && typeof raw === 'object' && 'v' in raw ? raw : { v: raw };
      const v = cell.v;
      const sIdx = cell.s ?? (r < (sheet.headerRows ?? 0) ? XS.TH : 0);
      const style = sIdx ? ` s="${sIdx}"` : '';
      const ref = `${colName(c)}${r + 1}`;
      if (v === null || v === undefined || v === '') return style ? `<c r="${ref}"${style}/>` : '';
      if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style}><v>${v}</v></c>`;
      return `<c r="${ref}"${style} t="inlineStr"><is><t xml:space="preserve">${xmlEscape(v)}</t></is></c>`;
    }).join('');
    const ht = sheet.rowHeights?.[r];
    return `<row r="${r + 1}"${ht ? ` ht="${ht}" customHeight="1"` : ''}>${cells}</row>`;
  }).join('');
  const widths = (sheet.colWidths ?? []).map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('');
  const merges = (sheet.merges ?? []).length ? `<mergeCells count="${sheet.merges.length}">${sheet.merges.map((m) => `<mergeCell ref="${m}"/>`).join('')}</mergeCells>` : '';
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetPr><pageSetUpPr fitToPage="1"/></sheetPr>` +
    (sheet.headerRows ? `<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sheet.headerRows}" topLeftCell="A${sheet.headerRows + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>` : '') +
    (widths ? `<cols>${widths}</cols>` : '') + `<sheetData>${rows}</sheetData>${merges}<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/><pageSetup paperSize="9" orientation="portrait" fitToHeight="0"/></worksheet>`;
}

/** sheets: [{ name, rows: (string|number|null)[][], headerRows?, colWidths? }] -> Uint8Array (.xlsx) */
export function buildXlsx(sheets, { title = 'Calculadora Académica Alzate (demostrativo)' } = {}) {
  const used = new Set();
  const named = sheets.map((s) => ({ ...s, name: safeSheetName(s.name, used) }));
  const files = [
    { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>${named.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>` },
    { name: '_rels/.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>` },
    { name: 'docProps/core.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xmlEscape(title)}</dc:title></cp:coreProperties>` },
    { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${named.map((s, i) => `<sheet name="${xmlEscape(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${named.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/styles.xml', data: STYLES_XML },
    ...named.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(s) })),
  ];
  return createZip(files);
}
