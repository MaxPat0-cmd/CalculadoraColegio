import test from 'node:test';
import assert from 'node:assert/strict';
import { RuleRegistry, createDefaultRegistry, evaluateSubject, RESULT_KIND } from '../src/evaluation.js';
import { makeStore } from './helpers.js';
import { consolidateStudent } from '../src/consolidation.js';

const ctxFor = (store) => {
  const student = store.state.students.find((s) => s.levelId === 'secundaria');
  const subject = store.state.catalogs.subjects.find((s) => s.id === 'sec-mat');
  const records = Object.values(store.state.records).filter((r) => r.studentId === student.id && r.subjectId === subject.id);
  return { student, subject, records };
};

test('sin reglas: solo se muestran calificaciones capturadas, nada se calcula ni es oficial', () => {
  const store = makeStore();
  const res = evaluateSubject(createDefaultRegistry(), ctxFor(store));
  assert.notEqual(res.kind, RESULT_KIND.CALCULATED);
  assert.equal(res.value, null);
  assert.equal(res.official, false);
});

test('una regla sin validar produce resultado calculado marcado como NO oficial', () => {
  const store = makeStore();
  const reg = new RuleRegistry().register({ id: 'prueba', name: 'Regla de prueba', compute: ({ records }) => ({ value: records.length }) });
  reg.assign('secundaria', 'prueba');
  const res = evaluateSubject(reg, ctxFor(store));
  assert.equal(res.kind, RESULT_KIND.CALCULATED);
  assert.equal(res.official, false);
  assert.match(res.label, /NO OFICIAL/);
});

test('solo una regla validada explícitamente puede producir resultados oficiales', () => {
  const store = makeStore();
  const reg = new RuleRegistry().register({ id: 'v', name: 'Validada', validated: true, compute: () => ({ value: 8 }) });
  reg.assign('secundaria', 'v');
  assert.equal(evaluateSubject(reg, ctxFor(store)).official, true);
  assert.equal(reg.describe('secundaria').validated, true);
  assert.equal(reg.describe('primaria').validated, false);
});

test('registrar una regla inválida o asignar una inexistente falla', () => {
  const reg = new RuleRegistry();
  assert.throws(() => reg.register({ id: 'x' }));
  assert.throws(() => reg.assign('cch', 'no-existe'));
});

test('la consolidación no calcula promedios con el registro por defecto', () => {
  const store = makeStore();
  const c = consolidateStudent(store.state, store.state.students[0].id);
  assert.ok(c.evaluations.every((e) => e.result.value === null && e.result.official === false));
});
