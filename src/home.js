// Resúmenes para la pantalla de Inicio (sin DOM, probados con node:test).
import { rowsBySubject } from './capture.js';
import { searchStudents } from './consolidation.js';

/** Avance de captura de un docente en un grupo y periodo: cuántos registros faltan y por dónde seguir. */
export function teacherSummary(state, { levelId, groupId, teacherId, periodId }) {
  const teacher = state.catalogs.teachers.find((t) => t.id === teacherId);
  const subjects = state.catalogs.subjects.filter((s) => s.levelId === levelId && teacher?.subjectIds.includes(s.id));
  let expected = 0; let complete = 0; let next = null; let students = 0;
  for (const subject of subjects) {
    const rows = rowsBySubject(state, { groupId, subjectId: subject.id, periodId });
    students = Math.max(students, rows.length);
    const done = rows.filter((r) => r.complete).length;
    expected += rows.length; complete += done;
    if (!next && done < rows.length) next = { subject, pending: rows.length - done };
  }
  return { subjects: subjects.length, students, expected, complete, pending: expected - complete, next };
}

export function controlSummary(state) {
  const all = searchStudents(state, { cycle: state.activeCycle });
  const incomplete = all.filter((c) => c.summary.incomplete > 0 || c.issues.length > 0).length;
  const issues = all.reduce((n, c) => n + c.issues.length, 0);
  return { students: all.length, incomplete, complete: all.length - incomplete, issues };
}

/** Pasos para dejar listo un nivel nuevo (vacío): grupos → asignaturas → docentes → alumnos. */
export function setupChecklist(state, levelId) {
  const c = state.catalogs;
  const steps = [
    { key: 'groups', label: 'Crear al menos un grupo', done: c.groups.some((g) => g.levelId === levelId) },
    { key: 'subjects', label: 'Agregar las asignaturas', done: c.subjects.some((s) => s.levelId === levelId) },
    { key: 'teachers', label: 'Registrar a los docentes', done: c.teachers.some((t) => t.levelIds.includes(levelId) && t.subjectIds.length > 0) },
    { key: 'students', label: 'Dar de alta a los alumnos', done: state.students.some((s) => s.levelId === levelId) },
  ];
  return { steps, ready: steps.every((s) => s.done) };
}
