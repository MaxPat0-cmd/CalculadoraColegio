import { h, field, select, clear, badge, download, toast, put } from '../dom.js';
import { searchStudents, consolidateStudent } from '../../consolidation.js';
import { buildStudentReport, studentReportToPdf, studentReportToXlsx, concentradoToXlsx, safeFileName } from '../../export/reports.js';
import { formatField, FIELD } from '../../models.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

const fieldCell = (f) => (f.status === FIELD.VALUE ? h('span', { class: 'val' }, String(f.value)) : f.status === FIELD.UNKNOWN ? badge('desconocido', 'Desconocido') : badge('pendiente', 'Pendiente'));

export function controlView(ctx, param) {
  const root = h('div', { class: 'view' });
  const f = ctx.ui.control ?? (ctx.ui.control = { query: '', levelId: '', groupId: '', onlyIncomplete: false });

  const renderList = () => {
    clear(root);
    const { store } = ctx;
    const state = store.state;
    const groups = state.catalogs.groups.filter((g) => !f.levelId || g.levelId === f.levelId);

    const q = h('input', { type: 'search', value: f.query, placeholder: 'Matrícula o nombre', autocomplete: 'off', id: 'ctl-q',
      oninput: (e) => { f.query = e.target.value; renderTable(); } });
    const lvl = select([{ value: '', label: 'Todos' }, ...state.catalogs.levels.map((l) => ({ value: l.id, label: l.name }))], f.levelId, { onchange: (e) => { f.levelId = e.target.value; f.groupId = ''; renderList(); } });
    const grp = select([{ value: '', label: 'Todos' }, ...groups.map((g) => ({ value: g.id, label: `${g.grade}.° ${g.name}` }))], f.groupId, { onchange: (e) => { f.groupId = e.target.value; renderTable(); } });
    const inc = h('input', { type: 'checkbox', checked: f.onlyIncomplete, id: 'ctl-inc', onchange: (e) => { f.onlyIncomplete = e.target.checked; renderTable(); } });

    const tableHost = h('div');
    const count = h('p', { class: 'count', 'aria-live': 'polite' });
    const renderTable = () => {
      const list = searchStudents(state, { ...f, cycle: state.activeCycle });
      count.textContent = `${list.length} alumno(s) · ciclo ${state.activeCycle}`;
      put(clear(tableHost), h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
        h('caption', { class: 'sr-only' }, 'Alumnos y avance de captura'),
        h('thead', null, h('tr', null, ['Matrícula', 'Alumno', 'Nivel', 'Grupo', 'Avance', 'Estado', ''].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, list.length === 0 ? h('tr', null, h('td', { colSpan: 7 }, 'Sin resultados.')) : list.map((c) => {
          const s = c.student;
          const grp2 = state.catalogs.groups.find((g) => g.id === s.groupId);
          const lvlName = state.catalogs.levels.find((l) => l.id === s.levelId)?.name;
          const ok = c.summary.incomplete === 0 && c.issues.length === 0;
          return h('tr', null,
            h('td', null, s.id), h('th', { scope: 'row' }, s.name), h('td', null, lvlName), h('td', null, `${grp2?.grade}.° ${grp2?.name}`),
            h('td', null, `${c.summary.complete}/${c.summary.expected}`),
            h('td', null, c.issues.length ? badge('error', `${c.issues.length} incidencia(s)`) : ok ? badge('completo', 'Completo') : badge('pendiente', `${c.summary.incomplete} pendiente(s)`)),
            h('td', null, h('a', { class: 'btn small', href: `#control/${encodeURIComponent(s.id)}` }, 'Ver expediente')));
        })))));
    };

    put(root, 
      h('section', { class: 'intro' }, h('h2', null, 'Control Escolar'),
        h('p', null, 'Consulta alumnos, reúne sus resultados de todas las asignaturas, identifica información incompleta y genera reportes.')),
      h('section', { class: 'card' },
        h('form', { class: 'filters', onsubmit: (e) => e.preventDefault() },
          field('Buscar', q), field('Nivel', lvl), field('Grupo', grp),
          h('div', { class: 'check' }, inc, h('label', { for: 'ctl-inc' }, 'Solo con información incompleta')),
          h('button', { class: 'btn primary', type: 'button', onclick: () => {
            const ids = searchStudents(state, { ...f, cycle: state.activeCycle }).map((c) => c.student.id);
            download(`concentrado_${state.activeCycle}_DEMO.xlsx`, concentradoToXlsx(state, ids), XLSX);
            toast(`Concentrado exportado (${ids.length} alumnos)`);
          } }, 'Exportar concentrado (Excel)')),
        count, tableHost));
    renderTable();
  };

  const renderDetail = (studentId) => {
    clear(root);
    const { store } = ctx;
    const state = store.state;
    if (!state.students.some((s) => s.id === studentId)) {
      put(root, h('p', { class: 'banner warn' }, 'Alumno no encontrado.'), h('a', { class: 'btn', href: '#control' }, '← Volver'));
      return;
    }
    const c = consolidateStudent(state, studentId, { registry: ctx.registry });
    const s = c.student;
    const grp = state.catalogs.groups.find((g) => g.id === s.groupId);
    const lvl = state.catalogs.levels.find((l) => l.id === s.levelId);
    const periods = state.catalogs.periods;
    const subjectIds = [...new Set(c.rows.map((r) => r.subject.id))];
    const rule = ctx.registry.describe(s.levelId);

    const exportPdf = () => { download(`reporte_${safeFileName(s.id)}_DEMO.pdf`, studentReportToPdf(buildStudentReport(state, s.id)), 'application/pdf'); toast('PDF generado (demostrativo)'); };
    const exportXlsx = () => { download(`expediente_${safeFileName(s.id)}_DEMO.xlsx`, studentReportToXlsx(buildStudentReport(state, s.id)), XLSX); toast('Excel generado (demostrativo)'); };

    put(root, 
      h('a', { class: 'btn', href: '#control' }, '← Volver al listado'),
      h('section', { class: 'card' },
        h('div', { class: 'detail-head' },
          h('div', null, h('h2', null, s.name), h('p', { class: 'muted' }, `Matrícula ${s.id}`)),
          h('div', { class: 'actions' },
            h('button', { class: 'btn primary', type: 'button', onclick: exportPdf }, 'Reporte PDF'),
            h('button', { class: 'btn', type: 'button', onclick: exportXlsx }, 'Excel'))),
        h('dl', { class: 'facts' },
          [['Nivel', lvl?.name], ['Grado y grupo', `${grp?.grade}.° ${grp?.name}`], ['Ciclo escolar', c.cycle], ['Registros completos', `${c.summary.complete} de ${c.summary.expected}`]]
            .map(([k, v]) => h('div', null, h('dt', null, k), h('dd', null, v)))),
        h('p', { class: 'banner info' }, h('strong', null, 'Sin calificación final oficial. '), `Regla de evaluación: ${rule.name}. Aquí solo se muestran calificaciones capturadas por periodo; no se calculan promedios ni resultados finales.`)),
      c.issues.length ? h('section', { class: 'card' }, h('h3', null, 'Incidencias de consolidación'),
        h('ul', { class: 'issues' }, c.issues.map((i) => h('li', null, i.message)))) : null,
      h('section', { class: 'card' },
        h('h3', null, 'Calificaciones y faltas por asignatura'),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data matrix' },
          h('thead', null,
            h('tr', null, h('th', { scope: 'col', rowSpan: 2 }, 'Asignatura'), periods.map((p) => h('th', { scope: 'colgroup', colSpan: 2 }, p.name)), h('th', { scope: 'col', rowSpan: 2 }, 'Observaciones')),
            h('tr', null, periods.flatMap(() => [h('th', { scope: 'col' }, 'Calif.'), h('th', { scope: 'col' }, 'Faltas')]))),
          h('tbody', null, subjectIds.map((sid) => {
            const rows = c.rows.filter((r) => r.subject.id === sid);
            const teachers = [...new Set(rows.map((r) => r.teacher?.name).filter(Boolean))];
            return h('tr', null,
              h('th', { scope: 'row' }, rows[0].subject.name, teachers.length ? h('small', { class: 'mat' }, teachers.join(', ')) : null),
              rows.flatMap((r) => [h('td', null, fieldCell(r.grade)), h('td', null, fieldCell(r.absences))]),
              h('td', { class: 'obs' }, rows.filter((r) => r.notes).map((r) => `${r.period.name}: ${r.notes}`).join(' · ')));
          }))))),
      h('p', { class: 'muted' }, `Leyenda: «${formatField({ status: FIELD.PENDING })}» = aún no capturado · «Desconocido» = dato declarado como desconocido · 0 es una calificación válida.`));
  };

  const route = (p) => (p ? renderDetail(decodeURIComponent(p)) : renderList());
  route(param);
  return { el: root, refresh: () => route(param) };
}
