import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { deflateRawSync } from 'node:zlib';
import { makeStore } from './helpers.js';
import { readXlsx, readTable, parseCsv, readZipText } from '../src/import/tabular.js';
import { detectHeaderRow, autoMap, parseGroupLabel, subjectColumns, buildImportPlan } from '../src/import/actas.js';
import { buildActaTemplate } from '../src/import/template.js';
import { buildXlsx } from '../src/export/xlsx.js';
import { FIELD, recordKey } from '../src/models.js';

const fixture = () => new Uint8Array(readFileSync(new URL('./fixtures/acta-ejemplo.xlsx', import.meta.url)));
const sheetOf = async (name) => (await readXlsx(fixture())).find((s) => s.name === name);

test('xlsx real (deflate, cadenas compartidas, entidades XML): hojas, tipos y caracteres especiales', async () => {
  const sheets = await readXlsx(fixture());
  assert.deepEqual(sheets.map((s) => s.name), ['Acta 4A', 'Lista']);
  const rows = sheets[0].rows;
  assert.deepEqual(rows[2], ['Matrícula', 'Alumno(a)', 'Grupo', 'Asignatura', 'Periodo', 'Calificación', 'Faltas', 'Observaciones']);
  assert.deepEqual(rows[3], ['EJ-0001', 'Pérez Ramos Ana', '4° A', 'Español', 'Periodo 1', 8.5, 1, 'Participa mucho']);
  assert.equal(rows[4][1], 'García & Luna "Beto"');
  assert.equal(rows[4][5], '9', 'texto que parece número se conserva como texto');
  assert.equal(rows[5][5], 0);
  assert.equal(sheets[1].rows[1][0], 326507304);
});

test('lector: ida y vuelta con el escritor propio (método store) y ZIP con deflate hecho a mano', async () => {
  const bytes = buildXlsx([{ name: 'Hoja 1', rows: [['A', 'B'], ['x & y', 3.5], [null, '']] }]);
  const [s] = await readXlsx(bytes);
  assert.deepEqual(s.rows[0], ['A', 'B']); assert.deepEqual(s.rows[1], ['x & y', 3.5]);
  // ZIP con método 8 (deflate) construido con zlib
  const data = Buffer.from('xl/sharedStrings.xml'); void data;
  const body = '<sst><si><t>hola</t></si></sst>';
  const comp = deflateRawSync(Buffer.from(body));
  const name = Buffer.from('xl/sharedStrings.xml');
  const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(comp.length, 18); lh.writeUInt32LE(body.length, 22); lh.writeUInt16LE(name.length, 26);
  const cd = Buffer.alloc(46); cd.writeUInt32LE(0x02014b50, 0); cd.writeUInt16LE(8, 10); cd.writeUInt32LE(comp.length, 20); cd.writeUInt32LE(body.length, 24); cd.writeUInt16LE(name.length, 28); cd.writeUInt32LE(0, 42);
  const eo = Buffer.alloc(22); eo.writeUInt32LE(0x06054b50, 0); eo.writeUInt16LE(1, 10); eo.writeUInt32LE(46 + name.length, 12); eo.writeUInt32LE(30 + name.length + comp.length, 16);
  const zip = new Uint8Array(Buffer.concat([lh, name, comp, cd, name, eo]));
  assert.equal((await readZipText(zip)).get('xl/sharedStrings.xml'), body);
});

test('lector: rechaza archivos que no son Excel, .xls y archivos enormes', async () => {
  await assert.rejects(() => readXlsx(new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23])), /ZIP|xlsx/i);
  await assert.rejects(() => readTable(new Uint8Array(10), 'acta.xls'), /\.xls/);
  await assert.rejects(() => readXlsx(new Uint8Array(9 * 1024 * 1024)), /demasiado grande/);
});

test('CSV: separador ; o ,, comillas, BOM y celdas vacías', () => {
  assert.deepEqual(parseCsv('﻿Matrícula;Alumno;Calif\r\nA1;"Pérez; Ana";8,5\r\nA2;"Luis ""el Rápido""";\r\n'), [['Matrícula', 'Alumno', 'Calif'], ['A1', 'Pérez; Ana', '8,5'], ['A2', 'Luis "el Rápido"']]);
  assert.deepEqual(parseCsv('a,b\n1,2'), [['a', 'b'], ['1', '2']]);
});

test('detección de encabezados y mapeo automático por sinónimos', async () => {
  const rows = (await sheetOf('Acta 4A')).rows;
  assert.equal(detectHeaderRow(rows), 2, 'salta el título y la fila vacía');
  const m = autoMap(rows[2]);
  assert.deepEqual([m.matricula, m.nombre, m.grupo, m.asignatura, m.periodo, m.calificacion, m.faltas, m.observaciones], [0, 1, 2, 3, 4, 5, 6, 7]);
  assert.equal(m.nivel, -1);
  const lista = autoMap(['Cuenta', 'Nombre', 'Grupo']);
  assert.deepEqual([lista.matricula, lista.nombre, lista.grupo], [0, 1, 2]);
  assert.equal(detectHeaderRow([['nada', 'raro'], ['x']]), -1);
});

test('grupos: distintos formatos de escritura', () => {
  for (const t of ['4° A', '4A', '4.° A', '4 - A', '4o a', ' 4  º  A ']) assert.deepEqual(parseGroupLabel(t), { grade: 4, name: 'A' }, t);
  assert.deepEqual(parseGroupLabel('12B'), { grade: 12, name: 'B' });
  for (const t of ['3010', 'cuarto A', '', 'A4']) assert.equal(parseGroupLabel(t), null, t);
});

const longOpts = (rows, extra = {}) => ({ headerRow: 2, mapping: autoMap(rows[2]), levelId: 'primaria', ...extra });

test('acta en formato largo: crea grupos y alumnos nuevos y registra calificaciones (0 y SD incluidos)', async () => {
  const store = makeStore(); const rows = (await sheetOf('Acta 4A')).rows;
  const plan = buildImportPlan(store.state, rows, longOpts(rows, { cycle: '2026-2027' }));
  assert.deepEqual(plan.errors, []); assert.deepEqual(plan.rowIssues, []);
  const by = (e) => plan.entries.filter((x) => x.entity === e);
  assert.equal(by('students').length, 4); assert.equal(by('records').length, 4);
  assert.ok(by('students').every((s) => s.status === 'nuevo'));
  assert.equal(by('groups').length, 0, '4° A ya existe');
  const res = store.applyPlan(plan);
  assert.equal(res.ok, true, JSON.stringify(res));
  const get = (id, subj) => store.state.records[recordKey({ cycle: '2026-2027', studentId: id, subjectId: subj, periodId: 'p1' })];
  assert.equal(get('EJ-0001', 'pri-esp').grade.value, 8.5);
  assert.equal(get('EJ-0001', 'pri-esp').notes, 'Participa mucho');
  assert.equal(get('EJ-0002', 'pri-esp').grade.value, 9);
  assert.equal(get('EJ-0003', 'pri-mat').grade.value, 0); assert.equal(get('EJ-0003', 'pri-mat').grade.status, FIELD.VALUE);
  assert.equal(get('EJ-0004', 'pri-mat').grade.status, FIELD.UNKNOWN);
  assert.equal(get('EJ-0004', 'pri-mat').absences.status, FIELD.PENDING);
  assert.equal(store.state.students.find((s) => s.id === 'EJ-0002').name, 'García & Luna "Beto"');
  assert.equal(get('EJ-0001', 'pri-esp').teacherId, 't-titular-pri', 'docente deducido de la asignatura');
});

test('idempotencia: importar el mismo acta dos veces no cambia nada (todo idéntico)', async () => {
  const store = makeStore(); const rows = (await sheetOf('Acta 4A')).rows;
  store.applyPlan(buildImportPlan(store.state, rows, longOpts(rows)));
  const before = JSON.stringify(store.state);
  const again = buildImportPlan(store.state, rows, longOpts(rows));
  assert.equal(again.counts.nuevo, 0); assert.equal(again.counts.conflicto, 0); assert.ok(again.counts.identico >= 8);
  store.applyPlan(again);
  assert.equal(JSON.stringify(store.state), before);
});

test('los conflictos no se sobrescriben en silencio; con decisión explícita sí, y se puede deshacer', async () => {
  const store = makeStore(); const rows = (await sheetOf('Acta 4A')).rows;
  store.applyPlan(buildImportPlan(store.state, rows, longOpts(rows)));
  const changed = rows.map((r) => [...r]); changed[3][5] = 5; // EJ-0001 Español: 8.5 → 5
  const plan = buildImportPlan(store.state, changed, longOpts(changed));
  const entry = plan.entries.find((e) => e.status === 'conflicto');
  assert.ok(entry && entry.entity === 'records');
  const key = entry.id;
  let out = store.applyPlan(plan); // sin decisiones
  assert.equal(out.summary.replaced, 0); assert.equal(store.state.records[key].grade.value, 8.5);
  out = store.applyPlan(plan, { [entry.uid]: 'replace' });
  assert.equal(out.summary.replaced, 1); assert.equal(store.state.records[key].grade.value, 5);
  assert.equal(store.undoImport().ok, true); assert.equal(store.state.records[key].grade.value, 8.5);
});

test('filas inválidas se omiten y se reportan con su número; las válidas sí se importan', () => {
  const store = makeStore();
  const rows = [['Matrícula', 'Alumno', 'Grupo', 'Asignatura', 'Periodo', 'Calificación', 'Faltas'],
    ['OK-1', 'Ana Ficticia', '4A', 'Español', 'Periodo 1', 9, 0],
    ['', 'Sin matrícula', '4A', 'Español', 'Periodo 1', 9, 0],
    ['MAL ID', 'Id inválido', '4A', 'Español', 'Periodo 1', 9, 0],
    ['OK-2', 'Luis Ficticio', '4A', 'Español', 'Periodo 1', 15, 0],
    ['OK-3', 'Eva Ficticia', 'cuarto', 'Español', 'Periodo 1', 8, 0],
    ['OK-4', 'Iván Ficticio', '4A', 'Física', 'Periodo 1', 8, 0],
    ['OK-5', 'Rosa Ficticia', '4A', 'Español', 'Periodo 9', 8, 0],
    ['OK-6', 'Pau Ficticia', '4A', 'Español', 'Periodo 1', 8, 'x']];
  const plan = buildImportPlan(store.state, rows, { headerRow: 0, mapping: autoMap(rows[0]), levelId: 'primaria' });
  assert.deepEqual(plan.rowIssues.map((i) => i.row), [3, 4, 5, 6, 7, 8, 9]);
  assert.equal(plan.entries.filter((e) => e.entity === 'records').length, 1);
  assert.equal(store.applyPlan(plan).ok, true);
  assert.ok(store.state.students.some((s) => s.id === 'OK-1'));
  assert.ok(!store.state.students.some((s) => s.id === 'OK-2'), 'una fila inválida se omite completa: tampoco se da de alta su alumno');
  assert.ok(!store.state.catalogs.groups.some((g) => g.grade === 12), 'ni crea grupos');
});

test('acta con una sola materia: asignatura y periodo se eligen al importar; matrícula inexistente se reporta', () => {
  const store = makeStore();
  const st = store.state.students.filter((s) => s.groupId === 'sec-2b');
  const rows = [['Cuenta', 'Calif', 'Faltas'], [st[0].id, 7.5, 1], [st[1].id, '8,25', ''], ['NO-EXISTE', 9, 0]];
  const base = { headerRow: 0, mapping: autoMap(rows[0]), levelId: 'secundaria' };
  const sinContexto = buildImportPlan(store.state, rows, base);
  assert.equal(sinContexto.entries.length, 0); assert.ok(sinContexto.rowIssues.some((i) => /periodo/i.test(i.message)));
  const plan = buildImportPlan(store.state, rows, { ...base, subjectId: 'sec-mat', periodId: 'p2' });
  assert.equal(plan.entries.filter((e) => e.entity === 'records').length, 2);
  assert.deepEqual(plan.rowIssues.map((i) => i.row), [4]); assert.match(plan.rowIssues[0].message, /no existe/);
  const replaceAll = Object.fromEntries(plan.entries.filter((e) => e.status === 'conflicto').map((e) => [e.uid, 'replace'])); // el demo ya trae datos en p2
  store.applyPlan(plan, replaceAll);
  assert.equal(store.state.records[recordKey({ cycle: st[1].cycle, studentId: st[1].id, subjectId: 'sec-mat', periodId: 'p2' })].grade.value, 8.25);
  assert.equal(store.state.records[recordKey({ cycle: st[0].cycle, studentId: st[0].id, subjectId: 'sec-mat', periodId: 'p2' })].teacherId, 't-mate');
});

test('acta ancha: una columna por asignatura', () => {
  const store = makeStore(); const st = store.state.students.find((s) => s.groupId === 'sec-1a');
  const rows = [['Matrícula', 'Alumno', 'Español', 'Matemáticas', 'Historia'], [st.id, st.name, 8, 9.5, '']];
  const mapping = autoMap(rows[0]);
  assert.deepEqual(subjectColumns(rows[0], mapping, store.state.catalogs.subjects.filter((s) => s.levelId === 'secundaria')).map((x) => x.subject.id), ['sec-esp', 'sec-mat', 'sec-his']);
  const plan = buildImportPlan(store.state, rows, { headerRow: 0, mapping, levelId: 'secundaria', periodId: 'p1' });
  assert.equal(plan.entries.filter((e) => e.entity === 'records').length, 2, 'la celda vacía no genera registro');
});

test('alumnos con candado: no se cambia nivel/grupo/ciclo de quien ya tiene calificaciones', () => {
  const store = makeStore(); const st = store.state.students.find((s) => s.groupId === 'pri-4a');
  const rows = [['Matrícula', 'Alumno', 'Grupo'], [st.id, st.name, '5A']];
  const plan = buildImportPlan(store.state, rows, { headerRow: 0, mapping: autoMap(rows[0]), levelId: 'primaria' });
  const e = plan.entries.find((x) => x.entity === 'students');
  assert.equal(e.status, 'conflicto'); assert.equal(e.locked, true); assert.match(e.reason, /calificaciones/);
  const out = store.applyPlan(plan, { [e.uid]: 'replace' });
  assert.equal(out.summary.replaced, 0, 'el candado impide reemplazar aunque se pida');
  assert.equal(store.state.students.find((s) => s.id === st.id).groupId, 'pri-4a');
});

test('lista de alumnos nueva (sin calificaciones) crea grupos y alumnos; nivel desconocido se rechaza', () => {
  const store = makeStore();
  const rows = [['Matrícula', 'Nombre', 'Nivel', 'Grupo'], ['L-1', 'Alumno Ficticio Uno', 'Secundaria', '3° C'], ['L-2', 'Alumno Ficticio Dos', 'CCH', '1A'], ['L-3', 'Alumno Ficticio Tres', 'Primaria', '6° B']];
  const plan = buildImportPlan(store.state, rows, { headerRow: 0, mapping: autoMap(rows[0]), createGroups: true });
  assert.equal(plan.entries.filter((e) => e.entity === 'groups').length, 2);
  assert.deepEqual(plan.rowIssues.map((i) => i.row), [3]); assert.match(plan.rowIssues[0].message, /solo Primaria y Secundaria/);
  assert.equal(store.applyPlan(plan).ok, true);
  assert.ok(store.state.catalogs.groups.some((g) => g.levelId === 'secundaria' && g.grade === 3 && g.name === 'C'));
  const noCreate = buildImportPlan(makeStore().state, rows, { headerRow: 0, mapping: autoMap(rows[0]), createGroups: false });
  assert.ok(noCreate.rowIssues.some((i) => /no existe/.test(i.message)));
});

test('ciclo: un alumno de otro ciclo no recibe calificaciones del ciclo elegido', () => {
  const store = makeStore(); const st = store.state.students[0];
  const rows = [['Matrícula', 'Calificación'], [st.id, 9]];
  const plan = buildImportPlan(store.state, rows, { headerRow: 0, mapping: autoMap(rows[0]), levelId: st.levelId, subjectId: 'pri-esp', periodId: 'p3', cycle: '2025-2026' });
  assert.equal(plan.entries.length, 0); assert.match(plan.rowIssues[0].message, /ciclo/);
});

test('errores fatales: sin columna de matrícula o sin nada que importar', () => {
  const store = makeStore();
  assert.match(buildImportPlan(store.state, [['Alumno', 'Calif'], ['x', 1]], { headerRow: 0, mapping: autoMap(['Alumno', 'Calif']) }).errors[0], /Matrícula/);
  assert.match(buildImportPlan(store.state, [['Matrícula'], ['x']], { headerRow: 0, mapping: autoMap(['Matrícula']) }).errors[0], /nada que importar/);
});

test('la plantilla se puede leer de vuelta y es importable', async () => {
  const [acta] = await readXlsx(buildActaTemplate());
  assert.equal(detectHeaderRow(acta.rows), 0);
  const m = autoMap(acta.rows[0]);
  assert.ok(Object.entries(m).filter(([k]) => k !== 'apellidos').every(([, v]) => v >= 0));
  const store = makeStore();
  const plan = buildImportPlan(store.state, acta.rows, { headerRow: 0, mapping: m, createGroups: false });
  assert.deepEqual(plan.rowIssues, []); assert.equal(store.applyPlan(plan).ok, true);
  assert.equal(readTable.length >= 1, true);
});
