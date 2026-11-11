// Captura: lógica común de las dos modalidades (por alumno y por asignatura).
// Ambas leen y escriben exactamente los mismos registros del Store, por lo que siempre están sincronizadas.
import { recordKey, pendingField, captureState, isComplete } from './models.js';
import { parseGradeInput, parseAbsencesInput } from './validation.js';
import { sortByName } from './catalogs.js';

function rowFor(state, student, subject, periodId) {
  const record = state.records[recordKey({ cycle: student.cycle, studentId: student.id, subjectId: subject.id, periodId })] ?? null;
  return {
    student, subject, periodId, record,
    grade: record?.grade ?? pendingField(),
    absences: record?.absences ?? pendingField(),
    notes: record?.notes ?? '',
    state: captureState(record),
    complete: isComplete(record),
  };
}

/** Captura por asignatura: una fila por alumno del grupo. */
export function rowsBySubject(state, { groupId, subjectId, periodId }) {
  const subject = state.catalogs.subjects.find((s) => s.id === subjectId);
  if (!subject) return [];
  return state.students
    .filter((s) => s.groupId === groupId && s.cycle === state.activeCycle && s.levelId === subject.levelId)
    .sort(sortByName)
    .map((student) => rowFor(state, student, subject, periodId));
}

/** Captura por alumno: una fila por asignatura que imparte el docente en el nivel del alumno. */
export function rowsByStudent(state, { studentId, teacherId, periodId }) {
  const student = state.students.find((s) => s.id === studentId);
  const teacher = state.catalogs.teachers.find((t) => t.id === teacherId);
  if (!student || !teacher) return [];
  return state.catalogs.subjects
    .filter((s) => s.levelId === student.levelId && teacher.subjectIds.includes(s.id))
    .map((subject) => rowFor(state, student, subject, periodId));
}

export function studentsOfGroup(state, groupId) {
  return state.students.filter((s) => s.groupId === groupId && s.cycle === state.activeCycle).sort(sortByName);
}

/**
 * Guarda una fila a partir del texto capturado. Devuelve { ok, record } o { ok:false, errors: { grade?, absences?, general? } }.
 * Texto vacío = pendiente; "SD" = desconocido; "0" = valor cero.
 */
export function saveCapture(store, { studentId, subjectId, periodId, teacherId, gradeText, absencesText, notes }) {
  const g = parseGradeInput(gradeText, store.state.scale);
  const a = parseAbsencesInput(absencesText);
  const errors = {};
  if (!g.ok) errors.grade = g.error;
  if (!a.ok) errors.absences = a.error;
  if (Object.keys(errors).length) return { ok: false, errors };
  const res = store.upsertRecord({ studentId, subjectId, periodId, teacherId, grade: g.field, absences: a.field, notes });
  if (!res.ok) return { ok: false, errors: { general: res.errors.join(' ') } };
  return { ok: true, record: res.record };
}
