// Respaldos (exportar/importar) con detección de conflictos. Nunca sobrescribe en silencio:
// primero se genera un PLAN (nuevo / idéntico / conflicto) y solo se aplica lo que el usuario decide.
import { SCHEMA_VERSION, APP_VERSION, stableStringify, recordContentEqual } from './models.js';
import { validateRecord } from './validation.js';
import { stripUnsupportedLevels, describeRemoved } from './migrate.js';

export const BACKUP_FORMAT = 'calculadora-academica-alzate-backup';

const ENTITIES = ['levels', 'periods', 'subjects', 'groups', 'teachers', 'students', 'records'];

export function checksum(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

function dataOf(state) {
  return {
    institution: state.institution,
    cycles: state.cycles,
    activeCycle: state.activeCycle,
    scale: state.scale,
    catalogs: state.catalogs,
    students: state.students,
    records: Object.values(state.records).sort((a, b) => a.key.localeCompare(b.key)),
  };
}

export function createBackup(state, now = new Date()) {
  const data = JSON.parse(JSON.stringify(dataOf(state)));
  return {
    format: BACKUP_FORMAT,
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    exportedAt: now.toISOString(),
    demo: state.demo === true,
    checksum: checksum(stableStringify(data)),
    data,
  };
}

export const serializeBackup = (backup) => JSON.stringify(backup, null, 2);

export function parseBackup(text) {
  let b;
  try { b = JSON.parse(text); } catch { return { ok: false, errors: ['El archivo no es un JSON válido.'] }; }
  const errors = [];
  if (!b || b.format !== BACKUP_FORMAT) errors.push('El archivo no es un respaldo de la Calculadora Académica Alzate.');
  else {
    if (b.schemaVersion !== SCHEMA_VERSION && b.schemaVersion !== 1) errors.push(`Versión de esquema no soportada: ${b.schemaVersion} (se esperaba ${SCHEMA_VERSION}).`);
    const d = b.data;
    if (!d || !d.catalogs || !Array.isArray(d.students) || !Array.isArray(d.records)) errors.push('El respaldo está incompleto.');
    else {
      for (const k of ['levels', 'periods', 'subjects', 'groups', 'teachers']) if (!Array.isArray(d.catalogs[k])) errors.push(`Falta el catálogo «${k}».`);
      if (!errors.length && checksum(stableStringify(d)) !== b.checksum) errors.push('La suma de verificación no coincide: el respaldo fue modificado o está dañado.');
    }
  }
  if (errors.length) return { ok: false, errors };
  let migratedNote = null;
  if (b.schemaVersion === 1) { // respaldo de la versión anterior: se retiran niveles no admitidos antes de planear
    const removed = stripUnsupportedLevels(b.data);
    b.schemaVersion = SCHEMA_VERSION;
    migratedNote = describeRemoved(removed);
  }
  return { ok: true, backup: b, migratedNote };
}

const sameJson = (a, b) => stableStringify(a) === stableStringify(b);

function entityMap(state, name) {
  if (name === 'students') return new Map(state.students.map((x) => [x.id, x]));
  if (name === 'records') return new Map(Object.values(state.records).map((x) => [x.key, x]));
  return new Map(state.catalogs[name].map((x) => [x.id, x]));
}

const labelOf = (name, item) => {
  if (name === 'records') return `${item.studentId} · ${item.subjectId} · ${item.periodId} · ${item.cycle}`;
  if (name === 'students') return `${item.id} · ${item.name}`;
  return item.name ?? item.id;
};

/** Compara el respaldo contra el estado actual sin modificar nada. */
export function planImport(state, backup) {
  const d = backup.data;
  const entries = [];
  const errors = [];
  for (const name of ENTITIES) {
    const cur = entityMap(state, name);
    const incoming = name === 'students' ? d.students : name === 'records' ? d.records : d.catalogs[name];
    for (const item of incoming) {
      const id = name === 'records' ? item.key : item.id;
      const existing = cur.get(id) ?? null;
      let status = 'nuevo';
      if (existing) {
        const equal = name === 'records' ? recordContentEqual(existing, item) : sameJson(existing, item);
        status = equal ? 'identico' : 'conflicto';
      }
      entries.push({ entity: name, id, uid: `${name}:${id}`, status, incoming: item, existing, label: labelOf(name, item) });
    }
  }

  // Integridad referencial del propio respaldo + estado actual (los identificadores existen en la unión).
  const union = {
    scale: state.scale,
    catalogs: Object.fromEntries(['levels', 'periods', 'subjects', 'groups', 'teachers'].map((k) => [k, [...new Map([...state.catalogs[k], ...d.catalogs[k]].map((x) => [x.id, x])).values()]])),
    students: [...new Map([...state.students, ...d.students].map((x) => [x.id, x])).values()],
  };
  const incomingRecords = d.records;
  for (const r of incomingRecords) {
    const errs = validateRecord({ ...union, records: {} }, r);
    if (errs.length) errors.push(`Registro ${r.key}: ${errs.join(' ')}`);
  }
  const counts = { nuevo: 0, identico: 0, conflicto: 0 };
  entries.forEach((e) => { counts[e.status]++; });
  return { entries, counts, errors, backupInfo: { exportedAt: backup.exportedAt, appVersion: backup.appVersion, demo: backup.demo } };
}

/**
 * Aplica el plan sobre una COPIA del estado. `choices` es un objeto { uid: 'replace' | 'keep' } solo para
 * conflictos; sin decisión explícita se conserva lo existente. Si el resultado viola la integridad, no se aplica.
 */
export function applyImport(state, plan, choices = {}) {
  if (plan.errors.length) return { ok: false, errors: plan.errors };
  const next = JSON.parse(JSON.stringify(state));
  const summary = { added: 0, replaced: 0, kept: 0, identical: 0 };
  const put = (e) => {
    const item = JSON.parse(JSON.stringify(e.incoming));
    if (e.entity === 'records') next.records[item.key] = item;
    else if (e.entity === 'students') {
      const i = next.students.findIndex((s) => s.id === item.id);
      if (i >= 0) next.students[i] = item; else next.students.push(item);
    } else {
      const list = next.catalogs[e.entity];
      const i = list.findIndex((s) => s.id === item.id);
      if (i >= 0) list[i] = item; else list.push(item);
    }
  };
  for (const e of plan.entries) {
    if (e.status === 'identico') summary.identical++;
    else if (e.status === 'nuevo') { put(e); summary.added++; }
    else if (choices[e.uid] === 'replace' && !e.locked) { put(e); summary.replaced++; }
    else summary.kept++;
  }
  return { ok: true, state: next, summary };
}

/** Une los ciclos del respaldo y verifica la integridad completa del estado resultante. */
export function finalizeImport(next, backup) {
  next.cycles = [...new Set([...(next.cycles ?? []), ...(backup.data.cycles ?? [])])].sort();
  const errors = [];
  for (const r of Object.values(next.records)) {
    const errs = validateRecord(next, r);
    if (errs.length) errors.push(`Registro ${r.key}: ${errs.join(' ')}`);
  }
  return errors;
}
