import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStore } from './helpers.js';
import { addLevel, removeLevel } from '../src/catalogs.js';
import { LEVEL_CHOICES, ensureLevel, levelForChoice, defaultMode, startHash, profileLabel, greeting, configPatchForProfile, teachersFor } from '../src/onboarding.js';
import { teacherSummary, controlSummary, setupChecklist } from '../src/home.js';
import { saveCapture } from '../src/capture.js';

test('niveles: alta con id único, sin duplicados y sin eliminar si tienen contenido', () => {
  const s = makeStore().state;
  const r = addLevel(s, 'Preescolar');
  assert.equal(r.ok, true); assert.equal(r.item.id, 'preescolar');
  assert.equal(addLevel(s, '  preescolar ').ok, false, 'duplicado sin importar mayúsculas');
  assert.equal(addLevel(s, '').ok, false);
  assert.equal(addLevel(s, 'x'.repeat(41)).ok, false);
  assert.equal(removeLevel(s, 'primaria').ok, false, 'tiene grupos y alumnos');
  assert.equal(removeLevel(s, 'preescolar').ok, true);
  assert.equal(removeLevel(s, 'no-existe').ok, false);
});

test('onboarding: bachillerato se enlaza con CCH; preescolar y universidad se crean vacíos', () => {
  const store = makeStore();
  const choice = (id) => LEVEL_CHOICES.find((c) => c.id === id);
  assert.equal(levelForChoice(store.state, choice('bachillerato')), 'cch');
  assert.equal(levelForChoice(store.state, choice('preescolar')), null);
  assert.deepEqual(ensureLevel(store, 'primaria'), { ok: true, levelId: 'primaria', created: false });
  const pre = ensureLevel(store, 'preescolar');
  assert.equal(pre.ok, true); assert.equal(pre.created, true);
  assert.equal(store.state.catalogs.groups.filter((g) => g.levelId === pre.levelId).length, 0, 'no inventa grupos');
  assert.equal(store.state.students.filter((s) => s.levelId === pre.levelId).length, 0, 'no inventa alumnos');
  assert.equal(ensureLevel(store, 'preescolar').created, false, 'idempotente');
  assert.equal(ensureLevel(store, 'otro', '   ').ok, false);
  const otro = ensureLevel(store, 'otro', 'Maestría');
  assert.equal(otro.ok, true); assert.equal(store.state.catalogs.levels.find((l) => l.id === otro.levelId).name, 'Maestría');
  assert.equal(ensureLevel(store, 'inexistente').ok, false);
});

test('perfil: modalidad, pantalla de arranque, etiqueta y ajuste de configuración', () => {
  const store = makeStore(); const st = store.state;
  assert.equal(defaultMode('primaria'), 'alumno');
  assert.equal(defaultMode('secundaria'), 'asignatura');
  const docPri = { done: true, role: 'docente', levelId: 'primaria', teacherId: 't-titular-pri' };
  assert.equal(startHash(st, docPri), '#capturar');
  assert.equal(startHash(st, { ...docPri, levelId: 'preescolar' }), '#inicio', 'nivel sin grupos arranca en Inicio');
  assert.equal(startHash(st, { done: true, role: 'control' }), '#control');
  assert.equal(startHash(st, { done: true, role: 'explorar' }), '#inicio');
  assert.equal(profileLabel(st, docPri), 'Docente · Primaria');
  assert.equal(profileLabel(st, { done: false }), 'Configurar perfil');
  assert.deepEqual(configPatchForProfile(st, docPri), { levelId: 'primaria', teacherId: 't-titular-pri' });
  assert.equal(configPatchForProfile(st, { ...docPri, teacherId: 't-mate' }).teacherId, undefined, 'docente de otro nivel se ignora');
  assert.ok(teachersFor(st, 'primaria').length >= 3);
  assert.match(greeting(new Date('2026-01-01T08:00:00')), /días/);
  assert.match(greeting(new Date('2026-01-01T15:00:00')), /tardes/);
  assert.match(greeting(new Date('2026-01-01T22:00:00')), /noches/);
});

test('inicio: el resumen del docente cuenta pendientes y sugiere por dónde seguir', () => {
  const store = makeStore();
  const args = { levelId: 'primaria', groupId: 'pri-4a', teacherId: 't-titular-pri', periodId: 'p3' };
  const a = teacherSummary(store.state, args);
  assert.equal(a.subjects, 4); assert.equal(a.students, 6);
  assert.equal(a.expected, 24); assert.equal(a.complete + a.pending, a.expected);
  assert.ok(a.next && a.next.pending > 0);
  // completar la materia sugerida reduce los pendientes
  const subj = a.next.subject.id;
  for (const st of store.state.students.filter((s) => s.groupId === 'pri-4a')) saveCapture(store, { studentId: st.id, subjectId: subj, teacherId: 't-titular-pri', periodId: 'p3', gradeText: '9', absencesText: '0' });
  const b = teacherSummary(store.state, args);
  assert.equal(b.pending, a.pending - a.next.pending);
  assert.deepEqual(teacherSummary(store.state, { ...args, teacherId: 'nadie' }), { subjects: 0, students: 0, expected: 0, complete: 0, pending: 0, next: null });
});

test('inicio: resumen de Control Escolar y lista de pasos para un nivel nuevo', () => {
  const store = makeStore();
  const c = controlSummary(store.state);
  assert.equal(c.students, 30); assert.equal(c.complete + c.incomplete, 30); assert.ok(c.incomplete > 0);
  const lvl = ensureLevel(store, 'universidad').levelId;
  let list = setupChecklist(store.state, lvl);
  assert.equal(list.ready, false); assert.ok(list.steps.every((s) => !s.done));
  store.addCatalogItem('groups', { name: 'A', levelId: lvl, grade: 1 });
  list = setupChecklist(store.state, lvl);
  assert.equal(list.steps.find((s) => s.key === 'groups').done, true);
  assert.equal(setupChecklist(store.state, 'primaria').ready, true);
});
