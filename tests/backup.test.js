import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStore, primaria } from './helpers.js';

const existing = (store) => {
  const r = Object.values(store.state.records).find((x) => x.grade.status === 'valor' && x.grade.value !== 5);
  return { student: { id: r.studentId }, subjectId: r.subjectId, teacherId: r.teacherId, periodId: r.periodId };
};
import { MemoryAdapter, Store } from '../src/store.js';
import { saveCapture } from '../src/capture.js';
import { serializeBackup, createBackup } from '../src/backup.js';
import { createRecord, valueField, stableStringify } from '../src/models.js';
import { consolidateStudent } from '../src/consolidation.js';

const emptyStore = () => new Store(new MemoryAdapter(), {
  seed: () => ({ ...makeStore().state, students: [], records: {}, catalogs: { levels: makeStore().state.catalogs.levels, groups: [], teachers: [], subjects: [], periods: [] } }),
});

test('exportar e importar conserva alumnos, asignaturas y evaluaciones (ida y vuelta)', () => {
  const a = makeStore();
  const text = a.exportBackupText();
  const b = emptyStore();
  const res = b.planImport(text);
  assert.equal(res.ok, true);
  assert.equal(res.plan.errors.length, 0);
  const done = b.applyImport(res.backup, res.plan);
  assert.equal(done.ok, true, JSON.stringify(done));
  assert.equal(b.state.students.length, a.state.students.length);
  assert.equal(Object.keys(b.state.records).length, Object.keys(a.state.records).length);
  for (const st of a.state.students.slice(0, 5)) {
    assert.equal(stableStringify(consolidateStudent(b.state, st.id).rows.map((r) => [r.grade, r.absences, r.notes])),
      stableStringify(consolidateStudent(a.state, st.id).rows.map((r) => [r.grade, r.absences, r.notes])));
  }
});

test('importar el mismo respaldo no cambia nada (todo idéntico)', () => {
  const a = makeStore();
  const before = JSON.stringify(a.state);
  const res = a.planImport(a.exportBackupText());
  assert.equal(res.plan.counts.nuevo, 0);
  assert.equal(res.plan.counts.conflicto, 0);
  a.applyImport(res.backup, res.plan);
  assert.equal(JSON.stringify(a.state), before);
});

test('los conflictos NO se sobrescriben en silencio: por defecto se conserva lo existente', () => {
  const a = makeStore();
  const text = a.exportBackupText();
  const { student, subjectId, teacherId, periodId } = existing(a);
  saveCapture(a, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '5', absencesText: '5' });
  const res = a.planImport(text);
  assert.ok(res.plan.counts.conflicto >= 1);
  const out = a.applyImport(res.backup, res.plan); // sin decisiones
  assert.equal(out.summary.replaced, 0);
  assert.ok(out.summary.kept >= 1);
  const key = Object.keys(a.state.records).find((k) => k.includes(student.id) && k.includes(subjectId) && k.endsWith(periodId));
  assert.equal(a.state.records[key].grade.value, 5);
});

test('con decisión explícita "replace" se reemplaza solo ese conflicto, y se puede deshacer', () => {
  const a = makeStore();
  const text = a.exportBackupText();
  const { student, subjectId, teacherId, periodId } = existing(a);
  saveCapture(a, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '5', absencesText: '5' });
  const res = a.planImport(text);
  const entry = res.plan.entries.find((e) => e.status === 'conflicto' && e.entity === 'records');
  assert.ok(entry);
  const out = a.applyImport(res.backup, res.plan, { [entry.uid]: 'replace' });
  assert.equal(out.summary.replaced, 1);
  assert.notEqual(a.state.records[entry.id].grade.value, 5);
  assert.equal(a.hasUndoSnapshot(), true);
  assert.equal(a.undoImport().ok, true);
  assert.equal(a.state.records[entry.id].grade.value, 5);
});

test('importar agrega registros nuevos sin tocar los existentes', () => {
  const src = makeStore();
  const { student, subjectId, teacherId, periodId } = primaria(src);
  saveCapture(src, { studentId: student.id, subjectId, teacherId, periodId, gradeText: '9.5', absencesText: '0' });
  const text = src.exportBackupText();
  const dst = makeStore();
  const key = `${student.cycle}|${student.id}|${subjectId}|${periodId}`;
  const had = dst.state.records[key];
  delete dst.state.records[key];
  const res = dst.planImport(text);
  assert.equal(res.plan.entries.find((e) => e.uid === `records:${key}`).status, 'nuevo');
  dst.applyImport(res.backup, res.plan);
  assert.equal(dst.state.records[key].grade.value, 9.5);
  assert.equal(had, undefined);
});

test('rechaza respaldos alterados, de otro formato o con versión no soportada', () => {
  const a = makeStore();
  const obj = JSON.parse(a.exportBackupText());
  const tampered = JSON.parse(JSON.stringify(obj));
  tampered.data.records[0].grade = { status: 'valor', value: 1 };
  assert.equal(a.planImport(JSON.stringify(tampered)).ok, false);
  assert.equal(a.planImport('esto no es json').ok, false);
  assert.equal(a.planImport(JSON.stringify({ format: 'otro' })).ok, false);
  assert.equal(a.planImport(JSON.stringify({ ...obj, schemaVersion: 99 })).ok, false);
});

test('rechaza registros que violan la integridad (otro ciclo o referencias rotas) sin importar nada', () => {
  const a = makeStore();
  const backup = createBackup(a.state);
  const st = a.state.students[0];
  const bad = createRecord({ studentId: st.id, subjectId: 'pri-esp', teacherId: 't-titular-pri', periodId: 'p1', cycle: '2025-2026', groupId: st.groupId, grade: valueField(7), absences: valueField(1) });
  backup.data.records.push(bad);
  const { checksum } = await_checksum(backup.data);
  backup.checksum = checksum;
  const b = makeStore();
  const res = b.planImport(serializeBackup(backup));
  assert.equal(res.ok, true);
  assert.ok(res.plan.errors.length > 0);
  const before = JSON.stringify(b.state);
  assert.equal(b.applyImport(res.backup, res.plan).ok, false);
  assert.equal(JSON.stringify(b.state), before);
});

function await_checksum(data) {
  // misma función que usa la app, importada de forma síncrona vía el módulo ya cargado
  return { checksum: checksumFn(stableStringify(data)) };
}
import { checksum as checksumFn } from '../src/backup.js';
