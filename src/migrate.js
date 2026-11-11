// Migración del esquema 1 → 2: la calculadora solo atiende Primaria y Secundaria.
// Se eliminan los niveles no admitidos (CCH, universidad, preescolar, personalizados) y todo lo que dependía de ellos.
// Nunca se hace en silencio: quien llama conserva una copia del documento original y avisa de lo retirado.
import { ALLOWED_LEVELS } from './catalogs.js';

const empty = () => ({ levels: 0, groups: 0, subjects: 0, teachers: 0, students: 0, records: 0 });

/** Quita niveles no admitidos de `data` ({catalogs, students, records: objeto o arreglo}). Muta y devuelve el conteo. */
export function stripUnsupportedLevels(data) {
  const removed = empty();
  const c = data.catalogs;
  const allowed = new Set(ALLOWED_LEVELS);
  const dropLevels = new Set(c.levels.filter((l) => !allowed.has(l.id)).map((l) => l.id));
  if (!dropLevels.size) return removed;

  removed.levels = dropLevels.size;
  const keep = (arr, pred, key) => { const n = arr.length; const out = arr.filter(pred); removed[key] = n - out.length; return out; };
  c.groups = keep(c.groups, (g) => !dropLevels.has(g.levelId), 'groups');
  const dropSubjects = new Set(c.subjects.filter((s) => dropLevels.has(s.levelId)).map((s) => s.id));
  c.subjects = keep(c.subjects, (s) => !dropLevels.has(s.levelId), 'subjects');
  const dropStudents = new Set(data.students.filter((s) => dropLevels.has(s.levelId)).map((s) => s.id));
  data.students = keep(data.students, (s) => !dropLevels.has(s.levelId), 'students');
  c.levels = c.levels.filter((l) => !dropLevels.has(l.id));

  const isArr = Array.isArray(data.records);
  const list = isArr ? data.records : Object.values(data.records);
  const survivors = list.filter((r) => !dropStudents.has(r.studentId) && !dropSubjects.has(r.subjectId));
  removed.records = list.length - survivors.length;
  data.records = isArr ? survivors : Object.fromEntries(survivors.map((r) => [r.key, r]));

  // Docentes: se les quitan los niveles/asignaturas retirados; se eliminan solo si quedan sin nivel y sin registros.
  const used = new Set(survivors.map((r) => r.teacherId));
  c.teachers = c.teachers.flatMap((t) => {
    const levelIds = t.levelIds.filter((l) => !dropLevels.has(l));
    if (!levelIds.length && !used.has(t.id)) { removed.teachers++; return []; }
    return [{ ...t, levelIds: levelIds.length ? levelIds : t.levelIds.filter((l) => !dropLevels.has(l)), subjectIds: t.subjectIds.filter((s) => !dropSubjects.has(s)) }];
  });
  return removed;
}

export function describeRemoved(r) {
  const parts = [['nivel', 'niveles', r.levels], ['grupo', 'grupos', r.groups], ['asignatura', 'asignaturas', r.subjects], ['docente', 'docentes', r.teachers], ['alumno', 'alumnos', r.students], ['registro', 'registros', r.records]]
    .filter(([, , n]) => n > 0).map(([one, many, n]) => `${n} ${n === 1 ? one : many}`);
  return parts.join(', ');
}
