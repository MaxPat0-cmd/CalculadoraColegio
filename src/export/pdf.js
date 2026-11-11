// Escritor PDF mínimo (PDF 1.4, fuentes estándar Helvetica con codificación WinAnsi). Sin dependencias.
// Todo el archivo es ASCII: los caracteres acentuados se escriben como escapes octales.

const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];

export function textWidth(str, size, bold = false) {
  let w = 0;
  for (const ch of String(str)) {
    const c = ch.charCodeAt(0);
    w += c >= 32 && c <= 126 ? W[c - 32] : 556;
  }
  return (w / 1000) * size * (bold ? 1.06 : 1);
}

export function wrapText(str, maxWidth, size, bold = false) {
  const lines = [];
  for (const para of String(str).split(/\r?\n/)) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const test = line ? `${line} ${word}` : word;
      if (textWidth(test, size, bold) <= maxWidth) { line = test; continue; }
      if (line) lines.push(line);
      let w = word;
      while (textWidth(w, size, bold) > maxWidth && w.length > 1) { // palabra más larga que la columna
        let cut = w.length - 1;
        while (cut > 1 && textWidth(w.slice(0, cut), size, bold) > maxWidth) cut--;
        lines.push(w.slice(0, cut)); w = w.slice(cut);
      }
      line = w;
    }
    lines.push(line);
  }
  return lines.length ? lines : [''];
}

const SPECIAL = { '€': 0x80, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '–': 0x96, '—': 0x97 };

function pdfString(str) {
  let out = '';
  for (const ch of String(str)) {
    const cp = ch.codePointAt(0);
    let code;
    if (SPECIAL[ch] !== undefined) code = SPECIAL[ch];
    else if (cp >= 32 && cp <= 126) code = cp;
    else if (cp >= 0xa0 && cp <= 0xff) code = cp;
    else if (cp === 9 || cp === 10 || cp === 13) code = 32;
    else code = 63; // '?'
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += '\\' + String.fromCharCode(code);
    else if (code > 126 || code < 32) out += '\\' + code.toString(8).padStart(3, '0');
    else out += String.fromCharCode(code);
  }
  return `(${out})`;
}

const num = (n) => (Math.round(n * 100) / 100).toString();

export class PdfDocument {
  constructor({ title = '', width = 595.28, height = 841.89 } = {}) {
    this.title = title; this.width = width; this.height = height;
    this.pages = [];
    this.addPage();
  }

  addPage() { this.current = []; this.pages.push(this.current); return this.pages.length - 1; }
  get pageCount() { return this.pages.length; }
  _ops(page) { return page === undefined ? this.current : this.pages[page]; }

  text(x, y, str, { size = 10, bold = false, color = [0, 0, 0], page } = {}) {
    this._ops(page).push(`BT /${bold ? 'F2' : 'F1'} ${num(size)} Tf ${color.map(num).join(' ')} rg ${num(x)} ${num(y)} Td ${pdfString(str)} Tj ET`);
  }

  line(x1, y1, x2, y2, { width = 0.5, color = [0.6, 0.6, 0.6], page } = {}) {
    this._ops(page).push(`${num(width)} w ${color.map(num).join(' ')} RG ${num(x1)} ${num(y1)} m ${num(x2)} ${num(y2)} l S`);
  }

  rect(x, y, w, h, { fill, stroke, width = 0.5, page } = {}) {
    const ops = [];
    if (fill) ops.push(`${fill.map(num).join(' ')} rg`);
    if (stroke) ops.push(`${num(width)} w ${stroke.map(num).join(' ')} RG`);
    ops.push(`${num(x)} ${num(y)} ${num(w)} ${num(h)} re ${fill && stroke ? 'B' : fill ? 'f' : 'S'}`);
    this._ops(page).push(ops.join(' '));
  }

  /** Devuelve Uint8Array con el PDF. */
  finish() {
    const objs = []; // cadenas ASCII; el número de objeto es índice + 1
    const add = (s) => { objs.push(s); return objs.length; };
    add('<< /Type /Catalog /Pages 2 0 R >>'); // 1
    objs.push(''); // 2 (Pages, se completa después)
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'); // 3
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'); // 4
    const kids = [];
    for (const ops of this.pages) {
      const content = ops.join('\n');
      const cId = add(`<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
      const pId = add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${num(this.width)} ${num(this.height)}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${cId} 0 R >>`);
      kids.push(`${pId} 0 R`);
    }
    objs[1] = `<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${kids.length} >>`;
    const infoId = add(`<< /Title ${pdfString(this.title)} /Producer (Calculadora Academica Alzate 1.5) >>`);

    let out = '%PDF-1.4\n';
    const offsets = [];
    objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const o of offsets) out += `${String(o).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info ${infoId} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return bytes;
  }
}
