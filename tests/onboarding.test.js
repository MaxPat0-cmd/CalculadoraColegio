import test from 'node:test';
import assert from 'node:assert/strict';
import { makeStore } from './helpers.js';
import { ALLOWED_LEVELS } from '../src/catalogs.js';
import { LEVEL_CHOICES, ensureLevel, levelForChoice, defaultMode, startHash, profileLabel, greeting, configPatchForProfile, teachersFor } from '../src/onboarding.js';
import { teacherSummary, controlSummary, setupChecklist } from '../src/home.js';
import { saveCapture } from '../src/capture.js';

test('solo existen Primaria y Secundaria: ni CCH ni universidad en catálogo, datos demo ni onboarding', () => {
  const { state } = makeStore();
  assert.deepEqual(state.catalogs.levels.map((l) => l.id), ['primaria', 'secundaria']);
  assert.deepEqual([...ALLOWED_LEVELS], ['primaria', 'secundaria']);
  assert.ok(state.students.every((s) => ALLOWED_LEVELS.includes(s.levelId)));
  assert.ok(state.catalogs.groups.every((g) => ALLOWED_LEVELS.includes(g.levelId)));
  assert.ok(state.catalogs.subjects.every((s) => ALLOWED_LEVELS.includes(s.levelId)));
  assert.ok(state.catalogs.teachers.every((t) => t.levelIds.every((l) => ALLOWED_LEVELS.includes(l))));
  assert.ok(Object.values(state.records).every((r) => !r.subjectId.startsWith('cch-')));
  assert.deepEqual(LEVEL_CHOICES.map((c) => c.id), ['primaria', 'secundaria']);
});

test('onboarding: cada opción se enlaza con su nivel y lo desconocido se rechaza', () => {
  const store = makeStore();
  for (const c of LEVEL_CHOICES) assert.equal(levelForChoice(store.state, c), c.id);
  assert.deepEqual(ensureLevel(store, 'primaria'), { ok: true, levelId: 'primaria', created: false });
  for (const bad of ['cch', 'bachillerato', 'universidad', 'preescolar', 'otro']) assert.equal(ensureLevel(store, bad).ok, false, bad);
  assert.equal(levelForChoice(store.state, undefined), null);
});

test('perfil: modalidad, pantalla de arranque, etiqueta y ajuste de configuración', () => {
  const store = makeStore(); const st = store.state;
  assert.equal(defaultMode('primaria'), 'alumno');
  assert.equal(defaultMode('secundaria'), 'asignatura');
  const docPri = { done: true, role: 'docente', levelId: 'primaria', teacherId: 't-titular-pri' };
  assert.equal(startHash(st, docPri), '#capturar');
  assert.equal(startHash(st, { ...docPri, levelId: 'inexistente' }), '#inicio', 'sin grupos arranca en Inicio');
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
  const subj = a.next.subject.id;
  for (const st of store.state.students.filter((s) => s.groupId === 'pri-4a')) saveCapture(store, { studentId: st.id, subjectId: subj, teacherId: 't-titular-pri', periodId: 'p3', gradeText: '9', absencesText: '0' });
  assert.equal(teacherSummary(store.state, args).pending, a.pending - a.next.pending);
  assert.deepEqual(teacherSummary(store.state, { ...args, teacherId: 'nadie' }), { subjects: 0, students: 0, expected: 0, complete: 0, pending: 0, next: null });
});

test('inicio: resumen de Control Escolar y lista de pasos', () => {
  const store = makeStore();
  const c = controlSummary(store.state);
  assert.equal(c.students, 20); assert.equal(c.complete + c.incomplete, 20); assert.ok(c.incomplete > 0);
  assert.equal(setupChecklist(store.state, 'primaria').ready, true);
  store.state.catalogs.groups = store.state.catalogs.groups.filter((g) => g.levelId !== 'secundaria');
  let list = setupChecklist(store.state, 'secundaria');
  assert.equal(list.steps.find((s) => s.key === 'groups').done, false); assert.equal(list.ready, false);
  store.addCatalogItem('groups', { name: 'A', levelId: 'secundaria', grade: 1 });
  list = setupChecklist(store.state, 'secundaria');
  assert.equal(list.steps.find((s) => s.key === 'groups').done, true);
});
