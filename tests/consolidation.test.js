import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStore } from './helpers.js';
import { consolidateStudent, searchStudents } from '../src/consolidation.js';
import { createRecord, valueField } from '../src/models.js';

test('consolida todas las asignaturas y periodos esperados del nivel del alumno', () => {
  const store = makeStore();
  for (const level of ['primaria', 'secundaria', 'cch']) {
    const st = store.state.students.find((s) => s.levelId === level);
    const c = consolidateStudent(store.state, st.id);
    const subjects = store.state.catalogs.subjects.filter((s) => s.levelId === level).length;
    assert.equal(c.rows.length, subjects * store.state.catalogs.periods.length, level);
    assert.ok(c.rows.every((r) => r.subject.levelId === level));
  }
});

test('el resumen cuenta completos, pendientes y desconocidos', () => {
  const store = makeStore();
  const st = store.state.students[1];
  const c = consolidateStudent(store.state, st.id);
  assert.equal(c.summary.expected, c.summary.complete + c.summary.incomplete);
  assert.ok(c.summary.unknownGrades >= 1, 'el demo incluye un dato desconocido para el alumno 2');
  assert.ok(c.summary.pendingGrades > 0);
});

test('un registro de otro ciclo se excluye y se reporta, nunca se mezcla', () => {
  const store = makeStore();
  const st = store.state.students[0];
  const legacy = createRecord({ studentId: st.id, subjectId: 'pri-esp', teacherId: 't-titular-pri', periodId: 'p3', cycle: '2025-2026', groupId: st.groupId, grade: valueField(10), absences: valueField(0) });
  store.state.records[legacy.key] = legacy; // simula datos heredados
  const c = consolidateStudent(store.state, st.id);
  assert.ok(c.issues.some((i) => i.type === 'otro-ciclo'));
  const row = c.rows.find((r) => r.subject.id === 'pri-esp' && r.period.id === 'p3');
  assert.notEqual(row.grade.value, 10);
  assert.equal(row.record, null);
});

test('un registro inconsistente (nivel/grupo) se excluye y se reporta', () => {
  const store = makeStore();
  const st = store.state.students[0];
  const bad = createRecord({ studentId: st.id, subjectId: 'sec-mat', teacherId: 't-mate', periodId: 'p1', cycle: st.cycle, groupId: st.groupId, grade: valueField(9), absences: valueField(0) });
  store.state.records[bad.key] = bad;
  const c = consolidateStudent(store.state, st.id);
  assert.ok(c.issues.some((i) => i.type === 'inconsistente'));
  assert.ok(c.rows.every((r) => r.subject.levelId === 'primaria'));
});

test('búsqueda por matrícula o nombre, sin acentos ni mayúsculas', () => {
  const store = makeStore();
  const st = store.state.students[0];
  assert.ok(searchStudents(store.state, { query: st.id.toLowerCase() }).some((r) => r.student.id === st.id));
  const part = st.name.split(' ')[1].normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase();
  assert.ok(searchStudents(store.state, { query: part }).some((r) => r.student.id === st.id));
  assert.equal(searchStudents(store.state, { query: 'zzzz-nadie' }).length, 0);
  const sec = searchStudents(store.state, { levelId: 'secundaria' });
  assert.ok(sec.length > 0 && sec.every((r) => r.student.levelId === 'secundaria'));
});

test('el filtro de incompletos solo devuelve alumnos con datos pendientes', () => {
  const store = makeStore();
  const inc = searchStudents(store.state, { onlyIncomplete: true });
  assert.ok(inc.length > 0 && inc.every((r) => r.summary.incomplete > 0 || r.issues.length));
});
