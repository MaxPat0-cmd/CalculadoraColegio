// Inicio: pantalla adaptada al perfil (docente / Control Escolar / explorar) con la siguiente acción clara.
import { h, put } from '../dom.js';
import { stagger, countTo } from '../motion.js';
import { greeting, teachersFor, groupsFor, profileLabel } from '../../onboarding.js';
import { teacherSummary, controlSummary, setupChecklist } from '../../home.js';
import { saveProfile } from '../profile.js';
import { saveUi } from '../config.js';

const tile = (label, value, tone = '') => {
  const num = h('span', { class: 'tile-num' }, String(value));
  return { el: h('div', { class: `tile ${tone}` }, num, h('span', { class: 'tile-label' }, label)), num, value };
};

export function homeView(ctx) {
  const { store } = ctx;
  const state = store.state;
  const p = ctx.profile;
  const root = h('div', { class: 'view' });
  const cards = [];
  const tiles = [];
  const go = (hash) => () => { location.hash = hash; };
  const level = state.catalogs.levels.find((l) => l.id === p.levelId);

  const hero = (title, sub, actions) => h('section', { class: 'card hero' },
    h('p', { class: 'eyebrow' }, greeting()),
    h('h2', null, title),
    h('p', { class: 'lede' }, sub),
    actions ? h('div', { class: 'cta-row' }, actions) : null);

  if (p.role === 'docente' && level && groupsFor(state, level.id).length) {
    const cfg = ctx.ui.config;
    const teacher = state.catalogs.teachers.find((t) => t.id === cfg.teacherId) ?? teachersFor(state, level.id)[0];
    const group = state.catalogs.groups.find((g) => g.id === cfg.groupId);
    const period = state.catalogs.periods.find((x) => x.id === cfg.periodId);
    const sum = teacherSummary(state, { levelId: level.id, groupId: cfg.groupId, teacherId: teacher?.id, periodId: cfg.periodId });
    cards.push(hero(teacher?.name ?? 'Docente', `${level.name}${group ? ` · ${group.grade}.° ${group.name}` : ''}${period ? ` · ${period.name}` : ''}`, [
      h('button', { class: 'btn primary', type: 'button', onclick: go('#capturar') }, sum.pending ? 'Continuar capturando' : 'Revisar captura'),
      h('button', { class: 'btn', type: 'button', onclick: go('#control') }, 'Ver Control Escolar'),
    ]));
    const t = [tile('Pendientes por capturar', sum.pending, sum.pending ? 'warm' : 'ok'), tile('Registros completos', sum.complete, 'ok'), tile('Alumnos en el grupo', sum.students), tile('Asignaturas que impartes', sum.subjects)];
    tiles.push(...t);
    cards.push(h('div', { class: 'tiles' }, t.map((x) => x.el)));
    cards.push(sum.next
      ? h('section', { class: 'card next' }, h('div', null, h('p', { class: 'eyebrow' }, 'Siguiente paso'), h('h3', null, `${sum.next.pending === 1 ? 'Falta 1 registro' : `Faltan ${sum.next.pending} registros`} en ${sum.next.subject.name}`),
        h('p', { class: 'lede' }, 'Te llevamos directo a esa materia, con todo el grupo en pantalla.')),
        h('button', { class: 'btn primary', type: 'button', onclick: () => {
          ctx.ui.config = { ...ctx.ui.config, subjectId: sum.next.subject.id }; saveUi(ctx.ui.config);
          ctx.profile.mode = 'asignatura'; saveProfile(ctx.profile); location.hash = '#capturar';
        } }, `Capturar ${sum.next.subject.name}`))
      : h('section', { class: 'card next' }, h('div', null, h('p', { class: 'eyebrow' }, 'Todo al día'), h('h3', null, 'No quedan pendientes en este periodo'),
        h('p', { class: 'lede' }, 'Puedes revisar el concentrado o cambiar de periodo en Capturar.'))));
  } else if (p.role === 'docente' && level) {
    // Nivel nuevo, vacío: guía de configuración en lugar de pantallas sin contenido.
    const list = setupChecklist(state, level.id);
    cards.push(hero(`Preparemos ${level.name}`, 'Este nivel está vacío. En cuatro pasos queda listo para capturar; no se inventa ningún dato.', [
      h('button', { class: 'btn primary', type: 'button', onclick: () => { ctx.ui.settingsTab = 'catalogos'; ctx.ui.catTab = list.steps.find((s) => !s.done)?.key ?? 'groups'; location.hash = '#ajustes'; } }, 'Empezar configuración'),
    ]));
    cards.push(h('section', { class: 'card' }, h('h3', null, 'Lista de pasos'),
      h('ol', { class: 'checklist' }, list.steps.map((s, i) => h('li', { class: s.done ? 'done' : '' },
        h('span', { class: 'check-dot', 'aria-hidden': 'true' }, s.done ? '✓' : String(i + 1)),
        h('span', null, s.label, h('span', { class: 'sr-only' }, s.done ? ' (hecho)' : ' (pendiente)')),
        s.done ? null : h('button', { class: 'btn small', type: 'button', onclick: () => { ctx.ui.settingsTab = 'catalogos'; ctx.ui.catTab = s.key; location.hash = '#ajustes'; } }, 'Ir'))))),
      h('p', { class: 'muted foot' }, 'Atajo: también puedes traer alumnos desde un acta en Ajustes → Importar actas.'));
  } else if (p.role === 'control') {
    const sum = controlSummary(state);
    cards.push(hero('Control Escolar', `Ciclo escolar ${state.activeCycle}`, [
      h('button', { class: 'btn primary', type: 'button', onclick: () => { ctx.ui.control = { ...(ctx.ui.control ?? {}), query: '', levelId: '', groupId: '', onlyIncomplete: true }; location.hash = '#control'; } }, sum.incomplete ? 'Revisar incompletos' : 'Abrir panel'),
      h('button', { class: 'btn', type: 'button', onclick: () => { ctx.ui.settingsTab = 'importar'; location.hash = '#ajustes'; } }, 'Importar actas'),
      h('button', { class: 'btn', type: 'button', onclick: () => { ctx.ui.settingsTab = 'respaldos'; location.hash = '#ajustes'; } }, 'Respaldos'),
    ]));
    const t = [tile('Alumnos', sum.students), tile('Con información incompleta', sum.incomplete, sum.incomplete ? 'warm' : 'ok'), tile('Completos', sum.complete, 'ok'), tile('Incidencias', sum.issues, sum.issues ? 'rose' : '')];
    tiles.push(...t);
    cards.push(h('div', { class: 'tiles' }, t.map((x) => x.el)));
  } else {
    cards.push(hero('Bienvenido', 'Captura, consolida y exporta calificaciones en tres pasos. Todo con datos ficticios para que pruebes sin riesgo.', [
      h('button', { class: 'btn primary', type: 'button', onclick: go('#capturar') }, 'Empezar con la captura'),
      h('button', { class: 'btn', type: 'button', onclick: () => ctx.openOnboarding() }, 'Configurar mi perfil'),
    ]));
    const steps = [['1', 'Captura', 'Registra calificaciones y faltas por alumno o por asignatura.', '#capturar'], ['2', 'Consolida', 'Control Escolar reúne todas las materias de cada alumno.', '#control'], ['3', 'Exporta', 'Genera el reporte individual en PDF o Excel.', '#control']];
    cards.push(h('div', { class: 'tiles three' }, steps.map(([n, t2, d, hash]) => h('button', { class: 'card choice step', type: 'button', onclick: go(hash) },
      h('span', { class: 'step-n' }, n), h('strong', null, t2), h('span', { class: 'muted' }, d)))));
  }

  cards.push(h('p', { class: 'muted foot' }, `${profileLabel(state, p)} · prototipo demostrativo con datos ficticios.`));
  put(root, cards);
  stagger(cards.filter((c) => c.nodeType));
  tiles.forEach((t) => countTo(t.num, t.value, { from: 0 }));
  return { el: root, refresh: () => {} };
}
