// Catálogos académicos editables (niveles, grupos, docentes, asignaturas, periodos) y alumnos.
// Funciones puras sobre el estado: devuelven { ok, error?, item? } y no tocan almacenamiento.
import { normalize } from './models.js';

export const LEVELS = Object.freeze([
  { id: 'primaria', name: 'Primaria' },
  { id: 'secundaria', name: 'Secundaria' },
  { id: 'cch', name: 'CCH' },
]);

export const CATALOG_KINDS = ['groups', 'teachers', 'subjects', 'periods'];

const ID_RE = /^[A-Za-z0-9._-]+$/; // sin "|" ni espacios: se usan dentro de claves compuestas

export function slug(text) {
  return normalize(text).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
}

export function uniqueId(existingIds, base) {
  const set = new Set(existingIds);
  if (!set.has(base)) return base;
  let i = 2;
  while (set.has(`${base}-${i}`)) i++;
  return `${base}-${i}`;
}

const fail = (error) => ({ ok: false, error });

function levelExists(state, id) {
  return state.catalogs.levels.some((l) => l.id === id);
}

function validateItem(state, kind, item) {
  const name = String(item.name ?? '').trim();
  if (!name) return 'El nombre es obligatorio.';
  switch (kind) {
    case 'groups':
      if (!levelExists(state, item.levelId)) return 'Elige un nivel válido.';
      if (!Number.isInteger(item.grade) || item.grade < 1 || item.grade > 12) return 'El grado debe ser un entero entre 1 y 12.';
      break;
    case 'subjects':
      if (!levelExists(state, item.levelId)) return 'Elige un nivel válido.';
      break;
    case 'teachers':
      if (!Array.isArray(item.levelIds) || !item.levelIds.length) return 'Elige al menos un nivel para el docente.';
      if (!item.levelIds.every((l) => levelExists(state, l))) return 'Nivel inválido.';
      if (!Array.isArray(item.subjectIds)) return 'Las asignaturas del docente son inválidas.';
      for (const sid of item.subjectIds) {
        const s = state.catalogs.subjects.find((x) => x.id === sid);
        if (!s) return `Asignatura inexistente: ${sid}`;
        if (!item.levelIds.includes(s.levelId)) return `La asignatura «${s.name}» no pertenece a los niveles del docente.`;
      }
      break;
    default:
  }
  return null;
}

export function addCatalogItem(state, kind, input) {
  if (!CATALOG_KINDS.includes(kind)) return fail('Catálogo desconocido.');
  const list = state.catalogs[kind];
  const item = { ...input, name: String(input.name ?? '').trim() };
  const err = validateItem(state, kind, item);
  if (err) return fail(err);
  const prefix = { groups: 'g', teachers: 't', subjects: 's', periods: 'p' }[kind];
  const base = item.id ? String(item.id) : `${prefix}-${slug(kind === 'groups' ? `${item.levelId}-${item.grade}${item.name}` : item.name)}`;
  if (!ID_RE.test(base)) return fail('El identificador solo admite letras, números, punto, guion y guion bajo.');
  if (item.id && list.some((x) => x.id === base)) return fail(`Ya existe un elemento con el identificador ${base}.`);
  item.id = item.id ? base : uniqueId(list.map((x) => x.id), base);
  list.push(item);
  return { ok: true, item };
}

export function updateCatalogItem(state, kind, id, patch) {
  const list = state.catalogs[kind];
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return fail('Elemento no encontrado.');
  const next = { ...list[idx], ...patch, id };
  if (typeof next.name === 'string') next.name = next.name.trim();
  const err = validateItem(state, kind, next);
  if (err) return fail(err);
  // Cambiar el nivel de algo con registros asociados rompería la correspondencia.
  if ((kind === 'subjects' || kind === 'groups') && next.levelId !== list[idx].levelId) {
    const used = kind === 'subjects'
      ? Object.values(state.records).some((r) => r.subjectId === id)
      : state.students.some((s) => s.groupId === id);
    if (used) return fail('No se puede cambiar el nivel: ya tiene alumnos o registros asociados.');
  }
  if (kind === 'groups' && next.grade !== list[idx].grade && state.students.some((s) => s.groupId === id)) {
    return fail('No se puede cambiar el grado de un grupo con alumnos.');
  }
  list[idx] = next;
  return { ok: true, item: next };
}

export function removeCatalogItem(state, kind, id) {
  const list = state.catalogs[kind];
  const idx = list.findIndex((x) => x.id === id);
  if (idx < 0) return fail('Elemento no encontrado.');
  const recs = Object.values(state.records);
  if (kind === 'groups' && state.students.some((s) => s.groupId === id)) return fail('El grupo tiene alumnos; reasígnalos o elimínalos primero.');
  if (kind === 'subjects' && recs.some((r) => r.subjectId === id)) return fail('La asignatura tiene calificaciones registradas.');
  if (kind === 'teachers' && recs.some((r) => r.teacherId === id)) return fail('El docente tiene calificaciones registradas.');
  if (kind === 'periods' && recs.some((r) => r.periodId === id)) return fail('El periodo tiene calificaciones registradas.');
  list.splice(idx, 1);
  if (kind === 'subjects') state.catalogs.teachers.forEach((t) => { t.subjectIds = t.subjectIds.filter((s) => s !== id); });
  return { ok: true };
}

export function addLevel(state, name) {
  const n = String(name ?? '').trim();
  if (!n) return fail('Escribe el nombre del nivel.');
  if (n.length > 40) return fail('El nombre del nivel es demasiado largo (máximo 40 caracteres).');
  if (state.catalogs.levels.some((l) => normalize(l.name) === normalize(n))) return fail('Ese nivel ya existe.');
  const item = { id: uniqueId(state.catalogs.levels.map((l) => l.id), slug(n)), name: n };
  state.catalogs.levels.push(item);
  return { ok: true, item };
}

export function removeLevel(state, id) {
  const idx = state.catalogs.levels.findIndex((l) => l.id === id);
  if (idx < 0) return fail('Nivel no encontrado.');
  const c = state.catalogs;
  if (c.groups.some((g) => g.levelId === id) || c.subjects.some((s) => s.levelId === id) || c.teachers.some((t) => t.levelIds.includes(id)) || state.students.some((s) => s.levelId === id)) {
    return fail('El nivel tiene grupos, asignaturas, docentes o alumnos; elimínalos o reasígnalos primero.');
  }
  c.levels.splice(idx, 1);
  return { ok: true };
}

export function renameLevel(state, id, name) {
  const lvl = state.catalogs.levels.find((l) => l.id === id);
  if (!lvl) return fail('Nivel no encontrado.');
  if (!String(name).trim()) return fail('El nombre es obligatorio.');
  lvl.name = String(name).trim();
  return { ok: true, item: lvl };
}

// ---- Alumnos -------------------------------------------------------------------------------------------

function validateStudent(state, s) {
  if (!String(s.name ?? '').trim()) return 'El nombre es obligatorio.';
  if (!levelExists(state, s.levelId)) return 'Elige un nivel válido.';
  const g = state.catalogs.groups.find((x) => x.id === s.groupId);
  if (!g) return 'Elige un grupo válido.';
  if (g.levelId !== s.levelId) return 'El grupo no pertenece al nivel elegido.';
  if (g.grade !== s.grade) return 'El grado del alumno no coincide con el del grupo.';
  if (!state.cycles.includes(s.cycle)) return 'El ciclo escolar no está en el catálogo de ciclos.';
  return null;
}

export function addStudent(state, input) {
  const s = { id: String(input.id ?? '').trim(), name: String(input.name ?? '').trim(), levelId: input.levelId, grade: input.grade, groupId: input.groupId, cycle: input.cycle };
  if (!s.id) return fail('La matrícula es obligatoria.');
  if (!ID_RE.test(s.id)) return fail('La matrícula solo admite letras, números, punto, guion y guion bajo.');
  if (state.students.some((x) => x.id === s.id)) return fail(`Ya existe un alumno con la matrícula ${s.id}.`);
  const err = validateStudent(state, s);
  if (err) return fail(err);
  state.students.push(s);
  return { ok: true, item: s };
}

export function updateStudent(state, id, patch) {
  const idx = state.students.findIndex((x) => x.id === id);
  if (idx < 0) return fail('Alumno no encontrado.');
  const cur = state.students[idx];
  const next = { ...cur, ...patch, id };
  next.name = String(next.name).trim();
  const err = validateStudent(state, next);
  if (err) return fail(err);
  const hasRecords = Object.values(state.records).some((r) => r.studentId === id);
  if (hasRecords && (next.levelId !== cur.levelId || next.groupId !== cur.groupId || next.cycle !== cur.cycle)) {
    return fail('El alumno ya tiene registros: no se puede cambiar su nivel, grupo o ciclo (evita mezclar registros).');
  }
  state.students[idx] = next;
  return { ok: true, item: next };
}

export function removeStudent(state, id) {
  const idx = state.students.findIndex((x) => x.id === id);
  if (idx < 0) return fail('Alumno no encontrado.');
  if (Object.values(state.records).some((r) => r.studentId === id)) return fail('El alumno tiene registros académicos; no se elimina.');
  state.students.splice(idx, 1);
  return { ok: true };
}

export const sortByName = (a, b) => a.name.localeCompare(b.name, 'es');
