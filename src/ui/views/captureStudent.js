import { h, field, select, clear, put } from '../dom.js';
import { configBar, saveUi, normalizeConfig } from '../config.js';
import { rowsByStudent, studentsOfGroup } from '../../capture.js';
import { captureTable, progress } from '../captureTable.js';
import { slideIn } from '../motion.js';

export function captureStudentView(ctx) {
  const root = h('div', { class: 'view' });
  let slideDir = 0;
  const render = () => {
    clear(root);
    const { store } = ctx;
    const cfg = ctx.ui.config;
    const students = studentsOfGroup(store.state, cfg.groupId);
    const idx = students.findIndex((s) => s.id === cfg.studentId);
    const go = (i, delta) => {
      const s = students[(i + students.length) % students.length];
      ctx.ui.config = normalizeConfig(store.state, { ...ctx.ui.config, studentId: s.id });
      slideDir = delta; saveUi(ctx.ui.config); render();
      root.querySelector('input.grade')?.focus({ preventScroll: true });
    };
    const rows = rowsByStudent(store.state, { studentId: cfg.studentId, teacherId: cfg.teacherId, periodId: cfg.periodId });
    const prog = progress(rows);
    const period = store.state.catalogs.periods.find((p) => p.id === cfg.periodId)?.name ?? '';
    const stSel = select(students.map((s) => ({ value: s.id, label: `${s.name} (${s.id})` })), cfg.studentId, {
      onchange: (e) => { ctx.ui.config = { ...ctx.ui.config, studentId: e.target.value }; saveUi(ctx.ui.config); render(); },
    });

    put(root, 
      configBar(ctx, { showSubject: false, onChange: render }),
      students.length === 0
        ? h('p', { class: 'banner warn' }, 'No hay alumnos en este grupo para el ciclo vigente.')
        : h('section', { class: 'card swap' },
          h('div', { class: 'student-nav' },
            h('button', { class: 'btn', type: 'button', onclick: () => go(idx - 1, -1), 'aria-label': 'Alumno anterior' }, '← Anterior'),
            h('div', { class: 'student-pick' }, field('Alumno', stSel), h('span', { class: 'counter' }, `${idx + 1} de ${students.length}`)),
            h('button', { class: 'btn', type: 'button', onclick: () => go(idx + 1, 1), 'aria-label': 'Alumno siguiente' }, 'Siguiente →')),
          rows.length === 0
            ? h('p', { class: 'banner warn' }, 'El docente elegido no tiene asignaturas de este nivel. Revisa el catálogo de docentes.')
            : [
              h('h3', null, `${students[idx]?.name ?? ''} · ${period}`),
              prog,
              captureTable(ctx, rows, {
                caption: `Calificaciones y faltas de ${students[idx]?.name} en ${period}`,
                firstCol: { header: 'Asignatura', label: (r) => r.subject.name, render: (r) => r.subject.name },
                teacherId: cfg.teacherId,
                onSaved: () => prog.update(rowsByStudent(store.state, { studentId: cfg.studentId, teacherId: cfg.teacherId, periodId: cfg.periodId })),
              }),
            ]));
    const swap = root.querySelector('.card.swap');
    if (swap && slideDir) { slideIn(swap, slideDir); slideDir = 0; } // entra por el lado desde el que se navegó
  };
  render();
  return { el: root, refresh: render };
}
