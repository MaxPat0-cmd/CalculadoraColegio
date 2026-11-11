import { h, field, select, clear, toast, put } from '../dom.js';
import { sortByName } from '../../catalogs.js';

const lvlName = (state, id) => state.catalogs.levels.find((l) => l.id === id)?.name ?? id;

export function catalogsView(ctx) {
  const root = h('div', { class: 'view' });
  let tab = ctx.ui.catTab ?? 'students';
  const TABS = [['students', 'Alumnos'], ['teachers', 'Docentes'], ['subjects', 'Asignaturas'], ['groups', 'Grupos'], ['periods', 'Periodos'], ['general', 'Niveles y escala']];

  const render = () => {
    clear(root);
    const { store } = ctx;
    const state = store.state;
    const report = (res, okMsg) => { if (res.ok) { toast(okMsg); render(); } else { toast(res.error, 'error'); render(); } };

    const body = h('section', { class: 'card' });
    const del = (kind, id) => () => { if (confirm('¿Eliminar este elemento?')) report(store.removeCatalogItem(kind, id), 'Eliminado'); };
    const levelOpts = state.catalogs.levels.map((l) => ({ value: l.id, label: l.name }));
    const groupLabel = (g) => `${lvlName(state, g.levelId)} ${g.grade}.° ${g.name}`;

    if (tab === 'periods' || tab === 'subjects' || tab === 'groups') {
      const kind = tab;
      const list = state.catalogs[kind];
      const rows = list.map((it) => h('tr', null,
        h('td', null, h('input', { type: 'text', value: it.name, 'aria-label': 'Nombre', onchange: (e) => report(store.updateCatalogItem(kind, it.id, { name: e.target.value }), 'Guardado') })),
        kind !== 'periods' ? h('td', null, select(levelOpts, it.levelId, { 'aria-label': 'Nivel', onchange: (e) => report(store.updateCatalogItem(kind, it.id, { levelId: e.target.value }), 'Guardado') })) : null,
        kind === 'groups' ? h('td', null, h('input', { type: 'number', min: 1, max: 12, value: it.grade, 'aria-label': 'Grado', onchange: (e) => report(store.updateCatalogItem(kind, it.id, { grade: Number(e.target.value) }), 'Guardado') })) : null,
        h('td', null, h('code', null, it.id)),
        h('td', null, h('button', { class: 'btn small danger', type: 'button', onclick: del(kind, it.id) }, 'Eliminar'))));
      const nameIn = h('input', { type: 'text', required: true, placeholder: kind === 'groups' ? 'Letra o nombre (A, B…)' : 'Nombre' });
      const lvlIn = select(levelOpts, state.catalogs.levels[0].id);
      const gradeIn = h('input', { type: 'number', min: 1, max: 12, value: 1 });
      put(body, 
        h('h3', null, { periods: 'Periodos de evaluación', subjects: 'Asignaturas', groups: 'Grupos' }[kind]),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, h('th', null, 'Nombre'), kind !== 'periods' ? h('th', null, 'Nivel') : null, kind === 'groups' ? h('th', null, 'Grado') : null, h('th', null, 'Identificador'), h('th', null, ''))),
          h('tbody', null, rows))),
        h('form', { class: 'inline-form', onsubmit: (e) => {
          e.preventDefault();
          const item = { name: nameIn.value };
          if (kind !== 'periods') item.levelId = lvlIn.value;
          if (kind === 'groups') item.grade = Number(gradeIn.value);
          report(store.addCatalogItem(kind, item), 'Agregado');
        } }, h('h4', null, 'Agregar'), field('Nombre', nameIn), kind !== 'periods' ? field('Nivel', lvlIn) : null, kind === 'groups' ? field('Grado', gradeIn) : null,
        h('button', { class: 'btn primary', type: 'submit' }, 'Agregar')));
    }

    if (tab === 'teachers') {
      const subjectsByLevel = (levels) => state.catalogs.subjects.filter((s) => levels.includes(s.levelId));
      const editor = (t) => {
        const lvlBoxes = state.catalogs.levels.map((l) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: t.levelIds.includes(l.id), value: l.id }), l.name));
        const subjBoxes = subjectsByLevel(state.catalogs.levels.map((l) => l.id)).map((s) => h('label', { class: 'chk' }, h('input', { type: 'checkbox', checked: t.subjectIds.includes(s.id), value: s.id }), `${s.name} (${lvlName(state, s.levelId)})`));
        const collect = (boxes) => boxes.filter((b) => b.querySelector('input').checked).map((b) => b.querySelector('input').value);
        return h('details', { class: 'teacher' },
          h('summary', null, h('strong', null, t.name), ` — ${t.levelIds.map((l) => lvlName(state, l)).join(', ')} · ${t.subjectIds.length} asignatura(s)`),
          h('div', { class: 'teacher-body' },
            field('Nombre', h('input', { type: 'text', value: t.name, onchange: (e) => report(store.updateCatalogItem('teachers', t.id, { name: e.target.value }), 'Guardado') })),
            h('fieldset', null, h('legend', null, 'Niveles'), lvlBoxes),
            h('fieldset', null, h('legend', null, 'Asignaturas que imparte'), subjBoxes),
            h('div', { class: 'actions' },
              h('button', { class: 'btn primary', type: 'button', onclick: () => report(store.updateCatalogItem('teachers', t.id, { levelIds: collect(lvlBoxes), subjectIds: collect(subjBoxes) }), 'Guardado') }, 'Guardar niveles y asignaturas'),
              h('button', { class: 'btn danger', type: 'button', onclick: del('teachers', t.id) }, 'Eliminar'))));
      };
      const nameIn = h('input', { type: 'text', required: true });
      const lvlIn = select(levelOpts, state.catalogs.levels[0].id);
      put(body, h('h3', null, 'Docentes'), state.catalogs.teachers.map(editor),
        h('form', { class: 'inline-form', onsubmit: (e) => { e.preventDefault(); report(store.addCatalogItem('teachers', { name: nameIn.value, levelIds: [lvlIn.value], subjectIds: [] }), 'Docente agregado (asigna sus asignaturas)'); } },
          h('h4', null, 'Agregar docente'), field('Nombre', nameIn), field('Nivel', lvlIn), h('button', { class: 'btn primary', type: 'submit' }, 'Agregar')));
    }

    if (tab === 'students') {
      const groups = state.catalogs.groups;
      const rows = [...state.students].sort(sortByName).map((s) => h('tr', null,
        h('td', null, h('code', null, s.id)),
        h('td', null, h('input', { type: 'text', value: s.name, 'aria-label': 'Nombre', onchange: (e) => report(store.updateStudent(s.id, { name: e.target.value }), 'Guardado') })),
        h('td', null, select(groups.map((g) => ({ value: g.id, label: groupLabel(g) })), s.groupId, { 'aria-label': 'Grupo', onchange: (e) => { const g = groups.find((x) => x.id === e.target.value); report(store.updateStudent(s.id, { groupId: g.id, levelId: g.levelId, grade: g.grade }), 'Guardado'); } })),
        h('td', null, s.cycle),
        h('td', null, h('button', { class: 'btn small danger', type: 'button', onclick: () => { if (confirm('¿Eliminar alumno?')) report(store.removeStudent(s.id), 'Alumno eliminado'); } }, 'Eliminar'))));
      const idIn = h('input', { type: 'text', required: true, placeholder: 'DEMO-…' });
      const nameIn = h('input', { type: 'text', required: true });
      const grpIn = select(groups.map((g) => ({ value: g.id, label: groupLabel(g) })), groups[0]?.id);
      const cycIn = select(state.cycles.map((c) => ({ value: c, label: c })), state.activeCycle);
      put(body, 
        h('h3', null, 'Alumnos (ficticios)'),
        h('p', { class: 'banner info' }, 'No captures datos reales de menores en este prototipo.'),
        h('div', { class: 'table-wrap tall' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, ['Matrícula', 'Nombre', 'Grupo', 'Ciclo', ''].map((t) => h('th', null, t)))), h('tbody', null, rows))),
        h('form', { class: 'inline-form', onsubmit: (e) => {
          e.preventDefault();
          const g = groups.find((x) => x.id === grpIn.value);
          report(store.addStudent({ id: idIn.value, name: nameIn.value, levelId: g.levelId, grade: g.grade, groupId: g.id, cycle: cycIn.value }), 'Alumno agregado');
        } }, h('h4', null, 'Agregar alumno'), field('Matrícula (identificador único)', idIn), field('Nombre', nameIn), field('Grupo', grpIn), field('Ciclo', cycIn), h('button', { class: 'btn primary', type: 'submit' }, 'Agregar')));
    }

    if (tab === 'general') {
      const min = h('input', { type: 'number', step: 'any', value: state.scale.min });
      const max = h('input', { type: 'number', step: 'any', value: state.scale.max });
      const cyc = h('input', { type: 'text', placeholder: '2027-2028' });
      put(body, 
        h('h3', null, 'Niveles educativos'),
        h('div', { class: 'level-list' }, state.catalogs.levels.map((l) => field(`Nombre (${l.id})`, h('input', { type: 'text', value: l.name, onchange: (e) => report(store.renameLevel(l.id, e.target.value), 'Guardado') })))),
        h('h3', null, 'Escala de captura (demostrativa)'),
        h('p', { class: 'banner info' }, 'Solo delimita qué números se aceptan al capturar. No es una regla de aprobación ni de evaluación: esas reglas aún no existen en el sistema.'),
        h('form', { class: 'inline-form', onsubmit: (e) => { e.preventDefault(); report(store.setScale(Number(min.value), Number(max.value)), 'Escala actualizada'); } },
          field('Mínimo', min), field('Máximo', max), h('button', { class: 'btn primary', type: 'submit' }, 'Guardar escala')),
        h('h3', null, 'Ciclos escolares'),
        h('p', null, `Existentes: ${state.cycles.join(', ')}. Ciclo vigente: ${state.activeCycle}.`),
        h('form', { class: 'inline-form', onsubmit: (e) => { e.preventDefault(); report(store.addCycle(cyc.value.trim()), 'Ciclo agregado'); } },
          field('Nuevo ciclo', cyc), h('button', { class: 'btn', type: 'submit' }, 'Agregar ciclo')),
        h('h3', null, 'Reglas de evaluación'),
        h('p', { class: 'banner warn' }, h('strong', null, 'Pendiente de validación institucional. '),
          'El módulo de reglas (src/evaluation.js) está preparado pero vacío: ninguna regla de primaria o secundaria ha sido definida o validada.'),
        h('ul', null, state.catalogs.levels.map((l) => h('li', null, `${l.name}: ${ctx.registry.describe(l.id).name}`))));
    }

    put(root, 
      h('section', { class: 'intro' }, h('p', null, 'Los catálogos iniciales son demostrativos y editables. Los elementos con registros asociados no se pueden eliminar ni mover.')),
      h('div', { class: 'subtabs', role: 'tablist' }, TABS.map(([id, label]) => h('button', { class: `subtab${id === tab ? ' active' : ''}`, role: 'tab', 'aria-selected': id === tab, type: 'button', onclick: () => { tab = id; ctx.ui.catTab = id; render(); } }, label))),
      body);
  };
  render();
  return { el: root, refresh: render };
}
