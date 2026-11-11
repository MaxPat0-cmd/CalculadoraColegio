import { Store, MemoryAdapter } from '../src/store.js';

export const FIXED_NOW = new Date('2026-11-11T12:00:00Z');

export function makeStore(adapter = new MemoryAdapter()) {
  return new Store(adapter, { now: () => FIXED_NOW });
}

/** Alumno de primaria de los datos demo + asignatura/docente válidos. */
export function primaria(store) {
  const student = store.state.students.find((s) => s.levelId === 'primaria');
  return { student, subjectId: 'pri-esp', teacherId: 't-titular-pri', periodId: 'p3' };
}
