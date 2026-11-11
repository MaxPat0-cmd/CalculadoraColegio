// Importar actas (Excel .xlsx o CSV): alumnos y calificaciones. Paso 1 archivo → 2 columnas → 3 contexto → vista previa.
import { h, clear, put, select, field, download, toast } from '../dom.js';
import { readTable } from '../../import/tabular.js';
import { FIELDS, detectHeaderRow, autoMap, buildImportPlan } from '../../import/actas.js';
import { buildActaTemplate } from '../../import/template.js';
import { planPreview } from '../planPreview.js';
import { stagger } from '../motion.js';

const XLSX = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const letter = (i) => { let s = ''; for (let n = i + 1; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const cell = (v) => (v === null || v === undefined ? '' : String(v));

export function importActasView(ctx) {
  const { store } = ctx;
  const root = h('div', { class: 'view' });
  const S = { name: '', sheets: [], sheetIdx: 0, headerRow: -1, mapping: {}, plan: null, choices: {}, error: null, ctx: null };

  const defaults = () => {
    const state = store.state;
    const levelId = state.catalogs.levels.some((l) => l.id === ctx.ui.config.levelId) ? ctx.ui.config.levelId : state.catalogs.levels[0]?.id;
    return { levelId, groupId: '', subjectId: '', periodId: ctx.ui.config.periodId || state.catalogs.periods[0]?.id || '', teacherId: '', cycle: state.activeCycle, createGroups: true };
  };
  S.ctx = defaults();
  const rows = () => S.sheets[S.sheetIdx]?.rows ?? [];

  const recompute = () => {
    S.plan = buildImportPlan(store.state, rows(), { headerRow: S.headerRow, mapping: S.mapping, ...S.ctx });
    S.choices = {};
  };
  const loadSheet = (idx) => {
    S.sheetIdx = idx; S.plan = null;
    const r = rows();
    S.headerRow = detectHeaderRow(r);
    if (S.headerRow < 0) S.headerRow = 0;
    S.mapping = autoMap(r[S.headerRow] ?? []);
  };

  const render = () => {
    clear(root);
    const state = store.state;
    const file = h('input', { type: 'file', id: 'acta-file', accept: '.xlsx,.csv,.txt,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      S.error = null;
      try {
        S.sheets = await readTable(new Uint8Array(await f.arrayBuffer()), f.name);
        S.name = f.name; S.ctx = defaults(); loadSheet(0);
        const first = S.sheets.findIndex((s) => detectHeaderRow(s.rows) >= 0);
        if (first > 0) loadSheet(first);
      } catch (err) { S.sheets = []; S.error = err.message; }
      render();
    } });

    const cards = [];
    cards.push(h('section', { class: 'card' },
      h('h3', null, '1. Elige el acta'),
      h('p', { class: 'muted' }, 'Sube un archivo de Excel (.xlsx) o CSV con alumnos y/o calificaciones. Reconocemos matrícula (o cuenta), alumno, grupo, asignatura, periodo, calificación y faltas; si tu acta trae otros encabezados, los eliges en el paso 2.'),
      h('div', { class: 'actions' },
        h('label', { class: 'btn primary file', for: 'acta-file' }, S.sheets.length ? 'Elegir otro archivo…' : 'Elegir archivo…'), file,
        h('button', { class: 'btn', type: 'button', onclick: () => { download('plantilla_acta_UA.xlsx', buildActaTemplate(), XLSX); toast('Plantilla descargada'); } }, 'Descargar plantilla')),
      S.error ? h('p', { class: 'banner err', role: 'alert' }, S.error) : null));

    if (S.sheets.length) {
      const r = rows();
      const headers = r[S.headerRow] ?? [];
      const width = Math.max(headers.length, ...r.slice(S.headerRow + 1, S.headerRow + 6).map((x) => x.length), 1);
      const colOpts = [{ value: '-1', label: '— no viene en el archivo —' }, ...Array.from({ length: width }, (_, i) => ({ value: String(i), label: `${letter(i)}: ${cell(headers[i]) || '(sin título)'}`.slice(0, 48) }))];
      const refresh = () => { if (S.plan) recompute(); render(); };

      cards.push(h('section', { class: 'card' },
        h('h3', null, '2. Revisa las columnas'),
        h('p', { class: 'muted' }, `Archivo: ${S.name} · ${r.length} filas`),
        h('div', { class: 'config' },
          S.sheets.length > 1 ? field('Hoja', select(S.sheets.map((s, i) => ({ value: String(i), label: s.name })), String(S.sheetIdx), { onchange: (e) => { loadSheet(Number(e.target.value)); render(); } })) : null,
          field('Fila de encabezados', select(r.slice(0, 20).map((row, i) => ({ value: String(i), label: `Fila ${i + 1}: ${row.filter((c) => c !== null && c !== '').slice(0, 3).map(cell).join(' · ') || '(vacía)'}`.slice(0, 60) })), String(S.headerRow), {
            onchange: (e) => { S.headerRow = Number(e.target.value); S.mapping = autoMap(rows()[S.headerRow] ?? []); refresh(); } }))),
        h('div', { class: 'config map-grid' }, FIELDS.map((f) => field(f.label, select(colOpts, String(S.mapping[f.key] ?? -1), { onchange: (e) => { S.mapping[f.key] = Number(e.target.value); refresh(); } })))),
        h('div', { class: 'table-wrap' }, h('table', { class: 'data' },
          h('thead', null, h('tr', null, Array.from({ length: width }, (_, i) => h('th', { scope: 'col' }, `${letter(i)}: ${cell(headers[i])}`)))),
          h('tbody', null, r.slice(S.headerRow + 1, S.headerRow + 6).map((row) => h('tr', null, Array.from({ length: width }, (_, i) => h('td', null, cell(row[i])))))))),
        h('p', { class: 'kbd-help' }, 'Se muestran las primeras 5 filas de datos.')));

      const lv = S.ctx.levelId;
      const groups = state.catalogs.groups.filter((g) => g.levelId === lv);
      const subjects = state.catalogs.subjects.filter((s) => s.levelId === lv);
      const teachers = state.catalogs.teachers.filter((t) => t.levelIds.includes(lv));
      const set = (patch) => { Object.assign(S.ctx, patch); refresh(); };
      cards.push(h('section', { class: 'card' },
        h('h3', null, '3. Completa lo que el archivo no trae'),
        h('p', { class: 'muted' }, 'Solo se usan cuando no hay una columna que lo indique. Esta calculadora atiende Primaria y Secundaria.'),
        h('div', { class: 'config' },
          field('Nivel', select(state.catalogs.levels.map((l) => ({ value: l.id, label: l.name })), lv, { onchange: (e) => set({ levelId: e.target.value, groupId: '', subjectId: '', teacherId: '' }) })),
          field('Grupo', select([{ value: '', label: '— según el archivo —' }, ...groups.map((g) => ({ value: g.id, label: `${g.grade}.° ${g.name}` }))], S.ctx.groupId, { onchange: (e) => set({ groupId: e.target.value }) })),
          field('Asignatura', select([{ value: '', label: '— según el archivo —' }, ...subjects.map((s) => ({ value: s.id, label: s.name }))], S.ctx.subjectId, { onchange: (e) => set({ subjectId: e.target.value }) })),
          field('Periodo', select([{ value: '', label: '— según el archivo —' }, ...state.catalogs.periods.map((p) => ({ value: p.id, label: p.name }))], S.ctx.periodId, { onchange: (e) => set({ periodId: e.target.value }) })),
          field('Docente', select([{ value: '', label: 'Automático (el de la asignatura)' }, ...teachers.map((t) => ({ value: t.id, label: t.name }))], S.ctx.teacherId, { onchange: (e) => set({ teacherId: e.target.value }) })),
          field('Ciclo escolar', select(state.cycles.map((c) => ({ value: c, label: c })), S.ctx.cycle, { onchange: (e) => set({ cycle: e.target.value }) }))),
        h('div', { class: 'check' }, h('input', { type: 'checkbox', id: 'mk-groups', checked: S.ctx.createGroups, onchange: (e) => set({ createGroups: e.target.checked }) }), h('label', { for: 'mk-groups' }, 'Crear los grupos que no existan (por ejemplo «3° B»)')),
        h('div', { class: 'actions' }, h('button', { class: 'btn primary', type: 'button', onclick: () => { recompute(); render(); } }, S.plan ? 'Actualizar vista previa' : 'Revisar importación'))));

      if (S.plan) {
        cards.push(planPreview({
          plan: S.plan, choices: S.choices, sourceLabel: 'archivo',
          info: `${S.plan.summary?.dataRows ?? 0} filas leídas · ${S.plan.summary?.students ?? 0} alumnos · ${S.plan.summary?.records ?? 0} calificaciones${S.plan.summary?.newGroups ? ` · ${S.plan.summary.newGroups} grupo(s) nuevo(s)` : ''}`,
          applyLabel: 'Aplicar importación', onChange: render,
          onCancel: () => { S.plan = null; render(); },
          onApply: () => {
            const res = store.applyPlan(S.plan, S.choices);
            if (!res.ok) { S.error = res.errors.join(' '); S.plan = null; render(); return; }
            const s = res.summary; S.plan = null; S.sheets = []; S.name = '';
            toast(`Importado: ${s.added} agregados, ${s.replaced} reemplazados, ${s.kept} conservados`);
            render();
          },
        }));
      }
    }

    if (store.hasUndoSnapshot()) cards.push(h('section', { class: 'card' }, h('h3', null, 'Deshacer'), h('p', null, 'Se guardó una copia automática justo antes de la última importación.'),
      h('div', { class: 'actions' }, h('button', { class: 'btn', type: 'button', onclick: () => { const x = store.undoImport(); toast(x.ok ? 'Importación deshecha' : x.error, x.ok ? 'ok' : 'error'); render(); } }, 'Deshacer última importación'),
        h('a', { class: 'btn', href: '#control' }, 'Ver en Control Escolar'))));

    put(root, cards);
    stagger(root.querySelectorAll(':scope > .card'), { max: 4 });
  };
  render();
  return { el: root, refresh: render };
}
