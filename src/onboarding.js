// Lógica pura del onboarding y del perfil de uso (sin DOM, probada con node:test).
// El perfil NO es una cuenta: solo adapta la experiencia inicial (nivel, docente, modalidad y pantalla de arranque).

export const ROLES = Object.freeze([
  { id: 'docente', title: 'Soy docente', desc: 'Capturo calificaciones y faltas de mis grupos.' },
  { id: 'control', title: 'Control Escolar', desc: 'Reviso, concentro y exporto las calificaciones.' },
  { id: 'explorar', title: 'Solo quiero explorar', desc: 'Veo cómo funciona con datos de ejemplo.' },
]);

/** Niveles que atiende esta calculadora. Cada uno trae una recomendación de captura. */
export const LEVEL_CHOICES = Object.freeze([
  { id: 'primaria', label: 'Primaria', levelId: 'primaria', desc: 'Titular de grupo: captura todas las materias de cada alumno.' },
  { id: 'secundaria', label: 'Secundaria', levelId: 'secundaria', desc: 'Varias materias y grupos: captura una materia para todo el grupo.' },
]);

/** Id del nivel del catálogo que corresponde a la opción elegida, o null si no existe. */
export function levelForChoice(state, choice) {
  return choice && state.catalogs.levels.some((l) => l.id === choice.levelId) ? choice.levelId : null;
}

export function ensureLevel(store, choiceId) {
  const choice = LEVEL_CHOICES.find((c) => c.id === choiceId);
  if (!choice) return { ok: false, error: 'Elige un nivel.' };
  const levelId = levelForChoice(store.state, choice);
  return levelId ? { ok: true, levelId, created: false } : { ok: false, error: `El nivel «${choice.label}» no está en el catálogo.` };
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
