// Consolidación: reúne los resultados de un alumno en todas sus asignaturas verificando que cada registro
// corresponda al alumno, ciclo, nivel, grupo, asignatura y periodo. Los registros que no coinciden se EXCLUYEN
// y se reportan como incidencias; nunca se mezclan con el ciclo/grupo vigente.
import { FIELD, captureState, isComplete, normalize, pendingField } from './models.js';
import { validateRecord } from './validation.js';
import { evaluateSubject, createDefaultRegistry } from './evaluation.js';

export function consolidateStudent(state, studentId, { cycle, registry = createDefaultRegistry() } = {}) {
  const student = state.students.find((s) => s.id === studentId);
  if (!student) throw new Error(`Alumno inexistente: ${studentId}`);
  const targetCycle = cycle ?? student.cycle;
  const { subjects, periods, teachers } = state.catalogs;
  const levelSubjects = subjects.filter((s) => s.levelId === student.levelId);

  const valid = new Map(); // `${subjectId}|${periodId}` -> record
  const issues = [];
  for (const rec of Object.values(state.records)) {
    if (rec.studentId !== studentId) continue;
    if (rec.cycle !== targetCycle) {
      issues.push({ type: 'otro-ciclo', key: rec.key, message: `Registro del ciclo ${rec.cycle} excluido (se consolida el ciclo ${targetCycle}).` });
      continue;
    }
    const errors = validateRecord(state, rec);
    if (errors.length) {
      issues.push({ type: 'inconsistente', key: rec.key, message: `Registro excluido: ${errors.join(' ')}` });
      continue;
    }
    valid.set(`${rec.subjectId}|${rec.periodId}`, rec);
  }

  const rows = [];
  for (const subject of levelSubjects) {
    for (const period of periods) {
      const record = valid.get(`${subject.id}|${period.id}`) ?? null;
      rows.push({
        subject, period, record,
        teacher: record ? teachers.find((t) => t.id === record.teacherId) ?? null : null,
        grade: record?.grade ?? pendingField(),
        absences: record?.absences ?? pendingField(),
        notes: record?.notes ?? '',
        state: captureState(record),
        complete: isComplete(record),
      });
    }
  }

  const summary = {
    expected: rows.length,
    complete: rows.filter((r) => r.complete).length,
    pendingGrades: rows.filter((r) => r.grade.status === FIELD.PENDING).length,
    unknownGrades: rows.filter((r) => r.grade.status === FIELD.UNKNOWN).length,
    missingAbsences: rows.filter((r) => r.absences.status !== FIELD.VALUE).length,
  };
  summary.incomplete = summary.expected - summary.complete;

  const evaluations = levelSubjects.map((subject) => ({
    subject,
    result: evaluateSubject(registry, { student, subject, records: rows.filter((r) => r.subject.id === subject.id && r.record).map((r) => r.record) }),
  }));

  return { student, cycle: targetCycle, rows, summary, issues, evaluations };
}

/** Lista para el panel de Control Escolar: filtra y resume a cada alumno. */
export function searchStudents(state, { query = '', levelId = '', groupId = '', cycle = '', onlyIncomplete = false } = {}) {
  const q = normalize(query);
  return state.students
    .filter((s) => (!cycle || s.cycle === cycle) && (!levelId || s.levelId === levelId) && (!groupId || s.groupId === groupId))
    .filter((s) => !q || normalize(s.id).includes(q) || normalize(s.name).includes(q))
    .map((student) => ({ student, ...consolidateStudent(state, student.id, { cycle: student.cycle }) }))
    .filter((c) => !onlyIncomplete || c.summary.incomplete > 0 || c.issues.length > 0);
}
