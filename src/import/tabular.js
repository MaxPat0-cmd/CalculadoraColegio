// Lectura de archivos tabulares para importar actas: .xlsx (sin dependencias) y .csv.
// Un .xlsx es un ZIP con XML; se descomprime con DecompressionStream (navegadores modernos y Node ≥ 18).
const MAX_BYTES = 8 * 1024 * 1024;       // tamaño máximo del archivo
const MAX_INFLATED = 40 * 1024 * 1024;   // protección contra "zip bombs"
const MAX_ROWS = 20000;
const dec = new TextDecoder('utf-8');

async function inflateRaw(bytes) {
  if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador no puede leer archivos .xlsx comprimidos. Usa un navegador actualizado o guarda el acta como .csv.');
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
  const reader = stream.getReader();
  const chunks = []; let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > MAX_INFLATED) { await reader.cancel(); throw new Error('El archivo descomprimido es demasiado grande.'); }
    chunks.push(value);
  }
  const out = new Uint8Array(total); let p = 0;
  for (const c of chunks) { out.set(c, p); p += c.length; }
  return out;
}

/** Entradas de un ZIP (métodos 0 y 8) como texto UTF-8. */
export async function readZipText(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('El archivo no es un .xlsx válido (no es un ZIP).');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out = new Map();
  for (let i = 0; i < count; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('El archivo .xlsx está dañado.');
    const method = dv.getUint16(p + 10, true);
    const csize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true); const extraLen = dv.getUint16(p + 30, true); const commentLen = dv.getUint16(p + 32, true);
    const lho = dv.getUint32(p + 42, true);
    const name = dec.decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;
    if (!/^xl\/(workbook\.xml|_rels\/workbook\.xml\.rels|sharedStrings\.xml|worksheets\/[^/]+\.xml)$/.test(name)) continue; // solo lo necesario
    const start = lho + 30 + dv.getUint16(lho + 26, true) + dv.getUint16(lho + 28, true);
    const raw = bytes.subarray(start, start + csize);
    if (method === 0) out.set(name, dec.decode(raw));
    else if (method === 8) out.set(name, dec.decode(await inflateRaw(raw)));
    else throw new Error(`Método de compresión no soportado (${method}).`);
  }
  return out;
}

const unescapeXml = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (m, e) => {
  if (e[0] === '#') { const cp = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); try { return String.fromCodePoint(cp); } catch { return ''; } }
  return { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }[e.toLowerCase()];
});

const textOf = (xml) => [...xml.replace(/<rPh\b[\s\S]*?<\/rPh>/g, '').matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((m) => unescapeXml(m[1])).join('');

function colIndex(ref) {
  let n = 0;
  for (const ch of ref.replace(/[^A-Za-z]/g, '').toUpperCase()) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

function parseSheet(xml, shared) {
  const rows = [];
  let maxRow = 0;
  for (const rm of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rn = Number(/\br="(\d+)"/.exec(rm[1])?.[1] ?? rows.length + 1);
    if (rn > MAX_ROWS) throw new Error(`El archivo tiene más de ${MAX_ROWS} filas.`);
    const cells = [];
    for (const cm of (rm[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = /\br="([A-Za-z]+\d+)"/.exec(cm[1])?.[1];
      if (!ref) continue;
      const t = /\bt="(\w+)"/.exec(cm[1])?.[1] ?? 'n';
      const body = cm[2] ?? '';
      const v = /<v\b[^>]*>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let val = null;
      if (t === 'inlineStr') val = textOf(body);
      else if (v !== undefined) {
        if (t === 's') val = shared[Number(v)] ?? '';
        else if (t === 'str') val = unescapeXml(v);
        else if (t === 'b') val = v === '1' ? 'VERDADERO' : 'FALSO';
        else if (t === 'e') val = null;
        else { const n = Number(v); val = Number.isFinite(n) ? n : unescapeXml(v); }
      }
      cells[colIndex(ref)] = val;
    }
    for (let i = 0; i < cells.length; i++) if (cells[i] === undefined) cells[i] = null;
    while (cells.length && (cells[cells.length - 1] === null || cells[cells.length - 1] === '')) cells.pop();
    rows[rn - 1] = cells; maxRow = Math.max(maxRow, rn);
  }
  for (let i = 0; i < maxRow; i++) if (!rows[i]) rows[i] = [];
  return rows;
}

/** Hojas de un .xlsx: [{ name, rows: (string|number|null)[][] }] */
export async function readXlsx(bytes) {
  if (bytes.length > MAX_BYTES) throw new Error('El archivo es demasiado grande (máximo 8 MB).');
  const files = await readZipText(bytes);
  const wb = files.get('xl/workbook.xml');
  if (!wb) throw new Error('El archivo no parece un libro de Excel (.xlsx).');
  const rels = new Map([...(files.get('xl/_rels/workbook.xml.rels') ?? '').matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1]; const target = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    return [id, target];
  }));
  const shared = files.has('xl/sharedStrings.xml') ? [...files.get('xl/sharedStrings.xml').matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>|<si\b[^>]*\/>/g)].map((m) => textOf(m[1] ?? '')) : [];
  const sheets = [];
  for (const m of wb.matchAll(/<sheet\b[^>]*>/g)) {
    const name = unescapeXml(/\bname="([^"]*)"/.exec(m[0])?.[1] ?? 'Hoja');
    const rid = /\br:id="([^"]+)"/.exec(m[0])?.[1];
    let target = rels.get(rid) ?? '';
    target = target.startsWith('/') ? target.slice(1) : `xl/${target}`;
    const xml = files.get(target);
    if (xml) sheets.push({ name, rows: parseSheet(xml, shared) });
  }
  if (!sheets.length) throw new Error('El libro no tiene hojas legibles.');
  return sheets;
}

/** CSV con separador `,` `;` o tabulador (Excel en español usa `;`). Admite comillas y BOM. */
export function parseCsv(text) {
  const src = text.replace(/^﻿/, '');
  const first = src.split(/\r?\n/, 1)[0] ?? '';
  const count = (ch) => { let n = 0; let q = false; for (const c of first) { if (c === '"') q = !q; else if (c === ch && !q) n++; } return n; };
  const delim = [';', '\t', ','].map((d) => [d, count(d)]).sort((a, b) => b[1] - a[1])[0][0];
  const rows = []; let row = []; let cell = ''; let q = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (q) { if (c === '"' && src[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; continue; }
    if (c === '"') q = true;
    else if (c === delim) { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && src[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; if (rows.length > MAX_ROWS) throw new Error(`El archivo tiene más de ${MAX_ROWS} filas.`); }
    else cell += c;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  return rows.map((r) => { const o = r.map((v) => (v === '' ? null : v)); while (o.length && o[o.length - 1] === null) o.pop(); return o; });
}

/** Lee un archivo subido (bytes + nombre) y devuelve sus hojas. */
export async function readTable(bytes, filename = '') {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    if (bytes.length > MAX_BYTES) throw new Error('El archivo es demasiado grande (máximo 8 MB).');
    return [{ name: 'CSV', rows: parseCsv(dec.decode(bytes)) }];
  }
  if (lower.endsWith('.xls')) throw new Error('El formato .xls (Excel 97-2003) no se puede leer. Ábrelo en Excel y guárdalo como .xlsx o .csv.');
  return readXlsx(bytes);
}
