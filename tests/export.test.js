import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStore, FIXED_NOW } from './helpers.js';
import { institutionTitle, buildStudentReport, studentReportToPdf, studentReportToXlsx, concentradoToXlsx, LEGEND, safeFileName } from '../src/export/reports.js';
import { readZip, createZip } from '../src/export/zip.js';
import { buildXlsx, safeSheetName } from '../src/export/xlsx.js';
import { PdfDocument, wrapText } from '../src/export/pdf.js';
import { saveCapture } from '../src/capture.js';

const latin1 = (u8) => Array.from(u8, (b) => String.fromCharCode(b)).join('');

test('el reporte individual contiene los datos requeridos y la leyenda demostrativa', () => {
  const store = makeStore();
  const st = store.state.students[0];
  const rep = buildStudentReport(store.state, st.id, { now: FIXED_NOW });
  assert.equal(rep.institution, 'Colegio Alzate');
  assert.equal(rep.student.id, st.id);
  assert.equal(rep.student.name, st.name);
  assert.equal(rep.student.cycle, st.cycle);
  assert.ok(rep.student.group);
  assert.ok(rep.rows.every((r) => r.subject && r.period && 'grade' in r && 'absences' in r && 'notes' in r));
  assert.equal(rep.legend, LEGEND);
});

test('PDF: estructura válida, offsets xref correctos, leyenda y acentos', () => {
  const store = makeStore();
  const st = store.state.students[0];
  saveCapture(store, { studentId: st.id, subjectId: 'pri-esp', teacherId: 't-titular-pri', periodId: 'p3', gradeText: '0', absencesText: '1', notes: 'Observación con (paréntesis) y \\ barra' });
  const pdf = studentReportToPdf(buildStudentReport(store.state, st.id, { now: FIXED_NOW }));
  const s = latin1(pdf);
  assert.ok(s.startsWith('%PDF-1.4'));
  assert.ok(s.trimEnd().endsWith('%%EOF'));
  assert.ok(s.includes('DOCUMENTO DEMOSTRATIVO'));
  assert.ok(s.includes('Colegio Alzate'));
  assert.ok(s.includes(st.id));
  assert.ok(s.includes('Matem\\341ticas'), 'á en WinAnsi (octal 341)');
  assert.ok(s.includes('\\(par\\351ntesis\\)'));
  // los offsets de la tabla xref apuntan realmente a "N 0 obj"
  const startxref = Number(/startxref\n(\d+)/.exec(s)[1]);
  assert.ok(s.slice(startxref).startsWith('xref'));
  const entries = [...s.slice(startxref).matchAll(/(\d{10}) 00000 n/g)].map((m) => Number(m[1]));
  entries.forEach((off, i) => assert.ok(s.slice(off).startsWith(`${i + 1} 0 obj`), `objeto ${i + 1}`));
});

test('PDF: pagina cuando hay muchas filas y repite leyenda en cada página', () => {
  const store = makeStore();
  const st = store.state.students[0];
  const rep = buildStudentReport(store.state, st.id, { now: FIXED_NOW });
  rep.rows = Array.from({ length: 5 }, () => rep.rows).flat().map((r) => ({ ...r, notes: 'Observación larga '.repeat(8) }));
  const s = latin1(studentReportToPdf(rep));
  const pages = (s.match(/\/Type \/Page /g) ?? []).length;
  assert.ok(pages > 1);
  assert.equal((s.match(/DOCUMENTO DEMOSTRATIVO — NO OFICIAL/g) ?? []).length, 0, 'el guion largo va codificado, no literal');
  assert.ok((s.match(/\(DOCUMENTO DEMOSTRATIVO \\227 NO OFICIAL/g) ?? []).length >= pages * 2);
  assert.match(s, new RegExp(`P\\\\341gina ${pages} de ${pages}`));
});

test('wrapText divide texto largo sin perder contenido', () => {
  const lines = wrapText('uno dos tres cuatro cinco seis siete ocho nueve diez', 60, 9);
  assert.ok(lines.length > 1);
  assert.equal(lines.join(' '), 'uno dos tres cuatro cinco seis siete ocho nueve diez');
  assert.equal(wrapText('x'.repeat(200), 50, 9).join(''), 'x'.repeat(200));
});

test('ZIP: ida y vuelta con CRC válido', () => {
  const z = createZip([{ name: 'a.txt', data: 'hola ñandú' }, { name: 'dir/b.txt', data: 'segundo' }]);
  const m = readZip(z);
  assert.equal(m.get('a.txt'), 'hola ñandú');
  assert.equal(m.get('dir/b.txt'), 'segundo');
});

test('XLSX individual: formato del reporte, hoja de datos y aviso', () => {
  const store = makeStore();
  const st = store.state.students.find((s) => s.levelId === 'cch');
  const files = readZip(studentReportToXlsx(buildStudentReport(store.state, st.id, { now: FIXED_NOW })));
  for (const f of ['[Content_Types].xml', 'xl/workbook.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/sheet2.xml', 'xl/worksheets/sheet3.xml', 'xl/styles.xml']) assert.ok(files.has(f), f);
  const wb = files.get('xl/workbook.xml');
  assert.ok(wb.includes('name="Expediente"') && wb.includes('name="Datos"') && wb.includes('name="Aviso"'));
  const fmt = files.get('xl/worksheets/sheet1.xml');
  assert.ok(fmt.includes('COLEGIO ALZATE C.C.H.') && fmt.includes('REPORTE INDIVIDUAL DE CALIFICACIONES Y ASISTENCIA'));
  assert.ok(fmt.includes('DOCUMENTO DEMOSTRATIVO') && fmt.includes('Orientación / Control Escolar'));
  assert.ok(fmt.includes('<mergeCells') && fmt.includes('s="4"'), 'encabezado azul y celdas combinadas');
  assert.match(fmt, /<c r="B\d+" s="[68]"><v>[\d.]+<\/v><\/c>/, 'calificación numérica con estilo');
  const flat = files.get('xl/worksheets/sheet2.xml');
  assert.ok(flat.includes('Matrícula') && flat.includes('Pendiente'));
  assert.match(flat, /<c r="J2"[^>]*><v>[\d.]+<\/v><\/c>/);
  assert.ok(files.get('xl/worksheets/sheet3.xml').includes('DOCUMENTO DEMOSTRATIVO'));
});

test('XLSX concentrado: una fila por alumno × asignatura × periodo', () => {
  const store = makeStore();
  const ids = store.state.students.filter((s) => s.groupId === 'pri-4a').map((s) => s.id);
  const files = readZip(concentradoToXlsx(store.state, ids, { now: FIXED_NOW }));
  const rows = (files.get('xl/worksheets/sheet1.xml').match(/<row /g) ?? []).length;
  assert.equal(rows, 1 + ids.length * 6 * 3);
});

test('XLSX: texto con caracteres especiales o que parece fórmula se guarda como texto escapado', () => {
  const x = readZip(buildXlsx([{ name: 'a/b:c*?[x]', rows: [['=1+1', '<b>&"\'', 'a\u0001b', 3]] }]));
  const sheet = x.get('xl/worksheets/sheet1.xml');
  assert.ok(sheet.includes('t="inlineStr"') && !sheet.includes('<f>'));
  assert.ok(sheet.includes('&lt;b&gt;&amp;&quot;&apos;'));
  assert.ok(!sheet.includes('\u0001'));
  assert.equal(safeSheetName('a/b:c*?[x]'), 'a b c   x');
  const used = new Set();
  assert.notEqual(safeSheetName('Hoja', used), safeSheetName('hoja', used));
});

test('safeFileName limpia nombres de archivo', () => {
  assert.equal(safeFileName('Ñandú Pérez/x'), 'Nandu_Perez_x');
  assert.ok(!/[\\/ ]/.test(safeFileName('a b/c')));
  assert.equal(safeFileName('///'), 'archivo');
});

test('PdfDocument escapa paréntesis y barras', () => {
  const d = new PdfDocument();
  d.text(10, 10, 'a(b)c\\d');
  assert.ok(latin1(d.finish()).includes('(a\\(b\\)c\\\\d)'));
});

test('el PDF sigue el formato de referencia: título por nivel, firma y leyenda', () => {
  assert.equal(institutionTitle('Colegio Alzate', 'cch', 'CCH'), 'COLEGIO ALZATE C.C.H.');
  assert.equal(institutionTitle('Colegio Alzate', 'primaria', 'Primaria'), 'COLEGIO ALZATE PRIMARIA');
  const store = makeStore();
  const st = store.state.students.find((s) => s.levelId === 'cch');
  const rep = buildStudentReport(store.state, st.id, { now: FIXED_NOW });
  assert.equal(rep.title, 'COLEGIO ALZATE C.C.H.');
  const s = latin1(studentReportToPdf(rep));
  for (const t of ['COLEGIO ALZATE C.C.H.', 'REPORTE INDIVIDUAL DE CALIFICACIONES Y ASISTENCIA', 'Alumno\\(a\\):', 'Orientaci\\363n / Control Escolar', 'Matr\\355cula']) {
    assert.ok(s.includes(t.replaceAll('\\\\', '\\')), t);
  }
});
