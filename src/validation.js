// Captura y validaciones. Convierte texto del usuario en campos tipados y valida la integridad de registros.
import { FIELD, pendingField, unknownField, valueField, isValidField } from './models.js';

export const DEFAULT_SCALE = Object.freeze({ min: 0, max: 10, decimals: 2 });

const UNKNOWN_RE = /^(sd|s\/d|\?|desconocido)$/i;

/**
 * Texto -> campo. Vacío = pendiente; "SD" o "?" = desconocido; número = valor (el 0 es un valor).
 * La escala es configurable: no se asume una regla institucional.
 */
export function parseGradeInput(text, scale = DEFAULT_SCALE) {
  const t = String(text ?? '').trim();
  if (t === '') return { ok: true, field: pendingField() };
  if (UNKNOWN_RE.test(t)) return { ok: true, field: unknownField() };
  if (/^-/.test(t)) return { ok: false, error: 'La calificación no puede ser negativa.' };
  const n = t.replace(',', '.');
  if (!/^\d+(\.\d+)?$/.test(n)) {
    return { ok: false, error: 'Escribe un número (por ejemplo 8.5), "SD" si el dato se desconoce, o deja vacío si aún está pendiente.' };
  }
  const decimals = (n.split('.')[1] ?? '').length;
  if (decimals > scale.decimals) return { ok: false, error: `Usa máximo ${scale.decimals} decimales.` };
  const v = Number(n);
  if (v < scale.min || v > scale.max) return { ok: false, error: `La calificación debe estar entre ${scale.min} y ${scale.max}.` };
  return { ok: true, field: valueField(v) };
}

export function parseAbsencesInput(text) {
  const t = String(text ?? '').trim();
  if (t === '') return { ok: true, field: pendingField() };
  if (UNKNOWN_RE.test(t)) return { ok: true, field: unknownField() };
  if (!/^\d+$/.test(t)) return { ok: false, error: 'Las faltas deben ser un número entero (0 o más).' };
  const v = Number(t);
  if (v > 999) return { ok: false, error: 'Las faltas no pueden exceder 999.' };
  return { ok: true, field: valueField(v) };
}

/** Texto para mostrar en un input a partir de un campo. */
export function fieldToInput(f) {
  if (f.status === FIELD.VALUE) return String(f.value);
  if (f.status === FIELD.UNKNOWN) return 'SD';
  return '';
}

/**
 * Integridad referencial y de correspondencia de un registro contra el estado.
 * Verifica alumno, ciclo, nivel, grupo, asignatura y periodo. Devuelve lista de mensajes (vacía = válido).
 */
export function validateRecord(state, rec) {
  const errors = [];
  const c = state.catalogs;
  const student = state.students.find((s) => s.id === rec.studentId);
  const subject = c.subjects.find((s) => s.id === rec.subjectId);
  const teacher = c.teachers.find((t) => t.id === rec.teacherId);
  const period = c.periods.find((p) => p.id === rec.periodId);
  if (!student) errors.push(`Alumno inexistente: ${rec.studentId}`);
  if (!subject) errors.push(`Asignatura inexistente: ${rec.subjectId}`);
  if (!teacher) errors.push(`Docente inexistente: ${rec.teacherId}`);
  if (!period) errors.push(`Periodo inexistente: ${rec.periodId}`);
  if (!rec.cycle) errors.push('El registro no tiene ciclo escolar.');
  if (student) {
    if (rec.cycle !== student.cycle) errors.push(`El ciclo del registro (${rec.cycle}) no coincide con el del alumno (${student.cycle}).`);
    if (rec.groupId !== student.groupId) errors.push('El grupo del registro no coincide con el del alumno.');
    if (subject && subject.levelId !== student.levelId) errors.push('La asignatura no corresponde al nivel del alumno.');
  }
  if (!isValidField(rec.grade)) errors.push('Calificación con formato inválido.');
  else if (rec.grade.status === FIELD.VALUE && (rec.grade.value < state.scale.min || rec.grade.value > state.scale.max)) {
    errors.push(`Calificación fuera de la escala (${state.scale.min}–${state.scale.max}).`);
  }
  if (!isValidField(rec.absences)) errors.push('Faltas con formato inválido.');
  else if (rec.absences.status === FIELD.VALUE && (!Number.isInteger(rec.absences.value) || rec.absences.value < 0)) {
    errors.push('Las faltas deben ser un entero no negativo.');
  }
  return errors;
}
