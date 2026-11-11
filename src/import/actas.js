// Importación de actas (Excel/CSV): detecta columnas, interpreta alumnos y calificaciones y genera un PLAN
// con el mismo formato que la importación de respaldos (nuevo / idéntico / conflicto). Nada se escribe hasta aplicarlo,
// y los conflictos se conservan salvo decisión explícita. Las filas inválidas se omiten y se reportan con su número.
import { normalize, stableStringify, recordKey, createRecord, recordContentEqual, pendingField } from '../models.js';
import { parseGradeInput, parseAbsencesInput, validateRecord } from '../validation.js';
import { addCatalogItem, addStudent } from '../catalogs.js';

/** Campos que el importador entiende y los encabezados con que suelen venir en las actas. */
export const FIELDS = Object.freeze([
  { key: 'matricula', label: 'Matrícula', synonyms: ['matricula', 'cuenta', 'no de cuenta', 'num de cuenta', 'numero de cuenta', 'no cuenta', 'folio', 'clave', 'id', 'curp'] },
  { key: 'nombre', label: 'Alumno', synonyms: ['alumno', 'alumno a', 'alumnos', 'nombre', 'nombre del alumno', 'nombre completo', 'estudiante', 'nombres'] },
  { key: 'apellidos', label: 'Apellidos (opcional)', synonyms: ['apellidos', 'apellido', 'apellido paterno'] },
  { key: 'nivel', label: 'Nivel', synonyms: ['nivel', 'nivel educativo'] },
  { key: 'grupo', label: 'Grupo', synonyms: ['grupo', 'grado y grupo', 'grado grupo', 'grado'] },
  { key: 'asignatura', label: 'Asignatura', synonyms: ['asignatura', 'materia'] },
  { key: 'periodo', label: 'Periodo', synonyms: ['periodo', 'mes', 'bimestre', 'trimestre', 'parcial'] },
  { key: 'calificacion', label: 'Calificación', synonyms: ['calificacion', 'calif', 'cal', 'nota', 'puntaje'] },
  { key: 'faltas', label: 'Faltas', synonyms: ['faltas', 'inasistencias', 'ausencias', 'asistencia'] },
  { key: 'observaciones', label: 'Observaciones', synonyms: ['observaciones', 'observacion', 'notas', 'comentarios'] },
]);

const clean = (v) => (v === null || v === undefined ? '' : typeof v === 'number' ? String(Math.round(v * 10000) / 10000) : String(v).trim());
const headKey = (v) => normalize(clean(v)).replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** Fila de encabezados: la que más celdas reconocibles tiene (mínimo 2) entre las primeras 20. */
export function detectHeaderRow(rows) {
  let best = -1; let bestScore = 1;
  rows.slice(0, 20).forEach((row, i) => {
    const score = (row ?? []).filter((c) => { const k = headKey(c); return k && FIELDS.some((f) => f.synonyms.includes(k)); }).length;
    if (score > bestScore) { best = i; bestScore = score; }
  });
  return best;
}

/** { campo: índice de columna | -1 }; cada columna se usa una sola vez (prefiere coincidencia exacta). */
export function autoMap(headers) {
  const map = {}; const used = new Set();
  const keys = headers.map(headKey);
  for (const f of FIELDS) {
    const idx = keys.findIndex((k, i) => !used.has(i) && f.synonyms.includes(k));
    map[f.key] = idx;
    if (idx >= 0) used.add(idx);
  }
  return map;
}

/** Columnas no asignadas cuyo encabezado es el nombre de una asignatura del nivel (acta "ancha": una columna por materia). */
export function subjectColumns(headers, mapping, subjects) {
  const used = new Set(Object.values(mapping).filter((i) => i >= 0));
  const byName = new Map(subjects.map((s) => [normalize(s.name), s]));
  return headers.map((h, i) => ({ i, subject: byName.get(normalize(clean(h))) })).filter((x) => !used.has(x.i) && x.subject);
}

/** «4° A», «4A», «4.° A», «4 - A», «4o A» → { grade: 4, name: 'A' } */
export function parseGroupLabel(text) {
  const m = /^(\d{1,2})\s*(?:\.?\s*[°º]|o|er|do|to|vo|mo)?\.?\s*[-\s]?\s*([a-z][a-z0-9]{0,2})$/i.exec(clean(text).replace(/\s+/g, ' '));
  return m ? { grade: Number(m[1]), name: m[2].toUpperCase() } : null;
}

function findPeriod(state, text) {
  const k = normalize(clean(text)); if (!k) return null;
  const ps = state.catalogs.periods;
  return ps.find((p) => normalize(p.name) === k || p.id === k) ?? (/^\d+$/.test(k) ? ps.find((p) => normalize(p.name).endsWith(` ${k}`) || p.id === `p${k}`) : null) ?? null;
}
const findLevel = (state, text) => { const k = normalize(clean(text)); return state.catalogs.levels.find((l) => normalize(l.name) === k || l.id === k) ?? null; };
const findSubject = (state, levelId, text) => { const k = normalize(clean(text)); return state.catalogs.subjects.find((s) => s.levelId === levelId && normalize(s.name) === k) ?? null; };
const blankish = (t) => ['-', '—', '–', 'n/a', 'na'].includes(clean(t).toLowerCase());

/**
 * Construye el plan de importación.
 * table: filas (con encabezado). opts: { headerRow, mapping, levelId, groupId, subjectId, periodId, teacherId, cycle, createGroups }.
 */
export function buildImportPlan(state, rows, opts) {
  const { headerRow, mapping, createGroups = true } = opts;
  const cycle = opts.cycle || state.activeCycle;
  const headers = rows[headerRow] ?? [];
  const col = (r, key) => (mapping[key] >= 0 && mapping[key] !== undefined ? r[mapping[key]] : undefined);
  const draft = JSON.parse(JSON.stringify(state));
  const issues = []; const entries = [];
  const newGroups = new Map(); const students = new Map(); const records = new Map();
  const issue = (row, message) => issues.push({ row, message });

  const defaultLevel = opts.levelId ? state.catalogs.levels.find((l) => l.id === opts.levelId) : null;
  const wide = mapping.calificacion < 0 || mapping.calificacion === undefined ? subjectColumns(headers, mapping, state.catalogs.subjects.filter((s) => !defaultLevel || s.levelId === defaultLevel.id)) : [];
  const hasStudentInfo = mapping.nombre >= 0 || mapping.grupo >= 0 || mapping.nivel >= 0;
  if (mapping.matricula < 0 || mapping.matricula === undefined) return { entries: [], counts: { nuevo: 0, identico: 0, conflicto: 0 }, errors: ['Falta indicar la columna de Matrícula (o cuenta): es lo que identifica a cada alumno.'], rowIssues: [], summary: {} };
  if (!(mapping.calificacion >= 0) && !wide.length && !hasStudentInfo) return { entries: [], counts: { nuevo: 0, identico: 0, conflicto: 0 }, errors: ['No hay nada que importar: indica al menos la columna de Calificación, o de Alumno/Grupo para dar de alta alumnos.'], rowIssues: [], summary: {} };

  let dataRows = 0;
  for (let i = headerRow + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    if (!r.some((c) => clean(c) !== '')) continue;
    dataRows++;
    const rn = i + 1;
    const staged = { group: null, groupId: null, student: null, records: [] };
    const ok = (() => {
    const id = clean(col(r, 'matricula'));
    if (!id) { issue(rn, 'Falta la matrícula.'); return false; }
    if (!/^[A-Za-z0-9._-]+$/.test(id)) { issue(rn, `Matrícula inválida «${id}» (solo letras, números, punto, guion y guion bajo).`); return false; }

    const existing = state.students.find((s) => s.id === id) ?? null;
    let student = existing;
    // ---- Alumno ----
    if (hasStudentInfo) {
      const given = clean(col(r, 'nombre')); const fam = clean(col(r, 'apellidos'));
      const name = [fam, given].filter(Boolean).join(' ');
      const lvlText = clean(col(r, 'nivel'));
      const level = lvlText ? findLevel(draft, lvlText) : (existing ? draft.catalogs.levels.find((l) => l.id === existing.levelId) : defaultLevel);
      if (lvlText && !level) { issue(rn, `Nivel «${lvlText}» no existe (solo Primaria y Secundaria).`); return false; }
      let group = null;
      const gText = clean(col(r, 'grupo'));
      if (gText) {
        const g = parseGroupLabel(gText);
        if (!g) { issue(rn, `No se entiende el grupo «${gText}» (usa un formato como «4° A»).`); return false; }
        if (!level) { issue(rn, 'No se sabe el nivel del grupo: elige un nivel.'); return false; }
        group = draft.catalogs.groups.find((x) => x.levelId === level.id && x.grade === g.grade && normalize(x.name) === normalize(g.name)) ?? null;
        if (!group) {
          if (!createGroups) { issue(rn, `El grupo «${gText}» no existe en ${level.name}.`); return false; }
          const res = addCatalogItem(draft, 'groups', { name: g.name, levelId: level.id, grade: g.grade });
          if (!res.ok) { issue(rn, res.error); return false; }
          group = res.item; staged.groupId = group.id; staged.group = group;
        }
      } else if (opts.groupId) group = draft.catalogs.groups.find((x) => x.id === opts.groupId) ?? null;
      else if (existing) group = draft.catalogs.groups.find((x) => x.id === existing.groupId) ?? null;
      if (!existing && (!name || !group)) { issue(rn, !name ? 'Falta el nombre del alumno.' : 'Falta el grupo: indica la columna o elige un grupo.'); return false; }
      if (group && level && group.levelId !== level.id) { issue(rn, 'El grupo no pertenece al nivel indicado.'); return false; }
      const incoming = { id, name: name || existing.name, levelId: (group ?? existing)?.levelId ?? level.id, grade: group ? group.grade : existing.grade, groupId: group ? group.id : existing.groupId, cycle: existing ? existing.cycle : cycle };
      if (!students.has(id)) staged.student = { incoming, row: rn };
      else if (stableStringify(students.get(id).incoming) !== stableStringify(incoming)) { issue(rn, `La matrícula ${id} aparece con datos distintos en otra fila; se usa la primera.`); }
      student = (students.get(id) ?? staged.student).incoming;
    } else if (!existing) { issue(rn, `La matrícula ${id} no existe. Importa primero una lista con nombres y grupos, o agrégala en Ajustes.`); return false; }

    // ---- Registros ----
    const levelId = student.levelId;
    const jobs = [];
    const periodText = clean(col(r, 'periodo'));
    const period = periodText ? findPeriod(state, periodText) : (opts.periodId ? state.catalogs.periods.find((p) => p.id === opts.periodId) : null);
    const wantsRecords = mapping.calificacion >= 0 || wide.length;
    if (wantsRecords) {
      if (!period) { issue(rn, periodText ? `Periodo «${periodText}» no existe.` : 'Falta el periodo: indica la columna o elige un periodo.'); return false; }
      if (mapping.calificacion >= 0) {
        const sText = clean(col(r, 'asignatura'));
        const subject = sText ? findSubject(state, levelId, sText) : state.catalogs.subjects.find((s) => s.id === opts.subjectId && s.levelId === levelId);
        if (!subject) { issue(rn, sText ? `Asignatura «${sText}» no existe en ${draft.catalogs.levels.find((l) => l.id === levelId)?.name}.` : 'Falta la asignatura: indica la columna o elige una asignatura de este nivel.'); return false; }
        jobs.push({ subject, gradeRaw: col(r, 'calificacion'), absRaw: col(r, 'faltas') });
      } else {
        for (const w of wide) if (w.subject.levelId === levelId) jobs.push({ subject: w.subject, gradeRaw: r[w.i], absRaw: undefined });
      }
    }
    let bad = false;
    for (const job of jobs) {
      const g = parseGradeInput(blankish(job.gradeRaw) ? '' : clean(job.gradeRaw), state.scale);
      const a = parseAbsencesInput(blankish(job.absRaw) ? '' : clean(job.absRaw));
      if (!g.ok) { issue(rn, `Calificación de ${job.subject.name}: ${g.error}`); bad = true; continue; }
      if (!a.ok) { issue(rn, `Faltas de ${job.subject.name}: ${a.error}`); bad = true; continue; }
      if (g.field.status === 'pendiente' && a.field.status === 'pendiente') continue; // nada que registrar (no es un error)
      const teacher = state.catalogs.teachers.find((t) => t.id === opts.teacherId && t.levelIds.includes(levelId))
        ?? state.catalogs.teachers.find((t) => t.levelIds.includes(levelId) && t.subjectIds.includes(job.subject.id));
      if (!teacher) { issue(rn, `No hay docente para ${job.subject.name}: elige uno o asígnalo en Ajustes.`); bad = true; continue; }
      const stud = existing ?? student;
      if (existing && existing.cycle !== cycle) { issue(rn, `El alumno ${id} pertenece al ciclo ${existing.cycle}, no a ${cycle}.`); bad = true; continue; }
      const rec = createRecord({
        studentId: id, subjectId: job.subject.id, teacherId: teacher.id, periodId: period.id, cycle: stud.cycle, groupId: stud.groupId,
        grade: g.field, absences: a.field, notes: clean(col(r, 'observaciones')),
      });
      staged.records.push({ rec, row: rn, subject: job.subject, period });
    }
    if (bad) return false; // cualquier problema en la fila la omite completa (sin altas parciales)
      return true;
    })();
    if (!ok) { // fila inválida: se omite completa (también se deshace el grupo que hubiera creado)
      if (staged.group) draft.catalogs.groups = draft.catalogs.groups.filter((g) => g.id !== staged.group.id);
      continue;
    }
    if (staged.group) newGroups.set(staged.group.id, staged.group);
    if (staged.student) students.set(staged.student.incoming.id, staged.student);
    for (const x of staged.records) {
      if (records.has(x.rec.key)) issue(rn, `Fila repetida para ${x.rec.studentId} · ${x.subject.name} · ${x.period.name}; se usa la última.`);
      records.set(x.rec.key, { rec: x.rec, row: rn });
    }
  }

  // ---- Validación contra un estado borrador (con grupos y alumnos nuevos) ----
  for (const [, { incoming }] of students) {
    if (state.students.some((s) => s.id === incoming.id)) continue;
    const res = addStudent(draft, incoming);
    if (!res.ok) { issue(students.get(incoming.id).row, res.error); students.delete(incoming.id); }
  }
  for (const [key, { rec, row }] of [...records]) {
    const errs = validateRecord(draft, rec);
    if (errs.length) { issue(row, errs.join(' ')); records.delete(key); }
  }

  // ---- Entradas del plan ----
  const label = (n, item) => (n === 'records' ? `${item.studentId} · ${item.subjectId} · ${item.periodId}` : n === 'students' ? `${item.id} · ${item.name}` : `${item.grade}.° ${item.name}`);
  for (const g of newGroups.values()) entries.push({ entity: 'groups', id: g.id, uid: `groups:${g.id}`, status: 'nuevo', incoming: g, existing: null, label: label('groups', g) });
  const recordedStudents = new Set([...records.values()].map((x) => x.rec.studentId));
  for (const [id, { incoming }] of students) {
    const existing = state.students.find((s) => s.id === id) ?? null;
    let status = 'nuevo'; let locked = false; let reason = '';
    if (existing) {
      status = stableStringify(existing) === stableStringify(incoming) ? 'identico' : 'conflicto';
      if (status === 'conflicto') {
        const hasRecs = Object.values(state.records).some((x) => x.studentId === id) || recordedStudents.has(id);
        if (hasRecs && (existing.levelId !== incoming.levelId || existing.groupId !== incoming.groupId || existing.cycle !== incoming.cycle)) { locked = true; reason = 'Tiene calificaciones: no se puede cambiar su nivel, grupo o ciclo.'; }
      }
    }
    entries.push({ entity: 'students', id, uid: `students:${id}`, status, incoming, existing, label: label('students', incoming), locked, reason });
  }
  for (const [key, { rec }] of records) {
    const existing = state.records[key] ?? null;
    const status = !existing ? 'nuevo' : recordContentEqual(existing, rec) ? 'identico' : 'conflicto';
    entries.push({ entity: 'records', id: key, uid: `records:${key}`, status, incoming: rec, existing, label: label('records', rec) });
  }
  const counts = { nuevo: 0, identico: 0, conflicto: 0 };
  entries.forEach((e) => { counts[e.status]++; });
  void pendingField;
  return {
    entries, counts, errors: [], rowIssues: issues.sort((a, b) => a.row - b.row),
    summary: { dataRows, students: students.size, records: records.size, newGroups: newGroups.size, skipped: new Set(issues.map((x) => x.row)).size },
    backupInfo: { exportedAt: new Date().toISOString(), appVersion: 'acta', demo: false },
  };
}
