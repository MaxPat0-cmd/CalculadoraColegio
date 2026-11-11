// Configuración académica compartida por las dos modalidades de captura.
import { h, field, select } from './dom.js';
import { studentsOfGroup } from '../capture.js';

const KEY = 'alzate-ui-v0.1';

export function loadUi() {
  try { return JSON.parse(localStorage.getItem(KEY)) ?? {}; } catch { return {}; }
}
export function saveUi(cfg) {
  try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { /* opcional */ }
}

/** Ajusta la configuración para que siempre sea coherente (nivel → grupo/docente → asignatura → alumno). */
export function normalizeConfig(state, cfg) {
  const c = state.catalogs;
  const out = { ...cfg };
  if (!c.levels.some((l) => l.id === out.levelId)) out.levelId = c.levels[0]?.id ?? '';
  const groups = c.groups.filter((g) => g.levelId === out.levelId);
  if (!groups.some((g) => g.id === out.groupId)) out.groupId = groups[0]?.id ?? '';
  if (!c.periods.some((p) => p.id === out.periodId)) out.periodId = c.periods[0]?.id ?? '';
  const teachers = c.teachers.filter((t) => t.levelIds.includes(out.levelId));
  if (!teachers.some((t) => t.id === out.teacherId)) out.teacherId = teachers[0]?.id ?? '';
  const teacher = teachers.find((t) => t.id === out.teacherId);
  const subjects = c.subjects.filter((s) => s.levelId === out.levelId && teacher?.subjectIds.includes(s.id));
  if (!subjects.some((s) => s.id === out.subjectId)) out.subjectId = subjects[0]?.id ?? '';
  const students = studentsOfGroup(state, out.groupId);
  if (!students.some((s) => s.id === out.studentId)) out.studentId = students[0]?.id ?? '';
  return out;
}

export function configBar(ctx, { showSubject, onChange }) {
  const { store } = ctx;
  const state = store.state;
  const cfg = ctx.ui.config;
  const c = state.catalogs;
  const set = (patch) => { ctx.ui.config = normalizeConfig(store.state, { ...ctx.ui.config, ...patch }); saveUi(ctx.ui.config); onChange(); };

  const teachers = c.teachers.filter((t) => t.levelIds.includes(cfg.levelId));
  const teacher = teachers.find((t) => t.id === cfg.teacherId);
  const subjects = c.subjects.filter((s) => s.levelId === cfg.levelId && teacher?.subjectIds.includes(s.id));
  const groups = c.groups.filter((g) => g.levelId === cfg.levelId);

  const lvl = select(c.levels.map((l) => ({ value: l.id, label: l.name })), cfg.levelId, { onchange: (e) => set({ levelId: e.target.value }) });
  const grp = select(groups.map((g) => ({ value: g.id, label: `${g.grade}.° ${g.name}` })), cfg.groupId, { onchange: (e) => set({ groupId: e.target.value }) });
  const per = select(c.periods.map((p) => ({ value: p.id, label: p.name })), cfg.periodId, { onchange: (e) => set({ periodId: e.target.value }) });
  const tch = select(teachers.map((t) => ({ value: t.id, label: t.name })), cfg.teacherId, { onchange: (e) => set({ teacherId: e.target.value }) });
  const sub = select(subjects.map((s) => ({ value: s.id, label: s.name })), cfg.subjectId, { onchange: (e) => set({ subjectId: e.target.value }) });

  return h('form', { class: 'config card', onsubmit: (e) => e.preventDefault(), 'aria-label': 'Configuración académica' },
    field('Nivel educativo', lvl),
    field('Grupo', grp),
    field('Periodo de evaluación', per),
    field('Docente', tch),
    showSubject ? field('Asignatura', sub) : null,
    h('p', { class: 'config-note' }, `Ciclo escolar ${state.activeCycle}`));
}
