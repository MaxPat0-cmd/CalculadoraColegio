// Vista previa de un plan de importación (respaldo o acta): resumen, incidencias por fila y decisión por conflicto.
// Nada se aplica hasta pulsar el botón; los conflictos se conservan salvo decisión explícita.
import { h, select } from './dom.js';
import { stagger } from './motion.js';

const ENTITY = { records: 'Calificación', students: 'Alumno', groups: 'Grupo', subjects: 'Asignatura', teachers: 'Docente', periods: 'Periodo', levels: 'Nivel' };
const val = (f) => (f.status === 'valor' ? f.value : f.status);

function describe(e, which) {
  const it = which === 'existing' ? e.existing : e.incoming;
  if (e.entity === 'records') return `Calif. ${val(it.grade)} · Faltas ${val(it.absences)}${it.notes ? ` · «${it.notes}»` : ''}`;
  if (e.entity === 'students') return `${it.name} · ${it.groupId}`;
  return it.name ?? it.id;
}

/**
 * opts: { plan, choices, info (texto), sourceLabel ('respaldo'|'archivo'), applyLabel, onChange(), onApply(), onCancel() }
 */
export function planPreview({ plan, choices, info, sourceLabel = 'respaldo', applyLabel = 'Aplicar importación', onChange, onApply, onCancel }) {
  const conflicts = plan.entries.filter((e) => e.status === 'conflicto');
  const setAll = (v) => { conflicts.forEach((c) => { if (!c.locked) choices[c.uid] = v; }); onChange(); };
  const issues = plan.rowIssues ?? [];
  const nothing = plan.entries.length === 0;
  const card = h('div', { class: 'card preview' },
    h('h3', null, 'Vista previa de la importación'),
    info ? h('p', { class: 'muted' }, info) : null,
    plan.errors.length ? h('div', { class: 'banner err', role: 'alert' }, h('strong', null, 'No se aplicará nada: '), h('ul', null, plan.errors.slice(0, 20).map((m) => h('li', null, m)))) : null,
    h('ul', { class: 'summary' },
      h('li', null, h('strong', null, plan.counts.nuevo), ' elementos nuevos se agregarán'),
      h('li', null, h('strong', null, plan.counts.identico), ' ya existen y son idénticos (sin cambios)'),
      h('li', null, h('strong', null, plan.counts.conflicto), ' en conflicto (mismo identificador, contenido distinto)'),
      issues.length ? h('li', null, h('strong', null, new Set(issues.map((i) => i.row)).size), ' fila(s) con problemas se omitirán (abajo el detalle)') : null),
    issues.length ? h('details', { class: 'issues-box', open: true }, h('summary', null, `Filas omitidas o con avisos (${issues.length})`),
      h('div', { class: 'table-wrap tall' }, h('table', { class: 'data' }, h('thead', null, h('tr', null, h('th', { scope: 'col' }, 'Fila'), h('th', { scope: 'col' }, 'Motivo'))),
        h('tbody', null, issues.slice(0, 200).map((i) => h('tr', null, h('td', null, i.row), h('td', null, i.message))))))) : null,
    conflicts.length ? [
      h('p', { class: 'banner warn' }, `Por seguridad, los conflictos NO se sobrescriben a menos que lo elijas explícitamente. Por defecto se conserva lo que ya está en este navegador.`),
      h('div', { class: 'actions' },
        h('button', { class: 'btn', type: 'button', onclick: () => setAll('keep') }, 'Conservar todo lo existente'),
        h('button', { class: 'btn', type: 'button', onclick: () => setAll('replace') }, `Usar todo lo del ${sourceLabel}`)),
      h('div', { class: 'table-wrap tall' }, h('table', { class: 'data' },
        h('thead', null, h('tr', null, ['Elemento', 'Actual', sourceLabel[0].toUpperCase() + sourceLabel.slice(1), 'Decisión'].map((t) => h('th', { scope: 'col' }, t)))),
        h('tbody', null, conflicts.map((c) => h('tr', null,
          h('th', { scope: 'row' }, `${ENTITY[c.entity] ?? c.entity}: ${c.label}`), h('td', null, describe(c, 'existing')), h('td', null, describe(c, 'incoming')),
          h('td', null, c.locked
            ? h('span', { class: 'muted' }, `Se conserva. ${c.reason ?? ''}`)
            : select([{ value: 'keep', label: 'Conservar actual' }, { value: 'replace', label: `Usar ${sourceLabel}` }], choices[c.uid] ?? 'keep', { 'aria-label': `Decisión para ${c.label}`, onchange: (e) => { choices[c.uid] = e.target.value; } }))))))),
    ] : null,
    nothing && !plan.errors.length ? h('p', { class: 'banner warn' }, 'No hay nada válido para importar con esta configuración.') : null,
    h('div', { class: 'actions' },
      h('button', { class: 'btn primary', type: 'button', disabled: plan.errors.length > 0 || nothing, onclick: onApply }, applyLabel),
      h('button', { class: 'btn', type: 'button', onclick: onCancel }, 'Cancelar')));
  return card;
}

export { stagger };
