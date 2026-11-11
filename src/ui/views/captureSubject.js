import { h, clear, put } from '../dom.js';
import { configBar } from '../config.js';
import { rowsBySubject } from '../../capture.js';
import { captureTable, progress } from '../captureTable.js';

export function captureSubjectView(ctx) {
  const root = h('div', { class: 'view' });
  const render = () => {
    clear(root);
    const { store } = ctx;
    const cfg = ctx.ui.config;
    const subject = store.state.catalogs.subjects.find((s) => s.id === cfg.subjectId);
    const period = store.state.catalogs.periods.find((p) => p.id === cfg.periodId)?.name ?? '';
    const group = store.state.catalogs.groups.find((g) => g.id === cfg.groupId);
    const rows = rowsBySubject(store.state, { groupId: cfg.groupId, subjectId: cfg.subjectId, periodId: cfg.periodId });
    const prog = progress(rows);
    put(root, 
      h('section', { class: 'intro' },
        h('h2', null, 'Captura por asignatura'),
        h('p', null, 'Registra una materia para todos los alumnos del grupo. Pensada para secundaria, CCH y docentes especializados de primaria.')),
      configBar(ctx, { showSubject: true, onChange: render }),
      h('section', { class: 'card' },
        !subject || !group
          ? h('p', { class: 'banner warn' }, 'Elige nivel, grupo, docente y asignatura.')
          : [
            h('h3', null, `${subject.name} · ${group.grade}.° ${group.name} · ${period}`),
            rows.length === 0 ? h('p', { class: 'banner warn' }, 'No hay alumnos en este grupo para el ciclo vigente.') : [
              prog,
              captureTable(ctx, rows, {
                caption: `Calificaciones y faltas de ${subject.name} para ${group.grade}.° ${group.name} en ${period}`,
                firstCol: {
                  header: 'Alumno',
                  label: (r) => r.student.name,
                  render: (r) => [h('span', { class: 'name' }, r.student.name), h('small', { class: 'mat' }, r.student.id)],
                },
                teacherId: cfg.teacherId,
                onSaved: () => prog.update(rowsBySubject(store.state, { groupId: cfg.groupId, subjectId: cfg.subjectId, periodId: cfg.periodId })),
              }),
            ],
          ]));
  };
  render();
  return { el: root, refresh: render };
}
