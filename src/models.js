// Modelos de datos y utilidades puras. Sin dependencias del navegador.

export const SCHEMA_VERSION = 1;
export const APP_VERSION = '1.4.0';

/** Estados posibles de un campo capturable (calificación o faltas). */
export const FIELD = Object.freeze({
  PENDING: 'pendiente', // aún no se captura
  UNKNOWN: 'desconocido', // se sabe que falta el dato (p. ej. "SD"), distinto de pendiente
  VALUE: 'valor', // valor numérico capturado (incluye el 0)
});

export const pendingField = () => ({ status: FIELD.PENDING, value: null });
export const unknownField = () => ({ status: FIELD.UNKNOWN, value: null });
export const valueField = (n) => ({ status: FIELD.VALUE, value: n });

export function isValidField(f) {
  if (!f || typeof f !== 'object') return false;
  if (f.status === FIELD.VALUE) return typeof f.value === 'number' && Number.isFinite(f.value);
  return (f.status === FIELD.PENDING || f.status === FIELD.UNKNOWN) && f.value === null;
}

export function fieldsEqual(a, b) {
  return a.status === b.status && a.value === b.value;
}

/** Texto legible de un campo. El cero se muestra como "0", nunca como pendiente. */
export function formatField(f, labels = {}) {
  if (f.status === FIELD.VALUE) return String(f.value);
  if (f.status === FIELD.UNKNOWN) return labels.unknown ?? 'Desconocido';
  return labels.pending ?? 'Pendiente';
}

/** Clave natural única de un registro: impide duplicados por construcción. */
export function recordKey({ cycle, studentId, subjectId, periodId }) {
  return [cycle, studentId, subjectId, periodId].join('|');
}

/** Estado de captura derivado de la calificación. */
export function captureState(record) {
  if (!record) return FIELD.PENDING;
  if (record.grade.status === FIELD.VALUE) return 'capturado';
  return record.grade.status; // 'pendiente' | 'desconocido'
}

/** Un registro está completo si calificación y faltas tienen un valor numérico. */
export function isComplete(record) {
  return !!record && record.grade.status === FIELD.VALUE && record.absences.status === FIELD.VALUE;
}

export function createRecord(input, now = new Date()) {
  const ts = now.toISOString();
  const rec = {
    key: recordKey(input),
    studentId: input.studentId,
    subjectId: input.subjectId,
    teacherId: input.teacherId,
    periodId: input.periodId,
    cycle: input.cycle,
    groupId: input.groupId,
    grade: input.grade ?? pendingField(),
    absences: input.absences ?? pendingField(),
    notes: (input.notes ?? '').trim(),
    createdAt: input.createdAt ?? ts,
    updatedAt: ts,
  };
  return rec;
}

/** Comparación de contenido (ignora marcas de tiempo). */
export function recordContentEqual(a, b) {
  return (
    a.key === b.key &&
    a.teacherId === b.teacherId &&
    a.groupId === b.groupId &&
    fieldsEqual(a.grade, b.grade) &&
    fieldsEqual(a.absences, b.absences) &&
    (a.notes ?? '') === (b.notes ?? '')
  );
}

export function stableStringify(v) {
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  if (v && typeof v === 'object') {
    return '{' + Object.keys(v).sort().map((k) => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
  }
  return JSON.stringify(v);
}

/** Normaliza texto para búsquedas sin acentos ni mayúsculas. */
export function normalize(s) {
  return String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}
