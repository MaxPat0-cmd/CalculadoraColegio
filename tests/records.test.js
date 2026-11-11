import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStore, primaria } from './helpers.js';
import { saveCapture, rowsBySubject, rowsByStudent } from '../src/capture.js';
import { parseGradeInput, parseAbsencesInput } from '../src/validation.js';
import { FIELD, recordKey } from '../src/models.js';

test('distingue pendiente, desconocido y cero', () => {
  assert.deepEqual(parseGradeInput('').field, { status: FIELD.PENDING, value: null });
  assert.deepEqual(parseGradeInput('SD').field, { status: FIELD.UNKNOWN, value: null });
  assert.deepEqual(parseGradeInput('0').field, { status: FIELD.VALUE, value: 0 });
  assert.deepEqual(parseGradeInput('8,5').field, { status: FIELD.VALUE, value: 8.5 });
  assert.deepEqual(parseAbsencesInput('0').field, { status: FIELD.VALUE, value: 0 });
  assert.equal(parseAbsencesInput('').field.status, FIELD.PENDING);
});

test('rechaza entradas inválidas con mensajes comprensibles', () => {
  for (const bad of ['abc', '-1', '11', '8.555', '1e3']) {
    const r = parseGradeInput(bad);
    assert.equal(r.ok, false, bad);
    assert.ok(r.error.length > 10);
  }
  assert.equal(parseAbsencesInput('2.5').ok, false);
  assert.equal(parseAbsencesInput('-2').ok, false);
});

test('el cero capturado no se confunde con pendiente al guardar y leer', () => {
  const store = makeStore();
  const { student, subjectId, teacherId, periodId } = primaria(store);
  const r = saveCapture(store, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '0', absencesText: '0' });
  assert.equal(r.ok, true);
  const row = rowsByStudent(store.state, { studentId: student.id, teacherId, periodId }).find((x) => x.subject.id === subjectId);
  assert.equal(row.grade.status, FIELD.VALUE);
  assert.equal(row.grade.value, 0);
  assert.equal(row.state, 'capturado');
  assert.equal(row.complete, true);
});

test('guardar dos veces el mismo dato no duplica registros', () => {
  const store = makeStore();
  const { student, subjectId, teacherId, periodId } = primaria(store);
  const before = Object.keys(store.state.records).length;
  saveCapture(store, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '7', absencesText: '1' });
  saveCapture(store, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '8', absencesText: '1' });
  assert.equal(Object.keys(store.state.records).length, before + 1);
  const key = recordKey({ cycle: student.cycle, studentId: student.id, subjectId, periodId });
  assert.equal(store.getRecord(key).grade.value, 8);
  const keys = Object.keys(store.state.records);
  assert.equal(new Set(keys).size, keys.length);
});

test('captura por alumno y por asignatura se mantienen sincronizadas', () => {
  const store = makeStore();
  const { student, subjectId, teacherId, periodId } = primaria(store);
  // 1) captura por alumno -> se ve por asignatura
  saveCapture(store, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '9.1', absencesText: '2', notes: 'Buen avance' });
  let row = rowsBySubject(store.state, { groupId: student.groupId, subjectId, periodId }).find((r) => r.student.id === student.id);
  assert.equal(row.grade.value, 9.1);
  assert.equal(row.absences.value, 2);
  assert.equal(row.notes, 'Buen avance');
  // 2) captura por asignatura sobre el mismo alumno -> se ve por alumno
  saveCapture(store, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '6', absencesText: '3', notes: '' });
  row = rowsByStudent(store.state, { studentId: student.id, teacherId, periodId }).find((r) => r.subject.id === subjectId);
  assert.equal(row.grade.value, 6);
  assert.equal(row.absences.value, 3);
  assert.equal(row.notes, '');
});

test('vaciar la calificación la devuelve a pendiente sin perder las faltas', () => {
  const store = makeStore();
  const { student, subjectId, teacherId, periodId } = primaria(store);
  saveCapture(store, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '7', absencesText: '2' });
  saveCapture(store, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '', absencesText: '2' });
  const rec = store.getRecord(recordKey({ cycle: student.cycle, studentId: student.id, subjectId, periodId }));
  assert.equal(rec.grade.status, FIELD.PENDING);
  assert.equal(rec.absences.value, 2);
});

test('no permite registros que mezclen ciclo, nivel o grupo', () => {
  const store = makeStore();
  const { student, subjectId, teacherId, periodId } = primaria(store);
  const base = { studentId: student.id, subjectId, teacherId, periodId };
  assert.equal(store.upsertRecord({ ...base, cycle: '2025-2026' }).ok, false, 'ciclo distinto');
  assert.equal(store.upsertRecord({ ...base, subjectId: 'sec-esp' }).ok, false, 'asignatura de otro nivel');
  assert.equal(store.upsertRecord({ ...base, groupId: 'pri-5a' }).ok, false, 'grupo distinto');
  assert.equal(store.upsertRecord({ ...base, teacherId: 'no-existe' }).ok, false, 'docente inexistente');
  assert.equal(store.upsertRecord({ ...base, periodId: 'p9' }).ok, false, 'periodo inexistente');
  assert.equal(store.upsertRecord({ ...base, studentId: 'NADIE' }).ok, false, 'alumno inexistente');
});

test('la captura devuelve errores por campo sin guardar nada', () => {
  const store = makeStore();
  const { student, subjectId, teacherId, periodId } = primaria(store);
  const n = Object.keys(store.state.records).length;
  const r = saveCapture(store, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '15', absencesText: 'x' });
  assert.equal(r.ok, false);
  assert.ok(r.errors.grade && r.errors.absences);
  assert.equal(Object.keys(store.state.records).length, n);
});

test('persistencia: los datos sobreviven a recargar y los datos dañados no se pierden', async () => {
  const { MemoryAdapter, Store, STORAGE_KEY } = await import('../src/store.js');
  const adapter = new MemoryAdapter();
  const a = makeStore(adapter);
  const { student, subjectId, teacherId, periodId } = primaria(a);
  saveCapture(a, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '9', absencesText: '0' });
  const b = makeStore(adapter);
  assert.equal(b.getRecord(recordKey({ cycle: student.cycle, studentId: student.id, subjectId, periodId })).grade.value, 9);
  adapter.setItem(STORAGE_KEY, '{no es json');
  const c = new Store(adapter);
  assert.ok(c.loadWarning);
  assert.equal(adapter.getItem(`${STORAGE_KEY}-danado`), '{no es json');
});

test('un fallo de almacenamiento revierte el cambio en memoria', () => {
  const store = makeStore();
  const { student, subjectId, teacherId, periodId } = primaria(store);
  const key = recordKey({ cycle: student.cycle, studentId: student.id, subjectId, periodId });
  store.adapter.setItem = () => { throw new Error('QuotaExceeded'); };
  const r = saveCapture(store, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '5', absencesText: '1' });
  assert.equal(r.ok, false);
  assert.equal(store.getRecord(key), null);
});
