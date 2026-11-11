import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStore } from './helpers.js';
import { MemoryAdapter, Store, STORAGE_KEY, MIGRATION_KEY } from '../src/store.js';
import { createRecord, valueField, stableStringify, SCHEMA_VERSION } from '../src/models.js';
import { createBackup, serializeBackup, checksum } from '../src/backup.js';

/** Documento del esquema 1: igual al actual pero con CCH (nivel, grupo, asignaturas, docentes, alumnos y registros). */
function legacyDoc() {
  const s = JSON.parse(JSON.stringify(makeStore().state));
  s.schemaVersion = 1;
  s.catalogs.levels.push({ id: 'cch', name: 'CCH' });
  s.catalogs.groups.push({ id: 'cch-1a', levelId: 'cch', grade: 1, name: 'A' });
  s.catalogs.subjects.push({ id: 'cch-mat', name: 'Matemáticas', levelId: 'cch' });
  s.catalogs.teachers.push({ id: 't-cch', name: 'Prof. CCH', levelIds: ['cch'], subjectIds: ['cch-mat'] });
  const mate = s.catalogs.teachers.find((t) => t.id === 't-mate');
  mate.levelIds.push('cch'); mate.subjectIds.push('cch-mat');
  s.students.push({ id: 'DEMO-CCH-1', name: 'Alumno CCH', levelId: 'cch', grade: 1, groupId: 'cch-1a', cycle: s.activeCycle });
  const rec = createRecord({ studentId: 'DEMO-CCH-1', subjectId: 'cch-mat', teacherId: 't-mate', periodId: 'p1', cycle: s.activeCycle, groupId: 'cch-1a', grade: valueField(8), absences: valueField(0) });
  s.records[rec.key] = rec;
  return s;
}

test('el esquema 1 se migra al cargar: se retira CCH, se conserva copia y se avisa', () => {
  const adapter = new MemoryAdapter();
  const legacy = legacyDoc();
  const rawBefore = JSON.stringify(legacy);
  adapter.setItem(STORAGE_KEY, rawBefore);
  const store = new Store(adapter);
  const st = store.state;
  assert.equal(st.schemaVersion, SCHEMA_VERSION);
  assert.deepEqual(st.catalogs.levels.map((l) => l.id), ['primaria', 'secundaria']);
  assert.ok(!st.students.some((s) => s.levelId === 'cch') && !st.catalogs.groups.some((g) => g.levelId === 'cch'));
  assert.ok(!st.catalogs.subjects.some((s) => s.levelId === 'cch'));
  assert.ok(!Object.values(st.records).some((r) => r.studentId === 'DEMO-CCH-1'));
  assert.ok(!st.catalogs.teachers.some((t) => t.id === 't-cch'), 'docente solo de CCH se elimina');
  const mate = st.catalogs.teachers.find((t) => t.id === 't-mate');
  assert.deepEqual(mate.levelIds, ['secundaria']); assert.ok(!mate.subjectIds.includes('cch-mat'));
  assert.equal(adapter.getItem(MIGRATION_KEY), rawBefore, 'copia íntegra del documento anterior');
  assert.match(store.notice, /solo Primaria y Secundaria/);
  assert.match(store.notice, /1 alumno/);
  // los datos de Primaria y Secundaria quedan intactos
  assert.equal(st.students.length, 20);
  assert.equal(stableStringify(Object.values(st.records).filter((r) => r.studentId !== 'DEMO-CCH-1')), stableStringify(Object.values(makeStore().state.records)));
  // la migración se persistió: una segunda carga ya no migra ni avisa
  const again = new Store(adapter);
  assert.equal(again.notice, null); assert.equal(again.state.schemaVersion, SCHEMA_VERSION);
});

test('un documento sin niveles retirados migra sin aviso', () => {
  const adapter = new MemoryAdapter();
  const doc = JSON.parse(JSON.stringify(makeStore().state)); doc.schemaVersion = 1;
  adapter.setItem(STORAGE_KEY, JSON.stringify(doc));
  const store = new Store(adapter);
  assert.equal(store.notice, null); assert.equal(store.state.schemaVersion, SCHEMA_VERSION);
});

test('un respaldo de la versión anterior (con CCH) se importa sin CCH y avisa', () => {
  const legacy = legacyDoc();
  const data = { institution: legacy.institution, cycles: legacy.cycles, activeCycle: legacy.activeCycle, scale: legacy.scale, catalogs: legacy.catalogs, students: legacy.students, records: Object.values(legacy.records).sort((a, b) => a.key.localeCompare(b.key)) };
  const backup = { format: 'calculadora-academica-alzate-backup', schemaVersion: 1, appVersion: '1.4.0', exportedAt: '2026-01-01T00:00:00Z', demo: true, checksum: checksum(stableStringify(data)), data };
  const dst = makeStore();
  const res = dst.planImport(JSON.stringify(backup));
  assert.equal(res.ok, true);
  assert.match(res.migratedNote, /1 nivel/);
  assert.equal(res.plan.errors.length, 0);
  assert.ok(!res.plan.entries.some((e) => /cch/i.test(e.id)));
  assert.equal(dst.applyImport(res.backup, res.plan).ok, true);
  assert.ok(!dst.state.students.some((s) => s.levelId === 'cch'));
});

test('los respaldos nuevos usan el esquema 2 y siguen siendo válidos', () => {
  const a = makeStore();
  const b = createBackup(a.state);
  assert.equal(b.schemaVersion, 2);
  assert.equal(a.planImport(serializeBackup(b)).ok, true);
});
