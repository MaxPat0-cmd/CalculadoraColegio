// Motor de evaluación configurable.
//
// IMPORTANTE (v0.1): NO existen reglas institucionales validadas. Este módulo solo define el contrato para
// incorporarlas después. Por defecto cada nivel usa "captura directa": se muestra lo capturado y NADA se calcula.
// Una calificación calculada se distingue siempre de una capturada y jamás se presenta como oficial
// salvo que su regla esté marcada explícitamente como validada.

import { FIELD } from './models.js';

export const RESULT_KIND = Object.freeze({
  CAPTURED: 'capturada',
  CALCULATED: 'calculada',
  NONE: 'sin-resultado',
});

/**
 * Contrato de una regla:
 *  { id, name, validated: boolean, compute({ student, subject, records, params }) -> { value:number, details?:any } | null }
 */
export class RuleRegistry {
  constructor() {
    this.rules = new Map();
    this.assignments = new Map(); // levelId -> { ruleId, params }
  }

  register(rule) {
    if (!rule || !rule.id || typeof rule.compute !== 'function') throw new Error('Regla inválida: requiere id y compute().');
    this.rules.set(rule.id, { validated: false, name: rule.id, ...rule });
    return this;
  }

  assign(levelId, ruleId, params = {}) {
    if (!this.rules.has(ruleId)) throw new Error(`Regla no registrada: ${ruleId}`);
    this.assignments.set(levelId, { ruleId, params });
  }

  unassign(levelId) {
    this.assignments.delete(levelId);
  }

  ruleFor(levelId) {
    const a = this.assignments.get(levelId);
    return a ? { rule: this.rules.get(a.ruleId), params: a.params } : null;
  }

  /** Estado legible para mostrar en la interfaz. */
  describe(levelId) {
    const r = this.ruleFor(levelId);
    if (!r) return { ruleId: null, name: 'Captura directa (sin regla validada)', validated: false };
    return { ruleId: r.rule.id, name: r.rule.name, validated: r.rule.validated === true };
  }
}

/**
 * Resultado de una asignatura a partir de sus registros (uno por periodo).
 * Sin regla asignada -> solo valores capturados, sin calcular nada.
 */
export function evaluateSubject(registry, { student, subject, records }) {
  const captured = records.filter((r) => r.grade.status === FIELD.VALUE);
  const assigned = registry.ruleFor(student.levelId);
  if (!assigned) {
    return { kind: captured.length ? RESULT_KIND.CAPTURED : RESULT_KIND.NONE, official: false, value: null, ruleId: null, label: 'Calificaciones capturadas por periodo (sin cálculo)' };
  }
  const out = assigned.rule.compute({ student, subject, records, params: assigned.params });
  if (!out || typeof out.value !== 'number' || !Number.isFinite(out.value)) {
    return { kind: RESULT_KIND.NONE, official: false, value: null, ruleId: assigned.rule.id, label: 'Datos insuficientes para calcular' };
  }
  const official = assigned.rule.validated === true;
  return {
    kind: RESULT_KIND.CALCULATED,
    official,
    value: out.value,
    ruleId: assigned.rule.id,
    details: out.details ?? null,
    label: official ? `Calculada con regla validada «${assigned.rule.name}»` : `Calculada — NO OFICIAL (regla «${assigned.rule.name}» sin validar)`,
  };
}

export function createDefaultRegistry() {
  // Intencionalmente vacío: ninguna regla definitiva es conocida todavía.
  return new RuleRegistry();
}
