// Lógica pura del onboarding y del perfil de uso (sin DOM, probada con node:test).
// El perfil NO es una cuenta: solo adapta la experiencia inicial (nivel, docente, modalidad y pantalla de arranque).
import { slug } from './catalogs.js';
import { normalize } from './models.js';

export const ROLES = Object.freeze([
  { id: 'docente', title: 'Soy docente', desc: 'Capturo calificaciones y faltas de mis grupos.' },
  { id: 'control', title: 'Control Escolar', desc: 'Reviso, concentro y exporto las calificaciones.' },
  { id: 'explorar', title: 'Solo quiero explorar', desc: 'Veo cómo funciona con datos de ejemplo.' },
]);

/** Niveles que se ofrecen. `levelId` enlaza con el catálogo demostrativo; los demás se crean al elegirlos. */
export const LEVEL_CHOICES = Object.freeze([
  { id: 'preescolar', label: 'Preescolar' },
  { id: 'primaria', label: 'Primaria', levelId: 'primaria' },
  { id: 'secundaria', label: 'Secundaria', levelId: 'secundaria' },
  { id: 'bachillerato', label: 'Bachillerato / CCH', levelId: 'cch' },
  { id: 'universidad', label: 'Universidad' },
  { id: 'otro', label: 'Otro nivel' },
]);

/** Id de nivel existente que corresponde a la opción elegida, o null si aún no existe en el catálogo. */
export function levelForChoice(state, choice, customName = '') {
  if (choice.levelId && state.catalogs.levels.some((l) => l.id === choice.levelId)) return choice.levelId;
  const name = choice.id === 'otro' ? customName : choice.label;
  const hit = state.catalogs.levels.find((l) => normalize(l.name) === normalize(name) || l.id === slug(name));
  return hit?.id ?? null;
}

/** Devuelve el nivel elegido; si no existe en el catálogo, lo crea vacío (sin inventar grupos ni alumnos). */
export function ensureLevel(store, choiceId, customName = '') {
  const choice = LEVEL_CHOICES.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, error: 'Elige un nivel.' };
  if (choice.id === 'otro' && !String(customName).trim()) return { ok: false, error: 'Escribe el nombre del nivel.' };
  const existing = levelForChoice(store.state, choice, customName);
  if (existing) return { ok: true, levelId: existing, created: false };
  const res = store.addLevel(choice.id === 'otro' ? customName : choice.label);
  return res.ok ? { ok: true, levelId: res.item.id, created: true } : { ok: false, error: res.error };
}

export const teachersFor = (state, levelId) => state.catalogs.teachers.filter((t) => t.levelIds.includes(levelId));
export const groupsFor = (state, levelId) => state.catalogs.groups.filter((g) => g.levelId === levelId);

/** Primaria suele tener titular (todas las materias de un alumno); el resto captura por asignatura. */
export const defaultMode = (levelId) => (levelId === 'primaria' ? 'alumno' : 'asignatura');

/** Pantalla de arranque según el perfil. Un nivel sin grupos arranca en Inicio para guiar la configuración. */
export function startHash(state, profile) {
  if (profile.role === 'control') return '#control';
  if (profile.role === 'docente') return groupsFor(state, profile.levelId).length ? '#capturar' : '#inicio';
  return '#inicio';
}

export function profileLabel(state, profile) {
  if (!profile?.done) return 'Configurar perfil';
  const level = state.catalogs.levels.find((l) => l.id === profile.levelId)?.name;
  if (profile.role === 'docente') return level ? `Docente · ${level}` : 'Docente';
  if (profile.role === 'control') return 'Control Escolar';
  return 'Explorando';
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  return h < 12 ? 'Buenos días' : h < 19 ? 'Buenas tardes' : 'Buenas noches';
}

export function configPatchForProfile(state, profile) {
  const patch = {};
  if (profile.role === 'docente' && profile.levelId) {
    patch.levelId = profile.levelId;
    const teacher = state.catalogs.teachers.find((t) => t.id === profile.teacherId && t.levelIds.includes(profile.levelId));
    if (teacher) patch.teacherId = teacher.id;
    else delete patch.teacherId;
  }
  return patch;
}
